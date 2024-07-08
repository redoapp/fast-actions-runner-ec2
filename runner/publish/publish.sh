aws_region="$(aws configure get region)"

s3_upload() {
  aws s3 cp \
    --cache-control 'immutable, max-age=31536000' \
    --content-type "$1" \
    --only-show-errors \
    "$(rlocation "$2")" \
    s3://"$PUBLISH_S3_BUCKET"/"$PUBLISH_S3_KEY_PREFIX""$3"
  echo https://"$PUBLISH_S3_BUCKET".s3."$aws_region".amazonaws.com/"$PUBLISH_S3_KEY_PREFIX""$3"
}

s3_subst_upload() {
  sed \
    -e s:__ARTIFACT_AWS_REGION__:"$aws_region":g \
    -e s:__ARTIFACT_S3_BUCKET__:"$PUBLISH_S3_BUCKET":g \
    -e s:__ARTIFACT_S3_KEY_PREFIX__:"$PUBLISH_S3_KEY_PREFIX":g \
    "$(rlocation "$2")" \
    | aws s3 cp \
    --cache-control 'immutable, max-age=31536000' \
    --content-type "$1" \
    --only-show-errors \
    - \
    s3://"$PUBLISH_S3_BUCKET"/"$PUBLISH_S3_KEY_PREFIX""$3"
  echo https://"$PUBLISH_S3_BUCKET".s3."$aws_region".amazonaws.com/"$PUBLISH_S3_KEY_PREFIX""$3"
}

s3_upload application/x-zip redotech_fast_actions_ec2_runner/runner/provision/function.zip provision.zip
s3_upload application/x-zip redotech_fast_actions_ec2_runner/runner/webhook/function.zip webhook.zip
s3_upload application/vnd.debian.binary-package redotech_fast_actions_ec2_runner/aws/network/aws-network_1.0.0_all.deb aws-network.deb
s3_upload application/vnd.debian.binary-package redotech_fast_actions_ec2_runner/aws/cli-installer/awscli-installer_1.0.0_all.deb awscli-installer.deb
s3_upload application/vnd.debian.binary-package redotech_fast_actions_ec2_runner/runner/ec2/actions-runner-ec2_1.0.0_all.deb actions-runner-ec2.deb
s3_upload application/vnd.debian.binary-package redotech_fast_actions_ec2_runner/runner/service/actions-runner_1.0.0_all.deb actions-runner.deb
s3_subst_upload application/yaml redotech_fast_actions_ec2_runner/runner/basic-infra/lib/cloud-config.yaml cloud-config.yaml
s3_subst_upload application/yaml redotech_fast_actions_ec2_runner/runner/basic-infra/base_cf.yaml basic-base.template.yaml
s3_subst_upload application/yaml redotech_fast_actions_ec2_runner/runner/basic-infra/runner_cf.yaml basic-runner.template.yaml
s3_subst_upload application/yaml redotech_fast_actions_ec2_runner/runner/infra/base_cf.yaml base.template.yaml
s3_subst_upload application/yaml redotech_fast_actions_ec2_runner/runner/infra/runner_cf.yaml runner.template.yaml
