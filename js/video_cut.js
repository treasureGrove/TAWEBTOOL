// 纯前端视频剪辑 - 不依赖 FFmpeg.wasm，使用浏览器原生 API
(function() {
  'use strict';

  function initVideoCut(host) {
    host.innerHTML = `
      <div class="video-cut-wrap">
        <p class="hint">
          <strong>🎬 视频剪辑工具</strong> - 使用浏览器原生 API，无需外部依赖<br>
          ✅ 完全本地处理 &nbsp;|&nbsp; ✅ 不上传文件 &nbsp;|&nbsp; ✅ 即开即用<br>
          <small style="opacity: 0.8">💡 支持裁剪、格式转换、截图、音频提取等功能</small>
        </p>

        <section class="vc-panel">
          <h3>📁 素材导入</h3>
          <div class="vc-row vc-files">
            <label>主视频<input data-vc="mainFile" type="file" accept="video/*,audio/*"></label>
          </div>
          <video data-vc="preview" controls playsinline class="vc-preview"></video>
          <div class="vc-meta" data-vc="meta">未选择视频文件</div>
        </section>

        <section class="vc-panel">
          <h3>⚙️ 处理模式</h3>
          
          <div class="vc-mode-grid" data-vc="modes"></div>
          
          <div class="vc-time" data-vc="timePanel" style="display:none;">
            <h4 style="margin: 10px 0 8px; font-size: 14px; color: #93c5fd;">时间范围设置</h4>
            <div class="vc-row" style="grid-template-columns: 1fr 1fr;">
              <label>开始时间（秒）<input data-vc="start" type="number" min="0" step="0.1" value="0"></label>
              <label>结束时间（秒）<input data-vc="end" type="number" min="0" step="0.1" value="0"></label>
            </div>
            <div class="vc-row" style="grid-template-columns: 1fr 1fr 1fr;">
              <button data-vc="setStart" class="secondary">▶ 开始=当前</button>
              <button data-vc="setEnd" class="secondary">⏸ 结束=当前</button>
              <button data-vc="full" class="secondary">📏 完整时长</button>
            </div>
          </div>

          <div class="vc-options" data-vc="options"></div>

          <div class="vc-row vc-actions">
            <button data-vc="export">🚀 开始处理</button>
            <button data-vc="cancel" class="danger">❌ 取消任务</button>
          </div>
          
          <div class="vc-progress" data-vc="progressWrap" style="display:none;">
            <progress data-vc="progress" value="0" max="100"></progress>
            <span data-vc="progressText">0%</span>
          </div>
          
          <pre data-vc="log" class="result-box">等待操作...</pre>
          <a data-vc="download" hidden class="btn-link">💾 下载处理后的文件</a>
        </section>
      </div>
    `;

    const q = (k) => host.querySelector(`[data-vc="${k}"]`);
    const state = { 
      video: null, 
      videoFile: null,
      mode: 'trim',
      processing: false,
      abortController: null
    };

    const modes = [
      { key: 'trim', name: '✂️ 裁剪视频', needTime: true, desc: '按时间范围裁剪' },
      { key: 'convert', name: '🔄 格式转换', needTime: false, desc: '转换为 WebM 格式' },
      { key: 'snapshot', name: '📸 视频截图', needTime: false, desc: '提取单帧为图片' },
      { key: 'audio', name: '🎵 提取音频', needTime: true, desc: '导出为音频文件' },
      { key: 'mute', name: '🔇 静音视频', needTime: true, desc: '移除音频轨道' },
      { key: 'speed', name: '⚡ 变速播放', needTime: true, desc: '加速/减速视频' }
    ];

    const modeOptions = {
      convert: `
        <h4 style="margin: 10px 0 8px; font-size: 14px; color: #93c5fd;">格式设置</h4>
        <div class="vc-row">
          <label>视频码率 (Mbps)<input data-vc-opt="videoBitrate" type="number" min="0.5" max="20" step="0.5" value="2.5"></label>
          <label>音频码率 (kbps)<input data-vc-opt="audioBitrate" type="number" min="64" max="320" step="32" value="128"></label>
        </div>
      `,
      snapshot: `
        <h4 style="margin: 10px 0 8px; font-size: 14px; color: #93c5fd;">截图设置</h4>
        <div class="vc-row">
          <label>截图时间（秒）<input data-vc-opt="snapTime" type="number" min="0" step="0.1" value="0"></label>
          <label>图片格式<select data-vc-opt="snapFormat">
            <option value="png">PNG (无损)</option>
            <option value="jpeg" selected>JPEG (压缩)</option>
            <option value="webp">WebP (高效)</option>
          </select></label>
        </div>
        <div class="vc-row">
          <label>图片质量 (0.1-1.0)<input data-vc-opt="snapQuality" type="number" min="0.1" max="1" step="0.1" value="0.92"></label>
          <button data-vc-opt="useCurrentTime" class="secondary">使用当前播放时间</button>
        </div>
      `,
      speed: `
        <h4 style="margin: 10px 0 8px; font-size: 14px; color: #93c5fd;">变速设置</h4>
        <div class="vc-row">
          <label>播放速度倍率<input data-vc-opt="speedRate" type="number" min="0.25" max="4" step="0.25" value="2"></label>
        </div>
        <p class="hint" style="margin: 8px 0 0;">提示: 0.5=慢速, 1.0=正常, 2.0=2倍速, 4.0=4倍速</p>
      `
    };

    const log = (msg, type = 'info') => {
      const box = q('log');
      const time = new Date().toLocaleTimeString();
      const icon = { info: 'ℹ️', success: '✅', error: '❌', warn: '⚠️' }[type] || 'ℹ️';
      box.textContent += `${time} ${icon} ${msg}\n`;
      box.scrollTop = box.scrollHeight;
    };

    const setProgress = (v) => {
      const n = Math.max(0, Math.min(100, Math.floor(v)));
      q('progress').value = n;
      q('progressText').textContent = `${n}%`;
      q('progressWrap').style.display = 'grid';
    };

    const getOpt = (name, fallback = '') => {
      const el = host.querySelector(`[data-vc-opt="${name}"]`);
      return el ? el.value : fallback;
    };

    // ========== 视频处理核心函数 ==========

    // 裁剪视频 - 使用 MediaRecorder API
    async function trimVideo(videoEl, startTime, endTime) {
      log('开始裁剪视频...');
      setProgress(10);

      return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;

        const stream = canvas.captureStream(30); // 30fps
        
        // 添加音频轨道
        const audioContext = new AudioContext();
        const source = audioContext.createMediaElementSource(videoEl);
        const dest = audioContext.createMediaStreamDestination();
        source.connect(dest);
        source.connect(audioContext.destination);
        
        dest.stream.getAudioTracks().forEach(track => stream.addTrack(track));

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9,opus',
          videoBitsPerSecond: 2500000
        });

        const chunks = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          audioContext.close();
          setProgress(100);
          log('裁剪完成', 'success');
          resolve(blob);
        };

        mediaRecorder.onerror = (e) => {
          audioContext.close();
          reject(e);
        };

        videoEl.currentTime = startTime;
        videoEl.ontimeupdate = () => {
          if (videoEl.currentTime >= endTime) {
            mediaRecorder.stop();
            videoEl.pause();
            videoEl.ontimeupdate = null;
            return;
          }
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          const progress = 10 + ((videoEl.currentTime - startTime) / (endTime - startTime)) * 85;
          setProgress(progress);
        };

        videoEl.onended = () => {
          mediaRecorder.stop();
          videoEl.ontimeupdate = null;
        };

        mediaRecorder.start();
        setProgress(20);
        videoEl.play();
      });
    }

    // 格式转换 - 使用 MediaRecorder
    async function convertVideo(videoEl) {
      log('开始格式转换...');
      setProgress(10);

      return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;

        const videoBitrate = parseFloat(getOpt('videoBitrate', '2.5')) * 1000000;
        const audioBitrate = parseFloat(getOpt('audioBitrate', '128')) * 1000;

        const stream = canvas.captureStream(30);
        
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') 
          ? 'video/webm;codecs=vp9,opus'
          : 'video/webm';

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: videoBitrate,
          audioBitsPerSecond: audioBitrate
        });

        const chunks = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          setProgress(100);
          log('转换完成', 'success');
          resolve(blob);
        };

        mediaRecorder.onerror = reject;

        const duration = videoEl.duration;
        videoEl.currentTime = 0;
        videoEl.ontimeupdate = () => {
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          const progress = 10 + (videoEl.currentTime / duration) * 85;
          setProgress(progress);
        };

        videoEl.onended = () => {
          mediaRecorder.stop();
          videoEl.ontimeupdate = null;
          videoEl.pause();
        };

        mediaRecorder.start();
        setProgress(20);
        videoEl.play();
      });
    }

    // 视频截图
    async function snapshotVideo(videoEl) {
      const snapTime = parseFloat(getOpt('snapTime', '0'));
      const format = getOpt('snapFormat', 'jpeg');
      const quality = parseFloat(getOpt('snapQuality', '0.92'));

      log(`在 ${snapTime.toFixed(2)} 秒处截图...`);
      setProgress(30);

      return new Promise((resolve, reject) => {
        videoEl.currentTime = snapTime;
        videoEl.onseeked = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = videoEl.videoWidth;
            canvas.height = videoEl.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            
            setProgress(70);
            
            canvas.toBlob((blob) => {
              setProgress(100);
              log('截图完成', 'success');
              resolve(blob);
            }, `image/${format}`, quality);
          } catch (err) {
            reject(err);
          }
          videoEl.onseeked = null;
        };
      });
    }

    // 提取音频
    async function extractAudio(videoEl, startTime, endTime) {
      log('开始提取音频...');
      setProgress(10);

      return new Promise((resolve, reject) => {
        const audioContext = new AudioContext();
        const source = audioContext.createMediaElementSource(videoEl);
        const dest = audioContext.createMediaStreamDestination();
        source.connect(dest);
        source.connect(audioContext.destination);

        const mediaRecorder = new MediaRecorder(dest.stream, {
          mimeType: 'audio/webm;codecs=opus'
        });

        const chunks = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          audioContext.close();
          setProgress(100);
          log('音频提取完成', 'success');
          resolve(blob);
        };

        mediaRecorder.onerror = (e) => {
          audioContext.close();
          reject(e);
        };

        videoEl.currentTime = startTime;
        videoEl.ontimeupdate = () => {
          if (videoEl.currentTime >= endTime) {
            mediaRecorder.stop();
            videoEl.pause();
            videoEl.ontimeupdate = null;
            return;
          }
          const progress = 10 + ((videoEl.currentTime - startTime) / (endTime - startTime)) * 85;
          setProgress(progress);
        };

        videoEl.onended = () => {
          mediaRecorder.stop();
          videoEl.ontimeupdate = null;
        };

        mediaRecorder.start();
        setProgress(20);
        videoEl.play();
      });
    }

    // 静音视频
    async function muteVideo(videoEl, startTime, endTime) {
      log('开始生成静音视频...');
      setProgress(10);

      return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;

        const stream = canvas.captureStream(30);
        
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9',
          videoBitsPerSecond: 2500000
        });

        const chunks = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          setProgress(100);
          log('静音视频生成完成', 'success');
          resolve(blob);
        };

        mediaRecorder.onerror = reject;

        videoEl.muted = true;
        videoEl.currentTime = startTime;
        videoEl.ontimeupdate = () => {
          if (videoEl.currentTime >= endTime) {
            mediaRecorder.stop();
            videoEl.pause();
            videoEl.muted = false;
            videoEl.ontimeupdate = null;
            return;
          }
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          const progress = 10 + ((videoEl.currentTime - startTime) / (endTime - startTime)) * 85;
          setProgress(progress);
        };

        videoEl.onended = () => {
          mediaRecorder.stop();
          videoEl.muted = false;
          videoEl.ontimeupdate = null;
        };

        mediaRecorder.start();
        setProgress(20);
        videoEl.play();
      });
    }

    // 变速视频 (注意：这只能用canvas重新渲染，实际效果有限)
    async function speedVideo(videoEl, startTime, endTime) {
      const speedRate = parseFloat(getOpt('speedRate', '2'));
      log(`开始生成 ${speedRate}x 变速视频...`);
      setProgress(10);

      return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;

        const targetFps = 30;
        const stream = canvas.captureStream(targetFps);
        
        const audioContext = new AudioContext();
        const source = audioContext.createMediaElementSource(videoEl);
        const dest = audioContext.createMediaStreamDestination();
        source.connect(dest);
        source.connect(audioContext.destination);
        
        dest.stream.getAudioTracks().forEach(track => stream.addTrack(track));

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9,opus',
          videoBitsPerSecond: 2500000
        });

        const chunks = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          audioContext.close();
          videoEl.playbackRate = 1.0;
          setProgress(100);
          log('变速视频生成完成', 'success');
          resolve(blob);
        };

        mediaRecorder.onerror = (e) => {
          audioContext.close();
          videoEl.playbackRate = 1.0;
          reject(e);
        };

        videoEl.playbackRate = speedRate;
        videoEl.currentTime = startTime;
        
        const realDuration = (endTime - startTime) / speedRate;
        let recordStartTime = Date.now();
        
        videoEl.ontimeupdate = () => {
          if (videoEl.currentTime >= endTime) {
            mediaRecorder.stop();
            videoEl.pause();
            videoEl.ontimeupdate = null;
            return;
          }
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          const elapsed = (Date.now() - recordStartTime) / 1000;
          const progress = 10 + (elapsed / realDuration) * 85;
          setProgress(Math.min(progress, 95));
        };

        videoEl.onended = () => {
          mediaRecorder.stop();
          videoEl.ontimeupdate = null;
        };

        mediaRecorder.start();
        setProgress(20);
        videoEl.play();
      });
    }

    // ========== UI 事件处理 ==========

    function renderModes() {
      const modeHost = q('modes');
      modeHost.innerHTML = modes.map((m) => `
        <label class="vc-mode ${state.mode === m.key ? 'active' : ''}" data-mode="${m.key}" title="${m.desc}">
          <input type="radio" name="vcMode" value="${m.key}" ${state.mode === m.key ? 'checked' : ''}>
          ${m.name}
        </label>
      `).join('');

      modeHost.querySelectorAll('.vc-mode').forEach((el) => {
        el.addEventListener('click', () => {
          state.mode = el.dataset.mode;
          renderModes();
          updateUI();
        });
      });
    }

    function updateUI() {
      const mode = modes.find(m => m.key === state.mode);
      q('timePanel').style.display = mode.needTime ? 'block' : 'none';
      q('options').innerHTML = modeOptions[state.mode] || '';
      
      // 添加"使用当前播放时间"按钮事件
      const useCurrentBtn = host.querySelector('[data-vc-opt="useCurrentTime"]');
      if (useCurrentBtn && state.video) {
        useCurrentBtn.addEventListener('click', () => {
          const input = host.querySelector('[data-vc-opt="snapTime"]');
          if (input) {
            input.value = state.video.currentTime.toFixed(2);
            log(`已设置截图时间为: ${input.value} 秒`);
          }
        });
      }
    }

    // 文件选择
    q('mainFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      state.videoFile = file;
      const videoEl = q('preview');
      videoEl.src = URL.createObjectURL(file);
      
      q('meta').textContent = `📹 ${file.name} | ${(file.size / (1024 * 1024)).toFixed(2)} MB`;
      
      videoEl.onloadedmetadata = () => {
        state.video = videoEl;
        q('start').value = '0';
        q('end').value = videoEl.duration.toFixed(2);
        log(`视频加载成功: ${videoEl.videoWidth}x${videoEl.videoHeight}, 时长 ${videoEl.duration.toFixed(2)}秒`, 'success');
      };
    });

    // 时间控制按钮
    q('setStart').addEventListener('click', () => {
      if (!state.video) return;
      q('start').value = state.video.currentTime.toFixed(2);
      log(`起始时间已设置为: ${state.video.currentTime.toFixed(2)}秒`);
    });

    q('setEnd').addEventListener('click', () => {
      if (!state.video) return;
      q('end').value = state.video.currentTime.toFixed(2);
      log(`结束时间已设置为: ${state.video.currentTime.toFixed(2)}秒`);
    });

    q('full').addEventListener('click', () => {
      if (!state.video) return;
      q('start').value = '0';
      q('end').value = state.video.duration.toFixed(2);
      log('已设置为完整时长');
    });

    // 开始处理
    q('export').addEventListener('click', async () => {
      if (state.processing) {
        log('已有任务在处理中...', 'warn');
        return;
      }

      if (!state.video) {
        log('请先选择视频文件', 'error');
        return;
      }

      state.processing = true;
      state.abortController = new AbortController();
      q('download').hidden = true;
      q('progressWrap').style.display = 'grid';
      setProgress(0);

      try {
        let blob, filename, ext;
        const videoEl = state.video;
        const startTime = parseFloat(q('start').value || '0');
        const endTime = parseFloat(q('end').value || videoEl.duration);

        // 验证时间范围
        if (startTime >= endTime) {
          throw new Error('开始时间必须小于结束时间');
        }

        switch (state.mode) {
          case 'trim':
            blob = await trimVideo(videoEl, startTime, endTime);
            filename = `trimmed_${Date.now()}.webm`;
            break;
          
          case 'convert':
            blob = await convertVideo(videoEl);
            filename = `converted_${Date.now()}.webm`;
            break;
          
          case 'snapshot':
            blob = await snapshotVideo(videoEl);
            ext = getOpt('snapFormat', 'jpeg');
            filename = `snapshot_${Date.now()}.${ext}`;
            break;
          
          case 'audio':
            blob = await extractAudio(videoEl, startTime, endTime);
            filename = `audio_${Date.now()}.webm`;
            break;
          
          case 'mute':
            blob = await muteVideo(videoEl, startTime, endTime);
            filename = `muted_${Date.now()}.webm`;
            break;
          
          case 'speed':
            blob = await speedVideo(videoEl, startTime, endTime);
            filename = `speed_${Date.now()}.webm`;
            break;
          
          default:
            throw new Error('未知的处理模式');
        }

        // 创建下载链接
        const url = URL.createObjectURL(blob);
        const dl = q('download');
        dl.href = url;
        dl.download = filename;
        dl.textContent = `💾 下载 ${filename} (${(blob.size / (1024 * 1024)).toFixed(2)} MB)`;
        dl.hidden = false;
        
        log(`处理完成！文件大小: ${(blob.size / (1024 * 1024)).toFixed(2)} MB`, 'success');
        
      } catch (err) {
        log(`处理失败: ${err.message}`, 'error');
        console.error(err);
      } finally {
        state.processing = false;
        state.abortController = null;
        // 重置视频状态
        if (state.video) {
          state.video.pause();
          state.video.currentTime = 0;
          state.video.ontimeupdate = null;
          state.video.onended = null;
        }
      }
    });

    // 取消任务
    q('cancel').addEventListener('click', () => {
      if (!state.processing) {
        log('当前没有进行中的任务', 'warn');
        return;
      }
      
      if (state.abortController) {
        state.abortController.abort();
      }
      
      if (state.video) {
        state.video.pause();
        state.video.currentTime = 0;
        state.video.ontimeupdate = null;
        state.video.onended = null;
      }
      
      state.processing = false;
      q('progressWrap').style.display = 'none';
      log('任务已取消', 'warn');
    });

    // 初始化
    renderModes();
    updateUI();
    log('视频剪辑工具已就绪，请选择视频文件开始', 'success');
  }

  // 导出到全局
  window.initVideoCutNative = initVideoCut;
})();
