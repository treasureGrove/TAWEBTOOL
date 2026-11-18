#!/usr/bin/env node
/**
 * 把存量 SEO 文章里没转换的行内 markdown 补成 HTML。
 *
 * 背景：mdToHtml 早期只做转义和块级转换，AI 输出的 `**加粗**`、`` `代码` ``、
 * `[文字](链接)` 被原样印在页面上（166 篇里 3400+ 处），看起来像半成品。
 * 生成器已经修好，这个脚本负责把已经发出去的页面补一遍。
 *
 * 只处理 <article> 内部的文本节点：标签和属性一律不碰，重复运行是幂等的。
 *
 * 用法：
 *   node scripts/fix_seo_inline_markdown.mjs           # 写入
 *   node scripts/fix_seo_inline_markdown.mjs --check   # 只报告（有待修复时退出码 1）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

function inline(text) {
  return text
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="nofollow noopener" target="_blank">$1</a>');
}

/** 只改 <article> 里标签之外的文本，避免动到 class、href 等属性。 */
function convertArticle(html) {
  return html.replace(/<article[\s\S]*?<\/article>/i, (region) =>
    region.replace(/(<[^>]+>)|([^<]+)/g, (full, tag, text) => (tag ? tag : inline(text)))
  );
}

const remaining = (html) => {
  const region = /<article[\s\S]*?<\/article>/i.exec(html);
  if (!region) return 0;
  return (region[0].replace(/<[^>]+>/g, '').match(/\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:/g) || []).length;
};

function targets() {
  const out = [];
  for (const dir of ['seo', 'en/seo']) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs).sort()) {
      if (name.endsWith('.html')) out.push(`${dir}/${name}`);
    }
  }
  return out;
}

let changed = 0;
let before = 0;
let after = 0;
for (const rel of targets()) {
  const abs = path.join(ROOT, rel);
  const original = fs.readFileSync(abs, 'utf8');
  const b = remaining(original);
  if (!b) continue;
  const next = convertArticle(original);
  if (next === original) continue; // 这里是代码里的 `**` 幂运算符，本来就不该转
  const a = remaining(next);
  before += b;
  after += a;
  changed++;
  if (!CHECK) fs.writeFileSync(abs, next, 'utf8');
}

const residual = targets().reduce((sum, rel) => sum + remaining(fs.readFileSync(path.join(ROOT, rel), 'utf8')), 0);
console.log(`[seo-md] ${CHECK ? '待修复' : '已修复'} ${changed} 篇，标记 ${before} → 残留 ${after}；全站剩余 ${residual} 处（代码里的 ** 幂运算属于正常文本）`);
if (CHECK && changed) process.exit(1);
