import { Construct } from "constructs";

export class Namespace {
  constructor(readonly parts: string[]) {}

  child(part: string) {
    return new Namespace([...this.parts, part]);
  }

  static readonly EMPTY = new Namespace([]);

  toString() {
    return this.parts.join("/");
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
}
