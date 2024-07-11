import { Aspects, Aws, CfnElement, Stack, StackProps } from "aws-cdk-lib/core";
import { Construct } from "constructs";
import { Name, setName } from "./name";
import { NameTagValidatorAspect, PathTagAspect } from "./tag";

export class BetterStack extends Stack {
  constructor(scope?: Construct, id?: string, props?: StackProps) {
    super(scope, id, props);

    Aspects.of(this).add(new NameTagValidatorAspect());
    Aspects.of(this).add(new PathTagAspect());
    setName(this, Name.EMPTY.child(Aws.STACK_NAME));
  }

  protected allocateLogicalId(cfnElement: CfnElement): string {
    return cfnElement.node.path
      .slice(`${this.stackName}/`.length)
      .replace(/\//g, "");
  }
}
