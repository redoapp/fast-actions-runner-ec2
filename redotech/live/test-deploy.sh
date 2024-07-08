version=test/"$(date +%s)"

PUBLISH_S3_BUCKET=redotech-fast-actions-ec2-runner-artifact \
  PUBLISH_S3_KEY_PREFIX="$version/" \
  "$(rlocation redotech_fast_actions_ec2_runner/runner/publish/publish)" "$version"

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
  --template-url https://redotech-fast-actions-ec2-runner-artifact.s3.us-east-1.amazonaws.com/"$version"/basic-base.template.yaml

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
  --template-url https://redotech-fast-actions-ec2-runner-artifact.s3.us-east-1.amazonaws.com/"$version"/basic-runner.template.yaml

aws cloudformation --output text wait stack-update-complete --stack-name TestActionsBase
aws cloudformation --output text wait stack-update-complete --stack-name TestActionsRunner
