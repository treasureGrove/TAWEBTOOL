import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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
    for (const cfgPath of [
      join(process.env.HOME || '/root', '.config/tools/chat_keys.json'),
      join(import.meta.dirname, 'chat_keys.json'),
    ]) {
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

const KEYS = loadKeys();

function mapModelToProvider(id) {
  for (const p of PROVIDERS) {
    if (p.models.includes(id)) return { provider: p, index: p.models.indexOf(id) };
  }
  return { provider: PROVIDERS[0], index: 0 };
}

function buildUrl(provider, model) {
  let url = provider.url;
  if (provider.type === 'cloudflare') {
    const account = KEYS.cloudflare_account || '';
    url = url.replace('{account}', account).replace('{model}', model);
  }
  return url;
}

async function proxyRequest(provider, model, body) {
  const apiKey = KEYS[provider.name];
  if (!apiKey) throw new Error(`No key for ${provider.name}`);

  const targetUrl = buildUrl(provider, model);
  const url = new URL(targetUrl);

  const reqBody = provider.type === 'cloudflare'
    ? JSON.stringify({ messages: body.messages, temperature: body.temperature ?? 0.7, max_tokens: body.max_tokens ?? 4096 })
    : JSON.stringify({ model, messages: body.messages, temperature: body.temperature ?? 0.7, max_tokens: body.max_tokens ?? 4096, stream: false });

  return new Promise((resolve, reject) => {
    const opts = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(reqBody),
        Authorization: `Bearer ${apiKey}`,
        Host: url.hostname,
      },
      timeout: 120000,
    };

    const req = httpsRequest(opts, (upstreamRes) => {
      const chunks = [];
      upstreamRes.on('data', (c) => chunks.push(c));
      upstreamRes.on('end', () => {
        let body = Buffer.concat(chunks);
        if (provider.type === 'cloudflare') {
          try {
            const d = JSON.parse(body.toString());
            if (d.success && d.result) {
              const r = d.result;
              delete r.response;
              if (r.choices?.[0]?.message) {
                const msg = r.choices[0].message;
                let content = msg.content || msg.reasoning_content || msg.reasoning || '';
                r.choices[0].message = {
                  role: msg.role,
                  content,
                };
              }
              body = Buffer.from(JSON.stringify(r));
            }
          } catch {}
        }
        resolve({ status: upstreamRes.statusCode, body });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(reqBody);
    req.end();
  });
}

function extractError(status, body) {
  try {
    const d = JSON.parse(body.toString());
    return d?.error?.message || d?.message || d?.errors?.[0]?.message || `HTTP ${status}`;
  } catch {}
  return `HTTP ${status}`;
}

function isRateLimited(status, body) {
  if (status === 429) return true;
  try {
    const d = JSON.parse(body.toString());
    const msg = (d?.error?.message || '').toLowerCase();
    return msg.includes('rate limit') || msg.includes('速率限制');
  } catch {}
  return false;
}

function addMeta(body, wasFallback, requestedModel) {
  try {
    const d = JSON.parse(body.toString());
    d._fallback = wasFallback;
    d._requested = requestedModel;
    return Buffer.from(JSON.stringify(d));
  } catch {}
  return body;
}

async function tryProviderModels(provider, startIndex, payload) {
  for (let i = startIndex; i < provider.models.length; i++) {
    try {
      const upstream = await proxyRequest(provider, provider.models[i], payload);
      if (isRateLimited(upstream.status, upstream.body)) {
        console.warn(`[chat-proxy] ${provider.name}/${provider.models[i]} rate limited`);
        continue;
      }
      if (upstream.status >= 400) {
        console.warn(`[chat-proxy] ${provider.name}/${provider.models[i]} HTTP ${upstream.status}: ${extractError(upstream.status, upstream.body)}`);
        continue;
      }
      return upstream;
    } catch (err) {
      console.error(`[chat-proxy] ${provider.name}/${provider.models[i]} error:`, err.message);
    }
  }
  return null;
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://tools.treasuregrove.art');
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

  if (req.method === 'POST' && req.url === '/api/chat') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString());
        const requestedModel = payload.model || PROVIDERS[0].models[0];
        const { provider, index } = mapModelToProvider(requestedModel);

        const result = await tryProviderModels(provider, index, payload);
        if (result) {
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          res.end(addMeta(result.body, false, requestedModel));
          return;
        }

        if (provider.fallback) {
          for (const fb of PROVIDERS) {
            if (!KEYS[fb.name]) continue;
            if (fb.name === provider.name) continue;
            const fbResult = await tryProviderModels(fb, 0, payload);
            if (fbResult) {
              res.writeHead(fbResult.status, { 'Content-Type': 'application/json' });
              res.end(addMeta(fbResult.body, true, requestedModel));
              return;
            }
          }
        }

        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: '当前模型暂不可用，请尝试其他模型' } }));
      } catch (err) {
        console.error('[chat-proxy] Parse error:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: '请求格式错误' } }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/image') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString());
        const prompt = payload.prompt || '';
        if (!prompt) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: '请输入描述文字' } }));
          return;
        }

        const apiKey = KEYS.zhipu;
        if (!apiKey) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: '服务暂不可用' } }));
          return;
        }

        const postData = JSON.stringify({ model: 'cogview-3-flash', prompt });
        const url = new URL('https://open.bigmodel.cn/api/paas/v4/images/generations');

        const upstream = await new Promise((resolve, reject) => {
          const opts = {
            hostname: url.hostname, port: 443, path: url.pathname,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData),
              Authorization: `Bearer ${apiKey}`,
              Host: url.hostname,
            },
            timeout: 120000,
          };
          const req = httpsRequest(opts, (upRes) => {
            const chunks = [];
            upRes.on('data', (c) => chunks.push(c));
            upRes.on('end', () => resolve({ status: upRes.statusCode, body: Buffer.concat(chunks).toString() }));
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
          req.write(postData);
          req.end();
        });

        if (upstream.status >= 400) {
          console.warn(`[chat-proxy] image gen error: ${upstream.body}`);
          res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
          res.end(upstream.body);
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(upstream.body);
      } catch (err) {
        console.error('[chat-proxy] image error:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: err.message } }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/video') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString());
        const prompt = payload.prompt || '';
        if (!prompt) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: '请输入描述文字' } }));
          return;
        }

        const apiKey = KEYS.zhipu;
        if (!apiKey) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: '服务暂不可用' } }));
          return;
        }

        const url = new URL('https://open.bigmodel.cn/api/paas/v4/videos/generations');
        const postData = JSON.stringify({ model: 'cogvideox-flash', prompt });

        const upstream = await new Promise((resolve, reject) => {
          const opts = {
            hostname: url.hostname, port: 443, path: url.pathname,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData),
              Authorization: `Bearer ${apiKey}`, Host: url.hostname,
            },
            timeout: 60000,
          };
          const r = httpsRequest(opts, (upRes) => {
            const chunks = [];
            upRes.on('data', (c) => chunks.push(c));
            upRes.on('end', () => resolve({ status: upRes.statusCode, body: Buffer.concat(chunks).toString() }));
          });
          r.on('error', reject);
          r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
          r.write(postData); r.end();
        });

        if (upstream.status >= 400) {
          res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
          res.end(upstream.body);
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(upstream.body);
      } catch (err) {
        console.error('[chat-proxy] video error:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: err.message } }));
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url && req.url.startsWith('/api/video/status/')) {
    const taskId = req.url.split('/api/video/status/')[1];
    if (!taskId) { res.writeHead(400); res.end('missing task id'); return; }

    try {
      const apiKey = KEYS.zhipu;
      if (!apiKey) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: '服务暂不可用' } })); return; }

      const url = new URL(`https://open.bigmodel.cn/api/paas/v4/async-result/${taskId}`);
      const upstream = await new Promise((resolve, reject) => {
        const opts = {
          hostname: url.hostname, port: 443, path: url.pathname, method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}`, Host: url.hostname },
          timeout: 30000,
        };
        const r = httpsRequest(opts, (upRes) => {
          const chunks = [];
          upRes.on('data', (c) => chunks.push(c));
          upRes.on('end', () => resolve({ status: upRes.statusCode, body: Buffer.concat(chunks).toString() }));
        });
        r.on('error', reject);
        r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
        r.end();
      });

      res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
      res.end(upstream.body);
    } catch (err) {
      console.error('[chat-proxy] video status error:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: err.message } }));
    }
    return;
  }

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

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, HOST, () => {
  console.log(`[chat-proxy] ${HOST}:${PORT}`);
  for (const p of PROVIDERS) {
    if (p.name === 'cloudflare' && !KEYS.cloudflare_account) {
      console.log(`[chat-proxy] ${p.name}: skipping (no account)`);
      continue;
    }
    console.log(`[chat-proxy] ${p.name}: ${KEYS[p.name] ? 'ready' : 'no key'} [${p.models.join(', ')}]`);
  }
});
