/**
 * @file
 * Provision/deprovision EC2 instances for a provisioner.
 */

import "./polyfill";

import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  paginateQuery,
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
import { STSClient } from "@aws-sdk/client-sts";
import { ARN } from "@aws-sdk/util-arn-parser";
import { RequestError } from "@octokit/request-error";
import { launchTemplateResourceRead } from "@redotech/aws-util/ec2";
import {
  durationAttributeFormat,
  instantAttributeFormat,
  numberAttributeFormat,
  stringAttributeFormat,
} from "@redotech/dynamodb/attribute";
import { arnAttributeFormat } from "@redotech/dynamodb/aws";
import { envNumberRead, envStringRead, envUrlRead } from "@redotech/lambda/env";
import { SQSHandler } from "aws-lambda";
import { Temporal } from "temporal-polyfill";
import {
  awsCredentialsProvider,
  createRegionTag,
  createUrlTag,
  provisionerIdTag,
} from "./aws";
import {
  InstallationClient,
  appGithubClient,
  provisionerInstallationClient,
} from "./github";
import {
  InstanceStatus,
  Runner,
  RunnerStatus,
  instanceStatusAttributeFormat,
  runnerAttributeFormat,
} from "./instance";
import { JobStatus } from "./job";

const githubAppId = envNumberRead("GITHUB_APP_ID");

const githubPrivateKey = envStringRead("GITHUB_PRIVATE_KEY");

const instanceTableName = envStringRead("INSTANCE_TABLE_NAME");

const jobTableName = envStringRead("JOB_TABLE_NAME");

const provisionerTableName = envStringRead("PROVISIONER_TABLE_NAME");

const runnerCreateUrl = envUrlRead("RUNNER_CREATE_URL");

const dynamodbClient = new DynamoDBClient();

const stsClient = new STSClient();

const githubClient = appGithubClient(githubAppId, githubPrivateKey);

const region = envStringRead("AWS_REGION");

export const handler: SQSHandler = async (event) => {
  if (event.Records.length !== 1) {
    throw new Error(`Expected 1 record, got ${event.Records.length}`);
  }
  const [record] = event.Records;
  const effectiveAt = Temporal.Instant.fromEpochMilliseconds(
    +record.attributes.SentTimestamp,
  );
  const provisionerId = record.attributes.MessageGroupId!;
  console.log(`Provisioning for ${provisionerId}`);
  await debouceProvisioned({
    effectiveAt,
    provisionerId,
  })(() => provision({ provisionerId }));
};

function debouceProvisioned({
  effectiveAt,
  provisionerId,
}: {
  effectiveAt: Temporal.Instant;
  provisionerId: string;
}): <T>(f: () => Promise<T>) => Promise<T | void> {
  return async (f) => {
    const output = await dynamodbClient.send(
      new GetItemCommand({
        Key: { Id: stringAttributeFormat.write(provisionerId) },
        TableName: provisionerTableName,
        ProjectionExpression: "ProvisionedAt",
      }),
    );
    if (!output.Item) {
      throw new Error(`No provisioner ${provisionerId}`);
    }
    let provisionedAt =
      output.Item.ProvisionedAt &&
      instantAttributeFormat.read(output.Item.ProvisionedAt);

    if (provisionedAt) {
      if (Temporal.Instant.compare(effectiveAt, provisionedAt) < 0) {
        console.log(
          `Already provisioned ${provisionerId} at ${provisionedAt}, before ${effectiveAt}. Skipping.`,
        );
        return;
      }
    }

    provisionedAt = Temporal.Now.instant();

    const result = await f();

    await dynamodbClient.send(
      new UpdateItemCommand({
        ConditionExpression:
          "attribute_exists(Id) AND (attribute_not_exists(ProvisionedAt) OR ProvisionedAt < :provisioned_at)",
        ExpressionAttributeValues: {
          ":provisioned_at": instantAttributeFormat.write(provisionedAt),
        },
        Key: { Id: stringAttributeFormat.write(provisionerId) },
        TableName: provisionerTableName,
        UpdateExpression: "SET ProvisionedAt = :provisioned_at",
      }),
    );

    return result;
  };
}

