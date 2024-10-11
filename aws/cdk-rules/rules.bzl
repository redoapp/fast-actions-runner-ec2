load("@bazel_skylib//lib:shell.bzl", "shell")
load("@rules_file//util:path.bzl", "runfile_path")

def _cdk_synth_impl(ctx):
    actions = ctx.actions
    project = ctx.executable.project
    project_default = ctx.attr.project[DefaultInfo]
    name = ctx.attr.name
    stack = ctx.attr.stack
    synth = ctx.executable._synth
    synth_default = ctx.attr._synth[DefaultInfo]

    output = actions.declare_file("%s.yaml" % name)
    args = actions.args()
    args.add(project)
    args.add(stack)
    args.add(output)
    actions.run(
        arguments = [args],
        executable = synth,
        outputs = [output],
        tools = [project_default.files_to_run, synth_default.files_to_run],
    )

    default_info = DefaultInfo(files = depset([output]))

    return [default_info]

cdk_synth = rule(
    attrs = {
        "project": attr.label(cfg = "exec", executable = True, mandatory = True),
        "stack": attr.string(mandatory = True),
        "_synth": attr.label(cfg = "exec", default = ":synth", executable = True),
    },
    implementation = _cdk_synth_impl,
)

def _cdk_project_impl(ctx):
    actions = ctx.actions
    bash_runfiles_default = ctx.attr._bash_runfiles[DefaultInfo]
    bin = ctx.executable.bin
    bin_default = ctx.attr.bin[DefaultInfo]
    cdk = ctx.executable.cdk
    cdk_default = ctx.attr.cdk[DefaultInfo]
    config = ctx.file.config
    name = ctx.attr.name
    runner = ctx.file._runner
    workspace = ctx.workspace_name

    executable = actions.declare_file(name)
    actions.expand_template(
        is_executable = True,
        output = executable,
        substitutions = {
            "%{bin}": shell.quote(runfile_path(workspace, bin)),
            "%{cdk}": shell.quote(runfile_path(workspace, cdk)),
            "%{config}": shell.quote(runfile_path(workspace, config)),
        },
        template = runner,
    )

    runfiles = ctx.runfiles(files = [config])
    runfiles = runfiles.merge(bash_runfiles_default.default_runfiles)
    runfiles = runfiles.merge(bin_default.default_runfiles)
    runfiles = runfiles.merge(cdk_default.default_runfiles)

    default_info = DefaultInfo(executable = executable, runfiles = runfiles)

    return [default_info]

cdk_project = rule(
    attrs = {
        "bin": attr.label(cfg = "target", executable = True, mandatory = True),
        "cdk": attr.label(cfg = "target", executable = True, mandatory = True),
        "config": attr.label(allow_single_file = ["cdk.json"], mandatory = True),
        "_bash_runfiles": attr.label(
            default = "@bazel_tools//tools/bash/runfiles",
        ),
        "_runner": attr.label(allow_single_file = True, default = ":project-runner.sh.tpl"),
    },
    executable = True,
    implementation = _cdk_project_impl,
)
