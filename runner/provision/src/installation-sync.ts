require("temporal-polyfill/global");

import {
  DynamoDBClient,
  UpdateItemCommand,
  paginateQuery,
} from "@aws-sdk/client-dynamodb";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import {
  instantWrite,
  numberRead,
  numberWrite,
  stringRead,
  stringWrite,
} from "@redotech/dynamodb/common";
import { envNumberRead, envStringRead } from "@redotech/lambda/env";
import { Handler } from "aws-lambda";
import { JobStatus } from "./job";

const githubAppId = envNumberRead("GITHUB_APP_ID");

const githubPrivateKey = envStringRead("GITHUB_PRIVATE_KEY");

const jobTableName = envStringRead("JOB_TABLE_NAME");

const dynamodbClient = new DynamoDBClient();

const githubClient = new Octokit({
  authStrategy: createAppAuth,
  auth: { appId: githubAppId, privateKey: githubPrivateKey },
});

export interface InstallationSyncEvent {
  installationId: number;
}

export const handler: Handler<InstallationSyncEvent, void> = async (event) => {
  const installationId = event.installationId;

  const response = await githubClient.apps.createInstallationAccessToken({
    installation_id: installationId,
  });
  const token = response.data.token;
  const installationGithubClient = new Octokit({ auth: token });

  await jobsRefresh({ installationGithubClient, installationId });
};

async function jobsRefresh({
  installationGithubClient,
  installationId,
}: {
  installationGithubClient: Octokit;
  installationId: number;
}) {
  for await (const output of paginateQuery(
    { client: dynamodbClient },
    {
      TableName: jobTableName,
      IndexName: "InstallationId",
      KeyConditionExpression: "InstallationId = :installationId",
      FilterExpression: "#status = :status",
      ProjectionExpression: "OrgName, RepoName, Id, UserName",
      ExpressionAttributeValues: {
        ":installationId": numberWrite(installationId),
        ":status": stringWrite(JobStatus.PENDING),
      },
      ExpressionAttributeNames: { "#status": "Status" },
    },
  )) {
    for (const item of output.Items!) {
      const jobId = numberRead(item.Id);
      const repoName = stringRead(item.RepoName);
      const orgName = item.OrgName && stringRead(item.OrgName);
      const userName = item.UserName && stringRead(item.UserName);
      const job = await installationGithubClient.actions.getJobForWorkflowRun({
        owner: orgName ?? userName,
        repo: repoName,
        job_id: jobId,
      });
      if (job.data.status !== "completed") {
        continue;
      }
      await dynamodbClient.send(
        new UpdateItemCommand({
          ConditionExpression: "#status <> :status",
          TableName: jobTableName,
          Key: { Id: numberWrite(jobId) },
          UpdateExpression: "SET ExpiresAt = :expiresAt, #status = :status",
          ExpressionAttributeNames: { "#status": "Status" },
          ExpressionAttributeValues: {
            ":expiresAt": instantWrite(
              Temporal.Now.instant().add({ minutes: 1 }),
            ),
            ":status": stringWrite(JobStatus.COMPLETED),
          },
        }),
      );
    }
  }
}
