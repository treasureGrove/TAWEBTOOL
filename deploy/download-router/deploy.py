#!/usr/bin/env python3
"""Fixed, reviewed router batch. Does not publish feeds or change the forum.

The preflight command is read-only. Installation requires independently reviewed
R2 assets and a matching private payload manifest; it rehashes all three assets.
"""
import hashlib
import http.client
import json
import os
from pathlib import Path
import socket
import stat
import subprocess
import sys
import time
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

BATCH = '20261017-v1'
VERSION = '4.0.20'
PORT = 18781
PAYLOAD = Path('/root/lolicode-download-router-' + BATCH)
RELEASE = Path('/opt/lolicode-download-router/releases') / BATCH
MAIN = Path('/etc/nginx/sites-available/lolicode.conf')
MAIN_SHA = '819dfde97b2533df4dd1dd5f7838cf371199a38b687a813dfdbc82657280bd75'
SNIPPET = Path('/etc/nginx/snippets/lolicode-home-production-20261016-home-v3.conf')
# Reviewed actual baseline after the separate release20-v2 static batch.
SNIPPET_SHA = 'd40f1245515531566354ba2c6dda0a5a9edfb073c8e3dbe48b6951fa74cbd4c4'
UNIT = Path('/etc/systemd/system/lolicode-download-router.service')
CONFIG = Path('/etc/lolicode-download-router.json')
SERVICE = UNIT.name
MARKER = '# BEGIN LoliCode download router ' + BATCH
R2_ORIGIN = 'https://pub-250df9737586416fbd6e8cb0a843b249.r2.dev'
GH_PREFIX = ('https://github.com/treasureGrove/LoliCode-Releases/'
             'releases/download/lolicode-v' + VERSION + '/')
ASSETS = {
    'LoliCode-4.0.20-Windows-x64-Setup.exe': {
        'bytes': 23121161,
        'sha256': 'e54945269861d68b2abe5d2cd03571af9c420d6a414682879cbce7ed63cc7af5'},
    'LoliCode-4.0.20-Windows-x64-Setup.exe.sig': {
        'bytes': 420,
        'sha256': '5489a48a18feb97d4d1b403070c1108eea000c500c33a2d14cd0c0b10624cc96'},
    'LoliCode-Portable.zip': {
        'bytes': 27864792,
        'sha256': '7dcdfe7ffb5e7daea3d71654992789961bd6514bcb53538efcdfad7dea71f270'},
}
FILES = {'router.py', 'config-release20.json', 'lolicode-download-router.service',
         'nginx-locations.conf.template', 'deploy.py'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def plain(path):
    if not stat.S_ISREG(path.lstat().st_mode):
        raise RuntimeError('Not a plain file: ' + str(path))
    return path.read_bytes()


def safe_ancestors(path):
    for parent in [path] + list(path.parents):
        if parent.exists() or parent.is_symlink():
            if not stat.S_ISDIR(parent.lstat().st_mode):
                raise RuntimeError('Unsafe directory: ' + str(parent))


def absent(path):
    if path.exists() or path.is_symlink():
        raise RuntimeError('Refusing to replace existing path: ' + str(path))


def atomic(path, data, mode=0o644):
    safe_ancestors(path.parent)
    if path.exists() or path.is_symlink():
        plain(path)
    temp = path.with_name(path.name + '.' + BATCH + '.tmp')
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temp, mode)
        os.replace(temp, path)
    finally:
        if temp.exists():
            temp.unlink()


def run(*arguments):
    return subprocess.run(arguments, check=True, capture_output=True, text=True)


def payload():
    safe_ancestors(PAYLOAD)
    manifest = json.loads(plain(PAYLOAD / 'manifest.json'))
    if (set(manifest) != {'batch', 'version', 'files'} or manifest['batch'] != BATCH
            or manifest['version'] != VERSION or set(manifest['files']) != FILES):
        raise RuntimeError('Unexpected private payload manifest')
    data = {name: plain(PAYLOAD / name) for name in FILES}
    if any(sha(value) != manifest['files'][name] for name, value in data.items()):
        raise RuntimeError('Private payload checksum mismatch')
    expected = {'version': VERSION, 'r2_origin': R2_ORIGIN, 'assets': ASSETS}
    if json.loads(data['config-release20.json']) != expected:
        raise RuntimeError('R2 origin or authoritative asset metadata differs')
    fragment = data['nginx-locations.conf.template'].decode()
    if (fragment.count(MARKER) != 1 or fragment.count('location = ') != 3
            or any(fragment.count('location = /downloads/releases/' + VERSION + '/' + name + ' {') != 1
                   for name in ASSETS)):
        raise RuntimeError('Unexpected exact-route template')
    return data


