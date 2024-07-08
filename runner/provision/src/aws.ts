import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { credentialsRead, credentialsWrite } from "@redotech/dynamodb/aws";
import { stringRead, stringWrite } from "@redotech/dynamodb/common";
import {
  AwsCredentialIdentity,
  AwsCredentialIdentityProvider,
} from "@smithy/types";

const expirationMargin = Temporal.Duration.from({ minutes: 1 });

export function awsCredentialsProvider({
  dynamodbClient,
  provisionerTableName,
  provisionerId,
  stsClient,
}: {
  dynamodbClient: DynamoDBClient;
  provisionerTableName: string;
  provisionerId: string;
  stsClient: STSClient;
}): AwsCredentialIdentityProvider {
  return async () => {
    const output = await dynamodbClient.send(
      new GetItemCommand({
        Key: { Id: stringWrite(provisionerId) },
        TableName: provisionerTableName,
        ProjectionExpression: "AwsCredentials, AwsRole",
      }),
    );
    const item = output.Item;
    if (!item) {
      throw new Error(`No provisioner ${provisionerId}`);
    }

    if (item.AwsCredentials) {
      const credentials = credentialsRead(item.AwsCredentials);
      if (
        !credentials.expiration ||
        Temporal.Instant.compare(
          Temporal.Now.instant().add(expirationMargin),
          credentials.expiration.toTemporalInstant(),
        ) <= 0
      ) {
        return credentials;
      }
    }

    const stsOutput = await stsClient.send(
      new AssumeRoleCommand({
        RoleArn: stringRead(item.AwsRole),
        RoleSessionName: provisionerId,
      }),
    );
    const stsCredentials = stsOutput.Credentials!;

    const credentials: AwsCredentialIdentity = {
      accessKeyId: stsCredentials.AccessKeyId!,
      expiration: stsCredentials.Expiration,
      secretAccessKey: stsCredentials.SecretAccessKey!,
      sessionToken: stsCredentials.SessionToken,
    };

    await dynamodbClient.send(
      new UpdateItemCommand({
        ConditionExpression: "attribute_exists(Id)",
        Key: { Id: stringWrite(provisionerId) },
        TableName: provisionerTableName,
        UpdateExpression: "SET AwsCredentials = :awsCredentials",
        ExpressionAttributeValues: {
          ":awsCredentials": credentialsWrite(credentials),
        },
      }),
    );

    return credentials;
  };
}
