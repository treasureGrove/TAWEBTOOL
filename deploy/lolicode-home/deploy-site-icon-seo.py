#!/usr/bin/env python3
"""Publish the reviewed site icon and search verification HTML; retain feeds.

Preview uses the existing test vhost temporarily. Production switches only the
two static paths and adds exact icon/sitemap routes, preserving download routes and CSP.
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

BATCH = '20261020-site-icon-seo-v1'
PAYLOAD = Path('/root/lolicode-' + BATCH)
SITE = Path('/var/www/lolicode-site/releases') / BATCH
MAIN = Path('/etc/nginx/sites-available/lolicode.conf')
MAIN_SHA = '819dfde97b2533df4dd1dd5f7838cf371199a38b687a813dfdbc82657280bd75'
SNIPPET = Path('/etc/nginx/snippets/lolicode-home-production-20261016-home-v3.conf')
SNIPPET_SHA = 'e66cd95c9591ce509dba748aaf0d66b3b62ca5106898a2b5b36f1f855de0ae67'
OLD_SITE = '/var/www/lolicode-site/releases/20261020-lovely-studio-v2'
TEST = Path('/etc/nginx/sites-available/test.conf')
TEST_SHA = '23781dc75433dbff6011bd380dd53a4588f42df17b6466a44549d5fef8079485'
PREVIEW = Path('/etc/nginx/snippets/lolicode-site-icon-preview-20261020.conf')
TOOLS = Path('/www/wwwroot/tools.treasuregrove.art/lolicode')
TOOLS_SHA = {'index.html': 'ff9a7443e542273a45aeabdae294f20f6a55a34eb4180dc0eea6d057259f9f09'}
DOWNLOADS_SHA = '4466ca7770d15a3a02107da726497da5261ab826a2636280face74c331abaa10'
FEED_SHA = 'e04e3a488bc0c91632b35302f26ae33693163b7e9512131a7a4568b1b7113059'
NEW_ASSETS = {'apple-touch-icon.png',
 'favicon-16.png',
 'favicon-32.png',
 'favicon-48.png',
 'favicon.ico',
 'site-icon-192.png',
 'site-icon-512.png',
 'site-icon.png'}
HOME_RETAIN_SHA = {'atelier-room.webp': '2058e4de2f45617eac9a830f2ff21bd0dcae60e0ae0a2011c906857e5a775f36',
 'brooch.webp': '143d33374528c06e7b8c9f245ce20cebcc03db0901ca4fed3cc9361a7ea1b604',
 'channels-light.jpg': 'ca5a854f95d395c8e0394ad557f5213dea0671522a7c8d7761f259aef19db163',
 'companion.webp': 'c22070262de0607fc52d1a0440de42c6acd41a061c37cb68b5f4b0189b495f78',
 'discovery-v1.json': '640eb752d40fe4a8d88ecdaefdb915dc4389c98ad51b3e68a5e8b828db32eb2d',
 'downloads.js': '4466ca7770d15a3a02107da726497da5261ab826a2636280face74c331abaa10',
 'logo.svg': '010541bf8e14e3a14dd68c3bf7a18daa137ce24cf5519d75fba9832618d070b0',
 'lolicode-tour.mp4': '5de623d629e23c3ed502b9990875c81a4df340614acc47d412bb1b1a2763ceba',
 'maid.png': '57df11bc05392e3c73b4bdab1e1112dc85323c9836109032bd81e5db45d774de',
 'motion.js': 'fc2a664d011875258706d8b23e5ae41bcb6816f38c0faa10d11f3ea372e987be',
 'rankings/aider-fd3770d0718d.jpg': 'fd3770d0718dd0a4d321abb58be1efd48927248f63ea577f79d3e3e6b45af232',
 'rankings/artificial-analysis-81519b0e6c2c.jpg': '81519b0e6c2ce04ae4cc965a646a905668d37ed712105a0a9e42ccd3d86de703',
 'rankings/livebench-a818b4666b9b.jpg': 'a818b4666b9b90bff7395d1bf8ae9d11cd3b4d12db206a5b42d7729d8e802ae2',
 'site.css': 'a7c19157cd9693c28200b011bad1988165c0045e6e343dad8f0cbf80705e9eb0',
 'tour-poster.webp': 'bf13790f4ef5c9f6897c5ceea1e4bb68d07f84cdf54c1a25f956a1d7d9fef887',
 'workbench-cream.jpg': 'acdafe8f739222a2cfa947e3a779c141d8edfcf93e3a3db5056ac3737ab52443',
 'workbench.jpg': '9ca71515c562cffde6a52ec2d51485c9ee70eb8c4dfd7adf3d00976ead51043d'}
HOME_ASSETS = set(HOME_RETAIN_SHA) | NEW_ASSETS
NEW_TOOLS_FILES = {'sitemap-desktop.xml'} | {'assets/' + name for name in NEW_ASSETS}
TOOLS_RETAIN_SHA = {'assets/' + name: digest for name, digest in HOME_RETAIN_SHA.items()}
TOOLS_RETAIN_SHA['assets/discovery-v1.json'] = '1c6c928d61f372778c851158c470815484681b634063084139bbcbb0c1e3d54a'
ROUTE_DEPENDENCIES_SHA = {
    '/var/www/forum/.nginx.conf': '2cccc136040476deed8aa9d00e26ccca4a3a02ab95e68943fb763d820a54187a',
    '/etc/nginx/snippets/forum-test-noindex-locations.conf': '0ff53df2d3cfd6d3a339f43f470ee631d3f9d64f72cdd9977db6d7ed5d8ed006',
}
EXPECTED_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'"



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
        'home': {'index.html', 'sitemap-desktop.xml'} | {'desktop-assets/' + name for name in HOME_ASSETS},
        'tools': set(TOOLS_SHA) | NEW_TOOLS_FILES,
    }
    if set(manifest) != set(expected) or any(set(manifest[key]) != names for key, names in expected.items()):
        raise RuntimeError('Unexpected static payload file list')
    if kind not in expected:
        raise RuntimeError('Unexpected payload kind')
    return {name: checked(PAYLOAD / kind / name, digest) for name, digest in manifest[kind].items()}


def prepare():
    files = content('home')
    for name, digest in HOME_RETAIN_SHA.items():
        if sha(files['desktop-assets/' + name]) != digest:
            raise RuntimeError('Existing homepage asset must be retained: ' + name)
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



def check_route_dependencies():
    for name, digest in ROUTE_DEPENDENCIES_SHA.items():
        checked(Path(name), digest)


def added_routes():
    return f'''location = /sitemap-desktop.xml {{
    root {SITE};
    try_files /sitemap-desktop.xml =404;
    types {{ }}
    default_type application/xml;
    add_header Cache-Control "public, max-age=3600" always;
    add_header X-Content-Type-Options nosniff always;
}}

location = /favicon.ico {{
    alias {SITE}/desktop-assets/favicon.ico;
    types {{ }}
    default_type image/x-icon;
    add_header Cache-Control "public, max-age=3600" always;
    add_header X-Content-Type-Options nosniff always;
}}

'''


def updated_snippet(original):
    """Change exactly two roots, then insert two new exact static locations."""
    text = original.decode('utf-8')
    marker = '# Public, fixed upstream only.'
    if text.count(OLD_SITE) != 2 or text.count(marker) != 1 or text.count(EXPECTED_CSP) != 1:
        raise RuntimeError('Unexpected static paths, download boundary, or CSP')
    if '/sitemap-desktop.xml' in text or '/favicon.ico' in text:
        raise RuntimeError('A sitemap or favicon route already exists')
    static, downloads = text.split(marker, 1)
    if static.count(OLD_SITE) != 2 or OLD_SITE in downloads:
        raise RuntimeError('Static release path occurs outside the static block')
    updated_static = static.replace(OLD_SITE, str(SITE)) + added_routes()
    updated = updated_static + marker + downloads
    restored = updated.replace(added_routes(), '', 1).replace(str(SITE), OLD_SITE)
    if restored != text or updated.count(EXPECTED_CSP) != 1:
        raise RuntimeError('Unexpected configuration diff')
    return updated.encode('utf-8')


def preview():
    checked(MAIN, MAIN_SHA)
    check_route_dependencies()
    original = checked(TEST, TEST_SHA)
    production = updated_snippet(checked(SNIPPET, SNIPPET_SHA)).decode()
    prepare()
    if production.count('# Public, fixed upstream only.') != 1:
        raise RuntimeError('Unexpected download route boundary')
    static = production.split('# Public, fixed upstream only.')[0]
    if static.count(str(SITE)) != 4:
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
    check_route_dependencies()
    checked(TEST, TEST_SHA)
    original = checked(SNIPPET, SNIPPET_SHA)
    if original.decode().count(OLD_SITE) != 2:
        raise RuntimeError('Unexpected production static paths')
    # A receipt is created only after browser validation of this exact manifest.
    verified = json.loads(plain(PAYLOAD / 'preview-verified.json'))
    if verified != {'passed': True, 'manifestSHA256': sha(plain(PAYLOAD / 'manifest.json'))}:
        raise RuntimeError('This payload has not passed preview validation')
    for name, digest in HOME_RETAIN_SHA.items():
        checked(Path(OLD_SITE) / 'desktop-assets' / name, digest)
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
    for name, digest in TOOLS_RETAIN_SHA.items():
        checked(TOOLS / name, digest)
    lock = TOOLS / '.publish-lock'
    lock.mkdir(mode=0o700)
    written = []
    originals = {}
    try:
        for name, digest in TOOLS_SHA.items():
            originals[name] = checked(TOOLS / name, digest)
        for name in NEW_TOOLS_FILES:
            target = TOOLS / name
            if target.exists() or target.is_symlink():
                if plain(target) != files[name]:
                    raise RuntimeError('New asset name already exists with different bytes')
        backup = PAYLOAD / 'tools-before'
        directory(backup, 0o700)
        for name, data in originals.items():
            immutable(backup / name.replace('/', '__'), data, 0o600)
        for name in sorted(NEW_TOOLS_FILES):
            immutable(TOOLS / name, files[name])
        for name in ['index.html']:
            if plain(TOOLS / name) != originals[name]:
                raise RuntimeError('Concurrent tools website edit')
            atomic(TOOLS / name, files[name])
            written.append(name)
        checked(TOOLS / 'updates/latest.json', FEED_SHA)
        for name, digest in TOOLS_RETAIN_SHA.items():
            checked(TOOLS / name, digest)
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
    """Restore this batch's entry HTML, retaining additive icon and sitemap files."""
    files = content('tools')
    checked(TOOLS / 'updates/latest.json', FEED_SHA)
    for name, digest in TOOLS_RETAIN_SHA.items():
        checked(TOOLS / name, digest)
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
        for name in ['index.html']:
            if plain(TOOLS / name) != installed[name]:
                raise RuntimeError('Concurrent tools website edit')
            if installed[name] != originals[name]:
                atomic(TOOLS / name, originals[name])
                restored.append(name)
        checked(TOOLS / 'updates/latest.json', FEED_SHA)
        for name, digest in TOOLS_RETAIN_SHA.items():
            checked(TOOLS / name, digest)
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
