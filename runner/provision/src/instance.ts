import { AttributeValue } from "@aws-sdk/client-dynamodb";
import {
  instantRead,
  instantWrite,
  numberRead,
  numberWrite,
  stringRead,
  stringWrite,
} from "@redotech/dynamodb/common";
import { Item } from "@redotech/dynamodb/item";

export enum RunnerStatus {
  ACTIVE = "active",
  IDLE = "idle",
}

export enum InstanceStatus {
  ENABLED = "enabled",
  DISABLED = "inactive",
}

export interface Runner {
  id: number;
  activeAt: Temporal.Instant;
  status: RunnerStatus;
}

export function runnerWrite(runner: Runner): AttributeValue {
  const map: Item = {
    Id: numberWrite(runner.id),
    ActiveAt: instantWrite(runner.activeAt),
    Status: stringWrite(runner.status),
  };
  return { M: map };
}

export function runnerRead(item: AttributeValue): Runner {
  if (!item.M) {
    throw new Error("Expected a map");
  }
  const map = item.M;
  return {
    id: numberRead(map.Id),
    activeAt: instantRead(map.ActiveAt),
    status: <RunnerStatus>stringRead(map.Status),
  };
}
