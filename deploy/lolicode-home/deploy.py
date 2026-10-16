#!/usr/bin/env python3
"""Targeted static-home deployment. Run under root on the existing forum host.

No database, Flarum source, maintenance flag, timer, or backup policy changes.
The versioned payload is reviewed locally; preview and production are separate
commands, with an explicit baseline check and small private config backups.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys

DEPLOYMENT = "20261016-home-v3"
PAYLOAD = Path("/root/lolicode-home-20261016-v3")
SITE = Path("/var/www/lolicode-site/releases") / DEPLOYMENT
BACKUP = Path("/root/backups") / ("lolicode-" + DEPLOYMENT)
SNIPPETS = Path("/etc/nginx/snippets")
TARGETS = {
    "preview": {
        "config": Path("/etc/nginx/sites-available/test.conf"),
        "baseline": "23781dc75433dbff6011bd380dd53a4588f42df17b6466a44549d5fef8079485",
        "anchor": "    include /etc/nginx/snippets/forum-test-noindex-locations.conf;",
    },
    "production": {
        "config": Path("/etc/nginx/sites-available/lolicode.conf"),
        "baseline": "508772825f127ff37abcd60b6caf12c969267103355238fb4957bcdc738811e2",
        "anchor": "    include /var/www/forum/.nginx.conf;",
    },
}
SITE_FILES = {
    "index.html", "desktop-assets/site.css", "desktop-assets/downloads.js",
    "desktop-assets/logo.svg", "desktop-assets/maid.png",
    "desktop-assets/workbench.jpg",
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def plain_file(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode):
        raise RuntimeError(f"Not a plain file: {path}")
    return path.read_bytes()


def atomic(path, data, mode=0o644):
    temporary = path.with_name(path.name + "." + DEPLOYMENT + ".tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def immutable(path, data, mode=0o644):
    if path.exists() or path.is_symlink():
        if plain_file(path) != data:
            raise RuntimeError(f"Refusing to replace existing content: {path}")
        return
    atomic(path, data, mode)


def prepare():
    manifest = json.loads(plain_file(PAYLOAD / "manifest.json"))
    expected = SITE_FILES | {"locations.conf.template", "download-transport.conf"}
    if set(manifest) != expected:
        raise RuntimeError("Unexpected payload file list")
    content = {}
    for name, expected_digest in manifest.items():
        data = plain_file(PAYLOAD / name)
        if digest(data) != expected_digest:
            raise RuntimeError(f"Payload checksum mismatch: {name}")
        content[name] = data
    for directory in [SITE.parent.parent, SITE.parent, SITE, SITE / "desktop-assets"]:
        if directory.is_symlink():
            raise RuntimeError(f"Refusing symlink directory: {directory}")
        directory.mkdir(exist_ok=True, mode=0o755)
    for name in SITE_FILES:
        immutable(SITE / name, content[name])
    immutable(SNIPPETS / "lolicode-download-transport.conf", content["download-transport.conf"])
    for target in TARGETS:
        noindex = 'add_header X-Robots-Tag "noindex, nofollow" always;' if target == "preview" else ""
        # Preview buttons use the already-live official artifacts until the
        # production gateway exists. Production files go straight to GitHub.
        download_root = "https://tools.treasuregrove.art/lolicode/releases/" if target == "preview" else "https://github.com/treasureGrove/LoliCode-Releases/releases/download/lolicode-v"
        rendered = content["locations.conf.template"].decode().replace("@SITE_ROOT@", str(SITE)).replace("@NOINDEX@", noindex).replace("@DOWNLOAD_ROOT@", download_root)
        immutable(SNIPPETS / f"lolicode-home-{target}-{DEPLOYMENT}.conf", rendered.encode())


def apply(target):
    settings = TARGETS[target]
    config = settings["config"]
    original = plain_file(config)
    if digest(original) != settings["baseline"]:
        raise RuntimeError(f"{target} config changed since review; inspect before proceeding")
    text = original.decode()
    anchor = settings["anchor"]
    if text.count(anchor) != 1:
        raise RuntimeError("Ambiguous config insertion point")
    include = f"    include /etc/nginx/snippets/lolicode-home-{target}-{DEPLOYMENT}.conf;\n\n"
    updated = text.replace(anchor, include + anchor).encode()
    BACKUP.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(BACKUP, 0o700)
    immutable(BACKUP / (target + ".conf"), original, 0o600)
    immutable(BACKUP / (target + ".installed.sha256"), digest(updated).encode(), 0o600)
    atomic(config, updated, stat.S_IMODE(config.stat().st_mode))
    try:
        subprocess.run(["nginx", "-t"], check=True)
        subprocess.run(["systemctl", "reload", "nginx"], check=True)
    except Exception:
        if digest(plain_file(config)) != digest(updated):
            raise RuntimeError("Config changed concurrently; retained backup, no blind rollback")
        atomic(config, original)
        subprocess.run(["nginx", "-t"], check=True)
        subprocess.run(["systemctl", "reload", "nginx"], check=True)
        raise
    print(json.dumps({"target": target, "state": "deployed", "site": str(SITE), "config_sha256": digest(updated)}))


def restore(target):
    config = TARGETS[target]["config"]
    expected = plain_file(BACKUP / (target + ".installed.sha256")).decode()
    current = plain_file(config)
    original = plain_file(BACKUP / (target + ".conf"))
    if digest(current) == digest(original):
        print(json.dumps({"target": target, "state": "already-restored"}))
        return
    if digest(current) != expected:
        raise RuntimeError("Config changed after deploy; refusing blind restore")
    atomic(config, original)
    try:
        subprocess.run(["nginx", "-t"], check=True)
        subprocess.run(["systemctl", "reload", "nginx"], check=True)
    except Exception:
        if digest(plain_file(config)) != digest(original):
            raise RuntimeError("Config changed concurrently; retained backup, no blind rollback")
        atomic(config, current)
        subprocess.run(["nginx", "-t"], check=True)
        subprocess.run(["systemctl", "reload", "nginx"], check=True)
        raise
    print(json.dumps({"target": target, "state": "restored"}))


def main():
    if os.geteuid() != 0 or len(sys.argv) != 2:
        raise RuntimeError("Run as root with preview, production, restore-preview or restore-production")
    action = sys.argv[1]
    if action not in {"preview", "production", "restore-preview", "restore-production"}:
        raise RuntimeError("Unknown deployment action")
    with open("/run/lock/lolicode-forum-maintenance.lock", "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if Path("/var/www/ops/MAINTENANCE_ON").exists():
            raise RuntimeError("Existing maintenance mode is active; left untouched")
        if action.startswith("restore-"):
            restore(action.removeprefix("restore-"))
        else:
            prepare()
            apply(action)


if __name__ == "__main__":
    main()
