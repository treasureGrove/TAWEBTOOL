// Start `python -m http.server 8776 --bind 127.0.0.1` at the repo root first.
// TEXTURE_TEST_URL can point at the deployed page for the same acceptance checks.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.TEXTURE_TEST_URL || 'http://127.0.0.1:8776/tools_html/image_metadata_inspector.html';
const output = path.resolve(__dirname, '../../tmp/texture-budget-20261021');
let browser;
before(async () => {
  await fs.mkdir(output, { recursive: true });
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});
after(async () => { if (browser) await browser.close(); });
async function open(viewport = { width: 1440, height: 1080 }) {
  const context = await browser.newContext({ viewport, acceptDownloads: true, reducedMotion: 'reduce' });
  await context.route('**/hm.baidu.com/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#miFormat').options.length === 11);
  return { page, context, errors };
}
async function demo(page) {
  await page.locator('#miDemo').click();
  await page.waitForFunction(() => /检查完成：3 张可用/.test(document.querySelector('#miStatus').textContent));
  await page.waitForFunction(() => document.querySelector('#miPreviewCanvas').width === 1024);
}
async function image(page, name, width = 4, height = 4) {
  const base64 = await page.evaluate(({ width, height }) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'); context.fillStyle = '#808080'; context.fillRect(0, 0, width, height);
    return canvas.toDataURL('image/png').split(',')[1];
  }, { width, height });
  return { name, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}
