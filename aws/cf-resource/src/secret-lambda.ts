import { sendFailure, sendSuccess } from "@redotech/cf-response";
import { CloudFormationCustomResourceHandler } from "aws-lambda";
import { SecretGeneratorAction, secretGenerator } from "./secret";

const secretGenerator_ = secretGenerator();

export const handler: CloudFormationCustomResourceHandler = async (event) => {
  try {
    await secretGenerator_({
      action:
        event.RequestType === "Delete"
          ? SecretGeneratorAction.DELETE
          : SecretGeneratorAction.CREATE,
      name: event.ResourceProperties.Name,
      size: +event.ResourceProperties.Size,
    });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : String(e);
    await sendFailure(event, { reason: message });
    return;
  }
  await sendSuccess(event);
};
