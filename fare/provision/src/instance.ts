import {
  AttributeCodec,
  AttributeReadError,
  instantAttributeCodec,
  numberAttributeCodec,
  pathEmpty,
  stringEnumAttributeCodec,
  typeName,
} from "@redotech/dynamodb/attribute";
import { Item } from "@redotech/dynamodb/item";
import { Values } from "@redotech/util/type";

export const RunnerStatus = {
  ACTIVE: "active",
  IDLE: "idle",
} as const;

export type RunnerStatus = Values<typeof RunnerStatus>;

export const runnerStatusAttributeCodec =
  stringEnumAttributeCodec<RunnerStatus>([
    RunnerStatus.ACTIVE,
    RunnerStatus.IDLE,
  ]);

export const InstanceStatus = {
  ENABLED: "enabled",
  DISABLED: "inactive",
} as const;

export type InstanceStatus = Values<typeof InstanceStatus>;

export const instanceStatusAttributeCodec =
  stringEnumAttributeCodec<InstanceStatus>([
    InstanceStatus.DISABLED,
    InstanceStatus.ENABLED,
  ]);

export interface Runner {
  id: number;
  activeAt: Temporal.Instant;
  status: RunnerStatus;
}

export const runnerAttributeCodec: AttributeCodec<Runner> = {
  read(attribute, path = pathEmpty) {
    if (!attribute.M) {
      throw new AttributeReadError(
        `Expected a map, got ${typeName(attribute)}`,
        path,
      );
    }
    const map = attribute.M;
    return {
      id: numberAttributeCodec.read(map.Id, [...path, "id"]),
      activeAt: instantAttributeCodec.read(map.ActiveAt, [...path, "activeAt"]),
      status: runnerStatusAttributeCodec.read(map.Status, [...path, "status"]),
    };
  },
  write(value, path = pathEmpty) {
    const map: Item = {
      Id: numberAttributeCodec.write(value.id, [...path, "id"]),
      ActiveAt: instantAttributeCodec.write(value.activeAt, [
        ...path,
        "activeAt",
      ]),
      Status: runnerStatusAttributeCodec.write(value.status, [
        ...path,
        "status",
      ]),
    };
    return { M: map };
  },
};
