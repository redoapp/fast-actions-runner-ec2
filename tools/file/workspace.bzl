load("@rules_file//file:workspace.bzl", "files")

def file_repositories():
    files(
        name = "files",
        build = "//tools/file:files.bzl",
        ignores = [
            ".bazel-npm-cache.json",
            ".git",
            ".yarn",
            "data",
            "node_modules",
        ],
        root_file = "//:WORKSPACE.bazel",
    )
