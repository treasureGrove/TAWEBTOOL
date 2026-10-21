const test = require('node:test');
const assert = require('node:assert/strict');
const budget = require('../../js/texture_budget.js');

test('ASTC 4x4 uses 16 bytes per block, rather than 0.89 bytes per pixel', () => {
  assert.equal(budget.estimate(1024, 1024, 'astc4', false).bytes, 1048576);
  assert.equal(budget.estimate(1024, 1024, 'astc8', false).bytes, 262144);
});
test('partial blocks and tiny mip levels each occupy a complete block', () => {
  assert.deepEqual(budget.estimate(5, 3, 'bc1', true), { bytes: 32, levels: 3 });
  assert.deepEqual(budget.estimate(1, 1, 'bc3', true), { bytes: 16, levels: 1 });
  assert.equal(budget.estimate(7, 7, 'astc6', false).bytes, 64);
});
test('NPOT and one-dimensional mip chains halve each axis with floor and a minimum of one', () => {
  assert.deepEqual(budget.estimate(3, 5, 'rgba8', true), { bytes: 72, levels: 3 });
  assert.deepEqual(budget.estimate(1, 8, 'rgba8', true), { bytes: 60, levels: 4 });
  assert.equal(budget.estimate(2048, 2048, 'bc7', true).bytes, 5592432);
});
test('RGB and RGBA ETC2 estimates differ and reject invalid dimensions or inherited format names', () => {
  assert.equal(budget.estimate(4, 4, 'etc2rgb', false).bytes, 8);
  assert.equal(budget.estimate(4, 4, 'etc2rgba', false).bytes, 16);
  for (const size of [0, -1, 1.5, NaN, Infinity, 32769]) assert.throws(() => budget.estimate(size, 8, 'bc1', true));
  assert.throws(() => budget.estimate(8, 8, 'constructor', false));
});
test('sRGB mid-gray converts to linear light, not normalized sRGB', () => {
  assert.equal(budget.srgbToLinear(0), 0);
  assert.equal(budget.srgbToLinear(255), 1);
  assert.ok(Math.abs(budget.srgbToLinear(128) - 0.2158605) < 1e-7);
  assert.ok(Math.abs(budget.srgbToLinear(10) - 10 / 255 / 12.92) < 1e-12);
});
test('alpha warnings distinguish binary alpha, smooth alpha and two-channel formats', () => {
  const info = { width: 4, height: 4, hasAlpha: true, hasPartialAlpha: true };
  assert.ok(budget.warnings(info, 'bc1').some(value => value.includes('半透明')));
  assert.ok(budget.warnings(info, 'etc2rgb').some(value => value.includes('透明度')));
  assert.deepEqual(budget.warnings(info, 'bc7'), []);
});
test('CSV quotes commas, newlines, and quotes and neutralizes formula filenames', () => {
  const entries = ['=1+2.png', '  @SUM(1).png', '\tdata.png', 'a,"b\nc.png'].map(name =>
    ({ name, width: 4, height: 4, size: 123, hasAlpha: false }));
  entries.push({ name: 'bad.png', size: 2, error: '文件无法解码' });
  const csv = budget.toCSV(entries, 'bc1', true);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=1+2.png"'));
  assert.ok(csv.includes('"\'  @SUM(1).png"'));
  assert.ok(csv.includes('"\'\tdata.png"'));
  assert.ok(csv.includes('"a,""b\nc.png"'));
  assert.ok(csv.includes('"24"'));
  assert.ok(csv.includes('文件无法解码'));
});
