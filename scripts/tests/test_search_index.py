import importlib.util
from pathlib import Path
import tempfile
import shutil
import unittest
import subprocess
import os
import sys
import xml.etree.ElementTree as ET

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
        self.url_count = check.validate(self.root)[1]
    def test_append_preserves_offsets_and_is_idempotent(self):
        queue = self.root / 'scripts/baidu_urls.txt'
        old = queue.read_text().splitlines()[:-4]
        queue.write_text('\n'.join(old) + '\n')
        self.assertFalse(check.validate(self.root, True)[0])
        self.assertEqual(queue.read_text().splitlines()[:len(old)], old)
        self.assertEqual(check.validate(self.root, True), ([], self.url_count, 0))
    def test_policy_failures_do_not_modify_queue(self):
        queue = self.root / 'scripts/baidu_urls.txt'
        before = queue.read_bytes()
        page = self.root / 'en/index.html'
        page.write_text(page.read_text().replace('index, follow', 'noindex, follow'))
        self.assertTrue(check.validate(self.root, True)[0])
        self.assertEqual(before, queue.read_bytes())
    def generate_sitemap(self, success=True):
        result = subprocess.run(
            ['node', str(self.root / 'scripts/gen_sitemap.js')],
            # Deliberately run outside the site root, as cron may do.
            cwd=self.root / 'en',
            env=dict(os.environ, PYTHON=sys.executable),
            capture_output=True, text=True)
        self.assertEqual(result.returncode == 0, success, result.stdout + result.stderr)
        self.assertFalse(list(self.root.glob('.sitemap-*')))
        return result
    def test_sitemap_regeneration_preserves_queue_and_is_idempotent(self):
        queue = self.root / 'scripts/baidu_urls.txt'
        old = queue.read_text().splitlines()[:-4]
        queue.write_text('\n'.join(old) + '\n')
        result = self.generate_sitemap()
        sitemap = self.root / 'sitemap.xml'
        urls = [loc.text for loc in ET.parse(sitemap).findall('.//{*}loc')]
        self.assertNotIn(f'{check.BASE}/tools_html/lead_canticle.html', urls)
        self.assertEqual(urls.count(f'{check.BASE}/en/'), 1)
        self.assertEqual(urls[2:], sorted(urls[2:]))
        self.assertIn(f'Generated sitemap.xml with {len(urls)} URLs', result.stdout)
        self.assertEqual(queue.read_text().splitlines()[:len(old)], old)
        self.assertEqual(check.validate(self.root), ([], self.url_count, 0))
        before = sitemap.read_bytes(), queue.read_bytes()
        self.generate_sitemap()
        self.assertEqual(before, (sitemap.read_bytes(), queue.read_bytes()))
    def test_generator_excludes_redirect_and_nonindexable_new_pages(self):
        pages = {
            'redirect': '<meta http-equiv="refresh" content="0;url=/">',
            'noindex': '<meta name="robots" content="noindex">',
            'baidu': '<meta name="baiduspider" content="none">',
            'blocked': '',
            'alias': '',
            'missing': '',
        }
        for name, policy in pages.items():
            url = f'{check.BASE}/tools_html/{name}.html'
            canonical = '' if name == 'missing' else f'<link rel="canonical" href="{check.BASE if name == "alias" else url}">'
            (self.root / f'tools_html/{name}.html').write_text(canonical + policy)
        robots = self.root / 'robots.txt'
        robots.write_text(robots.read_text().replace('User-agent: *', 'User-agent: *\nDisallow: /tools_html/blocked.html'))
        queue = self.root / 'scripts/baidu_urls.txt'
        before = queue.read_bytes()
        self.generate_sitemap()
        self.assertEqual(check.validate(self.root), ([], self.url_count, 0))
        self.assertEqual(before, queue.read_bytes())
    def test_new_indexable_tool_is_appended_without_reordering(self):
        url = f'{check.BASE}/tools_html/new-tool.html'
        (self.root / 'tools_html/new-tool.html').write_text(f'<link rel="canonical" href="{url}">')
        queue = self.root / 'scripts/baidu_urls.txt'
        before = queue.read_text().splitlines()
        self.generate_sitemap()
        self.assertEqual(queue.read_text().splitlines(), before + [url])
        self.assertEqual(check.validate(self.root), ([], self.url_count + 1, 0))
    def test_failed_regeneration_preserves_sitemap_and_queue(self):
        url = f'{check.BASE}/tools_html/new-tool.html'
        (self.root / 'tools_html/new-tool.html').write_text(f'<link rel="canonical" href="{url}">')
        sitemap, queue = self.root / 'sitemap.xml', self.root / 'scripts/baidu_urls.txt'
        before = sitemap.read_bytes(), queue.read_bytes()
        page = self.root / 'en/index.html'
        page.write_text(page.read_text().replace('index, follow', 'noindex, follow'))
        result = self.generate_sitemap(success=False)
        self.assertIn('noindex in sitemap', result.stderr)
        self.assertEqual(before, (sitemap.read_bytes(), queue.read_bytes()))
    def test_existing_queued_tool_cannot_be_silently_removed(self):
        page = self.root / 'tools_html/about.html'
        page.write_text(page.read_text().replace('rel="canonical"', 'rel="alternate"'))
        sitemap, queue = self.root / 'sitemap.xml', self.root / 'scripts/baidu_urls.txt'
        before = sitemap.read_bytes(), queue.read_bytes()
        result = self.generate_sitemap(success=False)
        self.assertIn('manual cursor migration required', result.stderr)
        self.assertEqual(before, (sitemap.read_bytes(), queue.read_bytes()))
    def test_baidu_script_is_tracked_executable(self):
        entry = subprocess.check_output(
            ['git', 'ls-files', '--stage', '--', 'scripts/baidu_push.sh'], cwd=ROOT, text=True)
        self.assertEqual(entry.split()[0], '100755', entry)
    @unittest.skipUnless(os.name == 'posix', 'Direct script execution requires POSIX; covered by Ubuntu CI')
    def test_mock_rotation_and_daily_cap(self):
        mock = self.root / 'bin'
        mock.mkdir()
        curl = mock / 'curl'
        curl.write_text('#!/bin/sh\nprintf \'{"success":10,"remain":0}\'\n')
        curl.chmod(0o755)
        state = self.root / 'logs/baidu_push.state'
        state.parent.mkdir()
        state.write_text('190')
        env = dict(os.environ, PATH=str(mock) + ':' + os.environ['PATH'], BAIDU_NO_MAIL='1', BAIDU_MAX_PUSH='50', BAIDU_PUSH_ENDPOINT='http://baidu.invalid/test')
        for _ in range(2):
            subprocess.run([str(self.root / 'scripts/baidu_push.sh')], env=env, check=True, capture_output=True)
        self.assertEqual(state.read_text().strip(), '3')
        self.assertEqual(len((state.parent / 'baidu_push.last.log').read_text().splitlines()), 2)
    @unittest.skipUnless(os.name == 'posix', 'Direct script execution requires POSIX; covered by Ubuntu CI')
    def test_partial_response_keeps_cursor(self):
        mock = self.root / 'bin'
        mock.mkdir()
        curl = mock / 'curl'
        curl.write_text('#!/bin/sh\nprintf \'{"success":3,"remain":7}\'\n')
        curl.chmod(0o755)
        state = self.root / 'logs/baidu_push.state'
        state.parent.mkdir()
        state.write_text('190')
        subprocess.run([str(self.root / 'scripts/baidu_push.sh')], env=dict(os.environ, PATH=str(mock)+':'+os.environ['PATH'], BAIDU_NO_MAIL='1', BAIDU_PUSH_ENDPOINT='http://baidu.invalid/test'), check=True, capture_output=True)
        self.assertEqual(state.read_text(), '190')
