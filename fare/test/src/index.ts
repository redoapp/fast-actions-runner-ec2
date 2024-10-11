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
      ArtifactS3Bucket: bucket.bucket,
      ArtifactS3KeyPrefix: keyPrefix,
    },
    templateUrl: `https://${bucket.bucketRegionalDomainName}/${appTemplate.key}?${appTemplate.sourceHash}`,
  });

  const cluster = new CloudformationStack(scope, "Cluster", {
    capabilities: ["CAPABILITY_IAM"],
    name: `${name.replace(/ /g, "")}Cluster`,
    onFailure: "DO_NOTHING",
    parameters: {
      ProvisionerFunctionArn: app.outputs.lookup("ProvisionerFunctionArn"),
      RoleArn: app.outputs.lookup("RoleArn"),
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
      ClusterStackName: cluster.name,
      Id: "main",
      KeyPair: "Redo",
      RepoName: "test-actions",
      RunnerCountMax: "4",
      RunnerGroupId: "4",
      RunnerLabels: "fare-test",
      UserName: "pauldraper",
    },
    templateUrl: `https://${bucket.bucketRegionalDomainName}/${basicProvisionerTemplate.key}?${basicProvisionerTemplate.sourceHash}`,
  });
}
