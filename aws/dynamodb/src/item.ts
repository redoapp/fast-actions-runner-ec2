import { AttributeValue } from "@aws-sdk/client-dynamodb";

export interface Item extends Record<string, AttributeValue> {}
