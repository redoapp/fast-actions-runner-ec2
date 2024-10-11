```mermaid
	flowchart TB;
		subgraph &nbsp;
		rootInstanceInstanceProfile[InstanceInstanceProfile<br/>IAM::InstanceProfile]-->rootInstanceInstanceRole[InstanceInstanceRole<br/>IAM::Role]
		rootInstanceLaunchTemplate[InstanceLaunchTemplate<br/>EC2::LaunchTemplate]-->rootInstanceInstanceProfile[InstanceInstanceProfile<br/>IAM::InstanceProfile]
		rootInstanceRolePolicy[InstanceRolePolicy<br/>IAM::RolePolicy]-->rootInstanceRole[InstanceRole<br/>IAM::Role]
		rootInstanceRolePolicy[InstanceRolePolicy<br/>IAM::RolePolicy]-->rootInstanceInstanceRole[InstanceInstanceRole<br/>IAM::Role]
		rootProvisionerResourceDefault[ProvisionerResourceDefault<br/>CloudFormation::CustomResource]-->rootInstanceLaunchTemplate[InstanceLaunchTemplate<br/>EC2::LaunchTemplate]
		rootProvisionerResourceDefault[ProvisionerResourceDefault<br/>CloudFormation::CustomResource]-->rootInstanceRole[InstanceRole<br/>IAM::Role]

  	end

```
