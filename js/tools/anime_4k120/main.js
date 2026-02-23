(() => {
  const els = {
    videoInput: document.getElementById('videoInput'),
    videoMeta: document.getElementById('videoMeta'),
    initModelBtn: document.getElementById('initModelBtn'),
    clearCacheBtn: document.getElementById('clearCacheBtn'),
    modelStatus: document.getElementById('modelStatus'),
    startBtn: document.getElementById('startBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    cancelBtn: document.getElementById('cancelBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    tileSize: document.getElementById('tileSize'),
    overlap: document.getElementById('overlap'),
    sharpen: document.getElementById('sharpen'),
    subtitleProtect: document.getElementById('subtitleProtect'),
    deflicker: document.getElementById('deflicker'),
    sharpenValue: document.getElementById('sharpenValue'),
    subtitleProtectValue: document.getElementById('subtitleProtectValue'),
    deflickerValue: document.getElementById('deflickerValue'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),
    etaText: document.getElementById('etaText'),
    stageStats: document.getElementById('stageStats'),
    logPanel: document.getElementById('logPanel')
  };

  let worker = null;
  let file = null;

  function log(msg) {
    const ts = new Date().toLocaleTimeString();
    els.logPanel.textContent += `[${ts}] ${msg}\n`;
    els.logPanel.scrollTop = els.logPanel.scrollHeight;
  }

  function setSliderValue(slider, label) {
    label.textContent = Number(slider.value).toFixed(2);
    slider.addEventListener('input', () => (label.textContent = Number(slider.value).toFixed(2)));
  }
  setSliderValue(els.sharpen, els.sharpenValue);
  setSliderValue(els.subtitleProtect, els.subtitleProtectValue);
  setSliderValue(els.deflicker, els.deflickerValue);

  function ensureWorker() {
    if (worker) return;
    worker = new Worker('../js/tools/anime_4k120/worker.js');
    worker.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === 'log') log(payload);
      if (type === 'model-ready') {
        els.modelStatus.textContent = `模型已就绪（${payload.provider}）`;
        els.startBtn.disabled = !file;
      }
      if (type === 'progress') {
        els.progressFill.style.width = `${payload.progress}%`;
        els.progressText.textContent = payload.text;
        els.etaText.textContent = `预计剩余时间：${payload.eta}`;
      }
      if (type === 'stage-stats') {
        els.stageStats.textContent = `耗时(ms) 解码:${payload.decode} 超分:${payload.upscale} 插帧x2:${payload.interp} 去闪烁:${payload.post} 编码:${payload.encode}`;
      }
      if (type === 'done') {
        const url = URL.createObjectURL(payload.blob);
        els.downloadBtn.href = url;
        els.downloadBtn.classList.remove('disabled');
        els.startBtn.disabled = false;
        els.pauseBtn.disabled = true;
        els.cancelBtn.disabled = true;
        log('处理完成，已生成可下载文件。');
      }
      if (type === 'error') {
        log(`错误: ${payload}`);
      }
    };
  }

  els.videoInput.addEventListener('change', async () => {
    file = els.videoInput.files[0] || null;
    if (!file) return;
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.src = URL.createObjectURL(file);
    await new Promise((r) => (v.onloadedmetadata = r));
    els.videoMeta.textContent = `输入: ${v.videoWidth}x${v.videoHeight} | 时长: ${v.duration.toFixed(2)}s | 文件: ${(file.size / 1024 / 1024).toFixed(1)}MB`;
    els.startBtn.disabled = els.modelStatus.textContent.includes('就绪') ? false : true;
  });

  els.initModelBtn.addEventListener('click', () => {
    ensureWorker();
    els.modelStatus.textContent = '模型加载中...';
    worker.postMessage({ type: 'init-models', payload: { models: self.ANIME_4K120_MODELS } });
  });

  els.clearCacheBtn.addEventListener('click', () => {
    ensureWorker();
    worker.postMessage({ type: 'clear-cache' });
    log('已请求清除模型缓存。');
  });

  els.startBtn.addEventListener('click', async () => {
    if (!file) return;
    ensureWorker();
    const buffer = await file.arrayBuffer();
    els.downloadBtn.classList.add('disabled');
    worker.postMessage({
      type: 'start',
      payload: {
        fileName: file.name,
        fileBuffer: buffer,
        options: {
          targetWidth: 3840,
          targetHeight: 2160,
          targetFps: 120,
          tile: Number(els.tileSize.value),
          overlap: Number(els.overlap.value),
          sharpen: Number(els.sharpen.value),
          subtitleProtect: Number(els.subtitleProtect.value),
          deflicker: Number(els.deflicker.value)
        }
      }
    }, [buffer]);
    els.startBtn.disabled = true;
    els.pauseBtn.disabled = false;
    els.cancelBtn.disabled = false;
  });

  els.pauseBtn.addEventListener('click', () => {
    ensureWorker();
    const pausing = els.pauseBtn.textContent === '暂停';
    worker.postMessage({ type: pausing ? 'pause' : 'resume' });
    els.pauseBtn.textContent = pausing ? '继续' : '暂停';
  });

  els.cancelBtn.addEventListener('click', () => {
    ensureWorker();
    worker.postMessage({ type: 'cancel' });
    els.startBtn.disabled = false;
    els.pauseBtn.disabled = true;
    els.cancelBtn.disabled = true;
    els.pauseBtn.textContent = '暂停';
  });
})();
