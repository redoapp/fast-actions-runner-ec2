set -euo pipefail

[ ! -z "$1" ] || exit
echo "$1" | base64 -d > /tmp/setup
chmod +x /tmp/setup
/tmp/setup
rm /tmp/setup
