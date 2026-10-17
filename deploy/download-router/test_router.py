import contextlib
import copy
import http.client
import io
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest

import router


def fixture():
    return {'version': '4.0.20', 'r2_origin': 'https://pub-unit-test.r2.dev',
            'assets': {name: {'bytes': 100, 'sha256': 'a' * 64} for name in router.ASSETS}}


def configuration(data=None):
    with tempfile.TemporaryDirectory(prefix='lolicode-router-test-') as directory:
        path = Path(directory) / 'config.json'
        path.write_text(json.dumps(data or fixture()))
        return router.load_configuration(path)


class ConfigurationTests(unittest.TestCase):
    def test_exact_fixed_release_assets(self):
        config = configuration()
        self.assertEqual(set(config.assets), router.ASSETS)
        self.assertEqual(config.r2_origin, fixture()['r2_origin'])

    def test_wrong_origins_and_url_parameters_fail_closed(self):
        for origin in ['http://pub-unit-test.r2.dev', 'https://example.com',
                       'https://pub-unit-test.r2.dev.evil.example',
                       'https://user:pass@pub-unit-test.r2.dev',
                       'https://pub-unit-test.r2.dev:443',
                       'https://pub-unit-test.r2.dev/path',
                       'https://pub-unit-test.r2.dev?x=1',
                       'https://pub-unit-test.r2.dev#fragment']:
            with self.subTest(origin=origin):
                data = fixture()
                data['r2_origin'] = origin
                with self.assertRaises(ValueError):
                    configuration(data)

    def test_unknown_fields_version_and_asset_are_rejected(self):
        for mutate in [lambda data: data.update(version='4.0.19'),
                       lambda data: data.update(arbitrary_proxy=True),
                       lambda data: data['assets'].update({'unknown.exe': {'bytes': 1, 'sha256': 'a'*64}}),
                       lambda data: data['assets'].pop(router.INSTALLER)]:
            data = fixture()
            mutate(data)
            with self.assertRaises(ValueError):
                configuration(data)

    def test_asset_metadata_is_complete_and_bounded(self):
        for entry in [{'bytes': True, 'sha256': 'a'*64}, {'bytes': 0, 'sha256': 'a'*64},
                      {'bytes': 2**53, 'sha256': 'a'*64}, {'bytes': '100', 'sha256': 'a'*64},
                      {'bytes': 100, 'sha256': 'z'*64}, {'bytes': 100},
                      {'bytes': 100, 'sha256': 'a'*64, 'url': 'https://example.com'}]:
            data = fixture()
            data['assets'][router.INSTALLER] = entry
            with self.assertRaises(ValueError):
                configuration(data)

    def test_published_configuration_has_three_known_assets(self):
        config = router.load_configuration(Path(__file__).with_name('config-release20.json'))
        self.assertEqual(config.r2_origin, 'https://pub-250df9737586416fbd6e8cb0a843b249.r2.dev')
        self.assertEqual(config.assets[router.INSTALLER].size, 23121161)
        self.assertEqual(config.assets[router.INSTALLER + '.sig'].size, 420)
        self.assertEqual(config.assets['LoliCode-Portable.zip'].size, 27864792)


class Response:
    def __init__(self, status=200, headers=None):
        self.status = status
        self.headers = headers if headers is not None else {'Content-Length': '100'}

    def __enter__(self):
        return self

    def __exit__(self, *arguments):
        pass


class Opener:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.calls = []

    def open(self, request, timeout):
        self.calls.append((request, timeout))
        if self.error:
            raise self.error
        return self.response


