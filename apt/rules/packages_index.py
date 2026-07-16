"""Generate a flat apt repository Packages.gz index from .deb files.

Replacement for @rules_debian_extra//apt/rules:apt_packages_index (the
upstream repository no longer exists). Output matches dpkg-scanpackages:
one stanza per package with Filename/Size/checksum fields inserted,
gzipped deterministically.

Usage: packages_index.py <output.gz> <deb_path>=<repo_filename>...
"""

import gzip
import hashlib
import io
import lzma
import sys
import tarfile

# dpkg canonical field order (subset used by pkg_deb control files).
LEAD_FIELDS = [
    "Package",
    "Source",
    "Version",
    "Essential",
    "Multi-Arch",
    "Architecture",
    "Maintainer",
    "Installed-Size",
    "Provides",
    "Pre-Depends",
    "Depends",
    "Recommends",
    "Suggests",
    "Enhances",
    "Conflicts",
    "Breaks",
    "Replaces",
]
TAIL_FIELDS = ["Section", "Priority", "Homepage", "Description"]


def ar_members(data):
    if data[:8] != b"!<arch>\n":
        raise ValueError("not an ar archive")
    offset = 8
    while offset < len(data):
        header = data[offset : offset + 60]
        if len(header) < 60:
            break
        name = header[0:16].decode("ascii").strip()
        size = int(header[48:58].decode("ascii").strip())
        body = data[offset + 60 : offset + 60 + size]
        yield name, body
        offset += 60 + size + (size % 2)


def control_fields(deb_data):
    control_tar = None
    for name, body in ar_members(deb_data):
        if name.rstrip("/").startswith("control.tar"):
            control_tar = (name, body)
            break
    if control_tar is None:
        raise ValueError("control.tar member not found")
    name, body = control_tar
    if name.endswith(".xz"):
        body = lzma.decompress(body)
    with tarfile.open(fileobj=io.BytesIO(body), mode="r:*") as tar:
        for member in tar.getmembers():
            if member.name.lstrip("./") == "control":
                control = tar.extractfile(member).read().decode("utf-8")
                break
        else:
            raise ValueError("control file not found")

    fields = []
    for line in control.splitlines():
        if not line.strip():
            continue
        if line[0] in " \t":
            key, value = fields[-1]
            fields[-1] = (key, value + "\n" + line)
        else:
            key, _, value = line.partition(":")
            fields.append((key, value.lstrip()))
    return fields


def stanza(deb_path, repo_filename):
    with open(deb_path, "rb") as f:
        data = f.read()
    fields = dict(control_fields(data))

    fields["Filename"] = repo_filename
    fields["Size"] = str(len(data))
    fields["MD5sum"] = hashlib.md5(data).hexdigest()
    fields["SHA1"] = hashlib.sha1(data).hexdigest()
    fields["SHA256"] = hashlib.sha256(data).hexdigest()

    ordered = [name for name in LEAD_FIELDS if name in fields]
    ordered += ["Filename", "Size", "MD5sum", "SHA1", "SHA256"]
    ordered += [name for name in TAIL_FIELDS if name in fields]
    known = set(ordered)
    ordered += [name for name in fields if name not in known]

    return "".join("%s: %s\n" % (name, fields[name]) for name in ordered)


def main(args):
    output_path = args[0]
    stanzas = []
    for arg in args[1:]:
        deb_path, _, repo_filename = arg.partition("=")
        stanzas.append(stanza(deb_path, repo_filename))
    stanzas.sort()
    body = "\n".join(stanzas).encode("utf-8") + b"\n"
    with open(output_path, "wb") as f:
        with gzip.GzipFile(fileobj=f, mode="wb", mtime=0) as gz:
            gz.write(body)


if __name__ == "__main__":
    main(sys.argv[1:])
