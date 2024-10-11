import { AttributeValue } from "@aws-sdk/client-dynamodb";

export interface AttributeFormat<T> {
  read(attribute: AttributeValue): T;
  write(value: T): AttributeValue;
}

export const bufferAttributeFormat: AttributeFormat<ArrayBuffer> = {
  read(attribute) {
    if (attribute.B === undefined) {
      throw new Error("Expected binary");
    }
    return attribute.B;
  },
  write(value) {
    return { B: new Uint8Array(value) };
  },
};

export const durationAttributeFormat: AttributeFormat<Temporal.Duration> = {
  read(attribute: AttributeValue) {
    if (attribute.N === undefined) {
      throw new Error("Expected number");
    }
    return Temporal.Duration.from({
      milliseconds: Math.round(+attribute.N * 1000),
    });
  },
  write(value: Temporal.Duration) {
    return { N: value.total("seconds").toString() };
  },
};

export const instantAttributeFormat: AttributeFormat<Temporal.Instant> = {
  read(attribute: AttributeValue) {
    if (attribute.N === undefined) {
      throw new Error("Expected number");
    }
    return Temporal.Instant.fromEpochSeconds(+attribute.N);
  },
  write(value: Temporal.Instant) {
    return { N: (value.epochMilliseconds / 1000).toString() };
  },
};

export const numberAttributeFormat: AttributeFormat<number> = {
  read(attribute: AttributeValue) {
    if (attribute.N === undefined) {
      throw new Error("Expected number");
    }
    return +attribute.N;
  },
  write(value: number) {
    return { N: value.toString() };
  },
};

export const stringAttributeFormat: AttributeFormat<string> = {
  read(attribute: AttributeValue) {
    if (attribute.S === undefined) {
      throw new Error("Expected string");
    }
    return attribute.S!;
  },
  write(value: string) {
    return { S: value };
  },
};

export function stringEnumAttributeFormat<T extends string>(
  values: Iterable<T>,
): AttributeFormat<T> {
  const valuesSet = new Set<string>(values);
  return {
    read(attribute: AttributeValue) {
      const value = stringAttributeFormat.read(attribute);
      if (!valuesSet.has(value)) {
        throw new Error(`${value} is not an allowed value`);
      }
      return value as T;
    },
    write(value: T) {
      if (!valuesSet.has(value)) {
        throw new Error(`${value} is not an allowed value`);
      }
      return stringAttributeFormat.write(value);
    },
  };
}

export const stringSetAttributeFormat: AttributeFormat<Set<string>> = {
  read(attribute: AttributeValue) {
    if (attribute.NULL) {
      return new Set();
    }
    if (attribute.SS === undefined) {
      throw new Error("Expected string set");
    }
    return new Set(attribute.SS);
  },
  write(value: Set<string>) {
    if (!value.size) {
      return { NULL: true };
    }
    return { SS: [...value] };
  },
};
