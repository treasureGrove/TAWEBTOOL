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
 *   NGINX_LOG          access log 路径（自动发现同名轮转文件）（默认 /www/wwwlogs/tools.treasuregrove.art.log）
 *   NGINX_LOG_FILES   明确列出的日志路径 JSON 数组（覆盖 NGINX_LOG，支持 .gz）
 *   SEO_REPORT_TZ     统计时区（默认 Asia/Shanghai）
 *   SEO_REPORT_EMAIL   收件人（默认与百度推送一致）
 *   SITE_BASE          站点根 URL
 * 输出：logs/daily_seo_report.last.md（同时作为邮件正文）
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { analyzeLog, discoverLogPaths, CRAWLERS, dayKey as zonedDayKey, reportDays, emptyDay, dataState } from './seo_log_analysis.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_BASE = process.env.SITE_BASE || 'https://tools.treasuregrove.art';
const HOST = new URL(SITE_BASE).host;
const LOG_PATH = process.env.NGINX_LOG || '/www/wwwlogs/tools.treasuregrove.art.log';
const NOTIFY_EMAIL = process.env.SEO_REPORT_EMAIL || '1324236706@qq.com';
const NO_MAIL = process.argv.includes('--no-mail');
const DAYS = Number((process.argv.find((a) => a.startsWith('--days=')) || '--days=7').split('=')[1]);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const TIME_ZONE = process.env.SEO_REPORT_TZ || 'Asia/Shanghai';
const dayKey = d => zonedDayKey(d, TIME_ZONE);
const LOG_PATHS = process.env.NGINX_LOG_FILES ? JSON.parse(process.env.NGINX_LOG_FILES) : discoverLogPaths(LOG_PATH);
if (!Array.isArray(LOG_PATHS) || !LOG_PATHS.length || LOG_PATHS.some(p => typeof p !== 'string') || new Set(LOG_PATHS).size !== LOG_PATHS.length) throw new Error('NGINX_LOG_FILES 必须为不重复的日志路径 JSON 数组');
reportDays(new Date(), DAYS, TIME_ZONE);

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
        return { status, count: !blocked && m ? m[1].replace(/[，,]/g, '') : null, note: blocked ? '被反爬拦截' : '粗略结果估计，非实际收录总量' };
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

