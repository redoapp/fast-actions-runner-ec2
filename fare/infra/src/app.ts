import { artifactParams } from "@redotech/cdk-util/artifact";
import { iamPolicyName } from "@redotech/cdk-util/iam";
import { getName } from "@redotech/cdk-util/name";
import {
  CfnDeployment,
  CfnMethod,
  CfnResource,
  CfnRestApi,
  CfnStage,
} from "aws-cdk-lib/aws-apigateway";
import { CfnTable } from "aws-cdk-lib/aws-dynamodb";
import { CfnRule } from "aws-cdk-lib/aws-events";
import { CfnRole, CfnRolePolicy } from "aws-cdk-lib/aws-iam";
import {
  CfnEventSourceMapping,
  CfnFunction,
  CfnPermission,
  CfnUrl,
} from "aws-cdk-lib/aws-lambda";
import { CfnQueue } from "aws-cdk-lib/aws-sqs";
import { Aws, CfnOutput, CustomResource, Stack } from "aws-cdk-lib/core";
import { Construct } from "constructs";
import { digestKey } from "./common";

export function appTemplate(stack: Stack) {
  const { artifactS3Bucket, artifactS3KeyPrefix } = artifactParams(stack, {
    includeRegion: false,
  });

  const { provisionerFunction, role, setupUrlFunction } = appStack(stack, {
    artifactS3Bucket,
    artifactS3KeyPrefix,
  });

  new CfnOutput(stack, "ProvisionerFunctionArn", {
    description: "ARN of provisioners function",
    exportName: `${Aws.STACK_NAME}:ProvisionerFunctionArn`,
    value: provisionerFunction.attrArn,
  });

  new CfnOutput(stack, "RoleArn", {
    description: "Role ARN",
    exportName: `${Aws.STACK_NAME}:RoleArn`,
    value: role.attrArn,
  });

  new CfnOutput(stack, "SetupUrlFunctionArn", {
    description: "Lambda function ARN to provide setup URL",
    value: setupUrlFunction.attrArn,
  }).node.metadata;
}

export function appStack(
  scope: Construct,
  {
    artifactS3KeyPrefix,
    artifactS3Bucket,
  }: { artifactS3KeyPrefix: string; artifactS3Bucket: string },
) {
  const secretName = `/${Aws.STACK_NAME}/Secret`;
  const githubAppIdName = `/${Aws.STACK_NAME}/GithubAppId`;
  const githubPrivateKeyName = `/${Aws.STACK_NAME}/GithubPrivateKey`;
  const webhookSecretName = `/${Aws.STACK_NAME}/WebhookSecret`;

  const role = new CfnRole(scope, "Role", {
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
    ],
    tags: [{ key: "Name", value: getName(scope).toString() }],
  });

  secretStack(new Construct(scope, "Secret"), {
    artifactS3Bucket,
    artifactS3KeyPrefix,
    role,
    secretName,
  });

  const { jobTable, provisionerTable, instanceTable } = dbStack(
    new Construct(scope, "Db"),
    { role },
  );

  const { api: runnerCreateApi } = runnerCreateStack(
    new Construct(scope, "RunnerCreate"),
    {
      artifactS3Bucket,
      artifactS3KeyPrefix,
      role,
      githubAppIdName,
      githubPrivateKeyName,
      provisionerTable,
      instanceTable,
    },
  );

  const { queue: provisionQueue } = provisionStack(
    new Construct(scope, "Provision"),
    {
      artifactS3Bucket,
      artifactS3KeyPrefix,
      githubAppIdName,
      githubPrivateKeyName,
      jobTable,
      instanceTable,
      role,
      runnerCreateApi,
      provisionerTable,
    },
  );

  provisionerSyncStack(new Construct(scope, "ProvisionerSync"), {
    artifactS3Bucket,
    artifactS3KeyPrefix,
    githubAppIdName,
    githubPrivateKeyName,
    instanceTable,
    provisionerTable,
    provisionQueue,
    role,
  });

  const { function: provisionerFunction } = provisionerStack(
    new Construct(scope, "Provisioner"),
    { artifactS3Bucket, artifactS3KeyPrefix, provisionerTable },
  );

  const { url: webhookUrl } = webhookStack(new Construct(scope, "Webhook"), {
    artifactS3Bucket,
    artifactS3KeyPrefix,
    githubAppIdName,
    githubPrivateKeyName,
    instanceTable,
    jobTable,
    provisionQueue,
    provisionerTable,
    role,
    webhookSecretName,
  });

  const { setupUrlFunction } = githubAppStack(
    new Construct(scope, "GithubApp"),
    {
      artifactS3Bucket,
      artifactS3KeyPrefix,
      githubAppIdName,
      githubPrivateKeyName,
      role,
      secretName,
      webhookSecretName,
      webhookUrl,
    },
  );

  return { provisionerFunction, role, setupUrlFunction };
}

