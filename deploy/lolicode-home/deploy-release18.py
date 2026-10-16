#!/usr/bin/env python3
"""Reviewed 4.0.18 copy-only batch. Run only after the public feed is 4.0.18.

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

BATCH = '20261017-release18-v1'
RELEASE = '4.0.18'
PAYLOAD = Path('/root/lolicode-' + BATCH)
CONFIG = Path('/etc/nginx/sites-available/lolicode.conf')
CONFIG_SHA = '819dfde97b2533df4dd1dd5f7838cf371199a38b687a813dfdbc82657280bd75'
SNIPPET = Path('/etc/nginx/snippets/lolicode-home-production-20261016-home-v3.conf')
SNIPPET_SHA = '28c6fff3bed475ccd3f9ce016cdafd9634a6ca75aeeff1083e7f8829da43f95f'
OLD_SITE = '/var/www/lolicode-site/releases/20261017-motion-v1'
NEW_SITE = Path('/var/www/lolicode-site/releases') / BATCH
TOOLS = Path('/www/wwwroot/tools.treasuregrove.art/lolicode')
TOOLS_INDEX_SHA = 'ba561bc13ee6a14dbbcf277f1d2f55a6f458852d8b66a614b4a2fcbc7ed07e0b'


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
    with urlopen('https://tools.treasuregrove.art/lolicode/updates/latest.json', timeout=15) as response:
        data = response.read(65537)
    if len(data) > 65536:
        raise RuntimeError('Unexpectedly large release feed')
    feed = json.loads(data)
    item = feed.get('platforms', {}).get('windows-x86_64', {})
    expected = ('https://github.com/treasureGrove/LoliCode-Releases/'
                'releases/download/lolicode-v4.0.18/LoliCode-4.0.18-Windows-x64-Setup.exe')
    if feed.get('version') != RELEASE or item.get('url') != expected or not item.get('signature'):
        raise RuntimeError('Public signed 4.0.18 release is not available; copy remains unpublished')


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
        directory.mkdir(exist_ok=True)
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
    content = payload('tools', ['index.html'])
    lock = TOOLS / '.publish-lock'
    lock.mkdir(mode=0o700)
    try:
        target = TOOLS / 'index.html'
        original = plain(target)
        if sha(original) != TOOLS_INDEX_SHA:
            raise RuntimeError('Tools page changed since review')
        backup = PAYLOAD / 'tools-index.before'
        if backup.exists() and plain(backup) != original:
            raise RuntimeError('Conflicting backup')
        atomic(backup, original, 0o600)
        if plain(target) != original:
            raise RuntimeError('Concurrent website edit')
        atomic(target, content['index.html'])
    finally:
        lock.rmdir()
    print(json.dumps({'state': 'published', 'files': {'index.html': sha(content['index.html'])}}))


if __name__ == '__main__':
    if os.geteuid() != 0 or sys.argv[1:] not in [['production'], ['tools']]:
        raise RuntimeError('Expected production or tools on its reviewed host')
    with open('/run/lock/lolicode-forum-maintenance.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if Path('/var/www/ops/MAINTENANCE_ON').exists():
            raise RuntimeError('Existing maintenance mode left unchanged')
        release_gate()
        (production if sys.argv[1] == 'production' else tools)()
