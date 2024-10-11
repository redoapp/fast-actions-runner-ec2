def _path_executable_impl(ctx):
    executable = ctx.attr.executable
    fallback = ctx.attr.fallback

    path = ctx.which(executable)
    if not path:
        if not fallback:
            fail("Executable %s is not in the path" % executable)
        ctx.template(
            "BUILD.bazel",
            Label(":path_executable_alias.bazel.tpl"),
            substitutions = {"%{target}": json.encode(str(fallback))},
        )
        return

    ctx.symlink(path, "executable.sh")
    ctx.template("BUILD.bazel", Label(":path_executable.bazel"))

path_executable = repository_rule(
    attrs = {
        "executable": attr.string(mandatory = True),
        "fallback": attr.label(),
    },
    implementation = _path_executable_impl,
    local = True,
)
