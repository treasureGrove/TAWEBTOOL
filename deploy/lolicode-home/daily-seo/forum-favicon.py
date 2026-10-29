#!/usr/bin/env python3
"""Change only Flarum favicon_path, with a private backup and guarded rollback."""
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

PRIVATE = Path("/root/lolicode-forum-favicon-20261020-wine-v1")
SOURCE = PRIVATE / "site-icon-512.png"
ASSETS = Path("/var/www/forum/public/assets")
OLD_NAME = "favicon-tpxlxsy5.png"
OLD_SHA = "e9fd66a58a2c626e1269c062403879d2f320e427e2c77c1913f0a0a17d34becb"
NEW_SHA = "c7396fd91efb772cf23a6832206d401b1707fa69abe5e5cfae7ac736a502bbb1"
NEW_NAME = "favicon-lolicode-wine-" + NEW_SHA[:12] + ".png"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def plain(path):
    if not stat.S_ISREG(path.lstat().st_mode):
        raise RuntimeError("Expected a plain file: " + str(path))
    return path.read_bytes()


def atomic(path, data, mode, owner=None):
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        with temporary.open("xb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.chmod(mode)
        if owner:
            account = pwd.getpwnam(owner)
            os.chown(temporary, account.pw_uid, account.pw_gid)
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


BOOTSTRAP = r"""
$site = require '/var/www/forum/site.php';
$app = $site->bootApp();
$container = $app->getContainer();
$db = $container->make('db');
"""


def php(code, args=()):
    result = subprocess.run(["runuser", "-u", "www-data", "--", "php", "-r",
                             BOOTSTRAP + code, "--", *args],
                            text=True, capture_output=True, timeout=30)
    if result.returncode != 0:
        # Do not echo a bootstrap/provider error that could contain private context.
        raise RuntimeError("Scoped Flarum setting operation failed")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        raise RuntimeError("Unexpected scoped Flarum response")


def current():
    return php(r"""
$rows = $db->table('settings')->whereIn('key', ['favicon_path', 'logo_path'])->pluck('value', 'key')->all();
echo json_encode($rows, JSON_UNESCAPED_SLASHES), "\n";
""")


def replace(expected, target):
    # Values are fixed public asset filenames, passed as PHP script arguments.
    return php(r"""
$expected = $argv[1];
$target = $argv[2];
$db->transaction(function () use ($db, $expected, $target) {
    $logo = $db->table('settings')->where('key', 'logo_path')->lockForUpdate()->value('value');
    if ($logo !== null) { throw new RuntimeException('Concurrent logo edit'); }
    $row = $db->table('settings')->where('key', 'favicon_path')->lockForUpdate()->first(['value']);
    if (!$row || $row->value !== $expected) { throw new RuntimeException('Concurrent favicon edit'); }
    $count = $db->table('settings')->where('key','favicon_path')->where('value',$expected)->update(['value'=>$target]);
    if ($count !== 1) { throw new RuntimeException('Expected exactly one favicon setting'); }
});
echo json_encode(['favicon_path'=>$target]), "\n";
""", (expected, target))


def install():
    if PRIVATE.is_symlink() or not PRIVATE.is_dir() or PRIVATE.stat().st_uid != 0 or stat.S_IMODE(PRIVATE.stat().st_mode) != 0o700:
        raise RuntimeError("Expected this batch's private staging directory")
    source = plain(SOURCE)
    if sha(source) != NEW_SHA or source[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError("Reviewed PNG digest or format differs")
    if sha(plain(ASSETS / OLD_NAME)) != OLD_SHA:
        raise RuntimeError("Original favicon asset changed")
    before = current()
    if before.get("favicon_path") != OLD_NAME or before.get("logo_path") is not None:
        raise RuntimeError("Favicon setting baseline changed")
    snapshot = {"setting": "favicon_path", "before": OLD_NAME, "after": NEW_NAME,
                "oldAssetSHA256": OLD_SHA, "newAssetSHA256": NEW_SHA,
                "logo_path_unchanged": before.get("logo_path")}
    backup = PRIVATE / "setting.before.json"
    if backup.exists():
        if json.loads(plain(backup)) != snapshot:
            raise RuntimeError("Private setting backup differs")
    else:
        atomic(backup, (json.dumps(snapshot, indent=2) + "\n").encode(), 0o600)
    old_backup = PRIVATE / "favicon.before.png"
    if old_backup.exists():
        if sha(plain(old_backup)) != OLD_SHA:
            raise RuntimeError("Private original asset backup differs")
    else:
        atomic(old_backup, plain(ASSETS / OLD_NAME), 0o600)
    target = ASSETS / NEW_NAME
    if target.exists() or target.is_symlink():
        if sha(plain(target)) != NEW_SHA:
            raise RuntimeError("Reviewed asset filename already differs")
        account = pwd.getpwnam("www-data")
        metadata = target.stat()
        if metadata.st_uid != account.pw_uid or metadata.st_gid != account.pw_gid or stat.S_IMODE(metadata.st_mode) != 0o644:
            raise RuntimeError("Existing reviewed asset metadata differs")
    else:
        atomic(target, source, 0o644, "www-data")
    try:
        replace(OLD_NAME, NEW_NAME)
        after = current()
        if after.get("favicon_path") != NEW_NAME or after.get("logo_path") is not None:
            raise RuntimeError("Favicon or logo post-check differs")
    except Exception as error:
        # CAS permits rollback only while our exact favicon value remains current.
        # An unrelated concurrent edit is never overwritten.
        try:
            state = current()
            if state.get("favicon_path") == NEW_NAME:
                replace(NEW_NAME, OLD_NAME)
            restored = current()
            if restored.get("favicon_path") != OLD_NAME or restored.get("logo_path") is not None:
                raise RuntimeError("Concurrent setting edit prevented verified rollback")
        except Exception:
            raise RuntimeError("Favicon post-check failed; guarded rollback could not be verified") from error
        raise RuntimeError("Favicon post-check failed; this batch's setting was restored") from error
    print(json.dumps({"state": "installed", "favicon_path": NEW_NAME,
                      "publicURL": "https://lolicode.com/assets/" + NEW_NAME,
                      "assetSHA256": NEW_SHA, "logo_path": after.get("logo_path")}))


def restore():
    snapshot = json.loads(plain(PRIVATE / "setting.before.json"))
    if snapshot.get("before") != OLD_NAME or snapshot.get("after") != NEW_NAME:
        raise RuntimeError("Unexpected private backup")
    if sha(plain(ASSETS / OLD_NAME)) != OLD_SHA:
        raise RuntimeError("Original favicon asset changed")
    state = current()
    if state.get("logo_path") is not None:
        raise RuntimeError("Concurrent logo edit; rollback stopped")
    actual = state.get("favicon_path")
    if actual == OLD_NAME:
        print(json.dumps({"state": "already-restored", "favicon_path": OLD_NAME}))
        return
    if actual != NEW_NAME:
        raise RuntimeError("Concurrent favicon edit; rollback stopped")
    replace(NEW_NAME, OLD_NAME)
    restored = current()
    if restored.get("favicon_path") != OLD_NAME or restored.get("logo_path") is not None:
        raise RuntimeError("Rollback post-check differs")
    print(json.dumps({"state": "restored", "favicon_path": OLD_NAME,
                      "newAssetRetained": True}))


if __name__ == "__main__":
    if os.geteuid() != 0 or len(sys.argv) != 2 or sys.argv[1] not in {"install", "restore", "inspect"}:
        raise RuntimeError("Expected install, restore or inspect as root")
    with open("/run/lock/lolicode-forum-maintenance.lock", "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if Path("/var/www/ops/MAINTENANCE_ON").exists():
            raise RuntimeError("Existing maintenance mode left unchanged")
        {"install": install, "restore": restore,
         "inspect": lambda: print(json.dumps(current()))}[sys.argv[1]]()
