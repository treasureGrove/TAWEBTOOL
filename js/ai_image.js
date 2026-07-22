(function () {
  function $(id) { return document.getElementById(id); }

  function initAiImageTool(host) {
    host.innerHTML = `
      <div class="ai-image-tool">
        <div class="ai-image-sidebar">
          <div class="ai-image-header">
            <h2>AI 通用生图</h2>
            <p>输入描述，AI 生成图片 · Cogview-3-Flash</p>
          </div>
          <div class="ai-image-input-area">
            <textarea id="imagePrompt" placeholder="描述你想生成的图片，例如：一只坐在窗台上的橘猫，阳光洒在它身上，温馨治愈风格" rows="4"></textarea>
            <button id="generateBtn" type="button" class="generate-btn">
              <svg viewBox="0 0 20 20" aria-hidden="true" width="16" height="16">
                <path d="M18 3l-3 14-5-4-3 3V7l11-4z" fill="currentColor"/>
              </svg>
              生成图片
            </button>
          </div>
          <div id="taskList" class="task-list"></div>
          <div id="imageGallery" class="ai-image-gallery"></div>
        </div>
        <div class="ai-image-main">
          <div class="ai-image-result-header">生成结果</div>
          <div id="imageResult" class="ai-image-result">
            <div class="ai-image-empty">
              <div class="ai-image-empty-icon">
                <svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
                  <rect x="8" y="12" width="48" height="40" rx="4"/>
                  <circle cx="22" cy="28" r="5"/>
                  <path d="M8 44l10-10 8 8 12-12 18 14"/>
                </svg>
              </div>
              <p>点击"生成图片"查看结果</p>
            </div>
          </div>
        </div>
      </div>
    `;

    const promptInput = $('imagePrompt');
    const generateBtn = $('generateBtn');
    const resultArea = $('imageResult');
    const gallery = $('imageGallery');
    const taskList = $('taskList');
    const storeKey = 'tool-ai-image-history';
    let pending = false;
    let history = [];

    function loadHistory() { try { history = JSON.parse(localStorage.getItem(storeKey) || '[]'); } catch (_) { history = []; } renderGallery(); }
    function saveHistory() { localStorage.setItem(storeKey, JSON.stringify(history)); renderGallery(); }

    function renderGallery() {
      if (history.length === 0) { gallery.innerHTML = ''; return; }
      gallery.innerHTML = history.map((item, i) => `
        <div class="gallery-item" data-index="${i}">
          <img src="${item.url}" alt="${item.prompt}" loading="lazy">
          <div class="gallery-item-prompt">${item.prompt}</div>
          <div class="gallery-item-time">${item.time}</div>
        </div>
      `).join('');
      gallery.querySelectorAll('.gallery-item').forEach(item => {
        item.addEventListener('click', () => {
          const idx = parseInt(item.dataset.index);
          if (history[idx]) showResult(history[idx].url, history[idx].prompt);
        });
      });
    }

    function showResult(url, prompt) {
      resultArea.innerHTML = `
        <div class="ai-image-display">
          <img src="${url}" alt="${prompt}">
          <div class="ai-image-prompt">${prompt}</div>
          <button class="ghost-btn" id="downloadBtn">下载图片</button>
        </div>
      `;
      $('downloadBtn').addEventListener('click', async () => {
        try {
          const blob = await fetch(url).then(r => r.blob());
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = 'ai-generated.png'; a.click();
          URL.revokeObjectURL(a.href);
        } catch (_) {}
      });
    }

    function showError(msg) { resultArea.innerHTML = `<div class="ai-image-error">${msg}</div>`; }
    function showLoading() { resultArea.innerHTML = '<div class="ai-image-loading"><span class="typing-dot">●</span><span class="typing-dot">●</span><span class="typing-dot">●</span><p>正在生成...</p></div>'; }
    function updateButtonState() { generateBtn.disabled = pending || !promptInput.value.trim(); }

    function showTask(prompt) {
      taskList.innerHTML = `<div class="task-header">进行中</div><div class="task-item"><span class="task-dot task-dot-active"></span><span class="task-prompt">${prompt}</span></div>`;
    }
    function clearTasks() { taskList.innerHTML = ''; }

    async function generate() {
      if (pending) return;
      const prompt = promptInput.value.trim();
      if (!prompt) return;

      pending = true;
      updateButtonState();
      showLoading();
      showTask(prompt);

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);
        const res = await fetch('/api/image', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }), signal: controller.signal,
        });
        clearTimeout(timeout);

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);

        const imageUrl = data?.data?.[0]?.url;
        if (!imageUrl) throw new Error('未获取到图片');

        showResult(imageUrl, prompt);
        history.unshift({ url: imageUrl, prompt, time: new Date().toLocaleString('zh-CN') });
        if (history.length > 20) history = history.slice(0, 20);
        saveHistory();
        clearTasks();
      } catch (err) {
        const msg = err?.name === 'AbortError' ? '生成超时，请重试' : `生成失败：${err.message}`;
        showError(msg);
        clearTasks();
      } finally {
        pending = false;
        updateButtonState();
      }
    }

    generateBtn.addEventListener('click', generate);
    promptInput.addEventListener('input', updateButtonState);
    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); generate(); }
    });

    loadHistory();
    updateButtonState();
  }

  window.initAiImageTool = initAiImageTool;
})();
