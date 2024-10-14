load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_archive")

def aws_repositories():
    http_archive(
        name = "awscurl_linux_amd64",
        url = "https://github.com/legal90/awscurl/releases/download/0.2.1/awscurl_0.2.1_linux_amd64.zip",
        sha256 = "189626b48d0d4df703e733a583c0d2471c754e0841d06790d41a2eaf2a2a468b",
        build_file = Label("curl.BUILD.bazel"),
    )
