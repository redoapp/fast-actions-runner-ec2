import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { S3Bucket } from "@cdktf/provider-aws/lib/s3-bucket";
import { farePublishBaseStack, farePublishStack } from "@redotech/fare-publish";
import { Stack } from "@redotech/terraform-util/construct";
import { rlocation } from "@redotech/terraform-util/runfiles";
import { App, Fn, S3Backend, TerraformStack } from "cdktf";
import { Construct } from "constructs";

const app = new App();

const REGION = "us-east-1";
const STATE_BUCKET = "redotech-terraform-state";
const STATE_TABLE = "terraform-state";

function awsProvider(scope: Construct, tags: { [name: string]: string }) {
  new AwsProvider(scope, "Aws", {
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
  const fare = new Stack(app, "Fare");

  backend(fare);
  awsProvider(fare, { Environment: "FarePublishBase" });

  const { bucket } = farePublishBaseStack(fare, {
    bucketName: "fast-actions-runner-ec2-artifact",
  });
  return { bucket };
}

function farePublish({ bucket }: { bucket: S3Bucket }) {
  const scope = new TerraformStack(app, "Fare");

  awsProvider(scope, { Environment: "FarePublish" });

  farePublishStack(scope, {
    bucket,
    keyPrefix: Fn.file(
      rlocation(
        scope,
        "redotech_fast_actions_runner_ec2/fare/publish/s3-key-prefix.text",
      ),
    ),
  });
}

const { bucket: farePublishBucket } = farePublishBase();
farePublish({ bucket: farePublishBucket });

app.synth();
