load("@better_rules_javascript//nodejs:rules.bzl", "nodejs_binary_package")
load("@bazel_skylib//lib:shell.bzl", "shell")
load("@rules_file//util:path.bzl", "runfile_path")
load("@rules_pkg//pkg:zip.bzl", "pkg_zip")

def _lambda_nodejs_transition_impl(settings, attrs):
    return {
        "//command_line_option:compilation_mode": "opt",
        "//command_line_option:platforms": "//tools/platform:lambda",
    }

# Could exclude AWS libraries with @better_rules_javascript//javascript:system_lib
# But the versioning lags many months behind.
_lambda_nodejs_transition = transition(
    implementation = _lambda_nodejs_transition_impl,
    inputs = [],
    outputs = ["//command_line_option:compilation_mode", "//command_line_option:platforms"],
)

def _lambda_nodejs_function_env_impl(ctx):
    actions = ctx.actions
    name = ctx.attr.name
    src = ctx.file.src

    output = actions.declare_file("%s.zip" % name)
    actions.symlink(output = output, target_file = src)

    default_info = DefaultInfo(files = depset([output]))

    return [default_info]

_lambda_nodejs_function_env = rule(
    attrs = {
        "src": attr.label(allow_single_file = [".zip"], mandatory = True),
        "_allowlist_function_transition": attr.label(
            default = "@bazel_tools//tools/allowlists/function_transition_allowlist",
        ),
    },
    cfg = _lambda_nodejs_transition,
    implementation = _lambda_nodejs_function_env_impl,
)

def lambda_nodejs_function(name, dep, **kwargs):
    nodejs_binary_package(
        name = "%s.pkg" % name,
        dep = dep,
        main = "_",
        node = "@better_rules_javascript//nodejs/default:system_nodejs",
        **kwargs
    )

    pkg_zip(
        name = "%s.pkg.zip" % name,
        srcs = [":%s.pkg" % name],
        **kwargs
    )

    _lambda_nodejs_function_env(
        name = name,
        src = "%s.pkg.zip" % name,
        **kwargs
    )
