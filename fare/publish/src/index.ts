import { S3Bucket } from "@cdktf/provider-aws/lib/s3-bucket";
import { S3BucketOwnershipControls } from "@cdktf/provider-aws/lib/s3-bucket-ownership-controls";
import { S3BucketPolicy } from "@cdktf/provider-aws/lib/s3-bucket-policy";
import { S3BucketPublicAccessBlock } from "@cdktf/provider-aws/lib/s3-bucket-public-access-block";
import { S3BucketServerSideEncryptionConfigurationA } from "@cdktf/provider-aws/lib/s3-bucket-server-side-encryption-configuration";
import { S3Object } from "@cdktf/provider-aws/lib/s3-object";
import { rlocation } from "@redotech/terraform-util/runfiles";
import { Fn } from "cdktf";
import { Construct } from "constructs";
import { digest, digestKey } from "./common";

export function farePublishBaseStack(
  scope: Construct,
  { bucketName }: { bucketName: string },
) {
  const bucket = new S3Bucket(scope, "Bucket", { bucket: bucketName });
  new S3BucketServerSideEncryptionConfigurationA(scope, "BucketEncryption", {
    bucket: bucket.bucket,
    rule: [
      {
        applyServerSideEncryptionByDefault: { sseAlgorithm: "AES256" },
        bucketKeyEnabled: false,
      },
    ],
  });
  const block = new S3BucketPublicAccessBlock(scope, "BucketBlock", {
    bucket: bucket.bucket,
    blockPublicAcls: true,
    blockPublicPolicy: false,
    ignorePublicAcls: true,
    restrictPublicBuckets: false,
  });
  new S3BucketOwnershipControls(scope, "BucketOwnership", {
    bucket: bucket.bucket,
    rule: { objectOwnership: "BucketOwnerEnforced" },
  });
  new S3BucketPolicy(scope, "BucketPolicy", {
    bucket: bucket.bucket,
    dependsOn: [block],
    policy: Fn.jsonencode({
      Statement: [
        {
          Action: "s3:GetObject",
          Effect: "Allow",
          Principal: "*",
          Resource: `${bucket.arn}/*`,
        },
        {
          Action: "s3:ListBucket",
          Effect: "Allow",
          Principal: "*",
          Resource: bucket.arn,
        },
      ],
      Version: "2012-10-17",
    }),
  });

  return { bucket };
}

export function farePublishStack(
  scope: Construct,
  { bucket, keyPrefix }: { bucket: S3Bucket; keyPrefix: string },
) {
  aptRepo(new Construct(scope, "Apt"), { bucket, keyPrefix });
  const { cfResourceFunction } = awsArtifacts(new Construct(scope, "Aws"), {
    bucket,
    keyPrefix,
  });
  const { appTemplate, cfResourceFunction: fareCfResourceFunction } =
    fareArtifacts(new Construct(scope, "Fare"), {
      bucket,
      keyPrefix,
    });
  const {
    clusterTemplate: basicClusterTemplate,
    provisionerTemplate: basicProvisionerTemplate,
  } = fareBasicArtifacts(new Construct(scope, "FareBasic"), {
    bucket,
    keyPrefix,
  });
  return {
    appTemplate,
    basicClusterTemplate,
    basicProvisionerTemplate,
    cfResourceFunction,
    fareCfResourceFunction,
  };
}

function aptRepo(
  scope: Construct,
  { bucket, keyPrefix }: { bucket: S3Bucket; keyPrefix: string },
) {
  const deb = (name: string, path: string, digestPath: string) =>
    new S3Object(scope, name, {
      bucket: bucket.bucket,
      contentType: "application/vnd.debian.binary-package",
      key: `${keyPrefix}apt/debs/${path}`,
      source: rlocation(scope, path),
      sourceHash: digest(scope, digestPath),
    });

  deb(
    "ActionsRunnerDeb",
    "redotech_fast_actions_runner_ec2/actions/runner/actions-runner.deb",
    "redotech_fast_actions_runner_ec2/fare/publish/actions_runner_deb_digest.txt",
  );

  deb(
    "AwsCliInstallerDeb",
    "redotech_fast_actions_runner_ec2/aws/cli-installer/awscli-installer.deb",
    "redotech_fast_actions_runner_ec2/fare/publish/aws_cli_installer_deb_digest.txt",
  );

  deb(
    "AwsCurlDeb",
    "redotech_fast_actions_runner_ec2/aws/curl/awscurl.deb",
    "redotech_fast_actions_runner_ec2/fare/publish/aws_curl_deb_digest.txt",
  );

  deb(
    "AwsImdsClientDeb",
    "redotech_fast_actions_runner_ec2/aws/imds-client/imds-client.deb",
    "redotech_fast_actions_runner_ec2/fare/publish/aws_imds_client_deb_digest.txt",
  );

  deb(
    "AwsNetworkDeb",
    "redotech_fast_actions_runner_ec2/aws/network/aws-network.deb",
    "redotech_fast_actions_runner_ec2/fare/publish/aws_network_deb_digest.txt",
  );

  deb(
    "FareCreateDeb",
    "redotech_fast_actions_runner_ec2/fare/create/fare-create.deb",
    "redotech_fast_actions_runner_ec2/fare/publish/fare_create_deb_digest.txt",
  );

  new S3Object(scope, "PackagesIndex", {
    bucket: bucket.bucket,
    contentEncoding: "gzip",
    contentType: "text/plain",
    key: `${keyPrefix}apt/Packages.gz`,
    source: rlocation(
      scope,
      "redotech_fast_actions_runner_ec2/fare/publish/packages.gz",
    ),
    sourceHash: digest(
      scope,
      "redotech_fast_actions_runner_ec2/fare/publish/packages_digest.txt",
    ),
  });
}

