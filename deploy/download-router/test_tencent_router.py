"""Offline acceptance for the opt-in Tencent signer; no real CDN/key access.

Run beside this file: python -m unittest -v test_tencent_router
Only the HTTP adapter tests bind a socket, always to 127.0.0.1 with port 0.
"""
import concurrent.futures
import contextlib
import copy
from dataclasses import replace
import hashlib
import hmac
import http.client
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest import mock
from urllib.parse import urlsplit

import tencent_router as router


SYNTHETIC_KEY = 'LocalTestKeyOnlyDoNotDeploy2026'
NOW = 1_800_000_000
ASSET = 'LoliCode-4.0.20-Windows-x64-Setup.exe'
EXPECTED_ASSETS = {
    ASSET: {'bytes': 23121161,
            'sha256': 'e54945269861d68b2abe5d2cd03571af9c420d6a414682879cbce7ed63cc7af5'},
    ASSET + '.sig': {'bytes': 420,
                    'sha256': '5489a48a18feb97d4d1b403070c1108eea000c500c33a2d14cd0c0b10624cc96'},
    'LoliCode-Portable.zip': {'bytes': 27864792,
                            'sha256': '7dcdfe7ffb5e7daea3d71654992789961bd6514bcb53538efcdfad7dea71f270'},
}


def fixture(enabled=False):
    return {
        'version': router.VERSION,
        'enabled': enabled,
        'cdn_origin': router.CDN_ORIGIN,
        'key_file': router.KEY_PATH,
        'auth_ttl_seconds': 300,
        'gates': {gate: enabled for gate in sorted(router.GATES)},
        'limits': {'window_seconds': 60, 'max_requests': 7,
                   'block_seconds': 120, 'max_clients': 64, 'ipv6_prefix': 64},
        'assets': copy.deepcopy(EXPECTED_ASSETS),
    }


def configuration(data=None):
    with tempfile.TemporaryDirectory(prefix='lolicode-tencent-test-') as directory:
        path = Path(directory) / 'config.json'
        path.write_text(json.dumps(fixture() if data is None else data), encoding='utf-8')
        return router.load_configuration(path)


def fake_cdn_accepts(url, *, key=SYNTHETIC_KEY, now=NOW, ttl=300,
                     allowed_paths=None):
    """Independent origin/path/time/MAC verifier; never invokes signing code."""
    parsed = urlsplit(url)
    if (parsed.scheme != 'https' or parsed.netloc != 'downloads.treasuregrove.art'
            or parsed.fragment or parsed.username or parsed.password):
        return False
    if allowed_paths is None:
        allowed_paths = {router.OBJECT_PREFIX + name for name in router.ASSETS}
    if parsed.path not in allowed_paths:
        return False
    fields = re.fullmatch(r'sign=([1-9][0-9]*)-([A-Za-z0-9]{0,100})-0-([0-9a-f]{32})', parsed.query)
    if fields is None:
        return False
    timestamp, random, received_mac = fields.groups()
    age = now - int(timestamp)
    if age < 0 or age > ttl:
        return False
    # The algorithm and field order are spelled out here, independent of the
    # production helper and its returned URL.
    material = '-'.join([parsed.path, timestamp, random, '0', key]).encode('ascii')
    expected_mac = hashlib.md5(material, usedforsecurity=False).hexdigest()
    return hmac.compare_digest(received_mac, expected_mac)


class Clock:
    def __init__(self, now=1000.0):
        self.now = now

    def __call__(self):
        return self.now


def application(*, config=None, signer=None, limits=None, clock=None):
    config = configuration(fixture(enabled=True)) if config is None else config
    if limits is not None:
        config = replace(config, limits=limits)
    signer = router.TypeASigner(SYNTHETIC_KEY, router.CDN_ORIGIN,
                               clock=lambda: NOW, random_string=lambda: 'localTestNonce') if signer is None else signer
    limiter = router.RateLimiter(config.limits, clock=clock or Clock())
    return router.Application(config, signer, limiter)


