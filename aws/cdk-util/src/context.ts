import { Aws, Fn } from "aws-cdk-lib/core";
import { Construct } from "constructs";

export class Namespace {
  constructor(readonly parts: string[]) {}

  child(part: string) {
    return new Namespace([...this.parts, part]);
  }

  static readonly EMPTY = new Namespace([]);

  toString() {
    return Fn.join("/", this.parts);
  }
}

export class Context {
  constructor(
    readonly scope: Construct,
    readonly name: Namespace,
  ) {}

  child(name: string) {
    return new Context(new Construct(this.scope, name), this.name.child(name));
  }

  static forStack(scope: Construct) {
    return new Context(scope, Namespace.EMPTY.child(Aws.STACK_NAME));
  }
}
