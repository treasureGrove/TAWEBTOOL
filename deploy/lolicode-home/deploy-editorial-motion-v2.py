#!/usr/bin/env python3
"""Fixed static polish batch. Only two file contents change on each site.

Production changes only the exact-home root and desktop-assets alias paths.
All later sitemap/favicon/SEO/download blocks remain byte-for-byte unchanged.
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
from urllib.request import urlopen

BATCH = '20261020-editorial-motion-v2'
MAIN_SHA = '819dfde97b2533df4dd1dd5f7838cf371199a38b687a813dfdbc82657280bd75'
SNIPPET_SHA = '66fef3485917706b0b2c84b915eacae4b0e4544e89f8e9d7b90538764a80a06a'
OLD_SITE = '/var/www/lolicode-site/releases/20261020-editorial-motion-v1'
TEST_SHA = '23781dc75433dbff6011bd380dd53a4588f42df17b6466a44549d5fef8079485'
HOME_BASE_SHA = {'desktop-assets/apple-touch-icon.png': 'f9cf0c4a0fbe66c00d543612d2ad20df0500b0ff8074a768c5996e1dcb89f2cc',
 'desktop-assets/atelier-room.webp': '2058e4de2f45617eac9a830f2ff21bd0dcae60e0ae0a2011c906857e5a775f36',
 'desktop-assets/brooch.webp': '143d33374528c06e7b8c9f245ce20cebcc03db0901ca4fed3cc9361a7ea1b604',
 'desktop-assets/channels-light.jpg': 'ca5a854f95d395c8e0394ad557f5213dea0671522a7c8d7761f259aef19db163',
 'desktop-assets/companion.webp': 'c22070262de0607fc52d1a0440de42c6acd41a061c37cb68b5f4b0189b495f78',
 'desktop-assets/discovery-v1.json': '640eb752d40fe4a8d88ecdaefdb915dc4389c98ad51b3e68a5e8b828db32eb2d',
 'desktop-assets/downloads.js': '4466ca7770d15a3a02107da726497da5261ab826a2636280face74c331abaa10',
 'desktop-assets/favicon-16.png': 'a8229d301f1635015c0a5e6bf10e48fc992bf51b37bbdfdc6f7839450d8cdd20',
 'desktop-assets/favicon-32.png': 'c49f1bb6fc62e9e1daa7e25c6b8aa3d10bd68a3b7853f12be2222a81528e641e',
 'desktop-assets/favicon-48.png': 'e330f10149f12b2f2c9bbba4fb228e5c2e8e146ceb793015538406e8ff050ca3',
 'desktop-assets/favicon.ico': '59378c8e1068b3349734444a0037c836cde082c3db4f168b88cdd5e05a007538',
 'desktop-assets/logo.svg': '010541bf8e14e3a14dd68c3bf7a18daa137ce24cf5519d75fba9832618d070b0',
 'desktop-assets/lolicode-tour.mp4': '5de623d629e23c3ed502b9990875c81a4df340614acc47d412bb1b1a2763ceba',
 'desktop-assets/maid.png': '57df11bc05392e3c73b4bdab1e1112dc85323c9836109032bd81e5db45d774de',
 'desktop-assets/motion.js': '6e93ac782670e2d8f5c14f8d9b44820c9bb8d34c721edd0f9c5efa0aeb3600cf',
 'desktop-assets/rankings/aider-fd3770d0718d.jpg': 'fd3770d0718dd0a4d321abb58be1efd48927248f63ea577f79d3e3e6b45af232',
 'desktop-assets/rankings/artificial-analysis-81519b0e6c2c.jpg': '81519b0e6c2ce04ae4cc965a646a905668d37ed712105a0a9e42ccd3d86de703',
 'desktop-assets/rankings/livebench-a818b4666b9b.jpg': 'a818b4666b9b90bff7395d1bf8ae9d11cd3b4d12db206a5b42d7729d8e802ae2',
 'desktop-assets/site-icon-192.png': 'd61be5f0e91ea35bf2b1626cc646da4d03351727d048dc08971ac9e672c74249',
 'desktop-assets/site-icon-512.png': 'c7396fd91efb772cf23a6832206d401b1707fa69abe5e5cfae7ac736a502bbb1',
 'desktop-assets/site-icon.png': 'c7396fd91efb772cf23a6832206d401b1707fa69abe5e5cfae7ac736a502bbb1',
 'desktop-assets/site.css': '94656181e3021acf067d89d7e493ad3e34166f6af148630dcadf4bbdf7b879d4',
 'desktop-assets/tour-poster.webp': 'bf13790f4ef5c9f6897c5ceea1e4bb68d07f84cdf54c1a25f956a1d7d9fef887',
 'desktop-assets/workbench-cream.jpg': 'acdafe8f739222a2cfa947e3a779c141d8edfcf93e3a3db5056ac3737ab52443',
 'desktop-assets/workbench.jpg': '9ca71515c562cffde6a52ec2d51485c9ee70eb8c4dfd7adf3d00976ead51043d',
 'index.html': '02b55167e23198aa0e848d43d0af47dbaaa7ec2ad8a3ee01db2f40b3b46275ba',
 'sitemap-desktop.xml': 'aebb12679120060af83192ebf9d20d6438bada0bab0237f907a75c8cec5c773a'}
HOME_RETAIN_SHA = {'desktop-assets/apple-touch-icon.png': 'f9cf0c4a0fbe66c00d543612d2ad20df0500b0ff8074a768c5996e1dcb89f2cc',
 'desktop-assets/atelier-room.webp': '2058e4de2f45617eac9a830f2ff21bd0dcae60e0ae0a2011c906857e5a775f36',
 'desktop-assets/brooch.webp': '143d33374528c06e7b8c9f245ce20cebcc03db0901ca4fed3cc9361a7ea1b604',
 'desktop-assets/channels-light.jpg': 'ca5a854f95d395c8e0394ad557f5213dea0671522a7c8d7761f259aef19db163',
 'desktop-assets/companion.webp': 'c22070262de0607fc52d1a0440de42c6acd41a061c37cb68b5f4b0189b495f78',
 'desktop-assets/discovery-v1.json': '640eb752d40fe4a8d88ecdaefdb915dc4389c98ad51b3e68a5e8b828db32eb2d',
 'desktop-assets/downloads.js': '4466ca7770d15a3a02107da726497da5261ab826a2636280face74c331abaa10',
 'desktop-assets/favicon-16.png': 'a8229d301f1635015c0a5e6bf10e48fc992bf51b37bbdfdc6f7839450d8cdd20',
 'desktop-assets/favicon-32.png': 'c49f1bb6fc62e9e1daa7e25c6b8aa3d10bd68a3b7853f12be2222a81528e641e',
 'desktop-assets/favicon-48.png': 'e330f10149f12b2f2c9bbba4fb228e5c2e8e146ceb793015538406e8ff050ca3',
 'desktop-assets/favicon.ico': '59378c8e1068b3349734444a0037c836cde082c3db4f168b88cdd5e05a007538',
 'desktop-assets/logo.svg': '010541bf8e14e3a14dd68c3bf7a18daa137ce24cf5519d75fba9832618d070b0',
 'desktop-assets/lolicode-tour.mp4': '5de623d629e23c3ed502b9990875c81a4df340614acc47d412bb1b1a2763ceba',
 'desktop-assets/maid.png': '57df11bc05392e3c73b4bdab1e1112dc85323c9836109032bd81e5db45d774de',
 'desktop-assets/motion.js': '6e93ac782670e2d8f5c14f8d9b44820c9bb8d34c721edd0f9c5efa0aeb3600cf',
 'desktop-assets/rankings/aider-fd3770d0718d.jpg': 'fd3770d0718dd0a4d321abb58be1efd48927248f63ea577f79d3e3e6b45af232',
 'desktop-assets/rankings/artificial-analysis-81519b0e6c2c.jpg': '81519b0e6c2ce04ae4cc965a646a905668d37ed712105a0a9e42ccd3d86de703',
 'desktop-assets/rankings/livebench-a818b4666b9b.jpg': 'a818b4666b9b90bff7395d1bf8ae9d11cd3b4d12db206a5b42d7729d8e802ae2',
 'desktop-assets/site-icon-192.png': 'd61be5f0e91ea35bf2b1626cc646da4d03351727d048dc08971ac9e672c74249',
 'desktop-assets/site-icon-512.png': 'c7396fd91efb772cf23a6832206d401b1707fa69abe5e5cfae7ac736a502bbb1',
 'desktop-assets/site-icon.png': 'c7396fd91efb772cf23a6832206d401b1707fa69abe5e5cfae7ac736a502bbb1',
 'desktop-assets/tour-poster.webp': 'bf13790f4ef5c9f6897c5ceea1e4bb68d07f84cdf54c1a25f956a1d7d9fef887',
 'desktop-assets/workbench-cream.jpg': 'acdafe8f739222a2cfa947e3a779c141d8edfcf93e3a3db5056ac3737ab52443',
 'desktop-assets/workbench.jpg': '9ca71515c562cffde6a52ec2d51485c9ee70eb8c4dfd7adf3d00976ead51043d',
 'sitemap-desktop.xml': 'aebb12679120060af83192ebf9d20d6438bada0bab0237f907a75c8cec5c773a'}
TOOLS_SHA = {'assets/site.css': '94656181e3021acf067d89d7e493ad3e34166f6af148630dcadf4bbdf7b879d4',
 'index.html': '2af8da4b5e7a6de618a9258e4ff6bed5cea1cc6b661a800193b6c28fbd926b3d'}
TOOLS_RETAIN_SHA = {'assets/apple-touch-icon.png': 'f9cf0c4a0fbe66c00d543612d2ad20df0500b0ff8074a768c5996e1dcb89f2cc',
 'assets/atelier-room.webp': '2058e4de2f45617eac9a830f2ff21bd0dcae60e0ae0a2011c906857e5a775f36',
 'assets/brooch.webp': '143d33374528c06e7b8c9f245ce20cebcc03db0901ca4fed3cc9361a7ea1b604',
 'assets/channels-light.jpg': 'ca5a854f95d395c8e0394ad557f5213dea0671522a7c8d7761f259aef19db163',
 'assets/companion.webp': 'c22070262de0607fc52d1a0440de42c6acd41a061c37cb68b5f4b0189b495f78',
 'assets/discovery-v1.json': '1c6c928d61f372778c851158c470815484681b634063084139bbcbb0c1e3d54a',
 'assets/downloads.js': '4466ca7770d15a3a02107da726497da5261ab826a2636280face74c331abaa10',
 'assets/favicon-16.png': 'a8229d301f1635015c0a5e6bf10e48fc992bf51b37bbdfdc6f7839450d8cdd20',
 'assets/favicon-32.png': 'c49f1bb6fc62e9e1daa7e25c6b8aa3d10bd68a3b7853f12be2222a81528e641e',
 'assets/favicon-48.png': 'e330f10149f12b2f2c9bbba4fb228e5c2e8e146ceb793015538406e8ff050ca3',
 'assets/favicon.ico': '59378c8e1068b3349734444a0037c836cde082c3db4f168b88cdd5e05a007538',
 'assets/logo.svg': '010541bf8e14e3a14dd68c3bf7a18daa137ce24cf5519d75fba9832618d070b0',
 'assets/lolicode-tour.mp4': '5de623d629e23c3ed502b9990875c81a4df340614acc47d412bb1b1a2763ceba',
 'assets/maid.png': '57df11bc05392e3c73b4bdab1e1112dc85323c9836109032bd81e5db45d774de',
 'assets/motion.js': '6e93ac782670e2d8f5c14f8d9b44820c9bb8d34c721edd0f9c5efa0aeb3600cf',
 'assets/rankings/aider-fd3770d0718d.jpg': 'fd3770d0718dd0a4d321abb58be1efd48927248f63ea577f79d3e3e6b45af232',
 'assets/rankings/artificial-analysis-81519b0e6c2c.jpg': '81519b0e6c2ce04ae4cc965a646a905668d37ed712105a0a9e42ccd3d86de703',
 'assets/rankings/livebench-a818b4666b9b.jpg': 'a818b4666b9b90bff7395d1bf8ae9d11cd3b4d12db206a5b42d7729d8e802ae2',
 'assets/site-icon-192.png': 'd61be5f0e91ea35bf2b1626cc646da4d03351727d048dc08971ac9e672c74249',
 'assets/site-icon-512.png': 'c7396fd91efb772cf23a6832206d401b1707fa69abe5e5cfae7ac736a502bbb1',
 'assets/site-icon.png': 'c7396fd91efb772cf23a6832206d401b1707fa69abe5e5cfae7ac736a502bbb1',
 'assets/tour-poster.webp': 'bf13790f4ef5c9f6897c5ceea1e4bb68d07f84cdf54c1a25f956a1d7d9fef887',
 'assets/workbench-cream.jpg': 'acdafe8f739222a2cfa947e3a779c141d8edfcf93e3a3db5056ac3737ab52443',
 'assets/workbench.jpg': '9ca71515c562cffde6a52ec2d51485c9ee70eb8c4dfd7adf3d00976ead51043d',
 'sitemap-desktop.xml': 'aebb12679120060af83192ebf9d20d6438bada0bab0237f907a75c8cec5c773a',
 'updates/latest.json': '1a57ce7c52d8185c9bb878df311ad158e4144480b2bac6032289ad687409159e'}
NEW_TOOLS_FILES = set()
DOWNLOADS_SHA = '4466ca7770d15a3a02107da726497da5261ab826a2636280face74c331abaa10'
FEED_SHA = '1a57ce7c52d8185c9bb878df311ad158e4144480b2bac6032289ad687409159e'
ROUTE_DEPENDENCIES_SHA = {'/etc/nginx/snippets/forum-test-noindex-locations.conf': '0ff53df2d3cfd6d3a339f43f470ee631d3f9d64f72cdd9977db6d7ed5d8ed006',
 '/etc/nginx/snippets/lolicode-download-transport.conf': '7f25deeefd9ba4ba69dffa1974dca454262a22da4069a45935a02a0db8f57a99',
 '/var/www/forum/.nginx.conf': '2cccc136040476deed8aa9d00e26ccca4a3a02ab95e68943fb763d820a54187a'}
EXPECTED_CSP = ("default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; "
 "connect-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'")

PAYLOAD = Path('/root/lolicode-' + BATCH)
SITE = Path('/var/www/lolicode-site/releases') / BATCH
MAIN = Path('/etc/nginx/sites-available/lolicode.conf')
SNIPPET = Path('/etc/nginx/snippets/lolicode-home-production-20261016-home-v3.conf')
TEST = Path('/etc/nginx/sites-available/test.conf')
PREVIEW = Path('/etc/nginx/snippets/lolicode-editorial-motion-v2-preview-20261020.conf')
TOOLS = Path('/www/wwwroot/tools.treasuregrove.art/lolicode')

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
        for name in sorted(TOOLS_SHA):
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
    """Restore this batch's changed website files from checked private backups."""
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
        for name in sorted(TOOLS_SHA):
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