function provisionerStack(
  scope: Construct,
  {
    artifactS3Bucket,
    artifactS3KeyPrefix,
    provisionerTable,
  }: {
    artifactS3KeyPrefix: string;
    artifactS3Bucket: string;
    provisionerTable: CfnTable;
  },
) {
  const fareCfResourceFunctionDigest = digestKey(
    "redotech_fast_actions_runner_ec2/fare/infra/fare_cf_resource_function_digest.digest",
  );

  const role = new CfnRole(scope, "Role", {
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
    ],
    tags: [{ key: "Name", value: getName(scope).toString() }],
  });

  const function_ = new CfnFunction(scope, "Function", {
    code: {
      s3Bucket: artifactS3Bucket,
      s3Key: `${artifactS3KeyPrefix}fare-cf-resource-${fareCfResourceFunctionDigest}.zip`,
    },
    environment: {
      variables: {
        PROVISIONER_TABLE_NAME: provisionerTable.ref,
        NODE_OPTIONS: "--enable-source-maps",
      },
    },
    handler:
      "redotech_fast_actions_runner_ec2/fare/cf-resource/lib/provisioner.handler",
    memorySize: 256,
    role: role.attrArn,
    runtime: "nodejs20.x",
    tags: [{ key: "Name", value: getName(scope).toString() }],
    timeout: Temporal.Duration.from({ seconds: 10 }).total("seconds"),
  });

  new CfnRolePolicy(scope, "Policy", {
    policyDocument: {
      Statement: [
        {
          Action: "dynamodb:*Item",
          Effect: "Allow",
          Resource: provisionerTable.attrArn,
        },
      ],
      Version: "2012-10-17",
    },
    policyName: iamPolicyName(getName(scope)),
    roleName: role.ref,
  });

  return { function: function_ };
}

