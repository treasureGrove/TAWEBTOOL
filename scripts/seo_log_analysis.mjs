import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const CRAWLERS = [
  ['Baiduspider', /baiduspider/i], ['Bingbot', /bingbot|bingpreview/i],
  ['Googlebot', /googlebot/i], ['Sogou', /sogou (web )?spider/i],
  ['360Spider', /360spider|haosou/i], ['YandexBot', /yandexbot/i],
  ['Bytespider', /bytespider/i], ['PetalBot', /petalbot/i], ['Applebot', /applebot/i]
];
const BOT_RE = /bot|spider|crawler|slurp|python-requests|python-urllib|curl|wget|monitor|scan|headless|lighthouse|ahrefs|semrush|mj12|petal|yandex|facebookexternalhit|go-http-client|axios|okhttp|zgrab|masscan|nmap/i;
export function dayKey(date, timeZone = 'Asia/Shanghai') {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(date);
  const get = k => parts.find(p => p.type === k).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function reportDays(now, count, timeZone = 'Asia/Shanghai') {
  if (!Number.isInteger(count) || count < 1 || count > 366) throw new Error('--days 必须为 1–366 的整数');
  const today = dayKey(now, timeZone);
  return Array.from({length:count}, (_, i) => new Date(Date.parse(`${today}T00:00:00Z`) - (i+1)*86400000).toISOString().slice(0,10));
}
function timestamp(value) {
  const m = /^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/.exec(value);
  if (!m) return null;
  const [,d,mon,y,h,min,sec,sign,oh,om] = m;
  const month = MONTHS.indexOf(mon);
  const local = new Date(Date.UTC(+y, month, +d, +h, +min, +sec));
  if (month < 0 || local.getUTCMonth() !== month || local.getUTCDate() !== +d || +h>23 || +min>59 || +sec>59 || +oh>23 || +om>59) return null;
  return new Date(local.getTime() - (sign==='+'?1:-1)*(+oh*60 + +om)*60000);
}
// Nginx combined, common (no referer/UA), and combined with trailing fields.
// Arbitrary custom/JSON formats are intentionally reported as unsupported.
export function parseLine(line, timeZone = 'Asia/Shanghai') {
  const m = /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"((?:\\.|[^"\\])*)"\s+(\d{3})\s+(\d+|-)(?:\s+"((?:\\.|[^"\\])*)"\s+"((?:\\.|[^"\\])*)")?(?:\s+.*)?$/.exec(line);
  if (!m || +m[4] < 100 || +m[4] > 599) return { error:'format' };
  const date = timestamp(m[2]);
  if (!date) return { error:'timestamp' };
  // A malformed combined suffix must not silently become a common log entry.
  const common = m[7] === undefined;
  if (common && !/\s(?:\d+|-)\s*$/.test(line)) return { error:'format' };
  return { ip:m[1], day:dayKey(date,timeZone), date, request:m[3], status:+m[4], referer:m[6] || '-', ua:m[7] || '-', format:common?'common':'combined' };
}
export function emptyDay() {
  return { pv:0, uv:new Set(), requests:0, acceptedRequests:0, refs:new Map(), pages:new Map(), filtered:{crawler:0,bot:0,missingUa:0,httpError:0,invalidRequest:0,nonGet:0,nonPage:0} };
}
// Discover only rotation names for this exact basename, never error logs/other sites.
export function discoverLogPaths(logPath) {
  const dir=path.dirname(logPath), base=path.basename(logPath);
  const escaped=base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rotated=new RegExp(`^${escaped}(?:-\\d{8}-\\d{6}|\\.\\d+)(?:\\.gz)?$`);
  try {
    return [logPath, ...fs.readdirSync(dir).filter(n=>rotated.test(n)).sort().map(n=>path.join(dir,n))];
  } catch { return [logPath]; } // Preserve missing/unreadable diagnostics in analyzeLog.
}
export function analyzeLog({ paths, timeZone = 'Asia/Shanghai' }) {
  dayKey(new Date(),timeZone); // Validate configuration even for missing files.
  const stats = new Map(), crawlers = new Map();
  const diagnostics = { rawLines:0, parsed:0, failed:0, failures:{format:0,timestamp:0}, formats:{}, files:[], first:null, last:null };
  const errors = [];
  for (const file of paths) {
    const info = {path:file, bytes:null, modified:null, rawLines:0, parsed:0, failed:0, error:null};
    diagnostics.files.push(info);
    let raw;
    try {
      const stat = fs.statSync(file); info.bytes=stat.size; info.modified=stat.mtime.toISOString();
      const buffer=fs.readFileSync(file); raw=(file.endsWith('.gz')?gunzipSync(buffer):buffer).toString('utf8');
    } catch(e) { info.error=e.message; errors.push(`无法读取 ${file}: ${e.message}`); continue; }
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      diagnostics.rawLines++; info.rawLines++;
      const r = parseLine(line,timeZone);
      if (r.error) { diagnostics.failed++; info.failed++; diagnostics.failures[r.error]++; continue; }
      diagnostics.parsed++; info.parsed++;
      diagnostics.formats[r.format]=(diagnostics.formats[r.format]||0)+1;
      const iso=r.date.toISOString();
      if (!diagnostics.first || iso<diagnostics.first) diagnostics.first=iso;
      if (!diagnostics.last || iso>diagnostics.last) diagnostics.last=iso;
      if (!stats.has(r.day)) stats.set(r.day,emptyDay());
      const s=stats.get(r.day); s.requests++;
      const crawler=CRAWLERS.find(([, re])=>re.test(r.ua));
      if (crawler) {
        if (!crawlers.has(r.day)) crawlers.set(r.day,new Map());
        const c=crawlers.get(r.day); c.set(crawler[0],(c.get(crawler[0])||0)+1);
      }
      let reason=crawler?'crawler':BOT_RE.test(r.ua)?'bot':r.ua==='-'?'missingUa':r.status>=400?'httpError':null;
      const req=/^(\S+)\s+(\S+)\s+HTTP\/\d(?:\.\d)?$/.exec(r.request);
      if (!reason && !req) reason='invalidRequest';
      if (reason) { s.filtered[reason]++; continue; }
      s.acceptedRequests++;
      let clean;
      try { clean=new URL(req[2],'https://log.invalid').pathname; } catch { s.filtered.invalidRequest++; s.acceptedRequests--; continue; }
      if (req[1]!=='GET') { s.filtered.nonGet++; continue; }
      if (!(clean==='/' || clean.endsWith('/') || /\.html?$/i.test(clean))) { s.filtered.nonPage++; continue; }
      s.pv++; s.uv.add(r.ip); s.pages.set(clean,(s.pages.get(clean)||0)+1);
      try {
        const h=new URL(r.referer).hostname.toLowerCase();
        const engine=[['百度',/(^|\.)baidu\.com$/],['Bing',/(^|\.)bing\.com$/],['Google',/(^|\.)google\.com$/],['搜狗',/(^|\.)sogou\.com$/],['360搜索',/(^|\.)so\.com$/],['神马',/(^|\.)sm\.cn$/],['DuckDuckGo',/(^|\.)duckduckgo\.com$/],['Yandex',/(^|\.)yandex\.(com|ru)$/]].find(([,re])=>re.test(h));
        if (engine) s.refs.set(engine[0],(s.refs.get(engine[0])||0)+1);
      } catch {}
    }
  }
  return { error:errors.length?errors.join('; '):null, stats,crawlers,diagnostics };
}
export function dataState(result, day) {
  if (result.error) return '数据不完整：日志读取失败';
  if (result.diagnostics.failed) return '数据不完整：存在解析失败';
  if (!result.stats.has(day)) return '无有效数据：该日没有可解析记录';
  return result.stats.get(day).pv ? '有页面访问记录' : '已解析请求，但没有符合 PV 口径的访问';
}
