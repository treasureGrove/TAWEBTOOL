"""Tencent deployment acceptance: owned temp files and fake network/commands only.

Run with ``python -B -m unittest -v test_deploy_tencent``. Nothing in this module
contacts Tencent/Cloudflare, reads a real credential, or invokes system services.
"""
import copy
import hashlib
import hmac
from http import HTTPStatus
import io
import json
from pathlib import Path
import re
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request

import deploy_tencent as deploy


HERE = Path(__file__).resolve().parent
SYNTHETIC_KEY = 'OfflineDeploymentTestKey2026'
EXPECTED_CF = [
    '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
    '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
    '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
    '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
    '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
    '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
]


class DeploymentFixture(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='lolicode-tencent-deploy-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.payload = self.root / 'private-payload'
        self.payload.mkdir()
        self.etc = self.root / 'etc'
        self.etc.mkdir()
        self.main = self.etc / 'nginx-main.conf'
        self.main.write_bytes(b'reviewed main config left unchanged\n')
        self.snippet = self.etc / 'homepage-snippet.conf'
        self.original = (b'location = / { root /existing/site; }\n'
                         b'location ^~ /downloads/releases/ { return 404; }\n'
                         b'# Existing R2/GitHub exact release routes remain unchanged\n')
        self.snippet.write_bytes(self.original)
        self.unit = self.etc / deploy.SERVICE
        self.config = self.etc / 'tencent-router.json'
        self.release = self.root / 'opt' / deploy.BATCH
        self.credential = self.etc / 'lolicode-tencent-cdn.key'
        self.credential.write_text(SYNTHETIC_KEY, encoding='ascii')
        self.protected = {
            self.root / 'public' / 'updates' / 'latest.json': b'{"version":"4.0.20","source":"existing-R2"}',
            self.etc / 'lolicode-download-router.json': b'existing R2 configuration',
            self.etc / 'lolicode-download-router.service': b'existing R2 service',
            self.root / 'public' / 'index.html': b'existing homepage',
        }
        for path, data in self.protected.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        self.production = json.loads((HERE / 'tencent-router.example.json').read_bytes())
        self.production['enabled'] = True
        self.production['gates'] = {name: True for name in self.production['gates']}
        for name in deploy.FILES:
            content = json.dumps(self.production).encode() if name == deploy.CONFIG_NAME else (HERE / name).read_bytes()
            (self.payload / name).write_bytes(content)
        self.manifest()
        values = {
            'PAYLOAD': self.payload, 'MAIN': self.main, 'MAIN_SHA': deploy.sha(self.main.read_bytes()),
            'SNIPPET': self.snippet, 'SNIPPET_SHA': deploy.sha(self.original),
            'UNIT': self.unit, 'CONFIG': self.config, 'RELEASE': self.release,
            'CREDENTIAL': self.credential, 'PORT': 0,
        }
        for name, value in values.items():
            patcher = patch.object(deploy, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.commands = []
        self.mock_run = self.start_patch('run', side_effect=lambda *args: self.commands.append(args))
        self.mock_cf = self.start_patch('verify_cloudflare', return_value=list(EXPECTED_CF))
        self.mock_cdn = self.start_patch('verify_cdn', return_value=copy.deepcopy(deploy.ASSETS))
        self.mock_loopback = self.start_patch('loopback_check')
        self.print_patcher = patch('builtins.print')
        self.mock_print = self.print_patcher.start()
        self.addCleanup(self.print_patcher.stop)

    def start_patch(self, name, **kwargs):
        patcher = patch.object(deploy, name, **kwargs)
        result = patcher.start()
        self.addCleanup(patcher.stop)
        return result

    def manifest(self):
        data = {'batch': deploy.BATCH, 'version': deploy.VERSION,
                'files': {name: deploy.sha((self.payload / name).read_bytes()) for name in deploy.FILES}}
        (self.payload / 'manifest.json').write_text(json.dumps(data), encoding='utf-8')

    def set_production(self, data):
        (self.payload / deploy.CONFIG_NAME).write_text(json.dumps(data), encoding='utf-8')
        self.manifest()

    def snapshot(self):
        return {str(path.relative_to(self.root)): path.read_bytes()
                for path in self.root.rglob('*') if path.is_file()}

    def assert_protected(self):
        self.assertEqual(self.main.read_bytes(), b'reviewed main config left unchanged\n')
        self.assertEqual(self.credential.read_text(encoding='ascii'), SYNTHETIC_KEY)
        for path, expected in self.protected.items():
            self.assertEqual(path.read_bytes(), expected)
        outputs = repr(self.mock_print.call_args_list)
        self.assertNotIn(SYNTHETIC_KEY, outputs)
        receipt = self.payload / 'deployment-receipt.json'
        if receipt.exists():
            self.assertNotIn(SYNTHETIC_KEY.encode(), receipt.read_bytes())

    def test_preflight_is_read_only_and_records_both_verification_gates(self):
        before = self.snapshot()
        data, original, verified = deploy.preflight()
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(set(data), deploy.FILES)
        self.assertEqual(original, self.original)
        self.assertEqual(verified, {'cloudflareNetworks': EXPECTED_CF, 'cdnAssets': deploy.ASSETS})
        self.mock_cf.assert_called_once_with()
        self.mock_cdn.assert_called_once_with()
        self.assertEqual(self.commands, [('systemd-analyze', 'verify', '--man=no',
                                         str(self.payload / deploy.SERVICE))])
        self.assert_protected()

    def test_disabled_or_any_missing_gate_refuses_before_cloud_or_service_commands(self):
        mutations = [lambda d: d.update(enabled=False)]
        mutations.extend(lambda d, gate=gate: d['gates'].update({gate: False}) for gate in self.production['gates'])
        for index, mutate in enumerate(mutations):
            data = copy.deepcopy(self.production)
            mutate(data)
            self.set_production(data)
            with self.subTest(index=index), self.assertRaises((ValueError, RuntimeError)):
                deploy.preflight()
            self.assertEqual(self.commands, [])
            self.mock_cf.assert_not_called()
            self.mock_cdn.assert_not_called()
            self.assertFalse(self.unit.exists())

    def test_strict_production_config_rejects_unknown_origin_fields_and_asset_metadata(self):
        name = next(iter(deploy.ASSETS))
        mutations = [lambda d: d.update(cdn_origin='https://evil.invalid'),
                     lambda d: d.update(key_file='/tmp/unreviewed.key'),
                     lambda d: d.update(extra='unknown'),
                     lambda d: d['gates'].update(type_a=1),
                     lambda d: d['assets'][name].update(bytes=float(d['assets'][name]['bytes'])),
                     lambda d: d['assets'][name].update(sha256='a' * 64)]
        for index, mutate in enumerate(mutations):
            data = copy.deepcopy(self.production)
            mutate(data)
            self.set_production(data)
            with self.subTest(index=index), self.assertRaises((ValueError, RuntimeError)):
                deploy.preflight()
            self.assertEqual(self.commands, [])
            self.mock_cf.assert_not_called()
            self.mock_cdn.assert_not_called()

    def test_payload_byte_change_rejected_before_any_commands(self):
        (self.payload / 'tencent_router.py').write_bytes(b'changed after manifest')
        with self.assertRaisesRegex(RuntimeError, 'checksum mismatch'):
            deploy.preflight()
        self.assertEqual(self.commands, [])

    def test_template_rejects_broader_or_outside_cloudflare_trust_after_rehash(self):
        template = self.payload / 'tencent-nginx-locations.conf.template'
        original = template.read_text(encoding='utf-8')
        mutations = [
            original.replace('set_real_ip_from 173.245.48.0/20;', 'set_real_ip_from 0.0.0.0/0;', 1),
            'set_real_ip_from 173.245.48.0/20;\n' + original.replace('    set_real_ip_from 173.245.48.0/20;\n', '', 1),
            original.replace('real_ip_header CF-Connecting-IP;', 'real_ip_header X-Forwarded-For;', 1),
        ]
        for index, changed in enumerate(mutations):
            template.write_text(changed, encoding='utf-8')
            self.manifest()
            with self.subTest(index=index), self.assertRaises(RuntimeError):
                deploy.preflight()
            self.assertEqual(self.commands, [])
            self.mock_cf.assert_not_called()
            self.mock_cdn.assert_not_called()
        self.assert_protected()

    def test_template_cannot_target_r2_routes_global_changes_or_another_backend(self):
        template = self.payload / 'tencent-nginx-locations.conf.template'
        original = template.read_text(encoding='utf-8')
        mutations = [
            original.replace('/downloads/tencent/', '/downloads/releases/'),
            original + '\nlocation /unreviewed { return 302 https://evil.invalid; }\n',
            original.replace('proxy_pass http://127.0.0.1:18782;',
                             'proxy_pass https://pub-unreviewed.r2.dev;', 1),
        ]
        for index, changed in enumerate(mutations):
            template.write_text(changed, encoding='utf-8')
            self.manifest()
            with self.subTest(index=index), self.assertRaises(RuntimeError):
                deploy.preflight()
            self.assertEqual(self.commands, [])
            self.mock_cf.assert_not_called()
            self.mock_cdn.assert_not_called()
        self.assert_protected()

    def test_preexisting_targets_cannot_be_replaced_even_with_identical_bytes(self):
        for target in [self.unit, self.config, self.payload / 'deployment-receipt.json',
                       self.payload / 'production-snippet.before']:
            target.write_bytes(b'existing owner data')
            try:
                with self.subTest(target=target.name), self.assertRaisesRegex(RuntimeError, 'existing path'):
                    deploy.preflight()
                self.assertEqual(target.read_bytes(), b'existing owner data')
                self.assertEqual(self.commands, [])
            finally:
                target.unlink()

    def test_cas_stale_nginx_baseline_rejected_before_network_or_commands(self):
        self.snippet.write_bytes(self.original + b'# independent newer batch\n')
        with self.assertRaisesRegex(RuntimeError, 'baseline changed'):
            deploy.preflight()
        self.assertEqual(self.commands, [])
        self.mock_cf.assert_not_called()
        self.mock_cdn.assert_not_called()

    def test_cas_change_during_cloud_verification_preserved(self):
        newer = self.original + b'# concurrent update during asset check\n'
        self.mock_cdn.side_effect = lambda: (self.snippet.write_bytes(newer) and deploy.ASSETS)
        with self.assertRaises(RuntimeError):
            deploy.preflight()
        self.assertEqual(self.snippet.read_bytes(), newer)
        self.assertFalse(self.unit.exists())
        self.assertFalse(self.config.exists())

    def test_cloudflare_or_cdn_verification_failure_leaves_no_installation(self):
        for failing in [self.mock_cf, self.mock_cdn]:
            failing.side_effect = RuntimeError('synthetic independent gate failed')
            before = self.snapshot()
            try:
                with self.subTest(gate=failing), self.assertRaisesRegex(RuntimeError, 'independent gate'):
                    deploy.install()
                self.assertEqual(self.snapshot(), before)
                self.assertFalse(self.release.exists())
            finally:
                failing.side_effect = None

    def test_install_changes_only_new_targets_and_appends_three_routes(self):
        before = self.snapshot()
        deploy.install()
        self.assertEqual(self.unit.read_bytes(), (self.payload / deploy.SERVICE).read_bytes())
        self.assertEqual(self.config.read_bytes(), (self.payload / deploy.CONFIG_NAME).read_bytes())
        self.assertEqual((self.release / 'tencent_router.py').read_bytes(), (self.payload / 'tencent_router.py').read_bytes())
        updated = self.snippet.read_bytes()
        self.assertTrue(updated.startswith(self.original.rstrip() + b'\n\n'))
        self.assertEqual(updated.count(deploy.MARKER.encode()), 1)
        self.assertEqual(updated[len(self.original.rstrip()):].count(b'location = '), 3)
        receipt = json.loads((self.payload / 'deployment-receipt.json').read_bytes())
        self.assertEqual(receipt['state'], 'installed')
        self.assertEqual(receipt['batch'], deploy.BATCH)
        allowed = {str(path.relative_to(self.root)) for path in [
            self.snippet, self.unit, self.config, self.release / 'tencent_router.py',
            self.payload / 'production-snippet.before', self.payload / 'deployment-receipt.json']}
        after = self.snapshot()
        changed = {name for name in set(before) | set(after) if before.get(name) != after.get(name)}
        self.assertLessEqual(changed, allowed)
        self.assertIn(('nginx', '-t'), self.commands)
        self.assertIn(('systemctl', 'enable', deploy.SERVICE), self.commands)
        self.assert_protected()

    def test_nginx_test_failure_rolls_back_only_owned_targets(self):
        fired = False

        def fail_once(*args):
            nonlocal fired
            self.commands.append(args)
            if args == ('nginx', '-t') and not fired:
                fired = True
                raise RuntimeError('synthetic nginx validation failure')

        with patch.object(deploy, 'run', side_effect=fail_once):
            with self.assertRaisesRegex(RuntimeError, 'synthetic nginx validation failure'):
                deploy.install()
        self.assertEqual(self.snippet.read_bytes(), self.original)
        self.assertFalse(self.unit.exists())
        self.assertFalse(self.config.exists())
        self.assertFalse((self.payload / 'deployment-receipt.json').exists())
        self.assertTrue((self.release / 'tencent_router.py').exists())
        self.assert_protected()

    def test_loopback_failure_never_publishes_routes(self):
        self.mock_loopback.side_effect = RuntimeError('synthetic loopback failed')
        with self.assertRaisesRegex(RuntimeError, 'loopback failed'):
            deploy.install()
        self.assertEqual(self.snippet.read_bytes(), self.original)
        self.assertFalse(self.unit.exists())
        self.assertFalse(self.config.exists())
        self.assertNotIn(('systemctl', 'reload', 'nginx'), self.commands)
        self.assert_protected()

    def test_concurrent_snippet_change_before_publication_is_never_overwritten(self):
        newer = self.original + b'# concurrent static publication\n'
        self.mock_loopback.side_effect = lambda: self.snippet.write_bytes(newer)
        with self.assertRaisesRegex(RuntimeError, 'baseline changed'):
            deploy.install()
        self.assertEqual(self.snippet.read_bytes(), newer)
        self.assertFalse(self.unit.exists())
        self.assertFalse(self.config.exists())
        self.assert_protected()

    def test_concurrent_edit_after_publication_blocks_blind_rollback(self):
        newer = self.original + b'# unowned concurrent publication\n'

        def concurrent_reload(*args):
            self.commands.append(args)
            if args == ('systemctl', 'reload', 'nginx'):
                self.snippet.write_bytes(newer)
                raise RuntimeError('synthetic reload failure after concurrent edit')

        with patch.object(deploy, 'run', side_effect=concurrent_reload):
            with self.assertRaisesRegex(RuntimeError, 'Concurrent Nginx change'):
                deploy.install()
        self.assertEqual(self.snippet.read_bytes(), newer)
        self.assertFalse((self.payload / 'deployment-receipt.json').exists())
        self.assert_protected()

    def test_rollback_restores_exact_prior_routes_retains_evidence_and_credential(self):
        deploy.install()
        deploy.rollback()
        self.assertEqual(self.snippet.read_bytes(), self.original)
        self.assertFalse(self.unit.exists())
        self.assertFalse(self.config.exists())
        self.assertTrue((self.release / 'tencent_router.py').exists())
        self.assertEqual(json.loads((self.payload / 'deployment-receipt.json').read_bytes())['state'], 'rolled-back')
        self.assert_protected()

    def test_rollback_refuses_newer_config_or_snippet_without_removing_them(self):
        deploy.install()
        for target in [self.config, self.snippet]:
            original = target.read_bytes()
            target.write_bytes(original + b'\n# concurrent owner edit')
            self.commands.clear()
            try:
                with self.subTest(target=target.name), self.assertRaises(RuntimeError):
                    deploy.rollback()
                self.assertEqual(self.commands, [])
                self.assertEqual(target.read_bytes(), original + b'\n# concurrent owner edit')
                self.assertTrue(self.unit.exists())
            finally:
                target.write_bytes(original)
        self.assert_protected()

    def test_existing_parent_permissions_are_not_changed(self):
        self.release.parent.mkdir(parents=True)
        with patch.object(Path, 'chmod', autospec=True) as chmod:
            deploy.create_release_directory()
        self.assertEqual(chmod.call_args_list, [unittest.mock.call(self.release, 0o755)])

    def test_owned_remove_retains_concurrently_modified_file(self):
        owned = self.root / 'owned-target'
        owned.write_bytes(b'concurrent bytes')
        with self.assertRaisesRegex(RuntimeError, 'Concurrent change'):
            deploy.owned_remove(owned, b'original expected bytes')
        self.assertEqual(owned.read_bytes(), b'concurrent bytes')


class Response(io.BytesIO):
    def __init__(self, body, url, status=200, headers=None):
        super().__init__(body)
        self.url = url
        self.status = status
        self.headers = {} if headers is None else headers
        self.bytes_read = 0

    def geturl(self):
        return self.url

    def read(self, size=-1):
        result = super().read(size)
        self.bytes_read += len(result)
        return result


class CloudflareVerificationTests(unittest.TestCase):
    def api_opener(self, *, changed=False, redirected=False):
        class Opener:
            def open(self, request, timeout):
                if request.full_url.startswith('https://www.cloudflare.com/'):
                    raise HTTPError(request.full_url,403,'Forbidden',{},io.BytesIO())
                assert request.full_url == 'https://api.cloudflare.com/client/v4/ips'
                assert not request.headers.get('Authorization') and not request.headers.get('Cookie')
                ranges = list(EXPECTED_CF[:15])
                if changed: ranges[0] = '0.0.0.0/0'
                data={'success':True,'result':{'etag':'fixture','ipv4_cidrs':ranges,'ipv6_cidrs':EXPECTED_CF[15:]}}
                return Response(json.dumps(data).encode(), 'https://evil.invalid/' if redirected else request.full_url)
        return Opener()

    def test_text_list_403_uses_only_credential_free_official_api_and_exact_reviewed_ranges(self):
        self.assertEqual(deploy.verify_cloudflare(self.api_opener()),EXPECTED_CF)

    def test_api_fallback_rejects_expanded_trust_and_redirects(self):
        for options in [{'changed':True},{'redirected':True}]:
            with self.subTest(options=options), self.assertRaises(RuntimeError):
                deploy.verify_cloudflare(self.api_opener(**options))

    def make_opener(self, *, mutation=None, status=200, redirected=False):
        test = self

        class Opener:
            calls = []

            def open(self, request, timeout):
                self.calls.append(request)
                test.assertGreater(timeout, 0)
                test.assertIn(request.full_url, ['https://www.cloudflare.com/ips-v4',
                                                'https://www.cloudflare.com/ips-v6'])
                networks = EXPECTED_CF[:15] if request.full_url.endswith('ips-v4') else EXPECTED_CF[15:]
                if mutation is not None:
                    networks = mutation(networks)
                url = 'https://evil.invalid/redirect' if redirected else request.full_url
                return Response(('\n'.join(networks) + '\n').encode(), url, status=status)

        return Opener()

    def test_exact_official_ipv4_and_ipv6_lists_are_verified_without_credentials(self):
        self.assertEqual(deploy.CF_NETWORKS, EXPECTED_CF)
        opener = self.make_opener()
        self.assertEqual(deploy.verify_cloudflare(opener), EXPECTED_CF)
        self.assertEqual(len(opener.calls), 2)
        for request in opener.calls:
            self.assertEqual(request.get_method(), 'GET')
            self.assertNotIn('authorization', {name.lower() for name in request.headers})
            self.assertNotIn('cookie', {name.lower() for name in request.headers})

    def test_mismatched_missing_duplicate_or_invalid_network_lists_are_rejected(self):
        for mutation in [lambda values: values[:-1], lambda values: values + [values[0]],
                         lambda values: ['0.0.0.0/0'] + values[1:],
                         lambda values: ['not-a-network'] + values[1:]]:
            with self.subTest(mutation=mutation), self.assertRaises((ValueError, RuntimeError)):
                deploy.verify_cloudflare(self.make_opener(mutation=mutation))

    def test_redirects_or_non_200_lists_are_rejected(self):
        for options in [{'status': 301}, {'status': 503}, {'redirected': True}]:
            with self.subTest(options=options), self.assertRaises(RuntimeError):
                deploy.verify_cloudflare(self.make_opener(**options))

    def test_redirect_handler_never_follows_another_origin_or_downgrade(self):
        handler = deploy.NoRedirect()
        request = Request('https://www.cloudflare.com/ips-v4')
        for code in [301, 302, 303, 307, 308]:
            with self.subTest(code=code):
                self.assertIsNone(handler.redirect_request(request, None, code, 'redirect', {},
                                                           'http://evil.invalid/steal'))


class CDNVerificationTests(unittest.TestCase):
    def setUp(self):
        self.records = {name: ('synthetic-' + name).encode() for name in deploy.ASSETS}
        self.metadata = {name: {'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()}
                         for name, body in self.records.items()}
        self.assets_patch = patch.object(deploy, 'ASSETS', self.metadata)
        self.assets_patch.start()
        self.addCleanup(self.assets_patch.stop)
        self.secret_patch = patch.object(deploy.signer, 'read_secret', return_value=SYNTHETIC_KEY)
        self.mock_secret = self.secret_patch.start()
        self.addCleanup(self.secret_patch.stop)

    def make_opener(self, *, unsigned_status=403, signed_status=200, body_mutation=None,
                    redirect=False, encoding=None, unsigned_raises=True):
        test = self

        class Opener:
            def __init__(self):
                self.calls = []
                self.signed_responses = []

            def open(self, request, timeout):
                self.calls.append(request)
                test.assertGreater(timeout, 0)
                parsed = urlsplit(request.full_url)
                test.assertEqual(parsed.scheme + '://' + parsed.netloc, deploy.signer.CDN_ORIGIN)
                test.assertFalse(parsed.fragment)
                name = parsed.path.rsplit('/', 1)[-1]
                test.assertIn(name, test.records)
                test.assertEqual(parsed.path, '/lolicode/releases/4.0.20/' + name)
                if not parsed.query:
                    test.assertEqual(request.get_method(), 'HEAD')
                    if unsigned_raises and unsigned_status != 200:
                        raise HTTPError(request.full_url, unsigned_status,
                                        HTTPStatus(unsigned_status).phrase, {}, io.BytesIO(b''))
                    return Response(b'', request.full_url, status=unsigned_status)
                test.assertEqual(request.get_method(), 'GET')
                fields = re.fullmatch(r'sign=([1-9][0-9]*)-([A-Za-z0-9]{0,100})-0-([0-9a-f]{32})', parsed.query)
                test.assertIsNotNone(fields, 'Actual Type A signer must create the signed GET URL')
                timestamp, nonce, received_mac = fields.groups()
                material = '-'.join([parsed.path, timestamp, nonce, '0', SYNTHETIC_KEY]).encode('ascii')
                expected_mac = hashlib.md5(material, usedforsecurity=False).hexdigest()
                test.assertTrue(hmac.compare_digest(received_mac, expected_mac))
                test.assertNotIn(SYNTHETIC_KEY, request.full_url)
                body = test.records[name]
                if body_mutation is not None:
                    body = body_mutation(body)
                url = 'https://evil.invalid/package' if redirect else request.full_url
                headers = {} if encoding is None else {'Content-Encoding': encoding}
                response = Response(body, url, status=signed_status, headers=headers)
                self.signed_responses.append(response)
                return response

        return Opener()

    def test_each_asset_requires_unsigned_403_and_signed_full_hash_download(self):
        opener = self.make_opener()
        output = io.StringIO()
        with patch('sys.stdout', output), patch('sys.stderr', output):
            self.assertEqual(deploy.verify_cdn(opener), self.metadata)
        self.assertEqual(len(opener.calls), 6)
        self.assertEqual([request.get_method() for request in opener.calls], ['HEAD', 'GET'] * 3)
        for response in opener.signed_responses:
            name = urlsplit(response.url).path.rsplit('/', 1)[-1]
            self.assertEqual(response.bytes_read, self.metadata[name]['bytes'])
        for request in opener.calls:
            self.assertNotIn('authorization', {name.lower() for name in request.headers})
            self.assertNotIn('cookie', {name.lower() for name in request.headers})
        self.assertEqual(output.getvalue(), '')

    def test_plain_403_response_test_double_supported(self):
        self.assertEqual(deploy.verify_cdn(self.make_opener(unsigned_raises=False)), self.metadata)

    def test_public_unsigned_asset_or_wrong_error_never_passes_private_origin_gate(self):
        for status in [200, 301, 401, 404, 500]:
            with self.subTest(status=status), self.assertRaises((RuntimeError, HTTPError)):
                deploy.verify_cdn(self.make_opener(unsigned_status=status))

    def test_signed_redirect_encoding_status_or_corrupted_body_rejected(self):
        cases = [{'signed_status': 302}, {'signed_status': 403}, {'redirect': True},
                 {'encoding': 'gzip'}, {'body_mutation': lambda body: body + b'oversize'},
                 {'body_mutation': lambda body: body[:-1]},
                 {'body_mutation': lambda body: b'X' + body[1:]}]
        for options in cases:
            with self.subTest(options=options), self.assertRaises(RuntimeError):
                deploy.verify_cdn(self.make_opener(**options))


class ServiceContractTests(unittest.TestCase):
    def test_secret_is_systemd_credential_not_env_arg_or_payload_file(self):
        self.assertEqual(deploy.BATCH, '20261018-tencent-v2')
        self.assertEqual(deploy.CONFIG_NAME, 'tencent-router.production.json')
        self.assertEqual(deploy.CREDENTIAL, Path('/etc/lolicode-tencent-cdn.key'))
        self.assertNotIn('lolicode-tencent-cdn.key', deploy.FILES)
        unit = (HERE / deploy.SERVICE).read_text(encoding='utf-8')
        self.assertIn('LoadCredential=cdn-key:/etc/lolicode-tencent-cdn.key', unit)
        for directive in ['DynamicUser=yes', 'ProtectSystem=strict', 'ProtectHome=yes',
                          'NoNewPrivileges=yes', 'CapabilityBoundingSet=']:
            self.assertIn(directive, unit)
        self.assertNotIn('EnvironmentFile=', unit)
        self.assertNotIn('--key ', unit)
        self.assertNotIn('ReadWritePaths=', unit)
        self.assertNotIn(SYNTHETIC_KEY, unit)


if __name__ == '__main__':
    unittest.main()
