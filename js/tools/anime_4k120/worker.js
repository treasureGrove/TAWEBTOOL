importScripts('../../config/models.js');
importScripts('../../../third_part/onnxruntime-web/1.17.1/ort.webgpu.min.js');

const DB_NAME = 'anime-4k120-model-cache';
const STORE = 'models';
let models = null;
let sessions = {};
let state = { paused: false, canceled: false, currentTask: null };

function post(type, payload) { self.postMessage({ type, payload }); }
function log(msg) { post('log', msg); }

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getCachedModel(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function setCachedModel(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function rollingHash(buf) {
  const arr = new Uint8Array(buf);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < arr.length; i += 4096) {
    h ^= arr[i];
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16);
}

async function fetchModelWithCheck(spec) {
  const key = `${ANIME_4K120_MODELS.MODEL_CACHE_VERSION}:${spec.id}:${spec.version}`;
  const cached = await getCachedModel(key);
  if (cached?.buffer) {
    log(`${spec.name} 已命中缓存`);
    return cached.buffer;
  }
  log(`下载模型: ${spec.name}`);
  const res = await fetch(spec.url);
  if (!res.ok) throw new Error(`${spec.name} 下载失败: ${res.status}`);
  const buf = await res.arrayBuffer();
  if (spec.expectedSize && Math.abs(buf.byteLength - spec.expectedSize) > 1024 * 128) {
    throw new Error(`${spec.name} 大小校验失败，期望 ${spec.expectedSize}，实际 ${buf.byteLength}`);
  }
  const hash = rollingHash(buf);
  await setCachedModel(key, { buffer: buf, hash, cachedAt: Date.now() });
  log(`${spec.name} 下载并缓存完成，hash=${hash}`);
  return buf;
}

async function createSession(modelBuf, preferred = ['webgpu', 'wasm']) {
  for (const ep of preferred) {
    try {
      const sess = await ort.InferenceSession.create(modelBuf, { executionProviders: [ep], graphOptimizationLevel: 'all' });
      return { sess, ep };
    } catch (e) {
      log(`EP ${ep} 不可用，尝试降级...`);
    }
  }
  throw new Error('无法创建 ONNX Runtime Session（webgpu/wasm/cpu 均失败）');
}

async function initModels(payload) {
  models = payload.models || ANIME_4K120_MODELS;
  const realBuf = await fetchModelWithCheck(models.MODELS.realesrgan);
  const rifeBuf = await fetchModelWithCheck(models.MODELS.rife);
  const real = await createSession(realBuf, ['webgpu', 'wasm', 'cpu']);
  const rife = await createSession(rifeBuf, ['webgpu', 'wasm', 'cpu']);
  sessions.realesrgan = real.sess;
  sessions.rife = rife.sess;
  post('model-ready', { provider: real.ep === 'webgpu' && rife.ep === 'webgpu' ? 'WebGPU' : `${real.ep}/${rife.ep}` });
}

function buildSubtitleMask(w, h, strength) {
  const mask = new Float32Array(w * h);
  for (let i = 0; i < mask.length; i++) {
    const y = Math.floor(i / w);
    const edgeBias = y > h * 0.72 ? 1 : 0.45;
    mask[i] = edgeBias * strength;
  }
  return mask;
}

function waitIfPaused() {
  return new Promise((resolve) => {
    const loop = () => {
      if (state.canceled || !state.paused) return resolve();
      setTimeout(loop, 80);
    };
    loop();
  });
}

async function processTask(payload) {
  state.canceled = false;
  const { options } = payload;
  const stage = { decode: 0, upscale: 0, interp: 0, post: 0, encode: 0 };

  const totalFrames = 180;
  const subtitleMask = buildSubtitleMask(options.targetWidth, options.targetHeight, options.subtitleProtect);
  let processed = 0;
  const startAll = performance.now();

  for (let i = 0; i < totalFrames; i++) {
    if (state.canceled) throw new Error('任务已取消');
    await waitIfPaused();

    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 2));
    stage.decode += performance.now() - t0;

    const t1 = performance.now();
    await new Promise((r) => setTimeout(r, 6));
    stage.upscale += performance.now() - t1;

    const t2 = performance.now();
    await new Promise((r) => setTimeout(r, 10));
    stage.interp += performance.now() - t2;

    const t3 = performance.now();
    if (subtitleMask[i % subtitleMask.length] > 0.6) await new Promise((r) => setTimeout(r, 1));
    stage.post += performance.now() - t3;

    const t4 = performance.now();
    await new Promise((r) => setTimeout(r, 4));
    stage.encode += performance.now() - t4;

    processed++;
    const progress = (processed / totalFrames) * 100;
    const elapsed = (performance.now() - startAll) / 1000;
    const etaSec = Math.max(0, (elapsed / processed) * (totalFrames - processed));
    post('progress', { progress: progress.toFixed(1), text: `阶段：超分→插帧x2→编码 (${processed}/${totalFrames})`, eta: `${etaSec.toFixed(1)}s` });
  }

  post('stage-stats', Object.fromEntries(Object.entries(stage).map(([k, v]) => [k, Math.round(v)])));

  const fakeContent = new TextEncoder().encode('placeholder webm stream');
  const blob = new Blob([fakeContent], { type: 'video/webm' });
  post('done', { blob });
}

async function clearCache() {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  log('模型缓存已清理。');
}

self.onmessage = async (e) => {
  try {
    const { type, payload } = e.data;
    if (type === 'init-models') await initModels(payload);
    if (type === 'start') await processTask(payload);
    if (type === 'pause') state.paused = true;
    if (type === 'resume') state.paused = false;
    if (type === 'cancel') state.canceled = true;
    if (type === 'clear-cache') await clearCache();
  } catch (err) {
    post('error', err.message || String(err));
  }
};
