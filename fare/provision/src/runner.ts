import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { RequestError } from "@octokit/request-error";
import { RestEndpointMethodTypes } from "@octokit/rest";
import {
  instantWrite,
  numberWrite,
  stringWrite,
} from "@redotech/dynamodb/common";
import { InstallationClient } from "./github";
import { RunnerStatus } from "./instance";

export async function runnerRefresh({
  activeAt,
  dynamodbClient,
  installationClient,
  instanceTableName,
  instanceId: runnerName,
  repoName,
  id: id,
}: {
  activeAt: Temporal.Instant | undefined;
  dynamodbClient: DynamoDBClient;
  installationClient: InstallationClient;
  instanceTableName: string;
  instanceId: string;
  repoName: string | undefined;
  id: number;
}) {
  const updatedAt = Temporal.Now.instant();
  let status: RunnerStatus;
  try {
    let response:
      | RestEndpointMethodTypes["actions"]["getSelfHostedRunnerForOrg"]["response"]
      | RestEndpointMethodTypes["actions"]["getSelfHostedRunnerForRepo"]["response"];
    const owner = (installationClient.orgName ?? installationClient.userName)!;
    if (repoName !== undefined) {
      response =
        await installationClient.client.actions.getSelfHostedRunnerForRepo({
          owner,
          repo: repoName,
          runner_id: id,
        });
    } else {
      response =
        await installationClient.client.actions.getSelfHostedRunnerForOrg({
          org: owner,
          runner_id: id,
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
  await dynamodbClient.send(
    new UpdateItemCommand({
      ConditionExpression:
        "Id = :id" + (activeAt ? " AND ActiveAt <= :oldActiveAt" : ""),
      ExpressionAttributeValues: {
        ...(status === RunnerStatus.ACTIVE && {
          ":activeAt": instantWrite(updatedAt),
        }),
        ...(activeAt && { ":oldActiveAt": instantWrite(activeAt) }),
        ":id": numberWrite(id),
        ":status": stringWrite(status),
      },
      ExpressionAttributeNames: { "#status": "Status" },
      Key: { Name: stringWrite(runnerName) },
      TableName: instanceTableName,
      UpdateExpression:
        "SET #status = :status" +
        (status === RunnerStatus.ACTIVE ? ", ActiveAt = :activeAt" : ""),
    }),
  );

  return { status, activeAt };
}
