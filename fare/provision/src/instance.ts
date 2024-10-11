import {
  AttributeFormat,
  instantAttributeFormat,
  numberAttributeFormat,
  stringEnumAttributeFormat,
} from "@redotech/dynamodb/attribute";
import { Item } from "@redotech/dynamodb/item";

export enum RunnerStatus {
  ACTIVE = "active",
  IDLE = "idle",
}

export const runnerStatusAttributeFormat =
  stringEnumAttributeFormat<RunnerStatus>([
    RunnerStatus.ACTIVE,
    RunnerStatus.IDLE,
  ]);

export enum InstanceStatus {
  ENABLED = "enabled",
  DISABLED = "inactive",
}

export const instanceStatusAttributeFormat =
  stringEnumAttributeFormat<InstanceStatus>([
    InstanceStatus.DISABLED,
    InstanceStatus.ENABLED,
  ]);

export interface Runner {
  id: number;
  activeAt: Temporal.Instant;
  status: RunnerStatus;
}

export const runnerAttributeFormat: AttributeFormat<Runner> = {
  read(attribute) {
    if (!attribute.M) {
      throw new Error("Expected a map");
    }
    const map = attribute.M;
    return {
      id: numberAttributeFormat.read(map.Id),
      activeAt: instantAttributeFormat.read(map.ActiveAt),
      status: runnerStatusAttributeFormat.read(map.Status),
    };
  },
  write(value) {
    const map: Item = {
      Id: numberAttributeFormat.write(value.id),
      ActiveAt: instantAttributeFormat.write(value.activeAt),
      Status: runnerStatusAttributeFormat.write(value.status),
    };
    return { M: map };
  },
};
