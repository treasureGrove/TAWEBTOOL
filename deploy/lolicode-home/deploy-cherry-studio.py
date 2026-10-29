#!/usr/bin/env python3
"""Publish only the reviewed Cherry Studio static page; retain current feeds.

Preview uses the existing test vhost temporarily. Production switches only the
two static paths in the current homepage snippet, preserving all download routes.
Every replacement checks its recorded baseline and retains a private backup.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import uuid

BATCH = '20261020-cherry-studio-v1'
PAYLOAD = Path('/root/lolicode-' + BATCH)
SITE = Path('/var/www/lolicode-site/releases') / BATCH
MAIN = Path('/etc/nginx/sites-available/lolicode.conf')
MAIN_SHA = '819dfde97b2533df4dd1dd5f7838cf371199a38b687a813dfdbc82657280bd75'
SNIPPET = Path('/etc/nginx/snippets/lolicode-home-production-20261016-home-v3.conf')
SNIPPET_SHA = 'cc1781a4010919fdc0245e86d319040b4edbba2a3d4d6e5a3bfbf557a79540a8'
OLD_SITE = '/var/www/lolicode-site/releases/20261018-release-notes-v1'
TEST = Path('/etc/nginx/sites-available/test.conf')
TEST_SHA = '23781dc75433dbff6011bd380dd53a4588f42df17b6466a44549d5fef8079485'
PREVIEW = Path('/etc/nginx/snippets/lolicode-cherry-preview-20261020.conf')
TOOLS = Path('/www/wwwroot/tools.treasuregrove.art/lolicode')
TOOLS_SHA = {
    'index.html': '389f13102bad95da59ce76e0dcba7318d3e387bf3d5943095e845305e32d175a',
    'assets/site.css': 'fba731b20911434dcea89479efe653949f1a10c769984ae9caf59a4627698174',
    'assets/motion.js': '3f2e9a191f252b1cee0a6a16a1216e472252c12a2015866ed60852ff10d05ea3',
}
DOWNLOADS_SHA = '4466ca7770d15a3a02107da726497da5261ab826a2636280face74c331abaa10'
FEED_SHA = 'e04e3a488bc0c91632b35302f26ae33693163b7e9512131a7a4568b1b7113059'
NEW_ASSETS = {'companion.webp', 'atelier-room.webp', 'brooch.webp', 'workbench-cream.jpg', 'channels-light.jpg'}
HOME_ASSETS = NEW_ASSETS | {'site.css', 'motion.js', 'downloads.js', 'logo.svg', 'maid.png', 'workbench.jpg', 'discovery-v1.json', 'rankings/artificial-analysis-81519b0e6c2c.jpg', 'rankings/livebench-a818b4666b9b.jpg', 'rankings/aider-fd3770d0718d.jpg'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def plain(path):
    if not stat.S_ISREG(path.lstat().st_mode):
        raise RuntimeError('Expected a plain file: ' + str(path))
    return path.read_bytes()


def checked(path, expected):
    data = plain(path)
    if sha(data) != expected:
        raise RuntimeError('Concurrent change; baseline differs: ' + str(path))
    return data


def directory(path, mode=0o755):
    if path.is_symlink():
        raise RuntimeError('Symlink directory: ' + str(path))
    if path.exists():
        if not path.is_dir():
            raise RuntimeError('Not a directory: ' + str(path))
    else:
        path.mkdir(mode=mode)
        path.chmod(mode)


def atomic(path, data, mode=0o644):
    temporary = path.with_name(path.name + '.' + str(uuid.uuid4()) + '.tmp')
    try:
        with temporary.open('xb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.chmod(mode)
        os.replace(temporary, path)
        fd = os.open(path.parent, os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    finally:
        if temporary.exists():
            temporary.unlink()


def immutable(path, data, mode=0o644):
    if path.exists() or path.is_symlink():
        if plain(path) != data:
            raise RuntimeError('Immutable file differs: ' + str(path))
    else:
        atomic(path, data, mode)


def content(kind):
    manifest = json.loads(plain(PAYLOAD / 'manifest.json'))
    expected = ({'index.html'} | {'desktop-assets/' + name for name in HOME_ASSETS}) if kind == 'home' else (set(TOOLS_SHA) | {'assets/' + name for name in NEW_ASSETS})
    if set(manifest) != {'home', 'tools'} or set(manifest[kind]) != expected:
        raise RuntimeError('Unexpected static payload file list')
    return {name: checked(PAYLOAD / kind / name, digest) for name, digest in manifest[kind].items()}


def prepare():
    files = content('home')
    if sha(files['desktop-assets/downloads.js']) != DOWNLOADS_SHA:
        raise RuntimeError('Existing deployed download logic must be retained')
    for folder in [SITE, SITE / 'desktop-assets', SITE / 'desktop-assets/rankings']:
        directory(folder)
    for name, data in files.items():
        immutable(SITE / name, data)


def reload_nginx():
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)


def replace_config(path, original, updated, backup_name):
    immutable(PAYLOAD / (backup_name + '.before'), original, 0o600)
    immutable(PAYLOAD / (backup_name + '.after'), updated, 0o600)
    if plain(path) != original:
        raise RuntimeError('Concurrent configuration change')
    mode = stat.S_IMODE(path.stat().st_mode)
    atomic(path, updated, mode)
    try:
        reload_nginx()
    except Exception:
        if plain(path) != updated:
            raise RuntimeError('Concurrent configuration edit; backup retained')
        atomic(path, original, mode)
        reload_nginx()
        raise


def preview():
    checked(MAIN, MAIN_SHA)
    original = checked(TEST, TEST_SHA)
    production = checked(SNIPPET, SNIPPET_SHA).decode()
    prepare()
    static = production.split('# Public, fixed upstream only.')[0].replace(OLD_SITE, str(SITE))
    if static.count(str(SITE)) != 2:
        raise RuntimeError('Unexpected homepage snippet')
    static += '''
location = /downloads/updates/latest.json {
    proxy_pass https://tools.treasuregrove.art/lolicode/updates/latest.json;
    include /etc/nginx/snippets/lolicode-download-transport.conf;
    add_header Cache-Control "no-store" always;
    add_header X-Robots-Tag "noindex, nofollow" always;
}
'''
    static = static.replace('add_header X-Content-Type-Options nosniff always;', 'add_header X-Content-Type-Options nosniff always;\n    add_header X-Robots-Tag "noindex, nofollow" always;')
    immutable(PREVIEW, static.encode())
    anchor = b'    include /etc/nginx/snippets/forum-test-noindex-locations.conf;'
    if original.count(anchor) != 1:
        raise RuntimeError('Ambiguous preview insertion point')
    updated = original.replace(anchor, ('    include ' + str(PREVIEW) + ';\n\n').encode() + anchor)
    replace_config(TEST, original, updated, 'preview-config')
    print(json.dumps({'state': 'preview', 'url': 'https://test.lolicode.com/', 'testConfigSHA256': sha(updated)}))


def restore_preview():
    original = checked(PAYLOAD / 'preview-config.before', TEST_SHA)
    updated = plain(PAYLOAD / 'preview-config.after')
    if plain(TEST) == original:
        print(json.dumps({'state': 'preview-already-restored'}))
        return
    checked(TEST, sha(updated))
    atomic(TEST, original, stat.S_IMODE(TEST.stat().st_mode))
    reload_nginx()
    print(json.dumps({'state': 'preview-restored', 'testConfigSHA256': sha(plain(TEST))}))


def production():
    checked(MAIN, MAIN_SHA)
    checked(TEST, TEST_SHA)
    original = checked(SNIPPET, SNIPPET_SHA)
    if original.decode().count(OLD_SITE) != 2:
        raise RuntimeError('Unexpected production static paths')
    # A receipt is created only after browser validation of this exact manifest.
    verified = json.loads(plain(PAYLOAD / 'preview-verified.json'))
    if verified != {'passed': True, 'manifestSHA256': sha(plain(PAYLOAD / 'manifest.json'))}:
        raise RuntimeError('This payload has not passed preview validation')
    checked(Path(OLD_SITE) / 'desktop-assets/downloads.js', DOWNLOADS_SHA)
    prepare()
    updated = original.decode().replace(OLD_SITE, str(SITE)).encode()
    replace_config(SNIPPET, original, updated, 'production-snippet')
    print(json.dumps({'state': 'published', 'site': str(SITE), 'snippetSHA256': sha(updated), 'mainConfigSHA256': sha(plain(MAIN))}))


def restore_production():
    checked(MAIN, MAIN_SHA)
    original = checked(PAYLOAD / 'production-snippet.before', SNIPPET_SHA)
    installed = plain(PAYLOAD / 'production-snippet.after')
    if plain(SNIPPET) != original:
        checked(SNIPPET, sha(installed))
        atomic(SNIPPET, original, stat.S_IMODE(SNIPPET.stat().st_mode))
        reload_nginx()
    print(json.dumps({'state': 'production-restored', 'snippetSHA256': sha(plain(SNIPPET))}))


def tools():
    files = content('tools')
    checked(TOOLS / 'updates/latest.json', FEED_SHA)
    checked(TOOLS / 'assets/downloads.js', DOWNLOADS_SHA)
    lock = TOOLS / '.publish-lock'
    lock.mkdir(mode=0o700)
    written = []
    originals = {}
    try:
        for name, digest in TOOLS_SHA.items():
            originals[name] = checked(TOOLS / name, digest)
        for name in NEW_ASSETS:
            target = TOOLS / 'assets' / name
            if target.exists() or target.is_symlink():
                if plain(target) != files['assets/' + name]:
                    raise RuntimeError('New asset name already exists with different bytes')
        backup = PAYLOAD / 'tools-before'
        directory(backup, 0o700)
        for name, data in originals.items():
            immutable(backup / name.replace('/', '__'), data, 0o600)
        for name in sorted(NEW_ASSETS):
            immutable(TOOLS / 'assets' / name, files['assets/' + name])
        for name in ['assets/site.css', 'assets/motion.js', 'index.html']:
            if plain(TOOLS / name) != originals[name]:
                raise RuntimeError('Concurrent tools website edit')
            atomic(TOOLS / name, files[name])
            written.append(name)
        checked(TOOLS / 'updates/latest.json', FEED_SHA)
        checked(TOOLS / 'assets/downloads.js', DOWNLOADS_SHA)
    except Exception:
        for name in reversed(written):
            if plain(TOOLS / name) != files[name]:
                raise RuntimeError('Concurrent edit; retained backups without blind rollback')
            atomic(TOOLS / name, originals[name])
        raise
    finally:
        lock.rmdir()
    print(json.dumps({'state': 'published', 'files': {name: sha(data) for name, data in files.items()}, 'feedSHA256': FEED_SHA}))


if __name__ == '__main__':
    actions = {'preview': preview, 'restore-preview': restore_preview, 'production': production, 'restore-production': restore_production, 'tools': tools}
    if os.geteuid() != 0 or len(sys.argv) != 2 or sys.argv[1] not in actions:
        raise RuntimeError('Expected preview, restore-preview, production or tools on its reviewed host')
    with open('/run/lock/lolicode-forum-maintenance.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if Path('/var/www/ops/MAINTENANCE_ON').exists():
            raise RuntimeError('Existing maintenance mode left unchanged')
        actions[sys.argv[1]]()
