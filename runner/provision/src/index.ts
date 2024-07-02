import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { parse } from "@aws-sdk/util-arn-parser";
import { Handler } from "aws-lambda";
import { provisioner } from "./provision";

const jobDynamodbTableArn = parse(process.env.JOB_DYNAMODB_TABLE_ARN!);

const runnerDynamodbTableArn = parse(process.env.RUNNER_DYNAMODB_TABLE_ARN!);

const ec2InstanceTag = process.env.EC2_INSTANCE_TAG!;

const ec2LaunchTemplateArn = parse(process.env.EC2_LAUNCH_TEMPLATE_ARN!);

const ec2LaunchTemplateVersion = process.env.EC2_LAUNCH_TEMPLATE_VERSION!;

const githubOrg = process.env.GITHUB_ORG!;

const githubRepo = process.env.GITHUB_REPO || undefined;

const githubTokenParam = parse(process.env.GITHUB_TOKEN_PARAM!);

const idleTimeout = +process.env.IDLE_TIMEOUT_S! * 1000;

const maxRunners = +process.env.MAX_RUNNERS!;

const runnerGroup = process.env.RUNNER_GROUP!;

const runnerLabels = new Set(process.env.RUNNER_LABELS!.split(","));

const sqsQueueArn = parse(process.env.SQS_QUEUE_ARN!);

const ssmClient = new SSMClient({ region: githubTokenParam.region });

const githubToken = (async () => {
  const result = await ssmClient.send(
    new GetParameterCommand({
      Name: githubTokenParam.resource.slice("parameter".length),
      WithDecryption: true,
    }),
  );
  return result.Parameter!.Value!;
})();

const provisioner_ = (async () =>
  provisioner({
    jobDynamodbTableArn,
    runnerDynamodbTableArn,
    instanceTag: ec2InstanceTag,
    launchTemplate: {
      arn: ec2LaunchTemplateArn,
      version: ec2LaunchTemplateVersion,
    },
    githubOrg,
    idleTimeout,
    githubRepo,
    githubToken: await githubToken,
    githubTokenName: githubTokenParam.resource.slice("parameter".length),
    maxRunnerCount: maxRunners,
    queueArn: sqsQueueArn,
    runnerGroup,
    runnerLabels,
  }))();

export const handler: Handler = async () => {
  await (
    await provisioner_
  )();
};