function githubAppStack(
  scope: Construct,
  {
    artifactS3KeyPrefix,
    artifactS3Bucket,
    githubAppIdName,
    githubPrivateKeyName,
    role,
    secretName,
    webhookSecretName,
    webhookUrl,
  }: {
    artifactS3KeyPrefix: string;
    artifactS3Bucket: string;
    githubAppIdName: string;
    githubPrivateKeyName: string;
    role: CfnRole;
    secretName: string;
    webhookSecretName: string;
    webhookUrl: CfnUrl;
  },
) {
  const callbackPolicy = new CfnRolePolicy(scope, "CallbackPolicy", {
    policyDocument: {
      Statement: [
        {
          Action: "ssm:GetParameter*",
          Effect: "Allow",
          Resource: `arn:${Aws.PARTITION}:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter${secretName}`,
        },
        {
          Action: ["ssm:GetParameter*", "ssm:PutParameter"],
          Effect: "Allow",
          Resource: [
            `arn:${Aws.PARTITION}:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter${githubAppIdName}`,
            `arn:${Aws.PARTITION}:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter${githubPrivateKeyName}`,
            `arn:${Aws.PARTITION}:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter${webhookSecretName}`,
          ],
        },
      ],
      Version: "2012-10-17",
    },
    policyName: iamPolicyName(getName(scope).child("Callback")),
    roleName: role.ref,
  });

  const functionDigest = digestKey(
    "redotech_fast_actions_runner_ec2/fare/infra/fare_app_function_digest.digest",
  );

  const callbackFunction = new CfnFunction(scope, "Callback", {
    code: {
      s3Bucket: artifactS3Bucket,
      s3Key: `${artifactS3KeyPrefix}fare-app-${functionDigest}.zip`,
    },
    environment: {
      variables: {
        APP_NAME: Aws.STACK_NAME,
        GITHUB_APP_ID_NAME: githubAppIdName,
        GITHUB_PRIVATE_KEY_NAME: githubPrivateKeyName,
        LAMBDAINIT_HANDLER:
          "redotech_fast_actions_runner_ec2/fare/app/lib/callback.handler",
        NODE_OPTIONS: "--enable-source-maps",
        SECRET_SSM: secretName,
        WEBHOOK_SECRET_NAME: webhookSecretName,
      },
    },
    handler: "redotech_fast_actions_runner_ec2/aws/function/lib/init.handler",
    memorySize: 256,
    role: role.attrArn,
    runtime: "nodejs20.x",
    tags: [{ key: "Name", value: getName(scope).child("Callback").toString() }],
    timeout: Temporal.Duration.from({ seconds: 10 }).total("seconds"),
  });
  callbackFunction.addDependency(callbackPolicy);

  const callbackUrl = new CfnUrl(scope, "CallbackUrl", {
    authType: "NONE",
    targetFunctionArn: callbackFunction.ref,
  });

  new CfnPermission(scope, "CallbackUrlPermission", {
    action: "lambda:InvokeFunctionUrl",
    functionName: callbackFunction.ref,
    functionUrlAuthType: "NONE",
    principal: "*",
  });

  const manifestFunction = new CfnFunction(scope, "ManifestFunction", {
    code: {
      s3Bucket: artifactS3Bucket,
      s3Key: `${artifactS3KeyPrefix}fare-app-${functionDigest}.zip`,
    },
    handler: "redotech_fast_actions_runner_ec2/fare/app/lib/manifest.handler",
    environment: {
      variables: {
        APP_NAME: Aws.STACK_NAME,
        CALLBACK_URL: callbackUrl.attrFunctionUrl,
        NODE_OPTIONS: "--enable-source-maps",
        WEBHOOK_URL: webhookUrl.attrFunctionUrl,
      },
    },
    memorySize: 256,
    role: role.attrArn,
    runtime: "nodejs20.x",
    tags: [{ key: "Name", value: getName(scope).child("Manifest").toString() }],
    timeout: Temporal.Duration.from({ seconds: 10 }).total("seconds"),
  });

  const manifestUrl = new CfnUrl(scope, "ManifestUrl", {
    authType: "NONE",
    targetFunctionArn: manifestFunction.ref,
  });

  new CfnPermission(scope, "ManifestUrlPermission", {
    action: "lambda:InvokeFunctionUrl",
    functionName: manifestFunction.ref,
    functionUrlAuthType: manifestUrl.authType,
    principal: "*",
  });

  const urlPolicy = new CfnRolePolicy(scope, "UrlPolicy", {
    policyDocument: {
      Statement: [
        {
          Action: "ssm:GetParameter*",
          Effect: "Allow",
          Resource: `arn:${Aws.PARTITION}:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter${secretName}`,
        },
      ],
      Version: "2012-10-17",
    },
    policyName: iamPolicyName(getName(scope).child("Url")),
    roleName: role.ref,
  });

  const urlFunction = new CfnFunction(scope, "UrlFunction", {
    code: {
      s3Bucket: artifactS3Bucket,
      s3Key: `${artifactS3KeyPrefix}fare-app-${functionDigest}.zip`,
    },
    environment: {
      variables: {
        LAMBDAINIT_HANDLER:
          "redotech_fast_actions_runner_ec2/fare/app/lib/url.handler",
        MANIFEST_URL: manifestUrl.attrFunctionUrl,
        NODE_OPTIONS: "--enable-source-maps",
        SECRET_SSM: secretName,
      },
    },
    handler: "redotech_fast_actions_runner_ec2/aws/function/lib/init.handler",
    memorySize: 256,
    role: role.attrArn,
    runtime: "nodejs20.x",
    tags: [{ key: "Name", value: getName(scope).child("Url").toString() }],
    timeout: Temporal.Duration.from({ seconds: 10 }).total("seconds"),
  });
  urlFunction.addDependency(urlPolicy);

  return { setupUrlFunction: urlFunction };
}