async function provision({ provisionerId }: { provisionerId: string }) {
  const provisionerOutput = await dynamodbClient.send(
    new GetItemCommand({
      Key: { Id: stringAttributeFormat.write(provisionerId) },
      TableName: provisionerTableName,
      ProjectionExpression:
        "CountMax, IdleTimeout, RepoName, LaunchTemplateArn, LaunchTemplateVersion, LaunchTimeout",
    }),
  );
  const provisionerItem = provisionerOutput.Item;
  if (!provisionerItem) {
    throw new Error(`No provisioner ${provisionerId}`);
  }
  const countMax = numberAttributeFormat.read(provisionerItem.CountMax);
  const idleTimeout = durationAttributeFormat.read(provisionerItem.IdleTimeout);
  const launchTemplateArn = arnAttributeFormat.read(
    provisionerItem.LaunchTemplateArn,
  );
  const launchTemplateVersion = stringAttributeFormat.read(
    provisionerItem.LaunchTemplateVersion,
  );
  const launchTimeout = durationAttributeFormat.read(
    provisionerItem.LaunchTimeout,
  );
  const repoName =
    provisionerItem.RepoName &&
    stringAttributeFormat.read(provisionerItem.RepoName);

  const credentials = awsCredentialsProvider({
    dynamodbClient,
    provisionerId,
    provisionerTableName,
    stsClient,
  });
  const ec2Client = new EC2Client({
    credentials,
    region: launchTemplateArn.region,
  });

  const installationClient = await provisionerInstallationClient({
    dynamodbClient,
    provisionerTableName,
    githubClient,
    provisionerId,
  });

  const { launchTemplate: launchTemplateId } = launchTemplateResourceRead(
    launchTemplateArn.resource,
  );

  const create = () =>
    createInstance({
      baseArn: launchTemplateArn,
      ec2Client,
      launchTemplateId,
      launchTemplateVersion,
      provisionerId,
    });

  const start = (instance: Instance) =>
    startInstance({
      dynamodbClient,
      ec2Client,
      instance,
      provisionerId,
    });

  const stop = (instance: Instance) =>
    stopInstance({
      instance,
      ec2Client,
      installationClient,
      dynamodbClient,
      provisionerId,
      repoName,
    });

  const terminate = (instance: Instance) =>
    terminateInstance({
      instance,
      ec2Client,
      installationClient,
      dynamodbClient,
      provisionerId,
      repoName,
    });

  const instances: Instance[] = [];
  for await (const instance of getInstances({ ec2Client, provisionerId })) {
    if (
      instance.launchTemplateId !== launchTemplateId ||
      instance.launchTemplateVersion !== launchTemplateVersion
    ) {
      console.log(`Instance ${instance.id} is out of date`);
      await terminate(instance);
    } else if (
      instance.status !== InstanceStatus.DISABLED &&
      !instance.runner &&
      instance.startedAt &&
      Temporal.Instant.compare(
        instance.startedAt.add(launchTimeout),
        Temporal.Now.instant(),
      ) < 0
    ) {
      console.log(
        `No runner has been created by ${provisionerId}/${instance.id} after ${Math.round(instance.startedAt.until(Temporal.Now.instant()).total("seconds"))}s`,
      );
      await terminate(instance);
    } else if (instance.status === undefined) {
      console.log(`Instance ${provisionerId}/${instance.id} is unrecognized`);
      if (
        [Ec2InstanceStatus.STOPPED, Ec2InstanceStatus.STOPPING].includes(
          instance.ec2Status,
        )
      ) {
        await terminate(instance);
      }
    } else if (
      instance.status === InstanceStatus.ENABLED &&
      [Ec2InstanceStatus.STOPPED, Ec2InstanceStatus.STOPPING].includes(
        instance.ec2Status,
      )
    ) {
      console.log(
        `Instance ${provisionerId}/${instance.id} unexpectedly shut down`,
      );
      await terminate(instance);
    } else if (
      instance.status === InstanceStatus.DISABLED &&
      instance.ec2Status === Ec2InstanceStatus.STARTED
    ) {
      console.log(`Instance ${provisionerId}/${instance.id} has been disabled`);
      await stop(instance);
    } else if (
      instance.runner &&
      instance.runner.status === RunnerStatus.IDLE &&
      Temporal.Instant.compare(
        instance.runner.activeAt!.add(idleTimeout),
        Temporal.Now.instant(),
      ) < 0
    ) {
      console.log(
        `Runner on instance ${provisionerId}/${instance.id} has exceeded idle timeout`,
      );
      await stop(instance);
    } else {
      instances.push(instance);
    }
  }

  console.log(`Total instance count is ${instances.length}`);

  // scale down within the maximum
  const priority = (instance: Instance) =>
    +(instance.status === InstanceStatus.ENABLED) + +!!instance.runner;
  instances.sort((a, b) => priority(a) - priority(b));
  const excess = instances.length - (countMax < 0 ? Infinity : countMax);
  if (0 < excess) {
    console.log(`Instance count is ${excess} in excess of the maximum`);
    for (const instance of instances.splice(0, excess)) {
      await terminate(instance);
    }
  }

  const enabledInstances = instances.filter(
    (instance) => instance.status === InstanceStatus.ENABLED,
  );
  console.log(`Enabled instance count is ${instances.length}`);

  // query jobs
  let jobCount = await pendingJobsCount({
    provisionerId,
  });
  console.log(`Pending job count is ${jobCount}`);
  if (countMax) {
    jobCount = Math.min(jobCount, countMax);
  }
  jobCount -= enabledInstances.length;
  if (jobCount <= 0) {
    return;
  }

  // start instances
  const startInstances = instances
    .filter((instance) => instance.ec2Status === Ec2InstanceStatus.STOPPED)
    .slice(0, jobCount);
  console.log(`Starting ${startInstances.length} instances`);
  for (const instance of startInstances) {
    await start(instance);
    --jobCount;
  }

  if (jobCount <= 0) {
    return;
  }

  // create instances
  console.log(`Creating ${jobCount} instances`);
  while (jobCount--) {
    await create();
  }
}

