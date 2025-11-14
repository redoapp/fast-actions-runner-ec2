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
  numberAttributeCodec,
  stringAttributeCodec,
  stringSetAttributeCodec,
} from "@redotech/dynamodb/attribute";
import { envNumberRead, envStringRead } from "@redotech/lambda/env";
import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { appGithubClient, provisionerInstallationClient } from "./github";
import { InstanceStatus, RunnerStatus, runnerAttributeCodec } from "./instance";

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
        Id: stringAttributeCodec.write(instanceId),
        ProvisionerId: stringAttributeCodec.write(provisionerId),
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

  if (provisionerId !== stringAttributeCodec.read(item.ProvisionerId)) {
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
      Key: { Id: stringAttributeCodec.write(provisionerId) },
      TableName: provisionerTableName,
      ProjectionExpression:
        "Labels, OrgName, RepoName, RunnerGroupId, UserName",
    }),
  );
  const provisionerItem = provisionerOutput.Item;
  if (!provisionerItem) {
    throw new Error("No provisioner found");
  }

  const labels = stringSetAttributeCodec.read(provisionerItem.Labels);
  const orgName =
    provisionerItem.OrgName &&
    stringAttributeCodec.read(provisionerItem.OrgName);
  const repoName =
    provisionerItem.RepoName &&
    stringAttributeCodec.read(provisionerItem.RepoName);
  const runnerGroupId = numberAttributeCodec.read(
    provisionerItem.RunnerGroupId,
  );
  const userName =
    provisionerItem.UserName &&
    stringAttributeCodec.read(provisionerItem.UserName);

  const installationClient = await provisionerInstallationClient({
    dynamodbClient,
    provisionerTableName,
    githubClient,
    provisionerId,
  });

  const instanceOutput = await dynamodbClient.send(
    new GetItemCommand({
      ExpressionAttributeNames: { "#status": "Status" },
      ProjectionExpression: "Runner, #status",
      Key: {
        Id: stringAttributeCodec.write(instanceId),
        ProvisionerId: stringAttributeCodec.write(provisionerId),
      },
      TableName: instanceTableName,
    }),
  );
  const instanceItem = instanceOutput.Item;
  if (!instanceItem) {
    throw new Error(`No instance ${instanceId}`);
  }
  const instanceStatus = stringAttributeCodec.read(instanceItem.Status);
  if (instanceStatus === InstanceStatus.DISABLED) {
    throw new InstanceDisabledError(instanceId);
  }

  if (instanceItem.Runner) {
    const runner = runnerAttributeCodec.read(instanceItem.Runner);
    console.log(
      `Deleting previous runner ${runner.id} on instance ${instanceId}`,
    );
    if (repoName !== undefined) {
      await installationClient.client.actions.deleteSelfHostedRunnerFromRepo({
        owner: orgName ?? userName,
        repo: repoName,
        runner_id: runner.id,
      });
    } else {
      await installationClient.client.actions.deleteSelfHostedRunnerFromOrg({
        org: orgName,
        runner_id: runner.id,
      });
    }
  }

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
          ":disabled": stringAttributeCodec.write(InstanceStatus.DISABLED),
          ":runner": runnerAttributeCodec.write({
            activeAt: Temporal.Now.instant(),
            id: response.data.runner.id,
            status: RunnerStatus.IDLE,
          }),
        },
        ExpressionAttributeNames: { "#status": "Status" },
        Key: {
          Id: stringAttributeCodec.write(instanceId),
          ProvisionerId: stringAttributeCodec.write(provisionerId),
        },
        UpdateExpression: "SET Runner = :runner",
        TableName: instanceTableName,
      }),
    );
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      console.log(
        `Instance ${instanceId} disabled, deleting runner ${response.data.runner.id}`,
      );
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
