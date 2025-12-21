import { AttributeValue } from "@aws-sdk/client-dynamodb";

export interface AttributeCodec<T> {
  read(attribute: AttributeValue, path?: AttributePath): T;
  write(value: T, path?: AttributePath): AttributeValue;
}

export function attributeCodecTransform<A, B>(
  codec: AttributeCodec<A>,
  {
    read,
    write,
  }: {
    read(value: A, path: AttributePath): B;
    write(value: B, path: AttributePath): A;
  },
): AttributeCodec<B> {
  return {
    read(attribute, path = pathEmpty) {
      return read(codec.read(attribute, path), path);
    },
    write(value, path = pathEmpty) {
      return codec.write(write(value, path), path);
    },
  };
}

/**
 * Error reading an attribute value
 */
export class AttributeReadError extends Error {
  name = "AttributeReadError";

  constructor(
    readonly innerMessage: string,
    readonly path: AttributePath,
    { cause }: { cause?: Error } = {},
  ) {
    super(`at ${pathToString(path)}: ${innerMessage}`, { cause });
  }
}

/**
 * Error writing an attribute value
 */
export class AttributeWriteError extends Error {
  name = "AttributeWriteError";

  constructor(
    readonly innerMessage: string,
    readonly path: AttributePath,
    { cause }: { cause?: Error } = {},
  ) {
    super(`at ${pathToString(path)}: ${innerMessage}`, { cause });
  }
}

/**
 * Path to an attribute value
 */
export interface AttributePath extends ReadonlyArray<number | string> {}

/**
 * Empty attribute value path
 */
export const pathEmpty: AttributePath = [];

export function pathToString(path: AttributePath): string {
  return path
    .map((p, index) => {
      return typeof p === "number" ? `[${p}]` : index ? p : `.${p}`;
    })
    .join("");
}

export const bufferAttributeCodec: AttributeCodec<ArrayBuffer> = {
  read(attribute, path = pathEmpty) {
    if (attribute.B === undefined) {
      throw new AttributeReadError(
        `Expected binary, got ${typeName(attribute)}`,
        path,
      );
    }
    const uint8Array = attribute.B;
    if (uint8Array.buffer instanceof ArrayBuffer) {
      return uint8Array.buffer.slice(
        uint8Array.byteOffset,
        uint8Array.byteOffset + uint8Array.byteLength,
      );
    }
    const result = new ArrayBuffer(uint8Array.byteLength);
    new Uint8Array(result).set(uint8Array);
    return result;
  },
  write(value) {
    return { B: new Uint8Array(value) };
  },
};

export const durationAttributeCodec: AttributeCodec<Temporal.Duration> = {
  read(attribute: AttributeValue, path = pathEmpty) {
    if (attribute.N === undefined) {
      throw new AttributeReadError(
        `Expected number, got ${typeName(attribute)}`,
        path,
      );
    }
    return Temporal.Duration.from({
      milliseconds: Math.round(+attribute.N * 1000),
    });
  },
  write(value: Temporal.Duration) {
    return { N: value.total("seconds").toString() };
  },
};

/**
 * Temporal Instant
 */
export const instantAttributeCodec: AttributeCodec<Temporal.Instant> = {
  read(attribute: AttributeValue, path = pathEmpty) {
    if (attribute.N === undefined) {
      throw new AttributeReadError(
        `Expected number, got ${typeName(attribute)}`,
        path,
      );
    }
    return Temporal.Instant.fromEpochSeconds(+attribute.N);
  },
  write(value: Temporal.Instant) {
    return { N: (value.epochMilliseconds / 1000).toString() };
  },
};

/**
 * Number
 */
export const numberAttributeCodec: AttributeCodec<number> = {
  read(attribute: AttributeValue, path = pathEmpty) {
    if (attribute.N === undefined) {
      throw new AttributeReadError("Expected number", path);
    }
    return +attribute.N;
  },
  write(value: number) {
    return { N: value.toString() };
  },
};

/**
 * String
 */
export const stringAttributeCodec: AttributeCodec<string> = {
  read(attribute: AttributeValue, path = pathEmpty) {
    if (attribute.S === undefined) {
      throw new AttributeReadError("Expected string", path);
    }
    return attribute.S!;
  },
  write(value: string) {
    return { S: value };
  },
};

/**
 * Enumerated string
 */
export function stringEnumAttributeCodec<T extends string>(
  values: Iterable<T>,
): AttributeCodec<T> {
  const valuesSet = new Set<string>(values);
  return attributeCodecTransform(stringAttributeCodec, {
    read(value, path) {
      if (!valuesSet.has(value)) {
        throw new AttributeReadError(`${value} is not an allowed value`, path);
      }
      return value as T;
    },
    write(value, path) {
      if (!valuesSet.has(value)) {
        throw new AttributeWriteError(`${value} is not an allowed value`, path);
      }
      return value;
    },
  });
}

/**
 * String set
 */
export const stringSetAttributeCodec: AttributeCodec<Set<string>> = {
  read(attribute: AttributeValue, path = pathEmpty) {
    if (attribute.NULL) {
      return new Set();
    }
    if (attribute.SS === undefined) {
      throw new AttributeReadError("Expected string set", path);
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

export function typeName(value: AttributeValue): string {
  let type: string;
  for (type in value) {
    break;
  }
  const typeKey = type! as keyof AttributeValue;
  switch (typeKey) {
    case "BOOL":
      return "boolean";
    case "B":
      return "binary";
    case "BS":
      return "binary set";
    case "L":
      return "list";
    case "M":
      return "map";
    case "N":
      return "number";
    case "NULL":
      return "null";
    case "S":
      return "string";
    case "SS":
      return "string set";
    case "NS":
      return "number set";
    case "$unknown":
      return "unknown";
  }
}
