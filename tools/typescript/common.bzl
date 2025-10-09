load("@better_rules_javascript//commonjs:rules.bzl", "cjs_root")
load("@better_rules_javascript//javascript:rules.bzl", "js_library")
load("@better_rules_javascript//rollup:rules.bzl", "configure_rollup", "rollup_bundle")
load("@better_rules_javascript//typescript:rules.bzl", "ts_library")
load("//tools/jest:test.bzl", "jest_test")

def redo_ts_package(package_name, deps = [], compile_deps = [], prefix = True, target = None, rollup_deps = [], test_deps = [], test_size = None, test_timeout = None):
    assets = native.glob(["src/**/*.css"])
    if assets:
        prefix = False

        js_library(
            name = "assets",
            srcs = assets,
            root = ":root",
        )

    cjs_root(
        name = "root",
        package_name = package_name,
        descriptors = ["package.json"],
    )

    ts_library(
        name = "lib",
        srcs = native.glob(
            ["src/**/*.ts", "src/**/*.tsx"],
            ["src/**/*.spec.ts"],
        ),
        compile_deps = compile_deps,
        compiler = "//tools/typescript:tsc",
        config = "tsconfig.json",
        config_dep = ":tsconfig",
        declaration_prefix = "src" if not prefix else "lib",
        target = target,
        js_prefix = "src" if not prefix else "lib",
        root = ":root",
        strip_prefix = "src",
        deps = deps + (["//javascript/temporal-types:lib"] if not target else []) + ([":assets"] if assets else []),
    )

    js_library(
        name = "tsconfig",
        srcs = ["tsconfig.json"],
        root = ":root",
        deps = ["//tools/typescript:lib"],
    )

    if native.glob(["rollup.config.js"]):
        rollup_bundle(
            name = "bundle",
            dep = ":lib",
            rollup = ":rollup",
        )

        configure_rollup(
            name = "rollup",
            config = "rollup.config.js",
            config_dep = ":rollup_config",
            dep = "@better_rules_javascript_npm//rollup:lib",
        )

        js_library(
            name = "rollup_config",
            deps = rollup_deps,
            srcs = ["rollup.config.js"],
            root = ":root",
        )

    test_srcs = native.glob(["src/**/*.spec.ts"])
    if test_srcs:
        js_library(
            name = "jest_config",
            srcs = ["jest.config.js"],
            root = ":root",
        )

        ts_library(
            name = "test_lib",
            srcs = test_srcs,
            compiler = "//tools/typescript:tsc",
            config = "tsconfig.json",
            config_dep = ":tsconfig",
            declaration_prefix = "lib",
            target = target,
            js_prefix = "lib",
            module = "commonjs",
            root = ":root",
            strip_prefix = "src",
            deps = [
                ":lib",
                "@npm//@types/jest:lib",
                "@npm//@types/node:lib",
            ] + test_deps,
        )

        jest_test(
            name = "test",
            bash_preamble = "args+=(--no-cache)",  # workaround for old Bash
            size = test_size,
            timeout = test_timeout,
            config = "jest.config.js",
            config_dep = ":jest_config",
            dep = ":test_lib",
            jest = "@npm//jest:lib",
            tags = ["local", "unit"],
        )
