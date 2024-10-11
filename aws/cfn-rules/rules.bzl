def _cfn_mermaid_impl(ctx):
    actions = ctx.actions
    cfn_dia = ctx.executable._cfn_dia
    cfn_dia_default = ctx.attr._cfn_dia[DefaultInfo]
    src = ctx.file.src
    name = ctx.attr.name

    output = actions.declare_file("%s.md" % name)
    args = actions.args()
    args.add("m")
    args.add("-s")
    args.add("-o", output)
    args.add("-t", src)
    actions.run(
        inputs = [src],
        outputs = [output],
        arguments = [args],
        executable = cfn_dia,
        tools = [cfn_dia_default.files_to_run],
    )

    default_info = DefaultInfo(files = depset([output]))

    return [default_info]

cfn_mermaid = rule(
    attrs = {
        "src": attr.label(allow_single_file = [".json", ".yaml", ".yml"], mandatory = True),
        "_cfn_dia": attr.label(cfg = "exec", default = "//tools/aws:cfn_dia", executable = True),
    },
    implementation = _cfn_mermaid_impl,
)
