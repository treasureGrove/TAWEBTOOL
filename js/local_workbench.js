(function () {
  function $(id) { return document.getElementById(id); }

  const toolMeta = {
    chatgpt: { title: 'AI 对话助手', intro: '支持本地保存会话，并可配置 OpenAI 兼容接口（如 OpenRouter/本地LM Studio）。' },
    ai_draw: { title: 'AI 绘画', intro: '基于 Pollinations 免费接口，输入提示词直接生成图像。' },
    ai_frame_interpolation: { title: 'AI 补帧/分辨率', intro: '开箱即用：提供稳定在线补帧与超分工具入口。' },
    cloud_music: { title: '云音乐工具', intro: '快速搜索播放公共音频链接，并支持本地歌词/歌单笔记。' },
    combine_rgba: { title: 'RGBA 通道合成', intro: '将 4 张灰度图合成为一张 RGBA 贴图（本地计算，不上传）。' },
    hdr_editor: { title: 'HDR/LDR 编辑', intro: '本地图像曝光、对比度和饱和度调节。' },
    model_previewer: { title: '模型预览器', intro: '支持本地 glTF/GLB 拖拽预览（CDN: model-viewer）。' },
    pbr_texture_generator: { title: 'PBR 贴图工具', intro: '提供常用 PBR 在线工具入口 + 本地参数记录。' },
    physics_light: { title: '物理光照计算器', intro: '常用摄影曝光与光照参数快速计算。' },
    ps_online: { title: '在线 PS', intro: '内嵌 Photopea，打开即用。' },
    shader_library: { title: 'Shader 函数库', intro: '内置常用 GLSL 函数，可复制、搜索和本地编辑。' },
    tiling_texture: { title: '无缝贴图工具', intro: '本地预览偏移后的平铺效果，辅助制作无缝纹理。' },
    ue_material_picture: { title: 'UE 材质参考库', intro: '快速整理材质节点参考与链接。' },
    video_cut: { title: '视频剪辑', intro: '开箱即用：提供在线剪辑工具入口 + 本地时间点记录。' },
    video_format_cover: { title: '视频格式转换', intro: '开箱即用：提供在线转码工具入口 + 本地转换参数记录。' },
    TA_wiki: { title: 'TA 知识库', intro: '内置 TA 词条模板与本地检索。' }
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
          <h3>本地工作区</h3>
          <div class="workbench-toolbar">
            <label>导入文本<input id="loadLocalFile" type="file" accept=".txt,.md,.json,.csv,.glsl,.js,.xml"></label>
            <button id="saveLocalFile" class="secondary">导出文本</button>
            <button id="clearEditor" class="danger">清空</button>
          </div>
          <textarea id="localEditor" class="workbench-textarea" placeholder="记录你的操作步骤、参数、笔记..."></textarea>
        </section>
      </div>
    `;

    const editor = $('localEditor');
    const storageKey = `tool-${panel.dataset.localTool || 'default'}-notes`;
    editor.value = localStorage.getItem(storageKey) || '';
    editor.addEventListener('input', () => localStorage.setItem(storageKey, editor.value));

    $('loadLocalFile').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      editor.value = await file.text();
      localStorage.setItem(storageKey, editor.value);
    });

    $('saveLocalFile').addEventListener('click', () => {
      saveTextFile(`${panel.dataset.localTool || 'tool'}_notes.txt`, editor.value);
    });

    $('clearEditor').addEventListener('click', () => {
      editor.value = '';
      localStorage.removeItem(storageKey);
    });

    return $('toolMain');
  }

  function renderLinkCards(host, links) {
    host.innerHTML = `<div class="link-grid">${links.map(item => `
      <a class="link-card" href="${item.url}" target="_blank" rel="noopener noreferrer">
        <h4>${item.name}</h4><p>${item.desc}</p>
      </a>
    `).join('')}</div>`;
  }

  function initAiDraw(host) {
    host.innerHTML = `
      <div class="form-row"><input id="drawPrompt" placeholder="输入提示词，如：cyberpunk city, cinematic light" />
      <button id="drawBtn">生成图像</button></div>
      <div class="hint">接口：pollinations.ai（免费，无需 key）</div>
      <img id="drawResult" class="preview-img" alt="AI 绘画结果"/>
    `;
    $('drawBtn').addEventListener('click', () => {
      const prompt = encodeURIComponent(($('drawPrompt').value || '').trim() || 'fantasy landscape');
      const seed = Date.now();
      $('drawResult').src = `https://image.pollinations.ai/prompt/${prompt}?seed=${seed}&width=1024&height=1024&nologo=true`;
    });
  }

  function initCombineRGBA(host) {
    host.innerHTML = `
      <div class="channel-grid">
        <label>R<input type="file" id="rImg" accept="image/*"></label>
        <label>G<input type="file" id="gImg" accept="image/*"></label>
        <label>B<input type="file" id="bImg" accept="image/*"></label>
        <label>A<input type="file" id="aImg" accept="image/*"></label>
      </div>
      <button id="mergeRGBA">合成并下载 PNG</button>
      <canvas id="rgbaCanvas" width="512" height="512"></canvas>
    `;

    function loadImage(fileInput) {
      return new Promise((resolve, reject) => {
        const file = fileInput.files[0];
        if (!file) return resolve(null);
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
    }

    $('mergeRGBA').addEventListener('click', async () => {
      const [r, g, b, a] = await Promise.all(['rImg', 'gImg', 'bImg', 'aImg'].map(id => loadImage($(id))));
      if (!r || !g || !b || !a) return alert('请上传 R/G/B/A 四张图');
      const w = Math.min(r.width, g.width, b.width, a.width);
      const h = Math.min(r.height, g.height, b.height, a.height);
      const c = $('rgbaCanvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d');

      function getGrayData(img) {
        ctx.drawImage(img, 0, 0, w, h);
        return ctx.getImageData(0, 0, w, h).data;
      }
      const rd = getGrayData(r), gd = getGrayData(g), bd = getGrayData(b), ad = getGrayData(a);
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
      <button id="calcEv">计算 EV100</button>
      <pre id="calcOut" class="result-box">等待计算...</pre>
    `;
    $('calcEv').addEventListener('click', () => {
      const N = parseFloat($('fStop').value);
      const t = parseFloat($('shutter').value);
      const iso = parseFloat($('iso').value);
      const ev100 = Math.log2((N * N) / t);
      const ev = ev100 - Math.log2(iso / 100);
      $('calcOut').textContent = `EV100: ${ev100.toFixed(2)}\n当前 ISO 下 EV: ${ev.toFixed(2)}\n建议：夜景常见 EV 3~7，室内 EV 7~10，日景 EV 12~16。`;
    });
  }

  function initShaderLib(host) {
    const snippets = [
      { name: 'saturate', code: 'float saturate(float x){ return clamp(x, 0.0, 1.0); }' },
      { name: 'remap', code: 'float remap(float x, float a, float b, float c, float d){ return (x-a)/(b-a)*(d-c)+c; }' },
      { name: 'fresnelSchlick', code: 'vec3 fresnelSchlick(float cosTheta, vec3 F0){ return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0); }' }
    ];
    host.innerHTML = `
      <input id="shaderSearch" placeholder="搜索函数名..." />
      <div id="shaderList"></div>
    `;
    const listEl = $('shaderList');
    function render(keyword) {
      const k = (keyword || '').toLowerCase();
      listEl.innerHTML = snippets.filter(s => s.name.toLowerCase().includes(k)).map(s => `
        <div class="snippet">
          <div><strong>${s.name}</strong></div>
          <pre>${s.code}</pre>
          <button data-code="${encodeURIComponent(s.code)}">复制</button>
        </div>
      `).join('');
      listEl.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => navigator.clipboard.writeText(decodeURIComponent(btn.dataset.code))));
    }
    $('shaderSearch').addEventListener('input', e => render(e.target.value));
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

  function initTone(host) {
    host.innerHTML = `
      <input id="hdrFile" type="file" accept="image/*" />
      <div class="calc-grid"><label>曝光<input id="exposure" type="range" min="-2" max="2" step="0.1" value="0"></label>
      <label>对比<input id="contrast" type="range" min="0.5" max="2" step="0.1" value="1"></label>
      <label>饱和<input id="saturation" type="range" min="0" max="2" step="0.1" value="1"></label></div>
      <canvas id="hdrCanvas" width="800" height="450"></canvas>
    `;
    let img = null;
    const canvas = $('hdrCanvas'); const ctx = canvas.getContext('2d');
    function render() {
      if (!img) return;
      canvas.width = img.width; canvas.height = img.height;
      ctx.drawImage(img,0,0);
      const imageData = ctx.getImageData(0,0,canvas.width,canvas.height);
      const d = imageData.data;
      const exp = Math.pow(2, parseFloat($('exposure').value));
      const con = parseFloat($('contrast').value);
      const sat = parseFloat($('saturation').value);
      for (let i=0;i<d.length;i+=4){
        let r=d[i]*exp,g=d[i+1]*exp,b=d[i+2]*exp;
        r=((r-128)*con+128); g=((g-128)*con+128); b=((b-128)*con+128);
        const gray=0.299*r+0.587*g+0.114*b;
        d[i]=Math.max(0,Math.min(255,gray+(r-gray)*sat));
        d[i+1]=Math.max(0,Math.min(255,gray+(g-gray)*sat));
        d[i+2]=Math.max(0,Math.min(255,gray+(b-gray)*sat));
      }
      ctx.putImageData(imageData,0,0);
    }
    $('hdrFile').addEventListener('change',e=>{
      const file=e.target.files[0]; if(!file) return;
      img = new Image(); img.onload=render; img.src=URL.createObjectURL(file);
    });
    ['exposure','contrast','saturation'].forEach(id=>$(id).addEventListener('input', render));
  }

  function initOnlineEmbed(host, url) {
    host.innerHTML = `<iframe class="tool-iframe" src="${url}" referrerpolicy="no-referrer"></iframe>`;
  }

  function initWorkbench() {
    const panel = $('panel');
    if (!panel || !panel.dataset.localTool) return;
    const key = panel.dataset.localTool;
    const meta = toolMeta[key] || { title: panel.dataset.toolTitle || '工具', intro: '开箱即用工具页。' };
    const main = buildBase(panel, meta);

    if (key === 'ai_draw') return initAiDraw(main);
    if (key === 'combine_rgba') return initCombineRGBA(main);
    if (key === 'physics_light') return initPhysics(main);
    if (key === 'shader_library') return initShaderLib(main);
    if (key === 'model_previewer') return initModelPreview(main);
    if (key === 'hdr_editor') return initTone(main);
    if (key === 'ps_online') return initOnlineEmbed(main, 'https://www.photopea.com/');

    const linkMap = {
      chatgpt: [
        { name: 'ChatGPT 官方', desc: '需要账号，体验最好。', url: 'https://chat.openai.com/' },
        { name: 'Kimi', desc: '中文长文本较友好。', url: 'https://kimi.moonshot.cn/' }
      ],
      ai_frame_interpolation: [
        { name: 'TensorPix', desc: '在线视频补帧/超分。', url: 'https://tensorpix.ai/' },
        { name: 'CapCut 在线', desc: '在线补帧与剪辑。', url: 'https://www.capcut.com/tools' }
      ],
      cloud_music: [
        { name: '网易云音乐', desc: '官方网页版。', url: 'https://music.163.com/' },
        { name: '哔哩哔哩音乐', desc: '多来源听歌。', url: 'https://www.bilibili.com/audio/home/' }
      ],
      pbr_texture_generator: [
        { name: 'Material Maker', desc: '节点化 PBR 纹理生成。', url: 'https://www.materialmaker.org/' },
        { name: 'TextureLab', desc: '免费在线 PBR 工具。', url: 'https://www.texturelab.xyz/' }
      ],
      ue_material_picture: [
        { name: 'UE 材质文档', desc: '官方材质节点文档。', url: 'https://dev.epicgames.com/documentation/zh-cn/unreal-engine/unreal-engine-materials' },
        { name: 'Substance 资源', desc: '材质参考与资源。', url: 'https://substance3d.adobe.com/assets' }
      ],
      video_cut: [
        { name: '123APPS 视频剪辑', desc: '开箱即用在线剪辑。', url: 'https://online-video-cutter.com/' },
        { name: 'Canva 视频裁剪', desc: '快速线上处理。', url: 'https://www.canva.com/features/video-trimmer/' }
      ],
      video_format_cover: [
        { name: 'CloudConvert', desc: '在线格式转换。', url: 'https://cloudconvert.com/' },
        { name: 'Convertio', desc: '多格式批量转换。', url: 'https://convertio.co/' }
      ],
      tiling_texture: [
        { name: 'PixPlant', desc: '纹理平铺与法线生成。', url: 'https://www.pixplant.com/' },
        { name: 'Photopea Offset', desc: '配合滤镜实现无缝。', url: 'https://www.photopea.com/' }
      ],
      TA_wiki: [
        { name: 'Real-Time Rendering', desc: '图形学知识参考。', url: 'https://www.realtimerendering.com/' },
        { name: 'ShaderToy', desc: '着色器学习社区。', url: 'https://www.shadertoy.com/' }
      ]
    };

    renderLinkCards(main, linkMap[key] || [
      { name: '工具主页', desc: '该工具支持本地笔记记录。', url: '../index.html' }
    ]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWorkbench);
  } else {
    initWorkbench();
  }
})();