def baseline():
    original = plain(SNIPPET)
    if sha(plain(MAIN)) != MAIN_SHA or sha(original) != SNIPPET_SHA:
        raise RuntimeError('Nginx baseline changed; re-review this batch, do not overwrite')
    if (MARKER in original.decode() or original.decode().count('location ^~ /downloads/releases/ {') != 1
            or 'location = /downloads/releases/4.0.20/' in original.decode()):
        raise RuntimeError('Unexpected existing download routing')
    return original


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


def verify_r2(opener=None):
    opener = opener or build_opener(ProxyHandler({}), NoRedirect())
    verified = {}
    for name, expected in ASSETS.items():
        url = R2_ORIGIN + '/lolicode/releases/' + VERSION + '/' + name
        request = Request(url, headers={'Accept-Encoding': 'identity',
                                       'User-Agent': 'LoliCode-Release-Verification/1'})
        digest, count = hashlib.sha256(), 0
        with opener.open(request, timeout=20) as response:
            if (response.status != 200 or response.geturl() != url
                    or response.headers.get('Content-Encoding', 'identity').lower() != 'identity'):
                raise RuntimeError('R2 asset is not a fixed anonymous 200 response')
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                count += len(chunk)
                if count > expected['bytes']:
                    raise RuntimeError('R2 asset exceeds authoritative byte count')
                digest.update(chunk)
        actual = {'bytes': count, 'sha256': digest.hexdigest()}
        if actual != expected:
            raise RuntimeError('R2 full-download SHA256 mismatch: ' + name)
        verified[name] = actual
    return verified


def preflight():
    data = payload()
    original = baseline()
    for target in [UNIT, CONFIG, RELEASE, PAYLOAD / 'deployment-receipt.json',
                   PAYLOAD / 'production-snippet.before']:
        absent(target)
        safe_ancestors(target.parent)
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(('127.0.0.1', PORT))
    run('systemd-analyze', 'verify', '--man=no', str(PAYLOAD / SERVICE))
    verified = verify_r2()
    if baseline() != original:
        raise RuntimeError('Concurrent Nginx edit during preflight')
    return data, original, verified


def loopback_check():
    for method in ['GET', 'HEAD']:
        for name in ASSETS:
            connection = http.client.HTTPConnection('127.0.0.1', PORT, timeout=3)
            try:
                connection.request(method, '/downloads/releases/' + VERSION + '/' + name)
                response = connection.getresponse()
                target = response.getheader('Location')
                allowed = {R2_ORIGIN + '/lolicode/releases/' + VERSION + '/' + name, GH_PREFIX + name}
                if (response.status != 302 or target not in allowed
                        or response.getheader('Cache-Control') != 'no-store'):
                    raise RuntimeError('Unexpected loopback download response')
                response.read()
            finally:
                connection.close()
    for method, path, expected in [('GET', '/health', 404),
            ('GET', '/downloads/releases/' + VERSION + '/' + next(iter(ASSETS)) + '?x=1', 404),
            ('POST', '/downloads/releases/' + VERSION + '/' + next(iter(ASSETS)), 405)]:
        connection = http.client.HTTPConnection('127.0.0.1', PORT, timeout=3)
        try:
            connection.request(method, path)
            response = connection.getresponse()
            if response.status != expected:
                raise RuntimeError('Loopback rejection boundary failed')
            response.read()
        finally:
            connection.close()


def owned_remove(path, expected):
    if path.exists() or path.is_symlink():
        if plain(path) != expected:
            raise RuntimeError('Concurrent change; refusing removal: ' + str(path))
        path.unlink()


def create_release_directory():
    # Do not inherit a root shell's 0077 umask: DynamicUser must traverse the
    # newly created /opt directories. Never chmod a pre-existing directory.
    missing = []
    current = RELEASE
    while not current.exists():
        if current.is_symlink():
            raise RuntimeError('Unexpected release directory symlink')
        missing.append(current)
        current = current.parent
    safe_ancestors(current)
    for directory in reversed(missing):
        directory.mkdir(mode=0o755)
        directory.chmod(0o755)


def restore_snippet(original, updated):
    if sha(plain(MAIN)) != MAIN_SHA or plain(SNIPPET) != updated:
        raise RuntimeError('Concurrent Nginx change; retained private backup without blind rollback')
    atomic(SNIPPET, original)
    run('nginx', '-t')
    run('systemctl', 'reload', 'nginx')


