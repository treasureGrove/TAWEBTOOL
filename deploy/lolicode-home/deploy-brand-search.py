#!/usr/bin/env python3
"""Frozen homepage brand/search batch; preserves every other live asset and route.

Run on lolicode as root. Upload only manifest.json and home/{index.html,
sitemap-desktop.xml,robots.txt} under PAYLOAD, then preview, verify, restore-preview and
production. The preview gate binds approval evidence to the exact manifest.
"""
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import uuid
from urllib.request import urlopen

BATCH = '20261027-brand-search-v1'
MANIFEST_SHA = '3b3ce89292c3014c2f82bd0c7300ae30a0c269c9e5d556a2007642a642337688'
MAIN_SHA = 'e401097065f05e3a4e9a6b180b33dec514966bd3526e5c68fa322c8fd27a5949'
TEST_SHA = '23781dc75433dbff6011bd380dd53a4588f42df17b6466a44549d5fef8079485'
SNIPPET_SHA = 'f95d55e57825241d2f0a5f1b7fa0f3445cb1eb3df3eeec7b213877d918b6043d'
OLD_SITE = Path('/var/www/lolicode-site/releases/20261020-editorial-motion-v2')
OLD_SITEMAP_SITE = Path('/var/www/lolicode-site/releases/20261020-wine-icon-v2')
PAYLOAD = Path('/root/lolicode-' + BATCH)
SITE = Path('/var/www/lolicode-site/releases') / BATCH
MAIN = Path('/etc/nginx/sites-available/lolicode.conf')
TEST = Path('/etc/nginx/sites-available/test.conf')
SNIPPET = Path('/etc/nginx/snippets/lolicode-home-production-20261016-home-v3.conf')
PREVIEW = Path('/etc/nginx/snippets/lolicode-brand-search-preview-20261027.conf')
LOCK = Path('/run/lock/lolicode-forum-maintenance.lock')
CHANGED = {'index.html', 'sitemap-desktop.xml', 'robots.txt'}
ROBOTS_SHA = 'd9199bbfdcb32616211f7fa3752a5a2eb386f9a0e314a3dbed53f1e20dcb03b3'
ORIGINAL_ROBOTS = b'''User-agent: *
Disallow: /admin
Disallow: /admin/
Disallow: /api
Disallow: /api/
Disallow: /settings
Disallow: /notifications
Disallow: /login
Disallow: /logout
Disallow: /reset
Disallow: /confirm

Sitemap: https://lolicode.com/sitemap.xml
'''
EXPECTED_CSP = ("default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; "
                "connect-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'")
