import { AttributeValue } from "@aws-sdk/client-dynamodb";

export interface AttributeCodec<T> {
  read(attribute: AttributeValue): T;
  write(value: T): AttributeValue;
}

export const bufferAttributeCodec: AttributeCodec<ArrayBuffer> = {
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

export const durationAttributeCodec: AttributeCodec<Temporal.Duration> = {
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

export const instantAttributeCodec: AttributeCodec<Temporal.Instant> = {
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

export const numberAttributeCodec: AttributeCodec<number> = {
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

export const stringAttributeCodec: AttributeCodec<string> = {
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

export function stringEnumAttributeCodec<T extends string>(
  values: Iterable<T>,
): AttributeCodec<T> {
  const valuesSet = new Set<string>(values);
  return {
    read(attribute: AttributeValue) {
      const value = stringAttributeCodec.read(attribute);
      if (!valuesSet.has(value)) {
        throw new Error(`${value} is not an allowed value`);
      }
      return value as T;
    },
    write(value: T) {
      if (!valuesSet.has(value)) {
        throw new Error(`${value} is not an allowed value`);
      }
      return stringAttributeCodec.write(value);
    },
  };
}

export const stringSetAttributeCodec: AttributeCodec<Set<string>> = {
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
