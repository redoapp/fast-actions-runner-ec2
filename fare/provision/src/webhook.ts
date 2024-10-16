import "./polyfill";

import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  UpdateItemCommand,
  UpdateItemCommandOutput,
  paginateQuery,
} from "@aws-sdk/client-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  instantAttributeFormat,
  numberAttributeFormat,
  stringAttributeFormat,
  stringSetAttributeFormat,
} from "@redotech/dynamodb/attribute";
import { GithubWebhookBodyMalformedError } from "@redotech/github-webhook";
import { reportError } from "@redotech/lambda/api-gateway";
import { envNumberRead, envStringRead } from "@redotech/lambda/env";
import { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from "aws-lambda";
import {
  appGithubClient,
  githubWebhook,
  provisionerInstallationClient,
} from "./github";
import { JobStatus } from "./job";
import { labelsMatch } from "./provisioner";
import { runnerRefresh as commonRefreshRunner } from "./runner";

const githubAppId = envNumberRead("GITHUB_APP_ID");

const githubPrivateKey = envStringRead("GITHUB_PRIVATE_KEY");

const instanceTableName = envStringRead("INSTANCE_TABLE_NAME");

const jobTableName = envStringRead("JOB_TABLE_NAME");

const provisionerTableName = envStringRead("PROVISIONER_TABLE_NAME");

const provisionQueueUrl = envStringRead("PROVISION_QUEUE_URL");

const webhookSecret = envStringRead("WEBHOOK_SECRET");

const githubClient = appGithubClient(githubAppId, githubPrivateKey);

const dynamodbClient = new DynamoDBClient();

const sqsClient = new SQSClient();

export const handler: APIGatewayProxyHandlerV2 = (
  event,
): Promise<APIGatewayProxyResultV2> =>
  reportError(() =>
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
        const runnerName = event.workflow_job.runner_name ?? undefined;
        const userName =
          event.repository.owner.type === "User"
            ? event.repository.owner.login
            : undefined;
        const status =
          event.action === "completed"
            ? JobStatus.COMPLETED
            : JobStatus.PENDING;

        await processJobEvent({
          labels,
          installationId,
          jobId,
          orgName,
          repoName,
          runnerName,
          status,
          userName,
        });

        return { statusCode: 204 };
      },
    ),
  );

async function findProvisioner({
  labelNames: labels,
  owner,
  repoName,
}: {
  labelNames: string[];
  owner: string;
  repoName: string;
}): Promise<{ id: string } | undefined> {
  for await (const output of paginateQuery(
    { client: dynamodbClient },
    {
      ExpressionAttributeNames: { "#owner": "Owner" },
      ExpressionAttributeValues: {
        ":owner": stringAttributeFormat.write(owner),
      },
      IndexName: "Owner",
      KeyConditionExpression: "#owner = :owner",
      ProjectionExpression: "Labels, Id, RepoName",
      TableName: provisionerTableName,
    },
  )) {
    for (const item of output.Items!) {
      if (
        (!item.RepoName ||
          stringAttributeFormat.read(item.RepoName) === repoName) &&
        labelsMatch(stringSetAttributeFormat.read(item.Labels), labels)
      ) {
        const id = stringAttributeFormat.read(item.Id);
        console.log(
          `Found provisioner ${id} for ${owner}/${repoName} ${labels}`,
        );
        return { id };
      }
    }
  }
  console.log(`No provisioner found for ${owner}/${repoName} ${labels}`);
}

async function processJobEvent({
  status,
  installationId,
  jobId,
  labels: labelNames,
  orgName,
  repoName,
  runnerName,
  userName,
}: {
  status: JobStatus;
  installationId: number;
  jobId: number;
  orgName: string | undefined;
  labels: string[];
  repoName: string;
  runnerName: string | undefined;
  userName: string | undefined;
}) {
  console.log(`Processing job ${jobId} ${status}`);
  let output: UpdateItemCommandOutput;
  try {
    output = await dynamodbClient.send(
      new UpdateItemCommand({
        ConditionExpression:
          status === JobStatus.COMPLETED
            ? "#status <> :status"
            : "attribute_not_exists(Id)",
        Key: {
          Id: numberAttributeFormat.write(jobId),
          InstallationId: numberAttributeFormat.write(installationId),
        },
        UpdateExpression:
          "SET" +
          " RepoName = :repoName" +
          ", #status = :status" +
          (status === JobStatus.COMPLETED ? ", ExpiresAt = :expiresAt" : "") +
          (orgName !== undefined ? ", OrgName = :orgName" : ""),
        TableName: jobTableName,
        ExpressionAttributeNames: { "#status": "Status" },
        ExpressionAttributeValues: {
          ...(status === JobStatus.COMPLETED && {
            ":expiresAt": instantAttributeFormat.write(
              Temporal.Now.instant().add({ minutes: 1 }),
            ),
          }),
          ...(orgName !== undefined && {
            ":orgName": stringAttributeFormat.write(orgName),
          }),
          ":repoName": stringAttributeFormat.write(repoName),
          ":status": stringAttributeFormat.write(status),
        },
        ReturnValues: "ALL_OLD",
      }),
    );
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      return;
    }
    throw e;
  }

  let provisionerId: string | undefined;
  if (output.Attributes?.ProvisionerId) {
    provisionerId =
      output.Attributes.ProvisionerId &&
      stringAttributeFormat.read(output.Attributes.ProvisionerId);
  } else {
    const provisioner = await findProvisioner({
      labelNames,
      owner: (orgName ?? userName)!,
      repoName,
    });
    if (provisioner) {
      provisionerId = provisioner.id;
      await dynamodbClient.send(
        new UpdateItemCommand({
          ConditionExpression: "attribute_exists(Id)",
          Key: {
            Id: numberAttributeFormat.write(jobId),
            InstallationId: numberAttributeFormat.write(installationId),
          },
          TableName: jobTableName,
          UpdateExpression: "SET ProvisionerId = :provisionerId",
          ExpressionAttributeValues: {
            ":provisionerId": stringAttributeFormat.write(provisionerId),
          },
        }),
      );
    }
  }

  if (provisionerId !== undefined) {
    await sqsClient.send(
      new SendMessageCommand({
        MessageBody: "_",
        MessageDeduplicationId: `${provisionerId}/${process.hrtime.bigint().toString(16)}`,
        MessageGroupId: provisionerId,
        QueueUrl: provisionQueueUrl,
      }),
    );
    if (runnerName !== undefined) {
      await refreshRunner({ instanceId: runnerName, provisionerId });
    }
  }
}

/**
 * Refresh the status of the runner.
 */
async function refreshRunner({
  instanceId,
  provisionerId,
}: {
  instanceId: string;
  provisionerId: string;
}) {
  const installationClient = await provisionerInstallationClient({
    dynamodbClient,
    provisionerTableName,
    githubClient,
    provisionerId,
  });

  await commonRefreshRunner({
    dynamodbClient,
    installationClient,
    instanceId,
    instanceTableName,
    provisionerId,
  });
}
