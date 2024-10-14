#!/usr/bin/env bash
set -euo pipefail

echo 'deb [trusted=yes] https://${ArtifactS3Bucket}.s3.${ArtifactRegion}.amazonaws.com/${ArtifactS3KeyPrefix}apt /' > /etc/apt/sources.list.d/fare.list

apt-get update

mkdir -p /etc/systemd/system-preset
echo 'disable actions-runner.service' > /etc/systemd/system-preset/10-fare.preset

apt-get install -y actions-runner aws-network imds-client awscurl fare-create

setup_base64="${SetupBase64}"

if [ ! -z "$setup_base64" ]; then
  <<< "$setup_base64" base64 -d > /tmp/setup
  chmod +x /tmp/setup
  /tmp/setup
  rm /tmp/setup
fi

systemctl enable --now actions-runner
