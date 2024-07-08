load("@bazel_skylib//lib:shell.bzl", "shell")
load("@bazel_skylib//rules:common_settings.bzl", "BuildSettingInfo")
load("@rules_file//util:path.bzl", "runfile_path")

def _build_setting_file_impl(ctx):
    actions = ctx.actions
    content_build_info = ctx.attr.content[BuildSettingInfo]
    output = ctx.outputs.out

    actions.write(
        content = content_build_info.value,
        output = output,
    )

    default_info = DefaultInfo(files = depset([output]))

    return [default_info]

build_setting_file = rule(
    attrs = {
        "content": attr.label(providers = [BuildSettingInfo]),
        "out": attr.output(mandatory = True),
    },
    implementation = _build_setting_file_impl,
)

def _status_inner_impl(ctx):
    actions = ctx.actions
    key = ctx.attr.key
    info_file = ctx.info_file
    name = ctx.attr.name
    stamp = ctx.attr.stamp
    stamp_setting = ctx.attr.stamp_setting
    version_file = ctx.version_file

    output = actions.declare_file("%s.txt" % name)

    if stamp == 1 or stamp == -1 and stamp_setting:
        args = actions.args()
        args.add(key)
        args.add(info_file)
        args.add(version_file)
        args.add(output)
        actions.run_shell(
            arguments = [args],
            command = 'sed -n "s/^$1 //p" "$2" "$3" | tr -d "\\n" > "$4"',
            inputs = [ctx.info_file, ctx.version_file],
            outputs = [output],
        )
    else:
        actions.write(content = "", output = output)

    default_info = DefaultInfo(files = depset([output]))

    return [default_info]

_status_inner = rule(
    attrs = {
        "key": attr.string(mandatory = True),
        "stamp": attr.int(default = -1),
        "stamp_setting": attr.bool(mandatory = True),
    },
    implementation = _status_inner_impl,
)

def status(name, key, stamp = None):
    _status_inner(
        name = name,
        key = key,
        stamp = stamp,
        stamp_setting = select({
            Label(":stamp"): True,
            "//conditions:default": False,
        }),
    )

def _query_bzl_impl(ctx):
    actions = ctx.actions
    name = ctx.attr.name
    query = ctx.attr.query
    out = ctx.attr.out
    if out.startswith("/"):
        out = out[len("/"):]
    elif ctx.label.package:
        out = "%s/%s" % (ctx.label.package, out)
    runner = ctx.file._runner

    executable = actions.declare_file(name)
    actions.expand_template(
        is_executable = True,
        substitutions = {
            "%{query}": shell.quote(query),
            "%{output}": shell.quote(out),
        },
        output = executable,
        template = runner,
    )

    default_info = DefaultInfo(executable = executable)

    return [default_info]

query_bzl = rule(
    attrs = {
        "query": attr.string(mandatory = True),
        "out": attr.string(mandatory = True),
        "_runner": attr.label(
            allow_single_file = True,
            default = "query-targets.sh.tpl",
        ),
    },
    executable = True,
    implementation = _query_bzl_impl,
)
