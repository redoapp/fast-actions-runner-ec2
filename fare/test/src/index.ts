import { CloudformationStack } from "@cdktf/provider-aws/lib/cloudformation-stack";
import { farePublishBaseStack, farePublishStack } from "@redotech/fare-publish";
import { Fn } from "cdktf";
import { Construct } from "constructs";

export function fareTestStack(
  scope: Construct,
  { name, s3Namespace }: { name: string; s3Namespace: string },
) {
  const { bucket } = farePublishBaseStack(new Construct(scope, "PublishBase"), {
    bucketName: `${s3Namespace}-${name.toLowerCase().replace(/[^0-9a-z]/g, "-")}`,
  });

  const keyPrefix = "";

  const {
    appTemplate,
    basicClusterTemplate,
    basicProvisionerTemplate,
    cfResourceFunction,
    fareCfResourceFunction,
  } = farePublishStack(new Construct(scope, "Publish"), {
    bucket,
    keyPrefix,
  });

  const app = new CloudformationStack(scope, "App", {
    capabilities: ["CAPABILITY_IAM"],
    name: `${name.replace(/ /g, "")}App`,
    dependsOn: [cfResourceFunction],
    onFailure: "DO_NOTHING",
    parameters: {
      ArtifactRegion: "us-east-1",
      ArtifactS3Bucket: bucket.bucket,
      ArtifactS3KeyPrefix: keyPrefix,
    },
    templateUrl: `https://${bucket.bucketRegionalDomainName}/${appTemplate.key}?${Fn.substr(appTemplate.sourceHash, 0, 8)}`,
  });

  const cluster = new CloudformationStack(scope, "Cluster", {
    capabilities: ["CAPABILITY_IAM"],
    name: `${name.replace(/ /g, "")}Cluster`,
    onFailure: "DO_NOTHING",
    parameters: {
      AppRoleArn: app.outputs.lookup("RoleArn"),
    },
    templateUrl: `https://${bucket.bucketRegionalDomainName}/${basicClusterTemplate.key}?${Fn.substr(basicClusterTemplate.sourceHash, 0, 8)}`,
  });

  new CloudformationStack(scope, "Provisioner", {
    capabilities: ["CAPABILITY_IAM"],
    name: `${name.replace(/ /g, "")}Provisioner`,
    dependsOn: [fareCfResourceFunction],
    onFailure: "DO_NOTHING",
    parameters: {
      Ami: "ami-0a0e5d9c7acc336f1",
      ArtifactRegion: "us-east-1",
      ArtifactS3Bucket: bucket.bucket,
      ArtifactS3KeyPrefix: keyPrefix,
      Id: "main",
      InstanceProfileName: cluster.outputs.lookup("InstanceProfileName"),
      KeyPair: "Redo",
      RoleArn: cluster.outputs.lookup("RoleArn"),
      ProvisionerFunctionArn: app.outputs.lookup("ProvisionerFunctionArn"),
      RepoName: "test-actions",
      RunnerCountMax: "4",
      RunnerLabels: "fare-test",
      SecurityGroupId: cluster.outputs.lookup("SecurityGroupId"),
      SubnetId: cluster.outputs.lookup("SubnetId"),
      UserName: "pauldraper",
    },
    templateUrl: `https://${bucket.bucketRegionalDomainName}/${basicProvisionerTemplate.key}?${Fn.substr(basicProvisionerTemplate.sourceHash, 0, 8)}`,
  });
}
