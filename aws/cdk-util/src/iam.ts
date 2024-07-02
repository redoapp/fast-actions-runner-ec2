import { Namespace } from "./context";

/**
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-iam-rolepolicy.html#cfn-iam-rolepolicy-policyname}
 */
export function iamPolicyName(name: Namespace) {
  return name.parts
    .join("-")
    .replace(/[^\w+=,.@-]/g, "-")
    .slice(0, 128);
}
