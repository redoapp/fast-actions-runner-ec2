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
import { runnerRefresh } from "./runner";

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
  context,
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

        const action = event.action;
        const installationId = event.installation!.id;
        const jobId = event.workflow_job.id;
        const runnerName = event.workflow_job.runner_name ?? undefined;
        if (!event.workflow_job.labels.length) {
          // happens for synthetic check runs?
          console.log(`No labels for job ${installationId}/${jobId}`);
          return { statusCode: 204 };
        }
        console.log(
          `Processing event ${action} for job ${installationId}/${jobId}`,
        );

        let provisionerId: string | undefined;
        switch (action) {
          case "completed":
            provisionerId = await processJobComplete({
              installationId,
              jobId,
            });
            break;
          case "in_progress":
          case "queued": {
            const labels = event.workflow_job.labels;
            const orgName = event.organization?.login;
            const repoName = event.repository.name;
            const userName =
              event.repository.owner.type === "User"
                ? event.repository.owner.login
                : undefined;
            provisionerId = await processJobPending({
              labels,
              installationId,
              jobId,
              orgName,
              repoName,
              userName,
            });
            break;
          }
        }

        if (provisionerId !== undefined) {
          if (runnerName) {
            const installationClient = await provisionerInstallationClient({
              dynamodbClient,
              provisionerTableName,
              githubClient,
              provisionerId,
            });

            await runnerRefresh({
              dynamodbClient,
              installationClient,
              instanceId: runnerName,
              instanceTableName,
              provisionerId,
            });
          }
          await sqsClient.send(
            new SendMessageCommand({
              MessageBody: "_",
              MessageDeduplicationId: context.awsRequestId,
              MessageGroupId: provisionerId,
              QueueUrl: provisionQueueUrl,
            }),
          );
        }

        return { statusCode: 204 };
      },
    ),
  );

/**
 * @returns Newly-assigned Provisioner ID
 */
async function processJobPending({
  installationId,
  jobId,
  labels: labelNames,
  orgName,
  repoName,
  userName,
}: {
  installationId: number;
  jobId: number;
  orgName: string | undefined;
  labels: string[];
  repoName: string;
  userName: string | undefined;
}): Promise<string | undefined> {
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
      }),
    );
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      return;
    }
    throw e;
  }

  const owner = (orgName ?? userName)!;
  const job: JobAspect = { labelNames, repoName };
  for await (const provisioner of provisionerCandidates({
    dynamodbClient,
    owner,
    provisionerTableName,
  })) {
    if (provisionerMatches(provisioner, job)) {
      console.log(
        `Found provisioner ${provisioner.id} for ${owner}/${repoName} ${labelNames}`,
      );
      await dynamodbClient.send(
        new UpdateItemCommand({
          ConditionExpression: "attribute_exists(Id)",
          ExpressionAttributeValues: {
            ":provisionerId": stringAttributeFormat.write(provisioner.id),
          },
          Key: {
            Id: numberAttributeFormat.write(jobId),
            InstallationId: numberAttributeFormat.write(installationId),
          },
          TableName: jobTableName,
          UpdateExpression: "SET ProvisionerId = :provisionerId",
        }),
      );
      return provisioner.id;
    }
  }
  console.log(`No provisioner found for ${owner}/${repoName} ${labelNames}`);
}

async function processJobComplete({
  installationId,
  jobId,
}: {
  installationId: number;
  jobId: number;
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

  return (
    output.Attributes.ProvisionerId &&
    stringAttributeFormat.read(output.Attributes.ProvisionerId)
  );
}