async function pendingJobsCount({
  provisionerId,
}: {
  provisionerId: string;
}): Promise<number> {
  let count = 0;
  for await (const result of paginateQuery(
    { client: dynamodbClient },
    {
      IndexName: "ProvisionerId",
      TableName: jobTableName,
      KeyConditionExpression: "ProvisionerId = :provisionerId",
      ExpressionAttributeNames: { "#status": "Status" },
      ExpressionAttributeValues: {
        ":provisionerId": stringAttributeFormat.write(provisionerId),
        ":status": stringAttributeFormat.write(JobStatus.PENDING),
      },
      FilterExpression: "#status = :status",
      Select: "COUNT",
    },
  )) {
    count += result.Count!;
  }
  return count;
}

async function createInstance({
  baseArn,
  ec2Client,
  launchTemplateId,
  launchTemplateVersion,
  provisionerId,
}: {
  baseArn: ARN;
  launchTemplateId: string;
  launchTemplateVersion: string;
  ec2Client: EC2Client;
  provisionerId: string;
}) {
  console.log(
    `Creating ${provisionerId} instance from launch template ${launchTemplateId}:${launchTemplateVersion}`,
  );
  const arnPrefix = `arn:${baseArn.partition}:ec2:${baseArn.region}:${baseArn.accountId}:instance/`;
  const output = await ec2Client.send(
    new RunInstancesCommand({
      LaunchTemplate: {
        LaunchTemplateId: launchTemplateId,
        Version: launchTemplateVersion,
      },
      MaxCount: 1,
      MinCount: 1,
      MetadataOptions: { InstanceMetadataTags: "enabled" },
      TagSpecifications: [
        {
          ResourceType: "instance",
          Tags: [
            { Key: provisionerIdTag, Value: provisionerId },
            { Key: createRegionTag, Value: region },
            {
              Key: createUrlTag,
              Value: `${runnerCreateUrl}${encodeURIComponent(provisionerId)}/${arnPrefix}`,
            },
          ],
        },
      ],
    }),
  );
  const [instance] = output.Instances!;

  await dynamodbClient.send(
    new PutItemCommand({
      Item: {
        Id: stringAttributeFormat.write(instance.InstanceId!),
        Status: stringAttributeFormat.write(InstanceStatus.ENABLED),
        ProvisionerId: stringAttributeFormat.write(provisionerId),
      },
      TableName: instanceTableName,
    }),
  );
  console.log(`Created instance ${instance.InstanceId}`);
}

