load("@rules_terraform//terraform:workspace.bzl", "tf_providers")
load(":providers.bzl", "PROVIDERS")

def tf_repositories():
    tf_providers("terraform", PROVIDERS)
