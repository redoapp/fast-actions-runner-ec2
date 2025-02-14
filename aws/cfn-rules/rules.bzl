load(":providers.bzl", "CfnMarkdownPart")

def _cfn_markdown_impl(ctx):
    actions = ctx.actions
    cf_doc = ctx.executable._cf_doc
    cf_doc_default = ctx.attr._cf_doc[DefaultInfo]
    name = ctx.attr.name
    parts = [target[CfnMarkdownPart] for target in ctx.attr.parts]
    title = ctx.attr.title

    output = actions.declare_file("%s.md" % name)
    args = actions.args()
    args.add(output)
    args.add(cf_doc)
    args.add("--name", title)
    for part in parts:
        args.add("--input")
        args.add(part.title)
        args.add(part.template)
    actions.run_shell(
        command = 'out="$1"; shift; "$@" > "$out"',
        inputs = [part.template for part in parts],
        outputs = [output],
        arguments = [args],
        tools = [cf_doc_default.files_to_run],
    )

    default_info = DefaultInfo(files = depset([output]))

    return [default_info]

cfn_markdown = rule(
    attrs = {
        "title": attr.string(mandatory = True),
        "parts": attr.label_list(providers = [CfnMarkdownPart]),
        "_cf_doc": attr.label(cfg = "exec", default = "//aws/cf-doc:bin", executable = True),
    },
    implementation = _cfn_markdown_impl,
)

def _cfn_markdown_part_impl(ctx):
    title = ctx.attr.title
    src = ctx.file.src

    cfn_markdown_part = CfnMarkdownPart(title = title, template = src)

    return [cfn_markdown_part]

cfn_markdown_part = rule(
    attrs = {
        "src": attr.label(allow_single_file = [".yaml"], mandatory = True),
        "title": attr.string(mandatory = True),
    },
    implementation = _cfn_markdown_part_impl,
    provides = [CfnMarkdownPart],
)

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