class SigningTests(unittest.TestCase):
    def test_official_type_a_test_jpg_vector(self):
        # Tencent's official Type A example:
        # https://cloud.tencent.com/document/product/228/41623
        url = router.sign_type_a(router.CDN_ORIGIN, '/test.jpg',
                                 'dimtm5evg50ijsx2hvuwyfoiu65', 1582791032,
                                 'im1acp76sx9sdqe601v')
        self.assertEqual(url, router.CDN_ORIGIN + '/test.jpg?sign='
                         '1582791032-im1acp76sx9sdqe601v-0-3fbb88382c9356b6faaf9d68c7b2ae3a')
        self.assertTrue(fake_cdn_accepts(url, key='dimtm5evg50ijsx2hvuwyfoiu65',
                                       now=1582791032, allowed_paths={'/test.jpg'}))

    def test_all_exact_assets_pass_independent_cdn_verification(self):
        signer = router.TypeASigner(SYNTHETIC_KEY, router.CDN_ORIGIN,
                                   clock=lambda: NOW + 0.9, random_string=lambda: 'fakeNonce')
        for asset in router.ASSETS:
            with self.subTest(asset=asset):
                url = signer(asset)
                self.assertTrue(fake_cdn_accepts(url))
                self.assertTrue(fake_cdn_accepts(url, now=NOW + 300))
                self.assertFalse(fake_cdn_accepts(url, now=NOW + 301))
                self.assertFalse(fake_cdn_accepts(url, now=NOW - 1))
                self.assertNotIn(SYNTHETIC_KEY, url)

    def test_cdn_rejects_path_mac_timestamp_random_origin_and_query_mutations(self):
        url = router.TypeASigner(SYNTHETIC_KEY, router.CDN_ORIGIN,
                                 clock=lambda: NOW, random_string=lambda: 'localNonce')(ASSET)
        mutations = [
            url.replace(ASSET, 'LoliCode-Portable.zip'),
            url.replace(str(NOW), str(NOW + 1)),
            url.replace('localNonce', 'changedNonce'),
            url[:-1] + ('0' if url[-1] != '0' else '1'),
            url.replace('https://', 'http://'),
            url.replace('downloads.treasuregrove.art', 'downloads.treasuregrove.art.evil.invalid'),
            url + '&extra=1', url + '&sign=duplicate', url + '#fragment',
            url.replace('/releases/', '/releases/%2e%2e/'),
        ]
        for changed in mutations:
            with self.subTest(changed=changed):
                self.assertFalse(fake_cdn_accepts(changed))

    def test_signing_rejects_ambiguous_or_unsafe_inputs(self):
        valid = [router.CDN_ORIGIN, '/test.jpg', SYNTHETIC_KEY, NOW, 'nonce']
        cases = {
            0: ['http://example.invalid', router.CDN_ORIGIN + '/', router.CDN_ORIGIN + ':443',
                'https://user:pass@downloads.treasuregrove.art', router.CDN_ORIGIN + '?q=1'],
            1: ['test.jpg', '//test.jpg', '/a//b', '/a/../b', '/a/./b', '/%2e%2e/b',
                '/a?query', '/a#fragment', '/a\\b', '/a\r\nLocation:evil'],
            2: ['', 'short', 'spaces are forbidden', 'x' * 41],
            3: [0, -1, True, 1.5, '1800000000'],
            4: ['with-hyphen', 'with space', 'x' * 101, 'nonce\n'],
        }
        for position, values in cases.items():
            for value in values:
                args = valid.copy()
                args[position] = value
                with self.subTest(position=position, value=value):
                    with self.assertRaises(ValueError):
                        router.sign_type_a(*args)

    def test_unknown_asset_never_signed(self):
        signer = router.TypeASigner(SYNTHETIC_KEY, router.CDN_ORIGIN)
        for asset in ['unknown.exe', '../' + ASSET, ASSET + '?x=1', router.OBJECT_PREFIX + ASSET]:
            with self.subTest(asset=asset), self.assertRaises(ValueError):
                signer(asset)


