import "./polyfill";

import {
  ConditionalCheckFailedException,
  DeleteItemCommand,
  DynamoDBClient,
  UpdateItemCommand,
  UpdateItemCommandOutput,
} from "@aws-sdk/client-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  numberAttributeFormat,
  stringAttributeFormat,
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
import {
  JobAspect,
  provisionerCandidates,
  provisionerMatches,
} from "./provisioner";
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

        const installationId = event.installation!.id;
        const jobId = event.workflow_job.id;
        const runnerName = event.workflow_job.runner_name ?? undefined;

        if (event.action === "completed") {
          await processJobComplete({
            installationId,
            jobId,
            runnerName,
          });
        } else {
          const labels = event.workflow_job.labels;
          const orgName = event.organization?.login;
          const repoName = event.repository.name;
          const userName =
            event.repository.owner.type === "User"
              ? event.repository.owner.login
              : undefined;

          await processJobPending({
            labels,
            installationId,
            jobId,
            orgName,
            repoName,
            runnerName,
            userName,
          });
        }

        return { statusCode: 204 };
      },
    ),
  );

async function processJobPending({
  installationId,
  jobId,
  labels: labelNames,
  orgName,
  repoName,
  runnerName,
  userName,
}: {
  installationId: number;
  jobId: number;
  orgName: string | undefined;
  labels: string[];
  repoName: string;
  runnerName: string | undefined;
  userName: string | undefined;
}) {
  console.log(`Processing pending job ${installationId}/${jobId}`);
  let output: UpdateItemCommandOutput;
  try {
    output = await dynamodbClient.send(
      new UpdateItemCommand({
        ConditionExpression: "attribute_not_exists(Id)",
        Key: {
          Id: numberAttributeFormat.write(jobId),
          InstallationId: numberAttributeFormat.write(installationId),
        },
        UpdateExpression: "SET RepoName = :repoName",
        TableName: jobTableName,
        ExpressionAttributeValues: {
          ":repoName": stringAttributeFormat.write(repoName),
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
    const owner = (orgName ?? userName)!;
    const job: JobAspect = { labelNames, repoName };
    for await (const provisioner of provisionerCandidates({
      dynamodbClient,
      owner,
      provisionerTableName,
    })) {
      if (provisionerMatches(provisioner, job)) {
        provisionerId = provisioner.id;
        console.log(
          `Found provisioner ${provisioner.id} for ${owner}/${repoName} ${labelNames}`,
        );
        await dynamodbClient.send(
          new UpdateItemCommand({
            ConditionExpression: "attribute_exists(Id)",
            ExpressionAttributeValues: {
              ":provisionerId": stringAttributeFormat.write(provisionerId),
            },
            Key: {
              Id: numberAttributeFormat.write(jobId),
              InstallationId: numberAttributeFormat.write(installationId),
            },
            TableName: jobTableName,
            UpdateExpression: "SET ProvisionerId = :provisionerId",
          }),
        );
        break;
      }
    }
    console.log(`No provisioner found for ${owner}/${repoName} ${labelNames}`);
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

async function processJobComplete({
  installationId,
  jobId,
  runnerName,
}: {
  installationId: number;
  jobId: number;
  runnerName: string | undefined;
}) {
  console.log(`Processing completed job ${installationId}/${jobId}`);
  const output = await dynamodbClient.send(
    new DeleteItemCommand({
      Key: {
        Id: numberAttributeFormat.write(jobId),
        InstallationId: numberAttributeFormat.write(installationId),
      },
      TableName: jobTableName,
      ReturnValues: "ALL_OLD",
    }),
  );

  if (!output.Attributes?.ProvisionerId) {
    return;
  }

  const provisionerId =
    output.Attributes.ProvisionerId &&
    stringAttributeFormat.read(output.Attributes.ProvisionerId);
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
