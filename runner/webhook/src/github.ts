import { verify } from "@octokit/webhooks-methods";
import { WebhookEvent } from "@octokit/webhooks-types";
import * as eventValidate from "@redotech/github-webhook/event-validate";

export const GithubSignatureHeader = "X-Hub-Signature-256";

export const GithubEventHeader = "X-GitHub-Event";

export async function githubWebhookRead(
  request: GithubWebhookRequest,
  { secret }: { secret: string },
): Promise<WebhookEvent> {
  if (request.signature === undefined) {
    throw new GithubWebhookSignatureMissingError();
  }
  let verified;
  try {
    verified = await verify(secret, request.body, request.signature);
  } catch (e) {
    throw new GithubWebhookSignatureInvalidError(String(e));
  }
  if (!verified) {
    throw new GithubWebhookSignatureInvalidError();
  }

  let event: unknown;
  try {
    event = JSON.parse(request.body);
  } catch (e) {
    throw new GithubWebhookBodyMalformedError(String(e));
  }
  if (!eventValidate(event)) {
    throw new GithubWebhookBodyMalformedError(
      eventValidate.errors![0].message || "",
    );
  }

  return event;
}

export interface GithubWebhookRequest {
  body: string;
  event?: string;
  signature?: string;
}

export class GithubWebhookSignatureMissingError extends Error {
  constructor() {
    super("Missing signature");
  }
}

export class GithubWebhookSignatureInvalidError extends Error {
  constructor(detail?: string) {
    super("Invalid signature" + (detail ? `: ${detail}` : ""));
  }
}

export class GithubWebhookBodyMalformedError extends Error {
  constructor(detail: string) {
    super(`Malformed body: ${detail}`);
  }
}