class ConfigurationTests(unittest.TestCase):
    def test_release_surface_matches_reviewed_three_artifacts(self):
        self.assertEqual(router.VERSION, '4.0.20')
        self.assertEqual(router.CDN_ORIGIN, 'https://downloads.treasuregrove.art')
        self.assertEqual(router.PATH_PREFIX, '/downloads/tencent/4.0.20/')
        self.assertEqual(router.OBJECT_PREFIX, '/lolicode/releases/4.0.20/')
        self.assertEqual(router.ASSETS, EXPECTED_ASSETS)
        self.assertEqual(router.GATES, {'cos_private', 'cdn_cap', 'type_a', 'real_ip'})

    def test_example_and_defaults_are_disabled_until_every_gate_verified(self):
        example = router.load_configuration(Path(__file__).with_name('tencent-router.example.json'))
        self.assertFalse(example.enabled)
        self.assertFalse(router.ready(example))
        config = configuration()
        self.assertFalse(router.ready(config))
        data = fixture(enabled=True)
        self.assertTrue(router.ready(configuration(data)))
        for gate in router.GATES:
            changed = copy.deepcopy(data)
            changed['gates'][gate] = False
            with self.subTest(gate=gate):
                self.assertFalse(router.ready(configuration(changed)))

    def test_fixed_release_and_exact_metadata_cannot_be_repointed(self):
        mutations = [
            lambda d: d.update(version='4.0.19'),
            lambda d: d.update(extra='unknown'),
            lambda d: d.pop('assets'),
            lambda d: d['assets'].pop(ASSET),
            lambda d: d['assets'].update({'unknown.exe': {'bytes': 1, 'sha256': 'a' * 64}}),
            lambda d: d['assets'][ASSET].update(bytes=router.ASSETS[ASSET]['bytes'] + 1),
            lambda d: d['assets'][ASSET].update(sha256='a' * 64),
            lambda d: d['assets'][ASSET].update(url='https://evil.invalid/package'),
            lambda d: d.update(key_file='/tmp/unreviewed-key'),
            lambda d: d.update(enabled=1),
        ]
        for index, mutate in enumerate(mutations):
            data = fixture()
            mutate(data)
            with self.subTest(index=index), self.assertRaises(ValueError):
                configuration(data)

    def test_asset_size_must_be_integer_not_coercible_float(self):
        data = fixture()
        data['assets'][ASSET]['bytes'] = float(router.ASSETS[ASSET]['bytes'])
        with self.assertRaises(ValueError):
            configuration(data)

    def test_origin_must_be_exact_canonical_reviewed_host(self):
        for origin in ['http://downloads.treasuregrove.art', router.CDN_ORIGIN + '/',
                       router.CDN_ORIGIN + ':443', router.CDN_ORIGIN + '/files',
                       router.CDN_ORIGIN + '?a=1', router.CDN_ORIGIN + '#fragment',
                       router.CDN_ORIGIN + '.evil.invalid',
                       'https://user:pass@downloads.treasuregrove.art']:
            data = fixture()
            data['cdn_origin'] = origin
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                configuration(data)

    def test_gate_schema_rejects_missing_extra_and_non_boolean_flags(self):
        mutations = [lambda d: d['gates'].pop('cos_private'),
                     lambda d: d['gates'].update(unknown=True),
                     lambda d: d['gates'].update(type_a=1),
                     lambda d: d.update(gates=[])]
        for index, mutate in enumerate(mutations):
            data = fixture()
            mutate(data)
            with self.subTest(index=index), self.assertRaises(ValueError):
                configuration(data)

    def test_rate_limits_and_ttl_are_bounded_strict_integers(self):
        ranges = {'window_seconds': (1, 3600), 'max_requests': (1, 1000),
                  'block_seconds': (1, 86400), 'max_clients': (1, 65536),
                  'ipv6_prefix': (48, 128)}
        for name, (low, high) in ranges.items():
            for bad in [low - 1, high + 1, True, 1.0, '1']:
                data = fixture()
                data['limits'][name] = bad
                with self.subTest(name=name, bad=bad), self.assertRaises(ValueError):
                    configuration(data)
        for bad in [59, 601, True, 300.0, '300']:
            data = fixture()
            data['auth_ttl_seconds'] = bad
            with self.subTest(ttl=bad), self.assertRaises(ValueError):
                configuration(data)

    def test_duplicate_fields_and_oversize_configuration_rejected(self):
        with tempfile.TemporaryDirectory(prefix='lolicode-tencent-config-') as directory:
            path = Path(directory) / 'config.json'
            for raw in ['{"enabled": false, "enabled": true}', ' ' * 65537]:
                path.write_text(raw, encoding='utf-8')
                with self.subTest(length=len(raw)), self.assertRaises(ValueError):
                    router.load_configuration(path)

    def test_disabled_main_neither_loads_secret_nor_opens_listener(self):
        with tempfile.TemporaryDirectory(prefix='lolicode-tencent-disabled-') as directory:
            path = Path(directory) / 'config.json'
            path.write_text(json.dumps(fixture()), encoding='utf-8')
            with mock.patch.object(sys, 'argv', ['tencent_router.py', '--config', str(path)]), \
                    mock.patch.object(router, 'read_secret') as load_secret, \
                    mock.patch.object(router, 'LocalServer') as listener:
                with self.assertRaises(RuntimeError):
                    router.main()
                load_secret.assert_not_called()
                listener.assert_not_called()
            process = subprocess.run([sys.executable, str(Path(router.__file__)), '--config', str(path)],
                                     capture_output=True, text=True, timeout=10, check=False)
            self.assertEqual(process.returncode, 1)
            self.assertEqual(process.stdout, '')
            self.assertEqual(process.stderr.strip(), 'tencent signer could not start or stopped')
            self.assertNotIn(str(path), process.stderr)
            self.assertNotIn(SYNTHETIC_KEY, process.stderr)

    @unittest.skipUnless(os.name == 'posix', 'Production credential permissions require POSIX')
    def test_synthetic_secret_requires_private_regular_file_and_never_follows_symlink(self):
        with tempfile.TemporaryDirectory(prefix='lolicode-tencent-key-') as directory:
            path = Path(directory) / 'synthetic-key'
            path.write_text(SYNTHETIC_KEY + '\n', encoding='ascii')
            path.chmod(0o600)
            self.assertEqual(router.read_secret(path), SYNTHETIC_KEY)
            path.chmod(0o644)
            with self.assertRaises(ValueError):
                router.read_secret(path)
            path.chmod(0o600)
            link = Path(directory) / 'symlink'
            link.symlink_to(path)
            with self.assertRaises(OSError):
                router.read_secret(link)
            path.write_text('x' * 129, encoding='ascii')
            with self.assertRaises(ValueError):
                router.read_secret(path)