export function buildReport({ logResult, engines, now = new Date() }) {
  const today = dayKey(now);
  const days = reportDays(now, DAYS, TIME_ZONE);
  const yesterday = days[0];
  const L = [];
  const s = (day) => logResult.stats.get(day) || emptyDay();

  L.push(`# TA工具箱 每日日报 ${today}`);
  L.push('');
  L.push(`站点：${SITE_BASE}　·　统计时区：${TIME_ZONE}；日志范围见诊断表。PV 仅计 GET 页面请求，UV 为其 IP 去重；机器人和 4xx/5xx 不计入 PV/UV。`);
  L.push('');
  L.push('## 一、site: 查询观测（非官方收录总量）');
  L.push('');
  L.push('| 引擎 | 查询观测值 | HTTP | 说明 |');
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
  const usable = d => logResult.stats.has(d);
  L.push(`**昨日 ${yesterday}：PV ${usable(yesterday) ? y.pv : '—'}　UV ${usable(yesterday) ? y.uv.size : '—'}　已解析原始请求 ${y.requests}**`);
  L.push(`数据状态：${dataState(logResult, yesterday)}。缺失日期不能证明真实零流量；解析失败无法可靠归属日期。`);
  const diag = logResult.diagnostics;
  L.push(`原始非空日志行 ${diag.rawLines}；成功解析 ${diag.parsed}；解析失败 ${diag.failed}（格式 ${diag.failures.format}，日期 ${diag.failures.timestamp}）。`);
  L.push(`已解析时间范围（UTC）：${diag.first || '无'} 至 ${diag.last || '无'}。格式：${JSON.stringify(diag.formats)}。`);
  L.push('| 日志文件 | 字节数 | 修改时间 UTC | 原始行 | 成功 | 失败 | 读取状态 |');
  L.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const f of diag.files) L.push(`| ${f.path.replaceAll('|', '\uFF5C')} | ${f.bytes ?? '—'} | ${f.modified || '—'} | ${f.rawLines} | ${f.parsed} | ${f.failed} | ${f.error ? '读取失败（详情见警告）' : '成功'} |`);
  L.push('过滤原因按顺序互斥归类；common 格式缺少 UA，不能判别人类/爬虫。acceptedRequests 为过滤机器人、缺失 UA、错误状态和无效请求后保留的请求，仍包含非页面/非 GET。');
  L.push('| 日期 | 原始已解析请求 | 保留请求 | 搜索爬虫 UA | 其他机器人 | 缺失 UA | 4xx/5xx | 无效请求 | 非 GET | 非页面 | 状态 |');
  L.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const d of days) { const v=s(d); const f=v.filtered; L.push(`| ${d} | ${v.requests} | ${v.acceptedRequests} | ${f.crawler} | ${f.bot} | ${f.missingUa} | ${f.httpError} | ${f.invalidRequest} | ${f.nonGet} | ${f.nonPage} | ${dataState(logResult,d)} |`); }
  L.push('覆盖限制：默认读取活动日志及同名日期/数字轮转文件（含 .gz），显式 NGINX_LOG_FILES 覆盖自动发现；未记录的请求、CDN 缓存命中和 access_log off 无法从这些日志恢复。');
  L.push('');
  L.push('| 日期 | PV | UV |');
  L.push('| --- | --- | --- |');
  for (const d of days) {
    const v = s(d);
    L.push(`| ${d} | ${usable(d) ? v.pv : '—'} | ${usable(d) ? v.uv.size : '—'} |`);
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
    L.push(`（近 ${DAYS} 天的可解析记录中未识别到明确搜索 referer；不代表没有搜索点击）`);
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
  L.push('## 三、搜索引擎爬虫 UA 请求（未经来源验证）');
  L.push('仅按 UA 识别；图片、JS、CSS 在当前 Nginx 配置中不记录。UA 可伪造，请求数不等于页面数或收录数。');
  L.push('');
  const crawlerTotals = new Map();
  for (const d of days) {
    const c = logResult.crawlers.get(d);
    if (!c) continue;
    for (const [k, v] of c) crawlerTotals.set(k, (crawlerTotals.get(k) || 0) + v);
  }
  L.push(`| 引擎 | 昨日 ${yesterday} | 近 ${days.length} 天 |`);
  L.push('| --- | --- | --- |');
  if (crawlerTotals.size) {
    for (const engine of CRAWLERS.map((c) => c[0])) {
      const yv = logResult.crawlers.get(yesterday)?.get(engine) || 0;
      const tv = crawlerTotals.get(engine) || 0;
      if (!yv && !tv) continue;
      L.push(`| ${engine} | ${yv} | ${tv} |`);
    }
  } else {
    L.push('| 可解析日志中未识别到爬虫 UA（数据缺失时不能推断未抓取） | — | — |');
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
  const logResult = analyzeLog({ paths: LOG_PATHS, timeZone: TIME_ZONE });
  const engines = await checkEngines();
  const report = buildReport({ logResult, engines });

  const outDir = path.join(ROOT, 'logs');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'daily_seo_report.last.md');
  fs.writeFileSync(outFile, report + '\n', 'utf8');
  console.log(report);
  console.log(`\n[report] 已写入 ${path.relative(ROOT, outFile)}`);

  if (!NO_MAIL) {
    const y = reportDays(new Date(), DAYS, TIME_ZONE)[0];
    const yStat = logResult.stats.get(y) || { pv: 0, uv: new Set() };
    const bing = engines.find((e) => e.name === 'Bing');
    const baidu = engines.find((e) => e.name === '百度');
    const subject = `[TA工具箱日报] ${y} ${dataState(logResult,y)} PV ${logResult.stats.has(y) ? yStat.pv : '—'}/UV ${logResult.stats.has(y) ? yStat.uv.size : '—'}｜Bing查询 ${bing?.count ?? '?'}｜百度 ${baidu?.count ?? '?'}`;
    const r = spawnSync('mail', ['-s', subject, NOTIFY_EMAIL], { input: report, encoding: 'utf8' });
    if (r.error || r.status !== 0) {
      console.error(`[report] 邮件发送失败: ${r.error ? r.error.message : `exit ${r.status}`}`);
    } else {
      console.log(`[report] 已发送邮件给 ${NOTIFY_EMAIL}`);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((err) => {
  console.error('[report] 失败:', err);
  process.exit(1);
});
