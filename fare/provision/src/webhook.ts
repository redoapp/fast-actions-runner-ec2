import "./polyfill";

import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
  paginateQuery,
} from "@aws-sdk/client-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  instantWrite,
  numberWrite,
  stringRead,
  stringSetRead,
  stringWrite,
} from "@redotech/dynamodb/common";
import { GithubWebhookBodyMalformedError } from "@redotech/github-webhook";
import { reportError } from "@redotech/lambda/api-gateway";
import { envNumberRead, envStringRead } from "@redotech/lambda/env";
import { getQueueUrl } from "@redotech/sqs";
import { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from "aws-lambda";
import {
  appGithubClient,
  githubWebhook,
  provisionerInstallationClient,
} from "./github";
import { runnerRead } from "./instance";
import { JobStatus } from "./job";
import { labelsMatch } from "./provisioner";
import { runnerRefresh as commonRefreshRunner } from "./runner";

const githubAppId = envNumberRead("GITHUB_APP_ID");

const githubPrivateKey = envStringRead("GITHUB_PRIVATE_KEY");

const jobTableName = envStringRead("JOB_TABLE_NAME");

const provisionerTableName = envStringRead("PROVISIONER_TABLE_NAME");

const instanceTableName = envStringRead("INSTANCE_TABLE_NAME");

const provisionQueueName = envStringRead("PROVISION_QUEUE_NAME");

const webhookSecret = envStringRead("WEBHOOK_SECRET");

const githubClient = appGithubClient(githubAppId, githubPrivateKey);

const dynamodbClient = new DynamoDBClient();

const sqsClient = new SQSClient();
const provisionQueueUrl = getQueueUrl(sqsClient, provisionQueueName);

export const handler: APIGatewayProxyHandlerV2 = async (
  event,
): Promise<APIGatewayProxyResultV2> => {
  return await reportError(() =>
    githubWebhook(
      event,
      { secret: webhookSecret },
      async (eventType, event) => {
        if (eventType !== "workflow_job") {
          console.log("Skipping event", eventType);
          return { statusCode: 204 };
        }
        if (!("workflow_job" in event)) {
          throw new GithubWebhookBodyMalformedError("workflow_job missing");
        }

        const labels = event.workflow_job.labels;
        const installationId = event.installation!.id;
        const jobId = event.workflow_job.id;
        const orgName = event.organization?.login;
        const repoName = event.repository.name;
        const runnerName = event.workflow_job.runner_name;
        const status =
          event.action === "completed"
            ? JobStatus.COMPLETED
            : JobStatus.PENDING;

        await Promise.all([
          runnerName !== null
            ? refreshRunner({ instanceId: runnerName })
            : Promise.resolve(),
          processJobEvent({
            labels,
            installationId,
            jobId,
            orgName,
            repoName,
            status,
          }),
        ]);

        return { statusCode: 204 };
      },
    ),
  );
};

async function findProvisioner({
  labelNames: labels,
  orgName,
  repoName,
}: {
  labelNames: string[];
  orgName: string | undefined;
  repoName: string;
}): Promise<{ id: string } | undefined> {
  for await (const output of paginateQuery(
    { client: dynamodbClient },
    {
      ExpressionAttributeValues: { ":repoName": stringWrite(repoName) },
      IndexName: "RepoName",
      KeyConditionExpression: "RepoName = :repoName",
      ProjectionExpression: "Labels, Id",
      TableName: provisionerTableName,
    },
  )) {
    for (const item of output.Items!) {
      if (labelsMatch(stringSetRead(item.Labels), labels)) {
        return { id: stringRead(item.Id) };
      }
    }
  }

  if (orgName !== undefined) {
    for await (const output of paginateQuery(
      { client: dynamodbClient },
      {
        ExpressionAttributeValues: { ":orgName": stringWrite(orgName) },
        IndexName: "OrgName",
        KeyConditionExpression: "OrgName = :orgName",
        ProjectionExpression: "Labels, Id",
        TableName: provisionerTableName,
      },
    )) {
      for (const item of output.Items!) {
        if (labelsMatch(stringSetRead(item.Labels), labels)) {
          return { id: stringRead(item.Id) };
        }
      }
    }
  }
}

async function processJobEvent({
  status,
  installationId,
  jobId,
  labels: labelNames,
  orgName,
  repoName,
}: {
  status: JobStatus;
  installationId: number;
  jobId: number;
  orgName: string | undefined;
  labels: string[];
  repoName: string;
}) {
  const output = await dynamodbClient.send(
    new UpdateItemCommand({
      ConditionExpression:
        status === JobStatus.COMPLETED
          ? "#status !== :status"
          : "attribute_not_exists(Id)",
      Key: { Id: numberWrite(jobId) },
      UpdateExpression:
        "SET" +
        " Id = :id" +
        ", InstallationId = :installationId" +
        ", RepoName = :repo" +
        ", #status = :status" +
        (status === JobStatus.COMPLETED ? ", ExpiresAt = :expiresAt" : "") +
        (orgName !== undefined ? ", OrgName = :owner" : ""),
      TableName: jobTableName,
      ExpressionAttributeNames: { "#status": "Status" },
      ExpressionAttributeValues: {
        ...(status === JobStatus.COMPLETED && {
          ":expiresAt": instantWrite(
            Temporal.Now.instant().add({ minutes: 1 }),
          ),
        }),
        ":id": numberWrite(jobId),
        ":installationId": numberWrite(installationId),
        ...(orgName !== undefined && { ":orgName": stringWrite(orgName) }),
        ":repoName": stringWrite(repoName),
        ":status": stringWrite(status),
      },
      ReturnValues: "ALL_OLD",
    }),
  );
  if (!output.Attributes) {
    return;
  }

  let provisionerId: string | undefined;
  if (output.Attributes.Id) {
    provisionerId =
      output.Attributes.ProvisionerId &&
      stringRead(output.Attributes.ProvisionerId);
  } else {
    const provisioner = await findProvisioner({
      labelNames,
      orgName,
      repoName,
    });
    if (provisioner) {
      provisionerId = provisioner.id;
      await dynamodbClient.send(
        new UpdateItemCommand({
          Key: { Id: numberWrite(jobId) },
          TableName: jobTableName,
          UpdateExpression: "SET ProvisionerId = :provisionerId",
          ExpressionAttributeValues: {
            ":provisionerId": stringWrite(provisionerId),
          },
        }),
      );
    }
  }

  if (provisionerId !== undefined) {
    // Completing it increases free capacity, unless it didn't exist before.
    // Queued or in progress descreases free capacity, unless it already existed.
    if (!output.Attributes.Id < (status === JobStatus.COMPLETED)) {
      await sqsClient.send(
        new SendMessageCommand({
          MessageBody: provisionerId,
          QueueUrl: await provisionQueueUrl,
        }),
      );
    }
  }
}

/**
 * Refresh the status of the runner.
 */
export async function refreshRunner({ instanceId }: { instanceId: string }) {
  const instanceOutput = await dynamodbClient.send(
    new GetItemCommand({
      Key: { Id: stringWrite(instanceId) },
      TableName: instanceTableName,
      ProjectionExpression: "ActiveAt, Runner, ProvisionerId",
    }),
  );
  const instanceItem = instanceOutput.Item;
  if (!instanceItem || !instanceItem.Runner) {
    return;
  }
  const provisionerId = stringRead(instanceItem.ProvisionerId);

  const provisionerOutput = await dynamodbClient.send(
    new GetItemCommand({
      Key: { Id: stringWrite(provisionerId) },
      TableName: instanceTableName,
      ProjectionExpression: "RepoName",
    }),
  );
  const provisionerItem = provisionerOutput.Item;
  if (!provisionerItem) {
    return;
  }

  const repoName =
    provisionerItem.RepoName && stringRead(instanceItem.RepoName);

  const runner = runnerRead(instanceItem.Runner);

  const installationClient = await provisionerInstallationClient({
    dynamodbClient,
    provisionerTableName,
    githubClient,
    provisionerId,
  });

  await commonRefreshRunner({
    activeAt: runner.activeAt,
    dynamodbClient,
    installationClient,
    instanceTableName,
    instanceId: instanceId,
    repoName,
    id: runner.id,
  });
}
