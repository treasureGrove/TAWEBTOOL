#!/usr/bin/env python3
"""Disabled-by-default, fixed-release Tencent CDN Type A signer.

Local preparation only; no deployment or CDN configuration is performed here.
Official algorithm: https://cloud.tencent.com/document/product/228/41623
TTL is enforced by CDN's reviewed Type A configuration, not by a URL expires field.
Use systemd LoadCredential=cdn-key:<root-private-file> in a future reviewed unit;
never put the key in JSON, environment, command line, repository, or request logs.
The loopback peer and dedicated Nginx header are both required. XFF is never read.
"""
import argparse
from collections import deque
from dataclasses import dataclass, field
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import json
import math
import os
from pathlib import Path
import re
import secrets
import stat
import sys
import threading
import time
from urllib.parse import urlsplit

VERSION = '4.0.20'
CDN_ORIGIN = 'https://downloads.treasuregrove.art'
PATH_PREFIX = '/downloads/tencent/' + VERSION + '/'
OBJECT_PREFIX = '/lolicode/releases/' + VERSION + '/'
KEY_PATH = '/run/credentials/lolicode-tencent-router.service/cdn-key'
PORT = 18782
ASSETS = {
    'LoliCode-4.0.20-Windows-x64-Setup.exe': {
        'bytes': 23121161, 'sha256': 'e54945269861d68b2abe5d2cd03571af9c420d6a414682879cbce7ed63cc7af5'},
    'LoliCode-4.0.20-Windows-x64-Setup.exe.sig': {
        'bytes': 420, 'sha256': '5489a48a18feb97d4d1b403070c1108eea000c500c33a2d14cd0c0b10624cc96'},
    'LoliCode-Portable.zip': {
        'bytes': 27864792, 'sha256': '7dcdfe7ffb5e7daea3d71654992789961bd6514bcb53538efcdfad7dea71f270'},
}
GATES = frozenset({'cos_private', 'cdn_cap', 'type_a', 'real_ip'})


@dataclass(frozen=True)
class RateLimits:
    window_seconds: int
    max_requests: int
    block_seconds: int
    max_clients: int
    ipv6_prefix: int


@dataclass(frozen=True)
class Configuration:
    enabled: bool
    cdn_origin: str
    key_file: str
    auth_ttl_seconds: int
    limits: RateLimits
    gates: dict


def unique_object(items):
    result = {}
    for key, value in items:
        if key in result:
            raise ValueError('Duplicate configuration field')
        result[key] = value
    return result


def load_configuration(path):
    with Path(path).open('rb') as stream:
        raw = stream.read(65537)
    if len(raw) > 65536:
        raise ValueError('Configuration too large')
    value = json.loads(raw, object_pairs_hook=unique_object)
    if (not isinstance(value, dict) or set(value) != {'version', 'enabled', 'cdn_origin',
            'key_file', 'auth_ttl_seconds', 'limits', 'gates', 'assets'}
            or value['version'] != VERSION or value['cdn_origin'] != CDN_ORIGIN
            or value['key_file'] != KEY_PATH or type(value['enabled']) is not bool
            or type(value['auth_ttl_seconds']) is not int or not 60 <= value['auth_ttl_seconds'] <= 600
            or value['assets'] != ASSETS):
        raise ValueError('Unexpected fixed-release configuration')
    for info in value['assets'].values():
        # Python numeric equality alone would accept 23121161.0 as the integer
        # manifest size. Require the original JSON field types as well.
        if (not isinstance(info, dict) or set(info) != {'bytes', 'sha256'}
                or type(info['bytes']) is not int or type(info['sha256']) is not str):
            raise ValueError('Invalid authoritative asset metadata')
    gates = value['gates']
    if not isinstance(gates, dict) or set(gates) != GATES or any(type(flag) is not bool for flag in gates.values()):
        raise ValueError('Explicit deployment gates required')
    limits = value['limits']
    if not isinstance(limits, dict) or set(limits) != {'window_seconds', 'max_requests', 'block_seconds', 'max_clients', 'ipv6_prefix'}:
        raise ValueError('Unexpected rate limits')
    bounds = {'window_seconds': (1, 3600), 'max_requests': (1, 1000),
              'block_seconds': (1, 86400), 'max_clients': (1, 65536), 'ipv6_prefix': (48, 128)}
    for name, (low, high) in bounds.items():
        if type(limits[name]) is not int or not low <= limits[name] <= high:
            raise ValueError('Invalid rate limit')
    return Configuration(value['enabled'], value['cdn_origin'], value['key_file'],
                         value['auth_ttl_seconds'], RateLimits(**limits), gates)


