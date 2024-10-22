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
}): Promise<RunnerStatus> {
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
    return RunnerStatus.IDLE;
  }

  const runner = runnerAttributeFormat.read(instanceOutput.Item.Runner);

  const updatedAt = Temporal.Now.instant();
  let status: RunnerStatus | undefined;
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
    console.log(
      `Instance ${provisionerId}/${instanceId} runner ${runner.id} is ${status}`,
    );
  } catch (e) {
    if (e instanceof RequestError && e.status === 404) {
      console.log(
        `Instance ${provisionerId}/${instanceId} runner ${runner.id} does not exist`,
      );
    } else {
      throw e;
    }
  }

  try {
    await dynamodbClient.send(
      new UpdateItemCommand({
        ConditionExpression:
          "Runner.Id = :id AND Runner.ActiveAt <= :oldActiveAt",
        ExpressionAttributeValues: {
          ...(status === RunnerStatus.ACTIVE && {
            ":activeAt": instantAttributeFormat.write(updatedAt),
          }),
          ...(status !== undefined && {
            ":status": stringAttributeFormat.write(status),
          }),
          ":oldActiveAt": instantAttributeFormat.write(runner.activeAt),
          ":id": numberAttributeFormat.write(runner.id),
        },
        ExpressionAttributeNames: status && { "#status": "Status" },
        Key: {
          Id: stringAttributeFormat.write(instanceId),
          ProvisionerId: stringAttributeFormat.write(provisionerId),
        },
        TableName: instanceTableName,
        UpdateExpression:
          status === undefined
            ? "SET Runner.#status = :status" +
              (status === RunnerStatus.ACTIVE
                ? ", Runner.ActiveAt = :activeAt"
                : "")
            : "REMOVE Runner",
      }),
    );
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      console.log(
        `Update for ${provisionerId}/${instanceId} runner ${runner.id} is stale`,
      );
    } else {
      throw e;
    }
  }
  return status ?? RunnerStatus.IDLE;
}
