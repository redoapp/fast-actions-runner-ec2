import { AttributeValue } from "@aws-sdk/client-dynamodb";
import { NativeAttributeValue } from "@aws-sdk/util-dynamodb";

export enum RunnerStatus {
  ACTIVE = "active",
  IDLE = "idle",
}

export interface Runner {
  activeAt: Date;
  expiration: Date;
  id: number;
  name: string;
  status: RunnerStatus;
}

export function runnerRecordRead(
  record: Record<string, NativeAttributeValue>,
): Runner {
  return {
    activeAt: new Date(record.ActiveAt),
    expiration: new Date(+record.Expiration * 1000),
    id: +record.Id,
    name: record.Name,
    status: record.Status,
  };
}

export function runnerRecordWrite(
  runner: Runner,
): Record<string, AttributeValue> {
  return {
    ActiveAt: { S: runner.activeAt.toISOString() },
    Expiration: { N: Math.round(+runner.expiration / 1000).toString() },
    Id: { N: runner.id.toString() },
    Name: { S: runner.name },
    Status: { S: runner.status },
  };
}