function secretStack(
  scope: Construct,
  {
    artifactS3Bucket,
    artifactS3KeyPrefix,
    role,
    secretName,
  }: {
    artifactS3KeyPrefix: string;
    artifactS3Bucket: string;
    role: CfnRole;
    secretName: string;
  },
) {
  const cfResourceFunctionDigest = digestKey(
    "redotech_fast_actions_runner_ec2/fare/infra/aws_cf_resource_function_digest.digest",
  );

  const policy = new CfnRolePolicy(scope, "Policy", {
    policyDocument: {
      Statement: [
        {
          Action: ["ssm:DeleteParameter", "ssm:PutParameter"],
          Effect: "Allow",
          Resource: `arn:aws:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter${secretName}`,
        },
      ],
      Version: "2012-10-17",
    },
    policyName: iamPolicyName(getName(scope)),
    roleName: role.ref,
  });

  const function_ = new CfnFunction(scope, "Function", {
    code: {
      s3Bucket: artifactS3Bucket,
      s3Key: `${artifactS3KeyPrefix}cf-resource-${cfResourceFunctionDigest}.zip`,
    },
    environment: {
      variables: {
        NODE_OPTIONS: "--enable-source-maps",
      },
    },
    handler:
      "redotech_fast_actions_runner_ec2/aws/cf-resource/lib/secret-lambda.handler",
    memorySize: 256,
    role: role.attrArn,
    runtime: "nodejs20.x",
    tags: [{ key: "Name", value: getName(scope).toString() }],
    timeout: 10,
  });
  function_.addDependency(policy);

  new CustomResource(scope, "Parameter", {
    resourceType: "Custom::Secret",
    serviceToken: function_.attrArn,
    properties: { Name: secretName, Size: 32 },
  });
}

function provisionStack(
  scope: Construct,
  {
    artifactS3Bucket,
    artifactS3KeyPrefix,
    githubAppIdName,
    githubPrivateKeyName,
    provisionerTable,
    instanceTable,
    jobTable,
    role,
    runnerCreateApi,
  }: {
    artifactS3KeyPrefix: string;
    artifactS3Bucket: string;
    githubAppIdName: string;
    githubPrivateKeyName: string;
    jobTable: CfnTable;
    provisionerTable: CfnTable;
    instanceTable: CfnTable;
    role: CfnRole;
    runnerCreateApi: CfnRestApi;
  },
) {
  const functionDigest = digestKey(
    "redotech_fast_actions_runner_ec2/fare/infra/fare_provision_function_digest.digest",
  );

  const queue = new CfnQueue(scope, "ProvisionQueue", {
    deduplicationScope: "messageGroup",
    fifoQueue: true,
    fifoThroughputLimit: "perMessageGroupId",
    tags: [{ key: "Name", value: getName(scope).toString() }],
  });

  const policy = new CfnRolePolicy(scope, "Policy", {
    policyDocument: {
      Statement: [
        {
          Action: [
            "sqs:*Message",
            "sqs:ChangeMessageVisibility",
            "sqs:GetQueueAttributes",
          ],
          Effect: "Allow",
          Resource: queue.attrArn,
        },
        {
          Action: "ssm:GetParameter*",
          Effect: "Allow",
          Resource: [
            `arn:${Aws.PARTITION}:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter${githubAppIdName}`,
            `arn:${Aws.PARTITION}:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter${githubPrivateKeyName}`,
          ],
        },
      ],
      Version: "2012-10-17",
    },
    policyName: iamPolicyName(getName(scope)),
    roleName: role.ref,
  });

  const function_ = new CfnFunction(scope, "Function", {
    code: {
      s3Bucket: artifactS3Bucket,
      s3Key: `${artifactS3KeyPrefix}fare-provision-${functionDigest}.zip`,
    },
    environment: {
      variables: {
        GITHUB_APP_ID_SSM: githubAppIdName,
        GITHUB_PRIVATE_KEY_SSM: githubPrivateKeyName,
        INSTANCE_TABLE_NAME: instanceTable.ref,
        JOB_TABLE_NAME: jobTable.ref,
        LAMBDAINIT_HANDLER:
          "redotech_fast_actions_runner_ec2/fare/provision/lib/provision.handler",
        NODE_OPTIONS: "--enable-source-maps",
        PROVISIONER_TABLE_NAME: provisionerTable.ref,
        RUNNER_CREATE_URL: `https://${runnerCreateApi.attrRestApiId}.execute-api.${Aws.REGION}.${Aws.URL_SUFFIX}/main/`,
      },
    },
    handler: "redotech_fast_actions_runner_ec2/aws/function/lib/init.handler",
    memorySize: 256,
    role: role.attrArn,
    runtime: "nodejs20.x",
    tags: [{ key: "Name", value: getName(scope).toString() }],
    timeout: Temporal.Duration.from({ seconds: 15 }).total("seconds"),
  });
  function_.addDependency(policy);

  new CfnEventSourceMapping(scope, "FunctionQueueSource", {
    batchSize: 1,
    functionName: function_.ref,
    eventSourceArn: queue.attrArn,
  });

  return { queue };
}

