#!/usr/bin/env python3
"""Install only this batch's new services; never edit cron or Nginx configuration."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pwd
import stat
import subprocess
import sys
import uuid

PAYLOAD = Path("/root/lolicode-daily-seo-20261020-v1")
HOME = {
    "Core.php": "/usr/local/lib/lolicode-daily-seo/Core.php",
    "Baidu.php": "/usr/local/lib/lolicode-daily-seo/Baidu.php",
    "run.php": "/usr/local/lib/lolicode-daily-seo/run.php",
    "lolicode-daily-seo.service": "/etc/systemd/system/lolicode-daily-seo.service",
    "lolicode-daily-seo.timer": "/etc/systemd/system/lolicode-daily-seo.timer",
}
REVIEW = {
    "review.py": "/usr/local/lib/lolicode-seo-review/review.py",
    "lolicode-seo-review.service": "/etc/systemd/system/lolicode-seo-review.service",
    "lolicode-seo-review.timer": "/etc/systemd/system/lolicode-seo-review.timer",
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def plain(path):
    if not stat.S_ISREG(path.lstat().st_mode):
        raise RuntimeError("Expected a plain file: " + str(path))
    return path.read_bytes()


def atomic(path, data, mode=0o644):
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        with temporary.open("xb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.chmod(mode)
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def directory(path, mode, owner="root"):
    uid = pwd.getpwnam(owner).pw_uid
    gid = pwd.getpwnam(owner).pw_gid
    if path.is_symlink():
        raise RuntimeError("Unexpected symlink directory: " + str(path))
    if path.exists():
        metadata = path.stat()
        if not path.is_dir() or metadata.st_uid != uid or metadata.st_gid != gid or stat.S_IMODE(metadata.st_mode) != mode:
            raise RuntimeError("Existing directory ownership or mode differs: " + str(path))
    else:
        path.mkdir(mode=mode)
        path.chmod(mode)
        os.chown(path, uid, gid)


def content():
    manifest = json.loads(plain(PAYLOAD / "manifest.json"))
    if set(manifest) != {"files"} or set(manifest["files"]) != set(HOME) | set(REVIEW):
        raise RuntimeError("Unexpected daily SEO payload list")
    files = {}
    for name, digest in manifest["files"].items():
        data = plain(PAYLOAD / name)
        if sha(data) != digest:
            raise RuntimeError("Staged source digest differs: " + name)
        files[name] = data
    return files


def cron_digest():
    result = subprocess.run(["crontab", "-l", "-u", "root"], capture_output=True)
    if result.returncode not in (0, 1):
        raise RuntimeError("Cannot inspect existing cron baseline")
    return sha(result.stdout)


def paths(kind):
    return HOME if kind == "home" else REVIEW


def unit_names(kind):
    stem = "lolicode-daily-seo" if kind == "home" else "lolicode-seo-review"
    return stem + ".service", stem + ".timer"


def verify_installed(kind, files):
    for name, destination in paths(kind).items():
        if plain(Path(destination)) != files[name]:
            raise RuntimeError("Installed file differs: " + destination)


def prepare_directories(kind):
    if kind == "home":
        if not Path("/var/www/forum/site.php").is_file():
            raise RuntimeError("Expected the lolicode host")
        log = Path("/var/www/forum/storage/logs/indexnow.log")
        if not stat.S_ISREG(log.lstat().st_mode):
            raise RuntimeError("Expected the existing plain IndexNow log file")
        subprocess.run(["runuser", "-u", "www-data", "--", "test", "-w", str(log)], check=True)
        directory(Path("/usr/local/lib/lolicode-daily-seo"), 0o755)
        base = Path("/var/lib/lolicode-seo")
        if base.exists() and not base.is_symlink() and base.stat().st_uid == 0:
            # Root prepared only the private credential directory for this batch.
            # Transfer just the empty state parent; never recurse or read a token.
            metadata = base.stat()
            if not base.is_dir() or metadata.st_gid != 0 or stat.S_IMODE(metadata.st_mode) != 0o755:
                raise RuntimeError("Unexpected preinstalled SEO parent metadata")
            if {entry.name for entry in base.iterdir()} != {"credentials"}:
                raise RuntimeError("Unexpected preinstalled SEO parent contents")
            directory(base / "credentials", 0o700, "www-data")
            account = pwd.getpwnam("www-data")
            os.chown(base, account.pw_uid, account.pw_gid)
        directory(base, 0o755, "www-data")
        directory(Path("/var/lib/lolicode-seo/state"), 0o700, "www-data")
    else:
        runtime = Path("/root/node-v22.14.0-linux-x64/lib/node_modules/opencode-ai/bin/opencode.exe")
        auth = Path("/root/.local/share/opencode/auth.json")
        if Path("/usr/local/bin/opencode").resolve() != runtime or not runtime.is_file() or not auth.is_file():
            raise RuntimeError("Expected the existing tools-host OpenCode runtime and authentication")
        directory(Path("/usr/local/lib/lolicode-seo-review"), 0o755)
        base = Path("/var/lib/lolicode-seo-review")
        directory(base, 0o700)
        for name in ["work", "home", "data", "config", "cache", "state"]:
            directory(base / name, 0o700)
        directory(base / "data/opencode", 0o700)
        # Only an empty mount point is created. Authentication is never copied.
        placeholder = base / "data/opencode/auth.json"
        if placeholder.is_symlink():
            raise RuntimeError("Unexpected authentication mount-point symlink")
        if placeholder.exists():
            if plain(placeholder) != b"":
                raise RuntimeError("Authentication mount point must remain empty outside the service")
        else:
            atomic(placeholder, b"", 0o600)


def install(kind):
    files = content()
    before_cron = cron_digest()
    mapping = paths(kind)
    service, timer = unit_names(kind)
    # These are additive new units. Never replace an independently installed unit.
    for name, destination in mapping.items():
        target = Path(destination)
        if target.exists() or target.is_symlink():
            if plain(target) != files[name]:
                raise RuntimeError("Existing unrelated target differs: " + destination)
    existing = {name: Path(destination).exists() for name, destination in mapping.items()}
    prepare_directories(kind)
    receipt = {"kind": kind, "rootCronSHA256": before_cron, "existed": existing,
               "files": {name: sha(files[name]) for name in mapping}}
    backup = PAYLOAD / (kind + "-installation.before.json")
    if backup.exists():
        old = json.loads(plain(backup))
        if old["files"] != receipt["files"] or old["rootCronSHA256"] != before_cron:
            raise RuntimeError("Previous installation receipt differs")
    else:
        atomic(backup, (json.dumps(receipt, indent=2) + "\n").encode(), 0o600)
    written = []
    try:
        for name, destination in mapping.items():
            target = Path(destination)
            if not target.exists():
                atomic(target, files[name])
                written.append(target)
        if kind == "home":
            for name in ["Core.php", "Baidu.php", "run.php"]:
                subprocess.run(["/usr/bin/php", "-l", HOME[name]], check=True)
        else:
            compile(files["review.py"].decode("utf-8"), REVIEW["review.py"], "exec")
        subprocess.run(["systemd-analyze", "verify",
                        "/etc/systemd/system/" + service,
                        "/etc/systemd/system/" + timer], check=True)
        subprocess.run(["systemctl", "daemon-reload"], check=True)
        if cron_digest() != before_cron:
            raise RuntimeError("Root cron changed concurrently; it was not overwritten")
    except Exception:
        for target in reversed(written):
            name = next(key for key, value in mapping.items() if Path(value) == target)
            if plain(target) != files[name]:
                raise RuntimeError("Concurrent target edit; no blind cleanup")
            target.unlink()
        subprocess.run(["systemctl", "daemon-reload"], check=False)
        raise
    print(json.dumps({"state": "installed-not-started", "kind": kind,
                      "service": service, "timer": timer, "rootCronUnchanged": True}))


def activate(kind):
    files = content()
    verify_installed(kind, files)
    _, timer = unit_names(kind)
    before_cron = cron_digest()
    subprocess.run(["systemctl", "enable", "--now", timer], check=True)
    if cron_digest() != before_cron:
        raise RuntimeError("Root cron changed concurrently; it was not overwritten")
    print(json.dumps({"state": "timer-enabled", "kind": kind, "timer": timer}))


def dry_run_home():
    files = content()
    verify_installed("home", files)
    # Apply the same sandbox in a transient unit, overriding only its command.
    # The installed daily timer and service remain inactive.
    properties = []
    in_service = False
    for line in files["lolicode-daily-seo.service"].decode().splitlines():
        if line.startswith("["):
            in_service = line == "[Service]"
        elif in_service and "=" in line and not line.startswith("#"):
            name = line.split("=", 1)[0]
            if name not in {"ExecStart", "StandardOutput", "StandardError"}:
                properties.extend(["--property", line])
    subprocess.run([
        "systemd-run", "--unit=lolicode-daily-seo-dryrun-20261020",
        "--wait", "--pipe", "--collect", *properties,
        "/usr/bin/php", HOME["run.php"], "--dry-run",
    ], check=True)
    print(json.dumps({"state": "sandbox-dry-run-passed", "submissionAPICalled": False}))


def disable(kind):
    verify_installed(kind, content())
    service, timer = unit_names(kind)
    subprocess.run(["systemctl", "disable", "--now", timer], check=True)
    subprocess.run(["systemctl", "stop", service], check=True)
    print(json.dumps({"state": "disabled", "kind": kind, "stateAndLogsRetained": True}))


if __name__ == "__main__":
    actions = {"install-home": lambda: install("home"), "install-review": lambda: install("review"),
               "dry-run-home": dry_run_home,
               "activate-home": lambda: activate("home"), "activate-review": lambda: activate("review"),
               "disable-home": lambda: disable("home"), "disable-review": lambda: disable("review")}
    if os.geteuid() != 0 or len(sys.argv) != 2 or sys.argv[1] not in actions:
        raise RuntimeError("Expected an explicit install, activate or disable action")
    with open("/run/lock/lolicode-forum-maintenance.lock", "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if Path("/var/www/ops/MAINTENANCE_ON").exists():
            raise RuntimeError("Existing maintenance mode left unchanged")
        actions[sys.argv[1]]()
