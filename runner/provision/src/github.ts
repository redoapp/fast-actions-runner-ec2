import {
  AttributeValue,
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { Octokit } from "@octokit/rest";
import { Schema } from "@octokit/webhooks-types";
import {
  instantRead,
  instantWrite,
  stringRead,
  stringWrite,
} from "@redotech/dynamodb/common";
import { Item } from "@redotech/dynamodb/item";
import {
  GithubEventHeader,
  GithubSignatureHeader,
  GithubWebhookBodyMalformedError,
  GithubWebhookSignatureInvalidError,
  githubWebhookRead,
} from "@redotech/github-webhook";
import { bodyString } from "@redotech/lambda/api-gateway";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

export async function githubWebhook(
  event: APIGatewayProxyEventV2,
  { secret }: { secret: string },
  handle: (
    eventType: string,
    event: Schema,
  ) => Promise<APIGatewayProxyResultV2>,
): Promise<APIGatewayProxyResultV2> {
  switch (event.requestContext.http.method) {
    case "OPTIONS":
      return { headers: { Allow: "POST" }, statusCode: 204 };
    case "POST":
      break;
    default:
      return {
        headers: { Allow: "POST" },
        body: JSON.stringify({ message: "Method not allowed" }),
        statusCode: 405,
      };
  }

  const eventType = event.headers[GithubEventHeader.toLowerCase()];
  const signature = event.headers[GithubSignatureHeader.toLowerCase()];

  if (eventType === undefined) {
    return {
      body: "Missing event type",
      headers: { "Content-Type": "text/plain" },
      statusCode: 400,
    };
  }
  if (signature === undefined) {
    return {
      body: "Missing signature",
      headers: { "Content-Type": "text/plain" },
      statusCode: 401,
    };
  }

  const body = bodyString(event);

  let webhookEvent: Schema;
  try {
    webhookEvent = await githubWebhookRead({ body, signature }, { secret });
  } catch (e) {
    if (e instanceof GithubWebhookBodyMalformedError) {
      return {
        body: e.message,
        headers: { "Content-Type": "text/plain" },
        statusCode: 400,
      };
    }
    if (e instanceof GithubWebhookSignatureInvalidError) {
      return {
        body: e.message,
        headers: { "Content-Type": "text/plain" },
        statusCode: 401,
      };
    }
    throw e;
  }

  return handle(eventType, webhookEvent);
}

const expirationMargin = Temporal.Duration.from({ minutes: 1 });

export interface InstallationClient {
  client: Octokit;
  orgName: string | undefined;
  userName: string | undefined;
}

export async function provisionerInstallationClient({
  dynamodbClient,
  provisionerTableName,
  githubClient,
  provisionerId,
}: {
  dynamodbClient: DynamoDBClient;
  githubClient: Octokit;
  provisionerTableName: string;
  provisionerId: string;
}): Promise<InstallationClient> {
  const { token, orgName, userName } = await providerAccess({
    dynamodbClient,
    provisionerTableName,
    githubClient,
    provisionerId,
  });
  return { client: new Octokit({ auth: token }), orgName, userName };
}

interface AccessToken {
  token: string;
  expiresAt: Temporal.Instant;
}

function accessTokenWrite(accessToken: AccessToken): AttributeValue {
  const map: Item = {
    Token: stringWrite(accessToken.token),
    ExpiresAt: instantWrite(accessToken.expiresAt),
  };
  return { M: map };
}

function accessTokenRead(item: AttributeValue): AccessToken {
  if (!item.M) {
    throw new Error("Expected a map");
  }
  const map = item.M;
  return {
    token: stringRead(map.Token),
    expiresAt: instantRead(map.ExpiresAt),
  };
}

async function providerAccess({
  dynamodbClient,
  provisionerTableName,
  githubClient,
  provisionerId,
}: {
  dynamodbClient: DynamoDBClient;
  githubClient: Octokit;
  provisionerTableName: string;
  provisionerId: string;
}): Promise<{
  orgName: string | undefined;
  token: string;
  userName: string | undefined;
}> {
  const output = await dynamodbClient.send(
    new GetItemCommand({
      Key: { Id: stringWrite(provisionerId) },
      TableName: provisionerTableName,
      ProjectionExpression: "AccessToken, OrgName, UserName",
    }),
  );
  const item = output.Item;
  if (!item) {
    throw new Error(`No provisioner ${provisionerId}`);
  }

  const userName = item.UserName && stringRead(item.UserName);
  const orgName = item.OrgName && stringRead(item.OrgName);
  let accessToken = item.AccessToken && accessTokenRead(item.AccessToken);

  if (
    !accessToken ||
    Temporal.Instant.compare(
      accessToken.expiresAt,
      Temporal.Now.instant().add(expirationMargin),
    ) <= 0
  ) {
    let installationResponse:
      | Awaited<ReturnType<typeof githubClient.apps.getOrgInstallation>>
      | Awaited<ReturnType<typeof githubClient.apps.getUserInstallation>>;
    if (orgName != undefined) {
      installationResponse = await githubClient.apps.getOrgInstallation({
        org: orgName,
      });
    } else {
      installationResponse = await githubClient.apps.getUserInstallation({
        username: userName,
      });
    }
    const installationId = installationResponse.data.id;

    const response = await githubClient.apps.createInstallationAccessToken({
      installation_id: installationId,
    });
    accessToken = {
      token: response.data.token,
      expiresAt: Temporal.Instant.from(response.data.expires_at),
    };

    await dynamodbClient.send(
      new UpdateItemCommand({
        ConditionExpression: "attribute_exists(Id)",
        Key: { Id: stringWrite(provisionerId) },
        TableName: provisionerTableName,
        UpdateExpression: "SET AccessToken = :accessToken",
        ExpressionAttributeValues: {
          ":accessToken": accessTokenWrite(accessToken),
        },
      }),
    );
  }

  return { orgName, userName, token: accessToken.token };
}
