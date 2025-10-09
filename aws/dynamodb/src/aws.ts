import { ARN, build, parse } from "@aws-sdk/util-arn-parser";
import { AwsCredentialIdentity } from "@smithy/types";
import {
  AttributeCodec,
  instantAttributeCodec,
  stringAttributeCodec,
} from "./attribute";
import { Item } from "./item";

export const arnAttributeCodec: AttributeCodec<ARN> = {
  read(attribute) {
    return parse(stringAttributeCodec.read(attribute));
  },
  write(value) {
    return stringAttributeCodec.write(build(value));
  },
};

export const credentialsAttributeCodec: AttributeCodec<AwsCredentialIdentity> =
  {
    read(attribute) {
      if (attribute.M === undefined) {
        throw new Error("Expected map");
      }
      const map = attribute.M;
      return {
        accessKeyId:
          map.AccessKeyId && stringAttributeCodec.read(map.AccessKeyId),
        secretAccessKey:
          map.SecretAccessKey && stringAttributeCodec.read(map.SecretAccessKey),
        sessionToken:
          map.SessionToken && stringAttributeCodec.read(map.SessionToken),
        expiration:
          map.Expiration &&
          new Date(
            instantAttributeCodec.read(map.Expiration).epochMilliseconds,
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
