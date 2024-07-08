import { Construct } from "constructs";
import { Namespace } from "./context";

const NAMESPACE_KEY = "Namespace";

export function setName(construct: Construct, namespace: Namespace) {
  construct.node.setContext(NAMESPACE_KEY, {
    construct,
    value: namespace,
  });
}

export function getName(construct: Construct): Namespace {
  const context = construct.node.tryGetContext(NAMESPACE_KEY) || {
    construct: construct.node.root,
    value: Namespace.EMPTY.child(construct.node.root.node.id),
  };
  return construct.node.scopes.reduce(
    (name, construct) =>
      construct === context.construct
        ? context.value
        : name.child(construct.node.id),
    Namespace.EMPTY,
  );
}
