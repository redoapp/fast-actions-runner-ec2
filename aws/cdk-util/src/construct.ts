import { CfnElement, Stack } from "aws-cdk-lib/core";

export class CdkStack extends Stack {
  protected allocateLogicalId(cfnElement: CfnElement): string {
    return cfnElement.node.path
      .slice(`${this.stackName}/`.length)
      .replace(/\//g, "");
  }
}
