#!/usr/bin/env node
/**
 * 收录推送 + 粗略收录检查
 * - 收集 sitemap*.xml + seo_urls.txt 的所有 URL
 * - 提交到 IndexNow（同步 Bing/Yandex）
 * - 粗略检查百度收录数（site: 查询，可能被反爬，仅参考）
 * 百度主动推送由 baidu_push.sh（10条/天轮转）负责。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://tools.treasuregrove.art';
const HOST = new URL(BASE).host;
const KEY = 'ad38b8ff19aa48c1916bbb3c945cd672';

function extractUrls(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

async function collectUrls() {
  const urls = new Set();
  for (const f of ['sitemap.xml', 'sitemap-seo.xml']) {
    try {
      const xml = await fs.readFile(path.join(ROOT, f), 'utf8');
      extractUrls(xml).forEach((u) => urls.add(u));
    } catch {}
  }
  for (const f of ['scripts/seo_urls.txt', 'scripts/baidu_urls.txt']) {
    try {
      const txt = await fs.readFile(path.join(ROOT, f), 'utf8');
      txt.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).forEach((u) => urls.add(u));
    } catch {}
  }
  return [...urls];
}

async function submitIndexNow(urls) {
  const body = JSON.stringify({ host: HOST, key: KEY, keyLocation: `${BASE}/${KEY}.txt`, urlList: urls });
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body
  });
  const text = await res.text();
  return `${res.status} ${text.slice(0, 200)}`;
}

async function main() {
  const urls = await collectUrls();
  console.log(`[indexnow] 共收集 ${urls.length} 个 URL`);
  if (!urls.length) return;
  const resp = await submitIndexNow(urls.slice(0, 10000));
  console.log(`[indexnow] 提交结果: ${resp}`);

  // 粗略百度收录检查（可能被反爬拦截，仅作参考）
  try {
    const r = await fetch(`https://www.baidu.com/s?wd=${encodeURIComponent('site:' + HOST)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' }
    });
    const t = await r.text();
    const m = t.match(/找到相关结果[数]?约?\s*([\d,]+)\s*个/);
    console.log(`[indexnow] 百度收录(粗略): ${m ? m[1] + ' 个' : '无法解析(可能被反爬)'}`);
  } catch (e) {
    console.warn('[indexnow] 百度检查失败:', e.message);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
