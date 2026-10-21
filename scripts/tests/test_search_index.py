import importlib.util
from pathlib import Path
import tempfile
import shutil
import unittest
import subprocess
import os

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('check', ROOT / 'scripts/check_search_index.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)

class SearchIndexTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        for name in ('scripts', 'en', 'seo', 'tools_html'):
            shutil.copytree(ROOT / name, self.root / name)
        for name in ('robots.txt', 'sitemap.xml', 'sitemap-seo.xml', 'index.html'):
            shutil.copy(ROOT / name, self.root / name)
    def test_append_preserves_offsets_and_is_idempotent(self):
        queue = self.root / 'scripts/baidu_urls.txt'
        old = queue.read_text().splitlines()[:-4]
        queue.write_text('\n'.join(old) + '\n')
        self.assertFalse(check.validate(self.root, True)[0])
        self.assertEqual(queue.read_text().splitlines()[:193], old)
        self.assertEqual(check.validate(self.root, True), ([], 197, 0))
    def test_policy_failures_do_not_modify_queue(self):
        queue = self.root / 'scripts/baidu_urls.txt'
        before = queue.read_bytes()
        page = self.root / 'en/index.html'
        page.write_text(page.read_text().replace('index, follow', 'noindex, follow'))
        self.assertTrue(check.validate(self.root, True)[0])
        self.assertEqual(before, queue.read_bytes())
    def test_mock_rotation_and_daily_cap(self):
        mock = self.root / 'bin'
        mock.mkdir()
        curl = mock / 'curl'
        curl.write_text('#!/bin/sh\nprintf \'{"success":10,"remain":0}\'\n')
        curl.chmod(0o755)
        state = self.root / 'logs/baidu_push.state'
        state.parent.mkdir()
        state.write_text('190')
        env = dict(os.environ, PATH=str(mock) + ':' + os.environ['PATH'], BAIDU_NO_MAIL='1', BAIDU_MAX_PUSH='50')
        for _ in range(2):
            subprocess.run(['bash', str(self.root / 'scripts/baidu_push.sh')], env=env, check=True, capture_output=True)
        self.assertEqual(state.read_text().strip(), '3')
        self.assertEqual(len((state.parent / 'baidu_push.last.log').read_text().splitlines()), 2)
    def test_partial_response_keeps_cursor(self):
        mock = self.root / 'bin'
        mock.mkdir()
        curl = mock / 'curl'
        curl.write_text('#!/bin/sh\nprintf \'{"success":3,"remain":7}\'\n')
        curl.chmod(0o755)
        state = self.root / 'logs/baidu_push.state'
        state.parent.mkdir()
        state.write_text('190')
        subprocess.run(['bash', str(self.root / 'scripts/baidu_push.sh')], env=dict(os.environ, PATH=str(mock)+':'+os.environ['PATH'], BAIDU_NO_MAIL='1'), check=True, capture_output=True)
        self.assertEqual(state.read_text(), '190')
