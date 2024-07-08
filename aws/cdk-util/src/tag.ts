import { IAspect, Stack, TagManager } from "aws-cdk-lib/core";
import { Construct, IValidation } from "constructs";

export class NameTagValidatorAspect implements IAspect {
  visit(node: Construct) {
    if (node instanceof Stack) {
      return;
    }
    const tags = TagManager.of(node);
    if (tags) {
      node.node.addValidation(new NameTagValidation(tags));
    }
  }
}

class NameTagValidation implements IValidation {
  constructor(private readonly tags: TagManager) {}

  validate() {
    const errors: string[] = [];
    if (!("Name" in this.tags.tagValues())) {
      errors.push("Missing Name tag");
    }
    return errors;
  }
}

export class PathTagAspect implements IAspect {
  visit(node: Construct) {
    if (node instanceof Stack) {
      return;
    }
    const tags = TagManager.of(node);
    tags?.setTag("Path", node.node.path);
  }
}
