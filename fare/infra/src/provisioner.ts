import { githubNameLengthMax, githubNamePattern } from "@redotech/github-util";
import {
  Aws,
  CfnCondition,
  CfnParameter,
  CustomResource,
  Fn,
  Stack,
} from "aws-cdk-lib/core";
import { Construct } from "constructs";
import { durationMinLength, durationPattern } from "./temporal";

export function provisionerTemplate(stack: Stack) {
  const idParam = new CfnParameter(stack, "Id", {
    description: "Provisioner ID",
    minLength: 1,
  });
  const id = idParam.valueAsString;

  const provisionerFunctionArnParam = new CfnParameter(
    stack,
    "ProvisionerFunctionArn",
    {
      description: "Provisioner function ARN",
      minLength: 1,
    },
  );
  const provisionerFunctionArn = provisionerFunctionArnParam.valueAsString;

  const {
    launchTemplateArn,
    launchTemplateVersion,
    paramGroup: ec2ParamGroup,
    paramLabels: ec2ParamLabels,
    roleArn,
  } = ec2Params(stack);

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

  stack.addMetadata("AWS::CloudFormation::Interface", {
    ParameterGroups: [
      {
        Label: { default: "Base" },
        Parameters: [provisionerFunctionArnParam.logicalId],
      },
      githubParamGroup,
      runnerParamGroup,
      ec2ParamGroup,
      scalingParamGroup,
    ],
    ParameterLabels: {
      [provisionerFunctionArnParam.logicalId]: {
        default: "Provisioner function ARN",
      },
      ...githubParamLabels,
      ...runnerParamLabels,
      ...scalingParamLabels,
      ...ec2ParamLabels,
    },
  });

  provisionerStack(stack, {
    id,
    provisionerFunctionArn,
    orgName,
    repoName,
    roleArn,
    userName,
    idleTimeout,
    launchTimeout,
    launchTemplateArn,
    launchTemplateVersion,
    runnerGroupId,
    runnerLabels,
    runnerCountMax,
  });
}

export function ec2Params(scope: Construct) {
  const launchTemplateArnParam = new CfnParameter(scope, "LaunchTemplateArn", {
    description: "Launch template ARN",
    // allowedPattern: launchTemplateArnPattern,
    minLength: 1,
  });
  const launchTemplateArn = launchTemplateArnParam.valueAsString;

  const launchTemplateVersionParam = new CfnParameter(
    scope,
    "LaunchTemplateVersion",
    { description: "Launch template version", minLength: 1 },
  );
  const launchTemplateVersion = launchTemplateVersionParam.valueAsString;

  const roleArnParam = new CfnParameter(scope, "RoleArn", {
    type: "String",
    description: "Role for EC2 operations",
    minLength: 1,
  });
  const roleArn = roleArnParam.valueAsString;

  const paramLabels = {
    [launchTemplateArnParam.logicalId]: { default: "Launch template" },
    [launchTemplateVersionParam.logicalId]: {
      default: "Launch template version",
    },
  };

  const paramGroup = {
    Label: { default: "EC2" },
    Parameters: [
      launchTemplateArnParam.logicalId,
      launchTemplateVersionParam.logicalId,
    ],
  };

  return {
    launchTemplateArn,
    launchTemplateVersion,
    roleArn,
    paramLabels,
    paramGroup,
  };
}

export function githubParams(scope: Construct) {
  const orgNameParam = new CfnParameter(scope, "OrgName", {
    allowedPattern: githubNamePattern,
    default: "",
    description: "GitHub organization name, mutually exclusive with user name",
    maxLength: githubNameLengthMax,
  });
  const orgName = orgNameParam.valueAsString;

  const userNameParam = new CfnParameter(scope, "UserName", {
    allowedPattern: githubNamePattern,
    default: "",
    description: "GitHub user name, mutually exclusive with organization name",
    maxLength: githubNameLengthMax,
  });
  const userName = userNameParam.valueAsString;

  const repoNameParam = new CfnParameter(scope, "RepoName", {
    allowedPattern: githubNamePattern,
    description: "GitHub repository name",
    maxLength: githubNameLengthMax,
  });
  const repoName = repoNameParam.valueAsString;

  const paramGroup = {
    Label: { default: "GitHub" },
    Parameters: [
      orgNameParam.logicalId,
      userNameParam.logicalId,
      repoNameParam.logicalId,
    ],
  };

  const paramLabels = {
    [orgNameParam.logicalId]: { default: "GitHub organization" },
    [repoNameParam.logicalId]: { default: "GitHub repository" },
    [userNameParam.logicalId]: { default: "GitHub user" },
  };

  return {
    orgName,
    repoName,
    userName,
    paramLabels,
    paramGroup,
  };
}

