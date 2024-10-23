import { iamPolicyName } from "@redotech/cdk-util/iam";
import { getName } from "@redotech/cdk-util/name";
import {
  CfnInternetGateway,
  CfnRoute,
  CfnRouteTable,
  CfnSecurityGroup,
  CfnSubnet,
  CfnSubnetRouteTableAssociation,
  CfnVPC,
  CfnVPCCidrBlock,
  CfnVPCGatewayAttachment,
} from "aws-cdk-lib/aws-ec2";
import {
  CfnInstanceProfile,
  CfnRole,
  CfnRolePolicy,
} from "aws-cdk-lib/aws-iam";
import { CfnOutput, CfnParameter, Fn, Stack } from "aws-cdk-lib/core";
import { Construct } from "constructs";

export function clusterTemplate(stack: Stack) {
  const appRoleArnParam = new CfnParameter(stack, "AppRoleArn", {
    description: "ARN of app IAM role",
  });
  const appRoleArn = appRoleArnParam.valueAsString;

  const { instanceProfile, instanceRole, securityGroup, subnet, role } =
    clusterStack(stack, { appRoleArn });

  new CfnOutput(stack, "InstanceProfileName", {
    description: "Instance profile name",
    value: instanceProfile.ref,
  });

  new CfnOutput(stack, "InstanceRoleArn", {
    description: "Instance role arn",
    value: instanceRole.attrArn,
  });

  new CfnOutput(stack, "RoleArn", {
    description: "ARN of control role",
    value: role.attrArn,
  });

  new CfnOutput(stack, "SecurityGroupId", {
    description: "Security group ID",
    value: securityGroup.ref,
  });

  new CfnOutput(stack, "SubnetId", {
    description: "Subnet ID",
    value: subnet.ref,
  });
}

export function clusterStack(
  scope: Construct,
  { appRoleArn }: { appRoleArn: string },
) {
  const { subnet, vpc } = networkStack(new Construct(scope, "Network"));

  const {
    instanceProfile,
    role: instanceRole,
    securityGroup,
  } = instanceStack(new Construct(scope, "Instance"), { vpc });

  const role = new CfnRole(scope, "Role", {
    assumeRolePolicyDocument: {
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: { AWS: appRoleArn },
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

  return { instanceProfile, instanceRole, role, securityGroup, subnet };
}

export function networkStack(scope: Construct) {
  const vpc = new CfnVPC(scope, "Vpc", {
    cidrBlock: "10.83.0.0/16",
    tags: [{ key: "Name", value: getName(scope).toString() }],
  });
  const vpcIpv6 = new CfnVPCCidrBlock(scope, "VpcIpv6", {
    amazonProvidedIpv6CidrBlock: true,
    vpcId: vpc.ref,
  });

  const internet = new CfnInternetGateway(scope, "Internet", {
    tags: [{ key: "Name", value: getName(scope).toString() }],
  });

  const internetAttachment = new CfnVPCGatewayAttachment(
    scope,
    "InternetAttachment",
    { internetGatewayId: internet.ref, vpcId: vpc.ref },
  );

  const routeTable = new CfnRouteTable(scope, "RouteTable", {
    tags: [{ key: "Name", value: getName(scope).toString() }],
    vpcId: vpc.ref,
  });

  const routeIpv4 = new CfnRoute(scope, "RouteIpv4", {
    destinationCidrBlock: "0.0.0.0/0",
    gatewayId: internet.ref,
    routeTableId: routeTable.ref,
  });
  routeIpv4.addDependency(internetAttachment);

  const routeIpv6 = new CfnRoute(scope, "RouteIpv6", {
    destinationIpv6CidrBlock: "::/0",
    gatewayId: internet.ref,
    routeTableId: routeTable.ref,
  });
  routeIpv6.addDependency(internetAttachment);

  const subnet = new CfnSubnet(scope, "Subnet", {
    assignIpv6AddressOnCreation: true,
    availabilityZone: Fn.select(0, Fn.getAzs()),
    cidrBlock: Fn.select(1, Fn.cidr(vpc.attrCidrBlock, 16, "12")),
    ipv6CidrBlock: Fn.select(
      1,
      Fn.cidr(Fn.select(0, vpc.attrIpv6CidrBlocks), 16, "68"),
    ),
    mapPublicIpOnLaunch: true,
    tags: [{ key: "Name", value: getName(scope).toString() }],
    vpcId: vpc.ref,
  });
  subnet.addDependency(vpcIpv6);

  new CfnSubnetRouteTableAssociation(scope, "SubnetRouteTable", {
    routeTableId: routeTable.ref,
    subnetId: subnet.ref,
  });

  return { subnet, vpc };
}

export function instanceStack(scope: Construct, { vpc }: { vpc: CfnVPC }) {
  const role = new CfnRole(scope, "InstanceRole", {
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
    managedPolicyArns: ["arn:aws:iam::aws:policy/CloudWatchAgentAdminPolicy"],
    tags: [{ key: "Name", value: getName(scope).toString() }],
  });

  const instanceProfile = new CfnInstanceProfile(scope, "InstanceProfile", {
    roles: [role.ref],
  });

  const securityGroup = new CfnSecurityGroup(scope, "SecurityGroup", {
    groupDescription: "Fast GitHub EC2 Runner",
    securityGroupEgress: [
      { cidrIp: "0.0.0.0/0", description: "IPv4", ipProtocol: "-1" },
      { cidrIpv6: "::/0", description: "IPv6", ipProtocol: "-1" },
    ],
    securityGroupIngress: [
      {
        cidrIp: "0.0.0.0/0",
        description: "ICMP",
        ipProtocol: "icmp",
        fromPort: -1,
        toPort: -1,
      },
      {
        cidrIpv6: "::/0",
        description: "ICMPv6",
        ipProtocol: "icmpv6",
        fromPort: -1,
        toPort: -1,
      },
      {
        cidrIp: "0.0.0.0/0",
        description: "SSH",
        ipProtocol: "tcp",
        fromPort: 22,
        toPort: 22,
      },
      {
        cidrIpv6: "::/0",
        description: "SSHv6",
        ipProtocol: "tcp",
        fromPort: 22,
        toPort: 22,
      },
    ],
    tags: [{ key: "Name", value: getName(scope).toString() }],
    vpcId: vpc.ref,
  });

  return { instanceProfile, role, securityGroup };
}
