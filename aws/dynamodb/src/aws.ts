import { ARN, build, parse } from "@aws-sdk/util-arn-parser";
import { AwsCredentialIdentity } from "@smithy/types";
import {
  AttributeCodec,
  AttributeReadError,
  instantAttributeCodec,
  pathEmpty,
  stringAttributeCodec,
} from "./attribute";
import { Item } from "./item";

/**
 * ARN
 */
export const arnAttributeCodec: AttributeCodec<ARN> = {
  read(attribute, path = pathEmpty) {
    const string = stringAttributeCodec.read(attribute, path);
    try {
      return parse(string);
    } catch (error) {
      throw new AttributeReadError(
        `Invalid ARN: ${error instanceof Error ? error.message : error}`,
        path,
      );
    }
  },
  write(value) {
    return stringAttributeCodec.write(build(value));
  },
};

/**
 * AWS credentials
 */
export const credentialsAttributeCodec: AttributeCodec<AwsCredentialIdentity> =
  {
    read(attribute, path = pathEmpty) {
      if (attribute.M === undefined) {
        throw new AttributeReadError("Expected map", path);
      }
      const map = attribute.M;
      return {
        accessKeyId:
          map.AccessKeyId &&
          stringAttributeCodec.read(map.AccessKeyId, [...path, "accessKeyId"]),
        secretAccessKey:
          map.SecretAccessKey &&
          stringAttributeCodec.read(map.SecretAccessKey, [
            ...path,
            "secretAccessKey",
          ]),
        sessionToken:
          map.SessionToken &&
          stringAttributeCodec.read(map.SessionToken, [
            ...path,
            "sessionToken",
          ]),
        expiration:
          map.Expiration &&
          new Date(
            instantAttributeCodec.read(map.Expiration, [
              ...path,
              "expiration",
            ]).epochMilliseconds,
          ),
      };
    },
    write(value) {
      const map: Item = {
        AccessKeyId: stringAttributeCodec.write(value.accessKeyId),
        SecretAccessKey: stringAttributeCodec.write(value.secretAccessKey),
        ...(value.sessionToken !== undefined && {
          SessionToken: stringAttributeCodec.write(value.sessionToken),
        }),
        ...(value.expiration !== undefined && {
          Expiration: instantAttributeCodec.write(
            value.expiration.toTemporalInstant(),
          ),
        }),
      };
      return { M: map };
    },
  };
