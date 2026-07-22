import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PORT = process.env.CHAT_PROXY_PORT || 8799;
const HOST = '127.0.0.1';

function loadKeys() {
  const keys = {};
  try {
    const authPath = join(process.env.HOME || '/root', '.local/share/opencode/auth.json');
    const auth = JSON.parse(readFileSync(authPath, 'utf8'));
    if (auth.deepseek?.key) keys.deepseek = auth.deepseek.key.trim();
  } catch {}
  try {
    const cfgPath = join(import.meta.dirname, 'chat_keys.json');
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    for (const [k, v] of Object.entries(cfg)) {
      keys[k] = String(v).trim();
    }
  } catch {}
  return keys;
}

const PROVIDERS = [
  {
    name: 'deepseek',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    url: 'https://api.deepseek.com/v1/chat/completions',
    fallback: true,
  },
  {
    name: 'zhipu',
    models: ['glm-4.7-flash', 'glm-4-flash'],
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    fallback: true,
  },
  {
    name: 'siliconflow',
    models: ['Qwen/Qwen2.5-7B-Instruct', 'Qwen/Qwen2.5-14B-Instruct', 'Qwen/Qwen2.5-32B-Instruct'],
    url: 'https://api.siliconflow.cn/v1/chat/completions',
    fallback: false,
  },
];

const KEYS = loadKeys();

function mapModelToProvider(id) {
  for (const p of PROVIDERS) {
    if (p.models.includes(id)) return { provider: p, index: p.models.indexOf(id) };
  }
  return { provider: PROVIDERS[0], index: 0 };
}

async function proxyRequest(provider, model, body) {
  const url = new URL(provider.url);
  const apiKey = KEYS[provider.name];
  if (!apiKey) throw new Error(`No key for ${provider.name}`);

  const postData = JSON.stringify({
    model,
    messages: body.messages,
    temperature: body.temperature ?? 0.7,
    max_tokens: body.max_tokens ?? 4096,
    stream: false,
  });

  return new Promise((resolve, reject) => {
    const opts = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        Authorization: `Bearer ${apiKey}`,
        Host: url.hostname,
      },
      timeout: 120000,
    };

    const req = httpsRequest(opts, (upstreamRes) => {
      const chunks = [];
      upstreamRes.on('data', (c) => chunks.push(c));
      upstreamRes.on('end', () => {
        resolve({ status: upstreamRes.statusCode, body: Buffer.concat(chunks) });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(postData);
    req.end();
  });
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

function extractError(status, body) {
  try {
    const d = JSON.parse(body.toString());
    return d?.error?.message || d?.message || `HTTP ${status}`;
  } catch {}
  return `HTTP ${status}`;
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

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, HOST, () => {
  console.log(`[chat-proxy] ${HOST}:${PORT}`);
  for (const p of PROVIDERS) {
    console.log(`[chat-proxy] ${p.name}: ${KEYS[p.name] ? 'ready' : 'no key'} [${p.models.join(', ')}]`);
  }
});
