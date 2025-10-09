/**
 * @file
 * Start provisioner sync for all provisioners.
 */

import "./polyfill";

import { DynamoDBClient, paginateScan } from "@aws-sdk/client-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { stringAttributeCodec } from "@redotech/dynamodb/attribute";
import { envStringRead } from "@redotech/lambda/env";
import { ProvisionerSyncEvent } from "./provisioner-sync";

const provisionerSyncName = envStringRead("PROVISIONER_SYNC_NAME");

const provisionerTableName = envStringRead("PROVISIONER_TABLE_NAME");

const dynamodbClient = new DynamoDBClient();

const lambdaClient = new LambdaClient();

export const handler = async () => {
  for await (const provisioner of provisioners({
    dynamodbClient,
  })) {
    const event: ProvisionerSyncEvent = { provisionerId: provisioner.id };
    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: provisionerSyncName,
        InvocationType: "Event",
        Payload: JSON.stringify(event),
      }),
    );
  }
};

interface Provisioner {
  id: string;
}

async function* provisioners({
  dynamodbClient,
}: {
  dynamodbClient: DynamoDBClient;
}): AsyncIterableIterator<Provisioner> {
  for await (const output of paginateScan(
    { client: dynamodbClient },
    { ProjectionExpression: "Id", TableName: provisionerTableName },
  )) {
    for (const item of output.Items!) {
      const id = stringAttributeCodec.read(item.Id);
      yield { id };
    }
  }
}
