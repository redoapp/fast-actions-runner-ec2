/**
 * @file
 * Refresh job statuses for all installations.
 */

import "./polyfill";

import {
  DeleteItemCommand,
  DynamoDBClient,
  paginateQuery,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { Octokit } from "@octokit/rest";
import {
  numberAttributeFormat,
  stringAttributeFormat,
} from "@redotech/dynamodb/attribute";
import { envNumberRead, envStringRead } from "@redotech/lambda/env";
import { Handler } from "aws-lambda";
import { appGithubClient } from "./github";
import {
  JobAspect,
  ProvisionerCandidate,
  provisionerCandidates,
  provisionerMatches,
} from "./provisioner";

const githubAppId = envNumberRead("GITHUB_APP_ID");

const githubPrivateKey = envStringRead("GITHUB_PRIVATE_KEY");

const jobTableName = envStringRead("JOB_TABLE_NAME");

const dynamodbClient = new DynamoDBClient();

const githubClient = appGithubClient(githubAppId, githubPrivateKey);

const provisionerTableName = envStringRead("PROVISIONER_TABLE_NAME");

export interface InstallationSyncEvent {
  installationId: number;
}

export const handler: Handler<InstallationSyncEvent, void> = async (event) => {
  const installationId = event.installationId;
  console.log(`Syncing installation ${installationId}`);

  const installationResponse = await githubClient.apps.getInstallation({
    installation_id: installationId,
  });
  if (!("login" in installationResponse.data.account!)) {
    throw new Error("Invalid");
  }
  const owner = installationResponse.data.account.login;

  const tokenResponse = await githubClient.apps.createInstallationAccessToken({
    installation_id: installationId,
  });
  const token = tokenResponse.data.token;
  const installationGithubClient = new Octokit({ auth: token });

  await jobsRefresh({ installationGithubClient, installationId, owner });
};

async function jobsRefresh({
  installationGithubClient,
  installationId,
  owner,
}: {
  installationGithubClient: Octokit;
  installationId: number;
  owner: string;
}) {
  const provisioners: ProvisionerCandidate[] = [];
  for await (const provisioner of provisionerCandidates({
    dynamodbClient,
    owner,
    provisionerTableName,
  })) {
    provisioners.push(provisioner);
  }

  for await (const output of paginateQuery(
    { client: dynamodbClient },
    {
      TableName: jobTableName,
      KeyConditionExpression: "InstallationId = :installationId",
      ProjectionExpression: "Id, ProvisionerId, RepoName",
      ExpressionAttributeValues: {
        ":installationId": numberAttributeFormat.write(installationId),
      },
    },
  )) {
    for (const item of output.Items!) {
      const jobId = numberAttributeFormat.read(item.Id);
      const repoName = stringAttributeFormat.read(item.RepoName);
      const jobResponse =
        await installationGithubClient.actions.getJobForWorkflowRun({
          owner,
          repo: repoName,
          job_id: jobId,
        });
      if (jobResponse.data.status === "completed") {
        console.log(`Deleting job ${installationId}/${jobId}`);
        await dynamodbClient.send(
          new DeleteItemCommand({
            TableName: jobTableName,
            Key: {
              Id: numberAttributeFormat.write(jobId),
              InstallationId: numberAttributeFormat.write(installationId),
            },
          }),
        );
        continue;
      }

      const job: JobAspect = { labelNames: jobResponse.data.labels, repoName };
      const provisioner = provisioners.find((provisioner) =>
        provisionerMatches(provisioner, job),
      );
      if (
        provisioner?.id ===
        (item.ProvisionerId && stringAttributeFormat.read(item.ProvisionerId))
      ) {
        continue;
      }
      if (provisioner) {
        console.log(
          `Found provisioner ${provisioner.id} for ${owner}/${repoName} ${job.labelNames}`,
        );
        await dynamodbClient.send(
          new UpdateItemCommand({
            ConditionExpression: "attribute_exists(Id)",
            Key: {
              Id: numberAttributeFormat.write(jobId),
              InstallationId: numberAttributeFormat.write(installationId),
            },
            TableName: jobTableName,
            UpdateExpression: "SET ProvisionerId = :provisionerId",
            ExpressionAttributeValues: {
              ":provisionerId": stringAttributeFormat.write(provisioner.id),
            },
          }),
        );
      } else {
        console.log(
          `No provisioner found for ${owner}/${repoName} ${job.labelNames}`,
        );
        await dynamodbClient.send(
          new UpdateItemCommand({
            ConditionExpression: "attribute_exists(Id)",
            Key: {
              Id: numberAttributeFormat.write(jobId),
              InstallationId: numberAttributeFormat.write(installationId),
            },
            TableName: jobTableName,
            UpdateExpression: "REMOVE ProvisionerId",
          }),
        );
      }
    }
  }
}
