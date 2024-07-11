import { envStringRead } from "@redotech/lambda/env";
import { LambdaFunctionURLHandler } from "aws-lambda";
import { html } from "./react";

const appName = envStringRead("APP_NAME");

const callbackUrl = envStringRead("CALLBACK_URL");

const webhookUrl = envStringRead("WEBHOOK_URL");

export const handler: LambdaFunctionURLHandler = async (event) => {
  const orgName = event.queryStringParameters!.org;
  const token = event.queryStringParameters!.token;
  if (!token) {
    return {
      body: "Missing token",
      headers: { "Content-Type": "text/plain" },
      statusCode: 401,
    };
  }
  const manifest_ = manifest({ appName, callbackUrl, webhookUrl });
  const html_ = html(
    <ManifestPage
      appName={appName}
      manifest={manifest_}
      orgName={orgName}
      token={token}
    />,
  );
  return {
    body: html_,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  };
};

export interface ManifestProvider {
  ({
    appName,
    orgName,
    token,
  }: {
    appName: string;
    orgName: string | undefined;
    token: string;
  }): Promise<{ html: string }>;
}

function manifest({
  callbackUrl,
  appName,
  webhookUrl,
}: {
  appName: string;
  callbackUrl: string;
  webhookUrl: string;
}) {
  return {
    default_events: ["workflow_job"],
    default_permissions: { runners: "write" },
    hook_attributes: { url: webhookUrl },
    name: appName,
    public: false,
    redirect_url: callbackUrl,
    url: "https://github.com/redoapp/fact-actions-ec2-runner",
  };
}

const githubUrl = new URL("https://github.com");

function ManifestPage({
  appName,
  manifest,
  orgName,
  token,
}: {
  appName: string;
  manifest: any;
  orgName: string | undefined;
  token: string;
}) {
  let url: URL;
  if (orgName !== undefined) {
    url = new URL(
      `/organizations/${encodeURIComponent(orgName)}/settings/apps/new`,
      githubUrl,
    );
  } else {
    url = new URL("/settings/apps/new", githubUrl);
  }
  url.searchParams.set("state", token);
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
      <body>
        <form action={url.toString()} method="post">
          Create a GitHub app for {appName}:
          <input
            name="manifest"
            type="hidden"
            value={JSON.stringify(manifest)}
          />
          <br />
          <input type="submit" value="Submit" />
        </form>
      </body>
    </html>
  );
}
