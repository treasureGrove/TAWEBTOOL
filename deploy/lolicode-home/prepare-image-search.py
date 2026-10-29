"""Prepare image discovery metadata from captured live text, preserving every asset."""
from pathlib import Path
import hashlib
import html
import json
import re
import sys
import xml.etree.ElementTree as ET

REPO = Path(__file__).resolve().parents[2]
WORK = REPO / 'tmp/lolicode-image-search-20261027'
BATCH = '20261027-image-search-v1'
ORIGIN = 'https://lolicode.com/'
ASSETS = ORIGIN + 'desktop-assets/'
IMAGE_NAMES = [
    'site-icon-512.png', 'companion.webp', 'workbench.jpg',
    'workbench-cream.jpg', 'channels-light.jpg', 'tour-poster.webp',
]
ROBOTS = 'index, follow, max-image-preview:large'


def replace_one(source, pattern, replacement, label):
    result, count = re.subn(pattern, replacement, source, flags=re.S)
    if count != 1:
        raise ValueError('Expected one source marker: ' + label)
    return result


def revise_home(source):
    if re.search(r'<meta\b[^>]*\bname=[\"\']robots[\"\']', source, re.I):
        raise ValueError('Existing robots metadata requires explicit review')
    viewport = '<meta name="viewport" content="width=device-width, initial-scale=1" />'
    if source.count(viewport) != 1:
        raise ValueError('Expected one viewport marker')
    source = source.replace(viewport, viewport + '\n    <meta name="robots" content="' + ROBOTS + '" />', 1)
    hero_match = re.search(r'<img\b(?=[^>]*\bclass="hero-companion")[^>]*>', source, re.S)
    if hero_match is None:
        raise ValueError('Missing hero image')
    hero = hero_match.group(0)
    alt_match = re.search(r'\balt="([^"]+)"', hero)
    if alt_match is None:
        raise ValueError('Missing descriptive hero alt')
    hero_alt = html.unescape(alt_match.group(1))
    updated_hero = replace_one(
        hero,
        r'(\bsrc="(?:\./assets/|/desktop-assets/)companion\.webp)\?[^\"]*(")',
        r'\1\2',
        'hero stable URL',
    )
    source = source[:hero_match.start()] + updated_hero + source[hero_match.end():]
    replacements = {
        'og:image': ('https://lolicode.com/desktop-assets/site-icon-512.png', ASSETS + 'companion.webp'),
        'og:image:width': ('512', '720'),
        'og:image:height': ('512', '768'),
        'og:image:alt': ('LoliCode 应用图标', html.escape(hero_alt, quote=True)),
    }
    for name, (old, new) in replacements.items():
        pattern = r'(<meta\s+property="' + re.escape(name) + r'"\s+content=")' + re.escape(old) + r'("\s*/>)'
        source = replace_one(source, pattern, lambda match: match[1] + new + match[2], name)

    script_pattern = r'(?P<open><script\s+type="application/ld\+json">)(?P<body>.*?)(?P<close></script>)'
    scripts = list(re.finditer(script_pattern, source, re.S))
    if len(scripts) != 1:
        raise ValueError('Expected one structured-data graph')
    script = scripts[0]
    structured = json.loads(script['body'])
    graph = structured['@graph']
    by_type = {node['@type']: node for node in graph}
    if len(graph) != 4 or set(by_type) != {'Organization', 'WebSite', 'WebPage', 'SoftwareApplication'}:
        raise ValueError('Unexpected existing structured-data entities')
    icon_id = ORIGIN + '#app-icon'
    hero_id = ORIGIN + '#hero-image'
    by_type['Organization']['logo'] = {'@id': icon_id}
    by_type['WebPage']['primaryImageOfPage'] = {'@id': hero_id}
    by_type['SoftwareApplication']['screenshot'] = [ASSETS + name for name in ['workbench.jpg', 'workbench-cream.jpg', 'channels-light.jpg']]
    graph.extend([
        {'@type': 'ImageObject', '@id': icon_id, 'name': 'LoliCode 应用图标',
         'caption': 'LoliCode 官方应用图标', 'url': ASSETS + 'site-icon-512.png',
         'contentUrl': ASSETS + 'site-icon-512.png', 'width': 512, 'height': 512,
         'encodingFormat': 'image/png'},
        {'@type': 'ImageObject', '@id': hero_id, 'name': 'LoliCode 官网主图',
         'caption': hero_alt, 'url': ASSETS + 'companion.webp',
         'contentUrl': ASSETS + 'companion.webp', 'width': 720, 'height': 768,
         'encodingFormat': 'image/webp'},
    ])
    rendered = '\n' + '\n'.join('      ' + line for line in json.dumps(structured, ensure_ascii=False, indent=2).splitlines()) + '\n    '
    return source[:script.start('body')] + rendered + source[script.end('body'):]


