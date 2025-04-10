#!/usr/bin/env bash
set -euo pipefail

id -u actions-runner 2>/dev/null || useradd -mU actions-runner

mkdir -p /opt/actions-runner
arch="$(uname -m)"
if [ "$arch" = x86_64 ]; then
    arch=x64
elif [ "$arch" = aarch64* ] || [ "$arch" = arm* ]; then
    arch=arm64
else
    echo "Unsupported architecture: $arch"
    exit 1
fi
version="$(curl -LSs https://github.com/actions/runner/tags/ | grep -Eo " v[0-9]+.[0-9]+.[0-9]+" | head -n1 | tr -d 'v ')"
curl -LSs https://github.com/actions/runner/releases/download/v"$version"/actions-runner-linux-"$arch"-"$version".tar.gz | tar xz -C /opt/actions-runner

chown -R actions-runner:actions-runner /opt/actions-runner
