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
            "files/**/*.cjs",
            "files/**/*.mjs",
            "files/**/*.jsx",
            "files/**/*.ts",
            "files/**/*.cts",
            "files/**/*.mts",
            "files/**/*.tsx",
        ],
        exclude = [
            # Auto-generated files
            "**/*.graphql.d.ts",
            "**/*.graphql.ts",
        ],
    ),
)

filegroup(
    name = "tslint_files",
    srcs = glob(
        [
            "files/**/*.js",
            "files/**/*.cjs",
            "files/**/*.mjs",
            "files/**/*.jsx",
            "files/**/*.ts",
            "files/**/*.cts",
            "files/**/*.mts",
            "files/**/*.tsx",
        ],
        exclude = [
            # Auto-generated files
            "**/*.graphql.d.ts",
            "**/*.graphql.ts",
            # Projects that don't have a tsconfig.json
            "files/javascript/temporal-types/**",
            "files/netsuite/suitescript-types/**",
            "files/nodejs/http-server-types/**",
            "files/redo/manage/**",
            "files/tools/nodejs/**",
            "files/web/server-rules/**",
        ],
    ),
)

filegroup(
    name = "prettier_files",
    srcs = glob(
        [
            "files/**/*.js",
            "files/**/*.cjs",
            "files/**/*.mjs",
            "files/**/*.jsx",
            "files/**/*.ts",
            "files/**/*.cts",
            "files/**/*.mts",
            "files/**/*.tsx",
            "files/**/*.css",
            "files/**/*.html",
            "files/**/*.json",
            "files/**/*.md",
            "files/**/*.scss",
            "files/**/*.svg",
            "files/**/*.xml",
            "files/**/*.yml",
        ],
        exclude = [
            # Auto-generated files
            "**/*.graphql.d.ts",
            "**/*.graphql.ts",
            "**/*.graphql.json",
        ],
    ),
)
