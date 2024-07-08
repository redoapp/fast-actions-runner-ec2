import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { inspect } from "node:util";

export function bodyString(event: APIGatewayProxyEventV2) {
  return event.isBase64Encoded
    ? Buffer.from(event.body!, "base64").toString()
    : event.body!;
}

export function reportError(handler: () => Promise<APIGatewayProxyResultV2>) {
  try {
    return handler();
  } catch (e) {
    return {
      body: inspect(e),
      headers: { "Content-Type": "text/plain" },
      statusCode: 500,
    };
  }
}
