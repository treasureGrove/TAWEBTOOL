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
  },
  {
    name: 'zhipu',
    models: ['glm-4.7-flash', 'glm-4-flash'],
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  },
  {
    name: 'siliconflow',
    models: [
      'Qwen/Qwen2.5-7B-Instruct',
      'Qwen/Qwen2.5-14B-Instruct',
      'Qwen/Qwen2.5-32B-Instruct',
      'Pro/Qwen/Qwen2.5-7B-Instruct',
    ],
    url: 'https://api.siliconflow.cn/v1/chat/completions',
  },
];

const KEYS = loadKeys();

function mapModelToProvider(requestedModel) {
  for (const p of PROVIDERS) {
    if (p.models.includes(requestedModel)) return p;
  }
  return PROVIDERS[0];
}

async function proxyRequest(provider, body) {
  const url = new URL(provider.url);
  const apiKey = KEYS[provider.name];
  if (!apiKey) throw new Error(`No API key for ${provider.name}`);

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: body.model,
      messages: body.messages,
      temperature: body.temperature ?? 0.7,
      max_tokens: body.max_tokens ?? 4096,
      stream: false,
    });

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
        resolve({
          status: upstreamRes.statusCode,
          body: Buffer.concat(chunks),
          provider: provider.name,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('upstream timeout')); });
    req.write(postData);
    req.end();
  });
}

function isRateLimited(status, body) {
  if (status === 429 || status === 403) return true;
  try {
    const d = JSON.parse(body.toString());
    const msg = (d?.error?.message || d?.message || '').toLowerCase();
    if (msg.includes('rate') || msg.includes('速率') || msg.includes('limit') || msg.includes('quota')) return true;
  } catch {}
  return false;
}

function injectProviderField(body, providerName, fallback, requestedModel) {
  try {
    const d = JSON.parse(body.toString());
    d._provider = providerName;
    d._fallback = fallback || false;
    d._requested = requestedModel;
    return Buffer.from(JSON.stringify(d));
  } catch {}
  return body;
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://tools.treasuregrove.art');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/api/models') {
    const models = [];
    for (const p of PROVIDERS) {
      if (!KEYS[p.name]) continue;
      for (const m of p.models) {
        models.push({ id: m, provider: p.name });
      }
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
        const primaryProvider = mapModelToProvider(requestedModel);

        let lastError = null;

        for (const provider of PROVIDERS) {
          if (!KEYS[provider.name]) continue;

          const matched = provider.name === primaryProvider.name;
          if (!matched) continue;

          try {
            const upstream = await proxyRequest(provider, payload);
            if (isRateLimited(upstream.status, upstream.body)) {
              console.warn(`[chat-proxy] ${provider.name} rate limited, falling back...`);
              lastError = { message: `${provider.name} 超限` };
              continue;
            }
            if (upstream.status >= 400) {
              lastError = { message: `${provider.name}: HTTP ${upstream.status}` };
              continue;
            }
            res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
            res.end(injectProviderField(upstream.body, provider.name, false, requestedModel));
            return;
          } catch (err) {
            console.error(`[chat-proxy] ${provider.name} error:`, err.message);
            lastError = { message: `${provider.name}: ${err.message}` };
          }
        }

        for (const provider of PROVIDERS) {
          if (!KEYS[provider.name]) continue;
          if (provider.name === primaryProvider.name) continue;

          try {
            const body = { ...payload, model: provider.models[0] };
            const upstream = await proxyRequest(provider, body);
            if (isRateLimited(upstream.status, upstream.body)) {
              console.warn(`[chat-proxy] ${provider.name} fallback also rate limited`);
              continue;
            }
            if (upstream.status >= 400) continue;
            res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
            res.end(injectProviderField(upstream.body, provider.name, true, requestedModel));
            return;
          } catch (err) {
            console.error(`[chat-proxy] ${provider.name} fallback error:`, err.message);
          }
        }

        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: lastError || { message: '所有模型暂不可用' } }));
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
  console.log(`[chat-proxy] Listening on ${HOST}:${PORT}`);
  for (const p of PROVIDERS) {
    console.log(`[chat-proxy] ${p.name}: ${KEYS[p.name] ? 'ready' : 'no key'} (${p.models.length} models)`);
  }
});
