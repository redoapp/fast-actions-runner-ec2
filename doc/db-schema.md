# Database Schema

## Tables

### instance

| Attribute     | Type                              | Required | Description            |
| ------------- | --------------------------------- | -------- | ---------------------- |
| Id            | String                            | Yes      | ID of the EC2 instance |
| ProvisionerId | String                            | Yes      | ID of the provisioner  |
| Runner        | [Runner](#runner)                 | No       | Runner                 |
| Status        | [InstanceStatus](#instancestatus) | Yes      | Status                 |

### job

| Attribute      | Type   | Required | Description               |
| -------------- | ------ | -------- | ------------------------- |
| Id             | String | Yes      | ID of GitHub job          |
| InstallationId | String | Yes      | ID of GitHub installation |

### provisioner

| Attribute             | Type        | Required | Description                                                                         |
| --------------------- | ----------- | -------- | ----------------------------------------------------------------------------------- |
| CountMax              | Number      | Yes      | Maximum number of instances to start                                                |
| CountMin              | Number      | Yes      | Minimum number of instances to start                                                |
| IdleTimeout           | Number      | Yes      | Timeout for an instance being idle, after which the instance is stopped             |
| Labels                | Set<String> | Yes      | Set of labels that match GitHub job labels                                          |
| LaunchTemplateArn     | String      | Yes      | ARN of the launch template                                                          |
| LaunchTemplateVersion | String      | Yes      | Version of the launch template                                                      |
| LaunchTimeout         | Number      | Yes      | Timeout for a instance to begin accepting jobs, after which the instance is stopped |
| OrgName               | String      | No       | GitHub organization name                                                            |
| RepoName              | String      | No       | GitHub repository name                                                              |
| RoleArn               | String      | Yes      | ARN of the IAM role to control instances                                            |
| RunnerGroupId         | Number      | Yes      | ID of the GitHub runner group                                                       |
| ScaleFactor           | Number      | Yes      | Target proportion of instances to jobs                                              |
| UserName              | String      | No       | GitHub username                                                                     |

## Types

## InstanceStatus

| Type       | Description |
| ---------- | ----------- |
| "disabled" | Disabled    |
| "enabled"  | Enabled     |

## Runner

| Attribute                     | Type   | Required | Description                                         |
| ----------------------------- | ------ | -------- | --------------------------------------------------- |
| ActiveAt                      | Number | Yes      | Time (epoch seconds) started, or a job was accepted |
| Id                            | String | Yes      | ID of the GitHub runner                             |
| [RunnerStatus](#runnerstatus) | String | Yes      | Status                                              |

## RunnerStatus

| Type     | Description |
| -------- | ----------- |
| "active" | Active      |
| "idle"   | Idle        |
