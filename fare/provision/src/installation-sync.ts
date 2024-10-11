/**
 * @file
 * Refresh job statuses for all installations.
 */

import "./polyfill";

import {
  DynamoDBClient,
  UpdateItemCommand,
  paginateQuery,
} from "@aws-sdk/client-dynamodb";
import { Octokit } from "@octokit/rest";
import {
  instantAttributeFormat,
  numberAttributeFormat,
  stringAttributeFormat,
} from "@redotech/dynamodb/attribute";
import { envNumberRead, envStringRead } from "@redotech/lambda/env";
import { Handler } from "aws-lambda";
import { appGithubClient } from "./github";
import { JobStatus } from "./job";

const githubAppId = envNumberRead("GITHUB_APP_ID");

const githubPrivateKey = envStringRead("GITHUB_PRIVATE_KEY");

const jobTableName = envStringRead("JOB_TABLE_NAME");

const dynamodbClient = new DynamoDBClient();

const githubClient = appGithubClient(githubAppId, githubPrivateKey);

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
      KeyConditionExpression: "InstallationId = :installationId",
      FilterExpression: "#status = :status",
      IndexName: "InstallationId",
      ProjectionExpression: "OrgName, RepoName, Id, UserName",
      ExpressionAttributeValues: {
        ":installationId": numberAttributeFormat.write(installationId),
        ":status": stringAttributeFormat.write(JobStatus.PENDING),
      },
      ExpressionAttributeNames: { "#status": "Status" },
    },
  )) {
    for (const item of output.Items!) {
      const jobId = numberAttributeFormat.read(item.Id);
      const repoName = stringAttributeFormat.read(item.RepoName);
      const orgName = item.OrgName && stringAttributeFormat.read(item.OrgName);
      const userName =
        item.UserName && stringAttributeFormat.read(item.UserName);
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
          ConditionExpression: "#status <> :completed",
          TableName: jobTableName,
          Key: { Id: numberAttributeFormat.write(jobId) },
          UpdateExpression: "SET ExpiresAt = :expiresAt, #status = :status",
          ExpressionAttributeNames: { "#status": "Status" },
          ExpressionAttributeValues: {
            ":expiresAt": instantAttributeFormat.write(
              Temporal.Now.instant().add({ minutes: 1 }),
            ),
            ":completed": stringAttributeFormat.write(JobStatus.COMPLETED),
          },
        }),
      );
    }
  }
}
