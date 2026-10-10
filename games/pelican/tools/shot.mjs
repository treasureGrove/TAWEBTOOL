// Dev tool: renders the built page in headless Chrome and saves screenshots.
//   node tools/shot.mjs [--size 1280x720] [--t 3] [--out shots] name[,key=value...] ...
// Each positional arg is a shot: a name plus optional camera overrides, e.g.
//   node tools/shot.mjs hero side,az=90,pol=86 face,r=0.9,ty=1.75,tx=0.55,az=70
// Camera keys: r, az, pol (degrees), tx, ty, tz, fov.  Also: t (sim time), time (atmosphere preset).
// Flags: --size WxH, --dpr n, --t sec, --out dir, --ui (leave the DOM controls visible), --eval "<js using P>".
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME =
  process.env.CHROME_PATH ||
  [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].find((p) => fs.existsSync(p));

const argv = process.argv.slice(2);
let size = [1280, 720];
let outDir = path.join(root, 'shots');
let simT = 3;
let dpr = 1;
let withUI = false;
const specs = [];
const evals = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--size') size = argv[++i].split('x').map(Number);
  else if (a === '--out') outDir = path.resolve(argv[++i]);
  else if (a === '--t') simT = parseFloat(argv[++i]);
  else if (a === '--dpr') dpr = parseFloat(argv[++i]);
  else if (a === '--ui') withUI = true; // keep the DOM controls in the picture
  else if (a === '--eval') evals.push(argv[++i]);
  else specs.push(a);
}
if (evals.length && !specs.length) specs.push('_none');
if (!specs.length) specs.push('hero');
fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--ignore-gpu-blocklist', '--enable-webgl', '--hide-scrollbars', '--allow-file-access-from-files'],
  defaultViewport: { width: size[0], height: size[1], deviceScaleFactor: dpr },
});
const page = await browser.newPage();
let failed = false;
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning' || t === 'log') console.log(`[page ${t}]`, m.text());
});
page.on('pageerror', (e) => {
  failed = true;
  console.log('[page exception]', e.message, '\n', (e.stack || '').split('\n').slice(0, 6).join('\n'));
});

const url = pathToFileURL(path.join(root, 'index.html')).href + '?shot=1' + (withUI ? '&ui=1' : '');
await page.goto(url, { waitUntil: 'load' });
try {
  await page.waitForFunction('window.__pelican && window.__pelican.ready', { timeout: 60000 });
} catch (e) {
  console.log('page never became ready');
  await page.screenshot({ path: path.join(outDir, '_failed.png') });
  await browser.close();
  process.exit(1);
}
const info = await page.evaluate(() => window.__pelican.info());
console.log('[renderer]', info);

for (const code of evals) {
  const out = await page.evaluate(`(async () => { const P = window.__pelican; return JSON.stringify(await (${code}), null, 1); })()`);
  console.log('[eval]', code, '=>', out);
}
for (const spec of specs) {
  if (spec === '_none') continue;
  const [name, ...kv] = spec.split(',');
  const opts = { t: simT };
  for (const p of kv) {
    const [k, v] = p.split('=');
    opts[k] = isNaN(Number(v)) ? v : Number(v);
  }
  await page.evaluate((o) => window.__pelican.shoot(o), opts);
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file });
  console.log('saved', file);
}
await browser.close();
process.exit(failed ? 2 : 0);
