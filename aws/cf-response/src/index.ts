import { CloudFormationCustomResourceEvent } from "aws-lambda";

export async function sendFailure(
  event: CloudFormationCustomResourceEvent,
  {
    physicalResourceId,
    reason,
  }: {
    physicalResourceId?: string;
    reason?: string;
  } = {},
) {
  await sendResponse(event, {
    LogicalResourceId: event.LogicalResourceId,
    PhysicalResourceId: physicalResourceId ?? event.LogicalResourceId,
    Reason: reason,
    RequestId: event.RequestId,
    StackId: event.StackId,
    Status: "FAILED",
  });
}

export async function sendSuccess(
  event: CloudFormationCustomResourceEvent,
  {
    data = {},
    physicalResourceId,
    reason,
    noEcho = false,
  }: {
    data?: Record<string, string>;
    physicalResourceId?: string;
    reason?: string;
    noEcho?: boolean;
  } = {},
) {
  await sendResponse(event, {
    Data: data,
    LogicalResourceId: event.LogicalResourceId,
    NoEcho: noEcho,
    PhysicalResourceId: physicalResourceId ?? event.LogicalResourceId,
    Reason: reason,
    RequestId: event.RequestId,
    StackId: event.StackId,
    Status: "SUCCESS",
  });
}

async function sendResponse(
  event: CloudFormationCustomResourceEvent,
  payload: any,
) {
  console.log("Sending response:", JSON.stringify(payload));

  const response = await fetch(event.ResponseURL, {
    method: "PUT",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`HTTP Error ${response.status}: ${message}`);
  }
}