function awsArtifacts(
  scope: Construct,
  { bucket, keyPrefix }: { bucket: S3Bucket; keyPrefix: string },
) {
  const cfResourceFunctionDigest = digest(
    scope,
    "redotech_fast_actions_runner_ec2/fare/publish/aws_cf_resource_function_digest.txt",
  );
  const cfResourceFunction = new S3Object(scope, "CfResourceFunctionZip", {
    bucket: bucket.bucket,
    contentType: "application/x-zip",
    key: `${keyPrefix}cf-resource-${digestKey(cfResourceFunctionDigest)}.zip`,
    lifecycle: { createBeforeDestroy: true },
    source: rlocation(
      scope,
      "redotech_fast_actions_runner_ec2/aws/cf-resource/function.zip",
    ),
    sourceHash: cfResourceFunctionDigest,
  });

  return { cfResourceFunction };
}

function fareArtifacts(
  scope: Construct,
  { bucket, keyPrefix }: { bucket: S3Bucket; keyPrefix: string },
) {
  const appFunctionDigest = digest(
    scope,
    "redotech_fast_actions_runner_ec2/fare/publish/fare_app_function_digest.txt",
  );
  new S3Object(scope, "AppFunctionZip", {
    bucket: bucket.bucket,
    contentType: "application/x-zip",
    key: `${keyPrefix}fare-app-${digestKey(appFunctionDigest)}.zip`,
    lifecycle: { createBeforeDestroy: true },
    source: rlocation(
      scope,
      "redotech_fast_actions_runner_ec2/fare/app/function.zip",
    ),
    sourceHash: appFunctionDigest,
  });

  const appTemplate = new S3Object(scope, "AppTemplate", {
    bucket: bucket.bucket,
    contentType: "application/yaml",
    key: `${keyPrefix}fare-app.template.yaml`,
    source: rlocation(
      scope,
      "redotech_fast_actions_runner_ec2/fare/infra/app_cf.yaml",
    ),
    sourceHash: digest(
      scope,
      "redotech_fast_actions_runner_ec2/fare/publish/fare_infra_app_cf_digest.txt",
    ),
  });

  const cfResourceFunctionDigest = digest(
    scope,
    "redotech_fast_actions_runner_ec2/fare/publish/fare_cf_resource_function_digest.txt",
  );
  const cfResourceFunction = new S3Object(scope, "CfResourceFunctionZip", {
    bucket: bucket.bucket,
    contentType: "application/x-zip",
    key: `${keyPrefix}fare-cf-resource-${digestKey(cfResourceFunctionDigest)}.zip`,
    lifecycle: { createBeforeDestroy: true },
    source: rlocation(
      scope,
      "redotech_fast_actions_runner_ec2/fare/cf-resource/function.zip",
    ),
    sourceHash: cfResourceFunctionDigest,
  });

  new S3Object(scope, "ProvisionerTemplate", {
    bucket: bucket.bucket,
    contentType: "application/yaml",
    key: `${keyPrefix}fare-provisioner.template.yaml`,
    source: rlocation(
      scope,
      "redotech_fast_actions_runner_ec2/fare/infra/provisioner_cf.yaml",
    ),
    sourceHash: digest(
      scope,
      "redotech_fast_actions_runner_ec2/fare/publish/fare_infra_provisioner_cf_digest.txt",
    ),
  });

  const provisionFunctionDigest = digest(
    scope,
    "redotech_fast_actions_runner_ec2/fare/publish/fare_provision_function_digest.txt",
  );
  new S3Object(scope, "ProvisionZip", {
    bucket: bucket.bucket,
    contentType: "application/x-zip",
    key: `${keyPrefix}fare-provision-${digestKey(provisionFunctionDigest)}.zip`,
    source: rlocation(
      scope,
      "redotech_fast_actions_runner_ec2/fare/provision/function.zip",
    ),
    sourceHash: provisionFunctionDigest,
  });

  return { appTemplate, cfResourceFunction };
}

function fareBasicArtifacts(
  scope: Construct,
  { bucket, keyPrefix }: { bucket: S3Bucket; keyPrefix: string },
) {
  const clusterTemplate = new S3Object(scope, "ClusterTemplate", {
    bucket: bucket.bucket,
    contentType: "application/yaml",
    key: `${keyPrefix}fare-basic-cluster.template.yaml`,
    source: rlocation(
      scope,
      "redotech_fast_actions_runner_ec2/fare/basic-infra/cluster_cf.yaml",
    ),
    sourceHash: digest(
      scope,
      "redotech_fast_actions_runner_ec2/fare/publish/fare_basic_infra_cluster_cf_digest.txt",
    ),
  });

  const provisionerTemplate = new S3Object(scope, "ProvisionerTemplateYaml", {
    bucket: bucket.bucket,
    contentType: "application/yaml",
    key: `${keyPrefix}fare-basic-provisioner.template.yaml`,
    source: rlocation(
      scope,
      "redotech_fast_actions_runner_ec2/fare/basic-infra/provisioner_cf.yaml",
    ),
    sourceHash: digest(
      scope,
      "redotech_fast_actions_runner_ec2/fare/publish/fare_basic_infra_provisioner_cf_digest.txt",
    ),
  });

  return { clusterTemplate, provisionerTemplate };
}
