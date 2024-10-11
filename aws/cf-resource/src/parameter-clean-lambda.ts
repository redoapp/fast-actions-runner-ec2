import { sendFailure, sendSuccess } from "@redotech/cf-response";
import { CloudFormationCustomResourceHandler } from "aws-lambda";
import { parameterCleaner } from "./parameter-clean";

const cleaner = parameterCleaner();

export const handler: CloudFormationCustomResourceHandler = async (event) => {
  try {
    await cleaner({ name: event.ResourceProperties.Name });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : String(e);
    await sendFailure(event, { reason: message });
    return;
  }
  await sendSuccess(event);
};
