import {
  BatchWriteItemCommand,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  EC2Client,
  InstanceStateName,
  RunInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
  paginateDescribeInstances,
} from "@aws-sdk/client-ec2";
import { GetQueueUrlCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  paginateScan,
} from "@aws-sdk/lib-dynamodb";
import { ARN } from "@aws-sdk/util-arn-parser";
import { RequestError } from "@octokit/request-error";
import { Octokit } from "@octokit/rest";
import { JobStatus } from "@redotech/fast-actions-ec2-runner-common/job";
import {
  Runner,
  RunnerStatus,
  runnerRecordRead,
} from "@redotech/fast-actions-ec2-runner-common/runner";
import { tableResourceRead } from "./dynamodb";
import { launchTemplateResourceRead } from "./ec2";
import { consumeQueue } from "./sqs";

export interface provisioner {
  (): Promise<void>;
}

export function provisioner({
  jobDynamodbTableArn,
  runnerDynamodbTableArn,
  instanceTag,
  launchTemplate,
  githubOrg,
  githubRepo,
  githubToken,
  githubTokenName,
  idleTimeout,
  maxRunnerCount,
  queueArn,
  runnerLabels,
  runnerGroup,
}: {
  jobDynamodbTableArn: ARN;
  runnerDynamodbTableArn: ARN;
  instanceTag: string;
  launchTemplate: { arn: ARN; version: string };
  githubOrg: string;
  githubRepo: string | undefined;
  githubToken: string;
  githubTokenName: string;
  idleTimeout: number;
  maxRunnerCount: number;
  queueArn: ARN;
  runnerGroup: string;
  runnerLabels: Set<string>;
}): provisioner {
  const dynamodbClient = new DynamoDBClient({
    region: jobDynamodbTableArn.region,
  });
  const documentClient = DynamoDBDocumentClient.from(dynamodbClient);

  const { table: jobTableName } = tableResourceRead(
    jobDynamodbTableArn.resource,
  );
  const { table: runnerTableName } = tableResourceRead(
    runnerDynamodbTableArn.resource,
  );

  const ec2Client = new EC2Client({ region: launchTemplate.arn.region });

  const { launchTemplate: launchTemplateId } = launchTemplateResourceRead(
    launchTemplate.arn.resource,
  );

  const launchGracePeriod = 1000 * 60 * 10;

  const githubClient = new Octokit({ auth: githubToken });

  const sqsClient = new SQSClient({ region: queueArn.region });

  const sqsQueueUrl = (async () => {
    const result = await sqsClient.send(
      new GetQueueUrlCommand({
        QueueName: queueArn.resource,
      }),
    );
    return result.QueueUrl!;
  })();

  return async () => {
    await emptyQueue(sqsClient, await sqsQueueUrl);
    let jobCount = await getPendingJobCount(documentClient, jobTableName);
    console.log("Pending job count", jobCount);

    const runnersByName = new Map<string, Runner>();
    for await (const runner of getRunners(documentClient, runnerTableName)) {
      runnersByName.set(runner.name, runner);
    }

    let activeInstanceCount = 0; // instances accepting work
    let totalInstanceCount = 0; // instances
    const startedInstanceIds: string[] = []; // steady-state started instances
    const stoppedInstanceIds: string[] = []; // steady-state stopped instances
    const stopInstanceIds: string[] = []; // instances to stop
    const terminateInstanceIds: string[] = []; // instances to terminate
    const danglingRunnerIds = new Set<number>(
      [...runnersByName.values()].map((runner) => runner.id),
    ); // runners to cleanup from database
    for await (const ec2Runner of getEc2Instances(ec2Client, instanceTag)) {
      totalInstanceCount++;
      const runner = runnersByName.get(ec2Runner.id);
      switch (ec2Runner.status) {
        case Ec2InstanceStatus.STARTED:
          activeInstanceCount++;
          if (!runner) {
            if (
              ec2Runner.startedAt.getTime() + launchGracePeriod <
              Date.now()
            ) {
              // Note: it possible that the instance successfully launched but
              // has not received its first job. To detect this condition, it
              // would need to query GitHub for all runners.
              console.error("Instance failed to launch", ec2Runner.id);
              terminateInstanceIds.push(ec2Runner.id);
              break;
            }
          } else if (
            runner.status === RunnerStatus.IDLE &&
            runner.activeAt.getTime() + idleTimeout < Date.now() &&
            (await deleteRunner(githubClient, {
              githubRepo,
              githubOrg,
              runnerId: runner.id,
            }))
          ) {
            console.log("Runner idle timeout", runner.id);
            stopInstanceIds.push(ec2Runner.id);
            break;
          } else {
            danglingRunnerIds.delete(runner.id);
          }
          startedInstanceIds.push(ec2Runner.id);
          break;
        case Ec2InstanceStatus.STARTING:
          activeInstanceCount++;
          if (runner) {
            danglingRunnerIds.delete(runner.id);
          }
          break;
        case Ec2InstanceStatus.STOPPED:
          stoppedInstanceIds.push(ec2Runner.id);
          break;
      }
    }
    console.log("Total instance count", totalInstanceCount);
    // reduce the number of instances to within the maximum
    while (
      maxRunnerCount &&
      maxRunnerCount < totalInstanceCount - terminateInstanceIds.length
    ) {
      const instanceId = stoppedInstanceIds.pop() || stopInstanceIds.pop();
      if (instanceId === undefined) {
        break;
      }
      terminateInstanceIds.push(instanceId);
    }
    // terminate instances
    if (terminateInstanceIds.length) {
      console.log("Terminating instances", terminateInstanceIds);
      await ec2Client.send(
        new TerminateInstancesCommand({ InstanceIds: terminateInstanceIds }),
      );
    }
    // stop instances
    if (stopInstanceIds.length) {
      console.log("Stopping instances", stopInstanceIds);
      await ec2Client.send(
        new StopInstancesCommand({ InstanceIds: stopInstanceIds }),
      );
    }
    // clean up runner records
    if (danglingRunnerIds.size) {
      await documentClient.send(
        new BatchWriteItemCommand({
          RequestItems: {
            [runnerTableName]: [...danglingRunnerIds].map((runnerId) => ({
              DeleteRequest: { Key: { Id: { N: runnerId.toString() } } },
            })),
          },
        }),
      );
    }

    // scale up
    activeInstanceCount -= stopInstanceIds.length + terminateInstanceIds.length;
    console.log("Runner count", activeInstanceCount);
    if (maxRunnerCount) {
      jobCount = Math.min(jobCount, maxRunnerCount);
    }
    let runnerStartCount = jobCount - activeInstanceCount;
    if (runnerStartCount <= 0) {
      return;
    }
    if (stoppedInstanceIds.length) {
      const instanceIds = stoppedInstanceIds.slice(0, runnerStartCount);
      console.log("Starting instances", instanceIds.toString());
      await ec2Client.send(
        new StartInstancesCommand({ InstanceIds: instanceIds }),
      );
      runnerStartCount -= stoppedInstanceIds.length;
    }
    if (runnerStartCount <= 0) {
      return;
    }
    console.log("Creating instances", runnerStartCount);
    await ec2Client.send(
      new RunInstancesCommand({
        LaunchTemplate: {
          LaunchTemplateId: launchTemplateId,
          Version: launchTemplate.version,
        },
        MaxCount: runnerStartCount,
        MinCount: runnerStartCount,
        MetadataOptions: { InstanceMetadataTags: "enabled" },
        TagSpecifications: [
          {
            ResourceType: "instance",
            Tags: [
              { Key: "GithubRunner", Value: instanceTag },
              { Key: "ActionsRunner:GithubOrg", Value: githubOrg },
              { Key: "ActionsRunner:GithubRepo", Value: githubRepo || "" },
              {
                Key: "ActionsRunner:GithubTokenName",
                Value: githubTokenName,
              },
              { Key: "ActionsRunner:RunnerGroup", Value: runnerGroup },
              {
                Key: "ActionsRunner:RunnerLabels",
                Value: [...runnerLabels].toString(),
              },
            ],
          },
        ],
      }),
    );
  };
}

