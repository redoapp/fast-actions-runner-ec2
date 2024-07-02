import { APIGatewayProxyEventV2 } from "aws-lambda";

export function bodyString(event: APIGatewayProxyEventV2) {
  return event.isBase64Encoded
    ? Buffer.from(event.body!, "base64").toString()
    : event.body!;
}