function provisionerSyncStack(
  scope: Construct,
  {
    artifactS3Bucket,
    artifactS3KeyPrefix,
    githubAppIdName,
    githubPrivateKeyName,
    instanceTable,
    provisionQueue,
    provisionerTable,
    role,
  }: {
    artifactS3Bucket: string;
    artifactS3KeyPrefix: string;
    githubAppIdName: string;
    githubPrivateKeyName: string;
    instanceTable: CfnTable;
    provisionQueue: CfnQueue;
    provisionerTable: CfnTable;
    role: CfnRole;
  },
) {
  const functionDigest = digestKey(
    "redotech_fast_actions_runner_ec2/fare/infra/fare_provision_function_digest.digest",
  );

  const policy = new CfnRolePolicy(scope, "ProvisionerSyncPolicy", {
    policyDocument: {
      Statement: [
        {
          Action: ["sqs:GetQueueAttributes", "sqs:SendMessage"],
          Effect: "Allow",
          Resource: provisionQueue.attrArn,
        },
        {
          Action: "ssm:GetParameter*",
          Effect: "Allow",
          Resource: [
            `arn:${Aws.PARTITION}:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter${githubAppIdName}`,
            `arn:${Aws.PARTITION}:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter${githubPrivateKeyName}`,
          ],
        },
      ],
      Version: "2012-10-17",
    },
    policyName: iamPolicyName(getName(scope).child("ProvisionerSync")),
    roleName: role.ref,
  });

  const function_ = new CfnFunction(scope, "Function", {
    code: {
      s3Bucket: artifactS3Bucket,
      s3Key: `${artifactS3KeyPrefix}fare-provision-${functionDigest}.zip`,
    },
    environment: {
      variables: {
        GITHUB_APP_ID_SSM: githubAppIdName,
        GITHUB_PRIVATE_KEY_SSM: githubPrivateKeyName,
        LAMBDAINIT_HANDLER:
          "redotech_fast_actions_runner_ec2/fare/provision/lib/provisioner-sync.handler",
        INSTANCE_TABLE_NAME: instanceTable.ref,
        NODE_OPTIONS: "--enable-source-maps",
        PROVISION_QUEUE_URL: provisionQueue.attrQueueUrl,
        PROVISIONER_TABLE_NAME: provisionerTable.ref,
      },
    },
    handler: "redotech_fast_actions_runner_ec2/aws/function/lib/init.handler",
    memorySize: 256,
    role: role.attrArn,
    runtime: "nodejs20.x",
    tags: [
      {
        key: "Name",
        value: getName(scope).toString(),
      },
    ],
    timeout: Temporal.Duration.from({ seconds: 60 }).total("seconds"),
  });
  function_.addDependency(policy);

  const allPolicy = new CfnRolePolicy(scope, "AllPolicy", {
    policyDocument: {
      Statement: [
        {
          Action: "lambda:InvokeFunction",
          Effect: "Allow",
          Resource: function_.attrArn,
        },
      ],
      Version: "2012-10-17",
    },
    policyName: iamPolicyName(getName(scope).child("All")),
    roleName: role.ref,
  });

  const allFunction = new CfnFunction(scope, "AllFunction", {
    code: {
      s3Bucket: artifactS3Bucket,
      s3Key: `${artifactS3KeyPrefix}fare-provision-${functionDigest}.zip`,
    },
    environment: {
      variables: {
        NODE_OPTIONS: "--enable-source-maps",
        PROVISIONER_SYNC_NAME: function_.ref,
        PROVISIONER_TABLE_NAME: provisionerTable.ref,
      },
    },
    handler:
      "redotech_fast_actions_runner_ec2/fare/provision/lib/provisioner-sync-all.handler",
    memorySize: 256,
    role: role.attrArn,
    runtime: "nodejs20.x",
    tags: [
      {
        key: "Name",
        value: getName(scope).child("ProvisionerSyncAll").toString(),
      },
    ],
    timeout: Temporal.Duration.from({ seconds: 15 }).total("seconds"),
  });
  allFunction.addDependency(allPolicy);

  const rule = new CfnRule(scope, "Rule", {
    scheduleExpression: "rate(2 minutes)",
    state: "ENABLED",
    targets: [{ id: "Provision", arn: allFunction.attrArn }],
  });

  new CfnPermission(scope, "RulePermission", {
    action: "lambda:InvokeFunction",
    functionName: allFunction.ref,
    principal: "events.amazonaws.com",
    sourceArn: rule.attrArn,
  });
}

