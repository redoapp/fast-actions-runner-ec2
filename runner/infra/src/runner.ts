import { artifactUrl } from "@redotech/cdk-util/artifact";
import { Context } from "@redotech/cdk-util/context";
import { iamPolicyName } from "@redotech/cdk-util/iam";
import { provisionInfra } from "@redotech/fast-actions-ec2-runner-provision-infra";
import { webhookInfra } from "@redotech/fast-actions-ec2-runner-webhook-infra";
import { CfnTable } from "aws-cdk-lib/aws-dynamodb";
import { CfnRule } from "aws-cdk-lib/aws-events";
import { CfnManagedPolicy, CfnRole, CfnRolePolicy } from "aws-cdk-lib/aws-iam";
import {
  CfnEventSourceMapping,
  CfnFunction,
  CfnPermission,
  CfnUrl,
} from "aws-cdk-lib/aws-lambda";
import { CfnQueue } from "aws-cdk-lib/aws-sqs";
import { Aws, CfnOutput, CfnParameter, Fn } from "aws-cdk-lib/core";

export const runnerTemplateUrl = artifactUrl("runner.template.yaml");

export interface RunnerParams {
  LaunchTemplate: string;
  LaunchTemplateVersion: string;
  GithubOrg: string;
  GithubRepo: string;
  GithubToken: string;
  GithubWebhookSecret: string;
  InstanceRole: string;
  RunnerCountMax?: string;
  KeepaliveS?: string;
  QueueTimeoutS?: number;
  RunnerGroup: string;
  RunnerLabels: string;
}

export function runnerStack(context: Context) {
  const githubOrgParam = new CfnParameter(context.scope, "GithubOrg", {
    // https://github.com/dead-claudia/github-limits
    allowedPattern: "^([a-zA-Z0-9]+-?)*$",
    description: "GitHub organization",
    minLength: 1,
    maxLength: 39,
  });
  const githubOrg = githubOrgParam.valueAsString;

  const githubRepoParam = new CfnParameter(context.scope, "GithubRepo", {
    // https://github.com/dead-claudia/github-limits
    allowedPattern: "^([a-zA-Z0-9]+-?)*$",
    description: "GitHub repository",
    maxLength: 39,
  });
  const githubRepo = githubRepoParam.valueAsString;

  const githubTokenParam = new CfnParameter(context.scope, "GithubToken", {
    type: "AWS::SSM::Parameter::Name",
  });
  const githubToken = githubTokenParam.valueAsString;

  const githubWebhookSecretParam = new CfnParameter(
    context.scope,
    "GithubWebhookSecret",
    { type: "AWS::SSM::Parameter::Name" },
  );
  const githubWebhookSecret = githubWebhookSecretParam.valueAsString;

  const launchTemplateParam = new CfnParameter(
    context.scope,
    "LaunchTemplate",
    {
      description: "Launch template ARN",
      // allowedPattern: launchTemplateArnPattern,
      minLength: 1,
    },
  );
  const launchTemplate = launchTemplateParam.valueAsString;

  const launchTemplateVersionParam = new CfnParameter(
    context.scope,
    "LaunchTemplateVersion",
    {
      description: "Launch template version",
      minLength: 1,
    },
  );
  const launchTemplateVersion = launchTemplateVersionParam.valueAsString;

  const maxRunnersParam = new CfnParameter(context.scope, "RunnerCountMax", {
    type: "Number",
    description: "Maximum number of runners, or 0 for unlimited",
    default: 0,
    minValue: 0,
  });
  const maxRunners = maxRunnersParam.valueAsNumber;

  const idleTimeoutSParam = new CfnParameter(context.scope, "IdleTimeoutS", {
    type: "Number",
    description: "Idle timeout in seconds",
    default: 60 * 2,
    minValue: 0,
  });
  const idleTimeoutS = idleTimeoutSParam.valueAsNumber;

  const instanceRoleParam = new CfnParameter(context.scope, "InstanceRole", {
    description: "Instance role",
  });
  const instanceRole = instanceRoleParam.valueAsString;

  const queueTimeoutSParam = new CfnParameter(context.scope, "QueueTimeoutS", {
    type: "Number",
    description: "Queue timeout in seconds",
    default: 60 * 60,
    minValue: 0,
  });
  const queueTimeoutS = queueTimeoutSParam.valueAsNumber;

  const runnerGroupParam = new CfnParameter(context.scope, "RunnerGroup", {
    description: "Runner group",
    minLength: 1,
  });
  const runnerGroup = runnerGroupParam.valueAsString;

  const runnerLabelsParam = new CfnParameter(context.scope, "RunnerLabels", {
    type: "List<String>",
    description: "Labels to apply to the runner",
    minLength: 1,
  });
  const runnerLabels = runnerLabelsParam.valueAsList;

  new CfnRolePolicy(context.scope, "InstancePolicy", {
    policyName: iamPolicyName(context.name.child("Instance")),
    policyDocument: {
      Statement: [
        {
          Action: "ssm:GetParameter*",
          Effect: "Allow",
          Resource: githubTokenParam,
        },
      ],
      Version: "2012-10-17",
    },
    roleName: Fn.select(1, Fn.split("/", instanceRole)),
  });

  const {
    jobTable,
    policy: dbPolicy,
    runnerTable,
  } = dbStack(context.child("Db"));

  const role = new CfnRole(context.scope, "Role", {
    assumeRolePolicyDocument: {
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: { Service: "lambda.amazonaws.com" },
        },
      ],
      Version: "2012-10-17",
    },
    managedPolicyArns: [
      "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
      dbPolicy.attrPolicyArn,
    ],
    tags: [{ key: "Name", value: context.name.toString() }],
  });

  const { function: provisionFunction, queue } = provisionStack(
    context.child("Provision"),
    {
      githubOrg,
      githubRepo,
      githubTokenParam: githubToken,
      idleTimeout: idleTimeoutS * 1000,
      instanceRoleArn: instanceRole,
      jobTable,
      launchTemplate: { arn: launchTemplate, version: launchTemplateVersion },
      maxRunners,
      role,
      runnerGroup,
      runnerLabels,
      runnerTable,
    },
  );

  cronStack(context.child("Cron"), { provisionFunction });

  const { url: webhookUrl } = webhookStack(context.child("Webhook"), {
    githubWebhookSecret,
    jobTable,
    queue,
    queueTimeout: queueTimeoutS * 1000,
    role,
    runnerLabels,
    runnerTable,
  });

  new CfnOutput(context.scope, "WebhookUrl", {
    description: "Webhook URL",
    value: webhookUrl.attrFunctionUrl,
  });
}

