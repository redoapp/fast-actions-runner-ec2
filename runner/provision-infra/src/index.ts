import {
  artifactS3Bucket,
  artifactS3KeyPrefix,
} from "@redotech/cdk-util/artifact";
import { LambdaParams } from "@redotech/cdk-util/lambda";
import { Fn } from "aws-cdk-lib/core";

export function provisionInfra({
  githubOrg,
  githubRepo,
  githubTokenParam,
  idleTimeout,
  instanceRoleArn,
  instanceTag,
  jobDynamodbTableArn,
  launchTemplate,
  maxRunners,
  queueArn,
  runnerDynamodbTableArn,
  runnerGroup,
  runnerLabels,
}: {
  githubOrg: string;
  githubRepo: string;
  githubTokenParam: string;
  idleTimeout: number;
  instanceRoleArn: string;
  instanceTag: string;
  jobDynamodbTableArn: string;
  launchTemplate: { arn: string; version: string };
  maxRunners: number;
  queueArn: string;
  runnerDynamodbTableArn: string;
  runnerGroup: string;
  runnerLabels: string[];
}) {
  const policyDocument: any = {
    Statement: [
      {
        Action: "dynamodb:*",
        Effect: "Allow",
        Resource: runnerDynamodbTableArn,
      },
      {
        Action: "ec2:CreateTags",
        Condition: { StringEquals: { "ec2:CreateAction": "RunInstances" } },
        Effect: "Allow",
        Resource: "*",
      },
      {
        Action: "ec2:DescribeInstances",
        Effect: "Allow",
        Resource: "*",
      },
      {
        Action: "ec2:RunInstances",
        Condition: {
          StringEquals: { "ec2:LaunchTemplate": launchTemplate.arn },
        },
        Effect: "Allow",
        Resource: "*",
      },
      {
        Action: [
          "ec2:StartInstances",
          "ec2:StopInstances",
          "ec2:TerminateInstances",
        ],
        Effect: "Allow",
        Resource: "*",
      },
      {
        Action: "iam:PassRole",
        Effect: "Allow",
        Resource: instanceRoleArn,
      },
      {
        Action: "sqs:*",
        Effect: "Allow",
        Resource: queueArn,
      },
      {
        Action: "ssm:GetParameter*",
        Effect: "Allow",
        Resource: githubTokenParam,
      },
    ],
    Version: "2012-10-17",
  };

  const lambdaParams: LambdaParams = {
    code: {
      s3Bucket: artifactS3Bucket,
      s3Key: `${artifactS3KeyPrefix}provision.zip`,
    },
    environment: {
      variables: {
        EC2_INSTANCE_TAG: instanceTag,
        EC2_LAUNCH_TEMPLATE_ARN: launchTemplate.arn,
        EC2_LAUNCH_TEMPLATE_VERSION: launchTemplate.version,
        GITHUB_ORG: githubOrg,
        GITHUB_REPO: githubRepo,
        GITHUB_TOKEN_PARAM: githubTokenParam,
        IDLE_TIMEOUT_S: Math.round(idleTimeout / 1000).toString(),
        JOB_DYNAMODB_TABLE_ARN: jobDynamodbTableArn,
        MAX_RUNNERS: maxRunners.toString(),
        NODE_OPTIONS: "--enable-source-maps",
        RUNNER_DYNAMODB_TABLE_ARN: runnerDynamodbTableArn,
        RUNNER_GROUP: runnerGroup,
        RUNNER_LABELS: Fn.join(",", runnerLabels),
        SQS_QUEUE_ARN: queueArn,
      },
    },
    handler:
      "redotech_fast_actions_ec2_runner/runner/provision/lib/index.handler",
    runtime: "nodejs20.x",
  };

  return { policyDocument, lambdaParams };
}
