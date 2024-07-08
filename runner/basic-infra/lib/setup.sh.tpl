set -euo pipefail

deb_install() {
  curl -LSs -o /tmp/"$1" ${ArtifactUrl}"$1"
  apt-get install -y /tmp/"$1"
  rm /tmp/"$1"
}

apt-get update

deb_install aws-network.deb

deb_install actions-runner-ec2.deb
deb_install actions-runner.deb

SetupBase64=
setup_base64="${SetupBase64}"

if [ ! -z "$setup_base64" ]; then
  <<< "$setup_base64" base64 -d > /tmp/setup
  chmod +x /tmp/setup
  /tmp/setup
  rm /tmp/setup
fi
