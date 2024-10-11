export PUBLISH_S3_BUCKET=redotech-fast-actions-runner-ec2-artifact
export PUBLISH_S3_KEY_PREFIX="$1/"

exec "$(rlocation redotech_fast_actions_runner_ec2/fare/publish/publish)"
