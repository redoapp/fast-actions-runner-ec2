import { CfnParameter } from "aws-cdk-lib/core";
import { Construct } from "constructs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const artifactRegion = readFileSync(
  join(__dirname, "artifact/region.txt"),
  "utf-8",
);

const artifactS3Bucket = readFileSync(
  join(__dirname, "artifact/s3-bucket.txt"),
  "utf-8",
);

const artifactS3KeyPrefix = readFileSync(
  join(__dirname, "artifact/s3-key-prefix.txt"),
  "utf-8",
);

export function artifactParams(scope: Construct) {
  const artifactDomainParam = new CfnParameter(scope, "ArtifactDomain", {
    description: "Artifact Domain",
    default: "amazonaws.com",
    minLength: 1,
  });
  const artifactDomain = artifactDomainParam.valueAsString;

  const artifactRegionParam = new CfnParameter(scope, "ArtifactRegion", {
    description: "Artifact Region",
    default: artifactRegion,
    minLength: 1,
  });
  const artifactRegion_ = artifactRegionParam.valueAsString;

  const artifactS3BucketParam = new CfnParameter(scope, "ArtifactS3Bucket", {
    description: "Artifact S3 Bucket",
    default: artifactS3Bucket,
    minLength: 1,
  });
  const artifactS3Bucket_ = artifactS3BucketParam.valueAsString;

  const artifactS3KeyPrefixParam = new CfnParameter(
    scope,
    "ArtifactS3KeyPrefix",
    {
      description: "Artifact S3 Key Prefix",
      default: artifactS3KeyPrefix,
    },
  );
  const artifactS3KeyPrefix_ = artifactS3KeyPrefixParam.valueAsString;

  const paramGroup = {
    Label: { default: "Artifacts" },
    Parameters: [
      artifactDomainParam.logicalId,
      artifactRegionParam.logicalId,
      artifactS3BucketParam.logicalId,
      artifactS3KeyPrefixParam.logicalId,
    ],
  };

  const paramLabels = {
    [artifactDomainParam.logicalId]: { default: "Artifact Domain" },
    [artifactRegionParam.logicalId]: { default: "Artifact URL" },
    [artifactS3BucketParam.logicalId]: { default: "Artifact S3 Bucket" },
    [artifactS3KeyPrefixParam.logicalId]: { default: "Artifact S3 Key Prefix" },
  };

  return {
    artifactDomain,
    artifactRegion: artifactRegion_,
    artifactS3Bucket: artifactS3Bucket_,
    artifactS3KeyPrefix: artifactS3KeyPrefix_,
    paramGroup,
    paramLabels,
  };
}
