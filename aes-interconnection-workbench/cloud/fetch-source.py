"""Download a verified private source archive without persisting its download secret."""
import hashlib
import io
import os
from pathlib import Path, PurePosixPath
import stat
import sys
from urllib.parse import urlparse
from urllib.request import Request, urlopen
import zipfile


def extract_verified(data: bytes, expected: str, destination: Path) -> None:
    if len(expected) != 64 or hashlib.sha256(data).hexdigest() != expected.lower():
        raise ValueError("Source archive checksum mismatch")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        if sum(item.file_size for item in entries) > 100 * 1024 * 1024:
            raise ValueError("Source archive exceeds extraction limit")
        roots = {PurePosixPath(item.filename).parts[0] for item in entries}
        if len(roots) != 1:
            raise ValueError("Expected one repository root")
        for item in entries:
            name = PurePosixPath(item.filename)
            if name.is_absolute() or ".." in name.parts or "\\" in item.filename:
                raise ValueError("Unsafe archive path")
            if stat.S_ISLNK(item.external_attr >> 16):
                raise ValueError("Source archive symlinks are unsupported")
            if len(name.parts) < 2:
                continue
            target = destination.joinpath(*name.parts[1:])
            if item.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.read(item))
        for required in ("backend/app.py", "frontend/package-lock.json", "requirements.lock", "scripts/cloud-start.sh"):
            if not (destination / required).is_file():
                raise ValueError("Source archive lacks required application files")


def main() -> None:
    url = Path("/run/secrets/source_archive_url").read_text().strip()
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "codeload.github.com" or parsed.username:
        raise ValueError("Expected a GitHub HTTPS archive URL")
    with urlopen(Request(url, headers={"User-Agent": "aes-cloud-build"}), timeout=90) as response:
        data = response.read(40 * 1024 * 1024 + 1)
    if len(data) > 40 * 1024 * 1024:
        raise ValueError("Source archive exceeds download limit")
    extract_verified(data, os.environ["SOURCE_ARCHIVE_SHA256"], Path("/source"))
    print("Verified private application source extracted")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # A URL in an HTTP exception can contain the temporary credential.
        print("Private source fetch failed: refresh the archive secret and verify its checksum.", file=sys.stderr)
        sys.exit(1)
