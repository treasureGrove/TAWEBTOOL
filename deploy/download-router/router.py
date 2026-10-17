#!/usr/bin/env python3
"""Credential-free, fixed-release download redirects. No file proxying or logging."""
import argparse
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import sys
import threading
import time
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

VERSION = '4.0.20'
INSTALLER = 'LoliCode-4.0.20-Windows-x64-Setup.exe'
ASSETS = frozenset([INSTALLER, INSTALLER + '.sig', 'LoliCode-Portable.zip'])
PATH_PREFIX = '/downloads/releases/' + VERSION + '/'
OBJECT_PREFIX = '/lolicode/releases/' + VERSION + '/'
GITHUB_PREFIX = ('https://github.com/treasureGrove/LoliCode-Releases/'
                 'releases/download/lolicode-v' + VERSION + '/')
PROBE_TIMEOUT = 1.2
WAIT_TIMEOUT = 1.5
HEALTHY_TTL = 30.0
FAILED_TTL = 3.0


@dataclass(frozen=True)
class Asset:
    size: int
    sha256: str


@dataclass(frozen=True)
class Configuration:
    r2_origin: str
    assets: dict


def load_configuration(path):
    with Path(path).open('rb') as stream:
        raw = stream.read(65537)
    if len(raw) > 65536:
        raise ValueError('Configuration is too large')
    config = json.loads(raw)
    if not isinstance(config, dict) or set(config) != {'version', 'r2_origin', 'assets'}:
        raise ValueError('Unexpected configuration fields')
    if config['version'] != VERSION:
        raise ValueError('Unexpected release version')
    origin = config['r2_origin']
    if not isinstance(origin, str):
        raise ValueError('Invalid R2 origin')
    parsed = urlsplit(origin)
    hostname = parsed.hostname or ''
    if (not re.fullmatch(r'pub-[a-z0-9-]+\.r2\.dev', hostname)
            or origin != 'https://' + hostname):
        raise ValueError('Expected one exact public R2 HTTPS origin')
    records = config['assets']
    if not isinstance(records, dict) or set(records) != ASSETS:
        raise ValueError('Expected exactly the three release assets')
    assets = {}
    for name, info in records.items():
        if (not isinstance(info, dict) or set(info) != {'bytes', 'sha256'}
                or type(info['bytes']) is not int or not 0 < info['bytes'] <= 2**53 - 1
                or not isinstance(info['sha256'], str)
                or not re.fullmatch(r'[a-fA-F0-9]{64}', info['sha256'])):
            raise ValueError('Invalid release asset metadata')
        assets[name] = Asset(info['bytes'], info['sha256'].lower())
    return Configuration(origin, assets)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


class R2Probe:
    def __init__(self, config, opener=None):
        self.config = config
        # No inherited environment proxies, cookies, authorization or redirects.
        self.opener = opener or build_opener(ProxyHandler({}), NoRedirect())

    def __call__(self, asset):
        if asset not in self.config.assets:
            return False
        request = Request(self.config.r2_origin + OBJECT_PREFIX + asset,
                          method='HEAD', headers={'User-Agent': 'LoliCode-Download-Router/1'})
        try:
            with self.opener.open(request, timeout=PROBE_TIMEOUT) as response:
                expected = self.config.assets[asset]
                actual_size = response.headers.get('Content-Length', '')
                metadata_hash = response.headers.get('x-amz-meta-sha256')
                encoding = response.headers.get('Content-Encoding', 'identity')
                return (response.status == 200 and actual_size.isascii()
                        and actual_size.isdigit() and int(actual_size) == expected.size
                        and encoding.lower() == 'identity'
                        and (metadata_hash is None or metadata_hash.lower() == expected.sha256))
        except Exception:
            return False


@dataclass
class CacheEntry:
    healthy: bool = False
    expires: float = 0.0
    in_flight: bool = False


class HealthCache:
    def __init__(self, probe, clock=time.monotonic, wait_timeout=WAIT_TIMEOUT):
        self.probe = probe
        self.clock = clock
        self.wait_timeout = wait_timeout
        self.condition = threading.Condition()
        self.entries = {asset: CacheEntry() for asset in ASSETS}

    def healthy(self, asset):
        if asset not in self.entries:
            return False
        with self.condition:
            entry = self.entries[asset]
            if self.clock() < entry.expires:
                return entry.healthy
            if not entry.in_flight:
                entry.in_flight = True
                # One daemon probe per fixed asset. Even a stalled DNS lookup cannot
                # hold a redirect request beyond wait_timeout or spawn more probes.
                worker = threading.Thread(target=self.refresh, args=(asset,), daemon=True)
                worker.start()
            self.condition.wait_for(lambda: not entry.in_flight, timeout=self.wait_timeout)
            return entry.healthy if self.clock() < entry.expires else False

    def refresh(self, asset):
        try:
            result = bool(self.probe(asset))
        except Exception:
            result = False
        with self.condition:
            entry = self.entries[asset]
            entry.healthy = result
            entry.expires = self.clock() + (HEALTHY_TTL if result else FAILED_TTL)
            entry.in_flight = False
            self.condition.notify_all()


class DownloadServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def handle_error(self, request, client_address):
        # Do not log client IPs, request headers, credentials or traceback locals.
        print('download-router request failed', file=sys.stderr)


def handler_class(config, cache):
    routes = {PATH_PREFIX + name: name for name in ASSETS}

    class DownloadHandler(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'
        server_version = 'LoliCodeDownload'
        sys_version = ''

        def log_message(self, *arguments):
            pass

        def empty(self, code, location=None, allow=None):
            self.send_response(code)
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', '0')
            self.send_header('X-Content-Type-Options', 'nosniff')
            if location:
                self.send_header('Location', location)
            if allow:
                self.send_header('Allow', allow)
            self.end_headers()

        def route(self):
            # Compare raw request targets. Queries, encodings and proxy URLs fail closed.
            asset = routes.get(self.path)
            if asset is None:
                self.empty(404)
                return
            target = (config.r2_origin + OBJECT_PREFIX + asset if cache.healthy(asset)
                      else GITHUB_PREFIX + asset)
            self.empty(302, target)

        do_GET = route
        do_HEAD = route

        def unsupported(self):
            self.close_connection = True
            self.empty(405, allow='GET, HEAD')

        do_POST = unsupported
        do_PUT = unsupported
        do_PATCH = unsupported
        do_DELETE = unsupported
        do_OPTIONS = unsupported
        do_TRACE = unsupported
        do_CONNECT = unsupported

    return DownloadHandler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    parser.add_argument('--port', type=int, default=18781)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error('Expected a nonprivileged port')
    config = load_configuration(args.config)
    cache = HealthCache(R2Probe(config))
    server = DownloadServer(('127.0.0.1', args.port), handler_class(config, cache))
    print('download-router ready on loopback:' + str(args.port) + ' (' + VERSION + ')', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