def content(kind):
    manifest = json.loads(plain(PAYLOAD / 'manifest.json'))
    expected = {'home': set(HOME_BASE_SHA), 'tools': set(TOOLS_SHA)}
    if set(manifest) != set(expected) or any(set(manifest[key]) != names for key, names in expected.items()):
        raise RuntimeError('Unexpected payload file list')
    if kind not in expected:
        raise RuntimeError('Unexpected payload kind')
    files = {name: checked(PAYLOAD / kind / name, digest) for name, digest in manifest[kind].items()}
    if kind == 'home':
        for name, digest in HOME_RETAIN_SHA.items():
            if sha(files[name]) != digest:
                raise RuntimeError('Unrelated homepage file differs: ' + name)
    return files


def check_feed():
    with urlopen('https://tools.treasuregrove.art/lolicode/updates/latest.json', timeout=20) as response:
        data = response.read(65537)
        if response.status != 200 or len(data) > 65536 or sha(data) != FEED_SHA:
            raise RuntimeError('Published release feed baseline changed')
    feed = json.loads(data)
    if feed.get('productVersion') != '1.0.1' or feed.get('version') != '4.1.1':
        raise RuntimeError('Unexpected published release version')


def prepare():
    files = content('home')
    for name, digest in HOME_BASE_SHA.items():
        checked(Path(OLD_SITE) / name, digest)
    for folder in [SITE, SITE / 'desktop-assets', SITE / 'desktop-assets/rankings']:
        directory(folder)
    for name, data in files.items():
        immutable(SITE / name, data)