function runnerCreateStack(
  scope: Construct,
  {
    artifactS3Bucket,
    artifactS3KeyPrefix,
    githubAppIdName,
    githubPrivateKeyName,
    provisionerTable,
    instanceTable,
    role,
  }: {
    artifactS3KeyPrefix: string;
    artifactS3Bucket: string;
    githubAppIdName: string;
    githubPrivateKeyName: string;
    provisionerTable: CfnTable;
    instanceTable: CfnTable;
    role: CfnRole;
  },
) {
  const functionDigest = digestKey(
    "redotech_fast_actions_runner_ec2/fare/infra/fare_provision_function_digest.digest",
  );

  const function_ = new CfnFunction(scope, "Function", {
    code: {
      s3Bucket: artifactS3Bucket,
      s3Key: `${artifactS3KeyPrefix}fare-provision-${functionDigest}.zip`,
    },
    description: getName(scope).toString(),
    environment: {
      variables: {
        GITHUB_APP_ID_SSM: githubAppIdName,
        GITHUB_PRIVATE_KEY_SSM: githubPrivateKeyName,
        LAMBDAINIT_HANDLER:
          "redotech_fast_actions_runner_ec2/fare/provision/lib/runner-create.handler",
        NODE_OPTIONS: "--enable-source-maps",
        PROVISION_TABLE_NAME: provisionerTable.ref,
        INSTANCE_TABLE_NAME: instanceTable.ref,
      },
    },
    handler: "redotech_fast_actions_runner_ec2/aws/function/lib/init.handler",
    memorySize: 256,
    role: role.attrArn,
    runtime: "nodejs20.x",
    tags: [{ key: "Name", value: getName(scope).toString() }],
    timeout: Temporal.Duration.from({ seconds: 10 }).total("seconds"),
  });

  // HTTP APIs do not support resource policies
  const api = new CfnRestApi(scope, "Api", {
    name: getName(scope).toString(),
    description: getName(scope).toString(),
    tags: [{ key: "Name", value: getName(scope).toString() }],
    policy: {
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: "Allow",
          Principal: { AWS: "*" },
          Resource: "execute-api:/*/POST/${ec2:SourceInstanceARN}",
        },
      ],
      Version: "2012-10-17",
    },
  });

  const resource = new CfnResource(scope, "Resource", {
    parentId: api.attrRootResourceId,
    pathPart: "{instanceArn}",
    restApiId: api.attrRestApiId,
  });

  const method = new CfnMethod(scope, "Method", {
    authorizationType: "AWS_IAM",
    httpMethod: "POST",
    integration: {
      integrationHttpMethod: "POST",
      type: "AWS_PROXY",
      uri: `arn:aws:apigateway:${Aws.REGION}:lambda:path/2015-03-31/functions/${function_.attrArn}/invocations`,
    },
    operationName: "Runner create",
    restApiId: api.ref,
    resourceId: resource.attrResourceId,
  });

  const deployment = new CfnDeployment(scope, "Deployment", {
    restApiId: api.ref,
    description: "2",
  });
  deployment.addDependency(method);

  new CfnStage(scope, "Stage", {
    deploymentId: deployment.ref,
    description: "Main",
    restApiId: api.ref,
    stageName: "main",
    tags: [{ key: "Name", value: "Main" }],
  });

  new CfnPermission(scope, "Permission", {
    action: "lambda:InvokeFunction",
    functionName: function_.ref,
    principal: "apigateway.amazonaws.com",
    sourceArn: `arn:aws:execute-api:${Aws.REGION}:${Aws.ACCOUNT_ID}:${api.ref}/*/*/*`,
  });

  return { api };
}

