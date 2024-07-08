import {
  DeleteParameterCommand,
  ParameterNotFound,
  PutParameterCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";

export enum SecretGeneratorAction {
  CREATE,
  DELETE,
}

export interface SecretGenerator {
  ({
    action,
    name,
    size,
  }: {
    action: SecretGeneratorAction;
    name: string;
    size: number;
  }): Promise<void>;
}

export function secretGenerator(): SecretGenerator {
  const ssm = new SSMClient();

  return async ({ action, name, size }) => {
    switch (action) {
      case SecretGeneratorAction.CREATE: {
        const secret = await promisify(randomBytes)(size);
        await ssm.send(
          new PutParameterCommand({
            Name: name,
            Value: secret.toString("base64"),
            Type: "SecureString",
          }),
        );
        break;
      }
      case SecretGeneratorAction.DELETE:
        try {
          await ssm.send(new DeleteParameterCommand({ Name: name }));
        } catch (e) {
          if (e instanceof ParameterNotFound) {
            return;
          }
          throw e;
        }
        break;
    }
  };
}
