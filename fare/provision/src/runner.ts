import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { RequestError } from "@octokit/request-error";
import { RestEndpointMethodTypes } from "@octokit/rest";
import {
  instantAttributeFormat,
  numberAttributeFormat,
  stringAttributeFormat,
} from "@redotech/dynamodb/attribute";
import { InstallationClient } from "./github";
import { RunnerStatus, runnerAttributeFormat } from "./instance";

export async function runnerRefresh({
  dynamodbClient,
  installationClient,
  instanceTableName,
  instanceId,
  provisionerId,
}: {
  dynamodbClient: DynamoDBClient;
  installationClient: InstallationClient;
  instanceTableName: string;
  instanceId: string;
  provisionerId: string;
}) {
  console.log(`Refreshing ${provisionerId}/${instanceId} runner status`);
  const instanceOutput = await dynamodbClient.send(
    new GetItemCommand({
      Key: {
        Id: stringAttributeFormat.write(instanceId),
        ProvisionerId: stringAttributeFormat.write(provisionerId),
      },
      TableName: instanceTableName,
      ProjectionExpression: "Runner",
    }),
  );
  if (!instanceOutput.Item || !instanceOutput.Item!.Runner) {
    console.log(
      `Instance ${provisionerId}/${instanceId} does not have a runner`,
    );
    return;
  }

  const runner = runnerAttributeFormat.read(instanceOutput.Item.Runner);

  const updatedAt = Temporal.Now.instant();
  let status: RunnerStatus;
  try {
    let response:
      | RestEndpointMethodTypes["actions"]["getSelfHostedRunnerForOrg"]["response"]
      | RestEndpointMethodTypes["actions"]["getSelfHostedRunnerForRepo"]["response"];
    if (installationClient.repoName !== undefined) {
      response =
        await installationClient.client.actions.getSelfHostedRunnerForRepo({
          owner: (installationClient.orgName ?? installationClient.userName)!,
          repo: installationClient.repoName,
          runner_id: runner.id,
        });
    } else {
      response =
        await installationClient.client.actions.getSelfHostedRunnerForOrg({
          org: installationClient.orgName!,
          runner_id: runner.id,
        });
    }
    status = response.data.busy ? RunnerStatus.ACTIVE : RunnerStatus.IDLE;
    console.log(`Instance ${provisionerId}/${instanceId} runner is ${status}`);
  } catch (e) {
    if (e instanceof RequestError && e.status === 404) {
      console.log(
        `Instance ${provisionerId}/${runner.id} does not have a GitHub runner`,
      );
      status = RunnerStatus.IDLE;
    } else {
      throw e;
    }
  }

  try {
    await dynamodbClient.send(
      new UpdateItemCommand({
        ConditionExpression: "Runner.Id = :id AND Runner.ActiveAt <= :oldActiveAt",
        ExpressionAttributeValues: {
          ...(status === RunnerStatus.ACTIVE && {
            ":activeAt": instantAttributeFormat.write(updatedAt),
          }),
          ":oldActiveAt": instantAttributeFormat.write(runner.activeAt),
          ":id": numberAttributeFormat.write(runner.id),
          ":status": stringAttributeFormat.write(status),
        },
        ExpressionAttributeNames: { "#status": "Status" },
        Key: {
          Id: stringAttributeFormat.write(instanceId),
          ProvisionerId: stringAttributeFormat.write(provisionerId),
        },
        TableName: instanceTableName,
        UpdateExpression:
          "SET Runner.#status = :status" +
          (status === RunnerStatus.ACTIVE ? ", Runner.ActiveAt = :activeAt" : ""),
      }),
    );
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      return;
    }
  }
}
