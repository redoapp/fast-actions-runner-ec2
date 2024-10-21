import { artifactParams } from "@redotech/cdk-util/artifact";
import { getName } from "@redotech/cdk-util/name";
import {
  provisionerStack as baseProvisionerStack,
  githubParams,
  runnerParams,
  scalingParams,
} from "@redotech/fare-infra/provisioner";
import { CfnLaunchTemplate } from "aws-cdk-lib/aws-ec2";
import { Aws, CfnCondition, CfnParameter, Fn, Stack } from "aws-cdk-lib/core";
import { Construct } from "constructs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function provisionerTemplate(stack: Stack) {
  const amiParam = new CfnParameter(stack, "Ami", {
    description: "AMI ID",
    type: "AWS::EC2::Image::Id",
  });
  const ami = amiParam.valueAsString;

  const idParam = new CfnParameter(stack, "Id", {
    description: "Provisioner ID",
    minLength: 1,
  });
  const id = idParam.valueAsString;

  const {
    artifactRegion,
    artifactS3Bucket,
    artifactS3KeyPrefix,
    paramGroup: artifactParamGroup,
    paramLabels: artifactParamLabels,
  } = artifactParams(stack);

  const {
    orgName,
    paramGroup: githubParamGroup,
    paramLabels: githubParamLabels,
    repoName,
    userName,
  } = githubParams(stack);

  const {
    paramGroup: runnerParamGroup,
    paramLabels: runnerParamLabels,
    runnerGroupId,
    runnerLabels,
  } = runnerParams(stack);

  const {
    idleTimeout,
    launchTimeout,
    runnerCountMax,
    runnerCountMin,
    runnerScaleFactor,
    paramGroup: scalingParamGroup,
    paramLabels: scalingParamLabels,
  } = scalingParams(stack);

  const roleArnParam = new CfnParameter(stack, "RoleArn", {
    default: "",
    description: "IAM role ARN for instances",
  });
  const roleArn = roleArnParam.valueAsString;

  const provisionerFunctionArnParam = new CfnParameter(
    stack,
    "ProvisionerFunctionArn",
    { description: "ARN of provisioner function" },
  );
  const provisionerFunctionArn = provisionerFunctionArnParam.valueAsString;

  const instanceTypeParam = new CfnParameter(stack, "InstanceType", {
    description: "Instance size",
    default: "m5.large",
  });
  const instanceType = instanceTypeParam.valueAsString;

  const keyPairParam = new CfnParameter(stack, "KeyPair", {
    default: "",
    description: "Key pair name",
    type: "String",
  });
  const keyPair = keyPairParam.valueAsString;

  const instanceProfileNameParam = new CfnParameter(
    stack,
    "InstanceProfileName",
    {
      description: "Name of instance profile",
    },
  );
  const instanceProfileName = instanceProfileNameParam.valueAsString;

  const securityGroupIdParam = new CfnParameter(stack, "SecurityGroupId", {
    description: "ID of security group",
  });
  const securityGroupId = securityGroupIdParam.valueAsString;

  const setupScriptB64Param = new CfnParameter(stack, "SetupScriptB64", {
    default: "",
    description: "Setup script, base 64 encoded",
    type: "String",
  });
  const setupScriptB64 = setupScriptB64Param.valueAsString;

  const subnetIdParam = new CfnParameter(stack, "SubnetId", {
    description: "ID of subnet",
  });
  const subnetId = subnetIdParam.valueAsString;

  const volumeSizeGibParam = new CfnParameter(stack, "VolumeSizeGib", {
    type: "Number",
    default: 64,
    description: "Root volume size in GiB",
  });
  const volumeSizeGib = volumeSizeGibParam.valueAsNumber;

  stack.addMetadata("AWS::CloudFormation::Interface", {
    ParameterGroups: [
      artifactParamGroup,
      githubParamGroup,
      runnerParamGroup,
      scalingParamGroup,
    ],
    ParameterLabels: {
      ...artifactParamLabels,
      ...githubParamLabels,
      ...runnerParamLabels,
      ...scalingParamLabels,
    },
  });

  provisionerStack(stack, {
    artifactRegion,
    artifactS3Bucket,
    artifactS3KeyPrefix,
    ami,
    orgName,
    repoName,
    id,
    idleTimeout,
    roleArn,
    instanceProfileName,
    instanceType,
    launchTimeout,
    keyPair,
    provisionerFunctionArn,
    runnerCountMax,
    runnerCountMin,
    runnerScaleFactor,
    runnerGroupId,
    runnerLabels,
    securityGroupId,
    setupScriptB64,
    subnetId,
    userName,
    volumeSizeGib,
  });
}

