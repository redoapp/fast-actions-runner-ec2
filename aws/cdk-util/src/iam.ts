import { Fn, Token } from "aws-cdk-lib/core";
import { Name } from "./name";

/**
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-iam-rolepolicy.html#cfn-iam-rolepolicy-policyname}
 */
export function iamPolicyName(name: Name) {
  return Fn.join(
    "-",
    name.parts.map((part) =>
      Token.isUnresolved(part) ? part : part.replace(/[^\w+=,.@-]+/g, "-"),
    ),
  );
}
