import { Fn, Lazy, TerraformVariable } from "cdktf";
import { Construct } from "constructs";

const RUNFILES_DIR_KEY = "RunfilesDir";

export function runfilesDirVar(scope: Construct): () => void {
  let runfilesDirValue: string;
  const runfilesDir = Lazy.stringValue({ produce: () => runfilesDirValue });
  scope.node.setContext(RUNFILES_DIR_KEY, runfilesDir);

  return () => {
    const variable = new TerraformVariable(scope, "runfiles_dir", {
      description: "Bazel runfiles directory",
      type: "string",
    });
    runfilesDirValue = variable.value;
  };
}

export function runfilesDir(scope: Construct): string {
  const runfilesDir = scope.node.tryGetContext(RUNFILES_DIR_KEY);
  if (runfilesDir === undefined) {
    throw new Error("RunfilesDir not in context");
  }
  return runfilesDir;
}

export function rlocation(scope: Construct, path: string): string {
  const runfilesDir_ = runfilesDir(scope);
  return Fn.join("/", [runfilesDir_, path]);
}
