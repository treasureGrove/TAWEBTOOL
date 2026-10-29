#!/usr/bin/env python3
"""Publish only the reviewed Lovely Studio static page and video; retain feeds.

Preview uses the existing test vhost temporarily. Production switches only the
two static paths and adds self-hosted media to the CSP, preserving download routes.
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

BATCH = '20261020-lovely-studio-v2'
PAYLOAD = Path('/root/lolicode-' + BATCH)
SITE = Path('/var/www/lolicode-site/releases') / BATCH
MAIN = Path('/etc/nginx/sites-available/lolicode.conf')
MAIN_SHA = '819dfde97b2533df4dd1dd5f7838cf371199a38b687a813dfdbc82657280bd75'
SNIPPET = Path('/etc/nginx/snippets/lolicode-home-production-20261016-home-v3.conf')
SNIPPET_SHA = '6131b2aa90dd66e2184efa52a2387ee39c754b0aad624024c47246231f76ca93'
OLD_SITE = '/var/www/lolicode-site/releases/20261020-cherry-studio-v1'
TEST = Path('/etc/nginx/sites-available/test.conf')
TEST_SHA = '23781dc75433dbff6011bd380dd53a4588f42df17b6466a44549d5fef8079485'
PREVIEW = Path('/etc/nginx/snippets/lolicode-lovely-preview-20261020.conf')
TOOLS = Path('/www/wwwroot/tools.treasuregrove.art/lolicode')
TOOLS_SHA = {
    'index.html': '47a742fb68e3fefb92078b6b2bd09468d59cf6ab6a47484c764f518d49a6cfda',
    'assets/site.css': '8fc82c4929dde55746fac52b3f9d14f1bb0763dbf2b95594b7e185ceac24e729',
    'assets/motion.js': 'ffda298c2ddec54773dd18d70e9ad4a8f53d98598f1a885835c0d8d5c65a4af4',
}
DOWNLOADS_SHA = '4466ca7770d15a3a02107da726497da5261ab826a2636280face74c331abaa10'
FEED_SHA = 'e04e3a488bc0c91632b35302f26ae33693163b7e9512131a7a4568b1b7113059'
NEW_ASSETS = {'lolicode-tour.mp4', 'tour-poster.webp'}
HOME_ASSETS = NEW_ASSETS | {'companion.webp', 'atelier-room.webp', 'brooch.webp', 'workbench-cream.jpg', 'channels-light.jpg', 'site.css', 'motion.js', 'downloads.js', 'logo.svg', 'maid.png', 'workbench.jpg', 'discovery-v1.json', 'rankings/artificial-analysis-81519b0e6c2c.jpg', 'rankings/livebench-a818b4666b9b.jpg', 'rankings/aider-fd3770d0718d.jpg'}


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
    expected = {
        'home': {'index.html'} | {'desktop-assets/' + name for name in HOME_ASSETS},
        'tools': set(TOOLS_SHA) | {'assets/' + name for name in NEW_ASSETS},
    }
    if set(manifest) != set(expected) or any(set(manifest[key]) != names for key, names in expected.items()):
        raise RuntimeError('Unexpected static payload file list')
    if kind not in expected:
        raise RuntimeError('Unexpected payload kind')
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



def updated_snippet(original):
    """Exactly two roots and one CSP directive may change in production."""
    text = original.decode('utf-8')
    anchor = "img-src 'self' data:; connect-src 'self';"
    if text.count(OLD_SITE) != 2 or text.count(anchor) != 1 or 'media-src' in text:
        raise RuntimeError('Unexpected static paths or existing media policy')
    updated = text.replace(OLD_SITE, str(SITE)).replace(
        anchor, "img-src 'self' data:; media-src 'self'; connect-src 'self';"
    )
    restored = updated.replace(str(SITE), OLD_SITE).replace("media-src 'self'; ", '')
    if restored != text:
        raise RuntimeError('Unexpected configuration diff')
    return updated.encode('utf-8')


def preview():
    checked(MAIN, MAIN_SHA)
    original = checked(TEST, TEST_SHA)
    production = updated_snippet(checked(SNIPPET, SNIPPET_SHA)).decode()
    prepare()
    if production.count('# Public, fixed upstream only.') != 1:
        raise RuntimeError('Unexpected download route boundary')
    static = production.split('# Public, fixed upstream only.')[0]
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
    updated = updated_snippet(original)
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


def restore_tools():
    """Restore this batch's three entry files, retaining additive video assets."""
    files = content('tools')
    checked(TOOLS / 'updates/latest.json', FEED_SHA)
    checked(TOOLS / 'assets/downloads.js', DOWNLOADS_SHA)
    lock = TOOLS / '.publish-lock'
    lock.mkdir(mode=0o700)
    originals = {}
    installed = {}
    restored = []
    try:
        for name, digest in TOOLS_SHA.items():
            originals[name] = checked(PAYLOAD / 'tools-before' / name.replace('/', '__'), digest)
            installed[name] = plain(TOOLS / name)
            if installed[name] not in (originals[name], files[name]):
                raise RuntimeError('Concurrent tools website edit; rollback stopped')
        for name in ['assets/site.css', 'assets/motion.js', 'index.html']:
            if plain(TOOLS / name) != installed[name]:
                raise RuntimeError('Concurrent tools website edit')
            if installed[name] != originals[name]:
                atomic(TOOLS / name, originals[name])
                restored.append(name)
        checked(TOOLS / 'updates/latest.json', FEED_SHA)
        checked(TOOLS / 'assets/downloads.js', DOWNLOADS_SHA)
    except Exception:
        for name in reversed(restored):
            if plain(TOOLS / name) != originals[name]:
                raise RuntimeError('Concurrent edit; retained backups without blind rollback')
            atomic(TOOLS / name, installed[name])
        raise
    finally:
        lock.rmdir()
    print(json.dumps({'state': 'tools-restored', 'files': TOOLS_SHA, 'feedSHA256': FEED_SHA}))


if __name__ == '__main__':
    actions = {'preview': preview, 'restore-preview': restore_preview, 'production': production, 'restore-production': restore_production, 'tools': tools, 'restore-tools': restore_tools}
    if os.geteuid() != 0 or len(sys.argv) != 2 or sys.argv[1] not in actions:
        raise RuntimeError('Expected preview, restore-preview, production, restore-production, tools or restore-tools on its reviewed host')
    with open('/run/lock/lolicode-forum-maintenance.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if Path('/var/www/ops/MAINTENANCE_ON').exists():
            raise RuntimeError('Existing maintenance mode left unchanged')
        actions[sys.argv[1]]()