async function startInstance({
  dynamodbClient,
  ec2Client,
  instance,
  provisionerId,
}: {
  dynamodbClient: DynamoDBClient;
  ec2Client: EC2Client;
  instance: Instance;
  provisionerId: string;
}) {
  console.log(`Starting instance ${instance.id}`);
  await ec2Client.send(
    new StartInstancesCommand({ InstanceIds: [instance.id] }),
  );

  await dynamodbClient.send(
    new PutItemCommand({
      Item: {
        Id: stringAttributeFormat.write(instance.id),
        Status: stringAttributeFormat.write(InstanceStatus.ENABLED),
        ProvisionerId: stringAttributeFormat.write(provisionerId),
      },
      TableName: instanceTableName,
    }),
  );
  console.log(`Instance ${instance.id} started`);
}

async function stopRunner({
  installationClient,
  repoName,
  id,
}: {
  id: number;
  repoName: string | undefined;
  installationClient: InstallationClient;
}): Promise<boolean> {
  const owner = (installationClient.orgName ?? installationClient.userName)!;
  console.log(`Deleting runner ${owner}/${id}`);
  try {
    if (repoName) {
      await installationClient.client.actions.deleteSelfHostedRunnerFromRepo({
        owner,
        repo: repoName,
        runner_id: id,
      });
    } else {
      await installationClient.client.actions.deleteSelfHostedRunnerFromOrg({
        org: owner,
        runner_id: id,
      });
    }
  } catch (e) {
    if (e instanceof RequestError) {
      if (e.status === 422) {
        console.log(`Runner ${id} is busy`);
        return false;
      } else if (e.status === 404) {
        console.log(`Runner ${id} does not exist`);
        return true;
      }
    }
    throw e;
  }
  console.log(`Deleted runner ${owner}/${id}`);
  return true;
}

async function disableInstance({
  instance,
  installationClient,
  dynamodbClient,
  repoName,
  provisionerId,
}: {
  instance: Instance;
  installationClient: InstallationClient;
  dynamodbClient: DynamoDBClient;
  repoName: string;
  provisionerId: string;
}): Promise<boolean> {
  let runner: Runner | undefined;
  if (instance.status === InstanceStatus.DISABLED) {
    runner = instance.runner;
  } else {
    console.log(`Disabling instance ${provisionerId}/${instance.id}`);
    const output = await dynamodbClient.send(
      new UpdateItemCommand({
        Key: {
          Id: stringAttributeFormat.write(instance.id),
          ProvisionerId: stringAttributeFormat.write(provisionerId),
        },
        TableName: instanceTableName,
        UpdateExpression: "SET #status = :status",
        ExpressionAttributeNames: { "#status": "Status" },
        ExpressionAttributeValues: {
          ":status": stringAttributeFormat.write(InstanceStatus.DISABLED),
        },
        ReturnValues: "ALL_NEW",
      }),
    );
    console.log(`Disabled instance ${provisionerId}/${instance.id}`);
    if (output.Attributes!.Runner) {
      runner = runnerAttributeFormat.read(output.Attributes!.Runner);
    }
  }
  return (
    !runner ||
    (await stopRunner({ installationClient, repoName, id: runner.id }))
  );
}

async function stopInstance({
  instance,
  ec2Client,
  installationClient,
  dynamodbClient,
  repoName,
  provisionerId,
}: {
  instance: Instance;
  ec2Client: EC2Client;
  installationClient: InstallationClient;
  dynamodbClient: DynamoDBClient;
  repoName: string;
  provisionerId: string;
}) {
  if (
    !(await disableInstance({
      instance,
      installationClient,
      dynamodbClient,
      repoName,
      provisionerId,
    }))
  ) {
    return;
  }

  console.log(`Stopping instance ${provisionerId}/${instance.id}`);
  await ec2Client.send(
    new StopInstancesCommand({ InstanceIds: [instance.id] }),
  );
  await dynamodbClient.send(
    new UpdateItemCommand({
      Key: {
        Id: stringAttributeFormat.write(instance.id),
        ProvisionerId: stringAttributeFormat.write(provisionerId),
      },
      TableName: instanceTableName,
      UpdateExpression: "REMOVE Runner",
    }),
  );
  console.log(`Stopped instance ${provisionerId}/${instance.id}`);
}

