import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await fs.readFile(path.join(__dirname, 'config.json'), 'utf8'));
const targetArg = process.argv.find((arg) => arg.startsWith('--url='));
const nameArg = process.argv.find((arg) => arg.startsWith('--name='));
const target = targetArg
  ? { name: nameArg ? nameArg.slice(7) : 'manual-target', url: targetArg.slice(6), kind: 'web-game' }
  : config.targets[0];

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const reportDir = path.join(__dirname, 'reports', stamp);
await fs.mkdir(reportDir, { recursive: true });

const events = {
  consoleErrors: [],
  consoleWarnings: [],
  pageErrors: [],
  requestFailures: [],
  badResponses: []
};

function clip(value, max = 1000) {
  return String(value || '').slice(0, max);
}

function judge(report) {
  let score = 100;
  const reasons = [];

  if (!report.loaded) {
    score -= 50;
    reasons.push('页面没有正常加载完成');
  }
  if (!report.canvas.count) {
    score -= 25;
    reasons.push('没有检测到 canvas；如果这是游戏页面，需要确认主游戏画面是否加载');
  }
  if (report.canvas.count && !report.canvas.nonBlank) {
    score -= 35;
    reasons.push('canvas 近似白屏或绘制内容过少');
  }
  if (report.consoleErrors.length) {
    score -= Math.min(35, report.consoleErrors.length * 12);
    reasons.push(`存在 ${report.consoleErrors.length} 条 console error`);
  }
  if (report.pageErrors.length) {
    score -= Math.min(35, report.pageErrors.length * 15);
    reasons.push(`存在 ${report.pageErrors.length} 条 page error`);
  }
  if (report.requestFailures.length) {
    score -= Math.min(25, report.requestFailures.length * 8);
    reasons.push(`存在 ${report.requestFailures.length} 个失败请求`);
  }
  if (report.interaction.pixelDelta < config.budgets.minCanvasPixelsChanged) {
    score -= 15;
    reasons.push('交互前后截图变化偏小，玩法反馈可能不足');
  }

  return { score: Math.max(0, Math.round(score)), reasons };
}

async function probeCanvas(page) {
  return page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    const result = { count: canvases.length, nonBlank: false, samples: [], largest: null };

    for (const canvas of canvases) {
      const width = canvas.width || canvas.clientWidth || 0;
      const height = canvas.height || canvas.clientHeight || 0;
      const sample = { width, height, changedPixels: 0, error: '' };

      try {
        const ctx = canvas.getContext('2d');
        if (ctx && width > 0 && height > 0) {
          const data = ctx.getImageData(0, 0, width, height).data;
          const stepX = Math.max(1, Math.floor(width / 20));
          const stepY = Math.max(1, Math.floor(height / 20));
          let changed = 0;

          for (let y = 0; y < height; y += stepY) {
            for (let x = 0; x < width; x += stepX) {
              const index = (y * width + x) * 4;
              const r = data[index];
              const g = data[index + 1];
              const b = data[index + 2];
              const a = data[index + 3];
              if (a > 0 && (r < 245 || g < 245 || b < 245)) changed += 1;
            }
          }

          sample.changedPixels = changed;
          if (changed > 10) result.nonBlank = true;
        }
      } catch (error) {
        sample.error = String(error?.message || error);
      }

      result.samples.push(sample);
      if (!result.largest || width * height > result.largest.width * result.largest.height) {
        result.largest = sample;
      }
    }

    return result;
  });
}

async function interact(page, viewport) {
  const before = await page.screenshot({ fullPage: false });
  const centerX = Math.floor(viewport.width / 2);
  const centerY = Math.floor(viewport.height / 2);

  await page.mouse.move(centerX - 90, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 90, centerY, { steps: 12 });
  await page.mouse.up();
  await page.mouse.click(centerX, centerY);
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1000);

  const after = await page.screenshot({ fullPage: false });
  let pixelDelta = 0;
  const length = Math.min(before.length, after.length);
  for (let i = 0; i < length; i += 97) {
    if (before[i] !== after[i]) pixelDelta += 1;
  }
  return { pixelDelta };
}

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage({ viewport: config.viewport });

page.on('console', (message) => {
  const text = clip(message.text());
  if (message.type() === 'error') events.consoleErrors.push(text);
  if (message.type() === 'warning') events.consoleWarnings.push(text);
});
page.on('pageerror', (error) => events.pageErrors.push(clip(error.stack || error.message)));
page.on('requestfailed', (request) => {
  events.requestFailures.push({
    url: clip(request.url(), 500),
    failure: request.failure()?.errorText || 'unknown'
  });
});
page.on('response', (response) => {
  if (response.status() >= 400) {
    events.badResponses.push({ url: clip(response.url(), 500), status: response.status() });
  }
});

let loaded = false;
let loadError = '';
try {
  await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  loaded = true;
} catch (error) {
  loadError = clip(error.stack || error.message);
}

await page.screenshot({ path: path.join(reportDir, 'initial.png'), fullPage: false }).catch(() => {});
const canvas = loaded ? await probeCanvas(page) : { count: 0, nonBlank: false, samples: [] };
const interaction = loaded ? await interact(page, config.viewport) : { pixelDelta: 0 };
await page.screenshot({ path: path.join(reportDir, 'after-interaction.png'), fullPage: false }).catch(() => {});
await browser.close();

const report = {
  target,
  createdAt: new Date().toISOString(),
  loaded,
  loadError,
  canvas,
  interaction,
  consoleErrors: events.consoleErrors,
  consoleWarnings: events.consoleWarnings.slice(0, 20),
  pageErrors: events.pageErrors,
  requestFailures: events.requestFailures,
  badResponses: events.badResponses.slice(0, 50)
};
report.judgement = judge(report);

await fs.writeFile(path.join(reportDir, 'report.json'), JSON.stringify(report, null, 2));

const instruction = `# GameForge Codex Instruction

Target: ${target.name}
URL: ${target.url}
Score: ${report.judgement.score}/100
Time: ${report.createdAt}

## Findings
${report.judgement.reasons.length ? report.judgement.reasons.map((reason) => `- ${reason}`).join('\n') : '- 基础检查通过，继续提升玩法深度和传播反馈。'}

## Evidence
- Console errors: ${report.consoleErrors.length}
- Page errors: ${report.pageErrors.length}
- Request failures: ${report.requestFailures.length}
- Bad HTTP responses: ${report.badResponses.length}
- Canvas count: ${report.canvas.count}
- Canvas nonblank: ${report.canvas.nonBlank}
- Interaction pixel delta: ${report.interaction.pixelDelta}

## Next Codex Task
请在本地游戏项目中做一轮小步迭代：优先修复上述问题；如果没有严重问题，则增强局内决策、即时反馈、关卡目标、连击/奖励、分享战绩动机或 Playwright 可验证的交互反馈。修改后运行本地调试页和 Playwright 检查，更新 README 迭代记录。
`;

await fs.writeFile(path.join(reportDir, 'codex-instruction.md'), instruction);

const latestDir = path.join(__dirname, 'reports', 'latest');
await fs.rm(latestDir, { recursive: true, force: true });
await fs.mkdir(latestDir, { recursive: true });
for (const file of ['report.json', 'codex-instruction.md', 'initial.png', 'after-interaction.png']) {
  await fs.copyFile(path.join(reportDir, file), path.join(latestDir, file)).catch(() => {});
}

console.log(JSON.stringify({
  reportDir,
  score: report.judgement.score,
  reasons: report.judgement.reasons
}, null, 2));
