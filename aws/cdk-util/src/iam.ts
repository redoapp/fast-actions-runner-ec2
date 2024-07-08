import { Fn, Token } from "aws-cdk-lib/core";
import { Namespace } from "./context";

/**
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-iam-rolepolicy.html#cfn-iam-rolepolicy-policyname}
 */
export function iamPolicyName(name: Namespace) {
  return Fn.join(
    "-",
    name.parts.map((part) =>
      Token.isUnresolved(part) ? part : part.replace(/[^\w+=,.@-]+/g, "-"),
    ),
  );
}