def updated_snippet(original):
    boundary = b'\nlocation = /sitemap-desktop.xml {'
    if original.count(boundary) != 1:
        raise RuntimeError('Unexpected static block boundary')
    prefix, suffix = original.split(boundary, 1)
    old = OLD_SITE.encode()
    new = SITE.as_posix().encode()
    if prefix.count(old) != 2 or suffix.count(old) != 0 or original.count(EXPECTED_CSP.encode()) != 1:
        raise RuntimeError('Unexpected current static paths or CSP')
    root = b'location = / {\n    root ' + old + b';'
    assets = b'location ^~ /desktop-assets/ {\n    alias ' + old + b'/desktop-assets/;'
    if prefix.count(root) != 1 or prefix.count(assets) != 1:
        raise RuntimeError('Expected exact homepage root and assets alias')
    updated_prefix = prefix.replace(root, root.replace(old, new)).replace(assets, assets.replace(old, new))
    if updated_prefix.replace(new, old) != prefix:
        raise RuntimeError('Unexpected configuration diff')
    return updated_prefix + boundary + suffix


def preview():
    checked(MAIN, MAIN_SHA)
    check_route_dependencies()
    check_feed()
    original = checked(TEST, TEST_SHA)
    production = updated_snippet(checked(SNIPPET, SNIPPET_SHA)).decode()
    prepare()
    marker = '# Public, fixed upstream only.'
    if production.count(marker) != 1:
        raise RuntimeError('Unexpected download route boundary')
    static = production.split(marker)[0]
    if static.count(SITE.as_posix()) != 2 or static.count(OLD_SITE) != 0:
        raise RuntimeError('Unexpected preview release paths')
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
    print(json.dumps({'state':'preview','url':'https://test.lolicode.com/','testConfigSHA256':sha(updated)}))


