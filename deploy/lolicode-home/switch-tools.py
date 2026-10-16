#!/usr/bin/env python3
"""One-time, compare-and-swap migration of existing website/download pointers.

The original signed installers and immutable version directory are untouched.
Run only after the matching public GitHub attachments pass full hash checks.
"""
import hashlib
import json
import os
from pathlib import Path
import stat
import urllib.request
import uuid

ROOT = Path('/www/wwwroot/tools.treasuregrove.art/lolicode')
PAYLOAD = Path('/root/lolicode-home-downloads-20261016')
BACKUP = Path('/root/lolicode-site-backups/20261016-github-downloads')
BASELINES = {
    'index.html': 'e09f7a6b07814ce9328319e10a9a3cf20aca41358d764335dcc98b9be5eb4032',
    'assets/downloads.js': 'bc807c8d0a84cf5271bfee6b788b635ac7aa5e8fa4f5995412ed2fc18f120b6d',
    'updates/latest.json': 'ee1dc03b55b6e6c57a418562a4ba7d43f2f61849b71a9be6f4f4605f9d1798cd',
}
GITHUB = 'https://github.com/treasureGrove/LoliCode-Releases/releases/download/lolicode-v4.0.16/'


def plain(path):
    if not stat.S_ISREG(path.lstat().st_mode):
        raise RuntimeError(f'Not a regular file: {path}')
    return path.read_bytes()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def atomic(path, data, owner=None, mode=0o644):
    temporary = path.with_name(path.name + '.github-' + str(uuid.uuid4()))
    with temporary.open('xb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(temporary, mode)
    if owner:
        os.chown(temporary, *owner)
    os.replace(temporary, path)


def main():
    payload_hashes = json.loads(plain(PAYLOAD / 'manifest.json'))
    if set(payload_hashes) != {'index.html', 'downloads.js'}:
        raise RuntimeError('Unexpected site payload')
    content = {}
    for name in payload_hashes:
        data = plain(PAYLOAD / name)
        if sha(data) != payload_hashes[name]:
            raise RuntimeError('Site payload hash mismatch')
        content['assets/downloads.js' if name == 'downloads.js' else name] = data
    # Anonymous API verification; final download redirects and full hashes are
    # checked from the delivery machine (this host has slow CDN egress).
    expected_assets = {
        'LoliCode-4.0.16-Windows-x64-Setup.exe': (21746554, '18b9388d68e12e281d465215738a108b84c791984f60a5abe45017e76c284ba0'),
        'LoliCode-Portable.zip': (26186973, '1abc2bf82e9295e270486d200d64408ac102ad7468a8484ed2c1c48b3dec3e45'),
    }
    with urllib.request.urlopen('https://api.github.com/repos/treasureGrove/LoliCode-Releases/releases/tags/lolicode-v4.0.16', timeout=25) as response:
        release = json.load(response)
    if release['draft'] or release['prerelease']:
        raise RuntimeError('Expected a published stable release')
    assets = {item['name']: item for item in release['assets']}
    for name, (size, digest) in expected_assets.items():
        item = assets[name]
        if item['state'] != 'uploaded' or item['size'] != size or item['digest'] != 'sha256:' + digest or item['browser_download_url'] != GITHUB + name:
            raise RuntimeError('GitHub asset verification failed')
    lock = ROOT / '.publish-lock'
    owner_id = str(uuid.uuid4())
    lock.mkdir(mode=0o700)
    owner = lock / 'owner'
    try:
        owner.write_text(owner_id)
        originals = {}
        for name, expected in BASELINES.items():
            originals[name] = plain(ROOT / name)
            if sha(originals[name]) != expected:
                raise RuntimeError(f'Published file changed since review: {name}')
        latest = json.loads(originals['updates/latest.json'])
        if latest['version'] != '4.0.16':
            raise RuntimeError('A newer release may have been published')
        latest['platforms']['windows-x86_64']['url'] = GITHUB + 'LoliCode-4.0.16-Windows-x64-Setup.exe'
        latest['downloads']['windows-x86_64-portable']['url'] = GITHUB + 'LoliCode-Portable.zip'
        content['updates/latest.json'] = (json.dumps(latest, ensure_ascii=False, indent=2) + '\n').encode()
        BACKUP.mkdir(parents=True, mode=0o700)
        os.chmod(BACKUP, 0o700)
        for name, data in originals.items():
            (BACKUP / name.replace('/', '__')).write_bytes(data)
        # Publish the compatible JS and page before changing either download URL.
        for name in ['assets/downloads.js', 'index.html', 'updates/latest.json']:
            target = ROOT / name
            if sha(plain(target)) != BASELINES[name]:
                raise RuntimeError('Concurrent website edit detected; preserving current file')
            info = target.stat()
            atomic(target, content[name], (info.st_uid, info.st_gid), stat.S_IMODE(info.st_mode))
        print(json.dumps({'state': 'published', 'version': latest['version'], 'files': {name: sha(data) for name, data in content.items()}, 'downloads': 'public-github-releases'}))
    finally:
        if owner.exists() and plain(owner).decode() == owner_id:
            owner.unlink()
            lock.rmdir()


if __name__ == '__main__':
    main()
