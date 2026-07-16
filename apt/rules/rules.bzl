def _apt_packages_index_impl(ctx):
    actions = ctx.actions
    script = ctx.file._script
    srcs = ctx.files.srcs
    workspace_name = ctx.workspace_name

    output = actions.declare_file("%s.gz" % ctx.attr.name)
    args = actions.args()
    args.add(script)
    args.add(output)
    for src in srcs:
        args.add("%s=debs/%s/%s" % (src.path, workspace_name, src.short_path))
    actions.run_shell(
        arguments = [args],
        command = 'python3 "$@"',
        inputs = srcs + [script],
        mnemonic = "AptPackagesIndex",
        outputs = [output],
        progress_message = "Generating apt Packages index %{output}",
    )

    return [DefaultInfo(files = depset([output]))]

apt_packages_index = rule(
    attrs = {
        "srcs": attr.label_list(allow_files = [".deb"]),
        "_script": attr.label(
            allow_single_file = True,
            default = "//apt/rules:packages_index.py",
        ),
    },
    implementation = _apt_packages_index_impl,
)
