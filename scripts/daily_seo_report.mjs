#!/usr/bin/env node
/**
 * 每日 SEO / 流量日报
 *
 * 每天跑一次，汇总三件事并发一封邮件：
 *   1. 搜索引擎收录数（Bing / 百度 / DuckDuckGo 的 site: 查询，反爬时记为「无法解析」）
 *   2. 浏览量（nginx access log 统计：昨日 PV/UV、近 7 天趋势、搜索来源、热门页面）
 *   3. 推送状态（百度主动推送轮转位置、IndexNow 最后一次提交）
 *
 * 用法：
 *   node scripts/daily_seo_report.mjs [--no-mail] [--days=7]
 * 环境变量：
 *   NGINX_LOG          access log 路径（默认 /www/wwwlogs/tools.treasuregrove.art.log）
 *   SEO_REPORT_EMAIL   收件人（默认与百度推送一致）
 *   SITE_BASE          站点根 URL
 * 输出：logs/daily_seo_report.last.md（同时作为邮件正文）
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_BASE = process.env.SITE_BASE || 'https://tools.treasuregrove.art';
const HOST = new URL(SITE_BASE).host;
const LOG_PATH = process.env.NGINX_LOG || '/www/wwwlogs/tools.treasuregrove.art.log';
const NOTIFY_EMAIL = process.env.SEO_REPORT_EMAIL || '1324236706@qq.com';
const NO_MAIL = process.argv.includes('--no-mail');
const DAYS = Number((process.argv.find((a) => a.startsWith('--days=')) || '--days=7').split('=')[1]) || 7;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BOT_RE = /bot|spider|crawler|slurp|python-requests|python-urllib|curl|wget|monitor|scan|scanner|headless|lighthouse|ahrefs|semrush|mj12|dotbot|petalbot|yandex|bytespider|facebookexternalhit|go-http-client|axios|okhttp|zgrab|masscan|nmap/i;
/** 搜索引擎爬虫 UA 归类（用于判断「每天有没有真被搜索引擎抓」） */
const CRAWLERS = [
  ['Baiduspider', /baiduspider/i],
  ['Bingbot', /bingbot|bingpreview/i],
  ['Googlebot', /googlebot/i],
  ['Sogou', /sogou (web )?spider/i],
  ['360Spider', /360spider|haosou/i],
  ['YandexBot', /yandexbot/i],
  ['Bytespider', /bytespider/i],
  ['PetalBot', /petalbot/i],
  ['Applebot', /applebot/i]
];

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function logDayKey(stamp) {
  // stamp 形如 30/Sep/2026:15:59:35 +0800
  const m = /^(\d{2})\/(\w{3})\/(\d{4})/.exec(stamp);
  if (!m) return null;
  const mi = MONTHS.indexOf(m[2]);
  if (mi === -1) return null;
  return `${m[3]}-${pad(mi + 1)}-${m[1]}`;
}

const isPage = (p) => p === '/' || p.endsWith('/') || /\.html?$/i.test(p);

function analyzeLog() {
  const stats = new Map(); // day -> {pv, uv:Set, requests, refs:Map, pages:Map}
  const crawlers = new Map(); // day -> Map(engine -> count)
  const ensure = (day) => {
    if (!stats.has(day)) stats.set(day, { pv: 0, uv: new Set(), requests: 0, refs: new Map(), pages: new Map() });
    return stats.get(day);
  };

  let raw = '';
  try {
    raw = fs.readFileSync(LOG_PATH, 'utf8');
  } catch (err) {
    return { error: `无法读取 ${LOG_PATH}: ${err.message}`, stats, crawlers };
  }

  const RE = /^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d{3}) (\S+) "([^"]*)" "([^"]*)"/;
  for (const line of raw.split('\n')) {
    if (!line) continue;
    const m = RE.exec(line);
    if (!m) continue;
    const [, ip, stamp, request, status, , referer, ua] = m;
    const day = logDayKey(stamp);
    if (!day) continue;

    // 爬虫抓取统计（不计入人类浏览量）
    const crawler = CRAWLERS.find(([, re]) => re.test(ua));
    if (crawler) {
      if (!crawlers.has(day)) crawlers.set(day, new Map());
      const c = crawlers.get(day);
      c.set(crawler[0], (c.get(crawler[0]) || 0) + 1);
    }
    if (BOT_RE.test(ua) || !ua || ua === '-') continue;
    if (status.startsWith('4') || status.startsWith('5')) continue;
    const s = ensure(day);
    s.requests += 1;
    const target = request.split(' ')[1] || '';
    const clean = target.split('?')[0];
    if (!isPage(clean)) continue;
    s.pv += 1;
    s.uv.add(ip);
    if (referer && referer !== '-') {
      try {
        const h = new URL(referer).host.toLowerCase();
        if (h !== HOST) {
          const engine = /(^|\.)baidu\.com$/.test(h) ? '百度'
            : h.endsWith('bing.com') ? 'Bing'
            : h === 'www.google.com' || h.endsWith('.google.com') ? 'Google'
            : /sogou\.com$/.test(h) ? '搜狗'
            : /so\.com$/.test(h) ? '360搜索'
            : /sm\.cn$/.test(h) ? '神马'
            : /duckduckgo\.com$/.test(h) ? 'DuckDuckGo'
            : /yandex\./.test(h) ? 'Yandex'
            : null;
          if (engine) s.refs.set(engine, (s.refs.get(engine) || 0) + 1);
        }
      } catch {}
    }
    s.pages.set(clean, (s.pages.get(clean) || 0) + 1);
  }
  return { error: null, stats, crawlers };
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
    signal: AbortSignal.timeout(20000),
    redirect: 'follow'
  });
  return { status: res.status, text: await res.text() };
}

