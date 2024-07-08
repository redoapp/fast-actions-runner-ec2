import {
  DeleteParameterCommand,
  ParameterNotFound,
  SSMClient,
} from "@aws-sdk/client-ssm";

export interface ParametersCleaner {
  ({ name }: { name: string }): Promise<void>;
}

export function parameterCleaner(): ParametersCleaner {
  const ssm = new SSMClient();

  return async ({ name }) => {
    try {
      await ssm.send(new DeleteParameterCommand({ Name: name }));
    } catch (e) {
      if (e instanceof ParameterNotFound) {
        return;
      }
      throw e;
    }
  };
}
