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
} from "@redotech/fast-actions-ec2-runner-infra/provisioner";
import { CfnLaunchTemplate } from "aws-cdk-lib/aws-ec2";
import { CfnRole, CfnRolePolicy } from "aws-cdk-lib/aws-iam";
import { Aws, CfnParameter, Fn, Stack } from "aws-cdk-lib/core";
import { Construct } from "constructs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function provisionerTemplate(stack: Stack) {
  const amiParam = new CfnParameter(stack, "Ami", {
    description: "AMI ID",
    type: "AWS::EC2::Image::Id",
  });
  const ami = amiParam.valueAsString;

  const baseStackNameParam = new CfnParameter(stack, "BaseStackName", {
    allowedPattern: cloudformationStackNamePattern,
    description: "Base stack name",
    minLength: cloudformationStackNameMinLength,
    maxLength: cloudformationStackNameMaxLength,
  });
  const baseStackName = baseStackNameParam.valueAsString;

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

  const instanceTypeParam = new CfnParameter(stack, "InstanceType", {
    description: "Instance size",
    default: "m5.large",
  });
  const instanceType = instanceTypeParam.valueAsString;

  const keyPairParam = new CfnParameter(stack, "KeyPair", {
    description: "Key pair name",
    default: "",
    type: "AWS::EC2::KeyPair::KeyName",
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
        Parameters: [baseStackNameParam.logicalId],
      },
      githubParamGroup,
      runnerParamGroup,
      scalingParamGroup,
    ],
    ParameterLabels: {
      [baseStackNameParam.logicalId]: { default: "Base stack" },
      ...githubParamLabels,
      ...runnerParamLabels,
      ...scalingParamLabels,
    },
  });

  provisionerStack(stack, {
    ami,
    baseRoleArn: Fn.importValue(`${baseStackName}:RoleArn`),
    orgName,
    repoName,
    idleTimeout,
    instanceProfile: Fn.importValue(`${baseStackName}:InstanceProfileName`),
    instanceType,
    launchTimeout,
    keyPair,
    provisionerFunctionArn: Fn.importValue(
      `${baseStackName}:ProvisionerFunctionArn`,
    ),
    runnerCountMax,
    runnerGroupId,
    runnerLabels,
    securityGroupId: Fn.importValue(`${baseStackName}:SecurityGroupId`),
    setupScriptB64,
    subnetId: Fn.importValue(`${baseStackName}:SubnetId`),
    userName,
    volumeSizeGib,
  });
}

export function provisionerStack(
  scope: Construct,
  {
    ami,
    baseRoleArn,
    idleTimeout,
    instanceProfile,
    instanceType,
    keyPair,
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
    ami: string;
    baseRoleArn: string;
    idleTimeout: string;
    instanceProfile: string;
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
      artifactUrl: "TODO",
      amiId: ami,
      baseRoleArn,
      securityGroupId,
      instanceType,
      instanceProfile,
      keyName: keyPair,
      setupScriptB64,
      subnetId,
      volumeSizeGib,
    },
  );

  baseProvisionerStack(new Construct(scope, "Provisioner"), {
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
    artifactUrl,
    instanceType,
    keyName,
    instanceProfile,
    baseRoleArn,
    securityGroupId,
    setupScriptB64,
    subnetId,
    volumeSizeGib,
  }: {
    amiId: string;
    artifactUrl: string;
    baseRoleArn: string;
    instanceType: string;
    keyName: string;
    instanceProfile: string;
    securityGroupId: string;
    setupScriptB64: string;
    subnetId: string;
    volumeSizeGib: number;
  },
) {
  const setup = readFileSync(join(__dirname, "setup.sh.tpl"), "utf-8");

  const launchTemplate = new CfnLaunchTemplate(scope, "LaunchTemplate", {
    launchTemplateData: {
      blockDeviceMappings: [
        {
          deviceName: "/dev/xvda",
          ebs: { volumeSize: volumeSizeGib, volumeType: "gp3" },
        },
      ],
      imageId: amiId,
      iamInstanceProfile: { name: instanceProfile },
      instanceType,
      keyName,
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
          ArtifactUrl: artifactUrl,
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
    roleName: iamPolicyName(getName(scope)),
    tags: [{ key: "Name", value: getName(scope).toString() }],
  });

  new CfnRolePolicy(scope, "RolePolicy", {
    policyDocument: {
      Statement: [
        {
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
      ],
      Version: "2012-10-17",
    },
    policyName: iamPolicyName(getName(scope)),
    roleName: role.ref,
  });

  return { launchTemplate, role };
}
