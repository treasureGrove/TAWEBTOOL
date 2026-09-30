#!/usr/bin/env node
/**
 * 站点缩略图（og:image / 分享预览图）第一步：抓取线上首页截图。
 *
 * 依赖：tests/node_modules/playwright（仓库内已装）+ 已安装的 chromium。
 * 用法：node scripts/gen_site_cover.mjs [url]
 * 输出：.tmp/site-cover-raw.png（1200x630 视口的 2x 原始截图，tmp/ 已被 gitignore）
 *
 * 第二步请执行：python scripts/gen_site_cover.py
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = require(path.join(ROOT, 'tests', 'node_modules', 'playwright'));

const url = process.argv[2] || 'https://tools.treasuregrove.art/';
const outDir = path.join(ROOT, '.tmp');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'site-cover-raw.png');

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2,
  locale: 'zh-CN'
});

await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
// 等背景图与入场动画稳定
await page.waitForTimeout(2500);
await page.screenshot({ path: outFile, type: 'png' });
await browser.close();

const kb = (fs.statSync(outFile).size / 1024).toFixed(1);
console.log(`[cover] 截图完成 ${url} -> ${path.relative(ROOT, outFile)} (${kb} KB)`);
