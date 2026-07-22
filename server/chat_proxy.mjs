import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PORT = process.env.CHAT_PROXY_PORT || 8799;
const HOST = '127.0.0.1';

function loadApiKey() {
  try {
    const authPath = join(process.env.HOME || '/root', '.local/share/opencode/auth.json');
    const auth = JSON.parse(readFileSync(authPath, 'utf8'));
    if (auth.deepseek?.key) return auth.deepseek.key.trim();
  } catch {}
  return process.env.DEEPSEEK_API_KEY || null;
}

async function proxyRequest(targetUrl, method, headers, body) {
  const url = new URL(targetUrl);
  delete headers['host'];
  delete headers['connection'];

  return new Promise((resolve, reject) => {
    const opts = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
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

    if (body) req.write(body);
    req.end();
  });
}

const API_KEY = loadApiKey();

if (!API_KEY) {
  console.error('[chat-proxy] ERROR: No DeepSeek API key found.');
  process.exit(1);
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
        { id: 'deepseek-chat', name: 'DeepSeek V3', desc: '通用高性能模型' },
        { id: 'deepseek-reasoner', name: 'DeepSeek R1', desc: '深度推理模型' },
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
        const raw = Buffer.concat(chunks).toString();
        const payload = JSON.parse(raw);
        const model = payload.model || 'deepseek-chat';

        const upstream = await proxyRequest(
          'https://api.deepseek.com/v1/chat/completions',
          'POST',
          { 'Content-Type': 'application/json' },
          JSON.stringify({
            model,
            messages: payload.messages,
            temperature: payload.temperature ?? 0.7,
            max_tokens: payload.max_tokens ?? 4096,
            stream: false,
          })
        );

        res.writeHead(upstream.status, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        });
        res.end(upstream.body);
      } catch (err) {
        console.error('[chat-proxy] Proxy error:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: err.message } }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, HOST, () => {
  console.log(`[chat-proxy] Listening on ${HOST}:${PORT}`);
  console.log(`[chat-proxy] API key loaded: ${API_KEY ? 'Yes' : 'No'}`);
});
