import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { parse } from "@aws-sdk/util-arn-parser";
import { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { inspect } from "node:util";
import {
  GithubEventHeader,
  GithubSignatureHeader,
  GithubWebhookBodyMalformedError,
  GithubWebhookSignatureInvalidError,
  GithubWebhookSignatureMissingError,
} from "./github";
import { bodyString } from "./lambda";
import { WebhookUnexpectedEventError, webhook } from "./webhook";

const dynamodbJobTableArn = parse(process.env.DYNAMODB_JOB_TABLE_ARN!);

const dynamodbRunnerTableArn = parse(process.env.DYNAMODB_RUNNER_TABLE_ARN!);

const githubWebhookSecretParam = parse(
  process.env.GITHUB_WEBHOOK_SECRET_PARAM!,
);

const runnerLabels = new Set(process.env.RUNNER_LABELS!.split(","));

const sqsQueueArn = parse(process.env.SQS_QUEUE_ARN!);

const queueExpiration = 1000 * +process.env.QUEUE_EXPIRATION_S!;

const ssmClient = new SSMClient({ region: githubWebhookSecretParam.region });

const githubWebhookSecret = (async () => {
  try {
    const result = await ssmClient.send(
      new GetParameterCommand({
        Name: githubWebhookSecretParam.resource.slice("parameter".length),
        WithDecryption: true,
      }),
    );
    return result.Parameter!.Value!;
  } catch (e) {
    throw new Error("Failed to get GitHub webhook secret", { cause: e });
  }
})();

const webhookFn = (async () =>
  webhook({
    dynamodbJobTableArn: dynamodbJobTableArn,
    dynamodbRunnerTableArn: dynamodbRunnerTableArn,
    githubWebhookSecret: await githubWebhookSecret,
    queueExpiration,
    runnerLabels,
    sqsQueueArn,
  }))();

export const handler: APIGatewayProxyHandlerV2 = async (
  event,
): Promise<APIGatewayProxyResultV2> => {
  try {
    if (event.requestContext.http.method === "OPTIONS") {
      return { headers: { Allow: "POST" }, statusCode: 204 };
    }

    if (event.requestContext.http.method !== "POST") {
      return {
        headers: { Allow: "POST" },
        body: JSON.stringify({ message: "Method not allowed" }),
        statusCode: 405,
      };
    }

    const eventType = event.headers[GithubEventHeader.toLowerCase()];
    const body = bodyString(event);
    const signature = event.headers[GithubSignatureHeader.toLowerCase()];

    try {
      await (
        await webhookFn
      )({ body, event: eventType, signature });
    } catch (e) {
      if (e instanceof GithubWebhookBodyMalformedError) {
        return {
          body: e.message,
          headers: { "Content-Type": "text/plain" },
          statusCode: 400,
        };
      }
      if (e instanceof GithubWebhookSignatureMissingError) {
        return {
          body: e.message,
          headers: { "Content-Type": "text/plain" },
          statusCode: 401,
        };
      }
      if (e instanceof GithubWebhookSignatureInvalidError) {
        return {
          body: e.message,
          headers: { "Content-Type": "text/plain" },
          statusCode: 401,
        };
      }
      if (e instanceof WebhookUnexpectedEventError) {
        return {
          body: e.message,
          headers: { "Content-Type": "text/plain" },
          statusCode: 400,
        };
      }
      throw e;
    }
    return { statusCode: 204 };
  } catch (e) {
    return {
      body: inspect(e),
      headers: { "Content-Type": "text/plain" },
      statusCode: 500,
    };
  }
};
