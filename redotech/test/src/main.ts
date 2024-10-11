import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { fareTestStack } from "@redotech/fare-test";
import { Stack } from "@redotech/terraform-util/construct";
import { App, S3Backend } from "cdktf";
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

function fareTest() {
  const scope = new Stack(app, "FareTest");

  backend(scope);
  awsProvider(scope, { Environment: "FareTest" });

  fareTestStack(scope, { name: "Fare Test", s3Namespace: "redotech" });
}

fareTest();

app.synth();
