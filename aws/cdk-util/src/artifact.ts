import { s3Url } from "./s3";

export const artifactS3Bucket = "__ARTIFACT_S3_BUCKET__";

export const artifactS3KeyPrefix = "__ARTIFACT_S3_KEY_PREFIX__";

export const artifactAwsRegion = "__ARTIFACT_AWS_REGION__";

export function artifactUrl(key: string) {
  return s3Url(
    artifactAwsRegion,
    artifactS3Bucket,
    `${artifactS3KeyPrefix}${key}`,
  );
}
