/**
 * @file
 * Refresh instance/runner statuses for all provisioners.
 */

import "./polyfill";

import {
  DynamoDBClient,
  GetItemCommand,
  paginateQuery,
} from "@aws-sdk/client-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  instantAttributeFormat,
  numberAttributeFormat,
  stringAttributeFormat,
} from "@redotech/dynamodb/attribute";
import { envNumberRead, envStringRead } from "@redotech/lambda/env";
import { Handler } from "aws-lambda";
import {
  InstallationClient,
  appGithubClient,
  provisionerInstallationClient,
} from "./github";
import { runnerRefresh } from "./runner";

const githubAppId = envNumberRead("GITHUB_APP_ID");

const githubPrivateKey = envStringRead("GITHUB_PRIVATE_KEY");

const instanceTableName = envStringRead("INSTANCE_TABLE_NAME");

const provisionQueueUrl = envStringRead("PROVISION_QUEUE_URL");

const provisionerTableName = envStringRead("PROVISIONER_TABLE_NAME");

const dynamodbClient = new DynamoDBClient();

const githubClient = appGithubClient(githubAppId, githubPrivateKey);

const sqsClient = new SQSClient({});

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
      Key: { Id: stringAttributeFormat.write(provisionerId) },
      ProjectionExpression: "RepoName",
    }),
  );
  const item = output.Item;
  if (!item) {
    throw new Error(`Provisioner ${provisionerId} not found`);
  }

  const repoName = item.UserName && stringAttributeFormat.read(item.RepoName);

  for await (const output of paginateQuery(
    { client: dynamodbClient },
    {
      ExpressionAttributeValues: {
        ":provisionerId": stringAttributeFormat.write(provisionerId),
      },
      FilterExpression: "attribute_exists(RunnerId)",
      IndexName: "ProvisionerId",
      KeyConditionExpression: "ProvisionerId = :provisionerId",
      ProjectionExpression: "ActiveAt, Id, RunnerId",
      TableName: instanceTableName,
    },
  )) {
    for (const item of output.Items!) {
      const activeAt = instantAttributeFormat.read(item.ActiveAt);
      const id = stringAttributeFormat.read(item.Id);
      const runnerId = numberAttributeFormat.read(item.RunnerId);

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

  await sqsClient.send(
    new SendMessageCommand({
      MessageBody: "_",
      MessageDeduplicationId: `${provisionerId}/${process.hrtime.bigint().toString(16)}`,
      MessageGroupId: provisionerId,
      QueueUrl: provisionQueueUrl,
    }),
  );
}
