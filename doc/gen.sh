cp "$(rlocation redotech_fast_actions_runner_ec2/doc/app.md)" "$BUILD_WORKSPACE_DIRECTORY"/doc/app.md
cp "$(rlocation redotech_fast_actions_runner_ec2/doc/basic_cluster.md)" "$BUILD_WORKSPACE_DIRECTORY"/doc/basic_cluster.md
cp "$(rlocation redotech_fast_actions_runner_ec2/doc/basic_provisioner.md)" "$BUILD_WORKSPACE_DIRECTORY"/doc/basic_provisioner.md
cp "$(rlocation redotech_fast_actions_runner_ec2/doc/provisioner.md)" "$BUILD_WORKSPACE_DIRECTORY"/doc/provisioner.md

chmod +w "$BUILD_WORKSPACE_DIRECTORY"/doc/*.md
sed -i '' 's/\(aws::iam::policy\)/aws::iam::policy/g' "$BUILD_WORKSPACE_DIRECTORY"/doc/*.md
