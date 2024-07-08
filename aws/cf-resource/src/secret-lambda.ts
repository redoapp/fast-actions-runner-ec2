import { CloudFormationCustomResourceHandler } from "aws-lambda";
import { FAILED, send } from "cfn-response";
import { SecretGeneratorAction, secretGenerator } from "./secret";

const secretGenerator_ = secretGenerator();

export const handler: CloudFormationCustomResourceHandler = async (
  event,
  context,
) => {
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
    send(event, context, FAILED);
    return;
  }
  send(event, context, "SUCCESS");
};