test('batch sample, exact budgets, alpha warnings, CSV bytes and original preview work together', { timeout: 60000 }, async () => {
  const { page, context, errors } = await open();
  try {
    await demo(page);
    assert.equal(await page.locator('#miBatchRows tr').count(), 3);
    await page.locator('#miFormat').selectOption('bc1');
    await page.locator('#miMipmaps').uncheck();
    assert.match(await page.locator('#miSummary').textContent(), /641\.2 KiB/);
    assert.match(await page.locator('#miBatchRows').textContent(), /无法保留半透明/);
    await page.locator('#miBudget').fill('0.10');
    assert.equal(await page.locator('#miSummary .over').count(), 1);
    await page.locator('#miBudget').fill('0');
    assert.equal(await page.locator('#miBudget').getAttribute('aria-invalid'), 'true');
    await page.locator('#miBudget').fill('64');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#miExport').click();
    const download = await downloadPromise;
    const csv = await fs.readFile(await download.path(), 'utf8');
    assert.ok(csv.startsWith('\uFEFF'));
    assert.ok(csv.includes('"524288"'));
    assert.ok(csv.includes('"131072"'));
    assert.ok(csv.includes('"1224"'));
    assert.ok(csv.includes('"仅顶层"'));
    await download.saveAs(path.join(output, 'acceptance-report.csv'));
    await page.locator('#miFormat').selectOption('astc4');
    await page.locator('#miMipmaps').check();
    await page.evaluate(() => { document.querySelector('#panel').scrollTop = 0; });
    await page.screenshot({ path: path.join(output, 'desktop-budget.png') });
    await page.getByRole('button', { name: 'normal-512.png', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#miPreviewCanvas').width === 512);
    const canvas = page.locator('#miPreviewCanvas');
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() => document.querySelector('#miColorValues').textContent.includes('Linear sRGB: 0.2159, 0.2159, 1.0000'));
    await page.screenshot({ path: path.join(output, 'desktop-preview.png') });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
test('local uploads escape filenames, isolate broken files and export formula-safe CSV', { timeout: 60000 }, async () => {
  const { page, context, errors } = await open();
  try {
    const malicious = '<img src=x onerror=window.__filenameXSS=1>.png';
    const fixtures = [await image(page, malicious), await image(page, '=1+2.png', 5, 3),
      { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not a png') }];
    const uploaded = [];
    page.on('request', request => { if (request.method() !== 'GET' && request.method() !== 'HEAD') uploaded.push(request.url()); });
    await page.locator('#miFileInput').setInputFiles(fixtures);
    await page.waitForFunction(() => /检查完成：2 张可用，1 张未计入预算/.test(document.querySelector('#miStatus').textContent));
    assert.equal(await page.evaluate(() => window.__filenameXSS), undefined);
    assert.equal(await page.locator('#miInfoGrid img, #miBatchRows img').count(), 0);
    assert.ok((await page.locator('#miInfoGrid').textContent()).includes(malicious));
    assert.match(await page.locator('#miBatchRows').textContent(), /图片无法解码/);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#miExport').click();
    const csv = await fs.readFile(await (await downloadPromise).path(), 'utf8');
    assert.ok(csv.includes('"\'=1+2.png"'));
    assert.ok(csv.includes('broken.png'));
    assert.ok(csv.includes('图片无法解码'));
    assert.deepEqual(uploaded, []);
    await page.locator('#miClear').click();
    assert.equal(await page.locator('#miExport').isDisabled(), true);
    assert.match(await page.locator('#miSummary').textContent(), /0 张/);
    assert.equal(await page.locator('#miPreviewCanvas').getAttribute('width'), '256');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
test('clear cancels an in-flight batch and prevents stale results from returning', { timeout: 60000 }, async () => {
  const { page, context } = await open();
  try {
    const fixture = await image(page, 'cancel-me.png');
    await page.evaluate(() => {
      const NativeImage = window.Image;
      window.Image = function () {
        const img = new NativeImage();
        Object.defineProperty(img, 'onload', { set(handler) {
          if (handler) img.addEventListener('load', event => setTimeout(() => handler.call(img, event), 150), { once: true });
        } });
        return img;
      };
    });
    await page.locator('#miFileInput').setInputFiles(Array.from({ length: 10 }, (_, index) => ({ ...fixture, name: 'cancel-' + index + '.png' })));
    await page.locator('#miClear').click();
    await page.waitForFunction(() => document.querySelector('#miStatus').textContent.includes('已清空'));
    await page.waitForTimeout(300);
    assert.match(await page.locator('#miSummary').textContent(), /0 张/);
    assert.equal(await page.locator('#miFileInput').isDisabled(), false);
    await demo(page);
    assert.equal(await page.locator('#miBatchRows tr').count(), 3);
  } finally { await context.close(); }
});
test('mobile and tablet layouts contain the table within the panel without horizontal page overflow', { timeout: 60000 }, async () => {
  for (const width of [390, 768]) {
    const { page, context, errors } = await open({ width, height: 1000 });
    try {
      await demo(page);
      const metrics = await page.evaluate(() => {
        const panel = document.querySelector('#panel'), table = document.querySelector('.mi-table-scroll');
        return { pageWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
          panelWidth: panel.clientWidth, panelScrollWidth: panel.scrollWidth,
          tableWidth: table.clientWidth, tableScrollWidth: table.scrollWidth };
      });
      assert.ok(metrics.scrollWidth <= metrics.pageWidth + 1, JSON.stringify(metrics));
      assert.ok(metrics.panelScrollWidth <= metrics.panelWidth + 1, JSON.stringify(metrics));
      if (width === 390) assert.ok(metrics.tableScrollWidth > metrics.tableWidth);
      await page.evaluate(() => { document.querySelector('#panel').scrollTop = 0; });
      await page.screenshot({ path: path.join(output, 'budget-' + width + '.png') });
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});
test('the 50-file cap and unsupported formats are reported without losing valid entries', { timeout: 60000 }, async () => {
  const { page, context, errors } = await open();
  try {
    const fixture = await image(page, 'valid.png');
    const files = Array.from({ length: 51 }, (_, index) => ({ ...fixture, name: 'texture-' + index + '.png' }));
    files[0] = { name: 'vector.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') };
    await page.locator('#miFileInput').setInputFiles(files);
    await page.waitForFunction(() => /检查完成：49 张可用，1 张未计入预算/.test(document.querySelector('#miStatus').textContent));
    assert.equal(await page.locator('#miBatchRows tr').count(), 50);
    assert.match(await page.locator('#miStatus').textContent(), /超出组上限的 1 张未添加/);
    assert.match(await page.locator('#miBatchRows').textContent(), /不支持此格式/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
