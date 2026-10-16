#!/usr/bin/env python3
"""Reviewed 2026-10-17 static-only batch. No feed, forum, API or DB changes."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys

BATCH = '20261017-motion-v1'
PAYLOAD = Path('/root/lolicode-' + BATCH)
SNIPPET = Path('/etc/nginx/snippets/lolicode-home-production-20261016-home-v3.conf')
SNIPPET_SHA = '20d52308db81eb2fc9b9e58b18f678181be4eaf965f4809cbec8ae9431ecd429'
OLD_SITE = '/var/www/lolicode-site/releases/20261016-home-v3'
NEW_SITE = Path('/var/www/lolicode-site/releases') / BATCH
TOOLS = Path('/www/wwwroot/tools.treasuregrove.art/lolicode')
BASELINES = {
    'index.html': 'ef11764ad34e79061d2f5a2097d56447ff3e0ea2d5c87c48daf35879a3519858',
    'assets/site.css': '6514d70ee81c4eac8f10415afc9bc4e335aba4cdf4da9184754cd2112c0e8138',
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

def payload(kind, expected):
    manifest = json.loads(plain(PAYLOAD / 'manifest.json'))[kind]
    if set(manifest) != set(expected):
        raise RuntimeError('Unexpected payload list')
    content = {name: plain(PAYLOAD / kind / name) for name in manifest}
    if any(sha(data) != manifest[name] for name, data in content.items()):
        raise RuntimeError('Payload checksum mismatch')
    return content

def production():
    names = ['index.html'] + ['desktop-assets/' + name for name in
        ['site.css', 'motion.js', 'downloads.js', 'logo.svg', 'maid.png', 'workbench.jpg']]
    content = payload('home', names)
    original = plain(SNIPPET)
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
    atomic(SNIPPET, updated)
    try:
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    except Exception:
        if plain(SNIPPET) != updated:
            raise RuntimeError('Concurrent config change; retained backup without blind rollback')
        atomic(SNIPPET, original)
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        raise
    print(json.dumps({'state':'published', 'site':str(NEW_SITE), 'snippetSHA256':sha(updated)}))

def tools():
    names = ['index.html', 'assets/site.css', 'assets/motion.js']
    content = payload('tools', names)
    lock = TOOLS / '.publish-lock'
    lock.mkdir(mode=0o700)
    originals = {}
    written = []
    try:
        for name, digest in BASELINES.items():
            originals[name] = plain(TOOLS / name)
            if sha(originals[name]) != digest:
                raise RuntimeError('Tools page changed since review')
        if (TOOLS / 'assets/motion.js').exists():
            raise RuntimeError('Motion asset already exists; inspect before replacing')
        backup = PAYLOAD / 'tools-before'
        backup.mkdir(mode=0o700, exist_ok=True)
        for name, data in originals.items():
            atomic(backup / name.replace('/', '__'), data, 0o600)
        for name in ['assets/motion.js', 'assets/site.css', 'index.html']:
            target = TOOLS / name
            if name in originals and plain(target) != originals[name]:
                raise RuntimeError('Concurrent website edit')
            atomic(target, content[name])
            written.append(name)
    except Exception:
        for name in reversed(written):
            if name in originals and plain(TOOLS / name) == content[name]:
                atomic(TOOLS / name, originals[name])
        raise
    finally:
        lock.rmdir()
    print(json.dumps({'state':'published','files':{name:sha(data) for name,data in content.items()}}))

if __name__ == '__main__':
    if os.geteuid() != 0 or sys.argv[1:] not in [['production'], ['tools']]:
        raise RuntimeError('Expected production or tools on its reviewed host')
    with open('/run/lock/lolicode-forum-maintenance.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if Path('/var/www/ops/MAINTENANCE_ON').exists():
            raise RuntimeError('Existing maintenance mode left unchanged')
        (production if sys.argv[1] == 'production' else tools)()
