import "./polyfill";

import { parse } from "@aws-sdk/util-arn-parser";
import { CloudFormationCustomResourceHandler } from "aws-lambda";
import { FAILED, SUCCESS, send } from "cfn-response";
import { ProvisionerAction, provisionerManager } from "./provisioner";

const provisionerTableName = process.env.PROVISIONER_TABLE_NAME!;

const manager = provisionerManager({ provisionerTableName });

export const handler: CloudFormationCustomResourceHandler = async (
  event,
  context,
) => {
  try {
    const resourceProperties = event.ResourceProperties;
    const countMax = resourceProperties.CountMax;
    const id = resourceProperties.Id;
    const idleTimeout = Temporal.Duration.from(resourceProperties.IdleTimeout);
    const labels = resourceProperties.Labels;
    const launchTemplateArn = parse(resourceProperties.LaunchTemplateArn);
    const launchTemplateVersion = resourceProperties.LaunchTemplateVersion;
    const roleArn =
      resourceProperties.RoleArn !== undefined
        ? parse(event.ResourceProperties.RoleArn)
        : undefined;
    const launchTimeout = Temporal.Duration.from(
      resourceProperties.LaunchTimeout,
    );
    const orgName = resourceProperties.OrgName;
    const userName = resourceProperties.UserName;
    const repoName = resourceProperties.RepoName;

    await manager({
      action:
        event.RequestType === "Create"
          ? ProvisionerAction.CREATE
          : event.RequestType === "Delete"
            ? ProvisionerAction.DELETE
            : ProvisionerAction.UPDATE,
      countMax,
      id,
      idleTimeout,
      labels,
      launchTemplateArn,
      launchTemplateVersion,
      roleArn,
      launchTimeout,
      orgName,
      userName,
      repoName,
    });
  } catch (e) {
    console.error(e);
    send(event, context, FAILED);
    return;
  }
  send(event, context, SUCCESS);
};
