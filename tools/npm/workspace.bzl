load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_file")
load("@better_rules_javascript//commonjs:workspace.bzl", "cjs_directory_npm_plugin")
load("@better_rules_javascript//npm:workspace.bzl", "npm")
load("@better_rules_javascript//typescript:workspace.bzl", "ts_directory_npm_plugin")
load(":npm.bzl", "PACKAGES", "ROOTS")

def _strip_bundled_impl(ctx):
    dep = ctx.attr.dep
    strip_bundled = ctx.attr._strip_bundled

    ctx.file(
        "file/BUILD.bazel",
        content = """
exports_files(
    srcs = ["package.tgz"],
    visibility = ["//visibility:public"]
)
""".strip(),
    )

    strip_result = ctx.execute(
        [ctx.path(strip_bundled), ctx.path(dep), "file/package.tgz"],
    )
    if strip_result.return_code:
        fail("Failed:\n%s" % strip_result.stderr)

_strip_bundled = repository_rule(
    implementation = _strip_bundled_impl,
    attrs = {"dep": attr.label(mandatory = True), "_strip_bundled": attr.label(default = "strip-bundled")},
)

def npm_repositories():
    plugins = [
        cjs_directory_npm_plugin(),
        ts_directory_npm_plugin(),
    ]
    npm("npm", roots = ROOTS, packages = PACKAGES, plugins = plugins)

    http_file(
        name = "npm_aws-cdk-lib_2.147.0.package0",
        downloaded_file_path = "package.tgz",
        integrity = "sha512-0dzUEeWxpuLeeQvqwR4Vz2ja/V0nzzgndgPdp56nc9CsghbrFtMATtno3ec5INHiJz/Mj6/NXQ5t9vrffd6Mgw==",
        url = "https://registry.npmjs.org/aws-cdk-lib/-/aws-cdk-lib-2.147.0.tgz",
    )

    _strip_bundled(
        name = "npm_aws-cdk-lib_2.147.0-44f25193.package",
        dep = "@npm_aws-cdk-lib_2.147.0.package0//file:package.tgz",
    )