BASE_FILES = {
    'desktop-assets/apple-touch-icon.png': 'f9cf0c4a0fbe66c00d543612d2ad20df0500b0ff8074a768c5996e1dcb89f2cc',
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
    'desktop-assets/site.css': 'a72350d4466ec249ccc34c0e58f91bccd7e0fbe159632d800e97d3a64e0de4da',
    'desktop-assets/tour-poster.webp': 'bf13790f4ef5c9f6897c5ceea1e4bb68d07f84cdf54c1a25f956a1d7d9fef887',
    'desktop-assets/workbench-cream.jpg': 'acdafe8f739222a2cfa947e3a779c141d8edfcf93e3a3db5056ac3737ab52443',
    'desktop-assets/workbench.jpg': '9ca71515c562cffde6a52ec2d51485c9ee70eb8c4dfd7adf3d00976ead51043d',
    'index.html': '8285b428b37ff2670667d8ad9a36d1d654f69435340419f37a4c136cce736d5a',
    'sitemap-desktop.xml': 'aebb12679120060af83192ebf9d20d6438bada0bab0237f907a75c8cec5c773a',
}
DEPENDENCIES = {
    '/etc/nginx/snippets/forum-test-noindex-locations.conf': '0ff53df2d3cfd6d3a339f43f470ee631d3f9d64f72cdd9977db6d7ed5d8ed006',
    '/etc/nginx/snippets/lolicode-download-transport.conf': '7f25deeefd9ba4ba69dffa1974dca454262a22da4069a45935a02a0db8f57a99',
    '/var/www/forum/.nginx.conf': '2cccc136040476deed8aa9d00e26ccca4a3a02ab95e68943fb763d820a54187a',
    '/etc/nginx/snippets/lolicode-relay-location.conf': '893e57f30a2a49f5099fb4d80de7b1ee8f9a7a24a4fd39f9d888abda96f90dbf',
    '/etc/nginx/snippets/lolicode-companion.conf': '85b4a0d9ca7707b987ade30bf4b39fe552f6f2f8fa1619e01198d990f71ce39e',
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def plain(path):
    if not stat.S_ISREG(path.lstat().st_mode):
        raise RuntimeError('Expected plain file: ' + str(path))
    return path.read_bytes()


def checked(path, digest):
    data = plain(path)
    if sha(data) != digest:
        raise RuntimeError('Baseline or concurrent change: ' + str(path))
    return data


def directory(path, mode=0o755):
    if path.is_symlink():
        raise RuntimeError('Symlink directory: ' + str(path))
    if path.exists():
        if not path.is_dir():
            raise RuntimeError('Expected directory: ' + str(path))
    else:
        path.mkdir(mode=mode)
        path.chmod(mode)


def atomic(path, data, mode=0o644):
    if path.is_symlink():
        raise RuntimeError('Refusing symlink target: ' + str(path))
    temporary = path.with_name(path.name + '.' + str(uuid.uuid4()) + '.tmp')
    try:
        with temporary.open('xb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.chmod(mode)
        os.replace(temporary, path)
        if os.name != 'nt':
            descriptor = os.open(path.parent, os.O_DIRECTORY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
    finally:
        if temporary.exists():
            temporary.unlink()


def immutable(path, data, mode=0o644):
    if path.exists() or path.is_symlink():
        if plain(path) != data:
            raise RuntimeError('Immutable file differs: ' + str(path))
    else:
        atomic(path, data, mode)


def inventory(path):
    if path.is_symlink() or not path.is_dir():
        raise RuntimeError('Expected a real release directory: ' + str(path))
    result = set()
    for entry in path.rglob('*'):
        if entry.is_symlink():
            raise RuntimeError('Unexpected release symlink: ' + str(entry))
        if entry.is_file():
            result.add(entry.relative_to(path).as_posix())
        elif not entry.is_dir():
            raise RuntimeError('Unexpected release entry: ' + str(entry))
    return result


def payload():
    if len(MANIFEST_SHA) != 64:
        raise RuntimeError('Manifest digest must be frozen before deployment')
    manifest = json.loads(checked(PAYLOAD / 'manifest.json', MANIFEST_SHA))
    if set(manifest) != {'batch', 'files'} or manifest['batch'] != BATCH or set(manifest['files']) != CHANGED:
        raise RuntimeError('Unexpected payload schema/file list')
    files = {}
    for name, digest in manifest['files'].items():
        if not isinstance(digest, str) or len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest):
            raise RuntimeError('Invalid payload digest')
        files[name] = checked(PAYLOAD / 'home' / name, digest)
    if inventory(PAYLOAD / 'home') != CHANGED:
        raise RuntimeError('Unexpected payload contents')
    robots = files['robots.txt']
    if not robots.startswith(ORIGINAL_ROBOTS) or robots[len(ORIGINAL_ROBOTS):].strip() != b'Sitemap: https://lolicode.com/sitemap-desktop.xml':
        raise RuntimeError('Robots payload must preserve all original rules and append only the homepage sitemap')
    return files


def check_public_robots():
    with urlopen('https://lolicode.com/robots.txt', timeout=20) as response:
        data = response.read(131073)
        if response.status != 200 or response.url != 'https://lolicode.com/robots.txt' or len(data) > 131072 or sha(data) != ROBOTS_SHA:
            raise RuntimeError('Live robots baseline changed; preserve concurrent rules')


def robots_block():
    return ('location = /robots.txt {\n    root ' + SITE.as_posix() + ''';
    try_files /robots.txt =404;
    types { }
    default_type text/plain;
    add_header Cache-Control "public, max-age=3600" always;
    add_header X-Content-Type-Options nosniff always;
}

''').encode()


def environment():
    checked(MAIN, MAIN_SHA)
    for name, digest in DEPENDENCIES.items():
        checked(Path(name), digest)
    if Path('/var/www/ops/MAINTENANCE_ON').exists():
        raise RuntimeError('Existing maintenance mode left unchanged')


def prepare():
    replacements = payload()
    if inventory(OLD_SITE) != set(BASE_FILES):
        raise RuntimeError('Live release inventory differs')
    files = {name: checked(OLD_SITE / name, digest) for name, digest in BASE_FILES.items()}
    checked(OLD_SITEMAP_SITE / 'sitemap-desktop.xml', BASE_FILES['sitemap-desktop.xml'])
    files.update(replacements)
    directory(SITE)
    if not inventory(SITE).issubset(files):
        raise RuntimeError('New release contains unlisted files')
    for name, data in files.items():
        target = SITE / name
        for parent in reversed(target.parent.relative_to(SITE).parents):
            if str(parent) != '.':
                directory(SITE / parent)
        directory(target.parent)
        immutable(target, data)
    if inventory(SITE) != set(BASE_FILES) | CHANGED:
        raise RuntimeError('Prepared inventory differs')
    for name, data in files.items():
        checked(SITE / name, sha(data))
    return files


def updated_snippet(original):
    old = OLD_SITE.as_posix().encode()
    new = SITE.as_posix().encode()
    sitemap_old = OLD_SITEMAP_SITE.as_posix().encode()
    pairs = [
        (b'location = / {\n    root ' + old + b';', b'location = / {\n    root ' + new + b';'),
        (b'location ^~ /desktop-assets/ {\n    alias ' + old + b'/desktop-assets/;', b'location ^~ /desktop-assets/ {\n    alias ' + new + b'/desktop-assets/;'),
        (b'location = /sitemap-desktop.xml {\n    root ' + sitemap_old + b';', b'location = /sitemap-desktop.xml {\n    root ' + new + b';'),
    ]
    marker = b'# Public, fixed upstream only.'
    if original.count(EXPECTED_CSP.encode()) != 1 or original.count(new) or b'location = /robots.txt' in original or original.count(marker) != 1:
        raise RuntimeError('Unexpected CSP or preexisting release path')
    updated = original
    for before, after in pairs:
        if updated.count(before) != 1:
            raise RuntimeError('Expected unique owned configuration marker')
        updated = updated.replace(before, after)
    updated = updated.replace(marker, robots_block() + marker)
    restored = updated.replace(robots_block(), b'')
    for before, after in reversed(pairs):
        restored = restored.replace(after, before)
    if restored != original:
        raise RuntimeError('Unexpected configuration diff')
    return updated


def preview_snippet(original):
    updated = updated_snippet(original)
    marker = b'# Public, fixed upstream only.'
    if updated.count(marker) != 1:
        raise RuntimeError('Ambiguous download boundary')
    static = updated.split(marker)[0].replace(robots_block(), b'')
    static += b'''location = /downloads/updates/latest.json {
    proxy_pass https://tools.treasuregrove.art/lolicode/updates/latest.json;
    include /etc/nginx/snippets/lolicode-download-transport.conf;
    add_header Cache-Control "no-store" always;
    add_header X-Content-Type-Options nosniff always;
}
'''
    return static.replace(b'add_header X-Content-Type-Options nosniff always;',
                          b'add_header X-Content-Type-Options nosniff always;\n    add_header X-Robots-Tag "noindex, nofollow" always;')


def reload_nginx():
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)


def swap_config(path, original, updated):
    if plain(path) != original:
        raise RuntimeError('Concurrent config edit; refusing overwrite')
    mode = stat.S_IMODE(path.stat().st_mode)
    atomic(path, updated, mode)
    try:
        reload_nginx()
    except Exception:
        if plain(path) != updated:
            raise RuntimeError('Concurrent config edit; conditional rollback stopped')
        atomic(path, original, mode)
        reload_nginx()
        raise


def replace_config(path, original, updated, backup):
    immutable(PAYLOAD / (backup + '.before'), original, 0o600)
    immutable(PAYLOAD / (backup + '.after'), updated, 0o600)
    swap_config(path, original, updated)


def preview():
    environment()
    check_public_robots()
    original = checked(TEST, TEST_SHA)
    snippet = checked(SNIPPET, SNIPPET_SHA)
    prepare()
    immutable(PREVIEW, preview_snippet(snippet))
    anchor = b'    include /etc/nginx/snippets/forum-test-noindex-locations.conf;'
    if original.count(anchor) != 1:
        raise RuntimeError('Ambiguous preview insertion point')
    updated = original.replace(anchor, ('    include ' + PREVIEW.as_posix() + ';\n\n').encode() + anchor)
    replace_config(TEST, original, updated, 'preview-config')
    environment()
    checked(SNIPPET, SNIPPET_SHA)
    print(json.dumps({'state': 'preview', 'url': 'https://test.lolicode.com/', 'manifestSHA256': MANIFEST_SHA,
                      'testConfigSHA256': sha(updated)}))


def restore_preview():
    environment()
    original = checked(PAYLOAD / 'preview-config.before', TEST_SHA)
    expected = plain(PAYLOAD / 'preview-config.after')
    current = plain(TEST)
    if current != original:
        if current != expected:
            raise RuntimeError('Concurrent test configuration change; rollback stopped')
        swap_config(TEST, current, original)
    print(json.dumps({'state': 'preview-restored', 'testConfigSHA256': sha(plain(TEST))}))


def production():
    environment()
    check_public_robots()
    checked(TEST, TEST_SHA)
    original = checked(SNIPPET, SNIPPET_SHA)
    payload()
    verified = json.loads(plain(PAYLOAD / 'preview-verified.json'))
    if verified != {'passed': True, 'manifestSHA256': MANIFEST_SHA}:
        raise RuntimeError('This exact manifest has not passed preview validation')
    prepare()
    updated = updated_snippet(original)
    replace_config(SNIPPET, original, updated, 'production-snippet')
    environment()
    print(json.dumps({'state': 'published', 'site': SITE.as_posix(), 'manifestSHA256': MANIFEST_SHA,
                      'snippetSHA256': sha(plain(SNIPPET)), 'mainConfigSHA256': sha(plain(MAIN))}))


def restore_production():
    environment()
    original = checked(PAYLOAD / 'production-snippet.before', SNIPPET_SHA)
    expected = updated_snippet(original)
    if plain(PAYLOAD / 'production-snippet.after') != expected:
        raise RuntimeError('Installed configuration backup differs')
    current = plain(SNIPPET)
    if current != original:
        if current != expected:
            raise RuntimeError('Concurrent production configuration change; rollback stopped')
        swap_config(SNIPPET, current, original)
    print(json.dumps({'state': 'production-restored', 'snippetSHA256': sha(plain(SNIPPET))}))


def self_test():
    """Offline exercises: owned path diff, payload gate, rollback and conflict preservation."""
    import tempfile
    global PAYLOAD, SITE, OLD_SITE, OLD_SITEMAP_SITE, MANIFEST_SHA, BASE_FILES, reload_nginx
    saved = PAYLOAD, SITE, OLD_SITE, OLD_SITEMAP_SITE, MANIFEST_SHA, BASE_FILES, reload_nginx
    try:
        with tempfile.TemporaryDirectory(prefix='lolicode-brand-search-') as tmp:
            base = Path(tmp)
            PAYLOAD, SITE, OLD_SITE, OLD_SITEMAP_SITE = [base / name for name in ['payload', 'site', 'old', 'old-sitemap']]
            for folder in [PAYLOAD, PAYLOAD / 'home', OLD_SITE, OLD_SITE / 'desktop-assets', OLD_SITE / 'desktop-assets/rankings', OLD_SITEMAP_SITE]:
                directory(folder)
            original_files = {'index.html': b'old home', 'sitemap-desktop.xml': b'old sitemap',
                              'desktop-assets/downloads.js': b'untouched download', 'desktop-assets/rankings/demo.jpg': b'untouched image'}
            BASE_FILES = {name: sha(data) for name, data in original_files.items()}
            for name, data in original_files.items():
                atomic(OLD_SITE / name, data)
            atomic(OLD_SITEMAP_SITE / 'sitemap-desktop.xml', b'old sitemap')
            for name in CHANGED:
                atomic(PAYLOAD / 'home' / name, (ORIGINAL_ROBOTS + b'\nSitemap: https://lolicode.com/sitemap-desktop.xml\n') if name == 'robots.txt' else ('new ' + name).encode())
            manifest = {'batch': BATCH, 'files': {name: sha(plain(PAYLOAD / 'home' / name)) for name in sorted(CHANGED)}}
            atomic(PAYLOAD / 'manifest.json', json.dumps(manifest).encode(), 0o600)
            MANIFEST_SHA = sha(plain(PAYLOAD / 'manifest.json'))
            files = prepare()
            assert plain(SITE / 'desktop-assets/downloads.js') == b'untouched download'
            assert set(files) == set(BASE_FILES) | CHANGED
            prepare()
            protected = b'location = /favicon.ico { alias keep/favicon.ico; }\n# Public, fixed upstream only.\nDOWNLOADS AND CSP TAIL'
            sample = ('location = / {\n    root ' + OLD_SITE.as_posix() + ';\n' + EXPECTED_CSP + '\n}\n'
                      'location ^~ /desktop-assets/ {\n    alias ' + OLD_SITE.as_posix() + '/desktop-assets/;\n}\n'
                      'location = /sitemap-desktop.xml {\n    root ' + OLD_SITEMAP_SITE.as_posix() + ';\n}\n').encode() + protected
            updated = updated_snippet(sample)
            assert updated.endswith(protected.split(b'# Public, fixed upstream only.')[1]) and updated.count(SITE.as_posix().encode()) == 4
            assert b'location = /favicon.ico { alias keep/favicon.ico; }' in updated
            assert b'location = /robots.txt' not in preview_snippet(sample)
            try:
                updated_snippet(sample.replace(b'location = /sitemap-desktop.xml', b'location = /other.xml'))
                raise AssertionError('Missing marker was accepted')
            except RuntimeError:
                pass
            config = base / 'config'
            atomic(config, b'original')
            reload_nginx = lambda: None
            swap_config(config, b'original', b'installed')
            try:
                swap_config(config, b'original', b'overwrite')
                raise AssertionError('Concurrent edit was overwritten')
            except RuntimeError:
                assert plain(config) == b'installed'
            calls = []
            def failing_reload():
                calls.append(1)
                if len(calls) == 1:
                    raise RuntimeError('injected nginx failure')
            reload_nginx = failing_reload
            try:
                swap_config(config, b'installed', b'candidate')
                raise AssertionError('Injected reload failure was ignored')
            except RuntimeError:
                assert plain(config) == b'installed' and len(calls) == 2
            atomic(PAYLOAD / 'home/index.html', b'tampered')
            try:
                payload()
                raise AssertionError('Payload tampering was accepted')
            except RuntimeError:
                pass
        print(json.dumps({'state': 'self-test-passed', 'checks': 10}))
    finally:
        PAYLOAD, SITE, OLD_SITE, OLD_SITEMAP_SITE, MANIFEST_SHA, BASE_FILES, reload_nginx = saved


if __name__ == '__main__':
    actions = {'preview': preview, 'restore-preview': restore_preview,
               'production': production, 'restore-production': restore_production}
    if sys.argv[1:] == ['--self-test']:
        self_test()
    else:
        if not hasattr(os, 'geteuid') or os.geteuid() != 0 or len(sys.argv) != 2 or sys.argv[1] not in actions:
            raise RuntimeError('Expected a fixed-batch deployment or rollback action as root')
        import fcntl
        directory(PAYLOAD, 0o700)
        if stat.S_IMODE(PAYLOAD.stat().st_mode) & 0o077:
            raise RuntimeError('Payload must be root-private (0700)')
        with LOCK.open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            actions[sys.argv[1]]()
