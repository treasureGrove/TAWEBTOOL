#!/usr/bin/env python3
"""Validate sitemap indexing policy; append missing Baidu URLs without reordering.

No automatic deletion: removing/reordering entries requires an explicit cursor migration.
"""
import argparse
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
from urllib.robotparser import RobotFileParser
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://tools.treasuregrove.art'

class Head(HTMLParser):
    def __init__(self):
        super().__init__()
        self.canonical, self.robots = [], []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'link' and 'canonical' in a.get('rel', '').lower().split():
            self.canonical.append(a.get('href'))
        if tag == 'meta' and a.get('name', '').lower() in ('robots', 'baiduspider'):
            self.robots.extend(a.get('content', '').lower().replace(',', ' ').split())

def validate(root=ROOT, sync=False):
    errors, urls = [], []
    robots_text = (root / 'robots.txt').read_text()
    robots = RobotFileParser()
    robots.parse(robots_text.splitlines())
    declared = robots.site_maps() or []
    for name in ('sitemap.xml', 'sitemap-seo.xml'):
        if f'{BASE}/{name}' not in declared:
            errors.append(f'robots.txt missing Sitemap: {name}')
        tree = ET.parse(root / name)
        if tree.getroot().tag != '{http://www.sitemaps.org/schemas/sitemap/0.9}urlset':
            errors.append(f'{name}: expected urlset')
        for loc in tree.findall('.//{*}loc'):
            url = (loc.text or '').strip()
            if url in urls:
                errors.append(f'duplicate sitemap URL: {url}')
            urls.append(url)
            p = urlsplit(url)
            if p.scheme != 'https' or p.netloc != urlsplit(BASE).netloc or p.query or p.fragment:
                errors.append(f'invalid canonical URL: {url}')
                continue
            rel = unquote(p.path).lstrip('/')
            file = (root / (rel + 'index.html' if not rel or rel.endswith('/') else rel)).resolve()
            if not file.is_relative_to(root.resolve()) or not file.is_file():
                errors.append(f'missing page: {url}')
                continue
            head = Head()
            head.feed(file.read_text())
            if head.canonical != [url]:
                errors.append(f'canonical mismatch: {url}: {head.canonical}')
            if set(head.robots) & {'noindex', 'none'}:
                errors.append(f'noindex in sitemap: {url}')
            if not robots.can_fetch('Baiduspider', url) or not robots.can_fetch('*', url):
                errors.append(f'robots disallow in sitemap: {url}')
    queue = root / 'scripts/baidu_urls.txt'
    old = queue.read_text().splitlines()
    existing = [u.strip() for u in old if u.strip()]
    if len(existing) != len(set(existing)):
        errors.append('duplicate Baidu queue URL')
    for url in existing:
        if url not in urls:
            errors.append(f'queue URL absent from sitemap (manual cursor migration required): {url}')
    missing = [u for u in urls if u not in existing]
    if not errors and sync and missing:
        # Preserve all previous entries and their numeric offsets.
        queue.write_text('\n'.join(existing + missing) + '\n')
    elif missing:
        errors.extend(f'missing queue URL: {u}' for u in missing)
    return errors, len(set(urls)), len(missing)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sync', action='store_true')
    args = parser.parse_args()
    errors, count, added = validate(sync=args.sync)
    for error in errors:
        print(f'ERROR: {error}')
    if not errors:
        print(f'OK: {count} sitemap/queue URLs; appended {added if args.sync else 0}')
    raise SystemExit(bool(errors))
