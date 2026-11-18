#!/usr/bin/env node
/**
 * 给每个工具页生成独立的分享卡片（1200x630 PNG），替代原先全站共用一张封面。
 *
 * 为什么要有独立卡片：页面 OG 标签写对了，但如果 37 个工具分享出去是同一张图，
 * 转发和搜索结果里的点击率几乎没有区分度。这里用无头浏览器渲染一张纯 HTML 卡片。
 *
 * 渲染器：优先用本机 Edge / Chrome 的 headless 模式截图（不引入新依赖）。
 * 用法：node scripts/gen_tool_og.mjs [--only=slug] [--force]
 * 输出：assets/images/og/tool/<slug>-1200x630.png
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TOOL_META, CARD_DIR } from './tool_meta.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, CARD_DIR);
const WORK_DIR = path.join(ROOT, '.tmp', 'og');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);
const FORCE = process.argv.includes('--force');

const BROWSERS = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean);

const browser = BROWSERS.find((p) => fs.existsSync(p));
if (!browser) {
  console.error('[tool-og] 找不到 Edge/Chrome，可用 BROWSER_PATH 指定');
  process.exit(1);
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function cardHtml(meta) {
  const badge = meta.local
    ? '<div class="badge"><span class="dot"></span>浏览器本地处理 · 素材不上传</div>'
    : '';
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1200px;height:630px;overflow:hidden}
  body{background:#0d1014;color:#eef2f6;position:relative;display:flex;flex-direction:column;
    justify-content:center;padding:0 88px;
    font-family:"Microsoft YaHei","PingFang SC","Noto Sans CJK SC","Hiragino Sans GB",sans-serif}
  .grid{position:absolute;inset:0;
    background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),
      linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);
    background-size:60px 60px}
  .glow{position:absolute;width:780px;height:780px;right:-240px;top:-270px;border-radius:50%;
    background:radial-gradient(circle,rgba(122,180,255,.30),transparent 62%)}
  .brand{position:absolute;top:54px;right:88px;font-size:25px;letter-spacing:.05em;color:#93a7bb}
  .brand b{color:#eef2f6}
  .kicker{position:relative;font-size:25px;color:#7dd3a8;letter-spacing:.18em;margin-bottom:24px}
  h1{position:relative;font-size:76px;line-height:1.16;font-weight:800;letter-spacing:-.01em;max-width:1000px}
  .pitch{position:relative;font-size:34px;color:#a9bccd;margin-top:24px}
  .badge{position:relative;display:flex;align-items:center;gap:12px;margin-top:34px;font-size:24px;color:#7dd3a8}
  .dot{width:12px;height:12px;border-radius:50%;background:#7dd3a8;box-shadow:0 0 16px rgba(125,211,168,.9)}
  .rule{position:absolute;left:0;bottom:0;height:6px;width:100%;
    background:linear-gradient(90deg,#7dd3a8,#7ab4ff 55%,transparent)}
</style></head>
<body>
  <div class="grid"></div><div class="glow"></div>
  <div class="brand"><b>TA工具箱</b> · tools.treasuregrove.art</div>
  <div class="kicker">技术美术在线工具</div>
  <h1>${esc(meta.name)}</h1>
  <p class="pitch">${esc(meta.pitch)}</p>
  ${badge}
  <div class="rule"></div>
</body></html>`;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(WORK_DIR, { recursive: true });
const profileDir = path.join(WORK_DIR, 'profile').replace(/\\/g, '/');

const jobs = Object.entries(TOOL_META)
  .map(([rel, meta]) => ({ slug: rel.replace(/\.html$/, ''), meta }))
  .filter((j) => !ONLY || j.slug === ONLY);

let made = 0;
let skipped = 0;
for (const { slug, meta } of jobs) {
  const out = path.join(OUT_DIR, `${slug}-1200x630.png`);
  if (!FORCE && fs.existsSync(out)) {
    skipped++;
    continue;
  }
  const htmlFile = path.join(WORK_DIR, `${slug}.html`);
  fs.writeFileSync(htmlFile, cardHtml(meta), 'utf8');
  const res = spawnSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--user-data-dir=${profileDir}`,
      '--window-size=1200,630',
      '--virtual-time-budget=1500',
      `--screenshot=${out}`,
      `file:///${htmlFile.replace(/\\/g, '/')}`
    ],
    { stdio: 'pipe', timeout: 60000 }
  );
  if (!fs.existsSync(out)) {
    console.error(`[tool-og] 渲染失败 ${slug}: ${res.stderr?.toString().split('\n')[0] || 'no output'}`);
    continue;
  }
  made++;
}

console.log(`[tool-og] 新生成 ${made} 张、已存在跳过 ${skipped} 张 → ${CARD_DIR}/`);
