#!/usr/bin/env python3
"""Freeze only the reviewed daily files; no credentials or server actions."""
import hashlib
import io
import json
from pathlib import Path
import tarfile

SOURCE = Path(__file__).resolve().parent
OUTPUT = SOURCE.parents[2] / "tmp/lolicode-daily-seo-20261020-v1"
FILES = [
    "Core.php", "Baidu.php", "run.php",
    "lolicode-daily-seo.service", "lolicode-daily-seo.timer",
    "review.py", "lolicode-seo-review.service", "lolicode-seo-review.timer",
]


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    content = {name: (SOURCE / name).read_bytes() for name in FILES}
    manifest = {"files": {name: hashlib.sha256(data).hexdigest() for name, data in content.items()}}
    content["manifest.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
    content["install.py"] = (SOURCE / "install.py").read_bytes()
    archive = OUTPUT / "payload.tar.gz"
    with tarfile.open(archive, "w:gz") as bundle:
        for name, data in content.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mode = 0o600
            info.uid = info.gid = 0
            info.mtime = 0
            bundle.addfile(info, io.BytesIO(data))
    (OUTPUT / "manifest.json").write_bytes(content["manifest.json"])
    proof = {
        "archive": str(archive),
        "archiveSHA256": hashlib.sha256(archive.read_bytes()).hexdigest(),
        "manifestSHA256": hashlib.sha256(content["manifest.json"]).hexdigest(),
        "installerSHA256": hashlib.sha256(content["install.py"]).hexdigest(),
        "payloadFiles": len(content),
    }
    (OUTPUT / "payload-proof.json").write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(proof, indent=2))


if __name__ == "__main__":
    main()
