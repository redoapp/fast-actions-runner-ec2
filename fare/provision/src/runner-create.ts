import "./polyfill";

import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { ARN, parse } from "@aws-sdk/util-arn-parser";
import { RestEndpointMethodTypes } from "@octokit/rest";
import { instanceResourceRead } from "@redotech/aws-util/ec2";
import {
  numberAttributeFormat,
  stringAttributeFormat,
  stringSetAttributeFormat,
} from "@redotech/dynamodb/attribute";
import { envNumberRead, envStringRead } from "@redotech/lambda/env";
import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { appGithubClient, provisionerInstallationClient } from "./github";
import {
  InstanceStatus,
  RunnerStatus,
  runnerAttributeFormat,
} from "./instance";

const githubAppId = envNumberRead("GITHUB_APP_ID");

const githubPrivateKey = envStringRead("GITHUB_PRIVATE_KEY");

const provisionerTableName = envStringRead("PROVISION_TABLE_NAME");

const instanceTableName = envStringRead("INSTANCE_TABLE_NAME");

const dynamodbClient = new DynamoDBClient();

const githubClient = appGithubClient(githubAppId, githubPrivateKey);

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const provisionerId = event.pathParameters!.provisionerId!;

  let instanceArn: ARN;
  try {
    instanceArn = parse(event.pathParameters!.instanceArn!);
  } catch (e) {
    console.error(String(e));
    return {
      body: "Invalid instance ARN",
      headers: { "Content-Type": "text/plain" },
      statusCode: 400,
    };
  }
  const { instanceId } = instanceResourceRead(instanceArn.resource);

  const output = await dynamodbClient.send(
    new GetItemCommand({
      Key: {
        Id: stringAttributeFormat.write(instanceId),
        ProvisionerId: stringAttributeFormat.write(provisionerId),
      },
      TableName: instanceTableName,
      ProjectionExpression: "ProvisionerId",
    }),
  );
  const item = output.Item;
  if (!item) {
    console.log(`No instance ${instanceId}`);
    return { statusCode: 404, body: `No instance ${instanceId}` };
  }

  if (provisionerId !== stringAttributeFormat.read(item.ProvisionerId)) {
    console.log(`Does not have ${provisionerId}`);
    return {
      statusCode: 404,
      body: `Does not have provisioner ${provisionerId}`,
    };
  }

  let config: string;
  try {
    ({ config } = await createRunner({
      instanceId: instanceId,
      provisionerId,
    }));
  } catch (e) {
    if (e instanceof InstanceDisabledError) {
      console.log(`Instance ${instanceId} is disabled`);
      return { statusCode: 409 };
    }
    throw e;
  }

  return { body: config };
};

async function createRunner({
  instanceId,
  provisionerId,
}: {
  instanceId: string;
  provisionerId: string;
}): Promise<{ config: string }> {
  const provisionerOutput = await dynamodbClient.send(
    new GetItemCommand({
      Key: { Id: stringAttributeFormat.write(provisionerId) },
      TableName: provisionerTableName,
      ProjectionExpression:
        "Labels, OrgName, RepoName, RunnerGroupId, UserName",
    }),
  );
  const item = provisionerOutput.Item;
  if (!item) {
    throw new Error("No provisioner found");
  }

  const labels = stringSetAttributeFormat.read(item.Labels);
  const orgName = item.OrgName && stringAttributeFormat.read(item.OrgName);
  const repoName = item.RepoName && stringAttributeFormat.read(item.RepoName);
  const runnerGroupId = numberAttributeFormat.read(item.RunnerGroupId);
  const userName = item.UserName && stringAttributeFormat.read(item.UserName);

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
    console.log(
      `Creating runner ${instanceId} for ${orgName}/${repoName} in group ${runnerGroupId}`,
    );
    response =
      await installationClient.client.actions.generateRunnerJitconfigForRepo({
        labels: [...labels],
        runner_group_id: runnerGroupId,
        repo: repoName,
        owner: orgName ?? userName,
        name: instanceId,
      });
  } else {
    console.log(
      `Creating runner ${instanceId} for ${orgName} in group ${runnerGroupId}`,
    );
    response =
      await installationClient.client.actions.generateRunnerJitconfigForOrg({
        labels: [...labels],
        runner_group_id: runnerGroupId,
        org: orgName,
        name: instanceId,
      });
  }

  try {
    await dynamodbClient.send(
      new UpdateItemCommand({
        ConditionExpression: "#status <> :disabled",
        ExpressionAttributeValues: {
          ":disabled": stringAttributeFormat.write(InstanceStatus.DISABLED),
          ":runner": runnerAttributeFormat.write({
            activeAt: Temporal.Now.instant(),
            id: response.data.runner.id,
            status: RunnerStatus.IDLE,
          }),
        },
        ExpressionAttributeNames: { "#status": "Status" },
        Key: {
          Id: stringAttributeFormat.write(instanceId),
          ProvisionerId: stringAttributeFormat.write(provisionerId),
        },
        UpdateExpression: "SET Runner = :runner",
        TableName: instanceTableName,
      }),
    );
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
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
    throw e;
  }

  return { config: response.data.encoded_jit_config };
}

class InstanceDisabledError extends Error {
  constructor(instanceId: string) {
    super(`Instance ${instanceId} is disabled`);
  }
}