def revise_sitemap(source):
    sitemap_ns = 'http://www.sitemaps.org/schemas/sitemap/0.9'
    image_ns = 'http://www.google.com/schemas/sitemap-image/1.1'
    root = ET.fromstring(source)
    urls = root.findall('{' + sitemap_ns + '}url')
    if root.tag != '{' + sitemap_ns + '}urlset' or len(urls) != 1 or urls[0].findtext('{' + sitemap_ns + '}loc') != ORIGIN:
        raise ValueError('Unexpected homepage sitemap')
    if urls[0].findtext('{' + sitemap_ns + '}lastmod') != '2026-10-27' or list(urls[0].iter('{' + image_ns + '}image')):
        raise ValueError('Unexpected sitemap date or existing image entries')
    marker = '<urlset xmlns="' + sitemap_ns + '">'
    if source.count(marker) != 1 or source.count('  </url>') != 1:
        raise ValueError('Unexpected sitemap source markers')
    result = source.replace(marker, '<urlset xmlns="' + sitemap_ns + '"\n        xmlns:image="' + image_ns + '">', 1)
    image_nodes = ''.join('    <image:image>\n      <image:loc>' + ASSETS + name + '</image:loc>\n    </image:image>\n' for name in IMAGE_NAMES)
    result = result.replace('  </url>', image_nodes + '  </url>', 1)
    if len(list(ET.fromstring(result).iter('{' + image_ns + '}image'))) != 6:
        raise ValueError('Expected six image sitemap entries')
    return result


def decode(data):
    return data.decode('utf-8').replace('\r\n', '\n')


def prepare():
    outputs = {
        'index.html': revise_home(decode((WORK / 'before/index.html').read_bytes())),
        'sitemap-desktop.xml': revise_sitemap(decode((WORK / 'before/sitemap-desktop.xml').read_bytes())),
    }
    folder = WORK / 'home'
    folder.mkdir(parents=True, exist_ok=True)
    if set(path.name for path in folder.iterdir()) - set(outputs):
        raise ValueError('Unexpected existing payload file')
    for name, text in outputs.items():
        (folder / name).write_bytes(text.encode('utf-8'))
    manifest = {'batch': BATCH, 'files': {name: hashlib.sha256((folder / name).read_bytes()).hexdigest() for name in sorted(outputs)}}
    data = (json.dumps(manifest, indent=2) + '\n').encode()
    (WORK / 'manifest.json').write_bytes(data)
    print(json.dumps({'manifest': manifest, 'manifestSHA256': hashlib.sha256(data).hexdigest()}, indent=2))


def update_source():
    originals = {name: (REPO / 'lolicode' / name).read_bytes() for name in ['index.html', 'sitemap-desktop.xml']}
    revised = {'index.html': revise_home(decode(originals['index.html'])),
               'sitemap-desktop.xml': revise_sitemap(decode(originals['sitemap-desktop.xml']))}
    folder = WORK / 'before-source/lolicode'
    folder.mkdir(parents=True, exist_ok=True)
    for name, original in originals.items():
        snapshot = folder / name
        if snapshot.exists() and snapshot.read_bytes() != original:
            raise ValueError('Source snapshot already differs')
        if not snapshot.exists():
            snapshot.write_bytes(original)
    for name, content in revised.items():
        if b'\r\n' in originals[name]:
            content = content.replace('\n', '\r\n')
        (REPO / 'lolicode' / name).write_bytes(content.encode('utf-8'))
    print('Updated image metadata in the existing source; unrelated content and assets preserved.')


if __name__ == '__main__':
    actions = {'prepare': prepare, 'source': update_source}
    if len(sys.argv) != 2 or sys.argv[1] not in actions:
        raise SystemExit('Expected prepare or source')
    actions[sys.argv[1]]()