function cronStack(
  context: Context,
  { provisionFunction }: { provisionFunction: CfnFunction },
) {
  const rule = new CfnRule(context.scope, "Rule", {
    scheduleExpression: "rate(2 minutes)",
    state: "ENABLED",
    targets: [{ id: "Function", arn: provisionFunction.attrArn }],
  });

  new CfnPermission(context.scope, "Permission", {
    action: "lambda:InvokeFunction",
    functionName: provisionFunction.ref,
    principal: "events.amazonaws.com",
    sourceArn: rule.attrArn,
  });
}

function dbStack(context: Context) {
  const jobTable = new CfnTable(context.scope, "JobTable", {
    billingMode: "PAY_PER_REQUEST",
    attributeDefinitions: [{ attributeName: "Id", attributeType: "N" }],
    keySchema: [{ attributeName: "Id", keyType: "HASH" }],
    tags: [{ key: "Name", value: context.name.toString() }],
    timeToLiveSpecification: { enabled: true, attributeName: "Expiration" },
  });

  const runnerTable = new CfnTable(context.scope, "RunnerTable", {
    billingMode: "PAY_PER_REQUEST",
    attributeDefinitions: [{ attributeName: "Id", attributeType: "N" }],
    keySchema: [{ attributeName: "Id", keyType: "HASH" }],
    tags: [{ key: "Name", value: context.name.toString() }],
    timeToLiveSpecification: { enabled: true, attributeName: "Expiration" },
  });

  const policy = new CfnManagedPolicy(context.scope, "Policy", {
    policyDocument: {
      Statement: [
        {
          Action: "dynamodb:*",
          Effect: "Allow",
          Resource: [jobTable.attrArn, runnerTable.attrArn],
        },
      ],
      Version: "2012-10-17",
    },
  });

  return { jobTable, policy, runnerTable };
}

