import { createServer } from 'node:http';
import { createAiHandler } from './ai_router.mjs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALLOWED_GAMES,
  applyScoreCors,
  clampInt,
  insertScoreEntry,
  leaderboard,
  parseScoreBody,
} from './game_scores.mjs';

const PORT = process.env.CHAT_PROXY_PORT || 8799;
const HOST = '127.0.0.1';

const FEEDBACK_DIR = join(import.meta.dirname, '..', 'data', 'feedback');
const FEEDBACK_ENTRIES = join(FEEDBACK_DIR, 'entries.json');
const FEEDBACK_IMAGES = join(FEEDBACK_DIR, 'images');

function ensureFeedbackDirs() {
  try { mkdirSync(FEEDBACK_IMAGES, { recursive: true }); } catch {}
}

function saveFeedbackImage(dataUrl) {
  try {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return '';
    const match = /^data:image\/(png|jpe?g|gif|webp);base64,([\s\S]+)$/i.exec(dataUrl);
    if (!match) return '';
    const ext = match[1].toLowerCase().replace('jpeg', 'jpg');
    const buf = Buffer.from(match[2], 'base64');
    if (!buf.length || buf.length > 5 * 1024 * 1024) return '';
    const name = 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    writeFileSync(join(FEEDBACK_IMAGES, name), buf);
    return 'data/feedback/images/' + name;
  } catch (err) {
    console.error('[feedback] save image failed:', err.message);
    return '';
  }
}

function appendFeedbackEntry(entry) {
  let list = [];
  try {
    list = JSON.parse(readFileSync(FEEDBACK_ENTRIES, 'utf8'));
  } catch {}
  if (!Array.isArray(list)) list = [];
  list.push(entry);
  writeFileSync(FEEDBACK_ENTRIES, JSON.stringify(list, null, 2) + '\n');
}

function loadKeys() {
  const keys = {};
  try {
    const authPath = join(process.env.HOME || '/root', '.local/share/opencode/auth.json');
    const auth = JSON.parse(readFileSync(authPath, 'utf8'));
    if (auth.deepseek?.key) keys.deepseek = auth.deepseek.key.trim();
  } catch {}
  try {
    const cfgPaths = [
      join(process.env.HOME || '/root', '.config/tools/chat_keys.json'),
      join(import.meta.dirname, 'chat_keys.json'),
    ];
    if (process.env.CREDENTIALS_DIRECTORY) {
      cfgPaths.push(join(process.env.CREDENTIALS_DIRECTORY, 'chat_keys'));
    }
    for (const cfgPath of cfgPaths) {
      try {
        const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
        for (const [k, v] of Object.entries(cfg)) {
          keys[k] = String(v).trim();
        }
      } catch {}
    }
  } catch {}
  return keys;
}

const PROVIDERS = [
  {
    name: 'cloudflare',
    models: [
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    ],
    url: 'https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{model}',
    fallback: true,
    type: 'cloudflare',
  },
  {
    name: 'zhipu',
    models: ['glm-4.7-flash', 'glm-4-flash', 'glm-4.6v-flash', 'glm-4.1v-thinking-flash', 'glm-4v-flash'],
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    fallback: true,
    type: 'openai',
  },
];

export function createProxyServer({keys, aiOptions = {}} = {}) {
const KEYS = keys || loadKeys();
const handleAi = createAiHandler({...aiOptions, keys: KEYS, providers: PROVIDERS});

const server = createServer(async (req, res) => {
  applyScoreCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && req.url === '/api/models') {
    const models = [];
    for (const p of PROVIDERS) {
      if (!KEYS[p.name]) continue;
      if (p.name === 'cloudflare' && !KEYS.cloudflare_account) continue;
      for (const m of p.models) models.push({ id: m, provider: p.name });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ models, default: PROVIDERS[0].models[0] }));
    return;
  }

  if (await handleAi(req, res)) return;

  if (req.method === 'POST' && req.url === '/api/feedback') {
    const chunks = [];
    let total = 0;
    let aborted = false;
    req.on('data', (c) => {
      total += c.length;
      if (total > 30 * 1024 * 1024) {
        aborted = true;
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));

        const email = String(payload.email || '').trim().slice(0, 200);
        if (!email || !email.includes('@') || email.indexOf('@') === email.length - 1) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: '请填写有效的邮箱地址' } }));
          return;
        }

        const message = String(payload.message || '').trim().slice(0, 5000);
        if (!message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: '请填写反馈内容' } }));
          return;
        }

        ensureFeedbackDirs();

        const images = [];
        const rawImages = Array.isArray(payload.images) ? payload.images.slice(0, 3) : [];
        for (const img of rawImages) {
          const saved = saveFeedbackImage(img);
          if (saved) images.push(saved);
        }

        const forwarded = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '');
        const entry = {
          id: 'fb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
          email,
          qq: String(payload.qq || '').trim().slice(0, 50),
          wechat: String(payload.wechat || '').trim().slice(0, 50),
          type: String(payload.type || 'other').trim().slice(0, 30),
          message,
          images,
          page: String(payload.page || '').trim().slice(0, 300),
          ip: forwarded.split(',')[0].trim(),
          userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
          createdAt: new Date().toISOString(),
          emailed: false
        };

        appendFeedbackEntry(entry);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id: entry.id }));
      } catch (err) {
        console.error('[feedback] error:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: '请求格式错误' } }));
      }
    });
    return;
  }

  // ── Game scores ──
  if (req.method === 'GET' && req.url && req.url.startsWith('/api/scores')) {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const game = url.searchParams.get('game') || 'grove_range';
      const limit = clampInt(url.searchParams.get('limit'), 1, 50, 10);
      if (!ALLOWED_GAMES.has(game)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: '未知游戏' } }));
        return;
      }
      const scores = leaderboard(game, limit);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, game, scores }));
    } catch (err) {
      console.error('[scores] read error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: '排行榜读取失败' } }));
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/scores') {
    const chunks = [];
    let total = 0;
    let aborted = false;
    req.on('data', (c) => {
      total += c.length;
      if (total > 16 * 1024) {
        aborted = true;
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      try {
        const parsed = parseScoreBody(Buffer.concat(chunks));
        if (parsed.error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: parsed.error } }));
          return;
        }
        const forwarded = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '');
        const entry = { ...parsed.entry, ip: forwarded.split(',')[0].trim() };
        const result = insertScoreEntry(entry);
        if (!result.ok) {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: result.error } }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error('[scores] write error:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: '成绩保存失败' } }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.requestTimeout = 15000;
return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createProxyServer();
  server.listen(PORT, HOST, () => console.log(`[chat-proxy] ${HOST}:${PORT}`));
}
