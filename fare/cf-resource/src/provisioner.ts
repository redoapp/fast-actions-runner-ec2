import {
  DeleteItemCommand,
  DynamoDBClient,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { ARN } from "@aws-sdk/util-arn-parser";
import { arnWrite } from "@redotech/dynamodb/aws";
import {
  durationWrite,
  numberWrite,
  stringSetWrite,
  stringWrite,
} from "@redotech/dynamodb/common";

export enum ProvisionerAction {
  CREATE,
  DELETE,
  UPDATE,
}

export interface ProvisionerManager {
  (params: {
    action: ProvisionerAction;
    countMax: number;
    id: string;
    idleTimeout: Temporal.Duration;
    labels: Set<string>;
    launchTemplateArn: ARN;
    launchTemplateVersion: string;
    roleArn: ARN | undefined;
    launchTimeout: Temporal.Duration;
    orgName: string | undefined;
    userName: string | undefined;
    repoName: string | undefined;
  }): Promise<void>;
}

export function provisionerManager({
  provisionerTableName,
}: {
  provisionerTableName: string;
}): ProvisionerManager {
  const dynamodbClient = new DynamoDBClient();
  return async ({
    action,
    countMax,
    id,
    idleTimeout,
    labels,
    launchTemplateArn,
    launchTemplateVersion,
    launchTimeout,
    orgName,
    repoName,
    roleArn,
    userName,
  }) => {
    try {
      switch (action) {
        case ProvisionerAction.CREATE:
        case ProvisionerAction.UPDATE:
          await dynamodbClient.send(
            new UpdateItemCommand({
              ConditionExpression:
                action === ProvisionerAction.CREATE
                  ? "attribute_not_exists(Id)"
                  : undefined,
              TableName: provisionerTableName,
              Key: { Id: stringWrite(id) },
              UpdateExpression:
                "SET" +
                " CountMax = :countMax" +
                ", IdleTimeout = :idleTimeout" +
                ", Labels = :labels" +
                ", LaunchTemplateArn = :launchTemplateArn" +
                ", LaunchTemplateVersion = :launchTemplateVersion" +
                ", LaunchTimeout = :launchTimeout" +
                ", Owner = :owner, " +
                (roleArn !== undefined ? ", RoleArn = :roleArn" : "") +
                (orgName !== undefined ? ", Org = :org" : "") +
                (userName !== undefined ? ", UserName = :useNamer" : "") +
                (repoName !== undefined ? ", RepoName = :repoName" : ""),
              ExpressionAttributeValues: {
                ":countMax": numberWrite(countMax),
                ":id": stringWrite(id),
                ":idleTimeout": durationWrite(idleTimeout),
                ":labels": stringSetWrite(labels),
                ":launchTemplateArn": arnWrite(launchTemplateArn),
                ":launchTemplateVersion": stringWrite(launchTemplateVersion),
                ":launchTimeout": durationWrite(launchTimeout),
                ":owner": stringWrite((orgName ?? userName)!),
                ...(roleArn !== undefined && { ":roleArn": arnWrite(roleArn) }),
                ...(orgName !== undefined && {
                  ":orgName": stringWrite(orgName),
                }),
                ...(userName !== undefined && {
                  ":userName": stringWrite(userName),
                }),
                ...(repoName !== undefined && {
                  ":repoName": stringWrite(repoName),
                }),
              },
            }),
          );
          break;
        case ProvisionerAction.DELETE:
          await dynamodbClient.send(
            new DeleteItemCommand({
              TableName: provisionerTableName,
              Key: { Id: stringWrite(id) },
            }),
          );
          break;
      }
    } finally {
      dynamodbClient.destroy();
    }
  };
}
