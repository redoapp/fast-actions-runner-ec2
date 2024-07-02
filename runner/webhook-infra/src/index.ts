import {
  artifactS3Bucket,
  artifactS3KeyPrefix,
} from "@redotech/cdk-util/artifact";
import { LambdaParams } from "@redotech/cdk-util/lambda";
import { Fn } from "aws-cdk-lib/core";

export function webhookInfra({
  jobDynamodbTableArn: dynamodbJobTableArn,
  runnerDynamodbTableArn: dynamodbRunnerTableArn,
  githubWebhookSecretParam,
  runnerLabels,
  sqsQueueArn,
  queueExpiration,
}: {
  jobDynamodbTableArn: string;
  runnerDynamodbTableArn: string;
  githubWebhookSecretParam: string;
  runnerLabels: string[];
  sqsQueueArn: string;
  queueExpiration: number;
}) {
  const policyDocument: any = {
    Statement: [
      {
        Action: "dynamodb:*",
        Effect: "Allow",
        Resource: [dynamodbJobTableArn, dynamodbRunnerTableArn],
      },
      {
        Action: "sqs:*",
        Effect: "Allow",
        Resource: sqsQueueArn,
      },
      {
        Action: "ssm:GetParameter*",
        Effect: "Allow",
        Resource: githubWebhookSecretParam,
      },
    ],
    Version: "2012-10-17",
  };

  const lambdaParams: LambdaParams = {
    code: {
      s3Bucket: artifactS3Bucket,
      s3Key: `${artifactS3KeyPrefix}webhook.zip`,
    },
    environment: {
      variables: {
        DYNAMODB_JOB_TABLE_ARN: dynamodbJobTableArn,
        DYNAMODB_RUNNER_TABLE_ARN: dynamodbRunnerTableArn,
        GITHUB_WEBHOOK_SECRET_PARAM: githubWebhookSecretParam,
        NODE_OPTIONS: "--enable-source-maps",
        QUEUE_EXPIRATION_S: Math.round(queueExpiration / 1000).toString(),
        RUNNER_LABELS: Fn.join(",", runnerLabels),
        SQS_QUEUE_ARN: sqsQueueArn,
      },
    },
    handler:
      "redotech_fast_actions_ec2_runner/runner/webhook/lib/index.handler",
    runtime: "nodejs20.x",
  };

  return { policyDocument, lambdaParams };
}
