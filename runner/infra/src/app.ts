import {
  artifactS3Bucket,
  artifactS3KeyPrefix,
} from "@redotech/cdk-util/artifact";
import { iamPolicyName } from "@redotech/cdk-util/iam";
import { getName } from "@redotech/cdk-util/name";
import {
  CfnApi,
  CfnIntegration,
  CfnRoute,
  CfnStage,
} from "aws-cdk-lib/aws-apigatewayv2";
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
import { Aws, CfnOutput, CustomResource, Stack } from "aws-cdk-lib/core";
import { Construct } from "constructs";

export function appTemplate(stack: Stack) {
  const { instancePolicy, provisionerFunction, role, setupUrlFunction } =
    appStack(stack);

  new CfnOutput(stack, "InstancePolicyArn", {
    description: "Policy ARN for EC2 instances",
    exportName: `${Aws.STACK_NAME}:InstancePolicyArn`,
    value: instancePolicy.ref,
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

export function appStack(scope: Construct) {
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

  secretStack(new Construct(scope, "Secret"), { role, secretName });

  const { jobTable, provisionerTable, instanceTable } = dbStack(
    new Construct(scope, "Db"),
    { role },
  );

  const { instancePolicy } = runnerCreateStack(
    new Construct(scope, "RunnerCreate"),
    {
      role,
      githubAppIdName,
      provisionerTable,
      instanceTable,
    },
  );

  const { queue: provisionQueue } = provisionStack(
    new Construct(scope, "Provision"),
    {
      githubAppIdName,
      githubPrivateKeyName,
      jobTable,
      instanceTable,
      role,
      provisionerTable,
    },
  );

  const { function: provisionerFunction } = provisionerStack(
    new Construct(scope, "Provisioner"),
    { provisionerTable },
  );

  const { url: webhookUrl } = webhookStack(new Construct(scope, "Webhook"), {
    webhookSecretName,
    jobTable,
    provisionQueue,
    role,
    instanceTable,
  });

  const { setupUrlFunction } = githubAppStack(
    new Construct(scope, "GithubApp"),
    {
      githubAppIdName,
      githubPrivateKeyName,
      role,
      secretName,
      webhookSecretName,
      webhookUrl,
    },
  );

  return {
    instancePolicy,
    provisionerFunction,
    role,
    setupUrlFunction,
  };
}

function provisionerStack(
  scope: Construct,
  { provisionerTable }: { provisionerTable: CfnTable },
) {
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
      s3Key: `${artifactS3KeyPrefix}provisioner.zip`,
    },
    environment: {
      variables: {
        PROVISIONER_TABLE_NAME: provisionerTable.ref,
        NODE_OPTIONS: "--enable-source-maps",
      },
    },
    handler:
      "redotech_fast_actions_ec2_runner/runner/cf-resource/lib/provisioner-lambda.handler",
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
    githubAppIdName,
    githubPrivateKeyName,
    role,
    secretName,
    webhookSecretName,
    webhookUrl,
  }: {
    githubAppIdName: string;
    githubPrivateKeyName: string;
    role: CfnRole;
    secretName: string;
    webhookSecretName: string;
    webhookUrl: CfnUrl;
  },
) {
  const callbackFunction = new CfnFunction(scope, "Callback", {
    code: {
      s3Bucket: artifactS3Bucket,
      s3Key: `${artifactS3KeyPrefix}app.zip`,
    },
    handler:
      "redotech_fast_actions_ec2_runner/runner/app/lib/url-lambda.handler",
    environment: {
      variables: {
        APP_NAME: Aws.STACK_NAME,
        GITHUB_APP_ID_NAME: githubAppIdName,
        GITHUB_PRIVATE_KEY_NAME: githubPrivateKeyName,
        NODE_OPTIONS: "--enable-source-maps",
        SECRET_NAME: secretName,
        WEBHOOK_SECRET_NAME: webhookSecretName,
      },
    },
    memorySize: 256,
    role: role.attrArn,
    runtime: "nodejs20.x",
    tags: [{ key: "Name", value: getName(scope).child("Callback").toString() }],
    timeout: Temporal.Duration.from({ seconds: 10 }).total("seconds"),
  });

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
      s3Key: `${artifactS3KeyPrefix}app.zip`,
    },
    handler:
      "redotech_fast_actions_ec2_runner/runner/app/lib/url-lambda.handler",
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
    functionUrlAuthType: "NONE",
    principal: "*",
  });

  const urlFunction = new CfnFunction(scope, "UrlFunction", {
    code: {
      s3Bucket: artifactS3Bucket,
      s3Key: `${artifactS3KeyPrefix}app.zip`,
    },
    environment: {
      variables: {
        MANIFEST_URL: manifestUrl.attrFunctionUrl,
        NODE_OPTIONS: "--enable-source-maps",
        SECRET_NAME: secretName,
      },
    },
    handler:
      "redotech_fast_actions_ec2_runner/runner/app/lib/url-lambda.handler",
    memorySize: 256,
    role: role.attrArn,
    runtime: "nodejs20.x",
    tags: [{ key: "Name", value: getName(scope).child("Url").toString() }],
    timeout: Temporal.Duration.from({ seconds: 10 }).total("seconds"),
  });

  new CfnRolePolicy(scope, "Policy", {
    policyDocument: {
      Statement: [
        {
          Action: ["ssm:GetParameter*", "ssm:PutParameter"],
          Effect: "Allow",
          Resource: [
            `arn:aws:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter${githubAppIdName}`,
            `arn:aws:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter${githubPrivateKeyName}`,
            `arn:aws:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter${webhookSecretName}`,
          ],
        },
      ],
      Version: "2012-10-17",
    },
    policyName: iamPolicyName(getName(scope)),
    roleName: role.ref,
  });

  return { setupUrlFunction: urlFunction };
}