export function provisionerStack(
  scope: Construct,
  {
    artifactRegion,
    artifactS3Bucket,
    artifactS3KeyPrefix,
    ami,
    idleTimeout,
    instanceType,
    keyPair,
    id,
    instanceProfileName,
    launchTimeout,
    orgName,
    provisionerFunctionArn,
    repoName,
    roleArn,
    runnerCountMax,
    runnerCountMin,
    runnerScaleFactor,
    runnerGroupId,
    runnerLabels,
    securityGroupId,
    setupScriptB64,
    subnetId,
    userName,
    volumeSizeGib,
  }: {
    ami: string;
    artifactRegion: string;
    artifactS3Bucket: string;
    artifactS3KeyPrefix: string;
    id: string;
    idleTimeout: string;
    instanceProfileName: string;
    instanceType: string;
    keyPair: string;
    launchTimeout: string;
    orgName: string;
    provisionerFunctionArn: string;
    repoName: string;
    roleArn: string;
    runnerCountMax: number;
    runnerCountMin: number;
    runnerGroupId: number;
    runnerLabels: string[];
    runnerScaleFactor: number;
    securityGroupId: string;
    setupScriptB64: string;
    subnetId: string;
    userName: string;
    volumeSizeGib: number;
  },
) {
  const { launchTemplate } = instanceStack(new Construct(scope, "Instance"), {
    artifactRegion,
    artifactS3Bucket,
    artifactS3KeyPrefix,
    amiId: ami,
    securityGroupId,
    instanceProfileName,
    instanceType,
    keyName: keyPair,
    setupScriptB64,
    subnetId,
    volumeSizeGib,
  });

  baseProvisionerStack(new Construct(scope, "Provisioner"), {
    id,
    orgName,
    repoName,
    idleTimeout,
    launchTimeout,
    launchTemplateArn: `arn:aws:ec2:${Aws.REGION}:${Aws.ACCOUNT_ID}:launch-template/${launchTemplate.ref}`,
    runnerCountMax,
    runnerCountMin,
    runnerScaleFactor,
    launchTemplateVersion: launchTemplate.attrLatestVersionNumber,
    runnerGroupId,
    runnerLabels,
    provisionerFunctionArn,
    roleArn,
    userName,
  });
}

export function instanceStack(
  scope: Construct,
  {
    amiId,
    artifactRegion,
    artifactS3Bucket,
    artifactS3KeyPrefix,
    instanceProfileName,
    instanceType,
    keyName,
    securityGroupId,
    setupScriptB64,
    subnetId,
    volumeSizeGib,
  }: {
    amiId: string;
    artifactRegion: string;
    artifactS3Bucket: string;
    artifactS3KeyPrefix: string;
    instanceProfileName: string;
    instanceType: string;
    keyName: string;
    securityGroupId: string;
    setupScriptB64: string;
    subnetId: string;
    volumeSizeGib: number;
  },
) {
  const setup = readFileSync(join(__dirname, "setup.sh.tpl"), "utf-8");

  const keyNameEmpty = new CfnCondition(scope, "KeyNameEmpty", {
    expression: Fn.conditionEquals(keyName, ""),
  });

  const launchTemplate = new CfnLaunchTemplate(scope, "LaunchTemplate", {
    launchTemplateData: {
      blockDeviceMappings: [
        {
          deviceName: "/dev/sda1",
          ebs: { volumeSize: volumeSizeGib, volumeType: "gp3" },
        },
      ],
      imageId: amiId,
      iamInstanceProfile: { name: instanceProfileName },
      instanceType,
      keyName: Fn.conditionIf(
        keyNameEmpty.logicalId,
        Aws.NO_VALUE,
        keyName,
      ).toString(),
      networkInterfaces: [
        {
          associatePublicIpAddress: true,
          deleteOnTermination: true,
          deviceIndex: 0,
          groups: [securityGroupId],
          subnetId,
        },
      ],
      tagSpecifications: [
        {
          resourceType: "instance",
          tags: [{ key: "Name", value: getName(scope).toString() }],
        },
      ],
      userData: Fn.base64(
        Fn.sub(setup, {
          ArtifactRegion: artifactRegion,
          ArtifactS3Bucket: artifactS3Bucket,
          ArtifactS3KeyPrefix: artifactS3KeyPrefix,
          SetupBase64: setupScriptB64,
        }),
      ),
    },
    tagSpecifications: [
      {
        resourceType: "launch-template",
        tags: [{ key: "Name", value: getName(scope).toString() }],
      },
    ],
  });

  return { launchTemplate };
}
