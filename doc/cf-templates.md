# CloudFormation Templates

## fare-app.template.yaml

### Parameters

| ID                  | Name                | Description | Default            |
| ------------------- | ------------------- | ----------- | ------------------ |
| ArtifactDomain      | ArtifactDomain      | String      | `"amazonaws.com"`  |
| ArtifactRegion      | ArtifactRegion      | String      | `"example-region"` |
| ArtifactS3Bucket    | ArtifactS3Bucket    | String      | `"example-bucket"` |
| ArtifactS3KeyPrefix | ArtifactS3KeyPrefix | String      | `""`               |
| OrgName             | OrgName             | String      | `""`               |

### Outputs

| ID                     | Description                              |
| ---------------------- | ---------------------------------------- |
| ProvisionerFunctionArn | ARN of provisioners function             |
| RoleArn                | Role ARN                                 |
| SetupUrlFunctionArn    | Lambda function ARN to provide setup URL |

## fare-provisioner.template.yaml

### Parameters

#### Base

| ID                     | Name                     | Description | Default |
| ---------------------- | ------------------------ | ----------- | ------- |
| ProvisionerFunctionArn | Provisioner function ARN | String      |         |

#### GitHub

| ID       | Name                | Description | Default |
| -------- | ------------------- | ----------- | ------- |
| OrgName  | GitHub organization | String      | `""`    |
| UserName | GitHub user         | String      | `""`    |
| RepoName | GitHub repository   | String      | `""`    |

#### Runner

| ID            | Name          | Description  | Default |
| ------------- | ------------- | ------------ | ------- |
| RunnerGroupId | Runner group  | Number       | `1`     |
| RunnerLabels  | Runner labels | List<String> |         |

#### EC2

| ID                    | Name                    | Description | Default |
| --------------------- | ----------------------- | ----------- | ------- |
| LaunchTemplateArn     | Launch template         | String      |         |
| LaunchTemplateVersion | Launch template version | String      |         |

#### Scaling

| ID             | Name            | Description | Default  |
| -------------- | --------------- | ----------- | -------- |
| RunnerCountMin | Minimum runners | Number      | `0`      |
| RunnerCountMax | Maximum runners | Number      | `-1`     |
| IdleTimeout    | Idle timeout    | String      | `"PT2M"` |

#### Other

| ID                | Name          | Description | Default   |
| ----------------- | ------------- | ----------- | --------- |
| Id                | Id            | String      |           |
| RoleArn           | RoleArn       | String      |           |
| LaunchTimeout     | LaunchTimeout | String      | `"PT10M"` |
| RunnerScaleFactor | Scale factor  | Number      | `1`       |
