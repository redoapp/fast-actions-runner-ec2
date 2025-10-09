import {
  AttributeCodec,
  instantAttributeCodec,
  numberAttributeCodec,
  stringEnumAttributeCodec,
} from "@redotech/dynamodb/attribute";
import { Item } from "@redotech/dynamodb/item";

export enum RunnerStatus {
  ACTIVE = "active",
  IDLE = "idle",
}

export const runnerStatusAttributeCodec =
  stringEnumAttributeCodec<RunnerStatus>([
    RunnerStatus.ACTIVE,
    RunnerStatus.IDLE,
  ]);

export enum InstanceStatus {
  ENABLED = "enabled",
  DISABLED = "inactive",
}

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
