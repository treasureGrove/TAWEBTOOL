(function () {
  function $(id) { return document.getElementById(id); }

  const toolMeta = {
    hdr_editor: { title: 'HDR 编辑器', intro: '参考 DesignTool 的工作流：优先在线工具，附带本地快速调色。' },
    combine_rgba: { title: 'RGBA 通道合成', intro: '本地合成 R/G/B/A 通道，输出 PNG。' },
    physics_light: { title: '物理光照计算器', intro: 'EV100 与曝光参数快速换算。' },
    shader_library: { title: 'Shader 函数库', intro: '常用 GLSL 片段检索与复制。' },
    model_previewer: { title: '模型预览器', intro: '本地 GLB/GLTF 预览（CDN: model-viewer）。' },
    ps_online: { title: '在线 PS', intro: '开箱即用 Photopea。' }
  };

  const designToolLinks = {
    hdr_editor: 'https://designtool.site/hdr',
    combine_rgba: 'https://designtool.site',
    ai_frame_interpolation: 'https://designtool.site',
    pbr_texture_generator: 'https://designtool.site',
    video_cut: 'https://designtool.site',
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

  function buildBase(panel, meta) {
    panel.innerHTML = `
      <div class="tool-shell">
        <section class="tool-head card">
          <h1>${meta.title}</h1>
          <p>${meta.intro}</p>
        </section>
        <section id="toolMain" class="card"></section>
        <section class="card">
          <h3>本地笔记</h3>
          <div class="workbench-toolbar">
            <label>导入文本<input id="loadLocalFile" type="file" accept=".txt,.md,.json,.csv,.glsl,.js,.xml"></label>
            <button id="saveLocalFile" class="secondary">导出文本</button>
            <button id="clearEditor" class="danger">清空</button>
          </div>
          <textarea id="localEditor" class="workbench-textarea" placeholder="记录参数、处理步骤、问题排查..."></textarea>
        </section>
      </div>
    `;

    const editor = $('localEditor');
    const key = `tool-${panel.dataset.localTool || 'default'}-notes`;
    editor.value = localStorage.getItem(key) || '';
    editor.addEventListener('input', () => localStorage.setItem(key, editor.value));
    $('loadLocalFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      editor.value = await file.text();
      localStorage.setItem(key, editor.value);
    });
    $('saveLocalFile').addEventListener('click', () => saveTextFile(`${panel.dataset.localTool || 'tool'}_notes.txt`, editor.value));
    $('clearEditor').addEventListener('click', () => {
      editor.value = '';
      localStorage.removeItem(key);
    });

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
    host.innerHTML = `
      <div class="tool-actions">
        <a class="btn-link" href="https://designtool.site/hdr" target="_blank" rel="noopener noreferrer">打开 DesignTool HDR</a>
      </div>
      <p class="hint">下方提供本地快速调色（LDR/HDR截图预处理），便于开箱即用。</p>
      <input id="hdrFile" type="file" accept="image/*" />
      <div class="calc-grid">
        <label>曝光<input id="exposure" type="range" min="-2" max="2" step="0.1" value="0"></label>
        <label>对比<input id="contrast" type="range" min="0.5" max="2" step="0.1" value="1"></label>
        <label>饱和<input id="saturation" type="range" min="0" max="2" step="0.1" value="1"></label>
      </div>
      <button id="exportHdrTone">导出当前结果 PNG</button>
      <canvas id="hdrCanvas" width="800" height="450"></canvas>
    `;

    let image = null;
    const canvas = $('hdrCanvas');
    const ctx = canvas.getContext('2d');

    function render() {
      if (!image) return;
      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      const exp = Math.pow(2, parseFloat($('exposure').value));
      const con = parseFloat($('contrast').value);
      const sat = parseFloat($('saturation').value);

      for (let i = 0; i < d.length; i += 4) {
        let r = d[i] * exp;
        let g = d[i + 1] * exp;
        let b = d[i + 2] * exp;
        r = (r - 128) * con + 128;
        g = (g - 128) * con + 128;
        b = (b - 128) * con + 128;
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        d[i] = Math.max(0, Math.min(255, gray + (r - gray) * sat));
        d[i + 1] = Math.max(0, Math.min(255, gray + (g - gray) * sat));
        d[i + 2] = Math.max(0, Math.min(255, gray + (b - gray) * sat));
      }
      ctx.putImageData(imageData, 0, 0);
    }

    $('hdrFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      image = new Image();
      image.onload = render;
      image.src = URL.createObjectURL(file);
    });

    ['exposure', 'contrast', 'saturation'].forEach((id) => {
      $(id).addEventListener('input', render);
    });

    $('exportHdrTone').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'hdr_toned.png';
      a.click();
    });
  }

  function initCombineRGBA(host) {
    host.innerHTML = `
      <div class="tool-actions">
        <a class="btn-link" href="https://designtool.site" target="_blank" rel="noopener noreferrer">打开 DesignTool</a>
      </div>
      <div class="channel-grid">
        <label>R<input type="file" id="rImg" accept="image/*"></label>
        <label>G<input type="file" id="gImg" accept="image/*"></label>
        <label>B<input type="file" id="bImg" accept="image/*"></label>
        <label>A<input type="file" id="aImg" accept="image/*"></label>
      </div>
      <button id="mergeRGBA">合成并下载 PNG</button>
      <canvas id="rgbaCanvas" width="512" height="512"></canvas>
    `;

    function loadImage(input) {
      return new Promise((resolve, reject) => {
        const file = input.files[0];
        if (!file) return resolve(null);
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
    }

    $('mergeRGBA').addEventListener('click', async () => {
      const imgs = await Promise.all(['rImg', 'gImg', 'bImg', 'aImg'].map((id) => loadImage($(id))));
      if (imgs.some((x) => !x)) return alert('请上传四张灰度通道图。');
      const [r, g, b, a] = imgs;
      const w = Math.min(r.width, g.width, b.width, a.width);
      const h = Math.min(r.height, g.height, b.height, a.height);
      const c = $('rgbaCanvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');

      const read = (img) => {
        ctx.drawImage(img, 0, 0, w, h);
        return ctx.getImageData(0, 0, w, h).data;
      };
      const rd = read(r), gd = read(g), bd = read(b), ad = read(a);
      const out = ctx.createImageData(w, h);
      for (let i = 0; i < out.data.length; i += 4) {
        out.data[i] = rd[i];
        out.data[i + 1] = gd[i];
        out.data[i + 2] = bd[i];
        out.data[i + 3] = ad[i];
      }
      ctx.putImageData(out, 0, 0);
      const link = document.createElement('a');
      link.download = 'combined_rgba.png';
      link.href = c.toDataURL('image/png');
      link.click();
    });
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

  function renderDefault(host, key) {
    const url = designToolLinks[key];
    if (url) return renderDesignToolSection(host, url);

    host.innerHTML = `<div class="tool-actions"><a class="btn-link" href="https://designtool.site" target="_blank" rel="noopener noreferrer">打开 DesignTool 首页</a></div>`;
  }

  function initWorkbench() {
    const panel = $('panel');
    if (!panel || !panel.dataset.localTool) return;

    const key = panel.dataset.localTool;
    const meta = toolMeta[key] || { title: panel.dataset.toolTitle || '工具页', intro: '参考 designtool.site 风格提供开箱即用能力。' };
    const main = buildBase(panel, meta);

    if (key === 'hdr_editor') return initHDR(main);
    if (key === 'combine_rgba') return initCombineRGBA(main);
    if (key === 'physics_light') return initPhysics(main);
    if (key === 'shader_library') return initShaderLibrary(main);
    if (key === 'model_previewer') return initModelPreview(main);
    if (key === 'ps_online') return initPsOnline(main);

    renderDefault(main, key);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWorkbench);
  } else {
    initWorkbench();
  }
})();
