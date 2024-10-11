import { rlocation } from "@better-rules-javascript/bazel-runfiles";
import { readFileSync } from "node:fs";

export function digestKey(path: string) {
  const resolved = rlocation(path);
  if (resolved === undefined) {
    throw new Error(`Missing ${path}`);
  }
  return readFileSync(resolved, "hex").slice(0, 8);
}
