import { artifactParams } from "@redotech/cdk-util/artifact";
import {
  cloudformationStackNameMaxLength,
  cloudformationStackNameMinLength,
  cloudformationStackNamePattern,
} from "@redotech/cdk-util/cf";
import { iamPolicyName } from "@redotech/cdk-util/iam";
import { getName } from "@redotech/cdk-util/name";
import {
  provisionerStack as baseProvisionerStack,
  githubParams,
  runnerParams,
  scalingParams,
} from "@redotech/fare-infra/provisioner";
import { CfnLaunchTemplate } from "aws-cdk-lib/aws-ec2";
import {
  CfnInstanceProfile,
  CfnRole,
  CfnRolePolicy,
} from "aws-cdk-lib/aws-iam";
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

  const clusterStackNameParam = new CfnParameter(stack, "ClusterStackName", {
    allowedPattern: cloudformationStackNamePattern,
    description: "Cluster stack name",
    minLength: cloudformationStackNameMinLength,
    maxLength: cloudformationStackNameMaxLength,
  });
  const clusterStackName = clusterStackNameParam.valueAsString;

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
  } = artifactParams(stack, { includeRegion: true });

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
    paramGroup: scalingParamGroup,
    paramLabels: scalingParamLabels,
  } = scalingParams(stack);

  const roleArnParam = new CfnParameter(stack, "RoleArn", {
    default: "",
    description: "IAM role ARN for instances",
  });
  const roleArn = roleArnParam.valueAsString;

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

  const setupScriptB64Param = new CfnParameter(stack, "SetupScriptB64", {
    default: "",
    description: "Setup script, base 64 encoded",
    type: "String",
  });
  const setupScriptB64 = setupScriptB64Param.valueAsString;

  const volumeSizeGibParam = new CfnParameter(stack, "VolumeSizeGib", {
    type: "Number",
    default: 64,
    description: "Root volume size in GiB",
  });
  const volumeSizeGib = volumeSizeGibParam.valueAsNumber;

  stack.addMetadata("AWS::CloudFormation::Interface", {
    ParameterGroups: [
      {
        Label: { default: "Base" },
        Parameters: [clusterStackNameParam.logicalId],
      },
      artifactParamGroup,
      githubParamGroup,
      runnerParamGroup,
      scalingParamGroup,
    ],
    ParameterLabels: {
      [clusterStackNameParam.logicalId]: { default: "Base stack" },
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
    baseRoleArn: Fn.importValue(`${clusterStackName}:RoleArn`),
    orgName,
    repoName,
    id,
    idleTimeout,
    roleArn,
    instanceType,
    launchTimeout,
    keyPair,
    provisionerFunctionArn: Fn.importValue(
      `${clusterStackName}:ProvisionerFunctionArn`,
    ),
    runnerCountMax,
    runnerGroupId,
    runnerLabels,
    securityGroupId: Fn.importValue(`${clusterStackName}:SecurityGroupId`),
    setupScriptB64,
    subnetId: Fn.importValue(`${clusterStackName}:SubnetId`),
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
    baseRoleArn,
    idleTimeout,
    roleArn,
    instanceType,
    keyPair,
    id,
    launchTimeout,
    orgName,
    provisionerFunctionArn,
    repoName,
    runnerCountMax,
    runnerGroupId,
    runnerLabels,
    securityGroupId,
    setupScriptB64,
    subnetId,
    userName,
    volumeSizeGib,
  }: {
    artifactRegion: string;
    artifactS3Bucket: string;
    artifactS3KeyPrefix: string;
    ami: string;
    baseRoleArn: string;
    id: string;
    idleTimeout: string;
    roleArn: string;
    instanceType: string;
    keyPair: string;
    launchTimeout: string;
    orgName: string;
    provisionerFunctionArn: string;
    repoName: string;
    runnerCountMax: number;
    runnerGroupId: number;
    runnerLabels: string[];
    securityGroupId: string;
    setupScriptB64: string;
    subnetId: string;
    userName: string;
    volumeSizeGib: number;
  },
) {
  const { launchTemplate, role } = instanceStack(
    new Construct(scope, "Instance"),
    {
      artifactRegion,
      artifactS3Bucket,
      artifactS3KeyPrefix,
      amiId: ami,
      baseRoleArn,
      securityGroupId,
      instanceType,
      roleArn,
      keyName: keyPair,
      setupScriptB64,
      subnetId,
      volumeSizeGib,
    },
  );

  baseProvisionerStack(new Construct(scope, "Provisioner"), {
    id,
    orgName,
    repoName,
    idleTimeout,
    launchTimeout,
    launchTemplateArn: `arn:aws:ec2:${Aws.REGION}:${Aws.ACCOUNT_ID}:launch-template/${launchTemplate.ref}`,
    runnerCountMax,
    launchTemplateVersion: launchTemplate.attrLatestVersionNumber,
    runnerGroupId,
    runnerLabels,
    provisionerFunctionArn,
    roleArn: role.attrArn,
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
    instanceType,
    keyName,
    roleArn,
    baseRoleArn,
    securityGroupId,
    setupScriptB64,
    subnetId,
    volumeSizeGib,
  }: {
    amiId: string;
    artifactRegion: string;
    artifactS3Bucket: string;
    artifactS3KeyPrefix: string;
    baseRoleArn: string;
    instanceType: string;
    keyName: string;
    roleArn: string;
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

  const roleEmpty = new CfnCondition(scope, "RoleEmpty", {
    expression: Fn.conditionEquals(roleArn, ""),
  });

  const instanceRole = new CfnRole(scope, "InstanceRole", {
    assumeRolePolicyDocument: {
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: { Service: "ec2.amazonaws.com" },
        },
      ],
      Version: "2012-10-17",
    },
    description: getName(scope).toString(),
    tags: [{ key: "Name", value: getName(scope).toString() }],
  });
  instanceRole.cfnOptions.condition = roleEmpty;

  const instanceProfile = new CfnInstanceProfile(scope, "InstanceProfile", {
    roles: [
      Fn.conditionIf(roleEmpty.logicalId, instanceRole.ref, roleArn).toString(),
    ],
  });

  const launchTemplate = new CfnLaunchTemplate(scope, "LaunchTemplate", {
    launchTemplateData: {
      blockDeviceMappings: [
        {
          deviceName: "/dev/xvda",
          ebs: { volumeSize: volumeSizeGib, volumeType: "gp3" },
        },
      ],
      imageId: amiId,
      iamInstanceProfile: { name: instanceProfile.ref },
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

  const role = new CfnRole(scope, "Role", {
    assumeRolePolicyDocument: {
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: { AWS: baseRoleArn },
        },
      ],
      Version: "2012-10-17",
    },
    description: getName(scope).toString(),
    tags: [{ key: "Name", value: getName(scope).toString() }],
  });

  new CfnRolePolicy(scope, "RolePolicy", {
    policyDocument: {
      Statement: [
        {
          // TODO: limit by resource tags
          Action: [
            "ec2:CreateTags",
            "ec2:DescribeInstances",
            "ec2:RunInstances",
            "ec2:StartInstances",
            "ec2:StopInstances",
            "ec2:TerminateInstances",
          ],
          Effect: "Allow",
          Resource: "*",
        },
        {
          Action: "iam:PassRole",
          Effect: "Allow",
          Resource: instanceRole.attrArn,
        },
      ],
      Version: "2012-10-17",
    },
    policyName: iamPolicyName(getName(scope)),
    roleName: role.ref,
  });

  return { launchTemplate, role };
}
