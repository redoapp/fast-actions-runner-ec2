load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_archive")

def sigv4_repositories():
    http_archive(
        name = "sigv4_linux_x86_64",
        url = "https://github.com/softprops/sigv4/releases/download/v0.1.0/sigv4-Linux-x86_64.tar.gz",
        sha256 = "ea4aa6cee6b0d002b158c98ba7f0950188a5d3b0998bfdc3d9766e20d7e9a1b6",
        build_file = Label("sigv4.BUILD.bazel"),
    )
