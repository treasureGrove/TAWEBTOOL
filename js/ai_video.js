(function () {
  function $(id) { return document.getElementById(id); }

  const POLL_INTERVAL = 5000;
  const MAX_POLLS = 60;

  function initAiVideoTool(host) {
    host.innerHTML = `
      <div class="ai-image-tool">
        <div class="ai-image-sidebar">
          <div class="ai-image-header">
            <h2>AI 生视频</h2>
            <p>输入描述，AI 生成短视频 · CogVideoX-Flash</p>
          </div>
          <div class="ai-image-input-area">
            <textarea id="videoPrompt" placeholder="描述你想生成的视频，例如：一只小猫在阳光下追逐蝴蝶，慢镜头" rows="4"></textarea>
            <button id="generateBtn" type="button" class="generate-btn">
              <svg viewBox="0 0 20 20" aria-hidden="true" width="16" height="16">
                <path d="M6 3l12 7-12 7V3z" fill="currentColor"/>
              </svg>
              生成视频
            </button>
          </div>
          <div id="videoGallery" class="ai-image-gallery video-gallery"></div>
        </div>
        <div class="ai-image-main">
          <div class="ai-image-result-header">生成结果</div>
          <div id="videoResult" class="ai-image-result">
            <div class="ai-image-empty">
              <div class="ai-image-empty-icon">
                <svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
                  <rect x="6" y="14" width="52" height="36" rx="4"/>
                  <polygon points="24,22 24,42 42,32"/>
                </svg>
              </div>
              <p>点击"生成视频"查看结果</p>
            </div>
          </div>
        </div>
      </div>
    `;

    const promptInput = $('videoPrompt');
    const generateBtn = $('generateBtn');
    const resultArea = $('videoResult');
    const gallery = $('videoGallery');
    const storeKey = 'tool-ai-video-history';
    let pending = false;
    let pollTimer = null;
    let history = [];

    function loadHistory() {
      try { history = JSON.parse(localStorage.getItem(storeKey) || '[]'); } catch (_) { history = []; }
      if (!Array.isArray(history)) history = [];
      renderGallery();
    }

    function saveHistory() {
      localStorage.setItem(storeKey, JSON.stringify(history));
      renderGallery();
    }

    function renderGallery() {
      if (history.length === 0) { gallery.innerHTML = ''; return; }
      gallery.innerHTML = history.map((item, i) => `
        <div class="gallery-item video-item" data-index="${i}">
          <div class="video-thumb">
            <div class="video-play-icon">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
            </div>
          </div>
          <div class="gallery-item-prompt">${item.prompt || ''}</div>
          <div class="gallery-item-time">${item.time || ''}</div>
        </div>
      `).join('');
      gallery.querySelectorAll('.gallery-item').forEach(item => {
        item.addEventListener('click', () => {
          const idx = parseInt(item.dataset.index);
          const vid = history[idx];
          if (vid && vid.url) showResult(vid.url, vid.prompt);
        });
      });
    }

    function showResult(url, prompt) {
      resultArea.innerHTML = `
        <div class="ai-image-display">
          <video src="${url}" controls autoplay loop playsinline style="width:100%;max-height:65vh;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.1);background:#000"></video>
          <div class="ai-image-prompt">${prompt || ''}</div>
        </div>
      `;
    }

    function showError(msg) {
      resultArea.innerHTML = `<div class="ai-image-error">${msg}</div>`;
    }

    function showLoading(msg) {
      resultArea.innerHTML = `<div class="ai-image-loading"><span class="typing-dot">●</span><span class="typing-dot">●</span><span class="typing-dot">●</span><p>${msg}</p></div>`;
    }

    function updateButtonState() {
      generateBtn.disabled = pending || !promptInput.value.trim();
    }

    async function pollStatus(taskId, prompt) {
      let polled = 0;
      return new Promise((resolve, reject) => {
        pollTimer = setInterval(async () => {
          polled++;
          if (polled > MAX_POLLS) {
            clearInterval(pollTimer);
            reject(new Error('视频生成超时，请重试'));
            return;
          }
          try {
            const res = await fetch(`/api/video/status/${taskId}`);
            const data = await res.json().catch(() => ({}));
            showLoading(`正在生成视频... ${Math.floor(polled * POLL_INTERVAL / 1000)}s`);
            if (data.task_status === 'SUCCESS') {
              clearInterval(pollTimer);
              const videoUrl = data.video_result?.[0]?.url;
              if (videoUrl) resolve(videoUrl);
              else reject(new Error('生成完成但未获取到视频链接'));
            } else if (data.task_status === 'FAIL' || data.task_status === 'FAILED') {
              clearInterval(pollTimer);
              reject(new Error(data.error?.message || '视频生成失败'));
            }
          } catch (err) {
            clearInterval(pollTimer);
            reject(new Error('状态查询失败：' + err.message));
          }
        }, POLL_INTERVAL);
      });
    }

    async function generate() {
      if (pending) return;
      const prompt = promptInput.value.trim();
      if (!prompt) return;

      pending = true;
      updateButtonState();
      showLoading('正在提交任务...');

      try {
        const submitRes = await fetch('/api/video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        });
        const submitData = await submitRes.json().catch(() => ({}));
        if (!submitRes.ok) throw new Error(submitData?.error?.message || `HTTP ${submitRes.status}`);

        const taskId = submitData.id;
        if (!taskId) throw new Error('未获取到任务ID');

        showLoading('正在生成视频...');
        const videoUrl = await pollStatus(taskId, prompt);

        showResult(videoUrl, prompt);
        history.unshift({ url: videoUrl, prompt, time: new Date().toLocaleString('zh-CN') });
        if (history.length > 10) history = history.slice(0, 10);
        saveHistory();
      } catch (err) {
        clearInterval(pollTimer);
        showError(`生成失败：${err.message}`);
      } finally {
        pending = false;
        updateButtonState();
      }
    }

    generateBtn.addEventListener('click', generate);
    promptInput.addEventListener('input', updateButtonState);
    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        generate();
      }
    });

    loadHistory();
    updateButtonState();
  }

  window.initAiVideoTool = initAiVideoTool;
})();
