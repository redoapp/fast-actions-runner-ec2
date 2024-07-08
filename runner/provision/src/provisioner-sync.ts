require("temporal-polyfill/global");

import {
  DynamoDBClient,
  GetItemCommand,
  paginateQuery,
} from "@aws-sdk/client-dynamodb";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import {
  instantRead,
  numberRead,
  stringRead,
  stringWrite,
} from "@redotech/dynamodb/common";
import { envNumberRead, envStringRead } from "@redotech/lambda/env";
import { Handler } from "aws-lambda";
import { InstallationClient, provisionerInstallationClient } from "./github";
import { runnerRefresh } from "./runner";

const githubAppId = envNumberRead("GITHUB_APP_ID");

const githubPrivateKey = envStringRead("GITHUB_PRIVATE_KEY");

const instanceTableName = envStringRead("INSTANCE_TABLE_NAME");

const provisionerTableName = envStringRead("PROVISIONER_TABLE_NAME");

const dynamodbClient = new DynamoDBClient();

const githubClient = new Octokit({
  authStrategy: createAppAuth,
  auth: { appId: githubAppId, privateKey: githubPrivateKey },
});

export interface ProvisionerSyncEvent {
  provisionerId: string;
}

export const handler: Handler<ProvisionerSyncEvent, void> = async (event) => {
  const provisionerId = event.provisionerId;

  const installationClient = await provisionerInstallationClient({
    dynamodbClient,
    provisionerId,
    provisionerTableName,
    githubClient,
  });

  await runnersRefresh({ installationClient, provisionerId });
};

async function runnersRefresh({
  installationClient,
  provisionerId,
}: {
  installationClient: InstallationClient;
  provisionerId: string;
}) {
  const output = await dynamodbClient.send(
    new GetItemCommand({
      TableName: provisionerTableName,
      Key: { Id: stringWrite(provisionerId) },
      ProjectionExpression: "RepoName",
    }),
  );
  const item = output.Item;
  if (!item) {
    throw new Error(`Provisioner ${provisionerId} not found`);
  }

  const repoName = item.UserName && stringRead(item.RepoName);

  for await (const output of paginateQuery(
    { client: dynamodbClient },
    {
      ExpressionAttributeValues: {
        ":provisionerId": stringWrite(provisionerId),
      },
      FilterExpression: "attribute_exists(RunnerId)",
      IndexName: "ProvisionerId",
      KeyConditionExpression: "ProvisionerId = :provisionerId",
      ProjectionExpression: "ActiveAt, Id, RunnerId",
      TableName: instanceTableName,
    },
  )) {
    for (const item of output.Items!) {
      const activeAt = instantRead(item.ActiveAt);
      const id = stringRead(item.Id);
      const runnerId = numberRead(item.RunnerId);

      await runnerRefresh({
        activeAt,
        dynamodbClient,
        installationClient,
        id: runnerId,
        instanceId: id,
        instanceTableName,
        repoName,
      });
    }
  }
}
