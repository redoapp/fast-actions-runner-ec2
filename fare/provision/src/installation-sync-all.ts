/**
 * @file
 * Start installation sync for all installations.
 */

import "./polyfill";

import {
  InvocationType,
  InvokeCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import { envNumberRead, envStringRead } from "@redotech/lambda/env";
import { ScheduledHandler } from "aws-lambda";
import { appGithubClient } from "./github";
import { InstallationSyncEvent } from "./installation-sync";

const githubAppId = envNumberRead("GITHUB_APP_ID");

const githubPrivateKey = envStringRead("GITHUB_PRIVATE_KEY");

const githubClient = appGithubClient(githubAppId, githubPrivateKey);

const installationSyncName = envStringRead("INSTALLATION_SYNC_NAME");

const lambdaClient = new LambdaClient();

export const handler: ScheduledHandler = async () => {
  const installations = await githubClient.paginate(
    "GET /app/installations",
    { per_page: 100 },
    (response) =>
      response.data.map((installation) => ({ id: installation.id })),
  );
  for (const installation of installations) {
    console.log(`Starting syncing installation ${installation.id}`);
    const event: InstallationSyncEvent = { installationId: installation.id };
    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: installationSyncName,
        InvocationType: InvocationType.Event,
        Payload: JSON.stringify(event),
      }),
    );
  }
};