async function checkEngines() {
  const q = encodeURIComponent(`site:${HOST}`);
  const out = [];
  const jobs = [
    {
      name: 'Bing',
      run: async () => {
        const { status, text } = await fetchText(`https://cn.bing.com/search?q=${q}&setlang=zh-CN&count=20`);
        const algo = (text.match(/class="b_algo"/g) || []).length;
        // 本站域名在结果页里出现的去重链接数（首页命中，非全站总量）
        const links = new Set([...text.matchAll(new RegExp(`href="https?://${HOST.replace(/\./g, '\\.')}/[^"]*`, 'g'))].map((m) => m[0]));
        const count = links.size || algo || null;
        return { status, count, note: count ? '首页命中数(非总量)' : '未返回结果块' };
      }
    },
    {
      name: '百度',
      run: async () => {
        const { status, text } = await fetchText(`https://www.baidu.com/s?wd=${q}`);
        const m = text.match(/找到相关结果[数]?约?\s*([\d,，]+)\s*个/) || text.match(/百度为您找到相关结果约?\s*([\d,，]+)\s*个/);
        const blocked = /安全验证|请开启JavaScript|网络不给力/.test(text);
        return { status, count: m ? m[1].replace(/[，,]/g, '') : null, note: blocked ? '被反爬拦截' : '' };
      }
    },
    {
      name: 'DuckDuckGo',
      run: async () => {
        const { status, text } = await fetchText(`https://html.duckduckgo.com/html/?q=${q}`);
        const hits = (text.match(/class="result__a"/g) || []).length;
        return { status, count: hits || null, note: hits ? '首页命中数(非总量)' : '' };
      }
    }
  ];
  for (const job of jobs) {
    try {
      const r = await job.run();
      out.push({ name: job.name, ...r });
    } catch (err) {
      out.push({ name: job.name, status: 0, count: null, note: `请求失败: ${err.message}` });
    }
  }
  return out;
}

function tail(file, n = 1) {
  try {
    const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').trim().split('\n');
    return lines.slice(-n).join('\n');
  } catch {
    return '(日志不存在)';
  }
}

function sitemapCount() {
  let n = 0;
  for (const f of ['sitemap.xml', 'sitemap-seo.xml']) {
    try {
      n += [...fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/<loc>/g)].length;
    } catch {}
  }
  return n;
}

