import {
  InvocationType,
  InvokeCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { envNumberRead, envStringRead } from "@redotech/lambda/env";
import { ScheduledHandler } from "aws-lambda";

const githubAppId = envNumberRead("GITHUB_APP_ID");

const githubPrivateKey = envStringRead("GITHUB_PRIVATE_KEY");

const githubClient = new Octokit({
  authStrategy: createAppAuth,
  auth: { appId: githubAppId, privateKey: githubPrivateKey },
});

const installationSyncName = envStringRead("INSTALLATION_SYNC_NAME");

const lambdaClient = new LambdaClient();

export const handler: ScheduledHandler = async (event) => {
  const installations = await githubClient.paginate(
    "GET /app/installations",
    { per_page: 100 },
    (response) =>
      response.data.map((installation) => ({ id: installation.id })),
  );
  for (const installation of installations) {
    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: installationSyncName,
        InvocationType: InvocationType.Event,
        Payload: JSON.stringify({ installationId: installation.id }),
      }),
    );
  }
};
