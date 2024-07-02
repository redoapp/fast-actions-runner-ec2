import { Context } from "@redotech/cdk-util/context";
import {
  RunnerParams,
  runnerTemplateUrl,
} from "@redotech/fast-actions-ec2-runner-infra/runner";
import {
  CfnInternetGateway,
  CfnLaunchTemplate,
  CfnRoute,
  CfnRouteTable,
  CfnSecurityGroup,
  CfnSubnet,
  CfnSubnetRouteTableAssociation,
  CfnVPC,
  CfnVPCGatewayAttachment,
} from "aws-cdk-lib/aws-ec2";
import { CfnInstanceProfile, CfnRole } from "aws-cdk-lib/aws-iam";
import { Aws, CfnOutput, CfnParameter, CfnStack, Fn } from "aws-cdk-lib/core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";

export function basicStack(context: Context) {
  const amiParam = new CfnParameter(context.scope, "Ami", {
    description: "AMI ID",
    type: "AWS::EC2::Image::Id",
  });
  const ami = amiParam.valueAsString;

  const githubOrgParam = new CfnParameter(context.scope, "GithubOrg", {
    // https://github.com/dead-claudia/github-limits
    allowedPattern: "^([a-zA-Z0-9]+-?)*$",
    description: "GitHub organization",
    minLength: 1,
    maxLength: 39,
  });
  const githubOrg = githubOrgParam.valueAsString;

  const githubRepoParam = new CfnParameter(context.scope, "GithubRepo", {
    // https://github.com/dead-claudia/github-limits
    allowedPattern: "^([a-zA-Z0-9]+-?)*$",
    default: "",
    description: "GitHub repository",
    maxLength: 39,
  });
  const githubRepo = githubRepoParam.valueAsString;

  const githubTokenParam = new CfnParameter(context.scope, "GithubToken", {
    type: "AWS::SSM::Parameter::Name",
  });
  const githubToken = githubTokenParam.valueAsString;

  const githubWebhookSecretParam = new CfnParameter(
    context.scope,
    "GithubWebhookSecret",
    { description: "Github webhook secret", type: "AWS::SSM::Parameter::Name" },
  );
  const githubWebhookSecret = githubWebhookSecretParam.valueAsString;

  const instanceTypeParam = new CfnParameter(context.scope, "InstanceType", {
    description: "Instance size",
    default: "m5.large",
  });
  const instanceType = instanceTypeParam.valueAsString;

  const keyPairParam = new CfnParameter(context.scope, "KeyPair", {
    description: "Key pair name",
    default: "",
    type: "AWS::EC2::KeyPair::KeyName",
  });
  const keyPair = keyPairParam.valueAsString;

  const maxRunnersParam = new CfnParameter(context.scope, "RunnerCountMax", {
    type: "Number",
    description: "Maximum number of runners, or 0 for unlimited",
    default: 0,
    minValue: 0,
  });
  const maxRunners = maxRunnersParam.valueAsNumber;

  const runnerGroupParam = new CfnParameter(context.scope, "RunnerGroup", {
    description: "Runner group",
  });
  const runnerGroup = runnerGroupParam.valueAsString;

  const runnerLabelsParam = new CfnParameter(context.scope, "RunnerLabels", {
    default: "self-hosted",
    description: "Labels to apply to the runner",
    type: "List<String>",
  });
  const runnerLabels = runnerLabelsParam.valueAsList;

  const setupScriptB64Param = new CfnParameter(
    context.scope,
    "SetupScriptB64",
    {
      default: "",
      description: "Setup script, base 64 encoded",
      type: "String",
    },
  );
  const setupScriptB64 = setupScriptB64Param.valueAsString;

  const volumeSizeGibParam = new CfnParameter(context.scope, "VolumeSizeGib", {
    type: "Number",
    default: 64,
    description: "Root volume size in GiB",
  });
  const volumeSizeGib = volumeSizeGibParam.valueAsNumber;

  const { subnet, vpc } = networkStack(context.child("Network"));

  const { launchTemplate, role } = instanceStack(context.child("Instance"), {
    amiId: ami,
    instanceType,
    keyName: keyPair,
    setupScriptB64,
    subnet,
    volumeSizeGib,
    vpc,
  });

  const runnerParams: Record<string, string> & RunnerParams = {
    GithubOrg: githubOrg,
    GithubRepo: githubRepo,
    GithubToken: githubToken,
    GithubWebhookSecret: githubWebhookSecret,
    InstanceRole: role.attrArn,
    LaunchTemplate: `arn:aws:ec2:${Aws.REGION}:${Aws.ACCOUNT_ID}:launch-template/${launchTemplate.ref}`,
    LaunchTemplateVersion: launchTemplate.attrLatestVersionNumber,
    RunnerCountMax: maxRunners.toString(),
    RunnerGroup: runnerGroup,
    RunnerLabels: Fn.join(",", runnerLabels),
  };
  const runner = new CfnStack(context.scope, "Runner", {
    parameters: runnerParams,
    tags: [{ key: "Name", value: context.name.toString() }],
    templateUrl: runnerTemplateUrl,
  });
  const webhookUrl = Fn.getAtt(
    runner.logicalId,
    "Outputs.WebhookUrl",
  ).toString();

  new CfnOutput(context.scope, "WebhookUrl", {
    description: "Webhook URL",
    value: webhookUrl,
  });
}

