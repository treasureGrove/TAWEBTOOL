"""Verify real image-crawler responses and the frozen image-discovery revision."""
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from io import BytesIO
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser
import xml.etree.ElementTree as ET
from PIL import Image

HERE = Path(__file__).resolve().parent
WORK = HERE.parents[1] / 'tmp/lolicode-image-search-20261027'
ORIGIN = 'https://lolicode.com/'
ASSETS = ORIGIN + 'desktop-assets/'
SIZES = {'site-icon-512.png': (512, 512), 'companion.webp': (720, 768),
         'workbench.jpg': (1000, 650), 'workbench-cream.jpg': (1000, 650),
         'channels-light.jpg': (900, 600), 'tour-poster.webp': (1600, 1000)}
spec = importlib.util.spec_from_file_location('image_batch', HERE / 'deploy-image-search.py')
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class Page(HTMLParser):
    def __init__(self, body):
        super().__init__()
        self.meta, self.icons, self.canonical, self.hero = {}, [], [], []
        self.feed(body.decode())

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == 'meta':
            self.meta[attrs.get('name', attrs.get('property'))] = attrs.get('content')
        if tag == 'link' and attrs.get('rel') == 'icon':
            self.icons.append(attrs['href'])
        if tag == 'link' and attrs.get('rel') == 'canonical':
            self.canonical.append(attrs['href'])
        if tag == 'img' and 'hero-companion' in attrs.get('class', '').split():
            self.hero.append(attrs)


def get(url, agent='LoliCode-Image-SEO-Verify/1.0'):
    with urlopen(Request(url, headers={'User-Agent': agent}), timeout=25) as response:
        assert response.status == 200 and response.url == url, url
        return response.headers, response.read()


def verify(host):
    preview = host == 'test.lolicode.com'
    base = 'https://' + host + '/'
    manifest = json.loads((WORK / 'manifest.json').read_text())
    headers, body = get(base, 'Googlebot')
    assert hashlib.sha256(body).hexdigest() == manifest['files']['index.html']
    assert ('noindex' in headers.get('X-Robots-Tag', '').lower()) == preview
    page = Page(body)
    assert page.canonical == [ORIGIN]
    assert page.meta['robots'] == 'index, follow, max-image-preview:large'
    assert page.meta['og:image'] == ASSETS + 'companion.webp'
    assert (page.meta['og:image:width'], page.meta['og:image:height']) == ('720', '768')
    assert len(page.hero) == 1 and urljoin(base, page.hero[0]['src']) == base + 'desktop-assets/companion.webp'
    assert 'LoliCode' in page.hero[0]['alt'] and page.meta['og:image:alt'] == page.hero[0]['alt']
    graph = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', body.decode(), re.S)[1])['@graph']
    nodes = {node['@id']: node for node in graph}
    assert len(nodes) == 6
    for node in graph:
        for value in node.values():
            if isinstance(value, dict) and '@id' in value:
                assert value['@id'] in nodes
    assert nodes[ORIGIN + '#organization']['logo'] == {'@id': ORIGIN + '#app-icon'}
    assert nodes[ORIGIN + '#webpage']['primaryImageOfPage'] == {'@id': ORIGIN + '#hero-image'}
    for key, filename in [('app-icon', 'site-icon-512.png'), ('hero-image', 'companion.webp')]:
        node = nodes[ORIGIN + '#' + key]
        assert node['contentUrl'] == node['url'] == ASSETS + filename
        assert (node['width'], node['height']) == SIZES[filename]

    _, xml = get(base + 'sitemap-desktop.xml')
    assert hashlib.sha256(xml).hexdigest() == manifest['files']['sitemap-desktop.xml']
    assert b'<!DOCTYPE' not in xml and b'<!ENTITY' not in xml
    root = ET.fromstring(xml)
    ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9', 'i': 'http://www.google.com/schemas/sitemap-image/1.1'}
    assert [node.text for node in root.findall('s:url/s:loc', ns)] == [ORIGIN]
    images = [node.text for node in root.findall('s:url/i:image/i:loc', ns)]
    assert set(images) == {ASSETS + name for name in SIZES} and len(images) == 6
    assert len(list(root.iter('{http://www.google.com/schemas/sitemap-image/1.1}title'))) == 0

    def image_check(filename):
        path = 'desktop-assets/' + filename
        response_headers, data = get(base + path, 'Googlebot-Image')
        assert ('noindex' in response_headers.get('X-Robots-Tag', '').lower()) == preview
        assert hashlib.sha256(data).hexdigest() == deploy.BASE_FILES[path]
        picture = Image.open(BytesIO(data))
        assert picture.size == SIZES[filename]
        content_type = {'PNG': 'image/png', 'WEBP': 'image/webp', 'JPEG': 'image/jpeg'}[picture.format]
        assert response_headers.get_content_type() == content_type
        return {'url': ASSETS + filename, 'size': picture.size, 'mime': content_type, 'sha256': hashlib.sha256(data).hexdigest()}

    with ThreadPoolExecutor(max_workers=4) as pool:
        checked_images = list(pool.map(image_check, SIZES))
    assert any('site-icon-192.png' in icon for icon in page.icons)
    for icon in page.icons:
        icon_url = urljoin(base, icon)
        assert not urlsplit(icon_url).query
        icon_headers, icon_data = get(icon_url, 'Googlebot-Image')
        assert ('noindex' in icon_headers.get('X-Robots-Tag', '').lower()) == preview
        picture = Image.open(BytesIO(icon_data))
        assert picture.width == picture.height and picture.width >= 8
        assert hashlib.sha256(icon_data).hexdigest() == deploy.BASE_FILES['desktop-assets/' + Path(urlsplit(icon_url).path).name]
    robots_headers, robots_data = get(base + 'robots.txt')
    robots = RobotFileParser()
    robots.parse(robots_data.decode().splitlines())
    if preview:
        assert 'noindex' in robots_headers.get('X-Robots-Tag', '').lower()
    else:
        for agent in ['Googlebot', 'Googlebot-Image', 'Bingbot']:
            for path in ['', 'sitemap-desktop.xml', 'favicon.ico', *['desktop-assets/' + name for name in SIZES]]:
                assert robots.can_fetch(agent, base + path), (agent, path)
        favicon_headers, favicon = get(base + 'favicon.ico', 'Googlebot-Image')
        assert 'noindex' not in favicon_headers.get('X-Robots-Tag', '').lower()
        assert hashlib.sha256(favicon).hexdigest() == deploy.BASE_FILES['desktop-assets/favicon.ico']
        for path in ['all', 'api', 'feed', 'sitemap.xml', 'downloads/updates/latest.json']:
            get(base + path)
    result = {'host': host, 'passed': True, 'manifestSHA256': deploy.MANIFEST_SHA,
              'homeSHA256': manifest['files']['index.html'], 'images': checked_images,
              'faviconLinks': page.icons, 'preferredImage': page.meta['og:image'], 'previewNoindex': preview,
              'meaning': 'Crawl eligibility verified; does not confirm image indexing or search-result display.'}
    output = WORK / ('preview-proof.json' if preview else 'production-proof.json')
    output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'host': host, 'passed': True, 'imageSitemapEntries': 6, 'faviconLinks': len(page.icons),
                      'preferredImage': result['preferredImage'], 'previewNoindex': preview}, indent=2))


if __name__ == '__main__':
    assert sys.argv[1:] in [['test.lolicode.com'], ['lolicode.com']]
    verify(sys.argv[1])
