import { getName } from "@redotech/cdk-util/name";
import {
  CfnInternetGateway,
  CfnRoute,
  CfnRouteTable,
  CfnSecurityGroup,
  CfnSubnet,
  CfnSubnetRouteTableAssociation,
  CfnVPC,
  CfnVPCGatewayAttachment,
} from "aws-cdk-lib/aws-ec2";
import { CfnInstanceProfile, CfnRole } from "aws-cdk-lib/aws-iam";
import { Aws, CfnOutput, CfnParameter, Fn, Stack } from "aws-cdk-lib/core";
import { Construct } from "constructs";

export function clusterTemplate(stack: Stack) {
  const roleArnParam = new CfnParameter(stack, "RoleArn", {
    description: "ARN of app role",
  });
  const roleArn = roleArnParam.valueAsString;

  const provisionerFunctionArnParam = new CfnParameter(
    stack,
    "ProvisionerFunctionArn",
    { description: "ARN of provisioner function" },
  );
  const provisionerFunctionArn = provisionerFunctionArnParam.valueAsString;

  const { instanceProfile, securityGroup, subnet } = clusterStack(stack);

  new CfnOutput(stack, "InstanceProfileName", {
    description: "Instance profile name",
    exportName: `${Aws.STACK_NAME}:InstanceProfileName`,
    value: instanceProfile.ref,
  });

  new CfnOutput(stack, "RoleArnOutput", {
    description: "Role arn",
    exportName: `${Aws.STACK_NAME}:RoleArn`,
    key: "RoleArn",
    value: roleArn,
  });

  new CfnOutput(stack, "SecurityGroupId", {
    description: "Security group ID",
    exportName: `${Aws.STACK_NAME}:SecurityGroupId`,
    value: securityGroup.ref,
  });

  new CfnOutput(stack, "ProvisionerFunctionArnOutput", {
    key: "ProvisionerFunctionArn",
    exportName: `${Aws.STACK_NAME}:ProvisionerFunctionArn`,
    description: "Lambda function ARN to provide provisioner URL",
    value: provisionerFunctionArn,
  });

  new CfnOutput(stack, "SubnetId", {
    description: "Subnet ID",
    exportName: `${Aws.STACK_NAME}:SubnetId`,
    value: subnet.ref,
  });
}

export function clusterStack(scope: Construct) {
  const { subnet, vpc } = networkStack(new Construct(scope, "Network"));

  const { instanceProfile, securityGroup } = instanceStack(
    new Construct(scope, "Instance"),
    { vpc },
  );

  return { instanceProfile, securityGroup, subnet };
}

export function networkStack(scope: Construct) {
  const vpc = new CfnVPC(scope, "Vpc", {
    cidrBlock: "10.83.0.0/16",
    tags: [{ key: "Name", value: getName(scope).toString() }],
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
    availabilityZone: Fn.select(0, Fn.getAzs()),
    cidrBlock: "10.83.16.0/20",
    mapPublicIpOnLaunch: true,
    tags: [{ key: "Name", value: getName(scope).toString() }],
    vpcId: vpc.ref,
  });

  new CfnSubnetRouteTableAssociation(scope, "SubnetRouteTable", {
    routeTableId: routeTable.ref,
    subnetId: subnet.ref,
  });

  return { subnet, vpc };
}

export function instanceStack(scope: Construct, { vpc }: { vpc: CfnVPC }) {
  const role = new CfnRole(scope, "Role", {
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
      { cidrIp: "0.0.0.0/0", description: "IPv4", ipProtocol: "-1" },
      { cidrIpv6: "::/0", description: "IPv6", ipProtocol: "-1" },
    ],
    tags: [{ key: "Name", value: getName(scope).toString() }],
    vpcId: vpc.ref,
  });

  return { instanceProfile, securityGroup };
}
