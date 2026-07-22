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
    if (cfg.zhipu) keys.zhipu = cfg.zhipu.trim();
  } catch {}

  return keys;
}

const PROVIDERS = [
  {
    name: 'deepseek',
    model: 'deepseek-chat',
    url: 'https://api.deepseek.com/v1/chat/completions',
  },
  {
    name: 'zhipu',
    model: 'glm-4.7-flash',
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  },
];

const KEYS = loadKeys();

async function proxyRequest(provider, body) {
  const url = new URL(provider.url);
  const apiKey = KEYS[provider.name];
  if (!apiKey) throw new Error(`No API key for ${provider.name}`);

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: provider.model,
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
          headers: upstreamRes.headers,
          body: Buffer.concat(chunks),
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
  if (status === 429) return true;
  try {
    const d = JSON.parse(body.toString());
    const msg = (d?.error?.message || d?.message || '').toLowerCase();
    if (msg.includes('rate') || msg.includes('速率') || msg.includes('限制')) return true;
  } catch {}
  return false;
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://tools.treasuregrove.art');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/api/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      models: [
        { id: 'deepseek-chat', name: 'DeepSeek', desc: '优先使用，满额后自动切换' },
        { id: 'glm-4.7-flash', name: '智谱 GLM', desc: 'DeepSeek 超限后备' },
      ],
      default: 'deepseek-chat',
    }));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString());
        const requestedModel = payload.model || 'deepseek-chat';

        let lastError = null;

        for (const provider of PROVIDERS) {
          if (!KEYS[provider.name]) continue;
          const matched = requestedModel === provider.model
            || (requestedModel === 'deepseek-chat' && provider.name === 'deepseek')
            || (requestedModel === 'glm-4.7-flash' && provider.name === 'zhipu');

          if (!matched) continue;

          try {
            const upstream = await proxyRequest(provider, payload);
            if (isRateLimited(upstream.status, upstream.body)) {
              console.warn(`[chat-proxy] ${provider.name} rate limited, trying next...`);
              lastError = { message: `${provider.name} 速率限制，正在切换备用模型...` };
              continue;
            }
            if (upstream.status >= 400) {
              lastError = { message: `${provider.name}: HTTP ${upstream.status}` };
              continue;
            }
            res.writeHead(upstream.status, {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache',
            });
            res.end(upstream.body);
            return;
          } catch (err) {
            console.error(`[chat-proxy] ${provider.name} error:`, err.message);
            lastError = { message: `${provider.name}: ${err.message}` };
          }
        }

        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: lastError || { message: '所有模型均不可用' } }));
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
    console.log(`[chat-proxy] ${p.name}: ${KEYS[p.name] ? 'ready' : 'no key'}`);
  }
});