export function networkStack(context: Context) {
  const vpc = new CfnVPC(context.scope, "Vpc", {
    cidrBlock: "10.83.0.0/16",
    tags: [{ key: "Name", value: context.name.toString() }],
  });

  const internet = new CfnInternetGateway(context.scope, "Internet", {
    tags: [{ key: "Name", value: context.name.toString() }],
  });

  const internetAttachment = new CfnVPCGatewayAttachment(
    context.scope,
    "InternetAttachment",
    { internetGatewayId: internet.ref, vpcId: vpc.ref },
  );

  const routeTable = new CfnRouteTable(context.scope, "RouteTable", {
    tags: [{ key: "Name", value: context.name.toString() }],
    vpcId: vpc.ref,
  });

  const routeIpv4 = new CfnRoute(context.scope, "RouteIpv4", {
    destinationCidrBlock: "0.0.0.0/0",
    gatewayId: internet.ref,
    routeTableId: routeTable.ref,
  });
  routeIpv4.addDependency(internetAttachment);

  const routeIpv6 = new CfnRoute(context.scope, "RouteIpv6", {
    destinationIpv6CidrBlock: "::/0",
    gatewayId: internet.ref,
    routeTableId: routeTable.ref,
  });
  routeIpv6.addDependency(internetAttachment);

  const subnet = new CfnSubnet(context.scope, "Subnet", {
    availabilityZone: Fn.select(0, Fn.getAzs()),
    cidrBlock: "10.83.16.0/20",
    mapPublicIpOnLaunch: true,
    tags: [{ key: "Name", value: context.name.toString() }],
    vpcId: vpc.ref,
  });

  new CfnSubnetRouteTableAssociation(context.scope, "SubnetRouteTable", {
    routeTableId: routeTable.ref,
    subnetId: subnet.ref,
  });

  return { subnet, vpc };
}

export function instanceStack(
  context: Context,
  {
    amiId,
    instanceType,
    keyName,
    setupScriptB64,
    subnet,
    volumeSizeGib,
    vpc,
  }: {
    amiId: string;
    instanceType: string;
    keyName: string;
    setupScriptB64: string;
    subnet: CfnSubnet;
    volumeSizeGib: number;
    vpc: CfnVPC;
  },
) {
  const securityGroup = new CfnSecurityGroup(context.scope, "SecurityGroup", {
    groupDescription: "Fast GitHub EC2 Runner",
    securityGroupEgress: [
      { cidrIp: "0.0.0.0/0", description: "IPv4", ipProtocol: "-1" },
      { cidrIpv6: "::/0", description: "IPv6", ipProtocol: "-1" },
    ],
    securityGroupIngress: [
      { cidrIp: "0.0.0.0/0", description: "IPv4", ipProtocol: "-1" },
      { cidrIpv6: "::/0", description: "IPv6", ipProtocol: "-1" },
    ],
    tags: [{ key: "Name", value: context.name.toString() }],
    vpcId: vpc.ref,
  });

  const role = new CfnRole(context.scope, "Role", {
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
    tags: [{ key: "Name", value: context.name.toString() }],
  });
  const instanceProfile = new CfnInstanceProfile(
    context.scope,
    "InstanceProfile",
    { roles: [role.ref] },
  );

  const cloudConfig = parse(
    readFileSync(join(__dirname, "cloud-config.yaml"), "utf8"),
  );
  cloudConfig.runcmd ||= [];
  cloudConfig.runcmd.push([
    "bash",
    "-c",
    readFileSync(join(__dirname, "setup.sh"), "utf8"),
    "setup",
    '${SetupScriptB64}',
  ]);

  const launchTemplate = new CfnLaunchTemplate(
    context.scope,
    "LaunchTemplate",
    {
      launchTemplateData: {
        blockDeviceMappings: [
          {
            deviceName: "/dev/xvda",
            ebs: { volumeSize: volumeSizeGib, volumeType: "gp2" },
          },
        ],
        imageId: amiId,
        iamInstanceProfile: { name: instanceProfile.ref },
        instanceType,
        keyName,
        networkInterfaces: [
          {
            associatePublicIpAddress: true,
            deleteOnTermination: true,
            deviceIndex: 0,
            groups: [securityGroup.ref],
            subnetId: subnet.ref,
          },
        ],
        tagSpecifications: [
          {
            resourceType: "instance",
            tags: [{ key: "Name", value: context.name.toString() }],
          },
        ],
        userData: Fn.base64(
          Fn.sub("#cloud-config\n" + stringify(cloudConfig), {
            SetupScriptB64: setupScriptB64,
          }),
        ),
      },
      tagSpecifications: [
        {
          resourceType: "launch-template",
          tags: [{ key: "Name", value: context.name.toString() }],
        },
      ],
    },
  );

  return { launchTemplate, role };
}