function dbStack(scope: Construct, { role }: { role: CfnRole }) {
  const jobTable = new CfnTable(scope, "JobTable", {
    attributeDefinitions: [
      { attributeName: "Id", attributeType: "N" },
      { attributeName: "InstallationId", attributeType: "N" },
      { attributeName: "ProvisionerId", attributeType: "S" },
    ],
    billingMode: "PAY_PER_REQUEST",
    globalSecondaryIndexes: [
      {
        indexName: "InstallationId",
        keySchema: [{ attributeName: "InstallationId", keyType: "HASH" }],
        projection: { projectionType: "ALL" },
      },
      {
        indexName: "ProvisionerId",
        keySchema: [{ attributeName: "ProvisionerId", keyType: "HASH" }],
        projection: { projectionType: "ALL" },
      },
    ],
    keySchema: [{ attributeName: "Id", keyType: "HASH" }],
    tags: [{ key: "Name", value: getName(scope).toString() }],
    timeToLiveSpecification: { enabled: true, attributeName: "Expiration" },
  });

  const provisionerTable = new CfnTable(scope, "ProvisionerTable", {
    attributeDefinitions: [
      { attributeName: "Id", attributeType: "S" },
      { attributeName: "Owner", attributeType: "S" },
    ],
    billingMode: "PAY_PER_REQUEST",
    globalSecondaryIndexes: [
      {
        indexName: "Owner",
        keySchema: [{ attributeName: "Owner", keyType: "HASH" }],
        projection: { projectionType: "ALL" },
      },
    ],
    keySchema: [{ attributeName: "Id", keyType: "HASH" }],
    tags: [{ key: "Name", value: getName(scope).toString() }],
    timeToLiveSpecification: { enabled: true, attributeName: "Expiration" },
  });

  const instanceTable = new CfnTable(scope, "InstanceTable", {
    attributeDefinitions: [
      { attributeName: "Id", attributeType: "S" },
      { attributeName: "ProvisionerId", attributeType: "S" },
    ],
    billingMode: "PAY_PER_REQUEST",
    keySchema: [{ attributeName: "Id", keyType: "HASH" }],
    globalSecondaryIndexes: [
      {
        indexName: "ProvisionerId",
        keySchema: [{ attributeName: "ProvisionerId", keyType: "HASH" }],
        projection: { projectionType: "ALL" },
      },
    ],
    tags: [{ key: "Name", value: getName(scope).toString() }],
    timeToLiveSpecification: { enabled: true, attributeName: "Expiration" },
  });

  new CfnRolePolicy(scope, "JobTablePolicy", {
    policyName: iamPolicyName(getName(scope)),
    roleName: role.ref,
    policyDocument: {
      Statement: [
        {
          Action: ["dynamodb:*Item", "dynamodb:Query", "dynamodb:Scan"],
          Effect: "Allow",
          Resource: [
            jobTable.attrArn,
            provisionerTable.attrArn,
            instanceTable.attrArn,
          ],
        },
      ],
      Version: "2012-10-17",
    },
  });

  return { jobTable, provisionerTable, instanceTable };
}

