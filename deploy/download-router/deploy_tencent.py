#!/usr/bin/env python3
"""Fixed, reviewed router batch. Does not publish feeds or change the forum.

The preflight command is read-only. Installation requires independently reviewed
Tencent CDN assets and a matching private payload manifest; it rehashes all three assets.
"""
import hashlib
import ipaddress
import re
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
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tencent_router as signer

BATCH = '20261017-tencent-v1'
VERSION = '4.0.20'
PORT = 18782
PAYLOAD = Path('/root/lolicode-tencent-router-' + BATCH)
RELEASE = Path('/opt/lolicode-tencent-router/releases') / BATCH
MAIN = Path('/etc/nginx/sites-available/lolicode.conf')
MAIN_SHA = '819dfde97b2533df4dd1dd5f7838cf371199a38b687a813dfdbc82657280bd75'
SNIPPET = Path('/etc/nginx/snippets/lolicode-home-production-20261016-home-v3.conf')
# Reviewed baseline after Tencent optional static controls; existing R2 routes retained.
SNIPPET_SHA = 'bf6b52f52564cbaf6bd7463235081ff20af5fb8771fb199fed70171b4af971c0'
UNIT = Path('/etc/systemd/system/lolicode-tencent-router.service')
CONFIG = Path('/etc/lolicode-tencent-router.json')
SERVICE = UNIT.name
MARKER = '# BEGIN LoliCode Tencent ' + BATCH
CDN_ORIGIN = 'https://downloads.treasuregrove.art'
CREDENTIAL = Path('/etc/lolicode-tencent-cdn.key')
CONFIG_NAME = 'tencent-router.production.json'
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
FILES = {'tencent_router.py', CONFIG_NAME, 'lolicode-tencent-router.service',
         'tencent-nginx-locations.conf.template', 'deploy_tencent.py'}
CF_NETWORKS = [
    '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
    '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
    '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
    '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
    '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
    '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
]


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
    config = signer.load_configuration(PAYLOAD / CONFIG_NAME)
    if not signer.ready(config) or config.auth_ttl_seconds != 300:
        raise RuntimeError('All deployment gates and reviewed CDN TTL must be verified')
    fragment = data['tencent-nginx-locations.conf.template'].decode().replace('\r\n', '\n')
    if (fragment.count(MARKER) != 1 or fragment.count('location = ') != 3
            or any(fragment.count('location = /downloads/tencent/' + VERSION + '/' + name + ' {') != 1
                   for name in ASSETS)):
        raise RuntimeError('Unexpected exact-route template')
    blocks = list(re.finditer(r'^location = ([^ ]+) \{\n(.*?)^\}', fragment, re.MULTILINE | re.DOTALL))
    if len(blocks) != 3:
        raise RuntimeError('Expected only three location-scoped real IP blocks')
    outside = re.sub(r'^location = ([^ ]+) \{\n(.*?)^\}', '', fragment, flags=re.MULTILINE | re.DOTALL)
    if any(line.strip() and not line.lstrip().startswith('#') for line in outside.splitlines()):
        raise RuntimeError('Refusing server/global configuration changes')
    for block in blocks:
        text = block.group(2)
        networks = re.findall(r'^\s*set_real_ip_from ([^;]+);\s*$', text, re.MULTILINE)
        backends = re.findall(r'^\s*proxy_pass ([^;]+);\s*$', text, re.MULTILINE)
        if (networks != CF_NETWORKS or text.count('real_ip_header CF-Connecting-IP;') != 1
                or text.count('real_ip_recursive on;') != 1
                or text.count('proxy_set_header X-LoliCode-Client-IP $remote_addr;') != 1
                or backends != ['http://127.0.0.1:18782']):
            raise RuntimeError('Only reviewed Cloudflare peers may restore real client IP')
        for required in ['proxy_pass_request_headers off;', 'proxy_pass_request_body off;',
                         'proxy_set_header Content-Length "";', 'proxy_set_header Transfer-Encoding "";',
                         'proxy_set_header X-Forwarded-For "";', 'proxy_set_header Cookie "";',
                         'proxy_set_header Authorization "";', 'access_log off;', 'error_log /dev/null;']:
            if text.count(required) != 1:
                raise RuntimeError('Trusted proxy framing, credential and privacy boundaries required')
    return data


def baseline():
    original = plain(SNIPPET)
    if sha(plain(MAIN)) != MAIN_SHA or sha(original) != SNIPPET_SHA:
        raise RuntimeError('Nginx baseline changed; re-review this batch, do not overwrite')
    if (MARKER in original.decode() or 'location = /downloads/tencent/4.0.20/' in original.decode()):
        raise RuntimeError('Unexpected existing download routing')
    return original


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


def verify_cloudflare(opener=None):
    # Official lists are re-read only; a changed list requires a new review, not
    # an automatic expansion of trusted clients in the live Nginx config.
    opener = opener or build_opener(ProxyHandler({}), NoRedirect())
    result = []
    for version in [4, 6]:
        url = 'https://www.cloudflare.com/ips-v' + str(version)
        with opener.open(Request(url), timeout=15) as response:
            raw = response.read(8193)
            if response.status != 200 or response.geturl() != url or len(raw) > 8192:
                raise RuntimeError('Cloudflare official IP list unavailable')
        networks = raw.decode('ascii').splitlines()
        for value in networks:
            network = ipaddress.ip_network(value, strict=True)
            if network.version != version or str(network) != value:
                raise RuntimeError('Noncanonical Cloudflare network')
        result.extend(networks)
    if result != CF_NETWORKS:
        raise RuntimeError('Cloudflare official ranges changed; review before deployment')
    return result


