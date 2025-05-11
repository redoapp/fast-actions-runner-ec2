load("@r_tools//bazel/rules:workspace.bzl", "path_executable")

def aws_cfn_repositories():
    path_executable(
        name = "awsdac",
        executable = "awsdac",
    )