class ProbeTests(unittest.TestCase):
    def test_head_uses_only_fixed_url_and_no_user_credentials(self):
        config = configuration()
        opener = Opener(Response())
        self.assertTrue(router.R2Probe(config, opener)(router.INSTALLER))
        request, timeout = opener.calls[0]
        self.assertEqual(request.get_method(), 'HEAD')
        self.assertEqual(request.full_url, config.r2_origin + router.OBJECT_PREFIX + router.INSTALLER)
        self.assertEqual(timeout, 1.2)
        self.assertIsNone(request.get_header('Authorization'))
        self.assertIsNone(request.get_header('Cookie'))

    def test_rate_limit_bad_size_hash_encoding_or_redirect_is_unhealthy(self):
        responses = [Response(status=429), Response(status=302),
                     Response(headers={}), Response(headers={'Content-Length': '101'}),
                     Response(headers={'Content-Length': '100', 'x-amz-meta-sha256': 'b'*64}),
                     Response(headers={'Content-Length': '100', 'Content-Encoding': 'gzip'})]
        for response in responses:
            with self.subTest(status=response.status, headers=response.headers):
                self.assertFalse(router.R2Probe(configuration(), Opener(response))(router.INSTALLER))

    def test_matching_metadata_hash_is_accepted(self):
        response = Response(headers={'Content-Length': '100', 'x-amz-meta-sha256': 'A'*64})
        self.assertTrue(router.R2Probe(configuration(), Opener(response))(router.INSTALLER))

    def test_timeouts_and_network_failures_are_unhealthy(self):
        for error in [TimeoutError(), OSError('offline')]:
            self.assertFalse(router.R2Probe(configuration(), Opener(error=error))(router.INSTALLER))

    def test_unknown_asset_does_not_make_a_request(self):
        opener = Opener(Response())
        self.assertFalse(router.R2Probe(configuration(), opener)('unknown.exe'))
        self.assertEqual(opener.calls, [])

    def test_redirects_are_never_followed(self):
        self.assertIsNone(router.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://example.com'))


class CacheTests(unittest.TestCase):
    def test_positive_cache_and_expiry(self):
        now = [100.0]
        calls = []
        cache = router.HealthCache(lambda name: calls.append(name) or True, clock=lambda: now[0])
        self.assertTrue(cache.healthy(router.INSTALLER))
        now[0] += 29
        self.assertTrue(cache.healthy(router.INSTALLER))
        self.assertEqual(len(calls), 1)
        now[0] += 2
        self.assertTrue(cache.healthy(router.INSTALLER))
        self.assertEqual(len(calls), 2)

    def test_failure_cache_has_shorter_expiry(self):
        now = [100.0]
        calls = []
        cache = router.HealthCache(lambda name: calls.append(name) or False, clock=lambda: now[0])
        self.assertFalse(cache.healthy(router.INSTALLER))
        now[0] += 2
        self.assertFalse(cache.healthy(router.INSTALLER))
        self.assertEqual(len(calls), 1)
        now[0] += 2
        self.assertFalse(cache.healthy(router.INSTALLER))
        self.assertEqual(len(calls), 2)

    def test_concurrent_requests_share_one_head(self):
        started = threading.Event()
        finish = threading.Event()
        calls = []
        results = []
        def probe(name):
            calls.append(name)
            started.set()
            finish.wait(1)
            return True
        cache = router.HealthCache(probe)
        workers = [threading.Thread(target=lambda: results.append(cache.healthy(router.INSTALLER))) for _ in range(8)]
        for worker in workers:
            worker.start()
        self.assertTrue(started.wait(1))
        finish.set()
        for worker in workers:
            worker.join(2)
            self.assertFalse(worker.is_alive())
        self.assertEqual(calls, [router.INSTALLER])
        self.assertEqual(results, [True]*8)

    def test_stalled_probe_is_bounded_and_does_not_spawn_more_work(self):
        finish = threading.Event()
        calls = []
        def probe(name):
            calls.append(name)
            finish.wait(1)
            return True
        cache = router.HealthCache(probe, wait_timeout=0.04)
        try:
            before = time.monotonic()
            self.assertFalse(cache.healthy(router.INSTALLER))
            self.assertFalse(cache.healthy(router.INSTALLER))
            self.assertLess(time.monotonic() - before, 0.3)
            self.assertEqual(calls, [router.INSTALLER])
        finally:
            finish.set()

    def test_probe_exception_and_unknown_asset_fail_closed(self):
        calls = []
        def probe(name):
            calls.append(name)
            raise RuntimeError('simulated failure')
        cache = router.HealthCache(probe)
        self.assertFalse(cache.healthy(router.INSTALLER))
        self.assertFalse(cache.healthy('unknown.exe'))
        self.assertEqual(calls, [router.INSTALLER])


@contextlib.contextmanager
def running_server(healthy):
    config = configuration()
    cache = router.HealthCache(lambda name: healthy)
    server = router.DownloadServer(('127.0.0.1', 0), router.handler_class(config, cache))
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        yield server.server_address, config
    finally:
        server.shutdown()
        server.server_close()
        worker.join(2)


def request(address, method, path, headers=None):
    client = http.client.HTTPConnection(*address, timeout=2)
    try:
        client.request(method, path, headers=headers or {})
        response = client.getresponse()
        body = response.read()
        return response.status, dict(response.getheaders()), body
    finally:
        client.close()


class HTTPTests(unittest.TestCase):
    def test_get_and_head_redirect_three_assets_to_healthy_r2_without_bodies(self):
        with running_server(True) as (address, config):
            for asset in router.ASSETS:
                for method in ['GET', 'HEAD']:
                    status, headers, body = request(address, method, router.PATH_PREFIX + asset)
                    self.assertEqual(status, 302)
                    self.assertEqual(headers['Location'], config.r2_origin + router.OBJECT_PREFIX + asset)
                    self.assertEqual(headers['Cache-Control'], 'no-store')
                    self.assertEqual(headers['Content-Length'], '0')
                    self.assertEqual(body, b'')

    def test_unhealthy_r2_redirects_only_to_same_version_github(self):
        with running_server(False) as (address, config):
            for asset in router.ASSETS:
                status, headers, body = request(address, 'GET', router.PATH_PREFIX + asset)
                self.assertEqual(status, 302)
                self.assertEqual(headers['Location'], router.GITHUB_PREFIX + asset)
                self.assertEqual(body, b'')

    def test_unknown_query_encoded_and_old_version_paths_are_rejected(self):
        with running_server(True) as (address, config):
            for path in ['/', '/healthz', router.PATH_PREFIX, router.PATH_PREFIX + 'unknown.exe',
                         router.PATH_PREFIX + router.INSTALLER + '?url=https://example.com',
                         router.PATH_PREFIX + router.INSTALLER + '#fragment',
                         router.PATH_PREFIX + '%4ColiCode-Portable.zip',
                         router.PATH_PREFIX.replace('4.0.20', '4.0.19') + router.INSTALLER,
                         'https://example.com' + router.PATH_PREFIX + router.INSTALLER]:
                status, headers, body = request(address, 'GET', path)
                self.assertEqual(status, 404, path)
                self.assertNotIn('Location', headers)

    def test_methods_other_than_get_head_are_rejected(self):
        with running_server(True) as (address, config):
            for method in ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE', 'CONNECT']:
                status, headers, body = request(address, method, router.PATH_PREFIX + router.INSTALLER)
                self.assertEqual(status, 405)
                self.assertEqual(headers['Allow'], 'GET, HEAD')
                self.assertNotIn('Location', headers)

    def test_request_logging_does_not_emit_client_headers_or_ip(self):
        output = io.StringIO()
        with contextlib.redirect_stderr(output):
            with running_server(True) as (address, config):
                request(address, 'GET', router.PATH_PREFIX + router.INSTALLER,
                        {'Authorization': 'private-test-only', 'Cookie': 'private-test-cookie'})
        self.assertEqual(output.getvalue(), '')


if __name__ == '__main__':
    unittest.main(verbosity=2)