function webhookStack(
  scope: Construct,
  {
    artifactS3Bucket,
    artifactS3KeyPrefix,
    githubAppIdName,
    githubPrivateKeyName,
    instanceTable,
    jobTable,
    provisionQueue,
    provisionerTable,
    role,
    webhookSecretName,
  }: {
    artifactS3KeyPrefix: string;
    artifactS3Bucket: string;
    githubAppIdName: string;
    githubPrivateKeyName: string;
    instanceTable: CfnTable;
    jobTable: CfnTable;
    provisionQueue: CfnQueue;
    provisionerTable: CfnTable;
    role: CfnRole;
    webhookSecretName: string;
  },
) {
  const policy = new CfnRolePolicy(scope, "Policy", {
    policyName: iamPolicyName(getName(scope)),
    policyDocument: {
      Statement: [
        {
          Action: ["dynamodb:*Item", "dynamodb:Query", "dynamodb:Scan"],
          Effect: "Allow",
          Resource: [
            instanceTable.attrArn,
            `${instanceTable.attrArn}/index/*`,
            jobTable.attrArn,
            `${jobTable.attrArn}/index/*`,
            provisionerTable.attrArn,
            `${provisionerTable.attrArn}/index/*`,
          ],
        },
        {
          Action: ["sqs:SendMessage*"],
          Effect: "Allow",
          Resource: provisionQueue.attrArn,
        },
        {
          Action: "ssm:GetParameter*",
          Effect: "Allow",
          Resource: [
            `arn:${Aws.PARTITION}:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter${githubAppIdName}`,
            `arn:${Aws.PARTITION}:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter${githubPrivateKeyName}`,
            `arn:${Aws.PARTITION}:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter${webhookSecretName}`,
          ],
        },
      ],
      Version: "2012-10-17",
    },
    roleName: role.ref,
  });

  const functionDigest = digestKey(
    "redotech_fast_actions_runner_ec2/fare/infra/fare_provision_function_digest.digest",
  );

  const function_ = new CfnFunction(scope, "Function", {
    code: {
      s3Bucket: artifactS3Bucket,
      s3Key: `${artifactS3KeyPrefix}fare-provision-${functionDigest}.zip`,
    },
    environment: {
      variables: {
        GITHUB_APP_ID_SSM: githubAppIdName,
        GITHUB_PRIVATE_KEY_SSM: githubPrivateKeyName,
        INSTANCE_TABLE_NAME: instanceTable.ref,
        JOB_TABLE_NAME: jobTable.ref,
        LAMBDAINIT_HANDLER:
          "redotech_fast_actions_runner_ec2/fare/provision/lib/webhook.handler",
        NODE_OPTIONS: "--enable-source-maps",
        PROVISION_QUEUE_URL: provisionQueue.ref,
        PROVISIONER_TABLE_NAME: provisionerTable.ref,
        WEBHOOK_SECRET_SSM: webhookSecretName,
      },
    },
    handler: "redotech_fast_actions_runner_ec2/aws/function/lib/init.handler",
    memorySize: 256,
    role: role.attrArn,
    runtime: "nodejs20.x",
    tags: [{ key: "Name", value: getName(scope).toString() }],
    timeout: Temporal.Duration.from({ seconds: 10 }).total("seconds"),
  });
  function_.addDependency(policy);

  const url = new CfnUrl(scope, "Url", {
    authType: "NONE",
    targetFunctionArn: function_.ref,
  });

  new CfnPermission(scope, "UrlPermission", {
    action: "lambda:InvokeFunctionUrl",
    functionName: function_.ref,
    functionUrlAuthType: url.authType,
    principal: "*",
  });

  return { url };
}
