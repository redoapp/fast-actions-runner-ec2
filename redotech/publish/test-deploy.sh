"$(rlocation redotech_fast_actions_runner_ec2/fare/publish/publish)" "$version"

base_url=https://"$(< $(rlocation redotech_fast_actions_runner_ec2/aws/artifact/s3-bucket.txt))".s3."$(< $(rlocation redotech_fast_actions_runner_ec2/aws/artifact/region.txt))".amazonaws.com/"$(< $(rlocation redotech_fast_actions_runner_ec2/aws/artifact/s3-key-prefix.txt))"

aws cloudformation \
  --output text \
  update-stack \
  --capabilities CAPABILITY_IAM \
  --disable-rollback \
  --parameters \
    ParameterKey=GithubOrg,ParameterValue=redoapp \
    ParameterKey=GithubToken,ParameterValue=arn:aws:ssm:us-east-1:260890374087:parameter/TestActionsRunner/Github/Token \
    ParameterKey=GithubWebhookSecret,ParameterValue=arn:aws:ssm:us-east-1:260890374087:parameter/TestActionsRunner/Github/WebhookSecret \
  --stack-name TestActionsBase \
  --template-url "$base_url"fare-basic-cluster.template.yaml

aws cloudformation \
  --output text \
  update-stack \
  --capabilities CAPABILITY_IAM \
  --disable-rollback \
  --parameters \
    ParameterKey=Ami,ParameterValue=ami-04b70fa74e45c3917 \
    ParameterKey=BaseStackName,ParameterValue=TestActions \
    ParameterKey=KeyPair,ParameterValue=Redo \
    ParameterKey=RunnerCountMax,ParameterValue=15 \
    ParameterKey=RunnerGroup,ParameterValue=Test \
    ParameterKey=RunnerLabels,ParameterValue=self-hosted \
  --stack-name TestActionsRunner \
  --template-url "$base_url"/fare-basic-provisioner.template.yaml

aws cloudformation --output text wait stack-update-complete --stack-name TestActionsCluster
aws cloudformation --output text wait stack-update-complete --stack-name TestActionsProvisioner