def ready(config):
    return (config.enabled is True and config.cdn_origin == CDN_ORIGIN
            and set(config.gates) == GATES and all(flag is True for flag in config.gates.values()))


def read_secret(path):
    # Production requires POSIX file ownership/modes, as provided by systemd
    # credentials. No symlink following; inspect the opened inode to avoid races.
    if os.name != 'posix':
        raise RuntimeError('Production credential loading requires POSIX')
    descriptor = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    try:
        metadata = os.fstat(descriptor)
        # systemd's read-only credentials mount may expose an ACL mask as 0440
        # while retaining root:root ownership. Permit that exact runtime slot;
        # ordinary private key files still require zero group/other bits.
        runtime_credential = (os.fspath(path) == KEY_PATH
                              and os.environ.get('CREDENTIALS_DIRECTORY') == str(Path(KEY_PATH).parent)
                              and metadata.st_uid == 0 and metadata.st_gid == 0
                              and stat.S_IMODE(metadata.st_mode) == 0o440)
        if (not stat.S_ISREG(metadata.st_mode)
                or (stat.S_IMODE(metadata.st_mode) & 0o077 and not runtime_credential)
                or metadata.st_uid not in {0, os.geteuid()}):
            raise ValueError('Credential file must be private and owned by the service or root')
        data = os.read(descriptor, 129)
    finally:
        os.close(descriptor)
    if len(data) > 128:
        raise ValueError('Invalid CDN credential')
    key = data.decode('ascii').removesuffix('\n')
    if re.fullmatch(r'[A-Za-z0-9]{6,40}', key) is None:
        raise ValueError('Invalid CDN credential')
    return key


def sign_type_a(origin, path, key, timestamp, rand):
    parsed = urlsplit(origin)
    if (parsed.scheme != 'https' or not parsed.hostname or origin != 'https://' + parsed.hostname
            or re.fullmatch(r'/[A-Za-z0-9._/-]+', path) is None
            or '//' in path or any(part in {'.', '..'} for part in path.split('/'))
            or re.fullmatch(r'[A-Za-z0-9]{6,40}', key) is None
            or type(timestamp) is not int or timestamp <= 0
            or re.fullmatch(r'[A-Za-z0-9]{0,100}', rand) is None):
        raise ValueError('Invalid Type A signing input')
    raw = f'{path}-{timestamp}-{rand}-0-{key}'.encode('ascii')
    signature = hashlib.md5(raw, usedforsecurity=False).hexdigest()
    return f'{origin}{path}?sign={timestamp}-{rand}-0-{signature}'


class TypeASigner:
    def __init__(self, key, origin, clock=time.time, random_string=None):
        self._key = key
        self.origin = origin
        self.clock = clock
        self.random_string = random_string or (lambda: secrets.token_hex(12))

    def __call__(self, asset):
        if asset not in ASSETS:
            raise ValueError('Unknown release asset')
        return sign_type_a(self.origin, OBJECT_PREFIX + asset, self._key,
                           int(self.clock()), self.random_string())


def client_identity(raw, ipv6_prefix=64):
    if (not isinstance(raw, str) or not raw or len(raw) > 64 or raw.strip() != raw
            or any(symbol in raw for symbol in ',%/[]') or not 48 <= ipv6_prefix <= 128):
        raise ValueError('Invalid trusted client address')
    address = ipaddress.ip_address(raw)
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
        address = address.ipv4_mapped
    if address.is_unspecified or address.is_multicast:
        raise ValueError('Invalid trusted client address')
    if isinstance(address, ipaddress.IPv4Address):
        return str(address)
    return str(ipaddress.ip_network((address, ipv6_prefix), strict=False))


@dataclass
class ClientWindow:
    requests: deque = field(default_factory=deque)
    blocked_until: float = 0.0