def verify_cdn(opener=None):
    opener = opener or build_opener(ProxyHandler({}), NoRedirect())
    private_key = signer.read_secret(CREDENTIAL)
    make_url = signer.TypeASigner(private_key, CDN_ORIGIN)
    verified = {}
    for name, expected in ASSETS.items():
        unsigned = CDN_ORIGIN + signer.OBJECT_PREFIX + name
        # Auth must cover all three extensions, including .sig and .zip.
        try:
            with opener.open(Request(unsigned, method='HEAD'), timeout=15) as response:
                if response.status != 403:
                    raise RuntimeError('Unsigned CDN download was not refused')
        except HTTPError as error:
            code = error.code
            error.close()
            if code != 403:
                raise RuntimeError('Unsigned CDN check failed') from None
        url = make_url(name)
        request = Request(url, headers={'Accept-Encoding': 'identity',
                                       'User-Agent': 'LoliCode-Tencent-Verification/1'})
        digest, count = hashlib.sha256(), 0
        with opener.open(request, timeout=20) as response:
            if (response.status != 200 or response.geturl() != url
                    or response.headers.get('Content-Encoding', 'identity').lower() != 'identity'):
                raise RuntimeError('Signed CDN asset is not a fixed HTTPS 200 response')
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                count += len(chunk)
                if count > expected['bytes']:
                    raise RuntimeError('CDN asset exceeds authoritative byte count')
                digest.update(chunk)
        actual = {'bytes': count, 'sha256': digest.hexdigest()}
        if actual != expected:
            raise RuntimeError('CDN full-download SHA256 mismatch')
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
    verified = {'cloudflareNetworks': verify_cloudflare(), 'cdnAssets': verify_cdn()}
    if baseline() != original:
        raise RuntimeError('Concurrent Nginx edit during preflight')
    return data, original, verified


def loopback_check():
    for method in ['GET', 'HEAD']:
        for name in ASSETS:
            connection = http.client.HTTPConnection('127.0.0.1', PORT, timeout=3)
            try:
                # Reserved test address only; never forwarded from real users.
                connection.request(method, '/downloads/tencent/' + VERSION + '/' + name,
                                   headers={'X-LoliCode-Client-IP': '198.51.100.254'})
                response = connection.getresponse()
                target = response.getheader('Location')
                prefix = CDN_ORIGIN + signer.OBJECT_PREFIX + name + '?sign='
                if (response.status != 302 or not isinstance(target, str) or not target.startswith(prefix)
                        or re.fullmatch(r'[1-9][0-9]*-[A-Za-z0-9]{0,100}-0-[0-9a-f]{32}', target[len(prefix):]) is None
                        or response.getheader('Cache-Control') != 'private, no-store'):
                    raise RuntimeError('Unexpected loopback download response')
                response.read()
            finally:
                connection.close()
    for method, path, expected in [('GET', '/health', 404),
            ('GET', '/downloads/tencent/' + VERSION + '/' + next(iter(ASSETS)) + '?x=1', 404),
            ('GET', '/downloads/tencent/' + VERSION + '/' + next(iter(ASSETS)), 400)]:
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
    updated = original.rstrip() + b'\n\n' + data['tencent-nginx-locations.conf.template']
    atomic(PAYLOAD / 'production-snippet.before', original, 0o600)
    create_release_directory()
    atomic(RELEASE / 'tencent_router.py', data['tencent_router.py'])
    written_config = written_unit = changed_snippet = False
    try:
        # Recheck all absent destinations immediately before writing.
        absent(CONFIG)
        absent(UNIT)
        if baseline() != original:
            raise RuntimeError('Concurrent Nginx change before installation')
        atomic(CONFIG, data[CONFIG_NAME])
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
                   'verifiedCDNAssets': verified}
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
            owned_remove(CONFIG, data[CONFIG_NAME])
        raise


def rollback():
    data = payload()
    receipt = json.loads(plain(PAYLOAD / 'deployment-receipt.json'))
    original = plain(PAYLOAD / 'production-snippet.before')
    updated = original.rstrip() + b'\n\n' + data['tencent-nginx-locations.conf.template']
    if (receipt.get('state') != 'installed' or receipt.get('batch') != BATCH
            or receipt.get('snippetBeforeSHA256') != sha(original)
            or receipt.get('snippetAfterSHA256') != sha(updated)
            or plain(UNIT) != data[SERVICE] or plain(CONFIG) != data[CONFIG_NAME]
            or plain(RELEASE / 'tencent_router.py') != data['tencent_router.py']):
        raise RuntimeError('Rollback baseline differs; preserve current state for review')
    restore_snippet(original, updated)
    run('systemctl', 'disable', '--now', SERVICE)
    owned_remove(UNIT, data[SERVICE])
    owned_remove(CONFIG, data[CONFIG_NAME])
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
                              'snippetSHA256': sha(original), 'verifiedCDNAssets': verified}))
        else:
            (install if mode == 'install' else rollback)()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # urllib exception strings contain signed URLs. Never print them, raw
        # subprocess diagnostics, secret file contents or exception locals.
        print(json.dumps({'failed': True, 'category': type(error).__name__}))
        sys.exit(1)