class IdentityAndRateLimitTests(unittest.TestCase):
    @unittest.skipUnless(os.name == 'posix' and hasattr(os,'geteuid') and os.geteuid()==0, 'Exact systemd credential ownership requires root POSIX fixture')
    def test_systemd_acl_mask_is_accepted_only_in_exact_root_owned_runtime_slot(self):
        with tempfile.TemporaryDirectory(prefix='lolicode-credential-slot-') as directory:
            path=Path(directory)/'cdn-key'
            path.write_text(SYNTHETIC_KEY,encoding='ascii');path.chmod(0o440)
            with self.assertRaises(ValueError): router.read_secret(path)
            with mock.patch.object(router,'KEY_PATH',str(path)), mock.patch.dict(os.environ,{'CREDENTIALS_DIRECTORY':directory}):
                self.assertEqual(router.read_secret(path),SYNTHETIC_KEY)
                path.chmod(0o444)
                with self.assertRaises(ValueError): router.read_secret(path)
                path.chmod(0o640)
                with self.assertRaises(ValueError): router.read_secret(path)
                path.chmod(0o440)
                with mock.patch.dict(os.environ,{'CREDENTIALS_DIRECTORY':directory+'/wrong'}):
                    with self.assertRaises(ValueError): router.read_secret(path)

    def test_normalized_ipv4_mapped_ipv4_and_ipv6_network(self):
        self.assertEqual(router.client_identity('198.51.100.7'), '198.51.100.7')
        self.assertEqual(router.client_identity('::ffff:198.51.100.7'), '198.51.100.7')
        self.assertEqual(router.client_identity('2001:0db8:1234:5678:0:0:0:abcd'),
                         '2001:db8:1234:5678::/64')
        self.assertEqual(router.client_identity('2001:db8:1234:5678::abcd', 128),
                         '2001:db8:1234:5678::abcd/128')

    def test_invalid_or_ambiguous_forwarded_addresses_are_rejected(self):
        for raw in ['', None, ' 198.51.100.7', '198.51.100.7 ', '198.51.100.7, 192.0.2.1',
                    '198.51.100.007', '[2001:db8::1]', '2001:db8::1/64', 'fe80::1%eth0',
                    '0.0.0.0', '::', '224.0.0.1', 'ff02::1', 'not-an-ip', '1' * 65]:
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                router.client_identity(raw)

    def test_sliding_window_exact_boundary_and_block_does_not_extend_on_retry(self):
        clock = Clock()
        limits = router.RateLimits(60, 2, 120, 10, 64)
        limiter = router.RateLimiter(limits, clock)
        self.assertEqual(limiter.check('198.51.100.7'), (200, 0))
        clock.now += 30
        self.assertEqual(limiter.check('198.51.100.7'), (200, 0))
        clock.now += 30
        self.assertEqual(limiter.check('198.51.100.7'), (200, 0))
        self.assertEqual(limiter.check('198.51.100.7'), (429, 120))
        clock.now += 0.25
        self.assertEqual(limiter.check('198.51.100.7'), (429, 120))
        clock.now += 99.75
        self.assertEqual(limiter.check('198.51.100.7'), (429, 20))
        clock.now += 20
        self.assertEqual(limiter.check('198.51.100.7'), (200, 0))

    def test_capacity_fails_closed_then_reclaims_only_expired_clients(self):
        clock = Clock()
        limiter = router.RateLimiter(router.RateLimits(60, 1, 120, 2, 64), clock)
        self.assertEqual(limiter.check('198.51.100.1'), (200, 0))
        self.assertEqual(limiter.check('198.51.100.1'), (429, 120))
        self.assertEqual(limiter.check('198.51.100.2'), (200, 0))
        self.assertEqual(limiter.check('198.51.100.3'), (503, 60))
        clock.now += 60
        self.assertEqual(limiter.check('198.51.100.3'), (200, 0))
        self.assertEqual(limiter.check('198.51.100.1'), (429, 60))

    def assert_concurrent_quota(self, raw_addresses):
        limiter = router.RateLimiter(router.RateLimits(60, 7, 120, 64, 64), Clock())
        barrier = threading.Barrier(16)

        def request(index):
            barrier.wait(timeout=10)
            return limiter.check(router.client_identity(raw_addresses[index]))[0]

        with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
            statuses = list(pool.map(request, range(16)))
        self.assertEqual(statuses.count(200), 7)
        self.assertEqual(statuses.count(429), 9)
        self.assertNotIn(503, statuses)

    def test_concurrent_same_ipv4_has_no_limit_race(self):
        self.assert_concurrent_quota(['198.51.100.7'] * 16)

    def test_concurrent_ipv4_and_mapped_ipv4_share_quota(self):
        self.assert_concurrent_quota(['198.51.100.7', '::ffff:198.51.100.7'] * 8)

    def test_concurrent_ipv6_privacy_addresses_share_64_prefix_quota(self):
        self.assert_concurrent_quota([f'2001:db8:1234:5678::{index + 1:x}' for index in range(16)])

    def test_concurrent_unique_clients_cannot_exceed_memory_capacity(self):
        limiter = router.RateLimiter(router.RateLimits(60, 7, 120, 4, 64), Clock())
        barrier = threading.Barrier(16)

        def request(index):
            barrier.wait(timeout=10)
            return limiter.check(f'198.51.100.{index + 1}')[0]

        with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
            statuses = list(pool.map(request, range(16)))
        self.assertEqual(statuses.count(200), 4)
        self.assertEqual(statuses.count(503), 12)
        self.assertLessEqual(len(limiter._entries), 4)

    def test_distinct_ipv6_networks_have_independent_quota(self):
        limiter = router.RateLimiter(router.RateLimits(60, 1, 120, 10, 64), Clock())
        for raw in ['2001:db8:1::1', '2001:db8:2::1']:
            self.assertEqual(limiter.check(router.client_identity(raw)), (200, 0))


