import "./polyfill";

import { DynamoDBClient, paginateScan } from "@aws-sdk/client-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { stringRead } from "@redotech/dynamodb/common";
import { envStringRead } from "@redotech/lambda/env";
import {} from "@redotech/sqs";

const provisionSyncName = envStringRead("PROVISION_SYNC_NAME");

const provisionerTableName = envStringRead("PROVISIONER_TABLE_NAME");

const dynamodbClient = new DynamoDBClient();

const lambdaClient = new LambdaClient();

export const handler = async () => {
  for await (const provisioner of provisioners({
    dynamodbClient,
  })) {
    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: provisionSyncName,
        InvocationType: "Event",
        Payload: JSON.stringify({ provisonerId: provisioner.id }),
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
      const id = stringRead(item.Id);
      yield { id };
    }
  }
}
