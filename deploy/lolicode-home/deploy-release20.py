#!/usr/bin/env python3
"""Reviewed 4.0.20 static-only batch, gated by the immutable public release feed.

Writes the owned static homepage only. No updater feeds, binary assets, forum,
API routes, database, cron, maintenance flags, or backup policy are changed.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
from urllib.request import urlopen

BATCH = '20261017-release20-v2'
RELEASE = '4.0.20'
SOURCE_COMMIT = 'cbad951e112055ca13a9970353e664e8974f968f'
IMMUTABLE_FEED_SHA = '7ec40f2b4553f8acd208a27464142a6cbe249769dfbb38fb5ce36531d226a23d'
PAYLOAD = Path('/root/lolicode-' + BATCH)
CONFIG = Path('/etc/nginx/sites-available/lolicode.conf')
CONFIG_SHA = '819dfde97b2533df4dd1dd5f7838cf371199a38b687a813dfdbc82657280bd75'
SNIPPET = Path('/etc/nginx/snippets/lolicode-home-production-20261016-home-v3.conf')
SNIPPET_SHA = '876705197648cf6fc56eac72af8590ff10b1979a2391bb9458f60bf5d048e876'
OLD_SITE = '/var/www/lolicode-site/releases/20261017-release18-v1'
NEW_SITE = Path('/var/www/lolicode-site/releases') / BATCH
TOOLS = Path('/www/wwwroot/tools.treasuregrove.art/lolicode')
TOOLS_BASELINES = {
    'index.html': '6904047cd8e39c08f535c576802e3a4ba5079f88cb95458ff16af6c80c91ce96',
    'assets/downloads.js': '9a8a0325f451661a259b686620619b6eb10bf7db3457692308be2d320f551170',
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def plain(path):
    if not stat.S_ISREG(path.lstat().st_mode):
        raise RuntimeError(f'Not a plain file: {path}')
    return path.read_bytes()


def atomic(path, data, mode=0o644):
    temp = path.with_name(path.name + '.' + BATCH + '.tmp')
    descriptor = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temp, mode)
        os.replace(temp, path)
    finally:
        if temp.exists():
            temp.unlink()


def release_gate():
    # Read-only fixed public origin, verified TLS. A failed gate writes nothing.
    with urlopen('https://tools.treasuregrove.art/lolicode/updates/4.0.20.json', timeout=15) as response:
        data = response.read(65537)
    if len(data) > 65536:
        raise RuntimeError('Unexpectedly large release feed')
    if sha(data) != IMMUTABLE_FEED_SHA:
        raise RuntimeError('Immutable public release differs from the verified artifact')
    feed = json.loads(data)
    item = feed.get('platforms', {}).get('windows-x86_64', {})
    expected = ('https://github.com/treasureGrove/LoliCode-Releases/'
                'releases/download/lolicode-v4.0.20/LoliCode-4.0.20-Windows-x64-Setup.exe')
    if (feed.get('version') != RELEASE or feed.get('sourceCommit') != SOURCE_COMMIT
            or item.get('url') != expected
            or not isinstance(item.get('signature'), str) or not item['signature'].strip()):
        raise RuntimeError('Public signed 4.0.20 release is not available; copy remains unpublished')


def payload(kind, expected):
    manifest = json.loads(plain(PAYLOAD / 'manifest.json'))
    if manifest.get('releaseVersion') != RELEASE or set(manifest) != {'releaseVersion', 'home', 'tools'}:
        raise RuntimeError('Unexpected payload release')
    files = manifest[kind]
    if set(files) != set(expected):
        raise RuntimeError('Unexpected payload list')
    content = {name: plain(PAYLOAD / kind / name) for name in files}
    if any(sha(data) != files[name] for name, data in content.items()):
        raise RuntimeError('Payload checksum mismatch')
    return content


def production():
    names = ['index.html'] + ['desktop-assets/' + name for name in
        ['site.css', 'motion.js', 'downloads.js', 'logo.svg', 'maid.png', 'workbench.jpg']]
    content = payload('home', names)
    original = plain(SNIPPET)
    if sha(plain(CONFIG)) != CONFIG_SHA:
        raise RuntimeError('Main Nginx configuration changed since review')
    if sha(original) != SNIPPET_SHA or original.decode().count(OLD_SITE) != 2:
        raise RuntimeError('Homepage configuration changed since review')
    for directory in [NEW_SITE, NEW_SITE / 'desktop-assets']:
        if directory.is_symlink():
            raise RuntimeError('Unexpected symlink')
        try:
            directory.mkdir(mode=0o755)
        except FileExistsError:
            if not directory.is_dir() or stat.S_IMODE(directory.stat().st_mode) != 0o755:
                raise RuntimeError('Existing static directory is not a readable 0755 directory')
        else:
            # Override only our freshly created directory's restrictive root umask.
            directory.chmod(0o755)
    for name, data in content.items():
        target = NEW_SITE / name
        if target.exists():
            if plain(target) != data:
                raise RuntimeError('Immutable batch already differs')
        else:
            atomic(target, data)
    backup = PAYLOAD / 'production-snippet.before'
    if backup.exists() and plain(backup) != original:
        raise RuntimeError('Conflicting backup')
    atomic(backup, original, 0o600)
    updated = original.decode().replace(OLD_SITE, str(NEW_SITE)).encode()
    if plain(SNIPPET) != original or sha(plain(CONFIG)) != CONFIG_SHA:
        raise RuntimeError('Concurrent Nginx configuration change')
    atomic(SNIPPET, updated)
    try:
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    except Exception:
        if plain(SNIPPET) != updated or sha(plain(CONFIG)) != CONFIG_SHA:
            raise RuntimeError('Concurrent config change; retained backup without blind rollback')
        atomic(SNIPPET, original)
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        raise
    print(json.dumps({'state': 'published', 'site': str(NEW_SITE), 'snippetSHA256': sha(updated)}))


def tools():
    content = payload('tools', TOOLS_BASELINES)
    lock = TOOLS / '.publish-lock'
    lock.mkdir(mode=0o700)
    originals = {}
    written = []
    try:
        for name, expected in TOOLS_BASELINES.items():
            originals[name] = plain(TOOLS / name)
            if sha(originals[name]) != expected:
                raise RuntimeError('Tools static files changed since review')
        backup = PAYLOAD / 'tools-before'
        if backup.is_symlink():
            raise RuntimeError('Unexpected backup symlink')
        backup.mkdir(mode=0o700, exist_ok=True)
        for name, data in originals.items():
            target = backup / name.replace('/', '__')
            if target.exists() and plain(target) != data:
                raise RuntimeError('Conflicting backup')
            atomic(target, data, 0o600)
        # The new script tolerates the old HTML; publish the new HTML last.
        for name in ['assets/downloads.js', 'index.html']:
            target = TOOLS / name
            if plain(target) != originals[name]:
                raise RuntimeError('Concurrent website edit')
            atomic(target, content[name])
            written.append(name)
    except Exception:
        for name in reversed(written):
            target = TOOLS / name
            if plain(target) != content[name]:
                raise RuntimeError('Concurrent website edit; retained backups without blind rollback')
            atomic(target, originals[name])
        raise
    finally:
        lock.rmdir()
    print(json.dumps({'state': 'published', 'files': {name: sha(data) for name, data in content.items()}}))


if __name__ == '__main__':
    if os.geteuid() != 0 or sys.argv[1:] not in [['production'], ['tools']]:
        raise RuntimeError('Expected production or tools on its reviewed host')
    with open('/run/lock/lolicode-forum-maintenance.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if Path('/var/www/ops/MAINTENANCE_ON').exists():
            raise RuntimeError('Existing maintenance mode left unchanged')
        release_gate()
        (production if sys.argv[1] == 'production' else tools)()