async function deleteRunner(
  githubClient: Octokit,
  {
    githubRepo,
    githubOrg,
    runnerId,
  }: { githubRepo: string | undefined; githubOrg: string; runnerId: number },
) {
  try {
    if (githubRepo) {
      await githubClient.actions.deleteSelfHostedRunnerFromRepo({
        owner: githubOrg,
        repo: githubRepo,
        runner_id: runnerId,
      });
    } else {
      await githubClient.actions.deleteSelfHostedRunnerFromOrg({
        org: githubOrg,
        runner_id: runnerId,
      });
    }
  } catch (e) {
    if (e instanceof RequestError && e.status === 422) {
      // runner is busy
      return false;
    }
    throw e;
  }
  return true;
}

async function getPendingJobCount(
  documentClient: DynamoDBDocumentClient,
  tableName: string,
): Promise<number> {
  const result = await documentClient.send(
    new ScanCommand({
      TableName: tableName,
      Select: "COUNT",
      FilterExpression: "contains(:status, #status)",
      ExpressionAttributeNames: { "#status": "Status" },
      ExpressionAttributeValues: {
        ":status": new Set([JobStatus.IN_PROGRESS, JobStatus.QUEUED]),
      },
    }),
  );
  return result.Count!;
}

async function* getRunners(
  documentClient: DynamoDBDocumentClient,
  runnerTableName: string,
): AsyncIterableIterator<Runner> {
  for await (const result of paginateScan(
    { client: documentClient },
    { TableName: runnerTableName },
  )) {
    for (const item of result.Items!) {
      yield runnerRecordRead(item);
    }
  }
}

interface Ec2Instance {
  id: string;
  startedAt: Date;
  status: Ec2InstanceStatus;
}

enum Ec2InstanceStatus {
  STOPPED = "stopped",
  STOPPING = "stopping",
  STARTED = "started",
  STARTING = "starting",
}

const stateMap = new Map<InstanceStateName, Ec2InstanceStatus>([
  [InstanceStateName.pending, Ec2InstanceStatus.STARTING],
  [InstanceStateName.running, Ec2InstanceStatus.STARTED],
  [InstanceStateName.stopped, Ec2InstanceStatus.STOPPED],
  [InstanceStateName.stopping, Ec2InstanceStatus.STOPPING],
]);

async function* getEc2Instances(
  ec2Client: EC2Client,
  instanceTag: string,
): AsyncIterableIterator<Ec2Instance> {
  for await (const result of paginateDescribeInstances(
    { client: ec2Client },
    { Filters: [{ Name: "tag:GithubRunner", Values: [instanceTag] }] },
  )) {
    for (const reservation of result.Reservations!) {
      for (const instance of reservation.Instances!) {
        const status = stateMap.get(instance.State!.Name!);
        if (status === undefined) {
          continue;
        }
        yield {
          status,
          id: instance.InstanceId!,
          startedAt: instance.LaunchTime!,
        };
      }
    }
  }
}

async function emptyQueue(sqsClient: SQSClient, sqsQueueUrl: string) {
  for await (const messages of consumeQueue(sqsClient, sqsQueueUrl, 10)) {
    console.log(
      "Removing queued messages",
      messages.map((message) => message.MessageId),
    );
  }
}
