import "./polyfill";

import {
  DeleteItemCommand,
  DynamoDBClient,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { parse } from "@aws-sdk/util-arn-parser";
import { sendFailure, sendSuccess } from "@redotech/cf-response";
import {
  durationAttributeCodec,
  numberAttributeCodec,
  stringAttributeCodec,
  stringSetAttributeCodec,
} from "@redotech/dynamodb/attribute";
import { arnAttributeCodec } from "@redotech/dynamodb/aws";
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceHandler,
} from "aws-lambda";

const provisionerTableName = process.env.PROVISIONER_TABLE_NAME!;

export const handler: CloudFormationCustomResourceHandler = async (event) => {
  try {
    await doUpdate(event);
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : String(e);
    await sendFailure(event, { reason: message });
    return;
  }
  await sendSuccess(event);
};

async function doUpdate(event: CloudFormationCustomResourceEvent) {
  const resourceProperties = event.ResourceProperties;
  const id = resourceProperties.Id;
  const dynamodbClient = new DynamoDBClient();
  try {
    switch (event.RequestType) {
      case "Create":
      case "Update": {
        const countMax = resourceProperties.CountMax;
        const countMin = resourceProperties.CountMin;
        if (countMax !== -1 && countMax < countMin) {
          throw new Error(
            `CountMax ${countMax} is less than CountMin ${countMin}`,
          );
        }
        const scaleFactor = resourceProperties.ScaleFactor;
        const idleTimeout = Temporal.Duration.from(
          resourceProperties.IdleTimeout,
        );
        const labels = new Set<string>(resourceProperties.Labels);
        const launchTemplateArn = parse(resourceProperties.LaunchTemplateArn);
        const launchTemplateVersion = resourceProperties.LaunchTemplateVersion;
        const roleArn = parse(event.ResourceProperties.RoleArn);
        const launchTimeout = Temporal.Duration.from(
          resourceProperties.LaunchTimeout,
        );
        const orgName = resourceProperties.OrgName;
        const userName = resourceProperties.UserName;
        const repoName = resourceProperties.RepoName;
        const runnerGroupId = resourceProperties.RunnerGroupId;
        const result = await dynamodbClient.send(
          new UpdateItemCommand({
            ConditionExpression:
              event.RequestType === "Create"
                ? "attribute_not_exists(Id)"
                : undefined,
            Key: { Id: stringAttributeCodec.write(id) },
            TableName: provisionerTableName,
            UpdateExpression:
              "SET" +
              " CountMax = :countMax" +
              ", CountMin = :countMin" +
              ", IdleTimeout = :idleTimeout" +
              ", Labels = :labels" +
              ", LaunchTemplateArn = :launchTemplateArn" +
              ", LaunchTemplateVersion = :launchTemplateVersion" +
              ", LaunchTimeout = :launchTimeout" +
              ", RoleArn = :roleArn" +
              ", RunnerGroupId = :runnerGroupId" +
              ", ScaleFactor = :scaleFactor" +
              ", #owner = :owner" +
              (orgName !== undefined ? ", OrgName = :orgName" : "") +
              (userName !== undefined ? ", UserName = :userName" : "") +
              (repoName !== undefined ? ", RepoName = :repoName" : "") +
              "\n" +
              "REMOVE dummy" +
              (orgName !== undefined ? "" : ", OrgName") +
              (userName !== undefined ? "" : ", UserName") +
              (repoName !== undefined ? "" : ", RepoName"),
            ExpressionAttributeNames: { "#owner": "Owner" },
            ExpressionAttributeValues: {
              ":countMax": numberAttributeCodec.write(countMax),
              ":countMin": numberAttributeCodec.write(countMin),
              ":idleTimeout": durationAttributeCodec.write(idleTimeout),
              ":labels": stringSetAttributeCodec.write(labels),
              ":launchTemplateArn": arnAttributeCodec.write(launchTemplateArn),
              ":launchTemplateVersion": stringAttributeCodec.write(
                launchTemplateVersion,
              ),
              ":launchTimeout": durationAttributeCodec.write(launchTimeout),
              ":runnerGroupId": numberAttributeCodec.write(runnerGroupId),
              ":owner": stringAttributeCodec.write((orgName ?? userName)!),
              ":scaleFactor": numberAttributeCodec.write(scaleFactor),
              ":roleArn": arnAttributeCodec.write(roleArn),
              ...(orgName !== undefined && {
                ":orgName": stringAttributeCodec.write(orgName),
              }),
              ...(userName !== undefined && {
                ":userName": stringAttributeCodec.write(userName),
              }),
              ...(repoName !== undefined && {
                ":repoName": stringAttributeCodec.write(repoName),
              }),
            },
            ReturnValues: "ALL_NEW",
          }),
        );
        if (!result.Attributes) {
          throw new Error(`Existing provisioner with ID ${id}`);
        }
        break;
      }
      case "Delete":
        await dynamodbClient.send(
          new DeleteItemCommand({
            Key: { Id: stringAttributeCodec.write(id) },
            TableName: provisionerTableName,
          }),
        );
        break;
    }
  } finally {
    dynamodbClient.destroy();
  }
}
