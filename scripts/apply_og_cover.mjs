#!/usr/bin/env node
/**
 * 把站点统一缩略图（og:image / twitter:image）应用到静态页面。
 *
 * 背景：站点原先用 assets/images/icon/icon.png（1254x1254 方形图标，679KB）当分享图，
 * 社交/搜索结果里会被裁成方块；seo/ 与 en/seo/ 的词条页则完全没有 og:image。
 * 本脚本把 1200x630 的站点缩略图补齐到首页、工具页、词条页，幂等可重跑。
 *
 * 用法：node scripts/apply_og_cover.mjs [--check]
 *   --check 只报告差异，不写文件（有文件需要更新时退出码 1）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const COVER = 'https://tools.treasuregrove.art/assets/images/og/site-cover-1200x630.jpg';
const LEGACY_IMAGES = [
  'https://tools.treasuregrove.art/assets/images/icon/icon.png',
  'https://tools.treasuregrove.art/assets/images/icon/icon.jpg'
];
const ALT_ZH = 'TA工具箱 · 技术美术在线工具箱';
const ALT_EN = 'TA Toolbox - free online technical artist tools';

/** 需要覆盖的目录/文件（相对仓库根） */
function targetFiles() {
  const files = ['index.html', 'en/index.html'];
  for (const dir of ['tools_html', 'seo', 'en/seo']) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs)) {
      if (name.endsWith('.html')) files.push(`${dir}/${name}`);
    }
  }
  return files;
}

const isEn = (text) => /<html[^>]+lang=["']en["']/i.test(text);
const meta = (attr, key, value) => `    <meta ${attr}="${key}" content="${value}">`;

/** 本脚本管理的 meta 行（重排时先全部摘除，再按固定顺序放回，保证幂等） */
const MANAGED = [
  /<meta\s+property="og:image"(\s|>)/,
  /<meta\s+property="og:image:(?:type|width|height|alt|secure_url)"/
];
const MANAGED_TW = [/<meta\s+name="twitter:card"/, /<meta\s+name="twitter:image"/];
const OG_PLACEHOLDER = '__OG_COVER_BLOCK__';
const TW_PLACEHOLDER = '__TW_CARD_BLOCK__';

function dedupeImageMeta(text) {
  const seen = new Set();
  return text
    .split('\n')
    .filter((line) => {
      if (!/^\s*<meta\s+(?:property|name)="(?:og:image|twitter:image)"/.test(line)) return true;
      const key = line.trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join('\n');
}

function fixFile(rel) {
  const abs = path.join(ROOT, rel);
  const original = fs.readFileSync(abs, 'utf8');
  let text = dedupeImageMeta(original);
  for (const old of LEGACY_IMAGES) text = text.split(old).join(COVER);

  const alt = isEn(text) ? ALT_EN : ALT_ZH;
  const lines = text.split('\n');

  // 1) 摘除所有受管行，在各自首次出现处留一个占位符
  const kept = [];
  let ogSlot = -1;
  let twSlot = -1;
  for (const line of lines) {
    if (MANAGED.some((re) => re.test(line))) {
      if (ogSlot === -1) {
        ogSlot = kept.length;
        kept.push(OG_PLACEHOLDER);
      }
      continue;
    }
    if (MANAGED_TW.some((re) => re.test(line))) {
      if (twSlot === -1) {
        twSlot = kept.length;
        kept.push(TW_PLACEHOLDER);
      }
      continue;
    }
    kept.push(line);
  }

  // 2) 没有位置就挂到 canonical / robots / title 之后
  const findIn = (arr, re) => arr.findIndex((l) => re.test(l));
  if (ogSlot === -1) {
    const anchor = [/<link\s+rel="canonical"/, /<meta\s+name="robots"/, /<title>/]
      .map((re) => findIn(kept, re))
      .find((i) => i !== -1);
    if (anchor === undefined) return { rel, status: 'skip', reason: 'no insertion anchor' };
    kept.splice(anchor + 1, 0, OG_PLACEHOLDER);
    ogSlot = anchor + 1;
  }
  if (twSlot === -1) {
    kept.splice(ogSlot + 1, 0, TW_PLACEHOLDER);
    twSlot = ogSlot + 1;
  }

  // 3) 占位符替换成固定顺序的 meta 块
  const ogBlock = [
    meta('property', 'og:image', COVER),
    meta('property', 'og:image:type', 'image/jpeg'),
    meta('property', 'og:image:width', '1200'),
    meta('property', 'og:image:height', '630'),
    meta('property', 'og:image:alt', alt)
  ];
  const twBlock = [meta('name', 'twitter:card', 'summary_large_image'), meta('name', 'twitter:image', COVER)];
  const next = kept
    .flatMap((line) => (line === OG_PLACEHOLDER ? ogBlock : line === TW_PLACEHOLDER ? twBlock : [line]))
    .join('\n');

  if (next === original) return { rel, status: 'ok' };
  if (!CHECK) fs.writeFileSync(abs, next, 'utf8');
  return { rel, status: 'updated' };
}

const results = targetFiles().map(fixFile);
const updated = results.filter((r) => r.status === 'updated');
const skipped = results.filter((r) => r.status === 'skip');
console.log(
  `[og-cover] 扫描 ${results.length} 个页面：更新 ${updated.length}、已是最新 ${
    results.length - updated.length - skipped.length
  }、跳过 ${skipped.length}`
);
for (const r of updated) console.log(`  ~ ${r.rel}`);
for (const r of skipped) console.log(`  ! ${r.rel} (${r.reason})`);
if (CHECK && updated.length) process.exit(1);
