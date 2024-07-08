import "./polyfill";

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { DescribeInstancesCommand, EC2Client } from "@aws-sdk/client-ec2";
import { parse } from "@aws-sdk/util-arn-parser";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit, RestEndpointMethodTypes } from "@octokit/rest";
import { instanceResourceRead } from "@redotech/aws-util/ec2";
import { arnRead } from "@redotech/dynamodb/aws";
import {
  numberRead,
  numberWrite,
  stringRead,
  stringSetRead,
  stringWrite,
} from "@redotech/dynamodb/common";
import { envNumberRead, envStringRead } from "@redotech/lambda/env";
import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { provisionerInstallationClient } from "./github";
import { InstanceStatus } from "./instance";

const githubAppId = envNumberRead("GITHUB_APP_ID");

const githubPrivateKey = envStringRead("GITHUB_PRIVATE_KEY");

const provisionerTableName = envStringRead("PROVISION_TABLE_NAME");

const instanceTableName = envStringRead("INSTANCE_TABLE_NAME");

const dynamodbClient = new DynamoDBClient();

const githubClient = new Octokit({
  authStrategy: createAppAuth,
  auth: { appId: githubAppId, privateKey: githubPrivateKey },
});

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const instanceArn = parse(event.pathParameters!.instanceArn!);

  const provisionerId = event.queryStringParameters!.provisioner_id;
  if (!provisionerId) {
    return {
      statusCode: 400,
      body: "Missing provisioner_id",
      headers: { "Content-Type": "text/plain" },
    };
  }

  const { instanceId } = instanceResourceRead(instanceArn.resource);

  await authorize({
    dynamodbClient,
    provisionerTableName,
    provisionerId,
    instanceId,
  });

  let config: string;
  try {
    ({ config } = await createRunner({
      instanceId: instanceId,
      provisionerId,
    }));
  } catch (e) {
    if (e instanceof InstanceDisabledError) {
      return { statusCode: 409 };
    }
    throw e;
  }

  return { body: config };
};

async function authorize({
  dynamodbClient,
  provisionerTableName,
  provisionerId,
  instanceId,
}: {
  dynamodbClient: DynamoDBClient;
  provisionerTableName: string;
  provisionerId: string;
  instanceId: string;
}): Promise<void> {
  const output = await dynamodbClient.send(
    new GetItemCommand({
      Key: { Id: stringWrite(provisionerId) },
      TableName: provisionerTableName,
      ProjectionExpression: "LaunchTemplateArn, Id",
    }),
  );
  const item = output.Item;
  if (!item) {
    throw new Error("No provisioner found");
  }

  const launchTemplateArn = arnRead(item.LaunchTemplateArn);

  const ec2Client = new EC2Client({ region: launchTemplateArn.region });
  const describeOutput = await ec2Client.send(
    new DescribeInstancesCommand({ InstanceIds: [instanceId] }),
  );
  const instance = describeOutput.Reservations?.[0].Instances?.[0];
  if (!instance) {
    throw new Error(`No instance ${instanceId}`);
  }
  if (
    !instance.Tags!.some(
      (tag) => tag.Key === "ActionsRunner" && tag.Value === provisionerId,
    )
  ) {
    throw new Error(
      `Instance ${instanceId} does not have tag ActionsRunner=${provisionerId}`,
    );
  }
}

async function createRunner({
  instanceId,
  provisionerId,
}: {
  instanceId: string;
  provisionerId: string;
}): Promise<{ config: string }> {
  const provisionerOutput = await dynamodbClient.send(
    new GetItemCommand({
      Key: { Id: stringWrite(provisionerId) },
      TableName: provisionerTableName,
      ProjectionExpression:
        "Labels, OrgName, RepoName, RunnerGroupId, UserName",
    }),
  );
  const item = provisionerOutput.Item;
  if (!item) {
    throw new Error("No provisioner found");
  }

  const labels = stringSetRead(item.Labels);
  const orgName = item.OrgName && stringRead(item.OrgName);
  const repoName = item.RepoName && stringRead(item.RepoName);
  const runnerGroupId = numberRead(item.RunnerGroupId);
  const userName = item.UserName && stringRead(item.UserName);

  const installationClient = await provisionerInstallationClient({
    dynamodbClient,
    provisionerTableName,
    githubClient,
    provisionerId,
  });

  let response:
    | RestEndpointMethodTypes["actions"]["generateRunnerJitconfigForOrg"]["response"]
    | RestEndpointMethodTypes["actions"]["generateRunnerJitconfigForRepo"]["response"];
  if (repoName !== undefined) {
    response =
      await installationClient.client.actions.generateRunnerJitconfigForRepo({
        labels: [...labels],
        runner_group_id: runnerGroupId,
        repo: repoName,
        owner: orgName ?? userName,
        name: instanceId,
      });
  } else {
    response =
      await installationClient.client.actions.generateRunnerJitconfigForOrg({
        labels: [...labels],
        runner_group_id: runnerGroupId,
        org: orgName,
        name: instanceId,
      });
  }

  const putOutput = await dynamodbClient.send(
    new PutItemCommand({
      ConditionExpression: "#status <> :disabled",
      ExpressionAttributeValues: {
        ":disabled": stringWrite(InstanceStatus.DISABLED),
      },
      ExpressionAttributeNames: { "#status": "Status" },
      Item: {
        Id: numberWrite(response.data.runner.id),
        Name: stringWrite(instanceId),
        ProvisionerId: stringWrite(provisionerId),
      },
      TableName: instanceTableName,
    }),
  );
  if (!putOutput.Attributes) {
    if (repoName !== undefined) {
      await installationClient.client.actions.deleteSelfHostedRunnerFromRepo({
        owner: orgName ?? userName,
        repo: repoName,
        runner_id: response.data.runner.id,
      });
    } else {
      await installationClient.client.actions.deleteSelfHostedRunnerFromOrg({
        org: orgName,
        runner_id: response.data.runner.id,
      });
    }
    throw new InstanceDisabledError(instanceId);
  }

  return { config: response.data.encoded_jit_config };
}

class InstanceDisabledError extends Error {
  constructor(instanceId: string) {
    super(`Instance ${instanceId} is disabled`);
  }
}