def install():
    data, original, verified = preflight()
    updated = original.rstrip() + b'\n\n' + data['nginx-locations.conf.template']
    atomic(PAYLOAD / 'production-snippet.before', original, 0o600)
    create_release_directory()
    atomic(RELEASE / 'router.py', data['router.py'])
    written_config = written_unit = changed_snippet = False
    try:
        # Recheck all absent destinations immediately before writing.
        absent(CONFIG)
        absent(UNIT)
        if baseline() != original:
            raise RuntimeError('Concurrent Nginx change before installation')
        atomic(CONFIG, data['config-release20.json'])
        written_config = True
        atomic(UNIT, data[SERVICE])
        written_unit = True
        run('systemctl', 'daemon-reload')
        run('systemctl', 'start', SERVICE)
        deadline = time.monotonic() + 5
        while True:
            try:
                loopback_check()
                break
            except (ConnectionRefusedError, ConnectionResetError):
                if time.monotonic() >= deadline:
                    raise
                time.sleep(0.1)
        if baseline() != original:
            raise RuntimeError('Concurrent Nginx change before route publication')
        atomic(SNIPPET, updated)
        changed_snippet = True
        run('nginx', '-t')
        run('systemctl', 'reload', 'nginx')
        run('systemctl', 'enable', SERVICE)
        run('systemctl', 'is-active', SERVICE)
        if plain(SNIPPET) != updated or sha(plain(MAIN)) != MAIN_SHA:
            raise RuntimeError('Concurrent Nginx change after reload')
        receipt = {'batch': BATCH, 'version': VERSION, 'state': 'installed',
                   'snippetBeforeSHA256': sha(original), 'snippetAfterSHA256': sha(updated),
                   'mainSHA256': MAIN_SHA, 'files': {name: sha(value) for name, value in data.items()},
                   'verifiedR2Assets': verified}
        atomic(PAYLOAD / 'deployment-receipt.json',
               (json.dumps(receipt, indent=2) + '\n').encode(), 0o600)
        print(json.dumps(receipt))
    except Exception:
        # Do not overwrite concurrent edits or erase immutable release evidence.
        if changed_snippet:
            restore_snippet(original, updated)
        if written_unit:
            if plain(UNIT) != data[SERVICE]:
                raise RuntimeError('Concurrent unit edit; retained service for review')
            run('systemctl', 'disable', '--now', SERVICE)
            owned_remove(UNIT, data[SERVICE])
            run('systemctl', 'daemon-reload')
        if written_config:
            owned_remove(CONFIG, data['config-release20.json'])
        raise


def rollback():
    data = payload()
    receipt = json.loads(plain(PAYLOAD / 'deployment-receipt.json'))
    original = plain(PAYLOAD / 'production-snippet.before')
    updated = original.rstrip() + b'\n\n' + data['nginx-locations.conf.template']
    if (receipt.get('state') != 'installed' or receipt.get('batch') != BATCH
            or receipt.get('snippetBeforeSHA256') != sha(original)
            or receipt.get('snippetAfterSHA256') != sha(updated)
            or plain(UNIT) != data[SERVICE] or plain(CONFIG) != data['config-release20.json']
            or plain(RELEASE / 'router.py') != data['router.py']):
        raise RuntimeError('Rollback baseline differs; preserve current state for review')
    restore_snippet(original, updated)
    run('systemctl', 'disable', '--now', SERVICE)
    owned_remove(UNIT, data[SERVICE])
    owned_remove(CONFIG, data['config-release20.json'])
    run('systemctl', 'daemon-reload')
    receipt['state'] = 'rolled-back'
    atomic(PAYLOAD / 'deployment-receipt.json', (json.dumps(receipt, indent=2) + '\n').encode(), 0o600)
    print(json.dumps({'state': 'rolled-back', 'snippetSHA256': sha(original)}))


def main():
    if (not hasattr(os, 'geteuid') or os.geteuid() != 0
            or sys.argv[1:] not in [['preflight'], ['install'], ['rollback']]):
        raise RuntimeError('Expected preflight, install or rollback on the reviewed Linux host')
    import fcntl
    with open('/run/lock/lolicode-forum-maintenance.lock', 'r') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if Path('/var/www/ops/MAINTENANCE_ON').exists():
            raise RuntimeError('Existing maintenance mode left unchanged')
        mode = sys.argv[1]
        if mode == 'preflight':
            data, original, verified = preflight()
            print(json.dumps({'state': 'preflight-passed', 'batch': BATCH,
                              'snippetSHA256': sha(original), 'verifiedR2Assets': verified}))
        else:
            (install if mode == 'install' else rollback)()


if __name__ == '__main__':
    main()