export function runnerParams(scope: Construct) {
  const runnerGroupIdParam = new CfnParameter(scope, "RunnerGroupId", {
    default: 1,
    description: "Runner group ID",
    type: "Number",
  });
  const runnerGroupId = runnerGroupIdParam.valueAsNumber;

  const runnerLabelsParam = new CfnParameter(scope, "RunnerLabels", {
    description: "Labels to apply to the runner",
    minLength: 1,
    type: "List<String>",
  });
  const runnerLabels = runnerLabelsParam.valueAsList;

  const paramGroup = {
    Label: { default: "Runner" },
    Parameters: [runnerGroupIdParam.logicalId, runnerLabelsParam.logicalId],
  };

  const paramLabels = {
    [runnerGroupIdParam.logicalId]: { default: "Runner group" },
    [runnerLabelsParam.logicalId]: { default: "Runner labels" },
  };

  return { runnerGroupId, runnerLabels, paramGroup, paramLabels };
}

export function scalingParams(scope: Construct) {
  const launchTimeoutParam = new CfnParameter(scope, "LaunchTimeout", {
    description: "Launch timeout",
    default: "PT10M",
    minLength: 1,
  });
  const launchTimeout = launchTimeoutParam.valueAsString;

  const idleTimeoutParam = new CfnParameter(scope, "IdleTimeout", {
    description: "Idle timeout",
    default: "PT2M",
    allowedPattern: durationPattern,
    minLength: durationMinLength,
  });
  const idleTimeout = idleTimeoutParam.valueAsString;

  const runnerCountMaxParam = new CfnParameter(scope, "RunnerCountMax", {
    type: "Number",
    description: "Maximum number of runners, or -1 for unlimited",
    default: -1,
    minValue: -1,
  });
  const runnerCountMax = runnerCountMaxParam.valueAsNumber;

  const paramLabels = {
    [idleTimeoutParam.logicalId]: { default: "Idle timeout" },
    [runnerCountMaxParam.logicalId]: { default: "Maximum runners" },
  };

  const paramGroup = {
    Label: { default: "Scaling" },
    Parameters: [runnerCountMaxParam.logicalId, idleTimeoutParam.logicalId],
  };

  return {
    idleTimeout,
    launchTimeout,
    runnerCountMax,
    paramLabels,
    paramGroup,
  };
}

export function provisionerStack(
  scope: Construct,
  {
    id,
    idleTimeout,
    launchTemplateArn,
    launchTemplateVersion,
    launchTimeout,
    orgName,
    provisionerFunctionArn,
    repoName,
    roleArn,
    runnerCountMax,
    runnerGroupId,
    runnerLabels,
    userName,
  }: {
    userName: string;
    id: string;
    idleTimeout: string;
    launchTemplateArn: string;
    launchTemplateVersion: string;
    launchTimeout: string;
    orgName: string;
    provisionerFunctionArn: string;
    repoName: string;
    roleArn: string;
    runnerCountMax: number;
    runnerGroupId: number;
    runnerLabels: string[];
  },
) {
  const orgNameEmpty = new CfnCondition(scope, "OrgNameEmpty", {
    expression: Fn.conditionEquals(orgName, ""),
  });
  const repoNameEmpty = new CfnCondition(scope, "RepoNameEmpty", {
    expression: Fn.conditionEquals(repoName, ""),
  });
  const userNameEmpty = new CfnCondition(scope, "UserNameEmpty", {
    expression: Fn.conditionEquals(userName, ""),
  });

  new CustomResource(scope, "Resource", {
    serviceToken: provisionerFunctionArn,
    properties: {
      CountMax: runnerCountMax,
      Id: id,
      IdleTimeout: idleTimeout,
      Labels: runnerLabels,
      LaunchTemplateArn: launchTemplateArn,
      LaunchTemplateVersion: launchTemplateVersion,
      LaunchTimeout: launchTimeout,
      OrgName: Fn.conditionIf(orgNameEmpty.logicalId, Aws.NO_VALUE, orgName),
      RepoName: Fn.conditionIf(repoNameEmpty.logicalId, Aws.NO_VALUE, repoName),
      RoleArn: roleArn,
      RunnerGroupId: runnerGroupId,
      UserName: Fn.conditionIf(userNameEmpty.logicalId, Aws.NO_VALUE, userName),
    },
  });
}
