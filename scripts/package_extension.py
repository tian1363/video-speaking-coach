"""Create a Chrome Web Store ZIP containing only the extension files."""

import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "extension"
manifest = json.loads((SOURCE / "manifest.json").read_text(encoding="utf-8"))
version = manifest["version"]
target = ROOT / "dist" / f"video-speaking-coach-{version}.zip"
target.parent.mkdir(exist_ok=True)
files = sorted(path for path in SOURCE.rglob("*") if path.is_file())
if not files or any(path.is_symlink() or path.name.startswith(".") for path in files):
    raise SystemExit("Extension directory contains unexpected files")
with ZipFile(target, "w", compression=ZIP_DEFLATED) as archive:
    for path in files:
        archive.write(path, path.relative_to(SOURCE).as_posix())
with ZipFile(target) as archive:
    assert "manifest.json" in archive.namelist()
    assert len(archive.namelist()) == len(files)
print(f"{target} ({len(files)} files)")
print(f"SHA-256: {hashlib.sha256(target.read_bytes()).hexdigest()}")
