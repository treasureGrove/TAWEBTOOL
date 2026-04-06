(function () {
  function $(id) { return document.getElementById(id); }

  const STYLE_PRESETS = [
    { name: '电影感', prompt: 'cinematic lighting, dramatic atmosphere, ultra detailed' },
    { name: '二次元', prompt: 'anime style, clean lineart, vibrant colors' },
    { name: '写实摄影', prompt: 'photorealistic, 85mm lens, high detail skin texture' },
    { name: '概念艺术', prompt: 'concept art, matte painting, epic composition' },
    { name: '像素风', prompt: 'pixel art, retro game style, crisp edges' }
  ];

  const QUALITY_PRESETS = {
    fast: { label: '快速预览', steps: 20, cfg: 5.5, sampler: 'euler' },
    balanced: { label: '均衡质量', steps: 30, cfg: 7, sampler: 'dpm++' },
    detail: { label: '细节优先', steps: 40, cfg: 8, sampler: 'dpm++_2m' }
  };

  const API_BASE_CANDIDATES = [
    'https://image.pollinations.ai/prompt/',
    'https://pollinations.ai/prompt/'
  ];

  function initAiDrawPage(host) {
    host.innerHTML = `
      <section class="ai-draw-wrap">
        <div class="ai-draw-grid">
          <aside class="ai-draw-form card-lite">
            <h2>AI 绘画工作台</h2>
            <p class="hint">免费 API：Pollinations（免 Key，适合原型验证）。</p>

            <label for="drawPrompt">提示词（Prompt）</label>
            <textarea id="drawPrompt" rows="4" placeholder="例如：赛博朋克城市夜景，霓虹灯雨夜，电影感，8K"></textarea>

            <div class="preset-list" id="stylePresetList"></div>

            <label for="drawNegative">反向提示词（Negative）</label>
            <textarea id="drawNegative" rows="3" placeholder="例如：low quality, blurry, watermark, deformed"></textarea>

            <details class="prompt-helper">
              <summary>提示词辅助拼接</summary>
              <div class="draw-two-col">
                <input id="drawSubject" placeholder="主体（如：机械龙）" />
                <input id="drawScene" placeholder="场景（如：雪山峡谷）" />
              </div>
              <div class="draw-two-col">
                <input id="drawLight" placeholder="光照（如：golden hour）" />
                <input id="drawCamera" placeholder="镜头（如：35mm, DOF）" />
              </div>
              <button id="appendPromptBtn" type="button" class="ghost">拼接到提示词</button>
            </details>

            <div class="draw-two-col">
              <div>
                <label for="drawModel">模型</label>
                <select id="drawModel">
                  <option value="flux">FLUX</option>
                  <option value="turbo">Turbo</option>
                </select>
              </div>
              <div>
                <label for="qualityPreset">质量预设</label>
                <select id="qualityPreset">
                  <option value="fast">快速预览</option>
                  <option value="balanced" selected>均衡质量</option>
                  <option value="detail">细节优先</option>
                </select>
              </div>
            </div>

            <div class="draw-two-col">
              <div>
                <label for="drawAspect">比例预设</label>
                <select id="drawAspect">
                  <option value="1024x1024">1:1</option>
                  <option value="1344x768">16:9 横图</option>
                  <option value="768x1344">9:16 竖图</option>
                  <option value="1216x832">3:2 横图</option>
                </select>
              </div>
              <div>
                <label for="drawCount">生成张数</label>
                <input id="drawCount" type="number" value="1" min="1" max="4" />
              </div>
            </div>

            <div class="draw-two-col">
              <div>
                <label for="drawWidth">宽度</label>
                <input id="drawWidth" type="number" value="1024" min="256" max="1536" step="64" />
              </div>
              <div>
                <label for="drawHeight">高度</label>
                <input id="drawHeight" type="number" value="1024" min="256" max="1536" step="64" />
              </div>
            </div>

            <div class="draw-three-col">
              <div>
                <label for="drawSteps">Steps</label>
                <input id="drawSteps" type="number" value="30" min="10" max="60" />
              </div>
              <div>
                <label for="drawCfg">CFG</label>
                <input id="drawCfg" type="number" value="7" min="1" max="14" step="0.5" />
              </div>
              <div>
                <label for="drawSampler">Sampler</label>
                <select id="drawSampler">
                  <option value="dpm++">DPM++</option>
                  <option value="dpm++_2m">DPM++ 2M</option>
                  <option value="euler">Euler</option>
                </select>
              </div>
            </div>

            <div class="draw-two-col">
              <div>
                <label for="drawSeed">Seed</label>
                <input id="drawSeed" type="number" placeholder="留空随机" />
              </div>
              <div class="seed-lock-row">
                <label><input id="lockSeed" type="checkbox" /> 固定 Seed</label>
              </div>
            </div>

            <div class="draw-actions">
              <button id="drawGenerateBtn" type="button">开始生成</button>
              <button id="drawRandomBtn" type="button" class="ghost">随机 Seed</button>
              <button id="drawClearBtn" type="button" class="ghost">清空结果</button>
            </div>
            <p id="drawStatus" class="status-text">等待输入提示词。</p>
          </aside>

          <main class="ai-draw-output card-lite">
            <div class="draw-output-head">
              <h3>生成结果</h3>
              <div class="row-actions">
                <button id="copyConfigBtn" type="button" class="ghost">复制参数</button>
                <button id="drawDownloadAllBtn" type="button" class="ghost" disabled>批量下载</button>
              </div>
            </div>
            <div id="drawResultList" class="draw-result-list">
              <div class="empty-result">生成后图片会显示在这里。</div>
            </div>
            <details class="history-box">
              <summary>最近参数历史（本地）</summary>
              <ul id="historyList"></ul>
            </details>
          </main>
        </div>
      </section>
    `;

    const state = { lastResults: [], history: [], workingBase: API_BASE_CANDIDATES[0] };

    const promptEl = $('drawPrompt');
    const negativeEl = $('drawNegative');
    const modelEl = $('drawModel');
    const aspectEl = $('drawAspect');
    const widthEl = $('drawWidth');
    const heightEl = $('drawHeight');
    const seedEl = $('drawSeed');
    const lockSeedEl = $('lockSeed');
    const countEl = $('drawCount');
    const stepsEl = $('drawSteps');
    const cfgEl = $('drawCfg');
    const samplerEl = $('drawSampler');
    const qualityEl = $('qualityPreset');
    const generateBtn = $('drawGenerateBtn');
    const randomBtn = $('drawRandomBtn');
    const clearBtn = $('drawClearBtn');
    const statusEl = $('drawStatus');
    const resultList = $('drawResultList');
    const downloadAllBtn = $('drawDownloadAllBtn');
    const copyConfigBtn = $('copyConfigBtn');
    const historyList = $('historyList');

    function setStatus(text, isError) {
      statusEl.textContent = text;
      statusEl.classList.toggle('error', Boolean(isError));
    }

    function safeInt(v, fallback, min, max) {
      const n = Number.parseInt(v, 10);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, n));
    }

    function safeFloat(v, fallback, min, max) {
      const n = Number.parseFloat(v);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, n));
    }

    function getSeed() {
      const val = seedEl.value.trim();
      if (!val) return Math.floor(Math.random() * 1e9);
      return Number.parseInt(val, 10) || Math.floor(Math.random() * 1e9);
    }

    function pushHistory(payload) {
      state.history = [payload].concat(state.history).slice(0, 8);
      historyList.innerHTML = state.history
        .map((item, idx) => `<li><button type="button" data-history="${idx}">${item.prompt.slice(0, 26) || '空提示词'} · ${item.width}x${item.height} · seed ${item.seed}</button></li>`)
        .join('');

      historyList.querySelectorAll('button[data-history]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const item = state.history[Number.parseInt(btn.dataset.history, 10)];
          if (!item) return;
          promptEl.value = item.prompt;
          negativeEl.value = item.negative;
          modelEl.value = item.model;
          widthEl.value = String(item.width);
          heightEl.value = String(item.height);
          stepsEl.value = String(item.steps);
          cfgEl.value = String(item.cfg);
          samplerEl.value = item.sampler;
          seedEl.value = String(item.seed);
        });
      });
    }

    function buildImageUrl(params, baseUrl) {
      const mergedPrompt = [params.prompt, params.negative ? `Negative prompt: ${params.negative}` : '']
        .filter(Boolean)
        .join(', ');
      const encoded = encodeURIComponent(mergedPrompt);
      const base = baseUrl || state.workingBase || API_BASE_CANDIDATES[0];
      return `${base}${encoded}?model=${encodeURIComponent(params.model)}&width=${params.width}&height=${params.height}&seed=${params.seed}&steps=${params.steps}&guidance=${params.cfg}&sampler=${encodeURIComponent(params.sampler)}&nologo=true`;
    }

    function preloadImage(url, timeoutMs) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const timer = window.setTimeout(() => {
          img.src = '';
          reject(new Error('请求超时'));
        }, timeoutMs || 18000);

        img.onload = () => {
          window.clearTimeout(timer);
          resolve();
        };
        img.onerror = () => {
          window.clearTimeout(timer);
          reject(new Error('图片加载失败'));
        };
        img.referrerPolicy = 'no-referrer';
        img.src = url;
      });
    }

    async function resolveWorkingBase(params, seed) {
      const orderedBases = [state.workingBase].concat(API_BASE_CANDIDATES)
        .filter(Boolean)
        .filter((value, index, arr) => arr.indexOf(value) === index);

      for (let i = 0; i < orderedBases.length; i += 1) {
        const base = orderedBases[i];
        const probeUrl = buildImageUrl({ ...params, seed }, base);
        try {
          await preloadImage(probeUrl, 12000);
          state.workingBase = base;
          return base;
        } catch (_) {
          // 尝试下一候选地址
        }
      }

      throw new Error('当前网络无法连接绘图服务地址，请稍后重试');
    }

    function renderResults() {
      if (!state.lastResults.length) {
        resultList.innerHTML = '<div class="empty-result">生成后图片会显示在这里。</div>';
        downloadAllBtn.disabled = true;
        return;
      }

      resultList.innerHTML = state.lastResults.map((item, idx) => `
        <article class="draw-item">
          <div class="draw-item-image-wrap"><img src="${item.url}" alt="AI生成图${idx + 1}" loading="lazy" referrerpolicy="no-referrer" /></div>
          <div class="draw-item-meta">
            <span>#${idx + 1} · Seed ${item.seed}</span>
            <a href="${item.url}" target="_blank" rel="noopener noreferrer">打开</a>
            <button type="button" class="ghost" data-dl="${idx}">下载</button>
          </div>
        </article>
      `).join('');

      resultList.querySelectorAll('button[data-dl]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const item = state.lastResults[Number.parseInt(btn.dataset.dl, 10)];
          if (!item) return;
          try {
            const blob = await (await fetch(item.url, { cache: 'no-store' })).blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `ai-draw-${item.seed}.png`;
            a.click();
            URL.revokeObjectURL(a.href);
          } catch (_) {
            window.open(item.url, '_blank', 'noopener,noreferrer');
          }
        });
      });

      downloadAllBtn.disabled = false;
    }

    async function generate() {
      const prompt = promptEl.value.trim();
      if (!prompt) return setStatus('请先输入提示词。', true);

      const params = {
        prompt,
        negative: negativeEl.value.trim(),
        model: modelEl.value,
        width: safeInt(widthEl.value, 1024, 256, 1536),
        height: safeInt(heightEl.value, 1024, 256, 1536),
        steps: safeInt(stepsEl.value, 30, 10, 60),
        cfg: safeFloat(cfgEl.value, 7, 1, 14),
        sampler: samplerEl.value
      };
      const count = safeInt(countEl.value, 1, 1, 4);

      generateBtn.disabled = true;
      state.lastResults = [];
      renderResults();
      setStatus('正在生成...');

      try {
        const baseSeed = getSeed();
        const workingBase = await resolveWorkingBase(params, baseSeed);
        for (let i = 0; i < count; i += 1) {
          const seed = lockSeedEl.checked ? baseSeed : baseSeed + i;
          const url = buildImageUrl({ ...params, seed }, workingBase);
          await preloadImage(url);
          state.lastResults.push({ url, seed });
          renderResults();
          setStatus(`已生成 ${i + 1}/${count} 张`);
        }

        pushHistory({ ...params, seed: baseSeed });
        setStatus(`完成，共 ${state.lastResults.length} 张。`);
      } catch (error) {
        setStatus(`生成失败：${error?.message || '网络异常'}`, true);
      } finally {
        generateBtn.disabled = false;
      }
    }

    $('stylePresetList').innerHTML = STYLE_PRESETS.map((item) => `<button type="button" class="chip" data-prompt="${item.prompt}">${item.name}</button>`).join('');
    $('stylePresetList').querySelectorAll('button[data-prompt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const text = btn.dataset.prompt || '';
        promptEl.value = promptEl.value.trim() ? `${promptEl.value.trim()}, ${text}` : text;
      });
    });

    qualityEl.addEventListener('change', () => {
      const config = QUALITY_PRESETS[qualityEl.value] || QUALITY_PRESETS.balanced;
      stepsEl.value = String(config.steps);
      cfgEl.value = String(config.cfg);
      samplerEl.value = config.sampler;
      setStatus(`已应用预设：${config.label}`);
    });

    aspectEl.addEventListener('change', () => {
      const parts = aspectEl.value.split('x');
      widthEl.value = parts[0];
      heightEl.value = parts[1];
    });

    $('appendPromptBtn').addEventListener('click', () => {
      const parts = [$('drawSubject').value, $('drawScene').value, $('drawLight').value, $('drawCamera').value]
        .map((v) => (v || '').trim())
        .filter(Boolean);
      if (!parts.length) return;
      promptEl.value = promptEl.value.trim() ? `${promptEl.value.trim()}, ${parts.join(', ')}` : parts.join(', ');
    });

    generateBtn.addEventListener('click', generate);
    randomBtn.addEventListener('click', () => { seedEl.value = String(Math.floor(Math.random() * 1e9)); });
    clearBtn.addEventListener('click', () => { state.lastResults = []; renderResults(); setStatus('已清空结果。'); });
    promptEl.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') generate();
    });

    copyConfigBtn.addEventListener('click', async () => {
      const payload = {
        prompt: promptEl.value.trim(),
        negative: negativeEl.value.trim(),
        model: modelEl.value,
        width: widthEl.value,
        height: heightEl.value,
        steps: stepsEl.value,
        cfg: cfgEl.value,
        sampler: samplerEl.value,
        seed: seedEl.value || '(random)'
      };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setStatus('参数已复制到剪贴板。');
    });

    downloadAllBtn.addEventListener('click', async () => {
      for (let i = 0; i < state.lastResults.length; i += 1) {
        const item = state.lastResults[i];
        try {
          const blob = await (await fetch(item.url, { cache: 'no-store' })).blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `ai-draw-${item.seed}.png`;
          a.click();
          URL.revokeObjectURL(a.href);
        } catch (_) {
          window.open(item.url, '_blank', 'noopener,noreferrer');
        }
      }
    });
  }

  function boot() {
    const host = $('aiDrawApp');
    if (!host) return;
    initAiDrawPage(host);
  }

  window.initAiDrawPage = initAiDrawPage;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
