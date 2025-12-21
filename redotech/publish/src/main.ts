import { IamRole } from "@cdktf/provider-aws/lib/iam-role";
import { IamRolePolicyAttachment } from "@cdktf/provider-aws/lib/iam-role-policy-attachment";
import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { S3Bucket } from "@cdktf/provider-aws/lib/s3-bucket";
import { farePublishBaseStack, farePublishStack } from "@redotech/fare-publish";
import { Stack } from "@redotech/terraform-util/construct";
import { rlocation } from "@redotech/terraform-util/runfiles";
import { App, Fn, S3Backend } from "cdktf";
import { Construct } from "constructs";

const app = new App();

const REGION = "us-east-1";
const STATE_BUCKET = "redotech-terraform-state";
const STATE_TABLE = "terraform-state";

function awsProvider(scope: Construct, tags: { [name: string]: string }) {
  new AwsProvider(scope, "AwsProvider", {
    region: REGION,
    defaultTags: [
      { tags: { Provider: "Terraform", Stack: scope.node.id, ...tags } },
    ],
  });
}

function backend(scope: Construct) {
  new S3Backend(scope, {
    bucket: STATE_BUCKET,
    key: scope.node.id,
    dynamodbTable: STATE_TABLE,
    region: REGION,
  });
}

function farePublishBase() {
  const scope = new Stack(app, "FarePublishBase");

  backend(scope);
  awsProvider(scope, { Environment: "FarePublish" });

  const { bucket } = farePublishBaseStack(scope, {
    bucketName: Fn.file(
      rlocation(
        scope,
        "redotech_fast_actions_runner_ec2/aws/artifact/s3-bucket.txt",
      ),
    ),
  });

  // TODO: Should live in a CI stack
  const role = new IamRole(scope, "Role", {
    name: "FareCi",
    assumeRolePolicy: Fn.jsonencode({
      Statement: [
        {
          Effect: "Allow",
          Principal: {
            Federated:
              "arn:aws:iam::260890374087:oidc-provider/token.actions.githubusercontent.com",
          },
          Action: "sts:AssumeRoleWithWebIdentity",
          Condition: {
            StringEquals: {
              "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
            },
            StringLike: {
              "token.actions.githubusercontent.com:sub": [
                "repo:redoapp/fast-actions-runner-ec2:*",
              ],
            },
          },
        },
      ],
      Version: "2012-10-17",
    }),
  });

  new IamRolePolicyAttachment(scope, "Adminstrator", {
    policyArn: "arn:aws:iam::aws:policy/AdministratorAccess",
    role: role.id,
  });

  return { bucket };
}

function farePublish({ bucket }: { bucket: S3Bucket }) {
  const scope = new Stack(app, "FarePublish");

  awsProvider(scope, { Environment: "FarePublish" });

  const buildEmbedLabel = Fn.file(
    rlocation(scope, "r_tools/bazel/rules/build_embed_label.txt"),
  );

  farePublishStack(scope, {
    bucket,
    keyPrefix: `${buildEmbedLabel}/`,
  });
}

const { bucket: farePublishBucket } = farePublishBase();
farePublish({ bucket: farePublishBucket });

app.synth();
