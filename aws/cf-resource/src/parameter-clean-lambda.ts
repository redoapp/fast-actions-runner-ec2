import { CloudFormationCustomResourceHandler } from "aws-lambda";
import { FAILED, SUCCESS, send } from "cfn-response";
import { parameterCleaner } from "./parameter-clean";

const cleaner = parameterCleaner();

export const handler: CloudFormationCustomResourceHandler = async (
  event,
  context,
) => {
  try {
    await cleaner({ name: event.ResourceProperties.Name });
  } catch (e) {
    console.error(e);
    send(event, context, FAILED);
    return;
  }
  send(event, context, SUCCESS);
};
