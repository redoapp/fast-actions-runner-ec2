import { MessageAttributeValue } from "@aws-sdk/client-sqs";
import { SQSMessageAttribute, SQSMessageAttributes } from "aws-lambda";

export function sqsInstantRead(
  attribute: SQSMessageAttribute,
): Temporal.Instant {
  if (attribute.dataType !== "String.Timestamp") {
    throw new Error("Expected String.Timestamp");
  }
  if (attribute.stringValue === undefined) {
    throw new Error("Expected stringValue");
  }
  return Temporal.Instant.from(attribute.stringValue);
}

export function attributeWrite(
  attribute: SQSMessageAttribute,
): MessageAttributeValue {
  if (attribute.binaryValue ?? attribute.binaryListValues) {
    throw new Error("Binary values not supported");
  }
  return {
    DataType: attribute.dataType,
    StringValue: attribute.stringValue,
    StringListValues: attribute.stringListValues,
  };
}

export function attributesWrite(
  attributes: SQSMessageAttributes,
): Record<string, MessageAttributeValue> {
  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [
      key,
      attributeWrite(value),
    ]),
  );
}
