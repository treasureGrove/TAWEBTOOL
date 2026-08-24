#!/usr/bin/env node
/**
 * 生成 RSS 2.0 feed（/feed.xml）
 * 汇总 TA Wiki 条目 + 程序化 SEO 词条，供 RSS 聚合站/阅读器订阅。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://tools.treasuregrove.art';

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function main() {
  const items = [];

  // TA Wiki 条目
  try {
    const entries = JSON.parse(await fs.readFile(path.join(ROOT, 'data/ta_wiki_entries.json'), 'utf8'));
    for (const e of (Array.isArray(entries) ? entries : [])) {
      items.push({
        title: e.title || '未命名条目',
        link: `${BASE}/tools_html/TA_wiki.html`,
        desc: String(e.summary || '').slice(0, 300),
        date: e.aiUpdatedAt || e.updatedAt || new Date().toISOString().slice(0, 10)
      });
    }
  } catch (e) { console.warn('[rss] 读 wiki 失败:', e.message); }

  // 程序化 SEO 词条（中文）
  try {
    const files = (await fs.readdir(path.join(ROOT, 'seo'))).filter((f) => f.endsWith('.html') && f !== 'index.html');
    for (const f of files) {
      const slug = f.replace(/\.html$/, '');
      const html = await fs.readFile(path.join(ROOT, 'seo', f), 'utf8');
      const title = (html.match(/<title>([^<]*)<\/title>/) || [null, slug])[1];
      items.push({ title, link: `${BASE}/seo/${slug}.html`, desc: title, date: new Date().toISOString().slice(0, 10) });
    }
  } catch (e) { console.warn('[rss] 读 seo 失败:', e.message); }

  items.sort((a, b) => String(b.date).localeCompare(String(a.date)));

  let rss = '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n<channel>\n';
  rss += `  <title>TA工具箱 - 技术美术工具与知识库</title>\n`;
  rss += `  <link>${BASE}</link>\n`;
  rss += `  <description>技术美术(TA)工具、术语百科与知识库的更新订阅</description>\n`;
  rss += `  <language>zh-cn</language>\n`;
  rss += `  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n`;
  for (const it of items.slice(0, 80)) {
    rss += `  <item>\n`;
    rss += `    <title>${esc(it.title)}</title>\n`;
    rss += `    <link>${esc(it.link)}</link>\n`;
    rss += `    <description>${esc(it.desc)}</description>\n`;
    rss += `    <pubDate>${new Date(it.date).toUTCString()}</pubDate>\n`;
    rss += `  </item>\n`;
  }
  rss += '</channel>\n</rss>\n';

  await fs.writeFile(path.join(ROOT, 'feed.xml'), rss, 'utf8');
  console.log(`[rss] feed.xml 已生成，${items.length} 条`);
}

main().catch((e) => { console.error(e); process.exit(1); });
