import { CfnFunction } from "aws-cdk-lib/aws-lambda";

export interface LambdaParams {
  code: CfnFunction.CodeProperty;
  environment: CfnFunction.EnvironmentProperty;
  handler: string;
  runtime: string;
}
