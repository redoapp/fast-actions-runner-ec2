#!/usr/bin/env bash
set -euo pipefail

. /etc/os-release

# Disable auto-update

systemctl mask apt-daily apt-daily-upgrade unattended-upgrades
systemctl stop apt-daily apt-daily-upgrade unattended-upgrades

# Configure

curl -fsSL https://packages.fluentbit.io/fluentbit.key | gpg --dearmor > /etc/apt/keyrings/fluentbit.gpg
echo "deb [signed-by=/etc/apt/keyrings/fluentbit.gpg] https://packages.fluentbit.io/ubuntu/$VERSION_CODENAME $VERSION_CODENAME main" > /etc/apt/sources.list.d/fluent-bit.list

echo 'deb [trusted=yes] https://${ArtifactS3Bucket}.s3.${ArtifactRegion}.${ArtifactDomain}/${ArtifactS3KeyPrefix}apt /' > /etc/apt/sources.list.d/fare.list

apt-get update

mkdir -p /etc/systemd/system-preset
echo 'disable actions-runner.service' > /etc/systemd/system-preset/10-fare.preset

mkdir -p /etc/systemd/system/metadata-secure.service.d/
echo 'Environment=METADATA_USERS=cwagent root' > /etc/systemd/system/metadata-secure.service.d/10-fare.conf

fluent_bit=${FluentBit}
mkdir -p /etc/fluent-bit
<<< "$fluent_bit" base64 -d > /etc/fluent-bit/fluent-bit.conf

# Install

curl -o /tmp/amazon-cloudwatch-agent.deb https://amazoncloudwatch-agent-${AwsRegion}.s3.${AwsRegion}.${AwsDomain}/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb

apt-get install -o Dpkg::Options::=--force-confold -y fare-basic /tmp/amazon-cloudwatch-agent.deb

rm /tmp/amazon-cloudwatch-agent.deb

cloudwatch_agent=${CloudwatchAgent}
<<< "$cloudwatch_agent" base64 -d > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json

systemctl preset --now amazon-cloudwatch-agent

# Custom setup

setup_base64=${SetupBase64}
if [ ! -z "$setup_base64" ]; then
  <<< "$setup_base64" base64 -d > /tmp/setup
  chmod +x /tmp/setup
  /tmp/setup
  rm /tmp/setup
fi

# Enable services

systemctl unmask apt-daily apt-daily-upgrade unattended-upgrades
systemctl start unattended-upgrades

systemctl enable --now actions-runner
