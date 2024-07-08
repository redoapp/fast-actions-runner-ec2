export interface S3ObjectRef {
  region: string;
  bucket: string;
  key: string;
}

export function s3UrlRead(url: string): S3ObjectRef {
  const match = url.match(
    /https:\/\/(?<bucket>.+)\.s3\.(?<region>.+)\.amazonaws\.com\/(?<key>.+)/,
  );

  if (!match) {
    throw new Error(`Invalid S3 URL: ${url}`);
  }
  return {
    region: url,
    bucket: match.groups!.bucket,
    key: match.groups!.key,
  };
}

export function s3UrlWrite(ref: S3ObjectRef) {
  return `https://${ref.bucket}.s3.${ref.region}.amazonaws.com/${ref.key}`;
}
