/*
  HDR 编辑器  全功能重写 v2
  
   单一数据源：左侧所有控件直接绑定 params / lights，无 lil-gui 重复层
   新增 HDR 调整：亮度、对比度、饱和度、色相偏移（canvas filter 实现）
   新增球形网格叠层：等距矩形画布显示纬/经线、极点标记
   修复：kelvin  RGB 颜色转换；updateHdriCanvasStyle；场景灯中文标签
*/
(function () {
  /*  工具函数  */
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /** Kelvin 色温  CSS hex 颜色（Tanner Helland 算法） */
  function kelvinToHex(k) {
    const t = clamp(k, 1000, 40000) / 100;
    let r, g, b;
    if (t <= 66) {
      r = 255;
      g = clamp(Math.round(99.4708 * Math.log(t) - 161.1196), 0, 255);
      b = t <= 19 ? 0 : clamp(Math.round(138.5177 * Math.log(t - 10) - 305.0448), 0, 255);
    } else {
      r = clamp(Math.round(329.6987 * Math.pow(t - 60, -0.1332)), 0, 255);
      g = clamp(Math.round(288.1222 * Math.pow(t - 60, -0.0755)), 0, 255);
      b = 255;
    }
    return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  /*  CDN 依赖加载  */
  async function importFirst(list) {
    for (const u of list) {
      try { return await import(u); } catch (e) { /* try next */ }
    }
    throw new Error('所有候选 CDN 均失败');
  }

  async function loadDeps() {
    const v = '0.160.0';
    const base = `https://cdn.jsdelivr.net/npm/three@${v}`;
    const base2 = `https://unpkg.com/three@${v}`;
    const jsm = (mod) => [
      `${base}/examples/jsm/${mod}`,
      `${base2}/examples/jsm/${mod}`,
    ];
    const [THREE, rgbe, ctrl, gltf, exr, fbxMod, objMod] = await Promise.all([
      importFirst(['three', `${base}/build/three.module.js`]),
      importFirst(jsm('loaders/RGBELoader.js')),
      importFirst(jsm('controls/OrbitControls.js')),
      importFirst(jsm('loaders/GLTFLoader.js')).catch(() => null),
      importFirst(jsm('exporters/EXRExporter.js')).catch(() => null),
      importFirst(jsm('loaders/FBXLoader.js')).catch(() => null),
      importFirst(jsm('loaders/OBJLoader.js')).catch(() => null),
    ]);
    return {
      THREE,
      RGBELoader: rgbe.RGBELoader,
      OrbitControls: ctrl.OrbitControls,
      GLTFLoader: gltf ? (gltf.GLTFLoader || null) : null,
      EXRExporter: exr ? (exr.EXRExporter || null) : null,
      FBXLoader: fbxMod ? (fbxMod.FBXLoader || null) : null,
      OBJLoader: objMod ? (objMod.OBJLoader || null) : null,
    };
  }

  /*  灯光工厂  */
  const TYPE_CN = { Circle: '圆形', Rect: '矩形', Octagon: '八边形', Ring: '环形' };
  function makeDefaultLight(type, idx) {
    return {
      name: `${TYPE_CN[type] || type}灯 ${idx + 1}`,
      type,
      x: 0.2 + (idx % 3) * 0.25,
      y: 0.25 + (idx % 2) * 0.15,
      size: 0.12,
      color: '#ffffff',
      useKelvin: false,
      kelvin: 6500,
      intensity: 1.4,
      outerFalloff: 1.1,
      innerSoftness: 0.25,
    };
  }

  /*  主初始化函数  */
  window.initHdrEditorTool = async function initHdrEditorTool(host) {
    host = host || document.body;
    const container = host.querySelector('#hdrToolContainer') || host;

    container.innerHTML = `
<div class="hdr-grid-main">
  <div class="card-lite left-panel" id="leftPanel">

    <div class="panel-section" data-section-title="环境设置">
      <div class="ctrl-row">
        <label class="ctrl-label">环境模式</label>
        <select id="envModeSelect" class="ctrl-select">
          <option value="Solid">纯色</option>
          <option value="Gradient" selected>渐变</option>
          <option value="Image">背景图</option>
          <option value="HDRFile">HDR 文件</option>
        </select>
      </div>
      <div class="ctrl-row">
        <label class="ctrl-label">画布分辨率</label>
        <select id="canvasSizeSelect" class="ctrl-select">
          <option value="1024x512">1024  512</option>
          <option value="2048x1024" selected>2048  1024</option>
          <option value="4096x2048">4096  2048</option>
        </select>
      </div>
      <div class="ctrl-row" id="solidColorRow" style="display:none">
        <label class="ctrl-label">纯色</label>
        <input id="solidColorInput" type="color" value="#0b1735" class="ctrl-color" />
      </div>
      <div class="ctrl-row" id="gradTopRow">
        <label class="ctrl-label">渐变-顶色</label>
        <input id="gradTopInput" type="color" value="#1c3461" class="ctrl-color" />
      </div>
      <div class="ctrl-row" id="gradBotRow">
        <label class="ctrl-label">渐变-底色</label>
        <input id="gradBotInput" type="color" value="#050c1a" class="ctrl-color" />
      </div>
      <div class="ctrl-row">
        <label class="ctrl-label">环境旋转 <span id="envRotVal" class="val-badge">0</span></label>
        <input id="envRotRange" type="range" min="-180" max="180" step="1" value="0" class="ctrl-range" />
      </div>
      <div class="ctrl-row ctrl-checkbox">
        <label class="ctrl-label">显示背景</label>
        <input id="showBgCheck" type="checkbox" checked />
      </div>
      <div class="ctrl-row ctrl-checkbox">
        <label class="ctrl-label">球形经纬网格</label>
        <input id="sphereGridCheck" type="checkbox" checked />
      </div>
      <div class="ctrl-row">
        <button id="hdrFileBtn" class="hdr-file-btn env-file-btn">导入 HDR 文件</button>
        <input id="hdrFileInput" type="file" accept=".hdr,image/vnd.radiance" style="display:none" />
      </div>
      <div class="ctrl-row">
        <button id="bgImageBtn" class="hdr-file-btn env-file-btn">导入背景图片</button>
        <input id="bgImageInput" type="file" accept="image/*" style="display:none" />
      </div>
    </div>

    <div class="panel-section" data-section-title="HDR 调整">
      <div class="hdr-adj-info">以下调整实时作用于环境贴图画布</div>
      <div class="ctrl-row">
        <label class="ctrl-label">亮度 EV <span id="brightnessVal" class="val-badge">+0.00</span></label>
        <input id="brightnessRange" type="range" min="-4" max="4" step="0.05" value="0" class="ctrl-range" />
      </div>
      <div class="ctrl-row">
        <label class="ctrl-label">对比度 <span id="contrastVal" class="val-badge">1.00</span></label>
        <input id="contrastRange" type="range" min="0.2" max="3" step="0.05" value="1" class="ctrl-range" />
      </div>
      <div class="ctrl-row">
        <label class="ctrl-label">饱和度 <span id="saturationVal" class="val-badge">1.00</span></label>
        <input id="saturationRange" type="range" min="0" max="3" step="0.05" value="1" class="ctrl-range" />
      </div>
      <div class="ctrl-row">
        <label class="ctrl-label">色相偏移 <span id="hueShiftVal" class="val-badge">0</span></label>
        <input id="hueShiftRange" type="range" min="-180" max="180" step="1" value="0" class="ctrl-range" />
      </div>
      <div class="ctrl-row">
        <label class="ctrl-label">背景模糊 <span id="bgBlurVal" class="val-badge">0.03</span></label>
        <input id="bgBlurRange" type="range" min="0" max="1" step="0.01" value="0.03" class="ctrl-range" />
      </div>
    </div>

    <div class="panel-section" data-section-title="灯光列表">
      <div class="selection-hint">点选列表或在画布上拖拽手柄来编辑灯光  <span>青色高亮</span></div>
      <select id="lightPicker" size="6"></select>
      <div class="light-meta" id="activeLightMeta">当前灯：</div>
      <div class="light-add-btns">
        <button id="addCircleBtn" class="secondary">+ 圆形</button>
        <button id="addRectBtn" class="secondary">+ 矩形</button>
        <button id="addOctagonBtn" class="secondary">+ 八边形</button>
        <button id="addRingBtn" class="secondary">+ 环形</button>
      </div>
      <div class="inline-actions">
        <button id="duplicateLightBtn" class="secondary">复制灯</button>
        <button id="removeLightBtn" class="secondary">删除灯</button>
      </div>
    </div>

    <div class="panel-section" data-section-title="选中灯光">
      <div class="ctrl-row">
        <label class="ctrl-label">名称</label>
        <input id="lightNameInput" type="text" value="" class="ctrl-text" />
      </div>
      <div class="ctrl-row">
        <label class="ctrl-label">光源形状</label>
        <select id="lightTypeSelect" class="ctrl-select">
          <option value="Circle">圆形光</option>
          <option value="Rect">矩形光</option>
          <option value="Octagon">八边形光</option>
          <option value="Ring">环形光</option>
        </select>
      </div>
      <div class="ctrl-row">
        <label class="ctrl-label">位置 X <span id="lightXVal" class="val-badge">0.200</span></label>
        <input id="lightXRange" type="range" min="0" max="1" step="0.001" value="0.2" class="ctrl-range" />
      </div>
      <div class="ctrl-row">
        <label class="ctrl-label">位置 Y <span id="lightYVal" class="val-badge">0.250</span></label>
        <input id="lightYRange" type="range" min="0" max="1" step="0.001" value="0.25" class="ctrl-range" />
      </div>
      <div class="ctrl-row">
        <label class="ctrl-label">大小 <span id="lightSizeVal" class="val-badge">0.120</span></label>
        <input id="lightSizeRange" type="range" min="0.02" max="0.8" step="0.005" value="0.12" class="ctrl-range" />
      </div>
      <div class="ctrl-row">
        <label class="ctrl-label">亮度 <span id="lightIntensVal" class="val-badge">1.40</span></label>
        <input id="lightIntensNum" type="number" min="0" step="0.1" value="1.4" class="ctrl-num-inline" />
        <input id="lightIntensRange" type="range" min="0" max="20" step="0.05" value="1.4" class="ctrl-range ctrl-range-short" />
      </div>
      <div class="ctrl-row">
        <label class="ctrl-label">外侧衰减 <span id="lightFalloffVal" class="val-badge">1.10</span></label>
        <input id="lightFalloffRange" type="range" min="0" max="3" step="0.01" value="1.1" class="ctrl-range" />
      </div>
      <div class="ctrl-row">
        <label class="ctrl-label">内侧柔化 <span id="lightSoftnessVal" class="val-badge">0.25</span></label>
        <input id="lightSoftnessRange" type="range" min="0" max="1" step="0.01" value="0.25" class="ctrl-range" />
      </div>
      <div class="ctrl-row">
        <label class="ctrl-label">光源颜色</label>
        <input id="lightColorInput" type="color" value="#ffffff" class="ctrl-color" />
      </div>
      <div class="ctrl-row ctrl-checkbox">
        <label class="ctrl-label">使用色温</label>
        <input id="lightUseKelvinCheck" type="checkbox" />
      </div>
      <div class="ctrl-row" id="kelvinRow" style="display:none">
        <label class="ctrl-label">色温 K <span id="lightKelvinVal" class="val-badge">6500</span></label>
        <input id="lightKelvinRange" type="range" min="1000" max="20000" step="50" value="6500" class="ctrl-range" />
      </div>
      <div id="kelvinPreview" class="kelvin-preview-row" style="display:none">
        <span class="ctrl-label">色温预览</span>
        <div id="kelvinColorSwatch" class="kelvin-swatch"></div>
      </div>
    </div>

    <div class="panel-section" data-section-title="渲染参数">
      <div class="ctrl-row">
        <label class="ctrl-label">相机曝光 EV <span id="exposureVal" class="val-badge">+0.00</span></label>
        <input id="exposureRange" type="range" min="-4" max="4" step="0.05" value="0" class="ctrl-range" />
      </div>
      <div class="ctrl-row">
        <label class="ctrl-label">色调映射</label>
        <select id="toneMappingSelect" class="ctrl-select">
          <option value="ACES" selected>ACES 胶片</option>
          <option value="Reinhard">Reinhard</option>
          <option value="Cineon">Cineon</option>
          <option value="Neutral">中性</option>
          <option value="None">关闭</option>
        </select>
      </div>
      <div class="ctrl-row">
        <label class="ctrl-label">环境贴图强度 <span id="envIntensVal" class="val-badge">1.40</span></label>
        <input id="envIntensRange" type="range" min="0" max="8" step="0.05" value="1.4" class="ctrl-range" />
      </div>
      <div class="ctrl-row">
        <label class="ctrl-label">预览模型</label>
        <select id="modelSelect" class="ctrl-select">
          <option value="Both" selected>球体 + 扭结体</option>
          <option value="Sphere">仅球体</option>
          <option value="Knot">仅扭结体</option>
        </select>
      </div>
      <div class="ctrl-row">
        <label class="ctrl-label">金属度 <span id="metalnessVal" class="val-badge">0.95</span></label>
        <input id="metalnessRange" type="range" min="0" max="1" step="0.01" value="0.95" class="ctrl-range" />
      </div>
      <div class="ctrl-row">
        <label class="ctrl-label">粗糙度 <span id="roughnessVal" class="val-badge">0.05</span></label>
        <input id="roughnessRange" type="range" min="0.02" max="1" step="0.01" value="0.05" class="ctrl-range" />
      </div>
      <div class="ctrl-row ctrl-checkbox">
        <label class="ctrl-label">模型自动旋转</label>
        <input id="autoRotateCheck" type="checkbox" checked />
      </div>
    </div>

    <div class="panel-section" data-section-title="场景辅助灯">
      <div class="ctrl-row">
        <label class="ctrl-label">主光 <span id="keyVal" class="val-badge">0.00</span></label>
        <input id="keyRange" type="range" min="0" max="10" step="0.1" value="0" class="ctrl-range" />
      </div>
      <div class="ctrl-row">
        <label class="ctrl-label">补光 <span id="fillVal" class="val-badge">0.00</span></label>
        <input id="fillRange" type="range" min="0" max="5" step="0.1" value="0" class="ctrl-range" />
      </div>
      <div class="ctrl-row">
        <label class="ctrl-label">轮廓光 <span id="rimVal" class="val-badge">0.00</span></label>
        <input id="rimRange" type="range" min="0" max="8" step="0.1" value="0" class="ctrl-range" />
      </div>
      <div class="ctrl-row">
        <label class="ctrl-label">聚光灯 <span id="spotVal" class="val-badge">0.00</span></label>
        <input id="spotRange" type="range" min="0" max="10" step="0.1" value="0" class="ctrl-range" />
      </div>
      <div class="ctrl-row">
        <label class="ctrl-label">半球光 <span id="hemiVal" class="val-badge">0.00</span></label>
        <input id="hemiRange" type="range" min="0" max="4" step="0.05" value="0" class="ctrl-range" />
      </div>
      <div class="ctrl-row">
        <label class="ctrl-label">环境光 <span id="ambVal" class="val-badge">0.00</span></label>
        <input id="ambRange" type="range" min="0" max="2" step="0.01" value="0" class="ctrl-range" />
      </div>
    </div>

    <div class="panel-section" data-section-title="导入资源">
      <label class="hdr-file-btn">上传三维模型 <input id="modelFileInput" type="file" accept=".gltf,.glb,.fbx,.obj" /></label>
      <button id="removeModelBtn" class="secondary">移除模型</button>
    </div>


    <div id="histWrap" class="hist-wrap"></div>
  </div>

  <!-- ===== 右侧画布区 ===== -->
  <div class="hdr-canvas-wrap">
    <div class="canvas-card hdri-edit-card">
      <div class="canvas-help">
        <span>等距矩形球面 · 拖动手柄 · 滚轮调整大小 · 右键查看浮点值</span>
        <div style="display:flex;gap:6px;align-items:center">
          <label class="sphere-grid-label"><input type="checkbox" id="falseColorCheck" /> 伪彩</label>
          <label class="sphere-grid-label"><input type="checkbox" id="sphereGridCheck2" checked /> 网格</label>
        </div>
      </div>
      <div class="range-bar">
        <span class="range-bar-label">Range</span>
        <input id="rangeMinInput" type="number" class="range-num" value="0.000" step="any" min="0" title="HDR 黑场（float）" />
        <div class="range-bar-track" id="rangeBarTrack"><div class="range-bar-fill" id="rangeBarFill"></div></div>
        <input id="rangeMaxInput" type="number" class="range-num" value="1.000" step="any" min="0" title="HDR 白场（float，可输入 999 等超高值）" />
        <button id="rangeResetBtn" class="range-reset-btn" title="重置 Range">↺</button>
      </div>
      <div class="hdri-wrap-rel">
        <canvas id="hdriCanvas"></canvas>
        <div id="hdrInspector" class="hdr-inspector" style="display:none"></div>
        <div id="hdrCtxMenu" class="hdr-ctx-menu" style="display:none"></div>
      </div>
    </div>
    <div class="canvas-card preview-card">
      <div id="viewportWrap" class="hdr-canvas-3d">
        <canvas id="hdrEditorCanvas"></canvas>
      </div>
    </div>
    <div class="canvas-card utility-card">
      <div class="utility-grid">
        <div class="panel-guide utility-guide">
          <div class="guide-title">操作提示</div>
          <ul>
            <li> 在灯光列表选中灯，或直接点击画布手柄。</li>
            <li> 拖动手柄调整灯位；滚轮快速改变灯大小。</li>
            <li> HDR 调整区实时改变环境亮度/色彩/饱和度。</li>
            <li> 色温开启后自动将 Kelvin 值转为光源颜色。</li>
          </ul>
        </div>
        <div class="utility-actions">
          <div class="utility-title">状态</div>
          <div id="hdrStatus" class="hdr-status-text">就绪</div>
          <div class="util-export-row">
            <button id="exportHdri" class="secondary util-export-btn">导出 EXR</button>
            <button id="exportHdr" class="secondary util-export-btn">导出 HDR</button>
            <button id="exportPreview" class="util-export-btn">导出 PNG</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;

    /*  面板折叠  */
    const defaultCollapsed = new Set(['场景辅助灯']);
    container.querySelectorAll('.panel-section[data-section-title]').forEach((sec) => {
      const title = sec.getAttribute('data-section-title');
      const head = document.createElement('div');
      head.className = 'panel-section-head';
      const txt = document.createElement('span'); txt.textContent = title;
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'panel-collapse-btn';
      const setC = (c) => { sec.classList.toggle('collapsed', c); btn.textContent = c ? '展开' : '收起'; };
      btn.addEventListener('click', () => setC(!sec.classList.contains('collapsed')));
      head.append(txt, btn); sec.prepend(head);
      setC(defaultCollapsed.has(title));
    });

    const statusEl = container.querySelector('#hdrStatus');
    const setStatus = (s) => { if (statusEl) statusEl.textContent = s; };

    /*  加载依赖  */
    let THREE, RGBELoader, OrbitControls, GLTFLoader, EXRExporter, FBXLoader, OBJLoader;
    try {
      const d = await loadDeps();
      THREE = d.THREE; RGBELoader = d.RGBELoader; OrbitControls = d.OrbitControls;
      GLTFLoader = d.GLTFLoader; EXRExporter = d.EXRExporter;
      FBXLoader = d.FBXLoader; OBJLoader = d.OBJLoader;
    } catch (e) {
      container.innerHTML = '<div style="color:#f87171;padding:24px">依赖加载失败，请检查网络或控制台。</div>';
      console.error(e); return;
    }

    /*  Three.js 场景  */
    const hdriCanvas = container.querySelector('#hdriCanvas');
    const hdriCtx = hdriCanvas.getContext('2d');
    const glCanvas = container.querySelector('#hdrEditorCanvas');
    hdriCanvas.width = 1024; hdriCanvas.height = 512; // 初始占位，startup 时由 syncHdriCanvasResolution 覆盖

    // 纯净环境 canvas（不含格线/手柄等 UI 叠层），用于 Three.js 环境贴图生成与文件导出
    const _envCanvas = document.createElement('canvas');
    _envCanvas.width = 2048; _envCanvas.height = 1024;
    const _envCtx = _envCanvas.getContext('2d');

    const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1120);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(0, 2.3, 7.5);
    const orbit = new OrbitControls(camera, glCanvas);
    orbit.enableDamping = true; orbit.target.set(0, 1.1, 0);

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.88, metalness: 0.03 })
    );
    floor.rotation.x = -Math.PI / 2; scene.add(floor);

    const sphereMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.95, roughness: 0.05 });
    const knotMat = new THREE.MeshStandardMaterial({ color: 0x93c5fd, metalness: 0.5, roughness: 0.08 });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), sphereMat);
    sphere.position.set(-1.7, 1.02, 0); scene.add(sphere);
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.27, 220, 32), knotMat);
    knot.position.set(1.9, 1.2, 0); scene.add(knot);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5); keyLight.position.set(5, 6, 4);
    const fillLight = new THREE.PointLight(0xbddbff, 0.8, 30, 2); fillLight.position.set(-4, 3, 3);
    const rimLight = new THREE.DirectionalLight(0xffe6d1, 1.5); rimLight.position.set(-3, 4, -6);
    const spotLight = new THREE.SpotLight(0xffffff, 0, 40, Math.PI / 6, 0.35, 1);
    spotLight.position.set(2.8, 5.5, 2.4); spotLight.target.position.set(0, 0.9, 0);
    const hemiLight = new THREE.HemisphereLight(0x94b8ff, 0x2b1b10, 0.4);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
    scene.add(keyLight, fillLight, rimLight, spotLight, spotLight.target, hemiLight, ambientLight);

    const TONE_MAP = {
      ACES: THREE.ACESFilmicToneMapping, Reinhard: THREE.ReinhardToneMapping,
      Cineon: THREE.CineonToneMapping, Neutral: THREE.NoToneMapping, None: THREE.NoToneMapping,
    };

    /*  全局参数  */
    const params = {
      envMode: 'Gradient', canvasSize: '2048x1024',
      solidColor: '#0b1735', gradientTop: '#1c3461', gradientBottom: '#050c1a',
      envRotation: 0, showBackground: true, showSphereGrid: true,
      // HDR 调整
      brightness: 0, contrast: 1, saturation: 1, hueShift: 0, bgBlur: 0.03,
      falseColor: false,
      rangeMin: 0, rangeMax: 1,  // 2D 画布显示范围映射（仅可视化，不影响 env 贴图）
      // 渲染
      exposure: 0, toneMapping: 'ACES', envIntensity: 1.4,
      model: 'Both', autoRotate: true, metalness: 0.95, roughness: 0.05,
      // 场景辅助灯（默认全部关闭，HDRI 环境贴图提供主要照明；如需额外灯光请在该折叠区手动开启）
      keyIntensity: 0, fillIntensity: 0, rimIntensity: 0,
      spotIntensity: 0, hemiIntensity: 0, ambientIntensity: 0,
      lightIndex: 0,
    };

    const lights = [
      // 主灯：暖白圆形，顶部高纬（y≈0.15，lat≈63°，xScale≈2.2），2D 视图扁宽，球面正圆
      { name: '主灯 Key', type: 'Circle',
        x: 0.12, y: 0.15, size: 0.11,
        color: '#ffffff', useKelvin: false, kelvin: 5500,
        intensity: 3.0, outerFalloff: 0.60, innerSoftness: 0.10 },
      // 补光：冷蓝矩形，右侧中纬
      { name: '补光 Fill', type: 'Rect',
        x: 0.82, y: 0.42, size: 0.09,
        color: '#b8d4ff', useKelvin: false, kelvin: 7500,
        intensity: 0.65, outerFalloff: 0.55, innerSoftness: 0.38 },
      // 轮廓光：暖橙环形，正后方中高位
      { name: '轮廓光 Rim', type: 'Ring',
        x: 0.50, y: 0.30, size: 0.07,
        color: '#ffd090', useKelvin: false, kelvin: 3800,
        intensity: 1.4, outerFalloff: 0.45, innerSoftness: 0.50 },
    ];

    /*  Canvas HDR 绘制  */
    let hdriBgImage = null, hdrFileTexture = null, _dpr = window.devicePixelRatio || 1;
    // HDR 浮点缓冲区，分辨率跟随画布实际物理尺寸，与 canvas 像素 1:1 对应，防止拉伸导致的像素块
    let _fb_w = 0, _fb_h = 0;
    let _hdrFloatBuf = new Float32Array(0);
    function ensureFloatBuf(pw, ph) {
      if (_fb_w !== pw || _fb_h !== ph) {
        _fb_w = pw; _fb_h = ph;
        _hdrFloatBuf = new Float32Array(pw * ph * 3);
      }
    }
    // 使用纯净 canvas 构建环境贴图，避免球面格线/手柄出现在 3D 预览背景中
    const envCanvasTexture = new THREE.CanvasTexture(_envCanvas);
    envCanvasTexture.mapping = THREE.EquirectangularReflectionMapping;
    envCanvasTexture.colorSpace = THREE.SRGBColorSpace;
    let envMapTexture = null;

    function buildCanvasFilter() {
      return [
        `brightness(${Math.pow(2, params.brightness).toFixed(4)})`,
        `contrast(${params.contrast.toFixed(4)})`,
        `saturate(${params.saturation.toFixed(4)})`,
        `hue-rotate(${params.hueShift}deg)`,
      ].join(' ');
    }

    function syncHdriCanvasResolution() {
      const rect = hdriCanvas.getBoundingClientRect();
      const cw = Math.max(1, Math.round(rect.width));
      const ch = Math.max(1, Math.round(rect.height));
      _dpr = window.devicePixelRatio || 1;
      hdriCanvas.width = Math.max(1, Math.round(cw * _dpr));
      hdriCanvas.height = Math.max(1, Math.round(ch * _dpr));
      hdriCtx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
    }

    function updateHdriCanvasStyle() {
      hdriCanvas.style.width = '100%';
      hdriCanvas.style.height = 'auto';
      const [rw, rh] = params.canvasSize.split('x').map(Number);
      hdriCanvas.style.aspectRatio = `${rw} / ${rh}`;
    }

    /* 球形经纬网格叠层 */
    function drawSphereGrid() {
      if (!params.showSphereGrid) return;
      const dpr = _dpr || 1;
      const w = hdriCanvas.width / dpr;
      const h = hdriCanvas.height / dpr;
      hdriCtx.save();
      const fontSize = Math.max(8, Math.round(h * 0.028));

      // 纬线
      const lats = [-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75];
      lats.forEach((lat) => {
        const y = h * (0.5 - lat / 180);
        const isEq = lat === 0;
        hdriCtx.strokeStyle = isEq ? 'rgba(34,211,238,0.6)' : 'rgba(200,220,240,0.3)';
        hdriCtx.lineWidth = isEq ? 1.6 : 0.8;
        hdriCtx.setLineDash(isEq ? [] : [4, 5]);
        hdriCtx.beginPath(); hdriCtx.moveTo(0, y); hdriCtx.lineTo(w, y); hdriCtx.stroke();
        hdriCtx.setLineDash([]);
        hdriCtx.font = `${fontSize}px sans-serif`; hdriCtx.textBaseline = 'bottom';
        hdriCtx.fillStyle = isEq ? 'rgba(34,211,238,0.75)' : 'rgba(200,220,240,0.55)';
        hdriCtx.fillText(isEq ? '赤道 0' : `${lat > 0 ? '+' : ''}${lat}`, 4, y - 1);
      });

      // 经线
      for (let lon = 0; lon < 360; lon += 30) {
        const x = w * (lon / 360);
        const isPrime = lon === 0 || lon === 180;
        hdriCtx.strokeStyle = isPrime ? 'rgba(34,211,238,0.5)' : 'rgba(200,220,240,0.25)';
        hdriCtx.lineWidth = isPrime ? 1.6 : 0.8;
        hdriCtx.setLineDash(isPrime ? [] : [4, 6]);
        hdriCtx.beginPath(); hdriCtx.moveTo(x, 0); hdriCtx.lineTo(x, h); hdriCtx.stroke();
        hdriCtx.setLineDash([]);
        hdriCtx.font = `${fontSize}px sans-serif`; hdriCtx.textBaseline = 'bottom';
        hdriCtx.fillStyle = 'rgba(200,220,240,0.55)';
        hdriCtx.fillText(`${lon}`, x + 2, h - 2);
      }

      // 极点标记
      const pR = Math.max(4, Math.round(h * 0.017));
      [['rgba(253,186,116,0.85)', w / 2, pR + 2, '北极'],
       ['rgba(147,197,253,0.85)', w / 2, h - pR - 2, '南极']].forEach(([c, px, py, label]) => {
        hdriCtx.fillStyle = c;
        hdriCtx.beginPath(); hdriCtx.arc(px, py, pR, 0, Math.PI * 2); hdriCtx.fill();
        hdriCtx.fillStyle = c;
        hdriCtx.font = `bold ${Math.max(9, Math.round(h * 0.03))}px sans-serif`;
        hdriCtx.textBaseline = py < h / 2 ? 'top' : 'bottom';
        hdriCtx.fillText(label, px + pR + 4, py < h / 2 ? py - pR : py + pR);
      });
      hdriCtx.restore();
    }

    /*
     * Draw a single light shape with exact spherical-cap equirectangular projection.
     *
     * For a cap of angular radius theta centred at latitude phi0, the
     * half-pixel-width at canvas row py (latitude phi) is:
     *
     *   arg  = (cos(theta) - sin(phi)*sin(phi0)) / (cos(phi)*cos(phi0))
     *   dLam = acos( clamp(arg, -1, 1) )
     *   dpx  = dLam * W / (2*PI)
     *
     * The panorama is horizontally tiling (0 == 360 deg),
     * so we paint at cx, cx-w, cx+w to handle edge wrap-around.
     */
    function drawLightShape(light) {
      const dpr = _dpr || 1;
      const w = hdriCanvas.width / dpr, h = hdriCanvas.height / dpr;
      const cx = light.x * w, cy = light.y * h;

      const phi0    = (0.5 - cy / h) * Math.PI;
      const sinPhi0 = Math.sin(phi0);
      const cosPhi0 = Math.cos(phi0);
      const xs0 = 1.0 / Math.max(0.02, cosPhi0);
      const xs = (py) => 1.0 / Math.max(0.02, Math.cos((0.5 - py / h) * Math.PI));

      const ry    = light.size * h;
      const alpha = clamp(0.1 + light.intensity * 0.22, 0, 0.9);
      const col = light.useKelvin ? kelvinToHex(light.kelvin || 6500) : (light.color || '#ffffff');
      const a8 = (v) => Math.round(v * 255).toString(16).padStart(2, '0');

      hdriCtx.save();
      hdriCtx.globalCompositeOperation = 'lighter';

      const STEPS = 80;

      // Paint all geometry with x-centre at ox (called 3x for horizontal wrap-around)
      function paintAt(ox) {

        // Exact spherical-cap outline path (right edge top->bottom, left edge bottom->top)
        function capPath(angRad) {
          const cosA  = Math.cos(angRad);
          const pyTop = Math.max(0, cy - angRad * h / Math.PI);
          const pyBot = Math.min(h, cy + angRad * h / Math.PI);
          hdriCtx.beginPath();
          for (let i = 0; i <= STEPS; i++) {
            const py  = pyTop + (i / STEPS) * (pyBot - pyTop);
            const phi = (0.5 - py / h) * Math.PI;
            const cp  = Math.cos(phi);
            const arg = (Math.abs(cp) < 1e-6) ? 0
                      : (cosA - Math.sin(phi) * sinPhi0) / (cp * cosPhi0);
            const dLam = Math.acos(Math.max(-1, Math.min(1, arg)));
            i === 0 ? hdriCtx.moveTo(ox + dLam * w / (2 * Math.PI), py)
                    : hdriCtx.lineTo(ox + dLam * w / (2 * Math.PI), py);
          }
          for (let i = STEPS; i >= 0; i--) {
            const py  = pyTop + (i / STEPS) * (pyBot - pyTop);
            const phi = (0.5 - py / h) * Math.PI;
            const cp  = Math.cos(phi);
            const arg = (Math.abs(cp) < 1e-6) ? 0
                      : (cosA - Math.sin(phi) * sinPhi0) / (cp * cosPhi0);
            const dLam = Math.acos(Math.max(-1, Math.min(1, arg)));
            hdriCtx.lineTo(ox - dLam * w / (2 * Math.PI), py);
          }
          hdriCtx.closePath();
        }

        // N vertices evenly spaced on a spherical circle of angular radius angRad
        function ringPath(angRad, N) {
          hdriCtx.beginPath();
          for (let i = 0; i <= N; i++) {
            const a    = (i / N) * 2 * Math.PI;
            const dPhi = Math.sin(a) * angRad;
            const dLam = Math.cos(a) * angRad / Math.max(0.02, cosPhi0);
            const py   = cy - dPhi * h / Math.PI;
            const px   = ox + dLam * w / (2 * Math.PI);
            i === 0 ? hdriCtx.moveTo(px, py) : hdriCtx.lineTo(px, py);
          }
          hdriCtx.closePath();
        }

        if (light.type === 'Circle') {
          const falloff  = Math.max(0, light.outerFalloff || 0);
          const softness = clamp(light.innerSoftness, 0, 0.97);
          const outerTh  = ry * (1 + falloff) * Math.PI / h;  // angular outer radius (rad)
          const innerTh  = ry * softness       * Math.PI / h;  // angular inner radius (rad)

          // Per-pixel scan-line fill: compute exact spherical angular distance at each pixel.
          // IMPORTANT: getImageData / putImageData always operate in PHYSICAL canvas pixels,
          // completely ignoring the hdriCtx.setTransform(dpr,...) scale.  All bounding-box
          // coordinates and the inner loop must therefore use physical pixel values.
          const rcol = parseInt(col.slice(1, 3), 16);
          const gcol = parseInt(col.slice(3, 5), 16);
          const bcol = parseInt(col.slice(5, 7), 16);

          const pw  = hdriCanvas.width,  ph  = hdriCanvas.height; // physical dimensions
          const pox = ox * dpr,          pcy = cy * dpr;          // physical light centre
          // Outer cap radius in physical pixels (vertical)
          const outerPhy = outerTh * ph / Math.PI;
          // Exact maximum horizontal extent across all rows in the cap.
          // At the latitude of maximum extent: sin(φ)=sin(φ₀)/cos(θ),
          //   dLam_max = acos( √(cos²θ − sin²φ₀) / cosφ₀ )
          // If cos²θ ≤ sin²φ₀ some inner rows wrap the full 360° → use full-width.
          const cosOuter   = Math.cos(outerTh);
          const sin2phi0   = sinPhi0 * sinPhi0;
          const cos2outer  = cosOuter * cosOuter;
          let hExtPhy;
          if (cos2outer <= sin2phi0) {
            hExtPhy = pw / 2 + 2 * dpr;           // full-width wrap
          } else {
            const dLam_max = Math.acos(Math.min(1, Math.sqrt(cos2outer - sin2phi0) / Math.max(0.001, cosPhi0)));
            hExtPhy = Math.ceil(dLam_max * pw / (2 * Math.PI)) + 2 * dpr;
          }

          const pyT = Math.max(0,      Math.floor(pcy - outerPhy) - dpr);
          const pyB = Math.min(ph - 1, Math.ceil (pcy + outerPhy) + dpr);
          const pxL = Math.max(0,      Math.floor(pox - hExtPhy));
          const pxR = Math.min(pw - 1, Math.ceil (pox + hExtPhy));
          if (pxL > pxR || pyT > pyB) return;

          const bw = pxR - pxL + 1, bh = pyB - pyT + 1;
          const imgd = hdriCtx.getImageData(pxL, pyT, bw, bh);
          const id   = imgd.data;

          for (let py = pyT; py <= pyB; py++) {
            const phi    = (0.5 - py / ph) * Math.PI;   // latitude from physical row
            const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
            for (let px = pxL; px <= pxR; px++) {
              const dLam  = (px - pox) * 2 * Math.PI / pw; // lon delta from physical col
              const cosAD = sinPhi * sinPhi0 + cosPhi * cosPhi0 * Math.cos(dLam);
              const angD  = Math.acos(Math.max(-1, Math.min(1, cosAD)));
              if (angD >= outerTh) continue;
              let ga;
              if (angD <= innerTh) {
                ga = alpha;
              } else {
                const t = (angD - innerTh) / (outerTh - innerTh); // 0=inner edge, 1=outer edge
                ga = alpha * (1 - t) * (1 - t); // smooth quadratic falloff to zero
              }
              const ii = ((py - pyT) * bw + (px - pxL)) * 4;
              id[ii]     = Math.min(255, id[ii]     + Math.round(rcol * ga));
              id[ii + 1] = Math.min(255, id[ii + 1] + Math.round(gcol * ga));
              id[ii + 2] = Math.min(255, id[ii + 2] + Math.round(bcol * ga));
            }
          }
          hdriCtx.putImageData(imgd, pxL, pyT);

        } else if (light.type === 'Rect') {
          // Per-pixel spherical rect: check |Δφ| ≤ rhOuter AND |Δλ| ≤ rwOuter
          // This produces a true rectangle on the sphere surface (curved trapezoid in equirectangular).
          const falloff  = Math.max(0, light.outerFalloff || 0);
          const softness = clamp(light.innerSoftness || 0, 0, 0.97);
          const rhOuter  = ry * 0.65 * (1 + falloff * 0.40) * Math.PI / h;  // angular half-height
          const rwOuter  = ry * 1.2  * (1 + falloff * 0.65) * Math.PI / h;  // angular half-width
          const rhInner  = rhOuter * softness;
          const rwInner  = rwOuter * softness;

          const rcol = parseInt(col.slice(1, 3), 16);
          const gcol = parseInt(col.slice(3, 5), 16);
          const bcol = parseInt(col.slice(5, 7), 16);

          const pw = hdriCanvas.width, ph2 = hdriCanvas.height;
          const pox = ox * dpr, pcy = cy * dpr;
          const pyT = Math.max(0,       Math.floor(pcy - rhOuter * ph2 / Math.PI) - dpr);
          const pyB = Math.min(ph2 - 1, Math.ceil (pcy + rhOuter * ph2 / Math.PI) + dpr);
          const hExt = rwOuter * xs0 * pw / (2 * Math.PI) + 2 * dpr;
          const pxL = Math.max(0,      Math.floor(pox - hExt));
          const pxR = Math.min(pw - 1, Math.ceil (pox + hExt));
          if (pxL > pxR || pyT > pyB) return;

          const bw = pxR - pxL + 1, bh = pyB - pyT + 1;
          const imgd = hdriCtx.getImageData(pxL, pyT, bw, bh);
          const id   = imgd.data;

          for (let py = pyT; py <= pyB; py++) {
            const phi  = (0.5 - py / ph2) * Math.PI;
            const dPhi = Math.abs(phi - phi0);
            if (dPhi > rhOuter) continue;
            for (let px = pxL; px <= pxR; px++) {
              // True angular longitude delta (consider wrap-around)
              let dLam = Infinity;
              for (const du of [0, -1, 1]) {
                const dl = Math.abs((px - pox + du * pw) * 2 * Math.PI / pw);
                if (dl < dLam) dLam = dl;
              }
              if (dLam > rwOuter) continue;

              // Normalised distance in each axis (0=centre, 1=outer edge)
              const tPhi = rhInner > 0 && dPhi <= rhInner ? 0 : (dPhi - rhInner) / (rhOuter - rhInner);
              const tLam = rwInner > 0 && dLam <= rwInner ? 0 : (dLam - rwInner) / (rwOuter - rwInner);
              const t    = Math.max(tPhi, tLam); // Chebyshev = rect distance
              const ga   = alpha * (1 - t) * (1 - t);
              if (ga <= 0) continue;

              const ii = ((py - pyT) * bw + (px - pxL)) * 4;
              id[ii]     = Math.min(255, id[ii]     + Math.round(rcol * ga));
              id[ii + 1] = Math.min(255, id[ii + 1] + Math.round(gcol * ga));
              id[ii + 2] = Math.min(255, id[ii + 2] + Math.round(bcol * ga));
            }
          }
          hdriCtx.putImageData(imgd, pxL, pyT);

        } else if (light.type === 'Octagon') {
          const falloff  = Math.max(0, light.outerFalloff || 0);
          const softness = clamp(light.innerSoftness, 0, 0.93);
          const outerR   = ry * (1 + falloff * 0.45);
          const innerR2  = outerR * softness;
          const outerTh  = outerR * Math.PI / h;

          ringPath(outerTh, 8);
          hdriCtx.filter = `blur(${ry * 0.18}px)`;
          hdriCtx.save();
          hdriCtx.clip();
          hdriCtx.translate(ox, cy);
          hdriCtx.scale(xs0, 1);
          const g2 = hdriCtx.createRadialGradient(0, 0, innerR2, 0, 0, outerR);
          g2.addColorStop(0, col + a8(alpha));
          g2.addColorStop(1, col + '00');
          hdriCtx.fillStyle = g2;
          hdriCtx.fillRect(-outerR * xs0, -outerR, outerR * xs0 * 2, outerR * 2);
          hdriCtx.restore();
          hdriCtx.filter = 'none';

        } else if (light.type === 'Ring') {
          const falloff  = Math.max(0, light.outerFalloff || 0);
          const softness = Math.max(0, light.innerSoftness || 0);
          const ringR  = ry * (1 + falloff * 0.65);
          const lw     = Math.max(2, ry * (0.28 + softness * 0.60));
          const ringTh = ringR * Math.PI / h;

          // Ring stroke follows the spherical circle, not the cap-outline boundary
          ringPath(ringTh, STEPS);
          hdriCtx.strokeStyle = col + a8(alpha);
          hdriCtx.lineWidth = lw;
          hdriCtx.filter = `blur(${ry * 0.10 + lw * 0.22}px)`;
          hdriCtx.stroke();
          hdriCtx.filter = 'none';

          if (softness > 0.05) {
            capPath(ringTh * 1.6);
            hdriCtx.save();
            hdriCtx.clip();
            hdriCtx.translate(ox, cy);
            hdriCtx.scale(xs0, 1);
            hdriCtx.filter = `blur(${ringR * 0.28}px)`;
            const cg2 = hdriCtx.createRadialGradient(0, 0, ringR * 0.4, 0, 0, ringR * 1.6);
            cg2.addColorStop(0, col + a8(alpha * softness * 0.65));
            cg2.addColorStop(1, col + '00');
            hdriCtx.fillStyle = cg2;
            hdriCtx.fillRect(-ringR * 1.6 * xs0, -ringR * 1.6, ringR * 3.2 * xs0, ringR * 3.2);
            hdriCtx.restore();
            hdriCtx.filter = 'none';
          }
        }
      } // end paintAt

      // Horizontal wrap-around: paint at cx, cx-w, cx+w
      paintAt(cx);
      paintAt(cx - w);
      paintAt(cx + w);

      hdriCtx.restore();
    }


    let hoveredIdx = -1;
    function drawHandles() {
      const dpr = _dpr || 1;
      const w = hdriCanvas.width / dpr, h = hdriCanvas.height / dpr;
      hdriCtx.save();
      lights.forEach((light, idx) => {
        const cx   = light.x * w, cy = light.y * h;
        const sel  = idx === params.lightIndex, hov = idx === hoveredIdx;
        const ry   = light.size * h;

        if (sel) {
          /* 选中：按光源形状绘制外描边 */
          hdriCtx.save();
          hdriCtx.translate(cx, cy);
          hdriCtx.strokeStyle = '#22d3ee';
          hdriCtx.lineWidth = 1.8;
          hdriCtx.shadowColor = 'rgba(34,211,238,0.65)';
          hdriCtx.shadowBlur  = 8;
          hdriCtx.setLineDash([5, 4]);

          if (light.type === 'Circle') {
            const outerR = ry * (1 + (light.outerFalloff || 0));
            hdriCtx.beginPath(); hdriCtx.arc(0, 0, outerR, 0, Math.PI * 2); hdriCtx.stroke();
            if (light.innerSoftness > 0.05) {
              hdriCtx.setLineDash([2, 5]);
              hdriCtx.globalAlpha = 0.5;
              hdriCtx.beginPath(); hdriCtx.arc(0, 0, ry * light.innerSoftness, 0, Math.PI * 2); hdriCtx.stroke();
              hdriCtx.globalAlpha = 1;
            }
          } else if (light.type === 'Ring') {
            const ringR = ry * (1 + (light.outerFalloff || 0) * 0.65);
            hdriCtx.beginPath(); hdriCtx.arc(0, 0, ringR, 0, Math.PI * 2); hdriCtx.stroke();
            hdriCtx.setLineDash([2, 5]); hdriCtx.globalAlpha = 0.55;
            hdriCtx.beginPath(); hdriCtx.arc(0, 0, ringR * 0.55, 0, Math.PI * 2); hdriCtx.stroke();
            hdriCtx.globalAlpha = 1;
          } else if (light.type === 'Octagon') {
            const outerR = ry * (1 + (light.outerFalloff || 0) * 0.45);
            hdriCtx.beginPath();
            for (let i = 0; i < 8; i++) {
              const a = (Math.PI * 2 / 8) * i + Math.PI / 8;
              if (i === 0) hdriCtx.moveTo(Math.cos(a) * outerR, Math.sin(a) * outerR);
              else         hdriCtx.lineTo(Math.cos(a) * outerR, Math.sin(a) * outerR);
            }
            hdriCtx.closePath(); hdriCtx.stroke();
          } else if (light.type === 'Rect') {
            const fo = light.outerFalloff || 0;
            const rw2 = ry * 2.4 * (1 + fo * 0.65);
            const rh2 = ry * 1.3 * (1 + fo * 0.40);
            hdriCtx.strokeRect(-rw2 / 2, -rh2 / 2, rw2, rh2);
          }

          hdriCtx.setLineDash([]); hdriCtx.shadowBlur = 0;
          hdriCtx.restore();

        } else if (hov) {
          /* 悬停：半透明轮廓 */
          hdriCtx.save();
          hdriCtx.translate(cx, cy);
          hdriCtx.strokeStyle = 'rgba(248,250,252,0.5)';
          hdriCtx.lineWidth = 1.2;
          hdriCtx.setLineDash([3, 5]);
          const outerR = ry * (1 + (light.outerFalloff || 0));
          hdriCtx.beginPath(); hdriCtx.arc(0, 0, outerR, 0, Math.PI * 2); hdriCtx.stroke();
          hdriCtx.setLineDash([]);
          hdriCtx.restore();
        }

        /* 中心标记（所有灯）：小圆点 + 编号 */
        const dotR = Math.max(5, Math.round(h * 0.012));
        hdriCtx.beginPath(); hdriCtx.arc(cx, cy, dotR, 0, Math.PI * 2);
        hdriCtx.fillStyle = sel ? '#22d3ee' : (hov ? '#f8fafc' : 'rgba(226,232,240,0.75)');
        hdriCtx.fill();
        if (!sel) {
          hdriCtx.strokeStyle = 'rgba(2,6,23,0.55)'; hdriCtx.lineWidth = 1;
          hdriCtx.stroke();
        }
        hdriCtx.fillStyle = sel ? '#0b1120' : 'rgba(2,6,23,0.85)';
        hdriCtx.font = `bold ${Math.max(7, Math.round(dotR * 1.05))}px sans-serif`;
        hdriCtx.textAlign = 'center'; hdriCtx.textBaseline = 'middle';
        hdriCtx.fillText(String(idx + 1), cx, cy);
      });
      hdriCtx.textAlign = 'left'; hdriCtx.restore();
    }

    /*
     * 伪彩色叠层（False-Color）
     * 将亮度值映射到可视颜色，类似 RenderDoc / Nuke 的 False Color 显示模式：
     *   极暗 (＜4%)  → 深蓝紫
     *   暗部 (4-18%) → 蓝
     *   中调 (18-50%)→ 绿
     *   亮部 (50-75%)→ 黄
     *   近曝 (75-95%)→ 橙
     *   过曝 (≥95%)  → 红（8-bit canvas 中 255 即为 HDR 截幅点）
     */
    function applyFalseColor() {
      const pw = hdriCanvas.width, ph = hdriCanvas.height;
      const imgd = hdriCtx.getImageData(0, 0, pw, ph);
      const d = imgd.data;
      for (let i = 0; i < d.length; i += 4) {
        const lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
        let r, g, b;
        if      (lum < 0.04) { r =  20; g =   0; b =  80; }  // 深蓝紫
        else if (lum < 0.18) { r =   0; g =  60; b = 200; }  // 蓝
        else if (lum < 0.50) { r =   0; g = 180; b =  60; }  // 绿
        else if (lum < 0.75) { r = 210; g = 210; b =   0; }  // 黄
        else if (lum < 0.95) { r = 255; g =  90; b =   0; }  // 橙
        else                 { r = 255; g =   0; b =   0; }  // 红（截幅）
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
      }
      hdriCtx.putImageData(imgd, 0, 0);
    }

    /**
     * 构建 HDR 浮点缓冲区（分辨率与物理 canvas 相同，无拉伸失真）
     * 对所有灯光做解析计算，存储真实 HDR float 值（可超出 1，例如 intensity=999）。
     * 背景使用纯色/渐变的 sRGB 值；Image 模式回退到默认暗背景。
     */
    function buildHdrFloatBuf() {
      // 使用物理像素尺寸，与 canvas 1:1 对应
      const pw = hdriCanvas.width, ph = hdriCanvas.height;
      ensureFloatBuf(pw, ph);
      const buf = _hdrFloatBuf;
      buf.fill(0); // 清零

      // --- 填充背景基色（float，sRGB 分量，值域 0-1） ---
      function hex2f(hex) {
        return [parseInt(hex.slice(1,3),16)/255, parseInt(hex.slice(3,5),16)/255, parseInt(hex.slice(5,7),16)/255];
      }
      for (let row = 0; row < ph; row++) {
        const v = (row + 0.5) / ph;
        let bgR, bgG, bgB;
        if (params.envMode === 'Solid') {
          [bgR, bgG, bgB] = hex2f(params.solidColor || '#0b1120');
        } else if (params.envMode === 'Gradient') {
          const [tr, tg, tb] = hex2f(params.gradientTop    || '#1c3461');
          const [br, bg, bb] = hex2f(params.gradientBottom || '#050c1a');
          bgR = tr*(1-v)+br*v; bgG = tg*(1-v)+bg*v; bgB = tb*(1-v)+bb*v;
        } else {
          bgR = 11/255; bgG = 17/255; bgB = 32/255; // '#0b1120'
        }
        const rowBase = row * pw;
        for (let col = 0; col < pw; col++) {
          const idx = (rowBase + col) * 3;
          buf[idx] = bgR; buf[idx+1] = bgG; buf[idx+2] = bgB;
        }
      }

      // --- 叠加每个光源的 HDR 贡献 ---
      for (const lt of lights) {
        if (lt.hidden) continue;
        const phi0_l = (0.5 - lt.y) * Math.PI;
        const sinP0 = Math.sin(phi0_l), cosP0 = Math.cos(phi0_l);
        const hexCol = lt.useKelvin ? kelvinToHex(lt.kelvin || 6500) : (lt.color || '#ffffff');
        const cr = parseInt(hexCol.slice(1,3),16)/255;
        const cg = parseInt(hexCol.slice(3,5),16)/255;
        const cb = parseInt(hexCol.slice(5,7),16)/255;
        const inten = lt.intensity || 1;
        const fo = Math.max(0, lt.outerFalloff || 0);
        const so = clamp(lt.innerSoftness || 0, 0, 0.97);

        // 垂直+水平包围盒（物理像素）—— 大幅减少无效像素检查
        let maxAngR;
        if (lt.type === 'Circle' || lt.type === 'Octagon') maxAngR = lt.size * Math.PI * (1 + fo);
        else if (lt.type === 'Ring') maxAngR = lt.size * Math.PI * (1 + fo*0.65) + lt.size * Math.PI * (0.28 + so*0.60) * 0.5;
        else maxAngR = lt.size * Math.PI * 1.2 * (1 + fo);

        const pyC   = lt.y * ph;
        const pyRad = maxAngR * ph / Math.PI + 1;
        const pyT = Math.max(0, Math.floor(pyC - pyRad));
        const pyB = Math.min(ph - 1, Math.ceil(pyC + pyRad));

        // 水平包围盒（含 360° 边界溢出处理）
        // 精确公式：球面帽在纬度 φ₀ 处最大经度跨度 dLam_max = acos(√(cos²θ−sin²φ₀)/cosφ₀)
        // 当 cos²θ ≤ sin²φ₀ 时，帽内存在整行覆盖的纬度，取全宽。
        const cosP0abs = Math.max(0.001, Math.abs(cosP0));
        const cosMaxR   = Math.cos(maxAngR);
        const sin2phi0b = sinP0 * sinP0;
        const cos2maxR  = cosMaxR * cosMaxR;
        let hExtPhy;
        if (cos2maxR <= sin2phi0b) {
          hExtPhy = Math.ceil(pw / 2) + 2;
        } else {
          const dLam_max = Math.acos(Math.min(1, Math.sqrt(cos2maxR - sin2phi0b) / cosP0abs));
          hExtPhy = Math.ceil(dLam_max * pw / (2 * Math.PI)) + 2;
        }
        const pxC  = Math.round(lt.x * pw);
        // 算出两段扫描范围（支持环形贴图左右溢出）
        let scanRanges;
        if (hExtPhy * 2 >= pw) {
          scanRanges = [[0, pw - 1]]; // 光源极大（覆盖全图），直接全扫
        } else {
          const lo = pxC - hExtPhy, hi = pxC + hExtPhy;
          if (lo < 0)      scanRanges = [[0, hi], [pw + lo, pw - 1]];
          else if (hi >= pw) scanRanges = [[lo, pw - 1], [0, hi - pw]];
          else               scanRanges = [[lo, hi]];
        }

        for (let row = pyT; row <= pyB; row++) {
          const v = (row + 0.5) / ph;
          const phi = (0.5 - v) * Math.PI;
          const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
          const rowBase = row * pw;

          for (const [colL, colR] of scanRanges) {
          for (let col = colL; col <= colR; col++) {
            const u = (col + 0.5) / pw;
            // 最小球面角距（考虑 360° 左右循环）
            let minAngD = Infinity;
            for (let du = -1; du <= 1; du++) {
              const dLam = (u - lt.x + du) * 2 * Math.PI;
              const cosAD = sinPhi*sinP0 + cosPhi*cosP0*Math.cos(dLam);
              const angD = Math.acos(Math.max(-1, Math.min(1, cosAD)));
              if (angD < minAngD) minAngD = angD;
            }

            let factor = 0;
            if (lt.type === 'Circle' || lt.type === 'Octagon') {
              const oTh = lt.size * Math.PI * (1 + fo);
              const iTh = lt.size * Math.PI * so;
              if (minAngD < oTh) {
                if (minAngD <= iTh) { factor = 1.0; }
                else { const t = (minAngD - iTh) / (oTh - iTh); factor = (1-t)*(1-t); }
              }
            } else if (lt.type === 'Ring') {
              const ringTh = lt.size * Math.PI * (1 + fo*0.65);
              const lwTh   = Math.max(0.001, lt.size * Math.PI * (0.28 + so*0.60) * 0.5);
              const dist   = Math.abs(minAngD - ringTh);
              if (dist < lwTh) factor = 1 - dist / lwTh;
            } else if (lt.type === 'Rect') {
              const rwTh = lt.size * Math.PI * 1.2 * (1 + fo*0.65);
              const rhTh = lt.size * Math.PI * 0.65 * (1 + fo*0.40);
              const maxR = Math.max(rwTh, rhTh);
              if (minAngD < maxR) {
                const blurN = lt.size * Math.PI * (0.22 + so*0.45 + fo*0.35);
                factor = Math.max(0, 1 - (minAngD - maxR*(1 - blurN/maxR)) / blurN);
              }
            }

            if (factor <= 0) continue;
            const idx = (rowBase + col) * 3;
            buf[idx]   += cr * inten * factor;
            buf[idx+1] += cg * inten * factor;
            buf[idx+2] += cb * inten * factor;
          }
          } // end scanRanges
        }
      }
    }

    /**
     * 范围重映射（仅显示用，不影响 _envCanvas）
     * 从 HDR 浮点缓冲区读取真实值，将 [rangeMin, rangeMax] 映射到显示 [0, 255]。
     * 浮点缓冲区与 canvas 物理像素 1:1，无插值/拉伸，保持平滑。
     */
    function applyRangeRemap() {
      const rMin = params.rangeMin, rMax = params.rangeMax;
      if (rMax <= rMin) return;
      const scale = 255 / (rMax - rMin);

      const pw = hdriCanvas.width, ph = hdriCanvas.height;
      const imgd = hdriCtx.getImageData(0, 0, pw, ph);
      const d = imgd.data;

      // 1:1 直接映射，无需行列换算
      for (let i = 0, fi = 0, di = 0; i < pw * ph; i++, fi += 3, di += 4) {
        d[di]   = clamp(Math.round((_hdrFloatBuf[fi]   - rMin) * scale), 0, 255);
        d[di+1] = clamp(Math.round((_hdrFloatBuf[fi+1] - rMin) * scale), 0, 255);
        d[di+2] = clamp(Math.round((_hdrFloatBuf[fi+2] - rMin) * scale), 0, 255);
      }
      hdriCtx.putImageData(imgd, 0, 0);
    }

    function drawHdriCanvas() {
      const dpr = _dpr || 1;
      const w = hdriCanvas.width / dpr, h = hdriCanvas.height / dpr;
      hdriCtx.clearRect(0, 0, w, h);

      /* 背景层  应用 HDR 调整 filter */
      hdriCtx.save();
      hdriCtx.filter = buildCanvasFilter();
      if (params.envMode === 'Solid') {
        hdriCtx.fillStyle = params.solidColor; hdriCtx.fillRect(0, 0, w, h);
      } else if (params.envMode === 'Gradient') {
        const grad = hdriCtx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, params.gradientTop); grad.addColorStop(1, params.gradientBottom);
        hdriCtx.fillStyle = grad; hdriCtx.fillRect(0, 0, w, h);
      } else if (params.envMode === 'Image' && hdriBgImage) {
        const iw = hdriBgImage.naturalWidth || hdriBgImage.width;
        const ih = hdriBgImage.naturalHeight || hdriBgImage.height;
        if (iw > 0 && ih > 0) {
          const ir = iw / ih, cr = w / h;
          let dw, dh, dx, dy;
          if (ir > cr) { dw = w; dh = w / ir; dx = 0; dy = (h - dh) / 2; }
          else { dh = h; dw = h * ir; dy = 0; dx = (w - dw) / 2; }
          hdriCtx.fillStyle = '#0b1120'; hdriCtx.fillRect(0, 0, w, h);
          hdriCtx.drawImage(hdriBgImage, dx, dy, dw, dh);
        } else { hdriCtx.drawImage(hdriBgImage, 0, 0, w, h); }
      } else {
        hdriCtx.fillStyle = '#0b1120'; hdriCtx.fillRect(0, 0, w, h);
      }
      hdriCtx.restore();

      /* 光源形状（lighter 混合） */
      lights.forEach(drawLightShape);

      /* ── 环境贴图快照（bg+lights 已合成，UI 叠层尚未绘制）── */
      _envCtx.drawImage(hdriCanvas, 0, 0, _envCanvas.width, _envCanvas.height);
      envCanvasTexture.needsUpdate = true;

      /* 构建 HDR 浮点缓冲区 & 范围重映射（仅显示画布，不影响 env） */
      buildHdrFloatBuf();
      applyRangeRemap(); // 始终从 HDR float 值渲染显示层，确保超出 1.0 的光源也能正确表示
      /* 伪彩色（仅显示） */
      if (params.falseColor) applyFalseColor();
      /* 球形经纬网格 */
      drawSphereGrid();
      /* 手柄 */
      drawHandles();
    }

    function rebuildEnvFromCanvas() {
      drawHdriCanvas(); // drawHdriCanvas 内已包含 envCanvasTexture.needsUpdate
      if (envMapTexture) envMapTexture.dispose();
      envMapTexture = pmrem.fromEquirectangular(envCanvasTexture).texture;
      scene.environment = envMapTexture;
    }

    function applyParams() {
      renderer.toneMappingExposure = Math.pow(2, params.exposure);
      renderer.toneMapping = TONE_MAP[params.toneMapping] || THREE.ACESFilmicToneMapping;
      sphereMat.envMapIntensity = params.envIntensity; knotMat.envMapIntensity = params.envIntensity;
      sphereMat.metalness = params.metalness; sphereMat.roughness = params.roughness;
      knotMat.metalness = Math.min(1, params.metalness * 0.8); knotMat.roughness = Math.min(1, params.roughness + 0.1);
      sphereMat.needsUpdate = true; knotMat.needsUpdate = true;
      keyLight.intensity = params.keyIntensity; fillLight.intensity = params.fillIntensity;
      rimLight.intensity = params.rimIntensity; spotLight.intensity = params.spotIntensity;
      hemiLight.intensity = params.hemiIntensity; ambientLight.intensity = params.ambientIntensity;
      sphere.visible = params.model === 'Sphere' || params.model === 'Both';
      knot.visible = params.model === 'Knot' || params.model === 'Both';
      const rot = THREE.MathUtils.degToRad(params.envRotation);
      if ('backgroundRotation' in scene) scene.backgroundRotation.set(0, rot, 0);
      if ('environmentRotation' in scene) scene.environmentRotation.set(0, rot, 0);
      scene.backgroundBlurriness = params.bgBlur;

      if (params.envMode === 'HDRFile' && hdrFileTexture) {
        if (envMapTexture) envMapTexture.dispose();
        envMapTexture = pmrem.fromEquirectangular(hdrFileTexture).texture;
        scene.environment = envMapTexture;
        scene.background = params.showBackground ? hdrFileTexture : new THREE.Color(0x0b1120);
        drawHdriCanvas();
      } else {
        scene.background = params.showBackground ? envCanvasTexture : new THREE.Color(0x0b1120);
        rebuildEnvFromCanvas();
      }
    }

    /*  UI 绑定助手  */
    function $id(id) { return container.querySelector('#' + id); }

    function bindRange(inputId, badgeId, key, fmt) {
      const el = $id(inputId), badge = $id(badgeId);
      if (!el) return;
      el.addEventListener('input', () => {
        const v = parseFloat(el.value);
        params[key] = v;
        if (badge) badge.textContent = fmt ? fmt(v) : v.toFixed(2);
        applyParams();
      });
    }

    function bindSelect(selectId, key, cb) {
      const el = $id(selectId);
      if (!el) return;
      el.addEventListener('change', () => { params[key] = el.value; if (cb) cb(); else applyParams(); });
    }

    function bindCheck(checkId, key, cb) {
      const el = $id(checkId);
      if (!el) return;
      el.addEventListener('change', () => { params[key] = el.checked; if (cb) cb(); else applyParams(); });
    }

    function bindColor(inputId, key) {
      const el = $id(inputId);
      if (!el) return;
      el.addEventListener('input', () => { params[key] = el.value; applyParams(); });
    }

    /* 环境设置绑定 */
    function updateEnvModeVisibility() {
      const m = params.envMode;
      const solRow = $id('solidColorRow'), gtRow = $id('gradTopRow'), gbRow = $id('gradBotRow');
      if (solRow) solRow.style.display = m === 'Solid' ? '' : 'none';
      if (gtRow) gtRow.style.display = m === 'Gradient' ? '' : 'none';
      if (gbRow) gbRow.style.display = m === 'Gradient' ? '' : 'none';
    }
    updateEnvModeVisibility();

    bindSelect('envModeSelect', 'envMode', () => { updateEnvModeVisibility(); applyParams(); });
    bindSelect('canvasSizeSelect', 'canvasSize', () => {
      const [w, h] = params.canvasSize.split('x').map(Number);
      _envCanvas.width = w; _envCanvas.height = h; // 更新纯净环境 canvas 分辨率
      updateHdriCanvasStyle(); applyParams();
    });
    bindColor('solidColorInput', 'solidColor');
    bindColor('gradTopInput', 'gradientTop');
    bindColor('gradBotInput', 'gradientBottom');
    bindRange('envRotRange', 'envRotVal', 'envRotation', (v) => `${Math.round(v)}`);
    bindCheck('showBgCheck', 'showBackground');
    bindCheck('sphereGridCheck', 'showSphereGrid', () => { drawHdriCanvas(); });

    /* 右侧画布网格复选框同步 */
    const sgc2 = $id('sphereGridCheck2');
    if (sgc2) {
      sgc2.addEventListener('change', () => {
        params.showSphereGrid = sgc2.checked;
        const sgc = $id('sphereGridCheck');
        if (sgc) sgc.checked = sgc2.checked;
        drawHdriCanvas();
      });
    }

    /* HDR 调整 */
    bindRange('brightnessRange', 'brightnessVal', 'brightness', (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} EV`);
    bindRange('contrastRange', 'contrastVal', 'contrast', (v) => v.toFixed(2));
    bindRange('saturationRange', 'saturationVal', 'saturation', (v) => v.toFixed(2));
    bindRange('hueShiftRange', 'hueShiftVal', 'hueShift', (v) => `${Math.round(v)}`);
    bindRange('bgBlurRange', 'bgBlurVal', 'bgBlur', (v) => v.toFixed(2));

    /* 渲染参数 */
    bindRange('exposureRange', 'exposureVal', 'exposure', (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} EV`);
    bindSelect('toneMappingSelect', 'toneMapping');
    bindRange('envIntensRange', 'envIntensVal', 'envIntensity', (v) => v.toFixed(2));
    bindSelect('modelSelect', 'model');
    bindRange('metalnessRange', 'metalnessVal', 'metalness', (v) => v.toFixed(2));
    bindRange('roughnessRange', 'roughnessVal', 'roughness', (v) => v.toFixed(2));
    bindCheck('autoRotateCheck', 'autoRotate');

    /* 场景辅助灯 */
    bindRange('keyRange', 'keyVal', 'keyIntensity', (v) => v.toFixed(2));
    bindRange('fillRange', 'fillVal', 'fillIntensity', (v) => v.toFixed(2));
    bindRange('rimRange', 'rimVal', 'rimIntensity', (v) => v.toFixed(2));
    bindRange('spotRange', 'spotVal', 'spotIntensity', (v) => v.toFixed(2));
    bindRange('hemiRange', 'hemiVal', 'hemiIntensity', (v) => v.toFixed(2));
    bindRange('ambRange', 'ambVal', 'ambientIntensity', (v) => v.toFixed(2));

    /*  灯光列表 & 选中灯编辑  */
    function updateLightMeta() {
      const el = $id('activeLightMeta');
      if (!el) return;
      const l = lights[params.lightIndex];
      if (!l) { el.textContent = '当前灯：'; return; }
      el.textContent = `${params.lightIndex + 1}. ${l.name}（${TYPE_CN[l.type] || l.type}） 位置 ${Math.round(l.x * 100)}%, ${Math.round(l.y * 100)}%`;
    }

    function refreshLightPicker() {
      const picker = $id('lightPicker');
      if (!picker) return;
      picker.innerHTML = lights.map((l, i) => `<option value="${i}">${i + 1}. ${l.name}</option>`).join('');
      picker.value = String(params.lightIndex);
    }

    function updateKelvinSwatch() {
      const l = lights[params.lightIndex];
      if (!l) return;
      const preview = $id('kelvinPreview'), swatch = $id('kelvinColorSwatch');
      if (!preview || !swatch) return;
      preview.style.display = l.useKelvin ? '' : 'none';
      swatch.style.background = kelvinToHex(l.kelvin || 6500);
    }

    function syncActiveLightToUI() {
      const l = lights[params.lightIndex];
      if (!l) return;
      const set = (id, v) => { const el = $id(id); if (el) el.value = v; };
      const setBadge = (id, v) => { const el = $id(id); if (el) el.textContent = v; };
      set('lightNameInput', l.name);
      set('lightTypeSelect', l.type);
      set('lightXRange', l.x); setBadge('lightXVal', l.x.toFixed(3));
      set('lightYRange', l.y); setBadge('lightYVal', l.y.toFixed(3));
      set('lightSizeRange', l.size); setBadge('lightSizeVal', l.size.toFixed(3));
      set('lightIntensRange', Math.min(l.intensity, 20)); set('lightIntensNum', l.intensity);
      setBadge('lightIntensVal', l.intensity.toFixed(2));
      set('lightFalloffRange', l.outerFalloff); setBadge('lightFalloffVal', l.outerFalloff.toFixed(2));
      set('lightSoftnessRange', l.innerSoftness); setBadge('lightSoftnessVal', l.innerSoftness.toFixed(2));
      set('lightColorInput', l.color || '#ffffff');
      const ukEl = $id('lightUseKelvinCheck');
      if (ukEl) ukEl.checked = !!l.useKelvin;
      set('lightKelvinRange', l.kelvin || 6500); setBadge('lightKelvinVal', String(l.kelvin || 6500));
      const kr = $id('kelvinRow');
      if (kr) kr.style.display = l.useKelvin ? '' : 'none';
      updateKelvinSwatch();
      updateLightMeta();
    }

    function selectLight(idx) {
      params.lightIndex = clamp(idx, 0, lights.length - 1);
      refreshLightPicker(); syncActiveLightToUI();
    }

    const lightPickerEl = $id('lightPicker');
    if (lightPickerEl) {
      lightPickerEl.addEventListener('change', (e) => selectLight(Number(e.target.value)));
      lightPickerEl.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        setTimeout(() => selectLight(Number(lightPickerEl.value)), 0);
      });
    }

    ['Circle', 'Rect', 'Octagon', 'Ring'].forEach((type) => {
      const el = $id(`add${type}Btn`);
      if (el) el.addEventListener('click', () => {
        lights.push(makeDefaultLight(type, lights.length));
        selectLight(lights.length - 1); applyParams();
      });
    });

    if ($id('duplicateLightBtn')) $id('duplicateLightBtn').addEventListener('click', () => {
      const src = lights[params.lightIndex];
      const copy = JSON.parse(JSON.stringify(src));
      copy.name = src.name + ' 复制'; copy.x = clamp(copy.x + 0.03, 0, 1); copy.y = clamp(copy.y + 0.03, 0, 1);
      lights.push(copy); selectLight(lights.length - 1); applyParams();
    });

    if ($id('removeLightBtn')) $id('removeLightBtn').addEventListener('click', () => {
      if (lights.length <= 1) { setStatus('至少保留一盏灯'); return; }
      lights.splice(params.lightIndex, 1);
      selectLight(clamp(params.lightIndex, 0, lights.length - 1)); applyParams();
    });

    /* 选中灯属性绑定 */
    function bindLightProp(inputId, badgeId, key, fmt) {
      const el = $id(inputId), badge = $id(badgeId);
      if (!el) return;
      el.addEventListener('input', () => {
        const l = lights[params.lightIndex];
        if (!l) return;
        const v = el.type === 'checkbox' ? el.checked
                : (el.type === 'range' || el.type === 'number') ? parseFloat(el.value)
                : el.value;
        l[key] = v;
        if (badge) badge.textContent = fmt ? fmt(v) : (typeof v === 'number' ? v.toFixed(2) : v);
        applyParams(); updateLightMeta();
      });
    }

    bindLightProp('lightNameInput', null, 'name');
    const ltEl = $id('lightTypeSelect');
    if (ltEl) ltEl.addEventListener('change', () => { lights[params.lightIndex].type = ltEl.value; applyParams(); });
    bindLightProp('lightXRange', 'lightXVal', 'x', (v) => v.toFixed(3));
    bindLightProp('lightYRange', 'lightYVal', 'y', (v) => v.toFixed(3));
    bindLightProp('lightSizeRange', 'lightSizeVal', 'size', (v) => v.toFixed(3));
    // Intensity: range slider (0–20) + freeform number input, bi-directionally synced
    (function bindIntensity() {
      const liRng = $id('lightIntensRange');
      const liNum = $id('lightIntensNum');
      const liBadge = () => $id('lightIntensVal');
      if (liRng) liRng.addEventListener('input', () => {
        const v = parseFloat(liRng.value) || 0;
        const l = lights[params.lightIndex];
        if (!l) return;
        l.intensity = v;
        if (liNum) liNum.value = v;
        const b = liBadge(); if (b) b.textContent = v.toFixed(2);
        applyParams(); updateLightMeta();
      });
      if (liNum) liNum.addEventListener('input', () => {
        const v = Math.max(0, parseFloat(liNum.value) || 0);
        const l = lights[params.lightIndex];
        if (!l) return;
        l.intensity = v;
        if (liRng) liRng.value = Math.min(v, 20);
        const b = liBadge(); if (b) b.textContent = v.toFixed(2);
        applyParams(); updateLightMeta();
      });
    })();
    bindLightProp('lightFalloffRange', 'lightFalloffVal', 'outerFalloff', (v) => v.toFixed(2));
    bindLightProp('lightSoftnessRange', 'lightSoftnessVal', 'innerSoftness', (v) => v.toFixed(2));
    bindLightProp('lightColorInput', null, 'color');

    const useKelvinEl = $id('lightUseKelvinCheck');
    if (useKelvinEl) {
      useKelvinEl.addEventListener('change', () => {
        const l = lights[params.lightIndex];
        if (!l) return;
        l.useKelvin = useKelvinEl.checked;
        const kr = $id('kelvinRow');
        if (kr) kr.style.display = l.useKelvin ? '' : 'none';
        updateKelvinSwatch(); applyParams();
      });
    }

    const kelvinRangeEl = $id('lightKelvinRange');
    if (kelvinRangeEl) {
      kelvinRangeEl.addEventListener('input', () => {
        const l = lights[params.lightIndex];
        if (!l) return;
        l.kelvin = parseFloat(kelvinRangeEl.value) || 6500;
        const badge = $id('lightKelvinVal');
        if (badge) badge.textContent = String(Math.round(l.kelvin));
        updateKelvinSwatch(); applyParams();
      });
    }

    /*  资源导入 & 导出  */
    // 按钮触发隐藏 file input（比 label-wrapping 更可靠的跨浏览器方案）
    if ($id('hdrFileBtn')) $id('hdrFileBtn').addEventListener('click', () => { const el = $id('hdrFileInput'); if (el) el.click(); });
    if ($id('bgImageBtn'))  $id('bgImageBtn').addEventListener('click',  () => { const el = $id('bgImageInput'); if (el) el.click(); });

    const hdrLoader = new RGBELoader();
    if ($id('hdrFileInput')) $id('hdrFileInput').addEventListener('change', function () {
      const file = this.files && this.files[0];
      if (!file) return;
      setStatus(`HDR 载入中：${file.name}`);
      hdrLoader.load(URL.createObjectURL(file), (tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        hdrFileTexture = tex;
        params.envMode = 'HDRFile';
        const sel = $id('envModeSelect');
        if (sel) sel.value = 'HDRFile';
        updateEnvModeVisibility();
        applyParams();
        setStatus(`HDR 已载入：${file.name}`);
      }, undefined, () => setStatus('HDR 载入失败'));
    });

    if ($id('bgImageInput')) $id('bgImageInput').addEventListener('change', function () {
      const file = this.files && this.files[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => {
        hdriBgImage = img; params.envMode = 'Image';
        const sel = $id('envModeSelect');
        if (sel) sel.value = 'Image';
        updateEnvModeVisibility(); applyParams();
        setStatus(`背景图已加载：${file.name}`);
      };
      img.src = URL.createObjectURL(file);
    });

    let previewModel = null, gltfLoader = null, fbxLoader = null, objLoader = null;
    if (GLTFLoader) { try { gltfLoader = new GLTFLoader(); } catch (e) { gltfLoader = null; } }
    if (FBXLoader)  { try { fbxLoader  = new FBXLoader();  } catch (e) { fbxLoader = null; } }
    if (OBJLoader)  { try { objLoader  = new OBJLoader();  } catch (e) { objLoader = null; } }

    function placeModel(obj, name) {
      if (previewModel) scene.remove(previewModel);
      previewModel = obj;
      if (!previewModel) { setStatus('模型解析失败'); return; }
      const box = new THREE.Box3().setFromObject(previewModel);
      const size = box.getSize(new THREE.Vector3()).length();
      previewModel.scale.setScalar(size > 0 ? 1.6 / size : 1);
      const nb = new THREE.Box3().setFromObject(previewModel);
      previewModel.position.set(0, -nb.min.y, 0);
      scene.add(previewModel); setStatus(`模型已加载：${name}`);
    }

    if ($id('modelFileInput')) {
      $id('modelFileInput').addEventListener('change', function () {
        const file = this.files && this.files[0];
        if (!file) return;
        const ext = file.name.split('.').pop().toLowerCase();
        const url = URL.createObjectURL(file);
        setStatus(`模型加载中：${file.name}`);
        if ((ext === 'gltf' || ext === 'glb') && gltfLoader) {
          gltfLoader.load(url, (gltf) => placeModel(gltf.scene, file.name),
            undefined, (err) => { setStatus('模型加载失败'); console.error(err); });
        } else if (ext === 'fbx' && fbxLoader) {
          fbxLoader.load(url, (obj) => placeModel(obj, file.name),
            undefined, (err) => { setStatus('模型加载失败'); console.error(err); });
        } else if (ext === 'obj' && objLoader) {
          objLoader.load(url, (obj) => placeModel(obj, file.name),
            undefined, (err) => { setStatus('模型加载失败'); console.error(err); });
        } else {
          setStatus('不支持该模型格式，请使用 GLTF/GLB/FBX/OBJ');
        }
      });
    }
    if ($id('removeModelBtn')) $id('removeModelBtn').addEventListener('click', () => {
      if (previewModel) { scene.remove(previewModel); previewModel = null; setStatus('模型已移除'); }
    });

    /* 工程保存/载入 */
    if ($id('saveConfig')) $id('saveConfig').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ params, lights }, null, 2)], { type: 'application/json' }));
      a.download = 'hdri_project.json'; a.click(); URL.revokeObjectURL(a.href);
    });

    if ($id('loadConfig')) $id('loadConfig').addEventListener('change', async function () {
      const file = this.files && this.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (data.params) Object.assign(params, data.params);
        if (Array.isArray(data.lights) && data.lights.length) {
          lights.length = 0; data.lights.forEach((l) => lights.push(l));
        }
        const [w, h] = params.canvasSize.split('x').map(Number);
        _envCanvas.width = w; _envCanvas.height = h; // 同步环境 canvas 分辨率
        updateHdriCanvasStyle(); syncUIFromParams();
        selectLight(clamp(params.lightIndex || 0, 0, lights.length - 1));
        applyParams(); setStatus(`配置已载入：${file.name}`);
      } catch (e) { setStatus('配置读取失败'); console.error(e); }
    });

    /* ================================================================
     * 导出 HDR 数据（EXR / Radiance HDR）
     * 完全绕过 8-bit canvas 和 Three.js 颜色空间变换，直接从灯光参数和
     * 背景原始数据计算 float32 精度值，intensity=999 等超高值完整保留。
     * ================================================================ */

    /**
     * 构建导出用线性光照 float32 缓冲区（RGBA，resolution = ew×eh）。
     * – 背景 HDRFile：直接双线性采样 hdrFileTexture.image.data（RGBELoader 已解码为线性float）
     * – 背景 Image  ：从 hdriBgImage 读取 8-bit → gamma-2.2 解码 → 线性
     * – 背景 Solid/Gradient：hex→gamma-2.2→线性
     * – 灯光          ：color_linear × intensity × factor，intensity 可 > 1（如 999）
     */
    function buildExportHdrLinear(ew, eh) {
      const buf = new Float32Array(ew * eh * 4);
      function hex2lin(hex) {
        return [
          Math.pow(parseInt(hex.slice(1,3),16)/255, 2.2),
          Math.pow(parseInt(hex.slice(3,5),16)/255, 2.2),
          Math.pow(parseInt(hex.slice(5,7),16)/255, 2.2),
        ];
      }
      // --- 背景 ---
      if (params.envMode === 'HDRFile' && hdrFileTexture && hdrFileTexture.image && hdrFileTexture.image.data) {
        // 直接双线性采样 HDR float 纹理：值可以超过 1，完整保留
        const src = hdrFileTexture.image.data;  // Float32Array RGBA，已是线性
        const sw = hdrFileTexture.image.width, sh = hdrFileTexture.image.height;
        for (let row = 0; row < eh; row++) {
          for (let col = 0; col < ew; col++) {
            const sx = (col + 0.5) / ew * sw - 0.5;
            const sy = (row + 0.5) / eh * sh - 0.5;
            const x0 = Math.max(0, Math.min(sw-1, Math.floor(sx))), x1 = Math.min(sw-1, x0+1);
            const y0 = Math.max(0, Math.min(sh-1, Math.floor(sy))), y1 = Math.min(sh-1, y0+1);
            const fx = sx - Math.floor(sx), fy = sy - Math.floor(sy);
            const o = (row*ew+col)*4;
            for (let c = 0; c < 3; c++) {
              const v00=src[(y0*sw+x0)*4+c], v10=src[(y0*sw+x1)*4+c];
              const v01=src[(y1*sw+x0)*4+c], v11=src[(y1*sw+x1)*4+c];
              buf[o+c] = v00*(1-fx)*(1-fy) + v10*fx*(1-fy) + v01*(1-fx)*fy + v11*fx*fy;
            }
            buf[o+3] = 1;
          }
        }
      } else if (params.envMode === 'Image' && hdriBgImage) {
        const oc = document.createElement('canvas');
        oc.width = ew; oc.height = eh;
        const octx = oc.getContext('2d');
        octx.drawImage(hdriBgImage, 0, 0, ew, eh);
        const px = octx.getImageData(0, 0, ew, eh).data;
        for (let i = 0, pi = 0; i < ew * eh; i++, pi += 4) {
          buf[pi]   = Math.pow(px[pi]   /255, 2.2);
          buf[pi+1] = Math.pow(px[pi+1] /255, 2.2);
          buf[pi+2] = Math.pow(px[pi+2] /255, 2.2);
          buf[pi+3] = 1;
        }
      } else {
        for (let row = 0; row < eh; row++) {
          const v = (row + 0.5) / eh;
          let bgR, bgG, bgB;
          if (params.envMode === 'Solid') {
            [bgR, bgG, bgB] = hex2lin(params.solidColor || '#0b1120');
          } else {
            const [tr, tg, tb] = hex2lin(params.gradientTop    || '#1c3461');
            const [br, bg, bb] = hex2lin(params.gradientBottom || '#050c1a');
            bgR = tr*(1-v)+br*v; bgG = tg*(1-v)+bg*v; bgB = tb*(1-v)+bb*v;
          }
          for (let col = 0; col < ew; col++) {
            const o = (row*ew+col)*4;
            buf[o] = bgR; buf[o+1] = bgG; buf[o+2] = bgB; buf[o+3] = 1;
          }
        }
      }
      // --- 灯光（线性光照，intensity 可 >> 1）---
      for (const lt of lights) {
        if (lt.hidden) continue;
        const phi0_l = (0.5 - lt.y) * Math.PI;
        const sinP0 = Math.sin(phi0_l), cosP0 = Math.cos(phi0_l);
        const hexCol = lt.useKelvin ? kelvinToHex(lt.kelvin || 6500) : (lt.color || '#ffffff');
        const [cr, cg, cb] = hex2lin(hexCol);   // 线性 RGB ∈ [0, 1]
        const inten = lt.intensity || 1;         // 可以是 999 等超高值
        const fo = Math.max(0, lt.outerFalloff || 0);
        const so = clamp(lt.innerSoftness || 0, 0, 0.97);
        let maxAngR;
        if (lt.type === 'Circle' || lt.type === 'Octagon') maxAngR = lt.size * Math.PI * (1 + fo);
        else if (lt.type === 'Ring') maxAngR = lt.size * Math.PI * (1 + fo*0.65) + lt.size * Math.PI * (0.28 + so*0.60) * 0.5;
        else maxAngR = lt.size * Math.PI * 1.2 * (1 + fo);
        const pyT = Math.max(0,      Math.floor(lt.y * eh - maxAngR * eh / Math.PI) - 1);
        const pyB = Math.min(eh - 1, Math.ceil (lt.y * eh + maxAngR * eh / Math.PI) + 1);
        for (let row = pyT; row <= pyB; row++) {
          const v = (row + 0.5) / eh;
          const phi = (0.5 - v) * Math.PI;
          const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
          for (let col = 0; col < ew; col++) {
            const u = (col + 0.5) / ew;
            let minAngD = Infinity;
            for (let du = -1; du <= 1; du++) {
              const dLam = (u - lt.x + du) * 2 * Math.PI;
              const c = sinPhi*sinP0 + cosPhi*cosP0*Math.cos(dLam);
              const d = Math.acos(Math.max(-1, Math.min(1, c)));
              if (d < minAngD) minAngD = d;
            }
            let factor = 0;
            if (lt.type === 'Circle' || lt.type === 'Octagon') {
              const oTh = lt.size * Math.PI * (1 + fo), iTh = lt.size * Math.PI * so;
              if (minAngD < oTh) { const t = minAngD <= iTh ? 0 : (minAngD-iTh)/(oTh-iTh); factor = (1-t)*(1-t); }
            } else if (lt.type === 'Ring') {
              const ringTh = lt.size * Math.PI * (1 + fo*0.65);
              const lwTh = Math.max(1e-6, lt.size * Math.PI * (0.28 + so*0.60) * 0.5);
              const dist = Math.abs(minAngD - ringTh);
              if (dist < lwTh) factor = 1 - dist / lwTh;
            } else if (lt.type === 'Rect') {
              const rhO = lt.size * 0.65 * Math.PI * (1 + fo*0.40);
              const rwO = lt.size * 1.2  * Math.PI * (1 + fo*0.65);
              const dPhi = Math.abs((0.5-v)*Math.PI - phi0_l);
              let dLam2 = Infinity;
              for (let du = -1; du <= 1; du++) { const dl = Math.abs((u-lt.x+du)*2*Math.PI); if (dl < dLam2) dLam2 = dl; }
              if (dPhi <= rhO && dLam2 <= rwO) {
                const tP = so > 0 && dPhi  <= rhO*so ? 0 : (dPhi  - rhO*so) / Math.max(1e-10, rhO*(1-so));
                const tL = so > 0 && dLam2 <= rwO*so ? 0 : (dLam2 - rwO*so) / Math.max(1e-10, rwO*(1-so));
                factor = (1 - Math.max(tP, tL)) ** 2;
              }
            }
            if (factor <= 0) continue;
            const o = (row * ew + col) * 4;
            buf[o]   += cr * inten * factor;  // 白光 intensity=999 → 约 999.0，远超 1
            buf[o+1] += cg * inten * factor;
            buf[o+2] += cb * inten * factor;
          }
        }
      }
      return buf;
    }

    /**
     * 将 float32 RGBA 缓冲区写成最小化 OpenEXR（无压缩 scanline，B/G/R float32 通道）。
     * 完全不经过 Three.js，无任何颜色空间变换，写入的就是原始 float32 值。
     */
    function writeEXR(buf, ew, eh) {
      const enc = new TextEncoder();
      function i32(n)  { const b=new Uint8Array(4); new DataView(b.buffer).setInt32(0,n,true); return b; }
      function f32(n)  { const b=new Uint8Array(4); new DataView(b.buffer).setFloat32(0,n,true); return b; }
      function str0(s) { return new Uint8Array([...enc.encode(s), 0]); }
      function cat(arrays) {
        const tot = arrays.reduce((s,a)=>s+a.length,0);
        const out = new Uint8Array(tot); let off=0;
        for (const a of arrays) { out.set(a,off); off+=a.length; }
        return out;
      }
      function attr(name, type, val) { return cat([str0(name), str0(type), i32(val.length), val]); }

      // chlist: channels must be alphabetical → B, G, R
      const chls = [['B',2],['G',1],['R',0]]; // [name, buf_offset]
      const chlistParts = [];
      for (const [nm] of chls) {
        chlistParts.push(str0(nm), i32(2), new Uint8Array(4), i32(1), i32(1));
        // name\0, type=FLOAT(2), pLinear+reserved(4bytes), xSamp, ySamp
      }
      chlistParts.push(new Uint8Array([0])); // chlist terminator
      const chlist = cat(chlistParts);

      const box = cat([i32(0),i32(0),i32(ew-1),i32(eh-1)]);
      const header = cat([
        attr('channels',          'chlist',       chlist),
        attr('compression',       'compression',  new Uint8Array([0])), // NO_COMPRESSION
        attr('dataWindow',        'box2i',        box),
        attr('displayWindow',     'box2i',        box),
        attr('lineOrder',         'lineOrder',    new Uint8Array([0])), // INCREASING_Y
        attr('pixelAspectRatio',  'float',        f32(1)),
        attr('screenWindowCenter','v2f',           cat([f32(0),f32(0)])),
        attr('screenWindowWidth', 'float',        f32(1)),
        new Uint8Array([0]), // end-of-header
      ]);

      const magic   = new Uint8Array([0x76,0x2F,0x31,0x01]); // magic LE
      const version = new Uint8Array([2,0,0,0]);              // v2, single-part scanline

      const offsetTableSize    = eh * 8; // one uint64 per row
      const bytesPerRow        = ew * 4 * chls.length; // float32 × 3ch × ew pixels
      const scanRecordSize     = 8 + bytesPerRow;       // y(4) + dataSize(4) + data
      const firstScanlineOffset = magic.length + version.length + header.length + offsetTableSize;

      // Offset table (uint64 LE)
      const otBuf = new ArrayBuffer(offsetTableSize);
      const otView = new DataView(otBuf);
      for (let row = 0; row < eh; row++)
        otView.setBigUint64(row*8, BigInt(firstScanlineOffset + row*scanRecordSize), true);

      // Scanline data
      const scanBuf = new ArrayBuffer(eh * scanRecordSize);
      const sv = new DataView(scanBuf);
      for (let row = 0; row < eh; row++) {
        const base = row * scanRecordSize;
        sv.setInt32(base,   row,          true); // y
        sv.setInt32(base+4, bytesPerRow,  true); // dataSize
        let doff = base + 8;
        for (const [, ci] of chls) {             // B then G then R (alphabetical)
          for (let col = 0; col < ew; col++, doff += 4)
            sv.setFloat32(doff, buf[(row*ew+col)*4 + ci], true);
        }
      }

      return cat([magic, version, header, new Uint8Array(otBuf), new Uint8Array(scanBuf)]);
    }

    /* 导出 OpenEXR（float32，B/G/R 通道，intensity=999 → 文件中值为 999.0）*/
    if ($id('exportHdri')) $id('exportHdri').addEventListener('click', () => {
      try {
        setStatus('正在生成 EXR…');
        const ew = _envCanvas.width, eh = _envCanvas.height;
        const data = buildExportHdrLinear(ew, eh);
        const exr  = writeEXR(data, ew, eh);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([exr], { type: 'image/x-exr' }));
        a.download = 'hdri_canvas.exr'; a.click(); URL.revokeObjectURL(a.href);
        setStatus(`EXR 已导出（${ew}×${eh}，float32，无截幅）`);
      } catch (e) { setStatus('导出 EXR 失败'); console.error(e); }
    });

    /* 导出 Radiance HDR (.hdr，RGBE 编码，intensity=999 → exp+mantissa 完整保留）*/
    if ($id('exportHdr')) $id('exportHdr').addEventListener('click', () => {
      try {
        setStatus('正在生成 HDR…');
        const ew = _envCanvas.width, eh = _envCanvas.height;
        const data = buildExportHdrLinear(ew, eh);
        const enc  = new TextEncoder();
        const header = enc.encode(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\nEXPOSURE=1.0\n\n-Y ${eh} +X ${ew}\n`);
        const scan = new Uint8Array(ew * eh * 4);
        for (let i = 0; i < ew * eh; i++) {
          const r = data[i*4], g = data[i*4+1], b = data[i*4+2];
          const mx = Math.max(r, g, b);
          if (mx <= 1e-32) { scan[i*4]=scan[i*4+1]=scan[i*4+2]=scan[i*4+3]=0; continue; }
          // RGBE: mantissa = value / 2^(exp-128-8+1),  decode: (m+0.5)/256 * 2^(e-128)
          const exp = Math.floor(Math.log2(mx)) + 1;    // exponent
          const scale = Math.pow(2, 8 - exp);            // scale mantissa to [128,255]
          scan[i*4]   = clamp(Math.round(r * scale), 0, 255);
          scan[i*4+1] = clamp(Math.round(g * scale), 0, 255);
          scan[i*4+2] = clamp(Math.round(b * scale), 0, 255);
          scan[i*4+3] = clamp(exp + 128, 0, 255);
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([header, scan], { type: 'application/octet-stream' }));
        a.download = 'hdri_canvas.hdr'; a.click(); URL.revokeObjectURL(a.href);
        setStatus(`HDR 已导出（${ew}×${eh}，RGBE，无截幅）`);
      } catch (e) { setStatus('导出 HDR 失败'); console.error(e); }
    });

    // PNG 导出已移除（8-bit 无法保存 HDR 精度，请使用 EXR 或 HDR 格式）
    if ($id('exportPreview')) $id('exportPreview').style.display = 'none';

    /*  画布交互：拖动灯光（保留抓取偏移，防止灯光跳位）、滚轮调大小  */
    function pointerToUV(ev) {
      const r = hdriCanvas.getBoundingClientRect();
      return {
        x: clamp((ev.clientX - r.left) / r.width, 0, 1),
        y: clamp((ev.clientY - r.top) / r.height, 0, 1),
      };
    }

    function pickLight(uv) {
      const r = hdriCanvas.getBoundingClientRect();
      const w = r.width, h = r.height;
      const px = uv.x * w, py = uv.y * h;
      let hit = -1, best = Infinity;
      lights.forEach((light, idx) => {
        const lx = light.x * w, ly = light.y * h;
        const dist = Math.hypot(px - lx, py - ly);
        const radius = light.size * h * (1 + (light.outerFalloff || 0));
        const threshold = Math.max(12, radius * 0.4);
        if (dist <= threshold && dist < best) { best = dist; hit = idx; }
      });
      return hit;
    }

    // dragOffsetX/Y 记录点击时光标与灯光中心的偏移，避免灯光跳到光标处
    let dragging = false, pendingPick = -1, downUV = null;
    let dragOffsetX = 0, dragOffsetY = 0;
    const DRAG_THRESH = 0.004;

    hdriCanvas.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return; // 仅左键拖拽
      const uv = pointerToUV(ev);
      const idx = pickLight(uv);
      downUV = uv; pendingPick = idx; dragging = false;
      if (idx >= 0) {
        dragOffsetX = lights[idx].x - uv.x;
        dragOffsetY = lights[idx].y - uv.y;
        if (params.lightIndex !== idx) { selectLight(idx); applyParams(); }
        try { hdriCanvas.setPointerCapture(ev.pointerId); } catch (e) {}
      }
    });

    hdriCanvas.addEventListener('pointermove', (ev) => {
      const uv = pointerToUV(ev);
      if (pendingPick < 0) { hoveredIdx = pickLight(uv); drawHdriCanvas(); return; }
      const moved = downUV ? Math.hypot(uv.x - downUV.x, uv.y - downUV.y) : 0;
      if (!dragging && moved < DRAG_THRESH) { hoveredIdx = pickLight(uv); drawHdriCanvas(); return; }
      dragging = true; params.lightIndex = pendingPick;
      lights[pendingPick].x = clamp(uv.x + dragOffsetX, 0, 1);
      lights[pendingPick].y = clamp(uv.y + dragOffsetY, 0, 1);
      syncActiveLightToUI(); applyParams();
    });

    const stopDrag = (ev) => {
      pendingPick = -1; downUV = null; dragging = false;
      try { if (typeof ev.pointerId === 'number') hdriCanvas.releasePointerCapture(ev.pointerId); } catch (e) {}
    };
    hdriCanvas.addEventListener('pointerup', stopDrag);
    hdriCanvas.addEventListener('pointercancel', stopDrag);
    hdriCanvas.addEventListener('pointerleave', (ev) => {
      hoveredIdx = -1; drawHdriCanvas();
      if (ev.buttons === 0) stopDrag(ev);
    });

    hdriCanvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const l = lights[params.lightIndex];
      if (!l) return;
      l.size = clamp(l.size + (ev.deltaY > 0 ? -0.012 : 0.012), 0.02, 0.8);
      syncActiveLightToUI(); applyParams();
    }, { passive: false });

    /* ─── float32 像素检视器 ─── */
    const inspectorEl = $id('hdrInspector');
    const ctxMenuEl   = $id('hdrCtxMenu');

    /**
     * 逐灯光解析取样：在 (u,v) 处对所有灯光求解析和，返回真正的 HDR float 值。
     * 不受 canvas 8-bit 截幅限制，intensity=999 时会返回 999。
     */
    function sampleHdrAt(u, v) {
      const phi    = (0.5 - v) * Math.PI;
      const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
      let hr = 0, hg = 0, hb = 0;

      for (const lt of lights) {
        if (lt.hidden) continue;

        const phi0_l  = (0.5 - lt.y) * Math.PI;
        const sinP0   = Math.sin(phi0_l), cosP0 = Math.cos(phi0_l);

        // Find angular distance, considering horizontal wrap-around (360°)
        let minAngD = Infinity;
        for (const du of [0, -1, 1]) {
          const dLam  = (u - lt.x + du) * 2 * Math.PI;
          const cosAD = sinPhi * sinP0 + cosPhi * cosP0 * Math.cos(dLam);
          const angD  = Math.acos(Math.max(-1, Math.min(1, cosAD)));
          if (angD < minAngD) minAngD = angD;
        }

        let factor = 0;
        const lry = lt.size;

        if (lt.type === 'Circle' || lt.type === 'Octagon') {
          const fo  = Math.max(0, lt.outerFalloff || 0);
          const so  = Math.max(0, lt.innerSoftness || 0);
          const oTh = lry * Math.PI * (1 + fo);
          const iTh = lry * Math.PI * so;
          if (minAngD < oTh) {
            if (minAngD <= iTh) {
              factor = 1.0;
            } else {
              const t = (minAngD - iTh) / (oTh - iTh);
              factor = (t <= 0.7) ? (1 - 0.45 * t / 0.7) : 0.55 * (1 - (t - 0.7) / 0.3);
            }
          }
        } else if (lt.type === 'Ring') {
          const fo     = Math.max(0, lt.outerFalloff || 0);
          const so     = Math.max(0, lt.innerSoftness || 0);
          const ringTh = lry * Math.PI * (1 + fo * 0.65);
          const lwTh   = Math.max(0.001, lry * Math.PI * (0.28 + so * 0.60) * 0.5);
          const dist   = Math.abs(minAngD - ringTh);
          if (dist < lwTh) factor = 1 - dist / lwTh;
        } else if (lt.type === 'Rect') {
          const fo  = Math.max(0, lt.outerFalloff || 0);
          const so  = Math.max(0, lt.innerSoftness || 0);
          const rwTh = lry * Math.PI * 1.2 * (1 + fo * 0.65);
          const rhTh = lry * Math.PI * 0.65 * (1 + fo * 0.40);
          const maxR = Math.max(rwTh, rhTh);
          if (minAngD < maxR) {
            const blurNorm = lry * Math.PI * (0.22 + so * 0.45 + fo * 0.35);
            factor = Math.max(0, 1 - (minAngD - maxR * (1 - blurNorm / maxR)) / blurNorm);
          }
        }

        if (factor <= 0) continue;
        const hexCol = lt.useKelvin ? kelvinToHex(lt.kelvin || 6500) : (lt.color || '#ffffff');
        const cr = parseInt(hexCol.slice(1, 3), 16) / 255;
        const cg = parseInt(hexCol.slice(3, 5), 16) / 255;
        const cb = parseInt(hexCol.slice(5, 7), 16) / 255;
        const inten = lt.intensity || 1;
        hr += cr * inten * factor;
        hg += cg * inten * factor;
        hb += cb * inten * factor;
      }
      return { hr, hg, hb };
    }

    /**
     * 读取画布当前像素并返回 sRGB 8-bit、linear float 及解析 HDR float。
     */
    function getPixelInfo(ev) {
      const r  = hdriCanvas.getBoundingClientRect();
      const u  = clamp((ev.clientX - r.left) / r.width,  0, 1);
      const v  = clamp((ev.clientY - r.top)  / r.height, 0, 1);
      const pw = _envCanvas.width, ph = _envCanvas.height;
      const px = clamp(Math.round(u * pw), 0, pw - 1);
      const py = clamp(Math.round(v * ph), 0, ph - 1);
      const d  = _envCtx.getImageData(px, py, 1, 1).data;
      const toLin = (b) => Math.pow(b / 255, 2.2);
      const [r8, g8, b8] = [d[0], d[1], d[2]];
      const [rl, gl, bl] = [toLin(r8), toLin(g8), toLin(b8)];
      const lon = Math.round(u * 360);
      const lat = Math.round((0.5 - v) * 180);
      const hex = '#' + [r8, g8, b8].map((x) => x.toString(16).padStart(2, '0')).join('');
      const hdr = sampleHdrAt(u, v);
      return { r8, g8, b8, rl, gl, bl, lon, lat, hex, u, v, hdr };
    }

    hdriCanvas.addEventListener('mousemove', (ev) => {
      if (!inspectorEl) return;
      const p = getPixelInfo(ev);
      const f3 = (v) => v.toFixed(3);
      const fH = (v) => v < 10 ? v.toFixed(3) : v.toFixed(1);  // HDR: 3 decimals for <10, 1 for big values
      inspectorEl.innerHTML =
        `<div class="insp-hex"><div class="insp-swatch" style="background:${p.hex}"></div>${p.hex}</div>` +
        `<div class="insp-row">sRGB <b>${p.r8},${p.g8},${p.b8}</b></div>` +
        `<div class="insp-row">Linear <b>${f3(p.rl)}, ${f3(p.gl)}, ${f3(p.bl)}</b></div>` +
        `<div class="insp-row">HDR <b>${fH(p.hdr.hr)}, ${fH(p.hdr.hg)}, ${fH(p.hdr.hb)}</b></div>` +
        `<div class="insp-row">经 ${p.lon}°  纬 ${p.lat}°</div>`;
      const wr = inspectorEl.parentElement.getBoundingClientRect();
      const relX = ev.clientX - wr.left + 14;
      const relY = ev.clientY - wr.top  + 14;
      inspectorEl.style.left = `${relX + 180 > wr.width - 8 ? relX - 200 : relX}px`;
      inspectorEl.style.top  = `${Math.min(relY, wr.height - 110)}px`;
      inspectorEl.style.display = '';
    });

    hdriCanvas.addEventListener('mouseleave', () => {
      if (inspectorEl) inspectorEl.style.display = 'none';
    });

    /* 右键：详细颜色信息弹出框 */
    hdriCanvas.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      const p = getPixelInfo(ev);
      const f4 = (v) => v.toFixed(4);
      const fH = (v) => v < 10 ? v.toFixed(4) : v.toFixed(2);
      const lumL = 0.2126 * p.rl + 0.7152 * p.gl + 0.0722 * p.bl;
      const rows = [
        `sRGB (8-bit):  R=${p.r8}  G=${p.g8}  B=${p.b8}`,
        `sRGB (0-1):    R=${f4(p.r8/255)}  G=${f4(p.g8/255)}  B=${f4(p.b8/255)}`,
        `Linear:        R=${f4(p.rl)}  G=${f4(p.gl)}  B=${f4(p.bl)}`,
        `HDR (float):   R=${fH(p.hdr.hr)}  G=${fH(p.hdr.hg)}  B=${fH(p.hdr.hb)}`,
        `亮度 (linear): ${f4(lumL)}`,
        `经 ${p.lon}°  纬 ${p.lat}°`,
      ];
      if (!ctxMenuEl) return;
      ctxMenuEl.innerHTML =
        `<div class="ctx-title">像素检视</div>` +
        `<div class="ctx-swatch-row"><div class="ctx-swatch" style="background:${p.hex}"></div><span>${p.hex}</span></div>` +
        rows.map((t) => `<div class="ctx-row">${t}</div>`).join('') +
        `<div class="ctx-copy-btn" id="ctxCopyBtn">复制到剪贴板</div>`;
      const wr   = ctxMenuEl.parentElement.getBoundingClientRect();
      const relX = ev.clientX - wr.left;
      const relY = ev.clientY - wr.top;
      ctxMenuEl.style.left    = `${clamp(relX, 4, wr.width  - 270)}px`;
      ctxMenuEl.style.top     = `${clamp(relY, 4, wr.height - 200)}px`;
      ctxMenuEl.style.display = '';
      const copyBtn = document.getElementById('ctxCopyBtn');
      if (copyBtn) copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(`HEX: ${p.hex}\n` + rows.join('\n')).catch(() => {});
        ctxMenuEl.style.display = 'none';
      }, { once: true });
    });

    // 点击其他地方关闭上下文菜单
    document.addEventListener('pointerdown', (ev) => {
      if (ctxMenuEl && !ctxMenuEl.contains(ev.target)) ctxMenuEl.style.display = 'none';
    }, { capture: true });

    /* 伪彩色复选框 */
    const fcEl = $id('falseColorCheck');
    if (fcEl) fcEl.addEventListener('change', () => { params.falseColor = fcEl.checked; drawHdriCanvas(); });

    /* 显示范围重映射（Range 控件） */
    const rmInEl = $id('rangeMinInput'), rmaxEl = $id('rangeMaxInput');

    // 动态上限：取所有灯光最大亮度 × 1.5，确保拖动条能覆盖整个 HDR 范围
    function getAutoMax() {
      const maxI = lights.reduce((m, l) => Math.max(m, l.intensity || 1), 1);
      // 取一个「整齐」的上限：10 的幂次附近
      const raw = Math.max(1, maxI * 1.5);
      const mag = Math.pow(10, Math.floor(Math.log10(raw)));
      return Math.ceil(raw / mag) * mag;
    }

    function updateRangeBar() {
      const fill = $id('rangeBarFill');
      if (!fill) return;
      const autoMax = getAutoMax();
      // thumb / fill 位置按 [0, autoMax] 归一化到 [0%, 100%]
      const lo = clamp(params.rangeMin / autoMax, 0, 1);
      const hi = clamp(params.rangeMax / autoMax, 0, 1);
      fill.style.left  = `${lo * 100}%`;
      fill.style.width = `${Math.max(0, hi - lo) * 100}%`;
      const tl = $id('rangThumbL'), tr = $id('rangThumbR');
      if (tl) tl.style.left = `${lo * 100}%`;
      if (tr) tr.style.left = `${hi * 100}%`;
    }
    const applyRange = () => {
      let minV = parseFloat(rmInEl ? rmInEl.value : '0');
      let maxV = parseFloat(rmaxEl ? rmaxEl.value : '1');
      if (isNaN(minV)) minV = 0;
      if (isNaN(maxV)) maxV = 1;
      params.rangeMin = Math.max(0, minV);
      params.rangeMax = Math.max(params.rangeMin + 0.001, maxV);
      updateRangeBar();
      drawHdriCanvas();
    };
    if (rmInEl) { rmInEl.addEventListener('change', applyRange); rmInEl.addEventListener('input', applyRange); }
    if (rmaxEl) { rmaxEl.addEventListener('change', applyRange); rmaxEl.addEventListener('input', applyRange); }
    const rrBtn = $id('rangeResetBtn');
    if (rrBtn) rrBtn.addEventListener('click', () => {
      params.rangeMin = 0; params.rangeMax = 1;
      if (rmInEl) rmInEl.value = '0.00';
      if (rmaxEl) rmaxEl.value = '1.00';
      updateRangeBar(); drawHdriCanvas();
    });

    /* Range bar 拖动滑块 */
    const rTrack = $id('rangeBarTrack');
    if (rTrack) {
      // Inject two draggable thumb handles
      const thumbL = document.createElement('div');
      const thumbR = document.createElement('div');
      thumbL.id = 'rangThumbL'; thumbL.className = 'range-thumb range-thumb-l'; thumbL.title = '拖动最小值';
      thumbR.id = 'rangThumbR'; thumbR.className = 'range-thumb range-thumb-r'; thumbR.title = '拖动最大值';
      rTrack.appendChild(thumbL); rTrack.appendChild(thumbR);

      let _dh = null; // drag handle: 'min' | 'max'

      function getTrackU(clientX) {
        const r = rTrack.getBoundingClientRect();
        return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      }

      function commitRangeDrag(u) {
        // u ∈ [0,1]（轨道归一化），乘以 autoMax 得到真实 HDR float 值
        const autoMax = getAutoMax();
        const val = u * autoMax;
        if (_dh === 'min') {
          params.rangeMin = clamp(val, 0, params.rangeMax - 0.001);
          if (rmInEl) rmInEl.value = params.rangeMin.toFixed(3);
        } else {
          params.rangeMax = Math.max(params.rangeMin + 0.001, val);
          if (rmaxEl) rmaxEl.value = params.rangeMax.toFixed(3);
        }
        updateRangeBar(); drawHdriCanvas();
      }

      function startDrag(e, handle) {
        _dh = handle;
        (e.currentTarget || rTrack).setPointerCapture(e.pointerId);
        commitRangeDrag(getTrackU(e.clientX));
        e.preventDefault(); e.stopPropagation();
      }
      function onPM(e) { if (_dh) { commitRangeDrag(getTrackU(e.clientX)); e.preventDefault(); } }
      function onPU()  { _dh = null; }

      thumbL.addEventListener('pointerdown', (e) => startDrag(e, 'min'));
      thumbR.addEventListener('pointerdown', (e) => startDrag(e, 'max'));
      thumbL.addEventListener('pointermove', onPM);
      thumbR.addEventListener('pointermove', onPM);
      thumbL.addEventListener('pointerup', onPU);
      thumbR.addEventListener('pointerup', onPU);

      // Click on track (not on thumb) → set whichever end is closer
      rTrack.addEventListener('pointerdown', (e) => {
        if (e.target === thumbL || e.target === thumbR) return;
        const u  = getTrackU(e.clientX);
        const lo = clamp(params.rangeMin, 0, 1), hi = clamp(params.rangeMax, 0, 1);
        startDrag(e, Math.abs(u - lo) < Math.abs(u - hi) ? 'min' : 'max');
      });
      rTrack.addEventListener('pointermove', onPM);
      rTrack.addEventListener('pointerup',   onPU);
    }
    updateRangeBar();

    /*  响应式尺寸  */
    function resize() {
      const previewCard = container.querySelector('.preview-card');
      const ww = Math.max(240, glCanvas.parentElement.clientWidth || 960);
      const height = previewCard
        ? clamp(previewCard.clientHeight - 2, 240, 960)
        : clamp(Math.round(ww * 0.58), 240, 960);
      renderer.setSize(ww, height, false);
      camera.aspect = ww / height; camera.updateProjectionMatrix();
      syncHdriCanvasResolution(); rebuildEnvFromCanvas();
    }

    /*  亮度直方图  */
    const histCanvas = document.createElement('canvas');
    histCanvas.width = 256; histCanvas.height = 72; histCanvas.className = 'hist-canvas';
    const histCtxH = histCanvas.getContext('2d');
    const histWrap = $id('histWrap');
    if (histWrap) {
      const t = document.createElement('div'); t.className = 'hist-title'; t.textContent = '亮度直方图';
      histWrap.appendChild(t); histWrap.appendChild(histCanvas);
    }

    setInterval(() => {
      try {
        const sw = Math.min(512, renderer.domElement.width), sh = Math.min(256, renderer.domElement.height);
        const tmp = document.createElement('canvas'); tmp.width = sw; tmp.height = sh;
        tmp.getContext('2d').drawImage(renderer.domElement, 0, 0, sw, sh);
        const imgd = tmp.getContext('2d').getImageData(0, 0, sw, sh).data;
        const bins = new Uint32Array(256);
        for (let i = 0; i < imgd.length; i += 4) {
          bins[clamp(Math.round(0.2126 * imgd[i] + 0.7152 * imgd[i + 1] + 0.0722 * imgd[i + 2]), 0, 255)]++;
        }
        const mx = Math.max(...bins, 1);
        histCtxH.fillStyle = '#071220'; histCtxH.fillRect(0, 0, 256, 72);
        for (let x = 0; x < 256; x++) {
          const bh = Math.floor(bins[x] / mx * 68);
          histCtxH.fillStyle = x < 85 ? '#3b82f6' : x < 170 ? '#22d3ee' : '#f0f0f0';
          histCtxH.fillRect(x, 72 - bh, 1, bh);
        }
      } catch (e) { /* ignore */ }
    }, 1000);

    /*  全量 UI 同步（从 params 刷新所有控件）  */
    function syncUIFromParams() {
      const set = (id, v) => { const el = $id(id); if (el) el.value = v; };
      const setChk = (id, v) => { const el = $id(id); if (el) el.checked = !!v; };
      const setBadge = (id, v) => { const el = $id(id); if (el) el.textContent = v; };
      set('envModeSelect', params.envMode);
      set('canvasSizeSelect', params.canvasSize);
      set('solidColorInput', params.solidColor);
      set('gradTopInput', params.gradientTop);
      set('gradBotInput', params.gradientBottom);
      set('envRotRange', params.envRotation); setBadge('envRotVal', `${Math.round(params.envRotation)}`);
      setChk('showBgCheck', params.showBackground);
      setChk('sphereGridCheck', params.showSphereGrid);
      setChk('sphereGridCheck2', params.showSphereGrid);
      set('brightnessRange', params.brightness); setBadge('brightnessVal', `${params.brightness >= 0 ? '+' : ''}${params.brightness.toFixed(2)} EV`);
      set('contrastRange', params.contrast); setBadge('contrastVal', params.contrast.toFixed(2));
      set('saturationRange', params.saturation); setBadge('saturationVal', params.saturation.toFixed(2));
      set('hueShiftRange', params.hueShift); setBadge('hueShiftVal', `${Math.round(params.hueShift)}`);
      set('bgBlurRange', params.bgBlur); setBadge('bgBlurVal', params.bgBlur.toFixed(2));
      set('rangeMinInput', (params.rangeMin ?? 0).toFixed(2));
      set('rangeMaxInput', (params.rangeMax ?? 1).toFixed(2));
      updateRangeBar();
      set('exposureRange', params.exposure); setBadge('exposureVal', `${params.exposure >= 0 ? '+' : ''}${params.exposure.toFixed(2)} EV`);
      set('toneMappingSelect', params.toneMapping);
      set('envIntensRange', params.envIntensity); setBadge('envIntensVal', params.envIntensity.toFixed(2));
      set('modelSelect', params.model);
      set('metalnessRange', params.metalness); setBadge('metalnessVal', params.metalness.toFixed(2));
      set('roughnessRange', params.roughness); setBadge('roughnessVal', params.roughness.toFixed(2));
      setChk('autoRotateCheck', params.autoRotate);
      set('keyRange', params.keyIntensity); setBadge('keyVal', params.keyIntensity.toFixed(2));
      set('fillRange', params.fillIntensity); setBadge('fillVal', params.fillIntensity.toFixed(2));
      set('rimRange', params.rimIntensity); setBadge('rimVal', params.rimIntensity.toFixed(2));
      set('spotRange', params.spotIntensity); setBadge('spotVal', params.spotIntensity.toFixed(2));
      set('hemiRange', params.hemiIntensity); setBadge('hemiVal', params.hemiIntensity.toFixed(2));
      set('ambRange', params.ambientIntensity); setBadge('ambVal', params.ambientIntensity.toFixed(2));
      updateEnvModeVisibility();
    }

    /*  动画循环  */
    function animate() {
      orbit.update();
      if (params.autoRotate) { knot.rotation.x += 0.003; knot.rotation.y += 0.005; sphere.rotation.y -= 0.002; }
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }

    /*  启动  */
    setTimeout(syncHdriCanvasResolution, 0);
    updateHdriCanvasStyle();
    refreshLightPicker();
    syncActiveLightToUI();
    window.addEventListener('resize', resize);
    resize();
    applyParams();
    animate();
  };
})();
