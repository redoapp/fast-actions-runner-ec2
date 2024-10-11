def _digest_impl(ctx):
    actions = ctx.actions
    digest = ctx.executable._digest
    digest_default = ctx.attr._digest[DefaultInfo]
    encoding = ctx.attr.encoding
    name = ctx.attr.name
    src = ctx.file.src

    output = actions.declare_file("%s.txt" % name if encoding else "%s.digest" % name)
    args = actions.args()
    if encoding:
        args.add("--encoding", encoding)
    args.add(src)
    args.add(output)
    actions.run(
        arguments = [args],
        executable = digest,
        inputs = [src],
        outputs = [output],
        tools = [digest_default.files_to_run],
    )

    default_info = DefaultInfo(files = depset([output]))

    return [default_info]

digest = rule(
    attrs = {
        "src": attr.label(allow_single_file = True),
        "encoding": attr.string(values = ["", "hex"]),
        "_digest": attr.label(
            cfg = "exec",
            default = "//file/digest:bin",
            executable = True,
        ),
    },
    implementation = _digest_impl,
)
