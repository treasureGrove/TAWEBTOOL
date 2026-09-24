#!/usr/bin/env node
/**
 * 给 /seo/ 与 /en/seo/ 文章页注入工具互链组件脚本标签。
 * 幂等：已注入的文件自动跳过。新增 SEO 页面后重跑一次即可。
 * 用法：node scripts/inject_seo_tool_link.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARK = 'seo_tool_link.js';
const INJECT = '<script src="/js/menu.js"></script>\n<script src="/js/seo_tool_link.js"></script>\n</body>';

const dirs = ['seo', path.join('en', 'seo')];
let changed = 0, skipped = 0;
for (const dir of dirs) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) continue;
  for (const f of fs.readdirSync(full)) {
    if (!f.endsWith('.html')) continue;
    const p = path.join(full, f);
    let html = fs.readFileSync(p, 'utf8');
    if (html.includes(MARK)) { skipped++; continue; }
    if (!html.includes('</body>')) { console.warn('skip (no </body>):', p); continue; }
    html = html.replace('</body>', INJECT);
    fs.writeFileSync(p, html);
    changed++;
  }
}
console.log(`[seo-tool-link] 注入 ${changed} 个页面，跳过 ${skipped} 个已注入页面`);
