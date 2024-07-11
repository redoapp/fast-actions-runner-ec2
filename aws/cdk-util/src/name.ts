import { Fn } from "aws-cdk-lib/core";
import { Construct, IConstruct } from "constructs";

export class Name {
  constructor(readonly parts: string[]) {}

  child(part: string) {
    return new Name([...this.parts, part]);
  }

  static readonly EMPTY = new Name([]);

  toString() {
    return Fn.join("/", this.parts);
  }
}

const NAME_KEY = "Namespace";

interface NameContext {
  construct: IConstruct;
  value: Name;
}

export function setName(construct: Construct, value: Name) {
  construct.node.setContext(NAME_KEY, { construct, value });
}

export function getName(construct: Construct): Name {
  const context: NameContext | undefined =
    construct.node.tryGetContext(NAME_KEY);
  return construct.node.scopes.reduce(
    (name, construct) =>
      construct === context?.construct
        ? context.value
        : name.child(construct.node.id),
    Name.EMPTY,
  );
}
