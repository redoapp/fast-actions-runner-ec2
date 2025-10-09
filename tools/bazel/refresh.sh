set -e

"$(rlocation redotech_fast_actions_runner_ec2/tools/bazel/bazelrc)"
"$(rlocation redotech_fast_actions_runner_ec2/tools/nodejs/roots)"
"$(rlocation redotech_fast_actions_runner_ec2/tools/test/jest_tests_bzl)"
"$(rlocation redotech_fast_actions_runner_ec2/tools/typescript/libs_bzl)"
