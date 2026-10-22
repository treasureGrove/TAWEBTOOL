#!/usr/bin/env python3
"""Validate sitemap indexing policy; append missing Baidu URLs without reordering.

No automatic deletion: removing/reordering entries requires an explicit cursor migration.
"""
import argparse
import json
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
        self.canonical, self.robots, self.redirect = [], [], False
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'link' and 'canonical' in a.get('rel', '').lower().split():
            self.canonical.append(a.get('href'))
        if tag == 'meta' and a.get('name', '').lower() in ('robots', 'baiduspider'):
            self.robots.extend(a.get('content', '').lower().replace(',', ' ').split())
        if tag == 'meta' and a.get('http-equiv', '').lower() == 'refresh':
            self.redirect = True

def indexable_tool_pages(root=ROOT):
    """Only generate self-canonical, crawlable tool pages, never redirect stubs."""
    robots = RobotFileParser()
    robots.parse((root / 'robots.txt').read_text(encoding='utf-8').splitlines())
    pages = []
    for file in sorted((root / 'tools_html').glob('*.html'), key=lambda file: file.name):
        url = f'{BASE}/tools_html/{file.name}'
        head = Head()
        head.feed(file.read_text(encoding='utf-8'))
        if (head.canonical == [url] and not head.redirect
                and not set(head.robots) & {'noindex', 'none'}
                and robots.can_fetch('Baiduspider', url) and robots.can_fetch('*', url)):
            pages.append(file.name)
    return pages

def validate(root=ROOT, sync=False, candidate=None):
    errors, urls = [], []
    robots_text = (root / 'robots.txt').read_text(encoding='utf-8')
    robots = RobotFileParser()
    robots.parse(robots_text.splitlines())
    declared = robots.site_maps() or []
    for name in ('sitemap.xml', 'sitemap-seo.xml'):
        if f'{BASE}/{name}' not in declared:
            errors.append(f'robots.txt missing Sitemap: {name}')
        tree = ET.parse(candidate if name == 'sitemap.xml' and candidate else root / name)
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
            head.feed(file.read_text(encoding='utf-8'))
            if head.canonical != [url]:
                errors.append(f'canonical mismatch: {url}: {head.canonical}')
            if set(head.robots) & {'noindex', 'none'}:
                errors.append(f'noindex in sitemap: {url}')
            if head.redirect:
                errors.append(f'redirect in sitemap: {url}')
            if not robots.can_fetch('Baiduspider', url) or not robots.can_fetch('*', url):
                errors.append(f'robots disallow in sitemap: {url}')
    queue = root / 'scripts/baidu_urls.txt'
    old = queue.read_text(encoding='utf-8').splitlines()
    existing = [u.strip() for u in old if u.strip()]
    if len(existing) != len(set(existing)):
        errors.append('duplicate Baidu queue URL')
    for url in existing:
        if url not in urls:
            errors.append(f'queue URL absent from sitemap (manual cursor migration required): {url}')
    missing = [u for u in urls if u not in existing]
    if missing and (errors or not sync):
        errors.extend(f'missing queue URL: {u}' for u in missing)
    if not errors and sync:
        # Publish only after validating the entire candidate and existing queue.
        if candidate:
            candidate.replace(root / 'sitemap.xml')
        if missing:
            # Preserve all previous entries and their numeric offsets.
            queue.write_text('\n'.join(existing + missing) + '\n', encoding='utf-8')
    return errors, len(set(urls)), len(missing)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sync', action='store_true')
    parser.add_argument('--list-tool-pages', action='store_true')
    parser.add_argument('--sitemap-candidate', type=Path)
    args = parser.parse_args()
    if args.list_tool_pages:
        print(json.dumps(indexable_tool_pages()))
        raise SystemExit(0)
    if args.sitemap_candidate and not args.sync:
        parser.error('--sitemap-candidate requires --sync')
    errors, count, added = validate(sync=args.sync, candidate=args.sitemap_candidate)
    for error in errors:
        print(f'ERROR: {error}')
    if not errors:
        print(f'OK: {count} sitemap/queue URLs; appended {added if args.sync else 0}')
    raise SystemExit(bool(errors))
