#!/usr/bin/env bash
set -euo pipefail

deb_install() {
  curl -LSs -o /tmp/"$1" https://${ArtifactS3Bucket}.s3.${ArtifactRegion}.amazonaws.com/${ArtifactS3KeyPrefix}"$1"
  apt-get install -y /tmp/"$1"
  rm /tmp/"$1"
}

apt-get update

deb_install aws-network.deb

deb_install imds-client.deb

deb_install aws-execute-api.deb

deb_install fare-create.deb

deb_install actions-runner.deb

setup_base64="${SetupBase64}"

if [ ! -z "$setup_base64" ]; then
  <<< "$setup_base64" base64 -d > /tmp/setup
  chmod +x /tmp/setup
  /tmp/setup
  rm /tmp/setup
fi