function secretStack(
  scope: Construct,
  { role, secretName }: { role: CfnRole; secretName: string },
) {
  const secretFunction = new CfnFunction(scope, "Function", {
    code: {
      s3Bucket: artifactS3Bucket,
      s3Key: `${artifactS3KeyPrefix}resource.zip`,
    },
    handler:
      "redotech_fast_actions_ec2_runner/runner/resource/lib/secret-lambda.handler",
    memorySize: 256,
    role: role.attrArn,
    runtime: "nodejs20.x",
    tags: [{ key: "Name", value: getName(scope).toString() }],
    timeout: 10,
  });

  new CustomResource(scope, "Parameter", {
    resourceType: "Custom::Secret",
    serviceToken: secretFunction.attrArn,
    properties: { secretName, size: 32 },
  });

  new CfnRolePolicy(scope, "Policy", {
    policyDocument: {
      Statement: [
        {
          Action: ["ssm:GetParameter*", "ssm:PutParameter"],
          Effect: "Allow",
          Resource: `arn:aws:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter${secretName}`,
        },
      ],
      Version: "2012-10-17",
    },
    policyName: iamPolicyName(getName(scope)),
    roleName: role.ref,
  });
}

function provisionStack(
  scope: Construct,
  {
    githubAppIdName,
    githubPrivateKeyName,
    provisionerTable,
    instanceTable,
    jobTable,
    role,
  }: {
    githubAppIdName: string;
    githubPrivateKeyName: string;
    jobTable: CfnTable;
    provisionerTable: CfnTable;
    instanceTable: CfnTable;
    role: CfnRole;
  },
) {
  const queue = new CfnQueue(scope, "ProvisionQueue", {
    fifoQueue: true,
    tags: [{ key: "Name", value: getName(scope).toString() }],
  });

  const function_ = new CfnFunction(scope, "Function", {
    code: {
      s3Bucket: artifactS3Bucket,
      s3Key: `${artifactS3KeyPrefix}provision.zip`,
    },
    environment: {
      variables: {
        GITHUB_APP_ID_NAME: githubAppIdName,
        GITHUB_PRIVATE_KEY_NAME: githubPrivateKeyName,
        JOB_TABLE_NAME: jobTable.ref,
        NODE_OPTIONS: "--enable-source-maps",
        PROVISIONER_TABLE_NAME: provisionerTable.ref,
        INSTANCE_TABLE_NAME: instanceTable.ref,
      },
    },
    handler:
      "redotech_fast_actions_ec2_runner/runner/provision/lib/provision-lambda.handler",
    memorySize: 256,
    role: role.attrArn,
    runtime: "nodejs20.x",
    tags: [{ key: "Name", value: getName(scope).toString() }],
    timeout: 10,
  });

  new CfnEventSourceMapping(scope, "FunctionQueueSource", {
    eventSourceArn: queue.ref,
    functionName: function_.ref,
  });

  const allFunction = new CfnFunction(scope, "AllFunction", {
    code: {
      s3Bucket: artifactS3Bucket,
      s3Key: `${artifactS3KeyPrefix}provision.zip`,
    },
    environment: {
      variables: {
        PROVISIONER_TABLE_NAME: provisionerTable.ref,
        PROVISION_QUEUE_NAME: queue.ref,
      },
    },
    handler:
      "redotech_fast_actions_ec2_runner/runner/provision/lib/provision-all-lambda.handler",
    memorySize: 256,
    role: role.attrArn,
    runtime: "nodejs20.x",
    tags: [{ key: "Name", value: getName(scope).child("All").toString() }],
    timeout: 10,
  });

  new CfnRolePolicy(scope, "Policy", {
    policyDocument: {
      Statement: [
        {
          Action: [
            "sqs:*Message",
            "sqs:ChangeMessageVisibility",
            "sqs:GetQueueAttributes",
          ],
          Effect: "Allow",
          Resource: queue.ref,
        },
      ],
      Version: "2012-10-17",
    },
    policyName: iamPolicyName(getName(scope)),
    roleName: role.ref,
  });

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

  return { queue };
}

