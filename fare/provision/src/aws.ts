import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { stringAttributeCodec } from "@redotech/dynamodb/attribute";
import { credentialsAttributeCodec } from "@redotech/dynamodb/aws";
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
        Key: { Id: stringAttributeCodec.write(provisionerId) },
        TableName: provisionerTableName,
        ProjectionExpression: "AwsCredentials, RoleArn",
      }),
    );
    const item = output.Item;
    if (!item) {
      throw new Error(`No provisioner ${provisionerId}`);
    }

    if (item.AwsCredentials) {
      const credentials = credentialsAttributeCodec.read(item.AwsCredentials);
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
        RoleArn: stringAttributeCodec.read(item.RoleArn),
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
        Key: { Id: stringAttributeCodec.write(provisionerId) },
        TableName: provisionerTableName,
        UpdateExpression: "SET AwsCredentials = :awsCredentials",
        ExpressionAttributeValues: {
          ":awsCredentials": credentialsAttributeCodec.write(credentials),
        },
      }),
    );

    return credentials;
  };
}

export const createRegionTag = "FastActionsRunnerEc2:Create:Region";

export const createUrlTag = "FastActionsRunnerEc2:Create:Url";

export const provisionerIdTag = "FastActionsRunnerEc2:ProvisionerId";
