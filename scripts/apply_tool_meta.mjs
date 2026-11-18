#!/usr/bin/env node
/**
 * 把 scripts/tool_meta.mjs 里的搜索意图文案写进 tools_html/*.html。
 *
 * 只改四个字段：<title>、description、og:title、og:description。
 * og:image 由 scripts/apply_og_cover.mjs 统一管理，这里不碰，避免两边互相覆盖。
 *
 * 实现上按行处理并沿用原文件的换行符（CRLF/LF）：用跨行正则替换会吃掉换行，
 * 把相邻两行 meta 合并成一行——2026-11-18 第一次跑就踩过这个坑。
 *
 * 用法：
 *   node scripts/apply_tool_meta.mjs           # 写入
 *   node scripts/apply_tool_meta.mjs --check   # 只报告差异（有差异时退出码 1）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_META, BRAND } from './tool_meta.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const SUFFIX = ` - ${BRAND}`;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const indentOf = (line) => /^\s*/.exec(line)[0];

/** og:title 用去掉品牌尾巴的短标题，分享卡片上更干净。 */
function socialTitle(title) {
  return title.endsWith(SUFFIX) ? title.slice(0, -SUFFIX.length) : title;
}

const FIELDS = [
  { key: 'title', re: /^\s*<title>/, build: (v, ind) => `${ind}<title>${esc(v)}</title>` },
  { key: 'description', re: /^\s*<meta\s+name=["']description["']/i, build: (v, ind) => `${ind}<meta name="description" content="${esc(v)}">` },
  { key: 'og:title', re: /^\s*<meta\s+property=["']og:title["']/i, build: (v, ind) => `${ind}<meta property="og:title" content="${esc(v)}">` },
  { key: 'og:description', re: /^\s*<meta\s+property=["']og:description["']/i, build: (v, ind) => `${ind}<meta property="og:description" content="${esc(v)}">` },
  { key: 'twitter:title', re: /^\s*<meta\s+name=["']twitter:title["']/i, build: (v, ind) => `${ind}<meta name="twitter:title" content="${esc(v)}">` },
  { key: 'twitter:description', re: /^\s*<meta\s+name=["']twitter:description["']/i, build: (v, ind) => `${ind}<meta name="twitter:description" content="${esc(v)}">` }
];

function apply(rel, meta) {
  const abs = path.join(ROOT, 'tools_html', rel);
  const original = fs.readFileSync(abs, 'utf8');
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const lines = original.split(/\r?\n/);
  const problems = [];

  const values = {
    title: meta.title,
    description: meta.description,
    'og:title': socialTitle(meta.title),
    'og:description': meta.description,
    'twitter:title': socialTitle(meta.title),
    'twitter:description': meta.description
  };

  const missingFields = [];
  for (const field of FIELDS) {
    const index = lines.findIndex((line) => field.re.test(line));
    if (index === -1) {
      missingFields.push(field);
      continue;
    }
    lines[index] = field.build(values[field.key], indentOf(lines[index]));
  }

  // 少数页面原本没有 og:title / twitter:description 之类的标签，
  // 共享出去就是一张没有标题的卡片；这里统一补在站点名或 canonical 之后。
  if (missingFields.length) {
    const anchor = lines.findIndex((line) => /og:site_name|og:url|rel=["']canonical["']|<title>/.test(line));
    if (anchor === -1) {
      problems.push(`no anchor for ${missingFields.map((f) => f.key).join('/')}`);
    } else {
      lines.splice(anchor + 1, 0, ...missingFields.map((f) => f.build(values[f.key], '    ')));
      inserted.push(`${rel}: ${missingFields.map((f) => f.key).join(', ')}`);
    }
  }

  const next = lines.join(eol);
  if (next === original) return { rel, status: 'ok', problems };
  if (!CHECK) fs.writeFileSync(abs, next, 'utf8');
  return { rel, status: 'updated', problems };
}

const entries = Object.entries(TOOL_META);
const missing = entries.filter(([rel]) => !fs.existsSync(path.join(ROOT, 'tools_html', rel)));
if (missing.length) {
  console.error(`[tool-meta] 表里有 ${missing.length} 个页面不存在：${missing.map(([r]) => r).join(', ')}`);
  process.exit(1);
}

const inserted = [];
const results = entries.map(([rel, meta]) => apply(rel, meta));
const updated = results.filter((r) => r.status === 'updated');
const warnings = results.filter((r) => r.problems.length);
console.log(`[tool-meta] 检查 ${results.length} 个工具页：${CHECK ? '待更新' : '更新'} ${updated.length}、已是最新 ${results.length - updated.length}`);
for (const r of updated) console.log(`  ~ ${r.rel}`);
for (const line of inserted) console.log(`  + ${line}`);
for (const r of warnings) console.log(`  ! ${r.rel} (${r.problems.join(', ')})`);
if (CHECK && updated.length) process.exit(1);
