import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import {
  GetQueueUrlCommand,
  SQSClient,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { ARN } from "@aws-sdk/util-arn-parser";
import {
  JobStatus,
  jobRecordWrite,
} from "@redotech/fast-actions-ec2-runner-common/job";
import {
  RunnerStatus,
  runnerRecordWrite,
} from "@redotech/fast-actions-ec2-runner-common/runner";
import {
  GithubWebhookBodyMalformedError,
  GithubWebhookRequest,
  githubWebhookRead,
} from "./github";

export class WebhookUnexpectedEventError extends Error {
  constructor(name: string) {
    super(`Unexpected event: ${name}`);
  }
}

export function webhook({
  dynamodbJobTableArn,
  dynamodbRunnerTableArn,
  queueExpiration,
  githubWebhookSecret,
  runnerLabels,
  sqsQueueArn,
}: {
  dynamodbJobTableArn: ARN;
  dynamodbRunnerTableArn: ARN;
  githubWebhookSecret: string;
  queueExpiration: number;
  runnerLabels: Set<string>;
  sqsQueueArn: ARN;
}) {
  const dynamodbClient = new DynamoDBClient({
    region: dynamodbJobTableArn.region,
  });
  const documentClient = DynamoDBDocumentClient.from(dynamodbClient);

  const jobTable = dynamodbJobTableArn.resource.split("/")[1];

  const runnerTable = dynamodbRunnerTableArn.resource.split("/")[1];

  const sqsClient = new SQSClient({ region: sqsQueueArn.region });

  const sqsQueueUrl = (async () => {
    try {
      const result = await sqsClient.send(
        new GetQueueUrlCommand({
          QueueName: sqsQueueArn.resource,
        }),
      );
      return result.QueueUrl!;
    } catch (e) {
      throw new Error("Failed to get SQS queue URL", { cause: e });
    }
  })();

  return async ({
    body,
    event: eventType,
    signature,
  }: GithubWebhookRequest) => {
    const event = await githubWebhookRead(
      { body, signature },
      { secret: githubWebhookSecret },
    );

    console.log("Event", eventType || "-");
    switch (eventType) {
      case "ping":
        return;
      case "workflow_job":
        break;
      default:
        throw new WebhookUnexpectedEventError(eventType || "");
    }
    if (!("workflow_job" in event)) {
      throw new GithubWebhookBodyMalformedError("");
    }

    const labels = event.workflow_job.labels;
    if (!labelsMatch(runnerLabels, labels)) {
      console.error("Labels do not match", labels);
      return;
    }
    const jobId = event.workflow_job.id;
    const runnerId = event.workflow_job.runner_id;
    const runnerName = event.workflow_job.runner_name;
    switch (event.action) {
      case "completed":
        {
          console.error("Job completed", jobId);
          const expiration = new Date(Date.now() + 1000 * 60);
          const activeAt = new Date(event.workflow_job.completed_at!);
          await documentClient.send(
            new PutItemCommand({
              ConditionExpression:
                "attribute_not_exists(Id) OR ActiveAt < :activeAt",
              ExpressionAttributeValues: {
                ":activeAt": { S: activeAt.toISOString() },
              },
              Item: runnerRecordWrite({
                name: runnerName!,
                activeAt,
                expiration,
                id: runnerId!,
                status: RunnerStatus.IDLE,
              }),
              TableName: runnerTable,
            }),
          );
          await documentClient.send(
            new PutItemCommand({
              ConditionExpression: "NOT contains(:status, #status)",
              ExpressionAttributeNames: { "#status": "Status" },
              ExpressionAttributeValues: {
                ":status": { SS: [JobStatus.COMPLETED] },
              },
              Item: jobRecordWrite({
                expiration,
                id: jobId,
                status: JobStatus.COMPLETED,
              }),
              TableName: jobTable,
            }),
          );
        }
        break;
      case "in_progress":
        {
          console.error("Job in progress", jobId);
          const expiration = new Date(Date.now() + queueExpiration);
          const activeAt = new Date(event.workflow_job.completed_at!);
          await documentClient.send(
            new PutItemCommand({
              ConditionExpression:
                "attribute_not_exists(Id) OR ActiveAt < :activeAt",
              ExpressionAttributeValues: {
                ":activeAt": { S: activeAt.toISOString() },
              },
              Item: runnerRecordWrite({
                activeAt,
                expiration,
                id: runnerId!,
                name: runnerName!,
                status: RunnerStatus.ACTIVE,
              }),
              TableName: runnerTable,
            }),
          );
          await documentClient.send(
            new PutItemCommand({
              Item: jobRecordWrite({
                expiration,
                id: jobId,
                status: JobStatus.IN_PROGRESS,
              }),
              ConditionExpression: "NOT contains(:status, #status)",
              TableName: jobTable,
              ExpressionAttributeNames: { "#status": "Status" },
              ExpressionAttributeValues: {
                ":status": {
                  SS: [JobStatus.COMPLETED, JobStatus.IN_PROGRESS],
                },
              },
            }),
          );
        }
        break;
      case "queued":
        {
          console.error("Job queued", jobId);
          const expiration = new Date(Date.now() + queueExpiration);
          await documentClient.send(
            new PutItemCommand({
              Item: jobRecordWrite({
                expiration,
                id: jobId,
                status: JobStatus.QUEUED,
              }),
              ConditionExpression: "attribute_not_exists(id)",
              TableName: jobTable,
            }),
          );
        }
        break;
      default:
        throw new WebhookUnexpectedEventError(event.action);
    }

    await enqueue(sqsClient, await sqsQueueUrl);
  };
}

function labelsMatch(runnerLabels: Set<string>, jobLabels: string[]) {
  return jobLabels.every((label) => runnerLabels.has(label));
}

async function enqueue(sqsClient: SQSClient, sqsQueueUrl: string) {
  await sqsClient.send(
    new SendMessageCommand({ QueueUrl: sqsQueueUrl, MessageBody: "_" }),
  );
}