class ApplicationTests(unittest.TestCase):
    def test_only_three_exact_routes_get_or_head_can_redirect(self):
        app = application()
        for asset in router.ASSETS:
            for method in ['GET', 'HEAD']:
                with self.subTest(asset=asset, method=method):
                    status, headers = app.decide(method, router.PATH_PREFIX + asset,
                                                 ['198.51.100.7'], '127.0.0.1')
                    self.assertEqual(status, 302)
                    self.assertTrue(fake_cdn_accepts(headers['Location']))

    def test_query_encoding_traversal_unknown_and_other_version_routes_fail_closed(self):
        route = router.PATH_PREFIX + ASSET
        for path in [route + '?x=1', route + '#fragment', route + '/', route.replace('.exe', '%2eexe'),
                     router.PATH_PREFIX + '../' + ASSET, '/downloads/tencent/4.0.19/' + ASSET,
                     '/downloads/4.0.20/' + ASSET, '/', 'https://evil.invalid' + route]:
            with self.subTest(path=path):
                self.assertEqual(application().decide('GET', path, ['198.51.100.7'], '127.0.0.1'), (404, {}))

    def test_methods_do_not_invoke_signer_or_consume_quota(self):
        signer = mock.Mock()
        app = application(signer=signer)
        for method in ['POST', 'PUT', 'DELETE', 'OPTIONS', 'TRACE', 'CONNECT', 'get']:
            self.assertEqual(app.decide(method, router.PATH_PREFIX + ASSET,
                                       ['198.51.100.7'], '127.0.0.1'), (405, {'Allow': 'GET, HEAD'}))
        signer.assert_not_called()
        self.assertEqual(len(app.limiter._entries), 0)

    def test_disabled_or_unverified_gates_never_call_signer_or_rate_limiter(self):
        data = fixture(enabled=True)
        configs = [configuration()]
        for gate in router.GATES:
            changed = copy.deepcopy(data)
            changed['gates'][gate] = False
            configs.append(configuration(changed))
        for config in configs:
            signer = mock.Mock()
            app = application(config=config, signer=signer)
            status, headers = app.decide('GET', router.PATH_PREFIX + ASSET, ['198.51.100.7'], '127.0.0.1')
            self.assertEqual((status, headers), (503, {'Retry-After': '60'}))
            signer.assert_not_called()
            self.assertEqual(len(app.limiter._entries), 0)

    def test_only_loopback_peer_and_one_valid_dedicated_header_are_trusted(self):
        path = router.PATH_PREFIX + ASSET
        for peer, headers, expected in [('198.51.100.7', ['192.0.2.1'], 403),
                                         ('not-an-ip', ['192.0.2.1'], 400),
                                         ('127.0.0.1', [], 400),
                                         ('127.0.0.1', ['192.0.2.1', '192.0.2.2'], 400),
                                         ('127.0.0.1', ['192.0.2.1, 192.0.2.2'], 400),
                                         ('127.0.0.1', ['192.0.2.1 '], 400),
                                         ('::1', ['2001:db8::1'], 302)]:
            with self.subTest(peer=peer, headers=headers):
                self.assertEqual(application().decide('GET', path, headers, peer)[0], expected)

    def test_429_and_capacity_503_have_retry_after_and_never_sign(self):
        signer = mock.Mock(return_value=router.TypeASigner(SYNTHETIC_KEY, router.CDN_ORIGIN,
                                                         clock=lambda: NOW)(ASSET))
        app = application(signer=signer, limits=router.RateLimits(60, 1, 120, 1, 64))
        path = router.PATH_PREFIX + ASSET
        self.assertEqual(app.decide('GET', path, ['198.51.100.1'], '127.0.0.1')[0], 302)
        self.assertEqual(app.decide('GET', path, ['198.51.100.1'], '127.0.0.1'), (429, {'Retry-After': '120'}))
        self.assertEqual(app.decide('GET', path, ['198.51.100.2'], '127.0.0.1'), (503, {'Retry-After': '60'}))
        self.assertEqual(signer.call_count, 1)

    def test_signer_errors_or_open_redirect_candidates_fail_without_secret_output(self):
        valid = router.TypeASigner(SYNTHETIC_KEY, router.CDN_ORIGIN, clock=lambda: NOW)(ASSET)
        candidates = [None, '', valid.replace(router.CDN_ORIGIN, 'https://evil.invalid'),
                      valid + '\r\nLocation: https://evil.invalid', valid + '&extra=1',
                      valid.replace(ASSET, 'LoliCode-Portable.zip'),
                      valid.replace('-0-', '-1-')]
        for candidate in candidates:
            with self.subTest(candidate=candidate):
                app = application(signer=lambda asset: candidate)
                self.assertEqual(app.decide('GET', router.PATH_PREFIX + ASSET,
                                           ['198.51.100.7'], '127.0.0.1'), (503, {'Retry-After': '60'}))
        output = io.StringIO()
        app = application(signer=mock.Mock(side_effect=ValueError(SYNTHETIC_KEY)))
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            self.assertEqual(app.decide('GET', router.PATH_PREFIX + ASSET,
                                       ['198.51.100.7'], '127.0.0.1')[0], 503)
        self.assertEqual(output.getvalue(), '')


