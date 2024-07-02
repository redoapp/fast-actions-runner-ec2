load("@bazel_skylib//lib:shell.bzl", "shell")
load("@rules_file//util:path.bzl", "runfile_path")

def _sh_binary_impl(ctx):
    actions = ctx.actions
    bash_runfiles_default = ctx.attr._bash_runfiles[DefaultInfo]
    data = ctx.files.data
    data_default = [target[DefaultInfo] for target in ctx.attr.data]
    main = ctx.file.main
    name = ctx.attr.name
    template = ctx.file._template
    workspace = ctx.workspace_name

    executable = actions.declare_file(name)
    actions.expand_template(
        is_executable = True,
        substitutions = {
            "%{main}": shell.quote(runfile_path(workspace, main)),
        },
        template = template,
        output = executable,
    )

    runfiles = ctx.runfiles(files = [main] + data)
    runfiles = runfiles.merge(bash_runfiles_default.default_runfiles)
    runfiles = runfiles.merge_all([default_info.default_runfiles for default_info in data_default])
    default_info = DefaultInfo(executable = executable, runfiles = runfiles)

    return [default_info]

sh_binary = rule(
    attrs = {
        "data": attr.label_list(allow_files = True),
        "main": attr.label(allow_single_file = True, mandatory = True),
        "_bash_runfiles": attr.label(
            default = "@bazel_tools//tools/bash/runfiles",
        ),
        "_template": attr.label(allow_single_file = True, default = ":runner.sh.tpl"),
    },
    executable = True,
    implementation = _sh_binary_impl,
)
