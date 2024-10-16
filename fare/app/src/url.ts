import { envStringRead } from "@redotech/lambda/env";
import { Handler } from "aws-lambda";
import { sign } from "jsonwebtoken";

const manifestUrl = envStringRead("MANIFEST_URL");

const secret = envStringRead("SECRET");

export interface AppUrlEvent {
  organization?: string;
}

export interface AppUrlResult {
  url: string;
}

export const handler: Handler<AppUrlEvent, AppUrlResult> = async (event) => {
  const token = sign({}, secret, { expiresIn: "1h" });
  const url = new URL(manifestUrl);
  if (event.organization !== undefined) {
    url.searchParams.set("org", event.organization);
  }
  url.searchParams.set("token", token);
  return { url: url.toString() };
};
