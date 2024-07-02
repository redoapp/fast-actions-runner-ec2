import { WebhookEvent } from "@octokit/webhooks-types";
import { ValidateFunction } from "ajv";

declare const ajv: ValidateFunction<WebhookEvent>;

export = ajv;
