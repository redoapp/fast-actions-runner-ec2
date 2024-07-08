import { AttributeValue } from "@aws-sdk/client-dynamodb";
import { ARN, build, parse } from "@aws-sdk/util-arn-parser";
import { AwsCredentialIdentity } from "@smithy/types";
import { instantRead, instantWrite, stringRead, stringWrite } from "./common";
import { Item } from "./item";

export function arnRead(attribute: AttributeValue) {
  return parse(stringRead(attribute));
}

export function arnWrite(value: ARN): AttributeValue {
  return stringWrite(build(value));
}

export function credentialsRead(
  attribute: AttributeValue,
): AwsCredentialIdentity {
  if (attribute.M === undefined) {
    throw new Error("Expected map");
  }
  const map = attribute.M;
  return {
    accessKeyId: map.AccessKeyId && stringRead(map.AccessKeyId),
    secretAccessKey: map.SecretAccessKey && stringRead(map.SecretAccessKey),
    sessionToken: map.SessionToken && stringRead(map.SessionToken),
    expiration:
      map.Expiration && new Date(instantRead(map.Expiration).epochMilliseconds),
  };
}

export function credentialsWrite(
  credentials: AwsCredentialIdentity,
): AttributeValue {
  const map: Item = {
    AccessKeyId: stringWrite(credentials.accessKeyId),
    SecretAccessKey: stringWrite(credentials.secretAccessKey),
    ...(credentials.sessionToken !== undefined && {
      SessionToken: stringWrite(credentials.sessionToken),
    }),
    ...(credentials.expiration !== undefined && {
      Expiration: instantWrite(credentials.expiration.toTemporalInstant()),
    }),
  };
  return { M: map };
}