function provisionStack(
  context: Context,
  {
    githubOrg,
    githubRepo,
    githubTokenParam,
    idleTimeout,
    jobTable,
    instanceRoleArn,
    launchTemplate,
    maxRunners,
    role,
    runnerGroup,
    runnerLabels,
    runnerTable,
  }: {
    githubOrg: string;
    githubRepo: string;
    githubTokenParam: string;
    idleTimeout: number;
    instanceRoleArn: string;
    jobTable: CfnTable;
    launchTemplate: { arn: string; version: string };
    maxRunners: number;
    runnerGroup: string;
    runnerLabels: string[];
    runnerTable: CfnTable;
    role: CfnRole;
  },
) {
  const queue = new CfnQueue(context.scope, "Queue", {
    visibilityTimeout: 60,
    tags: [{ key: "Name", value: context.name.toString() }],
  });

  const { lambdaParams, policyDocument } = provisionInfra({
    jobDynamodbTableArn: jobTable.attrArn,
    runnerDynamodbTableArn: runnerTable.attrArn,
    instanceRoleArn,
    instanceTag: Aws.STACK_NAME,
    launchTemplate,
    githubOrg,
    githubRepo,
    githubTokenParam,
    idleTimeout,
    maxRunners,
    runnerGroup,
    runnerLabels,
    queueArn: queue.attrArn,
  });

  const function_ = new CfnFunction(context.scope, "Function", {
    code: lambdaParams.code,
    handler: lambdaParams.handler,
    role: role.attrArn,
    reservedConcurrentExecutions: 1,
    runtime: lambdaParams.runtime,
    environment: lambdaParams.environment,
    memorySize: 256,
    tags: [{ key: "Name", value: context.name.toString() }],
    timeout: 60,
  });

  new CfnRolePolicy(context.scope, "Policy", {
    policyName: iamPolicyName(context.name),
    roleName: role.ref,
    policyDocument,
  });

  new CfnEventSourceMapping(context.scope, "QueueSource", {
    batchSize: 1,
    enabled: true,
    eventSourceArn: queue.attrArn,
    functionName: function_.ref,
  });

  return { function: function_, queue };
}

function webhookStack(
  context: Context,
  {
    githubWebhookSecret,
    role,
    jobTable,
    runnerTable,
    queueTimeout,
    runnerLabels,
    queue,
  }: {
    githubWebhookSecret: string;
    role: CfnRole;
    jobTable: CfnTable;
    runnerTable: CfnTable;
    queueTimeout: number;
    queue: CfnQueue;
    runnerLabels: string[];
  },
) {
  const { lambdaParams, policyDocument } = webhookInfra({
    jobDynamodbTableArn: jobTable.attrArn,
    runnerDynamodbTableArn: runnerTable.attrArn,
    githubWebhookSecretParam: githubWebhookSecret,
    queueExpiration: queueTimeout,
    runnerLabels,
    sqsQueueArn: queue.attrArn,
  });
  new CfnRolePolicy(context.scope, "Policy", {
    policyName: iamPolicyName(context.name),
    roleName: role.ref,
    policyDocument,
  });

  const function_ = new CfnFunction(context.scope, "Function", {
    code: lambdaParams.code,
    environment: lambdaParams.environment,
    handler: lambdaParams.handler,
    memorySize: 256,
    role: role.attrArn,
    runtime: lambdaParams.runtime,
    tags: [{ key: "Name", value: context.name.toString() }],
    timeout: 10,
  });

  const url = new CfnUrl(context.scope, "Url", {
    authType: "NONE",
    targetFunctionArn: function_.ref,
  });

  new CfnPermission(context.scope, "UrlPermission", {
    action: "lambda:InvokeFunctionUrl",
    functionName: function_.ref,
    functionUrlAuthType: "NONE",
    principal: "*",
  });

  return { queue, url };
}
