import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";
import { withClient } from "@redotech/aws-client";
import { batch } from "@redotech/util/iterator";
import { Handler } from "aws-lambda";
import { handlerLoad } from "./handler";

const handlerSpec = process.env.LAMBDAINIT_HANDLER;
if (!handlerSpec) {
  throw new Error("LAMBDAINIT_HANDLER environment variable is required");
}

const handlerFn: Promise<Handler> = (async () => {
  await resolveEnv();
  return await handlerLoad(handlerSpec);
})();

export const handler: Handler = async function (...args) {
  return (await handlerFn)(...args);
};

async function resolveEnv() {
  const ssmClient = new SSMClient();
  using _ = withClient(ssmClient);
  const ssmEnv = <[string, string][]>(
    Object.entries(process.env).filter(([name]) => name.endsWith("_SSM"))
  );
  for (const envVars of batch(ssmEnv, 10)) {
    const names = [...new Set(envVars.map(([_, value]) => value!))];
    const output = await ssmClient.send(
      new GetParametersCommand({ Names: names, WithDecryption: true }),
    );
    for (const param of output.InvalidParameters!) {
      throw new Error(`Invalid parameter: ${param}`);
    }
    const paramValues = new Map(
      output.Parameters!.map((param) => [param.Name!, param.Value!]),
    );
    for (const [name, param] of envVars) {
      process.env[name] = paramValues.get(param!)!;
    }
  }
}
