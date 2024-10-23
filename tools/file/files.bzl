package(default_visibility = ["//visibility:public"])

filegroup(
    name = "bazel_files",
    srcs = glob(["files/**/*.bazel", "files/**/*.bzl"]),
)

filegroup(
    name = "black_files",
    srcs = glob(["files/**/*.py"]),
)

filegroup(
    name = "eslint_files",
    srcs = glob(
        [
            "files/**/*.js",
            "files/**/*.ts",
            "files/**/*.tsx",
        ],
    ),
)

filegroup(
    name = "prettier_files",
    srcs = glob(
        [
            "files/**/*.js",
            "files/**/*.ts",
            "files/**/*.md",
            "files/**/*.tsx",
            "files/**/*.json",
            "files/**/*.json.tpl",
            "files/**/*.md",
            "files/**/*.yaml",
            "files/**/.*.yaml",
        ],
    ),
)
