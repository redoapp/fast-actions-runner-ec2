export PUBLISH_S3_BUCKET=redotech-fast-actions-ec2-runner-artifact
export PUBLISH_S3_KEY_PREFIX="$1/"

exec "$(rlocation redotech_fast_actions_ec2_runner/runner/publish/publish)"