class HTTPAdapterTests(unittest.TestCase):
    def setUp(self):
        self.logs = io.StringIO()
        self.app = application(limits=router.RateLimits(60, 100, 120, 64, 64))
        self.server = router.LocalServer(('127.0.0.1', 0), router.handler_class(self.app))
        self.assertEqual(self.server.server_address[0], '127.0.0.1')
        self.thread = threading.Thread(target=self.server.serve_forever,
                                       kwargs={'poll_interval': 0.01}, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.assertFalse(self.thread.is_alive())

    def request(self, method='GET', path=None, headers=None):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=5)
        try:
            connection.putrequest(method, path or router.PATH_PREFIX + ASSET)
            for name, value in (headers if headers is not None else [('X-LoliCode-Client-IP', '198.51.100.7')]):
                connection.putheader(name, value)
            connection.endheaders()
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_http_get_and_head_redirect_with_no_body_no_cache_and_no_logs(self):
        with contextlib.redirect_stderr(self.logs), contextlib.redirect_stdout(self.logs):
            for method in ['GET', 'HEAD']:
                status, headers, body = self.request(method)
                self.assertEqual(status, 302)
                self.assertTrue(fake_cdn_accepts(headers['Location']))
                self.assertEqual(body, b'')
                self.assertEqual(headers['Content-Length'], '0')
                self.assertEqual(headers['Cache-Control'], 'private, no-store')
                self.assertEqual(headers['Referrer-Policy'], 'no-referrer')
                self.assertEqual(headers['X-Content-Type-Options'], 'nosniff')
                self.assertEqual(headers['Connection'], 'close')
        self.assertEqual(self.logs.getvalue(), '')

    def test_http_duplicate_missing_or_xff_only_identity_headers_are_rejected(self):
        cases = [[], [('X-Forwarded-For', '198.51.100.7')],
                 [('X-LoliCode-Client-IP', '198.51.100.7'), ('X-LoliCode-Client-IP', '192.0.2.1')]]
        for headers in cases:
            with self.subTest(headers=headers):
                self.assertEqual(self.request(headers=headers)[0], 400)
        # An attacker-supplied XFF does not override the dedicated trusted value.
        self.assertEqual(self.request(headers=[('X-LoliCode-Client-IP', '198.51.100.7'),
                                              ('X-Forwarded-For', 'evil.invalid')])[0], 302)

    def test_http_request_framing_is_rejected_even_if_length_zero(self):
        for framing in [[('Content-Length', '0')], [('Content-Length', '1')],
                        [('Transfer-Encoding', 'chunked')],
                        [('Content-Length', '0'), ('Transfer-Encoding', 'chunked')]]:
            with self.subTest(framing=framing):
                headers = [('X-LoliCode-Client-IP', '198.51.100.7')] + framing
                status, response_headers, body = self.request(headers=headers)
                self.assertEqual(status, 400)
                self.assertEqual(response_headers['Connection'], 'close')
                self.assertEqual(body, b'')

    def test_http_unknown_route_and_method_remain_nonredirects(self):
        self.assertEqual(self.request(path=router.PATH_PREFIX + ASSET + '?query=1')[0], 404)
        status, headers, body = self.request(method='POST')
        self.assertEqual(status, 405)
        self.assertEqual(headers['Allow'], 'GET, HEAD')
        self.assertEqual(body, b'')


