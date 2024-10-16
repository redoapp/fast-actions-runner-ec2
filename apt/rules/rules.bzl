load("@bazel_skylib//lib:paths.bzl", "paths")
load("@rules_file//util:path.bzl", "runfile_path")

def _apt_packages_index_impl(ctx):
    actions = ctx.actions
    name = ctx.attr.name
    srcs = ctx.files.srcs
    workspace = ctx.workspace_name

    dummy = actions.declare_file("%s.dummy" % name)
    actions.write(content = "", output = dummy)
    output_dir = paths.dirname(dummy.path)

    links = []
    for src in srcs:
        link = actions.declare_file("%s.packages/debs/%s" % (name, runfile_path(workspace, src)))
        links.append(link)
        actions.symlink(output = link, target_file = src)

    index = actions.declare_file("%s.txt" % name)
    args = actions.args()
    args.add("%s/%s.packages" % (output_dir, name))
    args.add(index)
    actions.run_shell(
        arguments = [args],
        command = '(cd "$1" && dpkg-scanpackages -m debs) > "$2"',
        inputs = links,
        outputs = [index],
        use_default_shell_env = True,
    )

    output = actions.declare_file("%s.gz" % name)

    args = actions.args()
    args.add(index)
    args.add(output)
    actions.run_shell(
        arguments = [args],
        command = 'gzip -c "$1" > "$2"',
        inputs = [index],
        outputs = [output],
        use_default_shell_env = True,
    )

    default_info = DefaultInfo(files = depset([output]))

    return [default_info]

apt_packages_index = rule(
    attrs = {
        "srcs": attr.label_list(allow_files = [".deb"]),
    },
    implementation = _apt_packages_index_impl,
)