class RateLimiter:
    def __init__(self, limits, clock=time.monotonic):
        self.limits = limits
        self.clock = clock
        self.lock = threading.Lock()
        self._salt = secrets.token_bytes(32)
        self._entries = {}

    def check(self, identity):
        key = hashlib.blake2b(identity.encode('ascii'), key=self._salt, digest_size=16).digest()
        now = self.clock()
        with self.lock:
            entry = self._entries.get(key)
            if entry is None:
                if len(self._entries) >= self.limits.max_clients:
                    expired = [candidate for candidate, record in self._entries.items()
                               if record.blocked_until <= now and
                               (not record.requests or record.requests[-1] + self.limits.window_seconds <= now)]
                    for candidate in expired:
                        del self._entries[candidate]
                if len(self._entries) >= self.limits.max_clients:
                    return 503, self.limits.window_seconds
                entry = ClientWindow()
                self._entries[key] = entry
            if entry.blocked_until > now:
                return 429, max(1, math.ceil(entry.blocked_until - now))
            while entry.requests and entry.requests[0] <= now - self.limits.window_seconds:
                entry.requests.popleft()
            if len(entry.requests) >= self.limits.max_requests:
                entry.requests.clear()
                entry.blocked_until = now + self.limits.block_seconds
                return 429, self.limits.block_seconds
            entry.requests.append(now)
            return 200, 0


class Application:
    def __init__(self, config, signer, limiter):
        self.config = config
        self.signer = signer
        self.limiter = limiter
        self.routes = {PATH_PREFIX + name: name for name in ASSETS}

    def decide(self, method, target, ip_headers, peer):
        if method not in {'GET', 'HEAD'}:
            return 405, {'Allow': 'GET, HEAD'}
        asset = self.routes.get(target)
        if asset is None:
            return 404, {}
        if not ready(self.config):
            return 503, {'Retry-After': '60'}
        try:
            if not ipaddress.ip_address(peer).is_loopback:
                return 403, {}
            if len(ip_headers) != 1:
                return 400, {}
            identity = client_identity(ip_headers[0], self.config.limits.ipv6_prefix)
        except (ValueError, TypeError):
            return 400, {}
        status, retry = self.limiter.check(identity)
        if status != 200:
            return status, {'Retry-After': str(retry)}
        try:
            location = self.signer(asset)
            # A custom/misconfigured signer cannot turn this into an open redirect.
            expected = self.config.cdn_origin + OBJECT_PREFIX + asset + '?sign='
            if (not isinstance(location, str) or not location.startswith(expected)
                    or re.fullmatch(r'[1-9][0-9]*-[A-Za-z0-9]{0,100}-0-[0-9a-f]{32}', location[len(expected):]) is None):
                return 503, {'Retry-After': '60'}
            return 302, {'Location': location}
        except Exception:
            return 503, {'Retry-After': '60'}


class LocalServer(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        print('tencent signer request failed', file=sys.stderr)


def handler_class(app):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'
        server_version = 'LoliCodeTencent'
        sys_version = ''

        def log_message(self, *arguments):
            pass

        def dispatch(self):
            # Close every response: no unread body or ambiguous duplicate framing
            # can be reused as another request on this connection.
            self.close_connection = True
            if self.headers.get_all('Transfer-Encoding') or self.headers.get_all('Content-Length'):
                status, headers = 400, {}
            else:
                status, headers = app.decide(self.command, self.path,
                    self.headers.get_all('X-LoliCode-Client-IP', []), self.client_address[0])
            self.send_response(status)
            for name, value in headers.items():
                self.send_header(name, value)
            self.send_header('Cache-Control', 'private, no-store')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.send_header('Content-Length', '0')
            self.send_header('Connection', 'close')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()

        do_GET = dispatch
        do_HEAD = dispatch
        do_POST = dispatch
        do_PUT = dispatch
        do_PATCH = dispatch
        do_DELETE = dispatch
        do_OPTIONS = dispatch
        do_TRACE = dispatch
        do_CONNECT = dispatch
    return Handler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    args = parser.parse_args()
    config = load_configuration(args.config)
    if not ready(config):
        raise RuntimeError('Tencent endpoint disabled until all deployment gates are verified')
    key = read_secret(config.key_file)
    app = Application(config, TypeASigner(key, config.cdn_origin), RateLimiter(config.limits))
    # Fixed loopback only; no option to expose a public address.
    server = LocalServer(('127.0.0.1', PORT), handler_class(app))
    server.serve_forever()


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # No IP, URL, private file, signing input or exception locals in logs.
        print('tencent signer could not start or stopped', file=sys.stderr)
        sys.exit(1)
