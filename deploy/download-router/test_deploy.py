"""Offline tests only: all mutations are inside an owned temporary directory."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('router_deploy', HERE / 'deploy.py')
deploy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(deploy)


class Fixture(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='lolicode-router-deploy-')
        self.root = Path(self.temp.name)
        self.payload = self.root / 'private-payload'
        self.payload.mkdir()
        self.etc = self.root / 'etc'
        self.etc.mkdir()
        self.main = self.etc / 'nginx-main.conf'
        self.main.write_bytes(b'main config unchanged\n')
        self.snippet = self.etc / 'homepage-snippet.conf'
        self.original = b'location = / { root /old/site; }\nlocation ^~ /downloads/releases/ { return 404; }\n'
        self.snippet.write_bytes(self.original)
        self.unit = self.etc / 'lolicode-download-router.service'
        self.config = self.etc / 'router.json'
        self.release = self.root / 'opt' / deploy.BATCH
        for name in deploy.FILES:
            (self.payload / name).write_bytes((HERE / name).read_bytes())
        self.manifest()
        values = {'PAYLOAD': self.payload, 'MAIN': self.main,
                  'MAIN_SHA': deploy.sha(self.main.read_bytes()), 'SNIPPET': self.snippet,
                  'SNIPPET_SHA': deploy.sha(self.original), 'UNIT': self.unit,
                  'CONFIG': self.config, 'RELEASE': self.release, 'PORT': 0}
        self.patchers = [patch.object(deploy, name, value) for name, value in values.items()]
        for item in self.patchers:
            item.start()
        self.commands = []
        self.run = patch.object(deploy, 'run', side_effect=lambda *args: self.commands.append(args))
        self.verify = patch.object(deploy, 'verify_r2', return_value=deploy.ASSETS)
        self.loopback = patch.object(deploy, 'loopback_check')
        self.print = patch('builtins.print')
        for item in [self.run, self.verify, self.loopback, self.print]:
            item.start()

    def manifest(self):
        content = {'batch': deploy.BATCH, 'version': deploy.VERSION,
                   'files': {name: deploy.sha((self.payload / name).read_bytes()) for name in deploy.FILES}}
        (self.payload / 'manifest.json').write_text(json.dumps(content), encoding='utf-8')

    def tearDown(self):
        for item in [self.print, self.loopback, self.verify, self.run] + list(reversed(self.patchers)):
            item.stop()
        self.temp.cleanup()

    def test_preflight_has_no_mutations(self):
        before = {str(item.relative_to(self.root)): item.read_bytes()
                  for item in self.root.rglob('*') if item.is_file()}
        deploy.preflight()
        after = {str(item.relative_to(self.root)): item.read_bytes()
                 for item in self.root.rglob('*') if item.is_file()}
        self.assertEqual(before, after)
        self.assertEqual(self.commands, [('systemd-analyze', 'verify', '--man=no',
                                         str(self.payload / deploy.SERVICE))])

    def test_preflight_rejects_changed_snippet_before_service_operations(self):
        self.snippet.write_bytes(self.original + b'# newer static batch\n')
        with self.assertRaisesRegex(RuntimeError, 'baseline changed'):
            deploy.preflight()
        self.assertEqual(self.commands, [])
        self.assertFalse(self.unit.exists())

    def test_preflight_rejects_payload_hash_change(self):
        (self.payload / 'router.py').write_bytes(b'changed')
        with self.assertRaisesRegex(RuntimeError, 'checksum mismatch'):
            deploy.preflight()
        self.assertEqual(self.commands, [])

    def test_rejects_existing_service_even_if_same_content(self):
        self.unit.write_bytes((HERE / deploy.SERVICE).read_bytes())
        with self.assertRaisesRegex(RuntimeError, 'existing path'):
            deploy.preflight()
        self.assertEqual(self.commands, [])

    def test_installs_only_owned_targets_and_preserves_main(self):
        deploy.install()
        self.assertEqual(self.main.read_bytes(), b'main config unchanged\n')
        self.assertEqual(self.config.read_bytes(), (HERE / 'config-release20.json').read_bytes())
        self.assertEqual(self.unit.read_bytes(), (HERE / deploy.SERVICE).read_bytes())
        self.assertTrue(self.snippet.read_bytes().startswith(self.original.rstrip()))
        self.assertEqual(self.snippet.read_bytes().count(deploy.MARKER.encode()), 1)
        receipt = json.loads((self.payload / 'deployment-receipt.json').read_bytes())
        self.assertEqual(receipt['state'], 'installed')
        self.assertIn(('nginx', '-t'), self.commands)
        self.assertIn(('systemctl', 'enable', deploy.SERVICE), self.commands)

    def test_release_directory_creation_does_not_chmod_existing_parent(self):
        existing = self.release.parent
        existing.mkdir(parents=True)
        with patch.object(Path, 'chmod', autospec=True) as chmod:
            deploy.create_release_directory()
        self.assertEqual(chmod.call_args_list, [unittest.mock.call(self.release, 0o755)])

    def test_nginx_failure_restores_snippet_and_removes_only_new_service(self):
        fired = False

        def fail_once(*args):
            nonlocal fired
            self.commands.append(args)
            if args == ('nginx', '-t') and not fired:
                fired = True
                raise RuntimeError('synthetic nginx failure')

        with patch.object(deploy, 'run', side_effect=fail_once):
            with self.assertRaisesRegex(RuntimeError, 'synthetic nginx failure'):
                deploy.install()
        self.assertEqual(self.snippet.read_bytes(), self.original)
        self.assertFalse(self.unit.exists())
        self.assertFalse(self.config.exists())
        self.assertTrue((self.release / 'router.py').exists())
        self.assertFalse((self.payload / 'deployment-receipt.json').exists())

    def test_concurrent_snippet_edit_is_preserved(self):
        newer = self.original + b'# another reviewed static batch\n'
        with patch.object(deploy, 'loopback_check', side_effect=lambda: self.snippet.write_bytes(newer)):
            with self.assertRaisesRegex(RuntimeError, 'baseline changed'):
                deploy.install()
        self.assertEqual(self.snippet.read_bytes(), newer)
        self.assertFalse(self.unit.exists())
        self.assertFalse(self.config.exists())

    def test_exact_rollback_restores_old_route_and_preserves_release_evidence(self):
        deploy.install()
        deploy.rollback()
        self.assertEqual(self.snippet.read_bytes(), self.original)
        self.assertFalse(self.unit.exists())
        self.assertFalse(self.config.exists())
        self.assertTrue((self.release / 'router.py').exists())
        self.assertEqual(json.loads((self.payload / 'deployment-receipt.json').read_bytes())['state'], 'rolled-back')

    def test_rollback_refuses_newer_static_batch(self):
        deploy.install()
        newer = self.snippet.read_bytes() + b'# post-release edit\n'
        self.snippet.write_bytes(newer)
        self.commands.clear()
        with self.assertRaisesRegex(RuntimeError, 'Concurrent Nginx change'):
            deploy.rollback()
        self.assertEqual(self.snippet.read_bytes(), newer)
        self.assertEqual(self.commands, [])
        self.assertTrue(self.unit.exists())

    def test_metadata_cannot_select_other_origin_or_asset(self):
        value = json.loads((self.payload / 'config-release20.json').read_bytes())
        value['r2_origin'] = 'https://pub-other.r2.dev'
        (self.payload / 'config-release20.json').write_text(json.dumps(value), encoding='utf-8')
        self.manifest()
        with self.assertRaisesRegex(RuntimeError, 'authoritative asset metadata differs'):
            deploy.preflight()


class SourceTests(unittest.TestCase):
    def test_service_uses_existing_255_compatible_security_directives(self):
        unit = (HERE / deploy.SERVICE).read_text(encoding='utf-8')
        for item in ['DynamicUser=yes', 'ProtectSystem=strict', 'ProtectHome=yes',
                     'NoNewPrivileges=yes', 'CapabilityBoundingSet=',
                     'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6',
                     '--config /etc/lolicode-download-router.json --port 18781',
                     'MemoryMax=96M', 'TasksMax=64']:
            self.assertIn(item, unit)
        self.assertNotIn('ReadWritePaths=', unit)
        self.assertNotIn('EnvironmentFile=', unit)

    def test_template_only_exact_routes_and_fixed_fallback_without_forwarded_credentials(self):
        template = (HERE / 'nginx-locations.conf.template').read_text(encoding='utf-8')
        self.assertEqual(template.count('location = '), 3)
        self.assertNotIn('location /', template)
        self.assertEqual(template.count('proxy_pass_request_headers off;'), 3)
        self.assertEqual(template.count('proxy_pass_request_body off;'), 3)
        self.assertEqual(template.count('proxy_set_header Cookie "";'), 3)
        self.assertEqual(template.count('proxy_set_header Authorization "";'), 3)
        self.assertEqual(template.count('proxy_set_header X-Forwarded-For "";'), 3)
        self.assertEqual(template.count('proxy_read_timeout 2s;'), 3)
        for name in deploy.ASSETS:
            self.assertIn('if ($request_uri != "/downloads/releases/4.0.20/' + name + '") { return 404; }', template)
            self.assertIn('error_page 502 503 504 =302 ' + deploy.GH_PREFIX + name + ';', template)

    def test_full_hash_gate_uses_fixed_anonymous_urls_and_rejects_corruption(self):
        records = {'one': b'asset one', 'two': b'asset two', 'three': b'signature'}
        metadata = {name: {'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()}
                    for name, body in records.items()}
        requested = []

        class Response(io.BytesIO):
            status = 200
            headers = {}

            def __init__(self, body, url):
                super().__init__(body)
                self.url = url

            def geturl(self):
                return self.url

        class Opener:
            corrupt = False

            def open(self, request, timeout):
                requested.append(request)
                name = request.full_url.rsplit('/', 1)[-1]
                body = records[name] if not self.corrupt else b'corrupt'
                return Response(body, request.full_url)

        opener = Opener()
        with patch.object(deploy, 'ASSETS', metadata):
            self.assertEqual(deploy.verify_r2(opener), metadata)
            for request in requested:
                self.assertTrue(request.full_url.startswith(deploy.R2_ORIGIN + '/lolicode/releases/4.0.20/'))
                self.assertEqual(set(key.lower() for key in request.headers), {'accept-encoding', 'user-agent'})
            opener.corrupt = True
            with self.assertRaisesRegex(RuntimeError, 'SHA256 mismatch'):
                deploy.verify_r2(opener)


if __name__ == '__main__':
    unittest.main()
