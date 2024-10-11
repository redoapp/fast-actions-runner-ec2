from argparse import ArgumentParser
from pathlib import Path

parser = ArgumentParser(prog="digest")
parser.add_argument("--encoding", choices=("hex",))
parser.add_argument("src", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()

from hashlib import sha1

BUFFER_SIZE = 1024 * 4

hash_ = sha1()
with args.src.open("rb") as f:
    for chunk in iter(lambda: f.read(BUFFER_SIZE), b""):
        hash_.update(chunk)
if args.encoding == "hex":
    args.output.write_text(hash_.hexdigest(), "ascii")
else:
    args.output.write_bytes(hash_.digest())
