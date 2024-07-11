import { PutParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { Octokit } from "@octokit/rest";
import { envStringRead } from "@redotech/lambda/env";
import { LambdaFunctionURLHandler } from "aws-lambda";
import { verify } from "jsonwebtoken";
import { html } from "./react";

const appName = envStringRead("APP_NAME");

const githubAppIdName = envStringRead("GITHUB_APP_ID_NAME");

const githubPrivateKeyName = envStringRead("GITHUB_PRIVATE_KEY_NAME");

const webhookSecretName = envStringRead("WEBHOOK_SECRET_NAME");

const secret = envStringRead("SECRET");

const githubClient = new Octokit();

const ssmClient = new SSMClient();

export const handler: LambdaFunctionURLHandler = async (event) => {
  const code = event.queryStringParameters!.code;
  if (!code) {
    return {
      body: "Missing code",
      headers: { "Content-Type": "text/plain" },
      statusCode: 400,
    };
  }

  const state = event.queryStringParameters!.state || "";
  verify(state, secret);

  const response = await githubClient.apps.createFromManifest({ code });

  const setGithubAppId = async () => {
    await ssmClient.send(
      new PutParameterCommand({
        Name: githubAppIdName,
        Value: response.data.id.toString(),
        Type: "String",
      }),
    );
  };

  const setGithubPrivateKey = async () => {
    await ssmClient.send(
      new PutParameterCommand({
        Name: githubPrivateKeyName,
        Value: response.data.pem,
        Type: "SecureString",
      }),
    );
  };

  const setWebhookSecret = async () => {
    await ssmClient.send(
      new PutParameterCommand({
        Name: webhookSecretName,
        Value: response.data.webhook_secret!,
        Type: "SecureString",
      }),
    );
  };

  await Promise.all([
    setGithubAppId(),
    setGithubPrivateKey(),
    setWebhookSecret(),
  ]);

  const html_ = html(<Complete appName={appName} />);

  return {
    body: html_,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  };
};

function Complete({ appName }: { appName: string }) {
  return (
    <html>
      <head>
        <meta name="author" content="Fast Actions Runner for EC2" />
        <meta
          name="description"
          content="GitHub app setup for Fast Actions Runner for EC2"
        />
        <title>{appName}</title>
      </head>
      <body>Setup complete for {appName}.</body>
    </html>
  );
}
