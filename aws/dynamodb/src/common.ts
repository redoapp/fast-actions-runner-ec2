import { AttributeValue } from "@aws-sdk/client-dynamodb";

export function bufferRead(attribute: AttributeValue) {
  if (attribute.B === undefined) {
    throw new Error("Expected binary");
  }
  return attribute.B;
}

export function bufferWrite(value: Buffer): AttributeValue {
  return { B: value };
}

export function durationRead(attribute: AttributeValue) {
  if (attribute.N === undefined) {
    throw new Error("Expected number");
  }
  return Temporal.Duration.from({
    milliseconds: Math.round(+attribute.N * 1000),
  });
}

export function durationWrite(value: Temporal.Duration): AttributeValue {
  return { N: value.total("seconds").toString() };
}

export function instantRead(attribute: AttributeValue) {
  if (attribute.N === undefined) {
    throw new Error("Expected number");
  }
  return Temporal.Instant.fromEpochSeconds(+attribute.N);
}

export function instantWrite(value: Temporal.Instant): AttributeValue {
  return { N: (value.epochMilliseconds / 1000).toString() };
}

export function numberRead(attribute: AttributeValue) {
  if (attribute.N === undefined) {
    throw new Error("Expected number");
  }
  return +attribute.N;
}

export function numberWrite(value: number): AttributeValue {
  return { N: value.toString() };
}

export function stringRead(attribute: AttributeValue) {
  if (attribute.S === undefined) {
    throw new Error("Expected string");
  }
  return attribute.S!;
}

export function stringWrite(value: string): AttributeValue {
  return { S: value };
}

export function stringSetRead(attribute: AttributeValue): Set<string> {
  if (attribute.SS === undefined) {
    throw new Error("Expected string set");
  }
  return new Set(attribute.SS);
}

export function stringSetWrite(value: Set<string>): AttributeValue {
  if (!value.size) {
    throw new Error("Expected non-empty set");
  }
  return { SS: [...value] };
}
