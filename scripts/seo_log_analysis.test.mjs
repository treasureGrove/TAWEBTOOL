import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { analyzeLog, parseLine, reportDays, dataState } from './seo_log_analysis.mjs';
import { buildReport } from './daily_seo_report.mjs';
const line = (ua='Mozilla/5.0', status=200, target='/', method='GET', stamp='16/Oct/2026:23:30:00 +0800', ref='-') => `2001:db8::1 - - [${stamp}] "${method} ${target} HTTP/2.0" ${status} 123 "${ref}" "${ua}"`;
function fixture(t, contents, gzip=false) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seo-log-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,gzip?'access.log.gz':'access.log');
  fs.writeFileSync(file,gzip?gzipSync(contents):contents);
  return file;
}
test('combined, extra whitespace, trailing fields, IPv6, escaped UA and common',()=>{
  for (const value of [line(), line()+' 0.001', line().replace(' - - ', '  -   - '),line('Mozilla \\"quoted\\"')]) assert.equal(parseLine(value).day,'2026-10-16');
  const common='127.0.0.1 - - [16/Oct/2026:12:00:00 +0800] "GET / HTTP/1.1" 200 -';
  assert.equal(parseLine(common).format,'common');
  assert.equal(parseLine(common+' "broken').error,'format');
  assert.equal(parseLine('{"request":"GET /"}').error,'format');
});
test('strict timestamps and explicit time zones',()=>{
  assert.equal(parseLine(line('Mozilla',200,'/','GET','16/Oct/2026:23:30:00 -0700')).day,'2026-10-17');
  assert.equal(parseLine(line('Mozilla',200,'/','GET','31/Feb/2026:12:00:00 +0800')).error,'timestamp');
  assert.equal(parseLine(line('Mozilla',200,'/','GET','16/Oct/2026:99:00:00 +0800')).error,'timestamp');
  assert.deepEqual(reportDays(new Date('2026-10-17T00:10:00+08:00'),2),['2026-10-16','2026-10-15']);
  assert.deepEqual(reportDays(new Date('2026-03-09T04:10:00Z'),2,'America/New_York'),['2026-03-08','2026-03-07']);
  assert.throws(()=>reportDays(new Date(),-1));
});
test('raw requests counted before mutually exclusive filters; real visits and crawler errors',t=>{
  const lines=[line(),line('Mozilla',200,'/index.html?q=x','GET',undefined,'https://www.bing.com/search?q=x'),line('bingpreview',404),line('curl/8'),line('-'),line('Mozilla',500),line('Mozilla',200,'/','HEAD'),line('Mozilla',200,'/app.js'),line('Mozilla',200,'/','POST')];
  const r=analyzeLog({paths:[fixture(t,lines.join('\r\n')+'\r\n')]});
  const s=r.stats.get('2026-10-16');
  assert.equal(r.diagnostics.rawLines,9); assert.equal(r.diagnostics.parsed,9); assert.equal(s.requests,9);
  assert.equal(s.pv,2); assert.equal(s.uv.size,1); assert.equal(s.refs.get('Bing'),1);
  assert.deepEqual(s.filtered,{crawler:1,bot:1,missingUa:1,httpError:1,invalidRequest:0,nonGet:2,nonPage:1});
  assert.equal(r.crawlers.get('2026-10-16').get('Bingbot'),1);
  assert.equal(s.requests,s.pv+Object.values(s.filtered).reduce((a,b)=>a+b,0));
});
test('read failure, empty, old logs, malformed lines and common are distinguishable',t=>{
  const empty=analyzeLog({paths:[fixture(t,'\n')]}); assert.match(dataState(empty,'2026-10-16'),/无有效数据/);
  const missing=analyzeLog({paths:['nonexistent-seo-test.log']}); assert.match(dataState(missing,'2026-10-16'),/读取失败/);
  const mixed=analyzeLog({paths:[fixture(t,line()+'\nbad\n'+line('Mozilla',200,'/','GET','31/Feb/2026:00:00:00 +0800'))]});
  assert.equal(mixed.diagnostics.failed,2); assert.equal(mixed.diagnostics.rawLines,mixed.diagnostics.parsed+mixed.diagnostics.failed);
  assert.match(dataState(mixed,'2026-10-16'),/解析失败/);
  assert.match(dataState(analyzeLog({paths:[fixture(t,line())]}),'2026-10-15'),/无有效数据/);
  const common=analyzeLog({paths:[fixture(t,'127.0.0.1 - - [16/Oct/2026:12:00:00 +0800] "GET / HTTP/1.1" 200 -')]});
  assert.equal(common.stats.get('2026-10-16').filtered.missingUa,1);
});
test('explicit rotated and gzip logs; report crawler range does not duplicate yesterday',t=>{
  const r=analyzeLog({paths:[fixture(t,line('Bingbot')),fixture(t,line('Bingbot',200,'/','GET','15/Oct/2026:01:00:00 +0800'),true)]});
  const report=buildReport({logResult:r,engines:[],now:new Date('2026-10-17T04:00:00+08:00')});
  assert.match(report,/\| Bingbot \| 1 \| 2 \|/); assert.match(report,/近 7 天/);
  assert.match(report,/2026-10-14 \| — \| —/); assert.match(report,/原始非空日志行 2；成功解析 2；解析失败 0/);
});
test('invalid request and deceptive search domains are diagnosed',t=>{
  const bad=line().replace('GET / HTTP/2.0','-');
  const r=analyzeLog({paths:[fixture(t,bad+'\n'+line('Mozilla',200,'/','GET',undefined,'https://notbing.com/'))]});
  assert.equal(r.stats.get('2026-10-16').filtered.invalidRequest,1);
  assert.equal(r.stats.get('2026-10-16').refs.size,0);
  assert.equal(parseLine(line('Mozilla',999)).error,'format');
});
test('bot-only traffic is visible as requests without human PV',t=>{
  const r=analyzeLog({paths:[fixture(t,line('Bingbot'))]});
  assert.equal(r.stats.get('2026-10-16').requests,1);
  assert.equal(r.stats.get('2026-10-16').pv,0);
  assert.match(dataState(r,'2026-10-16'),/已解析请求/);
});
import { discoverLogPaths } from './seo_log_analysis.mjs';
test('discovers real production rotation names and excludes unrelated files',t=>{
  const file=fixture(t,line());
  const entries=['access.log-20261017-000014.gz','access.log-20261018-000330','access.log.1','access.log.2.gz'];
  for (const name of [...entries,'access.error.log','other.log','access.log.backup','accessXlog.3']) fs.writeFileSync(path.join(path.dirname(file),name),'');
  assert.deepEqual(discoverLogPaths(file).sort(),[file,...entries.map(n=>path.join(path.dirname(file),n))].sort());
});
