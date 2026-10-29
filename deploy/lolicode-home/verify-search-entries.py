"""Read public responses to verify the official, community and mirror identities."""
from html.parser import HTMLParser
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

OUTPUT = Path(__file__).resolve().parent / 'search-entries-20261027-proof.json'


class Page(HTMLParser):
    def __init__(self, body):
        super().__init__()
        self.canonical = []
        self.assets = []
        self.feed(body.decode())

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == 'link' and attrs.get('rel') == 'canonical':
            self.canonical.append(attrs.get('href'))
        url = attrs.get('src') if tag in ['img', 'script'] else attrs.get('href') if tag == 'link' else None
        if url and '/assets/' in url and urlsplit(url).path.endswith(('.css', '.js', '.png')):
            self.assets.append(urlsplit(url).path)


def get(url):
    with urlopen(Request(url, headers={'User-Agent': 'LoliCode-SEO-Verify/1.0'}), timeout=25) as response:
        assert response.status == 200, url
        return response.headers, response.read()


def main():
    result = {'passed': True, 'checks': []}
    cases = [
        ('https://lolicode.com/', 'https://lolicode.com/', False),
        ('https://lolicode.com/all', 'https://lolicode.com/all', False),
        ('https://lolicode.com/all?page=2', 'https://lolicode.com/all?page=2', False),
        ('https://test.lolicode.com/all', 'https://test.lolicode.com/all', True),
        ('https://tools.treasuregrove.art/lolicode/', 'https://lolicode.com/', False),
    ]
    mirror_assets = []
    for url, canonical, noindex in cases:
        headers, body = get(url)
        page = Page(body)
        assert page.canonical == [canonical], url
        assert ('noindex' in headers.get('X-Robots-Tag', '').lower()) == noindex, url
        if url == 'https://lolicode.com/':
            assert hashlib.sha256(body).hexdigest() == '5a371960b6fe3d1360646490cea051ddc36d5e6eae9fe8a0a8048ef9bb328d95'
        if url == 'https://lolicode.com/all':
            mirror_assets = list(dict.fromkeys(page.assets))[:3]
        result['checks'].append({'url': url, 'canonical': canonical, 'noindex': noindex})
    assert mirror_assets
    for path in ['/', '/all', '/api', '/sitemap.xml', '/robots.txt', *mirror_assets]:
        url = 'https://direct.lolicode.com' + path
        headers, body = get(url)
        assert 'noindex' in headers.get('X-Robots-Tag', '').lower(), url
        result['checks'].append({'url': url, 'noindex': True, 'contentType': headers.get('Content-Type')})
    for path in ['/api', '/sitemap.xml', '/sitemap-desktop.xml', '/feed', '/downloads/updates/latest.json']:
        headers, body = get('https://lolicode.com' + path)
        result['checks'].append({'url': 'https://lolicode.com' + path, 'status': 200})
    OUTPUT.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'passed': True, 'publicChecks': len(result['checks']), 'proof': str(OUTPUT)}, indent=2))


if __name__ == '__main__':
    main()