async function terminateInstance({
  instance,
  ec2Client,
  installationClient,
  dynamodbClient,
  repoName,
  provisionerId,
}: {
  instance: Instance;
  ec2Client: EC2Client;
  installationClient: InstallationClient;
  dynamodbClient: DynamoDBClient;
  repoName: string;
  provisionerId: string;
}) {
  if (
    !(await disableInstance({
      instance,
      installationClient,
      dynamodbClient,
      repoName,
      provisionerId,
    }))
  ) {
    return;
  }

  console.log(`Terminating instance ${provisionerId}/${instance.id}`);
  await ec2Client.send(
    new TerminateInstancesCommand({ InstanceIds: [instance.id] }),
  );
  await dynamodbClient.send(
    new DeleteItemCommand({
      Key: {
        Id: stringAttributeFormat.write(instance.id),
        ProvisionerId: stringAttributeFormat.write(provisionerId),
      },
      TableName: instanceTableName,
    }),
  );
  console.log(`Terminated instance ${provisionerId}/${instance.id}`);
}

interface Instance {
  id: string;
  startedAt: Temporal.Instant | undefined;
  status: InstanceStatus | undefined;
  ec2Status: Ec2InstanceStatus;
  runner: Runner | undefined;
  launchTemplateId: string;
  launchTemplateVersion: string;
}

enum Ec2InstanceStatus {
  STOPPED = "stopped",
  STOPPING = "stopping",
  STARTED = "started",
  STARTING = "starting",
}

async function* getInstances({
  ec2Client,
  provisionerId,
}: {
  ec2Client: EC2Client;
  provisionerId: string;
}): AsyncIterableIterator<Instance> {
  const records = new Map<
    string,
    { runner: Runner | undefined; status: InstanceStatus }
  >();
  for await (const result of paginateQuery(
    { client: dynamodbClient },
    {
      ExpressionAttributeNames: { "#status": "Status" },
      ExpressionAttributeValues: {
        ":provisionerId": stringAttributeFormat.write(provisionerId),
      },
      KeyConditionExpression: "ProvisionerId = :provisionerId",
      ProjectionExpression: "Id, Runner, #status",
      TableName: instanceTableName,
    },
  )) {
    for (const item of result.Items!) {
      const id = stringAttributeFormat.read(item.Id);
      const runner = item.Runner && runnerAttributeFormat.read(item.Runner);
      const status =
        item.Status && instanceStatusAttributeFormat.read(item.Status);
      records.set(id, { runner, status });
    }
  }

  for await (const result of paginateDescribeInstances(
    { client: ec2Client },
    {
      Filters: [
        { Name: `tag:${provisionerIdTag}`, Values: [provisionerId] },
        {
          Name: "instance-state-name",
          Values: [
            // exclude shutting down and terminated
            InstanceStateName.pending,
            InstanceStateName.running,
            InstanceStateName.stopped,
            InstanceStateName.stopping,
          ],
        },
      ],
    },
  )) {
    for (const reservation of result.Reservations!) {
      for (const instance of reservation.Instances!) {
        const record = records.get(instance.InstanceId!);
        if (record) {
          records.delete(instance.InstanceId!);
        }
        let ec2Status: Ec2InstanceStatus;
        switch (instance.State!.Name) {
          case InstanceStateName.pending:
            ec2Status = Ec2InstanceStatus.STARTING;
            break;
          case InstanceStateName.running:
            ec2Status = Ec2InstanceStatus.STARTED;
            break;
          case InstanceStateName.stopped:
            ec2Status = Ec2InstanceStatus.STOPPED;
            break;
          case InstanceStateName.stopping:
            ec2Status = Ec2InstanceStatus.STOPPING;
            break;
        }
        const launchTemplateId = instance.Tags!.find(
          (tag) => tag.Key === "aws:ec2launchtemplate:id",
        )?.Value;
        const launchTemplateVersion = instance.Tags!.find(
          (tag) => tag.Key === "aws:ec2launchtemplate:version",
        )?.Value;
        yield {
          ec2Status: ec2Status!,
          status: record?.status,
          runner: record?.runner,
          id: instance.InstanceId!,
          startedAt: instance.LaunchTime?.toTemporalInstant(),
          launchTemplateId: launchTemplateId || "",
          launchTemplateVersion: launchTemplateVersion || "",
        };
      }
    }
  }

  for (const id of records.keys()) {
    console.log(`Cleaning up record for instance ${id}`);
    await dynamodbClient.send(
      new DeleteItemCommand({
        TableName: instanceTableName,
        Key: {
          Id: stringAttributeFormat.write(id),
          ProvisionerId: stringAttributeFormat.write(provisionerId),
        },
      }),
    );
    console.log(`Cleaned up record for instance ${id}`);
  }
}
