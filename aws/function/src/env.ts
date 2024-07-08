import { ARN, parse } from "@aws-sdk/util-arn-parser";

export function envArnRead(name: string): ARN {
  const value = envStringRead(name);
  try {
    return parse(value);
  } catch {
    throw new Error(`Invalid ARN for ${name}`);
  }
}

export function envNumberRead(name: string): number {
  const value = +envStringRead(name);
  if (isNaN(value)) {
    throw new Error(`Invalid number for ${name}`);
  }
  return value;
}

export function envStringRead(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var ${name}`);
  }
  return value;
}

export function envStringReadOpt(name: string): string | undefined {
  return process.env[name];
}

export function envUrlRead(name: string): URL {
  const value = envStringRead(name);
  try {
    return new URL(value);
  } catch {
    throw new Error(`Invalid URL for ${name}`);
  }
}
