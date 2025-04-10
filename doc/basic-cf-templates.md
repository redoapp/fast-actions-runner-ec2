# Basic CloudFormation Templates

## fare-basic-cluster.template.yaml

### Parameters

| ID         | Name       | Description | Default   |
| ---------- | ---------- | ----------- | --------- |
| AppRoleArn | AppRoleArn | String      |           |
| SshEnabled | SshEnabled | String      | `"false"` |

### Outputs

| ID                  | Description           |
| ------------------- | --------------------- |
| InstanceProfileName | Instance profile name |
| InstanceRoleArn     | Instance role arn     |
| RoleArn             | ARN of control role   |
| SecurityGroupId     | Security group ID     |
| SubnetId            | Subnet ID             |

## fare-basic-provisioner.template.yaml

### Parameters

#### Artifacts

| ID                  | Name                   | Description | Default            |
| ------------------- | ---------------------- | ----------- | ------------------ |
| ArtifactDomain      | Artifact Domain        | String      | `"amazonaws.com"`  |
| ArtifactRegion      | Artifact URL           | String      | `"example-region"` |
| ArtifactS3Bucket    | Artifact S3 Bucket     | String      | `"example-bucket"` |
| ArtifactS3KeyPrefix | Artifact S3 Key Prefix | String      | `""`               |

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

#### Scaling

| ID             | Name            | Description | Default  |
| -------------- | --------------- | ----------- | -------- |
| RunnerCountMin | Minimum runners | Number      | `0`      |
| RunnerCountMax | Maximum runners | Number      | `-1`     |
| IdleTimeout    | Idle timeout    | String      | `"PT2M"` |

#### Other

| ID                     | Name                   | Description         | Default      |
| ---------------------- | ---------------------- | ------------------- | ------------ |
| Ami                    | Ami                    | AWS::EC2::Image::Id |              |
| Id                     | Id                     | String              |              |
| LaunchTimeout          | LaunchTimeout          | String              | `"PT10M"`    |
| RunnerScaleFactor      | Scale factor           | Number              | `1`          |
| RoleArn                | RoleArn                | String              | `""`         |
| ProvisionerFunctionArn | ProvisionerFunctionArn | String              |              |
| InstanceType           | InstanceType           | String              | `"m5.large"` |
| KeyPair                | KeyPair                | String              | `""`         |
| InstanceProfileName    | InstanceProfileName    | String              |              |
| SecurityGroupId        | SecurityGroupId        | String              |              |
| SetupScriptB64         | SetupScriptB64         | String              | `""`         |
| SubnetId               | SubnetId               | String              |              |
| VolumeSizeGib          | VolumeSizeGib          | Number              | `64`         |
| VolumeType             | VolumeType             | String              | `"gp3"`      |