function buildReport({ logResult, engines }) {
  const now = new Date();
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 86400000));
  const days = [...Array(DAYS)].map((_, i) => dayKey(new Date(now.getTime() - (i + 1) * 86400000)));
  const L = [];
  const s = (day) => logResult.stats.get(day) || { pv: 0, uv: new Set(), refs: new Map(), pages: new Map(), requests: 0 };

  L.push(`# TA工具箱 每日日报 ${today}`);
  L.push('');
  L.push(`站点：${SITE_BASE}　·　数据源：${LOG_PATH}（已剔除爬虫/扫描器、4xx/5xx）`);
  L.push('');
  L.push('## 一、搜索引擎收录（site: 查询，反爬时仅供参考）');
  L.push('');
  L.push('| 引擎 | 收录数 | HTTP | 说明 |');
  L.push('| --- | --- | --- | --- |');
  for (const e of engines) {
    L.push(`| ${e.name} | ${e.count ?? '未取得'} | ${e.status || '-'} | ${e.note || ''} |`);
  }
  L.push('');
  L.push(`本地 sitemap 共 ${sitemapCount()} 条 URL。`);
  L.push('');
  L.push('## 二、浏览量');
  L.push('');
  const y = s(yesterday);
  L.push(`**昨日 ${yesterday}：PV ${y.pv}　UV ${y.uv.size}　全部请求 ${y.requests}**`);
  L.push('');
  L.push('| 日期 | PV | UV |');
  L.push('| --- | --- | --- |');
  for (const d of days) {
    const v = s(d);
    L.push(`| ${d} | ${v.pv} | ${v.uv.size} |`);
  }
  L.push('');
  const refs = new Map();
  for (const d of days) for (const [k, v] of s(d).refs) refs.set(k, (refs.get(k) || 0) + v);
  L.push(`### 搜索来源（近 ${DAYS} 天，按搜索引擎归并）`);
  L.push('');
  if (refs.size) {
    L.push('| 搜索引擎 | 到访次数 |');
    L.push('| --- | --- |');
    for (const [k, v] of [...refs].sort((a, b) => b[1] - a[1])) L.push(`| ${k} | ${v} |`);
  } else {
    L.push('（近 7 天没有来自搜索引擎的明确 referer）');
  }
  L.push('');
  const pages = new Map();
  for (const d of days) for (const [k, v] of s(d).pages) pages.set(k, (pages.get(k) || 0) + v);
  L.push(`### 热门页面（近 ${DAYS} 天 Top 10）`);
  L.push('');
  L.push('| 页面 | 浏览量 |');
  L.push('| --- | --- |');
  for (const [k, v] of [...pages].sort((a, b) => b[1] - a[1]).slice(0, 10)) L.push(`| ${k} | ${v} |`);
  L.push('');
  L.push('## 三、搜索引擎抓取（nginx 日志里的爬虫请求，判断「有没有真被抓」）');
  L.push('');
  const crawlerTotals = new Map();
  for (const d of [yesterday, ...days]) {
    const c = logResult.crawlers.get(d);
    if (!c) continue;
    for (const [k, v] of c) crawlerTotals.set(k, (crawlerTotals.get(k) || 0) + v);
  }
  L.push(`| 引擎 | 昨日 ${yesterday} | 近 ${days.length + 1} 天 |`);
  L.push('| --- | --- | --- |');
  if (crawlerTotals.size) {
    for (const engine of CRAWLERS.map((c) => c[0])) {
      const yv = logResult.crawlers.get(yesterday)?.get(engine) || 0;
      const tv = crawlerTotals.get(engine) || 0;
      if (!yv && !tv) continue;
      L.push(`| ${engine} | ${yv} | ${tv} |`);
    }
  } else {
    L.push('| （无） | 0 | 0 |');
  }
  L.push('');
  L.push('## 四、推送状态');
  L.push('');
  L.push('```');
  L.push(`[百度] ${tail('logs/baidu_push.last.log')}`);
  L.push(`[IndexNow] ${tail('logs/push_indexnow.log')}`);
  L.push('```');
  L.push('');
  if (logResult.error) L.push(`> ⚠️ ${logResult.error}`);
  return L.join('\n');
}

async function main() {
  const logResult = analyzeLog();
  const engines = await checkEngines();
  const report = buildReport({ logResult, engines });

  const outDir = path.join(ROOT, 'logs');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'daily_seo_report.last.md');
  fs.writeFileSync(outFile, report + '\n', 'utf8');
  console.log(report);
  console.log(`\n[report] 已写入 ${path.relative(ROOT, outFile)}`);

  if (!NO_MAIL) {
    const y = dayKey(new Date(Date.now() - 86400000));
    const yStat = logResult.stats.get(y) || { pv: 0, uv: new Set() };
    const bing = engines.find((e) => e.name === 'Bing');
    const baidu = engines.find((e) => e.name === '百度');
    const subject = `[TA工具箱日报] ${y} PV ${yStat.pv}/UV ${yStat.uv.size}｜Bing收录 ${bing?.count ?? '?'}｜百度 ${baidu?.count ?? '?'}`;
    const r = spawnSync('mail', ['-s', subject, NOTIFY_EMAIL], { input: report, encoding: 'utf8' });
    if (r.error || r.status !== 0) {
      console.error(`[report] 邮件发送失败: ${r.error ? r.error.message : `exit ${r.status}`}`);
    } else {
      console.log(`[report] 已发送邮件给 ${NOTIFY_EMAIL}`);
    }
  }
}

main().catch((err) => {
  console.error('[report] 失败:', err);
  process.exit(1);
});
