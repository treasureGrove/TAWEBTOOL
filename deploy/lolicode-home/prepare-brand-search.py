"""Prepare the brand-search revision from captured production HTML, preserving other work."""
from pathlib import Path
import hashlib
import json
import sys

REPO = Path(__file__).resolve().parents[2]
WORK = REPO / 'tmp/lolicode-brand-search-20261027'
BATCH = '20261027-brand-search-v1'
TITLE = 'LoliCode 官网｜AI 编程助手与桌面 Agent · Windows 下载'
DESCRIPTION = 'LoliCode 官方网站。下载 Windows 版 AI 编程助手与桌面 Agent，自由选择模型，编写代码、调用工具、预览成果。提供安装版、便携版、功能演示与更新记录。'


def once(text, before, after):
    if text.count(before) != 1:
        raise ValueError('Ambiguous or missing source marker: ' + before[:70])
    return text.replace(before, after, 1)


def revise(html):
    html = once(html, 'LoliCode，一个简单易用、自由扩展的二次元桌面 Agent。自由选择模型，在同一个对话里编写代码、调用工具、查看成果。下载 Windows 版，开始你的下一次创作。', DESCRIPTION)
    html = once(html, 'content="LoliCode · 让灵感，有个可爱的执行者"', f'content="{TITLE}"')
    html = once(html, 'content="简单易用，自由扩展。一个主对话，让模型、工具与灵感一起工作。"', f'content="{DESCRIPTION}"')
    begin = html.index('    <script type="application/ld+json">')
    end = html.index('    </script>', begin) + len('    </script>')
    graph = {
        '@context': 'https://schema.org',
        '@graph': [
            {'@type': 'Organization', '@id': 'https://lolicode.com/#organization',
             'name': 'LoliCode', 'url': 'https://lolicode.com/',
             'logo': 'https://lolicode.com/desktop-assets/site-icon-512.png',
             'sameAs': ['https://github.com/treasureGrove/LoliCode-Releases']},
            {'@type': 'WebSite', '@id': 'https://lolicode.com/#website',
             'url': 'https://lolicode.com/', 'name': 'LoliCode',
             'alternateName': 'LoliCode 官网', 'inLanguage': 'zh-CN',
             'publisher': {'@id': 'https://lolicode.com/#organization'}},
            {'@type': 'WebPage', '@id': 'https://lolicode.com/#webpage',
             'url': 'https://lolicode.com/', 'name': TITLE, 'description': DESCRIPTION,
             'inLanguage': 'zh-CN', 'isPartOf': {'@id': 'https://lolicode.com/#website'},
             'about': {'@id': 'https://lolicode.com/#app'}},
            {'@type': 'SoftwareApplication', '@id': 'https://lolicode.com/#app',
             'name': 'LoliCode', 'url': 'https://lolicode.com/',
             'applicationCategory': 'DeveloperApplication', 'operatingSystem': 'Windows',
             'image': 'https://lolicode.com/desktop-assets/site-icon-512.png',
             'description': 'AI 编程助手与桌面 Agent。自由选择模型，在同一工作台编写代码、调用工具、预览成果。',
             'publisher': {'@id': 'https://lolicode.com/#organization'},
             'downloadUrl': 'https://github.com/treasureGrove/LoliCode-Releases/releases/latest'}
        ]}
    html = html[:begin] + '    <script type="application/ld+json">\n' + '\n'.join('      ' + line for line in json.dumps(graph, ensure_ascii=False, indent=2).splitlines()) + '\n    </script>' + html[end:]
    html = once(html, 'aria-label="LoliCode 首页"', 'aria-label="LoliCode 官方网站首页"')
    html = once(html, '<span class="tiny-gem" aria-hidden="true"></span> A LITTLE\n            COMPANION. BIG POSSIBILITIES.', '<span class="tiny-gem" aria-hidden="true"></span> LOLICODE 官方网站 · AI 编程助手')
    html = once(html, '<span class="title-line"><span>把想法，</span></span>', '<span class="title-line"><span>LoliCode</span></span>')
    html = once(html, '<span class="title-line"><span>变成<span class="title-accent">作品。</span></span></span>', '<span class="title-line"><span>让想法<span class="title-accent">成真。</span></span></span>')
    html = once(html, '一个认真做事、有点可爱的桌面 Agent。<br />写代码、用工具，陪你把「想做」变成「做到了」。', '你的 AI 编程助手与桌面 Agent。<br />自由选择模型，写代码、用工具，把想法变成作品。')
    html = once(html, '            <p class="platform-note">\n              macOS', '            <p class="platform-note">\n              官方下载：<a href="https://github.com/treasureGrove/LoliCode-Releases/releases/latest" target="_blank" rel="noopener noreferrer">GitHub 最新发布 · 安装版与便携版 ↗</a>\n            </p>\n            <p class="platform-note">\n              macOS')
    html = once(html, '<p>简单易用，自由扩展。带一点可爱的认真。</p>', '<p>LoliCode 官方网站 · lolicode.com<br />AI 编程助手与桌面 Agent，简单易用，自由扩展。</p>')
    html = once(html, '>GitHub 下载 ↗</a', '>GitHub 官方发布 ↗</a')
    return html


def prepare():
    baseline = (WORK / 'before/index.html').read_text(encoding='utf-8')
    directory = WORK / 'home'
    directory.mkdir(parents=True, exist_ok=True)
    (directory / 'index.html').write_text(revise(baseline), encoding='utf-8', newline='\n')
    sitemap = (WORK / 'before/sitemap-desktop.xml').read_text(encoding='utf-8')
    (directory / 'sitemap-desktop.xml').write_text(once(sitemap, '<lastmod>2026-10-20</lastmod>', '<lastmod>2026-10-27</lastmod>'), encoding='utf-8', newline='\n')
    robots = (WORK / 'before/robots.txt').read_text(encoding='utf-8')
    assert 'sitemap-desktop.xml' not in robots
    (directory / 'robots.txt').write_text(robots.rstrip() + '\nSitemap: https://lolicode.com/sitemap-desktop.xml\n', encoding='utf-8', newline='\n')
    manifest = {'batch': BATCH, 'files': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(directory.iterdir())}}
    path = WORK / 'manifest.json'
    path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps({'manifest': manifest, 'manifestSHA256': hashlib.sha256(path.read_bytes()).hexdigest()}, indent=2))


if __name__ == '__main__':
    if sys.argv[1:] == ['prepare']:
        prepare()
    elif sys.argv[1:] == ['source']:
        target = REPO / 'lolicode/index.html'
        original = target.read_bytes()
        (WORK / 'before/source-index.html').write_bytes(original)
        revised = revise(original.decode('utf-8').replace('\r\n', '\n'))
        if b'\r\n' in original:
            revised = revised.replace('\n', '\r\n')
        target.write_bytes(revised.encode('utf-8'))
        print('Updated only the selected brand/search content in the existing source.')
    else:
        raise SystemExit('Expected prepare or source')
