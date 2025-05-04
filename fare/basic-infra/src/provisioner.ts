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
    artifactDomain,
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

  const volumeTypeParam = new CfnParameter(stack, "VolumeType", {
    type: "String",
    default: "gp3",
    description: "Root volume type",
  });
  const volumeType = volumeTypeParam.valueAsString;

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
    artifactDomain,
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
    volumeType,
  });
}

export function provisionerStack(
  scope: Construct,
  {
    ami,
    artifactDomain,
    artifactRegion,
    artifactS3Bucket,
    artifactS3KeyPrefix,
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
    volumeType,
  }: {
    ami: string;
    artifactDomain: string;
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
    volumeType: string;
  },
) {
  const { launchTemplate } = instanceStack(new Construct(scope, "Instance"), {
    artifactDomain,
    artifactRegion,
    artifactS3Bucket,
    artifactS3KeyPrefix,
    amiId: ami,
    id,
    instanceProfileName,
    instanceType,
    keyName: keyPair,
    securityGroupId,
    setupScriptB64,
    subnetId,
    volumeSizeGib,
    volumeType,
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
    artifactDomain,
    artifactRegion,
    artifactS3Bucket,
    artifactS3KeyPrefix,
    id,
    instanceProfileName,
    instanceType,
    keyName,
    securityGroupId,
    setupScriptB64,
    subnetId,
    volumeSizeGib,
    volumeType,
  }: {
    amiId: string;
    artifactDomain: string;
    artifactRegion: string;
    artifactS3Bucket: string;
    artifactS3KeyPrefix: string;
    id: string;
    instanceProfileName: string;
    instanceType: string;
    keyName: string;
    securityGroupId: string;
    setupScriptB64: string;
    subnetId: string;
    volumeSizeGib: number;
    volumeType: string;
  },
) {
  const cloudwatchAgent = readFileSync(
    require.resolve("./cloudwatch-agent.json.tpl"),
    "utf-8",
  );
  const fluentBit = readFileSync(
    require.resolve("./fluent-bit.conf.tpl"),
    "utf-8",
  );
  const fcntlLock = readFileSync(
    require.resolve("./fcntl-lock.py"),
    "utf-8",
  );
  const setup = readFileSync(require.resolve("./setup.sh.tpl"), "utf-8");

  const keyNameEmpty = new CfnCondition(scope, "KeyNameEmpty", {
    expression: Fn.conditionEquals(keyName, ""),
  });

  const launchTemplate = new CfnLaunchTemplate(scope, "LaunchTemplate", {
    launchTemplateData: {
      blockDeviceMappings: [
        {
          deviceName: "/dev/sda1",
          ebs: { volumeSize: volumeSizeGib, volumeType: volumeType },
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
          ArtifactDomain: artifactDomain,
          ArtifactRegion: artifactRegion,
          ArtifactS3Bucket: artifactS3Bucket,
          ArtifactS3KeyPrefix: artifactS3KeyPrefix,
          AwsDomain: Aws.URL_SUFFIX,
          AwsRegion: Aws.REGION,
          CloudwatchAgent: Fn.base64(
            Fn.sub(cloudwatchAgent, {
              Name: Aws.STACK_NAME,
              ProvisionerId: id,
            }),
          ),
          FluentBit: Fn.base64(
            Fn.sub(fluentBit, {
              AwsRegion: Aws.REGION,
              Name: Aws.STACK_NAME,
              ProvisionerId: id,
            }),
          ),
          FcntlLockBase64: Fn.base64(fcntlLock),
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
