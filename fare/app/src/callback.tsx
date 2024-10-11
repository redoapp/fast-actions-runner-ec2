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
  if (code === undefined) {
    return {
      body: "Missing code",
      headers: { "Content-Type": "text/plain" },
      statusCode: 400,
    };
  }

  const state = event.queryStringParameters!.state;
  if (state === undefined) {
    return {
      body: "Missing state",
      headers: { "Content-Type": "text/plain" },
      statusCode: 400,
    };
  }
  try {
    verify(state, secret);
  } catch (e) {
    return {
      body: `Invalid state: ${e}`,
      headers: { "Content-Type": "text/plain" },
      statusCode: 400,
    };
  }

  const response = await githubClient.apps.createFromManifest({ code });

  const githubAppId = response.data.id.toString();
  const githubPrivateKey = response.data.pem;
  const webhookSecret = response.data.webhook_secret!;

  await Promise.all([
    ssmClient.send(
      new PutParameterCommand({
        Name: githubAppIdName,
        Value: githubAppId,
        Type: "String",
      }),
    ),
    ssmClient.send(
      new PutParameterCommand({
        Name: githubPrivateKeyName,
        Value: githubPrivateKey,
        Type: "SecureString",
      }),
    ),
    ssmClient.send(
      new PutParameterCommand({
        Name: webhookSecretName,
        Value: webhookSecret,
        Type: "SecureString",
      }),
    ),
  ]);

  const html_ = html(<Complete appName={appName} />);

  return {
    body: html_,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    statusCode: 200,
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
