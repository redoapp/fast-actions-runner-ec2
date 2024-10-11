import { TerraformElement, TerraformStack } from "cdktf";
import { Construct, Node } from "constructs";
import { runfilesDirVar } from "./runfiles";

export class Stack extends TerraformStack {
  readonly #runfilesDirVar: () => void;

  constructor(scope: Construct, name: string) {
    super(scope, name);
    this.#runfilesDirVar = runfilesDirVar(this);
  }

  /**
   * @see https://discuss.hashicorp.com/t/avoid-random-suffix-for-costruct-resources/39505
   */
  override getLogicalId(tfElement: TerraformElement | Node): string {
    const id = super.getLogicalId(tfElement);
    return id.replace(/_[A-F0-9]{8}$/, "");
  }

  override prepareStack(): void {
    this.#runfilesDirVar();
    super.prepareStack();
  }
}
