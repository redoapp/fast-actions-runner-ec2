set -euo pipefail

deb_install() {
  curl -LSs -o /tmp/"$1" https://__ARTIFACT_S3_BUCKET__.s3.__ARTIFACT_AWS_REGION__.amazonaws.com/__ARTIFACT_S3_KEY_PREFIX__"$1"
  dpkg -i /tmp/"$1"
  rm /tmp/"$1"
}

deb_install aws-network.deb

apt-get install -f

metadata-secure root
