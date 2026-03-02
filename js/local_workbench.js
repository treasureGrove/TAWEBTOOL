(function () {
  function $(id) { return document.getElementById(id); }

  const toolMeta = {
    chatgpt: { title: 'AI 对话助手', intro: '免登录开箱即用：直接在当前页面与 AI 进行多轮对话。' },
    hdr_editor: { title: 'HDR 编辑器', intro: '参考 DesignTool 的工作流：优先在线工具，附带本地快速调色。' },
    physics_light: { title: '物理光照计算器', intro: 'EV100 与曝光参数快速换算。' },
    shader_library: { title: 'Shader 函数库', intro: '常用 GLSL 片段检索与复制。' },
    model_previewer: { title: '模型预览器', intro: '本地 GLB/GLTF 预览（CDN: model-viewer）。' },
    ps_online: { title: '在线 PS', intro: '开箱即用 Photopea。' },
    video_cut: { title: '视频剪辑工作台', intro: '基于开源 FFmpeg.wasm 的浏览器本地剪辑与多模式导出。' }
  };

  const designToolLinks = {
    hdr_editor: 'https://designtool.site/hdr',
    ai_frame_interpolation: 'https://designtool.site',
    pbr_texture_generator: 'https://designtool.site',
    video_format_cover: 'https://designtool.site'
  };

  function saveTextFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function buildBase(panel) {
    panel.innerHTML = `
      <div class="tool-shell">
        <section id="toolMain" class="card"></section>
      </div>
    `;

    return $('toolMain');
  }

  function renderDesignToolSection(host, url) {
    host.innerHTML = `
      <div class="tool-actions">
        <a class="btn-link" href="${url}" target="_blank" rel="noopener noreferrer">打开 DesignTool 页面</a>
      </div>
      <p class="hint">若下方内嵌被浏览器策略拦截，请直接点击上方按钮在新标签页打开。</p>
      <iframe class="tool-iframe" src="${url}" referrerpolicy="no-referrer"></iframe>
    `;
  }

  function initHDR(host) {
    if (typeof window.initHdrEditorTool === 'function') {
      return window.initHdrEditorTool(host);
    }

    host.innerHTML = `
      <p class="hint">HDR 编辑器脚本未加载，请检查本地脚本是否存在：js/hdr_editor.js。</p>
      <div class="result-box">当前页面仅支持本地 HDR 编辑，不再回退到外部在线页面。</div>
    `;
  }



  function initPhysics(host) {
    host.innerHTML = `
      <div class="calc-grid">
        <label>光圈 f<input id="fStop" type="number" step="0.1" value="2.8"></label>
        <label>快门(秒)<input id="shutter" type="number" step="0.001" value="0.0167"></label>
        <label>ISO<input id="iso" type="number" step="1" value="100"></label>
      </div>
      <button id="calcEv">计算 EV</button>
      <pre id="calcOut" class="result-box">等待计算...</pre>
    `;

    $('calcEv').addEventListener('click', () => {
      const N = parseFloat($('fStop').value);
      const t = parseFloat($('shutter').value);
      const iso = parseFloat($('iso').value);
      const ev100 = Math.log2((N * N) / t);
      const ev = ev100 - Math.log2(iso / 100);
      $('calcOut').textContent = `EV100: ${ev100.toFixed(2)}\n当前 ISO EV: ${ev.toFixed(2)}`;
    });
  }

  function initShaderLibrary(host) {
    const snippets = [
      { name: 'saturate', code: 'float saturate(float x){ return clamp(x, 0.0, 1.0); }' },
      { name: 'remap', code: 'float remap(float x,float a,float b,float c,float d){ return (x-a)/(b-a)*(d-c)+c; }' },
      { name: 'fresnelSchlick', code: 'vec3 fresnelSchlick(float cosTheta, vec3 F0){ return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0); }' }
    ];

    host.innerHTML = `<input id="shaderSearch" placeholder="搜索函数名..." /><div id="shaderList"></div>`;
    const list = $('shaderList');
    function render(q) {
      const k = (q || '').toLowerCase();
      list.innerHTML = snippets
        .filter((s) => s.name.toLowerCase().includes(k))
        .map((s) => `<div class="snippet"><strong>${s.name}</strong><pre>${s.code}</pre><button data-code="${encodeURIComponent(s.code)}">复制</button></div>`)
        .join('');
      list.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => navigator.clipboard.writeText(decodeURIComponent(btn.dataset.code)));
      });
    }
    $('shaderSearch').addEventListener('input', (e) => render(e.target.value));
    render('');
  }

  function initModelPreview(host) {
    host.innerHTML = `
      <script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>
      <input id="modelFile" type="file" accept=".glb,.gltf" />
      <model-viewer id="mv" camera-controls auto-rotate style="width:100%;height:520px;background:#0f172a;border-radius:12px;"></model-viewer>
    `;

    $('modelFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      $('mv').src = URL.createObjectURL(file);
    });
  }

  function initPsOnline(host) {
    host.innerHTML = `<iframe class="tool-iframe" src="https://www.photopea.com/" referrerpolicy="no-referrer"></iframe>`;
  }


  function initVideoCut(host) {
    host.innerHTML = `
      <div class="video-cut-wrap">
        <p class="hint">基于开源 <strong>FFmpeg.wasm</strong>（ffmpegwasm/ffmpeg.wasm）的视频处理工作台。处理在本地浏览器完成，不上传素材。</p>

        <section class="vc-panel">
          <h3>素材与轨道</h3>
          <div class="vc-row vc-files">
            <label>主视频<input data-vc="mainFile" type="file" accept="video/*,audio/*"></label>
            <label>拼接片段1<input data-vc="concat1" type="file" accept="video/*"></label>
            <label>拼接片段2<input data-vc="concat2" type="file" accept="video/*"></label>
            <label>字幕文件(.srt)<input data-vc="subtitleFile" type="file" accept=".srt,text/plain"></label>
          </div>
          <video data-vc="preview" controls playsinline class="vc-preview"></video>
          <div class="vc-meta" data-vc="meta">未选择主素材</div>
        </section>

        <section class="vc-panel">
          <h3>时间与导出模式</h3>
          <div class="vc-row vc-time">
            <label>开始（秒）<input data-vc="start" type="number" min="0" step="0.1" value="0"></label>
            <label>结束（秒）<input data-vc="end" type="number" min="0" step="0.1" value="0"></label>
            <button data-vc="setStart" class="secondary">开始=当前时间</button>
            <button data-vc="setEnd" class="secondary">结束=当前时间</button>
            <button data-vc="full" class="secondary">完整时长</button>
          </div>

          <div class="vc-mode-grid" data-vc="modes"></div>
          <div class="vc-options" data-vc="options"></div>

          <div class="vc-row vc-actions">
            <button data-vc="export">开始处理</button>
            <button data-vc="cancel" class="danger">取消任务</button>
          </div>
          <div class="vc-progress">
            <progress data-vc="progress" value="0" max="100"></progress>
            <span data-vc="progressText">0%</span>
          </div>
          <pre data-vc="log" class="result-box">等待任务...</pre>
          <a data-vc="download" hidden class="btn-link">下载导出文件</a>
        </section>
      </div>
    `;

    const q = (k) => host.querySelector(`[data-vc="${k}"]`);
    const state = { main: null, concat1: null, concat2: null, subtitle: null, mode: 'trim_mp4', ffmpeg: null, running: false };

    const modes = [
      { key: 'trim_mp4', name: '裁剪 MP4' },
      { key: 'transcode_webm', name: '转码 WebM' },
      { key: 'concat_mp4', name: '拼接 MP4' },
      { key: 'extract_frame_png', name: '抽帧 PNG' },
      { key: 'audio_extract', name: '音频导出 MP3' },
      { key: 'resize_mp4', name: '调整分辨率' },
      { key: 'subtitle_burn', name: '烧录字幕' },
      { key: 'filter_grayscale', name: '滤镜-黑白' }
    ];

    const modeOptions = {
      trim_mp4: '<div class="vc-row"><label>CRF<input data-vc-opt="crf" type="number" min="18" max="35" value="22"></label><label>preset<select data-vc-opt="preset"><option>veryfast</option><option>faster</option><option selected>fast</option><option>medium</option></select></label></div>',
      transcode_webm: '<div class="vc-row"><label>码率(k)<input data-vc-opt="vb" type="number" min="500" value="2200"></label></div>',
      concat_mp4: '<p class="hint">将主视频 + 片段1 + 片段2 按顺序拼接（可只放前两个）。</p>',
      extract_frame_png: '<div class="vc-row"><label>截图时间（秒）<input data-vc-opt="frameTime" type="number" min="0" step="0.1" value="1"></label></div>',
      audio_extract: '<div class="vc-row"><label>音频码率<select data-vc-opt="ab"><option>96k</option><option selected>128k</option><option>192k</option><option>320k</option></select></label></div>',
      resize_mp4: '<div class="vc-row"><label>宽<input data-vc-opt="w" type="number" min="160" value="1280"></label><label>高<input data-vc-opt="h" type="number" min="120" value="720"></label></div>',
      subtitle_burn: '<p class="hint">需上传 SRT 字幕文件。</p>',
      filter_grayscale: '<p class="hint">应用 format=gray 滤镜导出 MP4。</p>'
    };

    const log = (msg) => {
      const box = q('log');
      box.textContent += `
${new Date().toLocaleTimeString()} - ${msg}`;
      box.scrollTop = box.scrollHeight;
    };
    const setProgress = (v) => {
      const n = Math.max(0, Math.min(100, Math.floor(v)));
      q('progress').value = n;
      q('progressText').textContent = `${n}%`;
    };
    const getOpt = (name, fallback = '') => {
      const el = host.querySelector(`[data-vc-opt="${name}"]`);
      return el ? el.value : fallback;
    };

    async function loadScriptOnce(check, src) {
      if (check()) return;
      const script = document.createElement('script');
      script.src = src;
      document.head.appendChild(script);
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
      });
    }

    async function ensureFFmpeg() {
      if (state.ffmpeg) return state.ffmpeg;
      log('加载 FFmpeg.wasm 核心...');

      await loadScriptOnce(() => !!window.FFmpegWASM, 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js');
      await loadScriptOnce(() => !!window.FFmpegUtil, 'https://unpkg.com/@ffmpeg/util@0.12.1/dist/umd/index.js');

      const { FFmpeg } = window.FFmpegWASM;
      const { toBlobURL } = window.FFmpegUtil;
      const ffmpeg = new FFmpeg();
      ffmpeg.on('progress', ({ progress }) => setProgress(progress * 100));
      ffmpeg.on('log', ({ message }) => {
        if (message && !/time=|frame=|size=/.test(message)) log(message);
      });

      const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm')
      });

      state.ffmpeg = ffmpeg;
      log('FFmpeg.wasm 已就绪。');
      return ffmpeg;
    }

    function renderModes() {
      const modeHost = q('modes');
      modeHost.innerHTML = modes.map((m) => `
        <label class="vc-mode ${state.mode === m.key ? 'active' : ''}" data-mode="${m.key}">
          <input type="radio" name="vcMode" value="${m.key}" ${state.mode === m.key ? 'checked' : ''}>${m.name}
        </label>`).join('');

      modeHost.querySelectorAll('.vc-mode').forEach((el) => {
        el.addEventListener('click', () => {
          state.mode = el.dataset.mode;
          renderModes();
        });
      });
      q('options').innerHTML = modeOptions[state.mode] || '';
    }

    q('mainFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      state.main = file;
      q('preview').src = URL.createObjectURL(file);
      q('meta').textContent = `主素材: ${file.name} | ${(file.size / (1024 * 1024)).toFixed(2)} MB`;
      q('preview').onloadedmetadata = () => {
        q('start').value = '0';
        q('end').value = (q('preview').duration || 0).toFixed(2);
      };
    });
    q('concat1').addEventListener('change', (e) => { state.concat1 = e.target.files[0] || null; });
    q('concat2').addEventListener('change', (e) => { state.concat2 = e.target.files[0] || null; });
    q('subtitleFile').addEventListener('change', (e) => { state.subtitle = e.target.files[0] || null; });

    q('setStart').addEventListener('click', () => { q('start').value = (q('preview').currentTime || 0).toFixed(2); });
    q('setEnd').addEventListener('click', () => { q('end').value = (q('preview').currentTime || 0).toFixed(2); });
    q('full').addEventListener('click', () => { q('start').value = '0'; q('end').value = (q('preview').duration || 0).toFixed(2); });

    q('export').addEventListener('click', async () => {
      if (state.running) return;
      state.running = true;
      q('download').hidden = true;
      q('log').textContent = '开始处理...';
      setProgress(0);

      try {
        if (!state.main) throw new Error('请先选择主素材。');
        const ffmpeg = await ensureFFmpeg();

        const write = async (name, file) => {
          await ffmpeg.writeFile(name, new Uint8Array(await file.arrayBuffer()));
        };

        const mainName = `main_${Date.now()}_${state.main.name.replace(/\s+/g, '_')}`;
        await write(mainName, state.main);

        const start = parseFloat(q('start').value || '0');
        const end = parseFloat(q('end').value || '0');
        const range = ['-ss', `${start}`, '-to', `${end}`, '-i', mainName];

        let out = 'output.mp4';
        let args = [];

        if (state.mode === 'trim_mp4') {
          args = [...range, '-c:v', 'libx264', '-preset', getOpt('preset', 'fast'), '-crf', getOpt('crf', '22'), '-c:a', 'aac', '-b:a', '128k', out];
        } else if (state.mode === 'transcode_webm') {
          out = 'output.webm';
          args = ['-i', mainName, '-c:v', 'libvpx-vp9', '-b:v', `${getOpt('vb', '2200')}k`, '-c:a', 'libopus', out];
        } else if (state.mode === 'concat_mp4') {
          if (!state.concat1) throw new Error('拼接模式至少需要上传片段1。');
          const files = [state.main, state.concat1, state.concat2].filter(Boolean);
          const list = [];
          for (let i = 0; i < files.length; i++) {
            const fname = `part_${i}_${files[i].name.replace(/\s+/g, '_')}`;
            await write(fname, files[i]);
            list.push(`file '${fname}'`);
          }
          await ffmpeg.writeFile('concat_list.txt', new TextEncoder().encode(list.join('\\n')));
          args = ['-f', 'concat', '-safe', '0', '-i', 'concat_list.txt', '-c', 'copy', out];
        } else if (state.mode === 'extract_frame_png') {
          out = 'frame.png';
          args = ['-ss', `${getOpt('frameTime', '1')}`, '-i', mainName, '-frames:v', '1', out];
        } else if (state.mode === 'audio_extract') {
          out = 'output.mp3';
          args = [...range, '-vn', '-c:a', 'libmp3lame', '-b:a', getOpt('ab', '128k'), out];
        } else if (state.mode === 'resize_mp4') {
          const w = getOpt('w', '1280');
          const h = getOpt('h', '720');
          args = ['-i', mainName, '-vf', `scale=${w}:${h}`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-c:a', 'aac', out];
        } else if (state.mode === 'subtitle_burn') {
          if (!state.subtitle) throw new Error('请上传 SRT 字幕文件。');
          await write('subtitle.srt', state.subtitle);
          args = ['-i', mainName, '-vf', 'subtitles=subtitle.srt', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', out];
        } else if (state.mode === 'filter_grayscale') {
          args = ['-i', mainName, '-vf', 'format=gray', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', out];
        }

        log(`ffmpeg ${args.join(' ')}`);
        await ffmpeg.exec(args);

        const data = await ffmpeg.readFile(out);
        const ext = out.split('.').pop();
        const mime = { mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', png: 'image/png' }[ext] || 'application/octet-stream';
        const blob = new Blob([data.buffer], { type: mime });
        const url = URL.createObjectURL(blob);
        const dl = q('download');
        dl.href = url;
        dl.download = `video_engine_${Date.now()}.${ext}`;
        dl.textContent = `下载 ${dl.download}`;
        dl.hidden = false;
        setProgress(100);
        log('处理完成。');
      } catch (err) {
        log(`错误: ${err.message || err}`);
      } finally {
        state.running = false;
      }
    });

    q('cancel').addEventListener('click', () => {
      if (!state.ffmpeg || !state.running) {
        log('当前没有进行中的任务。');
        return;
      }
      state.ffmpeg.terminate();
      state.ffmpeg = null;
      state.running = false;
      log('任务已取消，FFmpeg 已重置。');
    });

    renderModes();
  }


  function initChatTool(host) {
    if (typeof window.initChatgptTool === 'function') {
      return window.initChatgptTool(host);
    }

    host.innerHTML = '<p class="hint">ChatGPT 工具脚本未加载，请刷新页面重试。</p>';
  }

  function renderDefault(host, key) {
    const url = designToolLinks[key];
    if (url) return renderDesignToolSection(host, url);

    host.innerHTML = `<div class="tool-actions"><a class="btn-link" href="https://designtool.site" target="_blank" rel="noopener noreferrer">打开 DesignTool 首页</a></div>`;
  }

  function initWorkbench() {
    const panel = $('panel');
    if (!panel || !panel.dataset.localTool) return;

    const key = panel.dataset.localTool;
    panel.classList.toggle('chatgpt-panel', key === 'chatgpt');
    panel.classList.toggle('video-cut-panel', key === 'video_cut');
    const main = buildBase(panel);

    if (key === 'hdr_editor') return initHDR(main);
    if (key === 'physics_light') return initPhysics(main);
    if (key === 'shader_library') return initShaderLibrary(main);
    if (key === 'model_previewer') return initModelPreview(main);
    if (key === 'ps_online') return initPsOnline(main);
    if (key === 'video_cut') return initVideoCut(main);
    if (key === 'chatgpt') return initChatTool(main);

    renderDefault(main, key);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWorkbench);
  } else {
    initWorkbench();
  }
})();
