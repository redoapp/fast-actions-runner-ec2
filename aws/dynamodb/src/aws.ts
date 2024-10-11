import { ARN, build, parse } from "@aws-sdk/util-arn-parser";
import { AwsCredentialIdentity } from "@smithy/types";
import {
  AttributeFormat,
  instantAttributeFormat,
  stringAttributeFormat,
} from "./attribute";
import { Item } from "./item";

export const arnAttributeFormat: AttributeFormat<ARN> = {
  read(attribute) {
    return parse(stringAttributeFormat.read(attribute));
  },
  write(value) {
    return stringAttributeFormat.write(build(value));
  },
};

export const credentialsAttributeFormat: AttributeFormat<AwsCredentialIdentity> =
  {
    read(attribute) {
      if (attribute.M === undefined) {
        throw new Error("Expected map");
      }
      const map = attribute.M;
      return {
        accessKeyId:
          map.AccessKeyId && stringAttributeFormat.read(map.AccessKeyId),
        secretAccessKey:
          map.SecretAccessKey &&
          stringAttributeFormat.read(map.SecretAccessKey),
        sessionToken:
          map.SessionToken && stringAttributeFormat.read(map.SessionToken),
        expiration:
          map.Expiration &&
          new Date(
            instantAttributeFormat.read(map.Expiration).epochMilliseconds,
          ),
      };
    },
    write(value) {
      const map: Item = {
        AccessKeyId: stringAttributeFormat.write(value.accessKeyId),
        SecretAccessKey: stringAttributeFormat.write(value.secretAccessKey),
        ...(value.sessionToken !== undefined && {
          SessionToken: stringAttributeFormat.write(value.sessionToken),
        }),
        ...(value.expiration !== undefined && {
          Expiration: instantAttributeFormat.write(
            value.expiration.toTemporalInstant(),
          ),
        }),
      };
      return { M: map };
    },
  };
