def _aws_artifact_transition_impl(settings, attrs):
    return {
        "//aws/artifact:region": attrs.region or settings["//aws/artifact:region"],
        "//aws/artifact:s3_bucket": attrs.s3_bucket or settings["//aws/artifact:s3_bucket"],
        "//aws/artifact:s3_key_prefix": attrs.s3_key_prefix or settings["//aws/artifact:s3_key_prefix"],
    }

_aws_artifact_transition = transition(
    implementation = _aws_artifact_transition_impl,
    inputs = ["//aws/artifact:region", "//aws/artifact:s3_bucket", "//aws/artifact:s3_key_prefix"],
    outputs = ["//aws/artifact:region", "//aws/artifact:s3_bucket", "//aws/artifact:s3_key_prefix"],
)

def _aws_artifact_impl(ctx):
    srcs = ctx.files.srcs

    default_info = DefaultInfo(files = depset(srcs))

    return [default_info]

aws_artifact = rule(
    attrs = {
        "region": attr.string(),
        "s3_bucket": attr.string(),
        "s3_key_prefix": attr.string(),
        "srcs": attr.label_list(allow_files = True),
    },
    cfg = _aws_artifact_transition,
    implementation = _aws_artifact_impl,
)
