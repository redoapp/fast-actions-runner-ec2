import { Aspects, Aws, CfnElement, Stack, StackProps } from "aws-cdk-lib/core";
import { Construct } from "constructs";
import { Namespace } from "./context";
import { setName } from "./name";
import { NameTagValidatorAspect, PathTagAspect } from "./tag";

export class CdkStack extends Stack {
  constructor(scope?: Construct, id?: string, props?: StackProps) {
    super(scope, id, props);

    Aspects.of(this).add(new NameTagValidatorAspect());
    Aspects.of(this).add(new PathTagAspect());
    setName(this, Namespace.EMPTY.child(Aws.STACK_NAME));
  }

  protected allocateLogicalId(cfnElement: CfnElement): string {
    return cfnElement.node.path
      .slice(`${this.stackName}/`.length)
      .replace(/\//g, "");
  }
}
