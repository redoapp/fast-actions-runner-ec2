import "./polyfill";

import {
  BatchWriteItemCommand,
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  paginateQuery,
} from "@aws-sdk/client-dynamodb";
import {
  CreateTagsCommand,
  EC2Client,
  InstanceStateName,
  RunInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
  paginateDescribeInstances,
} from "@aws-sdk/client-ec2";
import { STSClient } from "@aws-sdk/client-sts";
import { parse } from "@aws-sdk/util-arn-parser";
import { RequestError } from "@octokit/request-error";
import { launchTemplateResourceRead } from "@redotech/aws-util/ec2";
import {
  durationRead,
  instantRead,
  instantWrite,
  numberRead,
  stringRead,
  stringWrite,
} from "@redotech/dynamodb/common";
import { envNumberRead, envStringRead, envUrlRead } from "@redotech/lambda/env";
import { sqsInstantRead } from "@redotech/lambda/sqs-format";
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
import { InstanceStatus, Runner, RunnerStatus, runnerRead } from "./instance";

const githubAppId = envNumberRead("GITHUB_APP_ID");

const githubPrivateKey = envStringRead("GITHUB_PRIVATE_KEY");

const instanceTableName = envStringRead("INSTANCE_TABLE_NAME");

const jobTableName = envStringRead("JOB_TABLE_NAME");

const provisionerTableName = envStringRead("PROVISION_TABLE_ARN");

const runnerCreateRegion = envStringRead("RUNNER_CREATE_REGION");

const runnerCreateUrl = envUrlRead("RUNNER_CREATE_URL");

const dynamodbClient = new DynamoDBClient();

const stsClient = new STSClient();

const githubClient = appGithubClient(githubAppId, githubPrivateKey);

export const handler: SQSHandler = async (event) => {
  if (event.Records.length !== 1) {
    throw new Error("Expected exactly one record");
  }
  const [record] = event.Records;
  const effectiveAt = sqsInstantRead(record.messageAttributes.EffectiveAt);
  const { provisionerId } = JSON.parse(record.body);
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
        Key: { Id: stringWrite(provisionerId) },
        TableName: provisionerTableName,
        ProjectionExpression: "ProvisionedAt",
      }),
    );
    const item = output.Item;
    if (!item) {
      throw new Error(`No provisioner ${provisionerId}`);
    }

    if (item.ProvisionedAt) {
      const provisionedAt = instantRead(item.ProvisionedAt);
      if (Temporal.Instant.compare(effectiveAt, provisionedAt) < 0) {
        console.error(
          `Already provisioned at ${provisionedAt}, before ${effectiveAt}. Skipping.`,
        );
        return;
      }
    }

    const provisionedAt = Temporal.Now.instant();

    const result = await f();

    await dynamodbClient.send(
      new UpdateItemCommand({
        ConditionExpression:
          "attribute_exists(Id) AND (attribute_not_exists(ProvisionedAt) OR ProvisionedAt < :provisioned_at)",
        ExpressionAttributeValues: {
          ":provisioned_at": instantWrite(provisionedAt),
        },
        Key: { Id: stringWrite(provisionerId) },
        TableName: provisionerTableName,
        UpdateExpression: "ProvisionedAt = :provisioned_at",
      }),
    );

    return result;
  };
}

async function provision({ provisionerId }: { provisionerId: string }) {
  const provisionerOutput = await dynamodbClient.send(
    new GetItemCommand({
      Key: { Id: stringWrite(provisionerId) },
      TableName: provisionerTableName,
      ProjectionExpression:
        "CountMax, IdleTimeout, RepoName, LaunchTemplateArn, LaunchTemplateVersion, LaunchTimeout",
    }),
  );
  const provisionerItem = provisionerOutput.Item;
  if (!provisionerItem) {
    throw new Error(`No provisioner ${provisionerId}`);
  }
  const countMax = numberRead(provisionerItem.CountMax);
  const idleTimeout = durationRead(provisionerItem.IdleTimeout);
  const launchTemplateArn = parse(
    stringRead(provisionerItem.LaunchTemplateArn),
  );
  const launchTemplateVersion = numberRead(
    provisionerItem.LaunchTemplateVersion,
  );
  const launchTimeout = durationRead(provisionerItem.LaunchTimeout);
  const repoName = stringRead(provisionerItem.Repo);

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
      repoName,
    });

  const terminate = (instance: Instance) =>
    terminateInstance({
      instance,
      ec2Client,
      installationClient,
      dynamodbClient,
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
        `No runner has been created by ${instance.id} within the launch timeout`,
      );
      await terminate(instance);
    } else if (instance.status === undefined) {
      console.log(`Instance ${instance.id} is unrecognized`);
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
      console.log(`Instance ${instance.id} unexpectedly shut down`);
      await terminate(instance);
    } else if (
      instance.status === InstanceStatus.DISABLED &&
      instance.ec2Status === Ec2InstanceStatus.STARTED
    ) {
      console.log(`Instance ${instance.id} has been disabled`);
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
        `Runner on instance ${instance.id} has exceeded idle timeout`,
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
      ExpressionAttributeValues: {
        ":provisionerId": stringWrite(provisionerId),
      },
      Select: "COUNT",
    },
  )) {
    count += result.Count!;
  }
  return count;
}