def production():
    checked(MAIN, MAIN_SHA)
    check_route_dependencies()
    checked(TEST, TEST_SHA)
    check_feed()
    original = checked(SNIPPET, SNIPPET_SHA)
    verified = json.loads(plain(PAYLOAD / 'preview-verified.json'))
    if verified != {'passed': True, 'manifestSHA256': sha(plain(PAYLOAD / 'manifest.json'))}:
        raise RuntimeError('This payload has not passed preview validation')
    prepare()
    updated = updated_snippet(original)
    replace_config(SNIPPET, original, updated, 'production-snippet')
    print(json.dumps({'state':'published','site':SITE.as_posix(),'snippetSHA256':sha(updated),'mainConfigSHA256':sha(plain(MAIN))}))


if __name__ == '__main__':
    actions = {'preview':preview,'restore-preview':restore_preview,'production':production,
               'restore-production':restore_production,'tools':tools,'restore-tools':restore_tools}
    if os.geteuid() != 0 or len(sys.argv) != 2 or sys.argv[1] not in actions:
        raise RuntimeError('Expected an explicit fixed-batch deployment or rollback action')
    with open('/run/lock/lolicode-forum-maintenance.lock','a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if Path('/var/www/ops/MAINTENANCE_ON').exists():
            raise RuntimeError('Existing maintenance mode left unchanged')
        actions[sys.argv[1]]()
