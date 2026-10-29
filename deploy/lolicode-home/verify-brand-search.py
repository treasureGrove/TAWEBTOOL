"""Verify real HTTP output against the frozen homepage batch, without credentials."""
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
WORK = REPO / 'tmp/lolicode-brand-search-20261027'
spec = importlib.util.spec_from_file_location('brand_deploy', HERE / 'deploy-brand-search.py')
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.canonical = []
        self.meta = {}
        self.links = []
        self.feed(html)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == 'link' and attrs.get('rel') == 'canonical':
            self.canonical.append(attrs.get('href'))
        if tag == 'meta':
            self.meta[attrs.get('name', attrs.get('property'))] = attrs.get('content')
        if tag == 'a' and attrs.get('href'):
            self.links.append(attrs['href'])


def get(url):
    with urlopen(Request(url, headers={'User-Agent': 'LoliCode-SEO-Verify/1.0'}), timeout=25) as response:
        return response.status, response.headers, response.read()


def verify(host):
    preview = host == 'test.lolicode.com'
    origin = 'https://' + host
    manifest = json.loads((WORK / 'manifest.json').read_text())
    status, headers, data = get(origin + '/')
    assert status == 200 and hashlib.sha256(data).hexdigest() == manifest['files']['index.html']
    assert ('noindex' in headers.get('X-Robots-Tag', '').lower()) == preview
    html = data.decode()
    page = Page(html)
    assert page.canonical == ['https://lolicode.com/']
    assert page.meta['og:title'] == 'LoliCode 官网｜AI 编程助手与桌面 Agent · Windows 下载'
    assert page.meta['description'] == page.meta['og:description']
    assert 'LoliCode 官方网站' in page.meta['description']
    assert 'https://github.com/treasureGrove/LoliCode-Releases/releases/latest' in page.links
    assert html.count('<h1 ') == 1
    graph = json.loads(html.split('<script type="application/ld+json">')[1].split('</script>')[0])['@graph']
    assert {n['@type'] for n in graph} == {'Organization', 'WebSite', 'WebPage', 'SoftwareApplication'}
    ids = {n['@id'] for n in graph}
    for node in graph:
        for value in node.values():
            if isinstance(value, dict) and '@id' in value:
                assert value['@id'] in ids
    assert not any('aggregateRating' in n or 'review' in n for n in graph)

    def asset(item):
        name, digest = item
        status, response_headers, body = get(origin + '/' + name)
        assert status == 200 and hashlib.sha256(body).hexdigest() == digest, name
        return {'path': name, 'sha256': digest, 'contentType': response_headers.get('Content-Type')}

    assets = [(name, digest) for name, digest in deploy.BASE_FILES.items() if name.startswith('desktop-assets/')]
    with ThreadPoolExecutor(max_workers=6) as pool:
        verified = list(pool.map(asset, assets))
    status, _, sitemap = get(origin + '/sitemap-desktop.xml')
    assert status == 200 and hashlib.sha256(sitemap).hexdigest() == manifest['files']['sitemap-desktop.xml']
    assert ET.fromstring(sitemap).find('{*}url/{*}loc').text == 'https://lolicode.com/'
    assert ET.fromstring(sitemap).find('{*}url/{*}lastmod').text == '2026-10-27'
    if not preview:
        status, robots_headers, robots = get(origin + '/robots.txt')
        assert status == 200 and hashlib.sha256(robots).hexdigest() == manifest['files']['robots.txt']
        assert 'text/plain' in robots_headers.get('Content-Type', '')
        assert 'noindex' not in robots_headers.get('X-Robots-Tag', '').lower()
        for route in ['/all', '/api', '/sitemap.xml', '/sitemap-0.xml', '/feed', '/downloads/updates/latest.json']:
            assert get(origin + route)[0] == 200, route
    else:
        assert b'Disallow: /' in get(origin + '/robots.txt')[2]
    result = {'host': host, 'passed': True, 'manifestSHA256': deploy.MANIFEST_SHA,
              'htmlSHA256': hashlib.sha256(data).hexdigest(), 'verifiedUnchangedAssets': verified,
              'canonical': page.canonical[0], 'previewNoindex': preview}
    (WORK / ('preview-proof.json' if preview else 'production-proof.json')).write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'verifiedUnchangedAssets'} | {'unchangedAssets': len(verified)}, indent=2))


if __name__ == '__main__':
    assert sys.argv[1:] in [['test.lolicode.com'], ['lolicode.com']]
    verify(sys.argv[1])
