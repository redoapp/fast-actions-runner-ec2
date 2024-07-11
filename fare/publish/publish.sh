region="$(< $(rlocation redotech_fast_actions_runner_ec2/aws/artifact/region.txt))"
s3_bucket="$(< $(rlocation redotech_fast_actions_runner_ec2/aws/artifact/s3-bucket.txt))"
s3_key_prefix="$(< $(rlocation redotech_fast_actions_runner_ec2/aws/artifact/s3-key-prefix.txt))"

s3_upload() {
  src="$1"
  shift
  dest="$1"
  shift
  aws \
    --region "$region" \
    s3 cp \
    --cache-control 'immutable, max-age=31536000' \
    --only-show-errors \
    "$@" \
    "$(rlocation "$src")" \
    s3://"$s3_bucket"/"$s3_key_prefix""$dest"
  echo https://"$s3_bucket".s3."$region".amazonaws.com/"$s3_key_prefix""$dest"
}

s3_upload redotech_fast_actions_runner_ec2/actions/runner/actions-runner.deb actions-runner.deb --content-type application/vnd.debian.binary-package
s3_upload redotech_fast_actions_runner_ec2/aws/cf-resource/function.zip cf-resource.zip --content-type application/x-zip
s3_upload redotech_fast_actions_runner_ec2/aws/cli-installer/awscli-installer.deb awscli-installer.deb --content-type application/vnd.debian.binary-package
s3_upload redotech_fast_actions_runner_ec2/aws/imds-client/imds-client.deb imds-client.deb --content-type application/vnd.debian.binary-package
s3_upload redotech_fast_actions_runner_ec2/aws/network/aws-network.deb aws-network.deb --content-type application/vnd.debian.binary-package
s3_upload redotech_fast_actions_runner_ec2/fare/app/function.zip fare-app.zip --content-type application/x-zip
s3_upload redotech_fast_actions_runner_ec2/fare/basic-infra/cluster_cf.yaml fare-basic-cluster.template.yaml --content-type application/yaml
s3_upload redotech_fast_actions_runner_ec2/fare/basic-infra/provisioner_cf.yaml fare-basic-provisioner.template.yaml --content-type application/yaml
s3_upload redotech_fast_actions_runner_ec2/fare/cf-resource/function.zip fare-cf-resource.zip --content-type application/x-zip
s3_upload redotech_fast_actions_runner_ec2/fare/create/fare-create.deb fare-create.deb --content-type application/vnd.debian.binary-package
s3_upload redotech_fast_actions_runner_ec2/fare/infra/app_cf.yaml fare-app.template.yaml --content-type application/yaml
s3_upload redotech_fast_actions_runner_ec2/fare/infra/provisioner_cf.yaml fare-provisioner.template.yaml --content-type application/yaml
s3_upload redotech_fast_actions_runner_ec2/fare/provision/function.zip fare-provision.zip --content-type application/x-zip