function runnerCreateStack(
  scope: Construct,
  {
    githubAppIdName,
    provisionerTable,
    instanceTable,
    role,
  }: {
    githubAppIdName: string;
    provisionerTable: CfnTable;
    instanceTable: CfnTable;
    role: CfnRole;
  },
) {
  const api = new CfnApi(scope, "Api", {
    name: getName(scope).toString(),
    protocolType: "HTTP",
    description: getName(scope).toString(),
    tags: { Name: getName(scope).toString() },
  });

  new CfnStage(scope, "Stage", {
    apiId: api.ref,
    autoDeploy: true,
    stageName: "$default",
    tags: { Name: getName(scope).toString() },
  });

  const function_ = new CfnFunction(scope, "Function", {
    code: {
      s3Bucket: artifactS3Bucket,
      s3Key: `${artifactS3KeyPrefix}provision.zip`,
    },
    description: getName(scope).toString(),
    environment: {
      variables: {
        GITHUB_APP_ID_NAME: githubAppIdName,
        GITHUB_PRIVATE_KEY_NAME: "",
        NODE_OPTIONS: "--enable-source-maps",
        PROVISION_TABLE_NAME: provisionerTable.ref,
        INSTANCE_TABLE_NAME: instanceTable.ref,
      },
    },
    handler:
      "redotech_fast_actions_ec2_runner/runner/provision/lib/runner-create-lambda.handler",
    memorySize: 256,
    role: role.attrArn,
    runtime: "nodejs20.x",
    tags: [{ key: "Name", value: getName(scope).toString() }],
    timeout: Temporal.Duration.from({ seconds: 10 }).total("seconds"),
  });

  const integration = new CfnIntegration(scope, "Integration", {
    apiId: api.ref,
    integrationType: "AWS_PROXY",
    integrationUri: `arn:aws:apigateway:${Aws.REGION}:lambda:path/2015-03-31/functions/${function_.attrArn}/invocations`,
  });

  new CfnRoute(scope, "Route", {
    apiId: api.ref,
    authorizationType: "AWS_IAM",
    operationName: "Create runner",
    routeKey: "POST /{instanceArn}",
    target: `integrations/${integration.ref}`,
  });

  new CfnPermission(scope, "Permission", {
    action: "lambda:InvokeFunction",
    functionName: function_.ref,
    principal: "apigateway.amazonaws.com",
    sourceArn: `arn:aws:execute-api:${Aws.REGION}:${Aws.ACCOUNT_ID}:${api.ref}/*/*/*`,
  });

  const instancePolicy = new CfnManagedPolicy(scope, "InstancePolicy", {
    description: getName(scope).toString(),
    policyDocument: {
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: "Allow",
          Resource: `arn:aws:execute-api:us-east-1:*:${api.ref}/*/POST/\${ec2:SourceInstanceARN}`,
        },
      ],
      Version: "2012-10-17",
    },
  });

  return { api, instancePolicy };
}

function dbStack(scope: Construct, { role }: { role: CfnRole }) {
  const jobTable = new CfnTable(scope, "JobTable", {
    billingMode: "PAY_PER_REQUEST",
    attributeDefinitions: [{ attributeName: "Id", attributeType: "N" }],
    keySchema: [{ attributeName: "Id", keyType: "HASH" }],
    tags: [{ key: "Name", value: getName(scope).toString() }],
    timeToLiveSpecification: { enabled: true, attributeName: "Expiration" },
  });

  const provisionerTable = new CfnTable(scope, "ProvisionerTable", {
    billingMode: "PAY_PER_REQUEST",
    attributeDefinitions: [{ attributeName: "Id", attributeType: "N" }],
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
    billingMode: "PAY_PER_REQUEST",
    attributeDefinitions: [{ attributeName: "Id", attributeType: "N" }],
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
    webhookSecretName,
    role,
    jobTable,
    provisionQueue,
    instanceTable,
  }: {
    webhookSecretName: string;
    role: CfnRole;
    provisionQueue: CfnQueue;
    jobTable: CfnTable;
    instanceTable: CfnTable;
  },
) {
  const function_ = new CfnFunction(scope, "Function", {
    code: {
      s3Bucket: artifactS3Bucket,
      s3Key: `${artifactS3KeyPrefix}provision.zip`,
    },
    environment: {
      variables: {
        JOB_TABLE_ARN: jobTable.attrArn,
        INSTANCE_TABLE_ARN: instanceTable.attrArn,
        WEBHOOK_SECRET_NAME: webhookSecretName,
        PROVISION_QUEUE_NAME: provisionQueue.ref,
        NODE_OPTIONS: "--enable-source-maps",
      },
    },
    handler:
      "redotech_fast_actions_ec2_runner/runner/provision/lib/webhook-lambda.handler",
    memorySize: 256,
    role: role.attrArn,
    runtime: "nodejs20.x",
    tags: [{ key: "Name", value: getName(scope).toString() }],
    timeout: Temporal.Duration.from({ seconds: 10 }).total("seconds"),
  });

  const url = new CfnUrl(scope, "Url", {
    authType: "NONE",
    targetFunctionArn: function_.ref,
  });

  new CfnPermission(scope, "UrlPermission", {
    action: "lambda:InvokeFunctionUrl",
    functionName: function_.ref,
    functionUrlAuthType: "NONE",
    principal: "*",
  });

  return { url };
}
