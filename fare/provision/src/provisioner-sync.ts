/**
 * @file
 * Refresh instance/runner statuses for all provisioners.
 */

import "./polyfill";

import { DynamoDBClient, paginateQuery } from "@aws-sdk/client-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { stringAttributeCodec } from "@redotech/dynamodb/attribute";
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
  console.log(`Syncing provisioner ${provisionerId}`);

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
  for await (const output of paginateQuery(
    { client: dynamodbClient },
    {
      ExpressionAttributeValues: {
        ":provisionerId": stringAttributeCodec.write(provisionerId),
      },
      FilterExpression: "attribute_exists(Runner)",
      KeyConditionExpression: "ProvisionerId = :provisionerId",
      ProjectionExpression: "Id",
      TableName: instanceTableName,
    },
  )) {
    for (const item of output.Items!) {
      const id = stringAttributeCodec.read(item.Id);
      await runnerRefresh({
        dynamodbClient,
        installationClient,
        instanceId: id,
        instanceTableName,
        provisionerId,
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
