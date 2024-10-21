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
import { countBy, sortBy } from "lodash";
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

const githubAppId = envNumberRead("GITHUB_APP_ID");

const githubPrivateKey = envStringRead("GITHUB_PRIVATE_KEY");

const instanceTableName = envStringRead("INSTANCE_TABLE_NAME");

const jobTableName = envStringRead("JOB_TABLE_NAME");

const provisionerTableName = envStringRead("PROVISIONER_TABLE_NAME");

const runnerCreateUrl = envUrlRead("RUNNER_CREATE_URL");

const region = envStringRead("AWS_REGION");

const dynamodbClient = new DynamoDBClient();

const stsClient = new STSClient();

const githubClient = appGithubClient(githubAppId, githubPrivateKey);

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
  console.log(`Provisioning ${provisionerId}`);

  const provisionerOutput = await dynamodbClient.send(
    new GetItemCommand({
      Key: { Id: stringAttributeFormat.write(provisionerId) },
      TableName: provisionerTableName,
      ProjectionExpression:
        "CountMax, CountMin, IdleTimeout, RepoName, LaunchTemplateArn, LaunchTemplateVersion, LaunchTimeout, ScaleFactor",
    }),
  );
  const provisionerItem = provisionerOutput.Item;
  if (!provisionerItem) {
    throw new Error(`No provisioner ${provisionerId}`);
  }
  let countMax = numberAttributeFormat.read(provisionerItem.CountMax);
  if (countMax < 0) {
    countMax = Infinity;
  }
  const countMin = numberAttributeFormat.read(provisionerItem.CountMin);
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
  const scaleFactor = numberAttributeFormat.read(provisionerItem.ScaleFactor);

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
      dynamodbClient,
      provisionerId,
    });

  const stopGracefully = (instance: Instance) =>
    stopInstanceGracefully({
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
      dynamodbClient,
      provisionerId,
    });

  const terminateGracefully = (instance: Instance) =>
    terminateInstanceGracefully({
      instance,
      ec2Client,
      installationClient,
      dynamodbClient,
      provisionerId,
      repoName,
    });

  let instances: Instance[] = [];
  for await (const instance of getInstances({ ec2Client, provisionerId })) {
    if (instance.status === undefined) {
      console.log(`Instance ${provisionerId}/${instance.id} is unrecognized`);
      await terminate(instance);
      continue;
    } else if (
      instance.launchTemplateId !== launchTemplateId ||
      instance.launchTemplateVersion !== launchTemplateVersion
    ) {
      console.log(
        `Instance ${provisionerId}/${instance.id} is out of date with ${launchTemplateId}/${launchTemplateVersion}`,
      );
      if (await terminateGracefully(instance)) {
        continue;
      }
    } else if (instance.status === InstanceStatus.DISABLED) {
      if (instance.ec2Status === Ec2InstanceStatus.STARTED) {
        console.log(
          `Instance ${provisionerId}/${instance.id} has been disabled`,
        );
        await stop(instance);
        instance.ec2Status = Ec2InstanceStatus.STOPPING;
      }
    } else if (
      [Ec2InstanceStatus.STOPPED, Ec2InstanceStatus.STOPPING].includes(
        instance.ec2Status,
      )
    ) {
      console.log(
        `Instance ${provisionerId}/${instance.id} unexpectedly shut down`,
      );
      if (await terminateGracefully(instance)) {
        continue;
      }
    } else if (!instance.runner) {
      const launchExcess = Temporal.Now.instant()
        .until(instance.startedAt)
        .subtract(launchTimeout);
      if (
        Temporal.Duration.compare(new Temporal.Duration(), launchExcess) < 0
      ) {
        console.log(
          `Instance ${provisionerId}/${instance.id} exceeded launch timeout ${durationDisplay(launchTimeout)} by ${durationDisplay(launchExcess)}`,
        );
        if (await terminateGracefully(instance)) {
          continue;
        }
      }
    }
    instances.push(instance);
  }

  // count instances
  console.log(
    `Total instance count for ${provisionerId} is ${instances.length}`,
  );
  const statusCounts = countBy(instances, (instance) => instance.status);
  console.log(
    `Instance statuses for ${provisionerId}: ${statusCounts[InstanceStatus.ENABLED]} enabled, ${InstanceStatus.DISABLED} disabled`,
  );
  const ec2StatusCounts = countBy(instances, (instance) => instance.ec2Status);
  console.log(
    `EC2 statuses for ${provisionerId}: ${ec2StatusCounts[Ec2InstanceStatus.STARTING]} starting, ${ec2StatusCounts[Ec2InstanceStatus.STARTED]} started, ${ec2StatusCounts[Ec2InstanceStatus.STOPPING]} stopping, ${ec2StatusCounts[Ec2InstanceStatus.STOPPED]} stopped`,
  );
  const runnerStatusCounts = countBy(
    instances,
    (instance) => instance.ec2Status,
  );
  console.log(
    `Runner statuses for ${provisionerId}: ${runnerStatusCounts[RunnerStatus.ACTIVE]} active, ${runnerStatusCounts[RunnerStatus.IDLE]} idle`,
  );

  // stop idle runners
  let idleCandidates = instances.filter((instance) => instance.runner);
  let idleMax = idleCandidates.length - countMin;
  idleCandidates = sortBy(
    instances,
    (instance) => instance.runner!.activeAt.epochNanoseconds,
  );
  for (const instance of idleCandidates) {
    if (!idleMax) {
      break;
    }
    const idleExcess = instance
      .runner!.activeAt.until(Temporal.Now.instant())
      .subtract(idleTimeout);
    if (Temporal.Duration.compare(idleExcess, new Temporal.Duration()) <= 0) {
      break;
    }
    console.log(
      `Runner on instance ${provisionerId}/${instance.id} exceeded idle timeout ${durationDisplay(idleTimeout)} by ${durationDisplay(idleExcess)}`,
    );
    if (await stopGracefully(instance)) {
      instance.ec2Status = Ec2InstanceStatus.STOPPING;
      instance.status = InstanceStatus.DISABLED;
      idleMax--;
    }
  }

  // scale down within the maximum
  instances = sortBy(
    instances,
    (instance) => instance.status === InstanceStatus.ENABLED,
    (instance) => !!instance.runner,
    (instance) =>
      instance.runner
        ? instance.runner.activeAt.epochNanoseconds
        : instance.startedAt.epochNanoseconds,
  );
  const excessCount = instances.length - countMax;
  if (0 < excessCount) {
    console.log(
      `Instance count for ${provisionerId} exceeds the maximum ${countMax} by ${excessCount}`,
    );
    for (let i = 0; i < instances.length && countMax < instances.length; ) {
      if (await terminateGracefully(instances[i])) {
        instances.splice(i, 1);
      } else {
        i++;
      }
    }
  }

  // query jobs
  const jobCount = await pendingJobsCount({ provisionerId });
  console.log(`Pending job count for ${provisionerId} is ${jobCount}`);

  let instanceTargetCount = Math.ceil(jobCount * scaleFactor);
  instanceTargetCount = Math.max(instanceTargetCount, countMin);

  let instancePlannedCount =
    instanceTargetCount -
    instances.filter((instance) => instance.status === InstanceStatus.ENABLED)
      .length;
  if (instancePlannedCount <= 0) {
    return;
  }

  // start stopped instances, most recent first
  let startInstances = instances.filter(
    (instance) => instance.ec2Status === Ec2InstanceStatus.STOPPED,
  );
  startInstances = sortBy(
    startInstances,
    (instance) => -instance.startedAt.epochNanoseconds,
  );
  startInstances = startInstances.slice(0, instancePlannedCount);
  console.log(`Starting ${startInstances.length} instances`);
  for (const instance of startInstances) {
    await start(instance);
  }

  // limit total instances to maximum
  instancePlannedCount = Math.min(
    instancePlannedCount - startInstances.length,
    countMax - instances.length,
  );
  if (instancePlannedCount <= 0) {
    return;
  }

  // create instances
  console.log(`Creating ${instancePlannedCount} instances`);
  while (instancePlannedCount--) {
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
        ":provisionerId": stringAttributeFormat.write(provisionerId),
      },
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
  dynamodbClient,
  provisionerId,
}: {
  instance: Instance;
  ec2Client: EC2Client;
  dynamodbClient: DynamoDBClient;
  provisionerId: string;
}) {
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

async function stopInstanceGracefully({
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
    return false;
  }

  await stopInstance({
    instance,
    ec2Client,
    dynamodbClient,
    provisionerId,
  });

  return true;
}

async function terminateInstance({
  instance,
  ec2Client,
  dynamodbClient,
  provisionerId,
}: {
  instance: Instance;
  ec2Client: EC2Client;
  dynamodbClient: DynamoDBClient;
  provisionerId: string;
}) {
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

async function terminateInstanceGracefully({
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
    return false;
  }

  await terminateInstance({
    instance,
    ec2Client,
    dynamodbClient,
    provisionerId,
  });

  return true;
}

interface Instance {
  id: string;
  startedAt: Temporal.Instant;
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
          startedAt: instance.LaunchTime!.toTemporalInstant(),
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

function durationDisplay(duration: Temporal.Duration) {
  return `${duration.total("seconds").toFixed(0)}s`;
}
