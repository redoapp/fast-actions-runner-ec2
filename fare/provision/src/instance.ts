import {
  AttributeCodec,
  instantAttributeCodec,
  numberAttributeCodec,
  stringEnumAttributeCodec,
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
  read(attribute) {
    if (!attribute.M) {
      throw new Error("Expected a map");
    }
    const map = attribute.M;
    return {
      id: numberAttributeCodec.read(map.Id),
      activeAt: instantAttributeCodec.read(map.ActiveAt),
      status: runnerStatusAttributeCodec.read(map.Status),
    };
  },
  write(value) {
    const map: Item = {
      Id: numberAttributeCodec.write(value.id),
      ActiveAt: instantAttributeCodec.write(value.activeAt),
      Status: runnerStatusAttributeCodec.write(value.status),
    };
    return { M: map };
  },
};
