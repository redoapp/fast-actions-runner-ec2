#!/usr/bin/env bash

# --- begin runfiles.bash initialization v2 ---
# Copy-pasted from the Bazel Bash runfiles library v2.
set -uo pipefail; f=bazel_tools/tools/bash/runfiles/runfiles.bash
source "${RUNFILES_DIR:-/dev/null}/$f" 2>/dev/null || \
  source "$(grep -sm1 "^$f " "${RUNFILES_MANIFEST_FILE:-/dev/null}" | cut -f2- -d' ')" 2>/dev/null || \
  source "$0.runfiles/$f" 2>/dev/null || \
  source "$(grep -sm1 "^$f " "$0.runfiles_manifest" | cut -f2- -d' ')" 2>/dev/null || \
  source "$(grep -sm1 "^$f " "$0.exe.runfiles_manifest" | cut -f2- -d' ')" 2>/dev/null || \
  { echo>&2 "ERROR: cannot find $f"; exit 1; }; f=; set -e
# --- end runfiles.bash initialization v2 ---

function abspath () {
  if [[ "$1" == /* ]]; then
    echo "$1"
  else
    echo "$PWD"/"$1"
  fi
}

bin="$(abspath "$(rlocation %{bin})")"
cdk="$(abspath "$(rlocation %{cdk})")"
config="$(rlocation %{config})"

[ -z "${RUNFILES_DIR-}" ] || RUNFILES_DIR="$(abspath "$RUNFILES_DIR")"
[ -z "${RUNFILES_MANIFEST_FILE-}" ] || RUNFILES_MANIFEST_FILE="$(abspath "$RUNFILES_MANIFEST_FILE")"

cd "$(dirname "$config")"

exec "$cdk" "$@" -a "$bin" --lookups false
