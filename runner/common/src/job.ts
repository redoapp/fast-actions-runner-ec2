import { AttributeValue } from "@aws-sdk/client-dynamodb";

export enum JobStatus {
  QUEUED = "queued",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
}

export interface Job {
  expiration: Date;
  id: number;
  status: JobStatus;
}

export function jobRecordWrite(job: Job): Record<string, AttributeValue> {
  return {
    Expiration: { N: Math.round(+job.expiration / 1000).toString() },
    Id: { N: job.id.toString() },
    Status: { S: job.status },
  };
}
