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
  } catch (e) {
    if (e instanceof RequestError && e.status === 404) {
      status = RunnerStatus.IDLE;
    } else {
      throw e;
    }
  }

  try {
    await dynamodbClient.send(
      new UpdateItemCommand({
        ConditionExpression: "Runner.Id = :id AND ActiveAt <= :oldActiveAt",
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
          (status === RunnerStatus.ACTIVE ? ", ActiveAt = :activeAt" : ""),
      }),
    );
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      return;
    }
  }
}
