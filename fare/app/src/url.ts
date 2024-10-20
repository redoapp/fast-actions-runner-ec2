import { envStringRead } from "@redotech/lambda/env";
import { Handler } from "aws-lambda";
import { sign } from "jsonwebtoken";

const manifestUrl = envStringRead("MANIFEST_URL");

const secret = envStringRead("SECRET");

export interface AppUrlResult {
  url: string;
}

export const handler: Handler<unknown, AppUrlResult> = async () => {
  const token = sign({}, secret, { expiresIn: "1h" });
  const url = new URL(manifestUrl);
  url.searchParams.set("token", token);
  return { url: url.toString() };
};
