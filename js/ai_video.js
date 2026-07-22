(function () {
  function $(id) { return document.getElementById(id); }

  const POLL_INTERVAL = 5000;
  const MAX_POLLS = 60;
  const TASK_KEY = 'tool-ai-video-tasks';

  function loadTasks() {
    try { return JSON.parse(localStorage.getItem(TASK_KEY) || '[]'); }
    catch (_) { return []; }
  }
  function saveTasks(tasks) { localStorage.setItem(TASK_KEY, JSON.stringify(tasks)); }

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
          <div id="taskList" class="task-list"></div>
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
    const taskList = $('taskList');
    const storeKey = 'tool-ai-video-history';
    let pending = false;
    let pollTimers = {};
    let history = [];
    let tasks = [];

    function loadHistory() {
      try { history = JSON.parse(localStorage.getItem(storeKey) || '[]'); } catch (_) { history = []; }
      if (!Array.isArray(history)) history = [];
      renderGallery();
    }
    function saveHistory() { localStorage.setItem(storeKey, JSON.stringify(history)); renderGallery(); }

    function renderGallery() {
      if (history.length === 0) { gallery.innerHTML = ''; return; }
      gallery.innerHTML = history.map((item, i) => `
        <div class="gallery-item video-item" data-index="${i}">
          <div class="video-thumb"><div class="video-play-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="white"><polygon points="5,3 19,12 5,21"/></svg></div></div>
          <div class="gallery-item-prompt">${item.prompt || ''}</div>
          <div class="gallery-item-time">${item.time || ''}</div>
        </div>
      `).join('');
      gallery.querySelectorAll('.gallery-item').forEach(item => {
        item.addEventListener('click', () => {
          const idx = parseInt(item.dataset.index);
          if (history[idx]?.url) showResult(history[idx].url, history[idx].prompt);
        });
      });
    }

    function renderTasks() {
      if (tasks.length === 0) { taskList.innerHTML = ''; return; }
      taskList.innerHTML = '<div class="task-header">进行中</div>' + tasks.map((t, i) => `
        <div class="task-item ${t.status === 'done' ? 'task-done' : ''}">
          <span class="task-dot ${t.status === 'processing' ? 'task-dot-active' : 'task-dot-done'}"></span>
          <span class="task-prompt">${t.prompt}</span>
          ${t.status === 'done' ? '<span class="task-check">\u2713</span>' : `<span class="task-timer">${t.elapsed || 0}s</span>`}
        </div>
      `).join('');
    }

    function showResult(url, prompt) {
      resultArea.innerHTML = `
        <div class="ai-image-display">
          <video src="${url}" controls autoplay loop playsinline style="width:100%;max-height:58vh;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.1);background:#000"></video>
          <div class="ai-image-prompt">${prompt || ''}</div>
        </div>
      `;
    }
    function showError(msg) { resultArea.innerHTML = `<div class="ai-image-error">${msg}</div>`; }
    function showLoading(msg) { resultArea.innerHTML = `<div class="ai-image-loading"><span class="typing-dot">●</span><span class="typing-dot">●</span><span class="typing-dot">●</span><p>${msg}</p></div>`; }
    function updateButtonState() { generateBtn.disabled = pending || !promptInput.value.trim(); }

    function markTaskDone(taskId, url) {
      tasks = tasks.map(t => t.id === taskId ? { ...t, status: 'done', url } : t);
      saveTasks(tasks);
      renderTasks();
    }

    async function pollTask(taskId, prompt) {
      let polled = tasks.find(t => t.id === taskId)?.elapsed || 0;
      return new Promise((resolve, reject) => {
        const timer = setInterval(async () => {
          polled++;
          tasks = tasks.map(t => t.id === taskId ? { ...t, elapsed: polled } : t);
          saveTasks(tasks);
          renderTasks();

          if (polled > MAX_POLLS) { clearInterval(timer); delete pollTimers[taskId]; reject(new Error('超时')); return; }

          try {
            const res = await fetch(`/api/video/status/${taskId}`);
            const data = await res.json().catch(() => ({}));
            if (data.task_status === 'SUCCESS') {
              clearInterval(timer); delete pollTimers[taskId];
              const url = data.video_result?.[0]?.url;
              if (url) { markTaskDone(taskId, url); resolve(url); }
              else { reject(new Error('未获取到链接')); }
            } else if (data.task_status === 'FAIL' || data.task_status === 'FAILED') {
              clearInterval(timer); delete pollTimers[taskId];
              tasks = tasks.filter(t => t.id !== taskId);
              saveTasks(tasks); renderTasks();
              reject(new Error(data.error?.message || '生成失败'));
            }
          } catch (err) {
            clearInterval(timer); delete pollTimers[taskId];
            reject(new Error('查询失败'));
          }
        }, POLL_INTERVAL);
        pollTimers[taskId] = timer;
      });
    }

    async function generate() {
      if (pending) return;
      const prompt = promptInput.value.trim();
      if (!prompt) return;
      pending = true;
      updateButtonState();
      showLoading('正在提交...');

      try {
        const submitRes = await fetch('/api/video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
        const submitData = await submitRes.json().catch(() => ({}));
        if (!submitRes.ok) throw new Error(submitData?.error?.message || `HTTP ${submitRes.status}`);
        const taskId = submitData.id;
        if (!taskId) throw new Error('未获取到任务ID');

        tasks.push({ id: taskId, prompt, status: 'processing', elapsed: 0 });
        saveTasks(tasks);
        renderTasks();
        showLoading('正在生成...');
        pending = false;
        updateButtonState();

        const videoUrl = await pollTask(taskId, prompt);
        showResult(videoUrl, prompt);
        history.unshift({ url: videoUrl, prompt, time: new Date().toLocaleString('zh-CN') });
        if (history.length > 10) history = history.slice(0, 10);
        saveHistory();

        tasks = tasks.filter(t => t.id !== taskId);
        saveTasks(tasks);
        renderTasks();
      } catch (err) {
        showError(`生成失败：${err.message}`);
        pending = false;
        updateButtonState();
      }
    }

    function resumeTasks() {
      tasks = loadTasks();
      renderTasks();
      const pendingTasks = tasks.filter(t => t.status === 'processing');
      pendingTasks.forEach(t => {
        showLoading(`恢复生成: ${t.prompt}`);
        pollTask(t.id, t.prompt).then(url => {
          if (!history.find(h => h.url === url)) {
            history.unshift({ url, prompt: t.prompt, time: new Date().toLocaleString('zh-CN') });
            if (history.length > 10) history = history.slice(0, 10);
            saveHistory();
          }
          tasks = tasks.filter(task => task.id !== t.id);
          saveTasks(tasks);
          renderTasks();
          showResult(url, t.prompt);
        }).catch(() => {
          showError('任务恢复失败');
          tasks = tasks.filter(task => task.id !== t.id);
          saveTasks(tasks);
          renderTasks();
        });
      });
      if (pendingTasks.length === 0 && tasks.length > 0) {
        tasks = [];
        saveTasks(tasks);
        renderTasks();
      }
    }

    generateBtn.addEventListener('click', generate);
    promptInput.addEventListener('input', updateButtonState);
    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); generate(); }
    });

    loadHistory();
    resumeTasks();
    updateButtonState();
  }

  window.initAiVideoTool = initAiVideoTool;
})();
