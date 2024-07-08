import { MessageAttributeValue } from "@aws-sdk/client-sqs";

export function sqsStringWrite(string: string): MessageAttributeValue {
  return { DataType: "String", StringValue: string };
}
