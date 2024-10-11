import { rlocation } from "@redotech/terraform-util/runfiles";
import { Fn } from "cdktf";
import { Construct } from "constructs";

export function digest(scope: Construct, path: string) {
  return Fn.file(rlocation(scope, path));
}

export function digestKey(digest: string) {
  return Fn.substr(digest, 0, 8);
}