class NginxTemplateContractTests(unittest.TestCase):
    def setUp(self):
        self.source = Path(__file__).with_name('tencent-nginx-locations.conf.template').read_text(encoding='utf-8')
        self.blocks = re.findall(r'^location = (\S+) \{\n(.*?)^\}', self.source,
                                 flags=re.MULTILINE | re.DOTALL)

    def test_exact_raw_routes_only_forward_to_fixed_loopback_service(self):
        expected = {router.PATH_PREFIX + name for name in EXPECTED_ASSETS}
        self.assertEqual({path for path, _ in self.blocks}, expected)
        self.assertEqual(len(self.blocks), 3)
        declarations = re.findall(r'^location[^\n]*', self.source, flags=re.MULTILINE)
        self.assertEqual(len(declarations), 3, 'No catch-all/prefix location may be added')
        for path, block in self.blocks:
            with self.subTest(path=path):
                self.assertIn(f'if ($request_uri != "{path}") {{ return 404; }}', block)
                self.assertIn('limit_except GET HEAD { deny all; }', block)
                self.assertEqual(re.findall(r'proxy_pass\s+([^;]+);', block), ['http://127.0.0.1:18782'])
                self.assertIn('proxy_redirect off;', block)

    def test_identity_framing_and_credentials_are_replaced_without_request_logging(self):
        for path, block in self.blocks:
            with self.subTest(path=path):
                self.assertIn('proxy_pass_request_headers off;', block)
                self.assertIn('proxy_pass_request_body off;', block)
                self.assertIn('proxy_set_header X-LoliCode-Client-IP $remote_addr;', block)
                self.assertIn('proxy_set_header Connection "close";', block)
                for name in ['Content-Length', 'Transfer-Encoding', 'X-Forwarded-For',
                             'X-Real-IP', 'CF-Connecting-IP', 'Forwarded', 'Cookie', 'Authorization']:
                    self.assertIn(f'proxy_set_header {name} "";', block)
                self.assertIn('access_log off;', block)
                self.assertIn('error_log /dev/null;', block)
                self.assertIn('proxy_hide_header Set-Cookie;', block)
                self.assertIn('add_header Cache-Control "private, no-store" always;', block)
                self.assertIn('add_header Referrer-Policy "no-referrer" always;', block)


if __name__ == '__main__':
    unittest.main()
