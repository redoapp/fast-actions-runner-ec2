import { Handler } from "aws-lambda";
import { sign } from "jsonwebtoken";

const manifestUrl = process.env.MANIFEST_URL!;

const secret = process.env.SECRET!;

export interface AppUrlEvent {
  org?: string;
}

export interface AppUrlResult {
  url: string;
}

export const handler: Handler<AppUrlEvent, AppUrlResult> = async (event) => {
  const token = sign({ secret }, secret, { expiresIn: "1h" });
  const url = new URL(manifestUrl);
  if (event.org !== undefined) {
    url.searchParams.set("org", event.org);
  }
  url.searchParams.set("token", token);
  return { url: url.toString() };
};