async function createInstance({
  ec2Client,
  launchTemplateId,
  launchTemplateVersion,
  provisionerId,
}: {
  launchTemplateId: string;
  launchTemplateVersion: number;
  ec2Client: EC2Client;
  provisionerId: string;
}) {
  console.log(
    `Creating instance from launch template ${launchTemplateId}:${launchTemplateVersion}`,
  );
  const output = await ec2Client.send(
    new RunInstancesCommand({
      LaunchTemplate: {
        LaunchTemplateId: launchTemplateId,
        Version: launchTemplateVersion.toString(),
      },
      MaxCount: 1,
      MinCount: 1,
      MetadataOptions: { InstanceMetadataTags: "enabled" },
      TagSpecifications: [
        {
          ResourceType: "instance",
          Tags: [
            { Key: provisionerIdTag, Value: provisionerId },
            { Key: createRegionTag, Value: runnerCreateRegion },
          ],
        },
      ],
    }),
  );

  const [instance] = output.Instances!;

  const url = new URL(instance.InstanceId!, runnerCreateUrl);
  url.searchParams.set("provisioner_id", provisionerId);
  await ec2Client.send(
    new CreateTagsCommand({
      Resources: [instance.InstanceId!],
      Tags: [{ Key: createUrlTag, Value: url.toString() }],
    }),
  );

  await dynamodbClient.send(
    new BatchWriteItemCommand({
      RequestItems: {
        [instanceTableName]: [
          {
            PutRequest: {
              Item: {
                Id: stringWrite(instance.InstanceId!),
                Status: stringWrite(InstanceStatus.ENABLED),
                ProvisionerId: stringWrite(provisionerId),
              },
            },
          },
        ],
      },
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
        Id: stringWrite(instance.id),
        Status: stringWrite(InstanceStatus.ENABLED),
        ProvisionerId: stringWrite(provisionerId),
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
  console.log(`Deleting runner ${id}`);
  const owner = (installationClient.orgName ?? installationClient.userName)!;
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
  console.log(`Runner ${id} deleted`);
  return true;
}

async function disableInstance({
  instance,
  installationClient,
  dynamodbClient,
  repoName,
}: {
  instance: Instance;
  installationClient: InstallationClient;
  dynamodbClient: DynamoDBClient;
  repoName: string;
}): Promise<boolean> {
  let runner: Runner | undefined;
  if (instance.status === InstanceStatus.DISABLED) {
    runner = instance.runner;
  } else {
    console.log(`Disabling instance ${instance.id}`);
    const output = await dynamodbClient.send(
      new UpdateItemCommand({
        Key: { Name: stringWrite(instance.id) },
        TableName: instanceTableName,
        UpdateExpression: "SET #status = :status",
        ExpressionAttributeNames: { "#status": "Status" },
        ExpressionAttributeValues: {
          ":status": stringWrite(InstanceStatus.DISABLED),
        },
        ReturnValues: "ALL_NEW",
      }),
    );
    console.log(`Disabled instance ${instance.id}`);
    if (output.Attributes!.Runner) {
      runner = runnerRead(output.Attributes!.Runner);
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
}: {
  instance: Instance;
  ec2Client: EC2Client;
  installationClient: InstallationClient;
  dynamodbClient: DynamoDBClient;
  repoName: string;
}) {
  await disableInstance({
    instance,
    installationClient,
    dynamodbClient,
    repoName,
  });

  console.log(`Stopping instance ${instance.id}`);
  await ec2Client.send(
    new StopInstancesCommand({ InstanceIds: [instance.id] }),
  );
  await dynamodbClient.send(
    new UpdateItemCommand({
      Key: { Id: stringWrite(instance.id) },
      TableName: instanceTableName,
      UpdateExpression: "REMOVE Runner",
    }),
  );
  console.log(`Stopped instance ${instance.id}`);
}

async function terminateInstance({
  instance,
  ec2Client,
  installationClient,
  dynamodbClient,
  repoName,
}: {
  instance: Instance;
  ec2Client: EC2Client;
  installationClient: InstallationClient;
  dynamodbClient: DynamoDBClient;
  repoName: string;
}) {
  if (
    !(await disableInstance({
      instance,
      installationClient,
      dynamodbClient,
      repoName,
    }))
  ) {
    return;
  }

  console.log(`Terminating instance ${instance.id}`);
  await ec2Client.send(
    new TerminateInstancesCommand({ InstanceIds: [instance.id] }),
  );
  await dynamodbClient.send(
    new DeleteItemCommand({
      Key: { Id: stringWrite(instance.id) },
      TableName: instanceTableName,
    }),
  );
  console.log(`Terminated instance ${instance.id}`);
}

interface Instance {
  id: string;
  startedAt: Temporal.Instant | undefined;
  status: InstanceStatus | undefined;
  ec2Status: Ec2InstanceStatus;
  runner: Runner | undefined;
  launchTemplateId: string;
  launchTemplateVersion: number;
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
      ExpressionAttributeValues: {
        ":provisionerId": stringWrite(provisionerId),
      },
      IndexName: "ProvisionerId",
      KeyConditionExpression: "ProvisionerId = :provisionerId",
      ProjectionExpression: "Runner, Id",
      TableName: instanceTableName,
    },
  )) {
    for (const item of result.Items!) {
      const name = stringRead(item.Id);
      const runner = item.Runner && runnerRead(item.Runner);
      const status = item.Status && <InstanceStatus>stringRead(item.Status);
      records.set(name, { runner, status });
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
          launchTemplateVersion: Number(launchTemplateVersion),
        };
      }
    }
  }

  for (const id of records.keys()) {
    console.log(`Cleaning up record for instance ${id}`);
    await dynamodbClient.send(
      new DeleteItemCommand({
        TableName: instanceTableName,
        Key: { Id: stringWrite(id) },
      }),
    );
    console.log(`Cleaned up record for instance ${id}`);
  }
}
