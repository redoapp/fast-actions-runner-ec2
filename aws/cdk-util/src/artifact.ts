import { CfnParameter } from "aws-cdk-lib/core";
import { Construct } from "constructs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { s3UrlRead } from "./s3";

export const artifactUrl = readFileSync(join(__dirname, "s3-url.txt"), "utf-8");

export const {
  bucket: artifactS3Bucket,
  region: artifactAwsRegion,
  key: artifactS3KeyPrefix,
} = s3UrlRead(artifactUrl);

export function artifactParams(scope: Construct) {
  const artifactUrlParam = new CfnParameter(scope, "ArtifactUrl", {
    description: "Artifact URL",
    default: `https://${artifactS3Bucket}.s3.${artifactAwsRegion}.amazonaws.com/${artifactS3KeyPrefix}`,
  });
  const artifactUrl = artifactUrlParam.valueAsString;

  const paramGroup = {
    Label: { default: "Assets" },
    Parameters: [artifactUrlParam.logicalId],
  };

  const paramLabels = {
    [artifactUrlParam.logicalId]: { default: "Artifact URL" },
  };

  return { artifactUrl, paramGroup, paramLabels };
}
