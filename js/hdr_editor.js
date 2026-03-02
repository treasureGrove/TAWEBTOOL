/*
  全功能 HDR 编辑器（重写）：
  - 使用 three.js + RGBELoader + OrbitControls
  - 使用 lil-gui 构建左侧控制面板（CDN）
  - 支持灯光列表、单灯编辑、HDR/背景导入、导出、PMREM 环境
*/

(function () {
  async function importFromCandidates(candidates) {
    let lastErr = null;
    for (const u of candidates) {
      try {
        return await import(u);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('import failed');
  }

  async function loadDeps() {
    const threeCandidates = ['three', 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js'];
    const rgbeCandidates = [
      'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/RGBELoader.js',
      'https://unpkg.com/three@0.160.0/examples/jsm/loaders/RGBELoader.js'
    ];
    const controlsCandidates = [
      'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js',
      'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js'
    ];
    const gltfLoaderCandidates = [
      'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js',
      'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js'
    ];
    const exrExporterCandidates = [
      'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/exporters/EXRExporter.js',
      'https://unpkg.com/three@0.160.0/examples/jsm/exporters/EXRExporter.js'
    ];

    const [THREE, rgbe, controls, gltfMod, exrMod] = await Promise.all([
      importFromCandidates(threeCandidates),
      importFromCandidates(rgbeCandidates),
      importFromCandidates(controlsCandidates),
      importFromCandidates(gltfLoaderCandidates),
      importFromCandidates(exrExporterCandidates)
    ]);

    return {
      THREE,
      RGBELoader: rgbe.RGBELoader,
      OrbitControls: controls.OrbitControls,
      GLTFLoader: gltfMod && (gltfMod.GLTFLoader || gltfMod.default && gltfMod.default.GLTFLoader) ? (gltfMod.GLTFLoader || gltfMod.default.GLTFLoader) : null,
      EXRExporter: exrMod && (exrMod.EXRExporter || exrMod.default && exrMod.default.EXRExporter) ? (exrMod.EXRExporter || exrMod.default.EXRExporter) : null
    };
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  const TYPE_LABEL = { Circle: '圆形', Rect: '矩形', Octagon: '八边形', Ring: '环形' };
  const ENV_MODE_LABEL = { Solid: '纯色', Gradient: '渐变', Image: '背景图', HDRFile: 'HDR 文件' };
  const MODEL_LABEL = { Both: '双模型', Sphere: '球体', Knot: '扭结体' };
  const TONE_LABEL = { ACES: 'ACES', Reinhard: 'Reinhard', Cineon: 'Cineon', Neutral: '中性', None: '关闭' };

  function labelForValue(v) {
    return TYPE_LABEL[v] || ENV_MODE_LABEL[v] || MODEL_LABEL[v] || TONE_LABEL[v] || v;
  }

  function makeDefaultLight(type, idx) {
    return {
      name: `${TYPE_LABEL[type] || type}灯 ${idx + 1}`,
      type,
      x: 0.2 + (idx % 3) * 0.25,
      y: 0.25 + (idx % 2) * 0.15,
      size: 0.12,
      color: '#ffffff',
      useKelvin: false,
      kelvin: 6500,
      intensity: 1.4,
      outerFalloff: 1.1,
      innerSoftness: 0.25
    };
  }

  window.initHdrEditorTool = async function initHdrEditorTool(host) {
    host = host || document.body;

    const container = host.querySelector('#hdrToolContainer') || host;
    container.innerHTML = `
      <div class="hdr-grid-main">
        <div class="card-lite left-panel" id="leftPanel">

          <div class="panel-section gui-merged-panel" data-section-title="完整参数">
            <div id="guiDock"></div>
          </div>

          <div class="panel-section" data-section-title="灯光创建">
            <button id="addCircleBtn" class="secondary">圆形灯</button>
            <button id="addRectBtn" class="secondary">矩形灯</button>
            <button id="addOctagonBtn" class="secondary">八边形灯</button>
            <button id="addRingBtn" class="secondary">环形灯</button>
          </div>

          <div class="panel-section" data-section-title="资源导入">
            <label class="hdr-file-btn">导入HDR <input id="hdrFileInput" type="file" accept=".hdr,image/vnd.radiance" /></label>
            <label class="hdr-file-btn">背景图 <input id="bgImageInput" type="file" accept="image/*" /></label>
            <label class="hdr-file-btn">上传模型 <input id="modelFileInput" type="file" accept=".gltf,.glb" /></label>
            <button id="removeModelBtn" class="secondary">移除模型</button>
          </div>


          <div class="panel-section active-light-editor" data-section-title="选中灯光调节">
            <label>光源形状
              <select id="activeLightType">
                <option value="Circle">圆形光</option>
                <option value="Rect">矩形光</option>
                <option value="Octagon">八边光</option>
                <option value="Ring">环形光</option>
              </select>
            </label>
            <label>亮度 <span id="activeIntensityValue">1.40</span>
              <input id="activeIntensityRange" type="range" min="0" max="5" step="0.01" />
            </label>
            <label>外侧衰减 <span id="activeFalloffValue">1.10</span>
              <input id="activeFalloffRange" type="range" min="0" max="2" step="0.01" />
            </label>
            <label>内侧柔化 <span id="activeSoftnessValue">0.25</span>
              <input id="activeSoftnessRange" type="range" min="0" max="1" step="0.01" />
            </label>
            <label>颜色
              <input id="activeColorInput" type="color" />
            </label>
            <label class="active-inline-check"><input id="activeUseKelvin" type="checkbox" /> 使用色温</label>
            <label>色温(K) <span id="activeKelvinValue">6500</span>
              <input id="activeKelvinRange" type="range" min="1000" max="20000" step="10" />
            </label>
          </div>

          <div class="panel-section light-list-block" data-section-title="灯光列表">
            <div class="selection-hint">当前选中会在右侧画布显示 <span>青色高亮</span></div>
            <select id="lightPicker" size="7"></select>
            <div class="light-meta" id="activeLightMeta">当前灯：-</div>
            <label class="size-label">选中灯大小 <span id="activeSizeValue">0.12</span>
              <input id="activeSizeRange" type="range" min="0.02" max="0.8" step="0.005" value="0.12" />
            </label>
            <div class="inline-actions">
              <button id="duplicateLightBtn" class="secondary">复制</button>
              <button id="removeLightBtn" class="secondary">删除</button>
            </div>
          </div>
        </div>

        <div class="hdr-canvas-wrap">
          <div class="canvas-card hdri-edit-card">
            <div class="canvas-help">点击灯光手柄选中，拖动移动；滚轮调整大小</div>
            <canvas id="hdriCanvas" width="2048" height="1024"></canvas>
          </div>
          <div class="canvas-card preview-card">
            <div id="viewportWrap" class="hdr-canvas-3d">
              <canvas id="hdrEditorCanvas"></canvas>
            </div>
          </div>

          <div class="canvas-card utility-card" data-section-title="提示与导出">
            <div class="utility-grid">
              <div class="panel-guide utility-guide">
                <div class="guide-title">操作提示</div>
                <ul>
                  <li>① 先在左侧灯光列表选中灯，或直接点选 HDR 画布手柄。</li>
                  <li>② 拖动手柄修改灯位，滚轮可快速调整当前灯大小。</li>
                  <li>③ 用下方导出区域保存工程配置、HDR 贴图与预览图。</li>
                </ul>
              </div>
              <div class="utility-actions">
                <div class="utility-title">工程与导出</div>
                <div class="utility-btns">
                  <button id="saveConfig" class="secondary">导出配置</button>
                  <label class="hdr-file-btn">导入配置 <input id="loadConfig" type="file" accept=".json"/></label>
                  <button id="exportHdri" class="secondary">导出 HDR EXR</button>
                  <button id="exportPreview">导出预览 PNG</button>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    `;

    function enhanceLeftPanelUI() {
      const sections = Array.from(container.querySelectorAll('.panel-section'));
      const collapsedByDefault = new Set();
      sections.forEach((sec) => {
        const title = sec.getAttribute('data-section-title');
        if (!title) return;
        const head = document.createElement('div');
        head.className = 'panel-section-head';
        const txt = document.createElement('span');
        txt.textContent = title;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'panel-collapse-btn';
        btn.textContent = '收起';
        head.append(txt, btn);
        sec.prepend(head);

        const applyCollapsedState = (collapsed) => {
          sec.classList.toggle('collapsed', collapsed);
          btn.textContent = collapsed ? '展开' : '收起';
          btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        };

        applyCollapsedState(collapsedByDefault.has(title));
        btn.addEventListener('click', () => {
          applyCollapsedState(!sec.classList.contains('collapsed'));
        });
      });
    }

    enhanceLeftPanelUI();

    const statusEl = host.querySelector('#hdrStatus') || document.createElement('div');

    let THREE, RGBELoader, OrbitControls, GLTFLoader, EXRExporter;
    try {
      const deps = await loadDeps();
      THREE = deps.THREE;
      RGBELoader = deps.RGBELoader;
      OrbitControls = deps.OrbitControls;
      GLTFLoader = deps.GLTFLoader;
      EXRExporter = deps.EXRExporter;
    } catch (e) {
      container.innerHTML = '<div class="result-box">依赖加载失败，请检查 CDN 与网络控制台。</div>';
      console.error(e);
      return;
    }

    // DOM refs
    const hdriCanvas = container.querySelector('#hdriCanvas');
    const hdriCtx = hdriCanvas.getContext('2d');
    const canvas = container.querySelector('#hdrEditorCanvas');
    const lightPicker = container.querySelector('#lightPicker');

    let _hdri_dpr = window.devicePixelRatio || 1;
    function syncHdriCanvasResolution() {
      // ensure canvas internal bitmap matches displayed size * DPR so drawing and picking align
      try {
        const rect = hdriCanvas.getBoundingClientRect();
        const clientW = Math.max(1, Math.round(rect.width));
        const clientH = Math.max(1, Math.round(rect.height));
        const dpr = window.devicePixelRatio || 1;
        _hdri_dpr = dpr;
        // set CSS size to keep layout, but adjust internal resolution
        hdriCanvas.style.width = '100%';
        hdriCanvas.style.height = 'auto';
        hdriCanvas.style.aspectRatio = `${clientW} / ${clientH}`;
        // set internal size in device pixels
        hdriCanvas.width = Math.max(1, Math.round(clientW * dpr));
        hdriCanvas.height = Math.max(1, Math.round(clientH * dpr));
        // make drawing commands use CSS (client) pixel coords
        hdriCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      } catch (e) {
        // ignore
      }
    }
    // initial sync after DOM insertion
    setTimeout(syncHdriCanvasResolution, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1120);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(0, 2.3, 7.5);

    const orbit = new OrbitControls(camera, canvas);
    orbit.enableDamping = true;
    orbit.target.set(0, 1.1, 0);

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.88, metalness: 0.03 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const sphereMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.85, roughness: 0.25 });
    const knotMat = new THREE.MeshStandardMaterial({ color: 0x93c5fd, metalness: 0.5, roughness: 0.35 });

    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), sphereMat);
    sphere.position.set(-1.7, 1.02, 0);
    scene.add(sphere);

    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.27, 220, 32), knotMat);
    knot.position.set(1.9, 1.2, 0);
    scene.add(knot);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(5, 6, 4);
    const fillLight = new THREE.PointLight(0xbddbff, 0.8, 30, 2);
    fillLight.position.set(-4, 3, 3);
    const rimLight = new THREE.DirectionalLight(0xffe6d1, 1.5);
    rimLight.position.set(-3, 4, -6);
    const spotLight = new THREE.SpotLight(0xffffff, 0, 40, Math.PI / 6, 0.35, 1);
    spotLight.position.set(2.8, 5.5, 2.4);
    spotLight.target.position.set(0, 0.9, 0);
    const hemiLight = new THREE.HemisphereLight(0x94b8ff, 0x2b1b10, 0.4);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
    scene.add(keyLight, fillLight, rimLight, spotLight, spotLight.target, hemiLight, ambientLight);

    const params = {
      canvasSize: '2048x1024',
      envMode: 'Gradient',
      solidColor: '#101828',
      gradientTop: '#1e293b',
      gradientBottom: '#0b1120',
      envIntensity: 1.4,
      envRotation: 0,
      bgBlur: 0.03,
      showBackground: true,
      exposure: 0,
      saturation: 1,
      toneMapping: 'ACES',
      model: 'Both',
      autoRotate: true,
      lightIndex: 0,
      keyIntensity: 2.5,
      fillIntensity: 0.8,
      rimIntensity: 1.5,
      spotIntensity: 0,
      hemiIntensity: 0.4,
      ambientIntensity: 0.1,
      metalness: 0.8,
      roughness: 0.25
    };

    const lights = [
      makeDefaultLight('Circle', 0),
      makeDefaultLight('Rect', 1),
      makeDefaultLight('Ring', 2)
    ];

    const active = Object.assign({}, lights[0]);

    let hdriBgImage = null;
    let hdrFileTexture = null;
    const envCanvasTexture = new THREE.CanvasTexture(hdriCanvas);
    envCanvasTexture.mapping = THREE.EquirectangularReflectionMapping;
    envCanvasTexture.colorSpace = THREE.SRGBColorSpace;
    let envMapTexture = null;

    const toneMapMap = {
      ACES: THREE.ACESFilmicToneMapping,
      Reinhard: THREE.ReinhardToneMapping,
      Cineon: THREE.CineonToneMapping,
      Neutral: THREE.NoToneMapping,
      None: THREE.NoToneMapping
    };

    function syncActiveFromIndex() {
      const idx = clamp(Math.round(params.lightIndex), 0, lights.length - 1);
      params.lightIndex = idx;
      const l = lights[idx];
      Object.assign(active, l);
    }

    function syncIndexFromActive() {
      const idx = clamp(Math.round(params.lightIndex), 0, lights.length - 1);
      const l = lights[idx];
      Object.assign(l, active);
    }

    function drawShapeLight(light) {
      // operate in client (CSS) pixels; canvas transform already set to DPR so we must use client sizes
      const dpr = _hdri_dpr || 1;
      const w = hdriCanvas.width / dpr;
      const h = hdriCanvas.height / dpr;
      const cx = light.x * w;
      const cy = light.y * h;
      const radius = light.size * h;
      const color = light.useKelvin ? light.color : light.color; // placeholder, support kelvin later
      const alpha = clamp(0.12 + light.intensity * 0.35, 0, 1);

      hdriCtx.save();
      hdriCtx.globalCompositeOperation = 'lighter';
      if (light.type === 'Circle') {
        const grad = hdriCtx.createRadialGradient(cx, cy, radius * light.innerSoftness, cx, cy, radius * (1 + light.outerFalloff));
        grad.addColorStop(0, `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`);
        grad.addColorStop(1, `${color}00`);
        hdriCtx.fillStyle = grad;
        hdriCtx.beginPath();
        hdriCtx.arc(cx, cy, radius * (1 + light.outerFalloff), 0, Math.PI * 2);
        hdriCtx.fill();
      } else if (light.type === 'Rect') {
        hdriCtx.filter = `blur(${radius * 0.25}px)`;
        hdriCtx.fillStyle = `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
        const rw = radius * 2.2;
        const rh = radius * 1.2;
        hdriCtx.fillRect(cx - rw / 2, cy - rh / 2, rw, rh);
        hdriCtx.filter = 'none';
      } else if (light.type === 'Octagon') {
        hdriCtx.beginPath();
        for (let i = 0; i < 8; i += 1) {
          const a = (Math.PI / 4) * i + Math.PI / 8;
          const px = cx + Math.cos(a) * radius;
          const py = cy + Math.sin(a) * radius;
          if (i === 0) hdriCtx.moveTo(px, py);
          else hdriCtx.lineTo(px, py);
        }
        hdriCtx.closePath();
        hdriCtx.filter = `blur(${radius * 0.2}px)`;
        hdriCtx.fillStyle = `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
        hdriCtx.fill();
        hdriCtx.filter = 'none';
      } else if (light.type === 'Ring') {
        hdriCtx.strokeStyle = `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
        hdriCtx.lineWidth = Math.max(2, radius * 0.35);
        hdriCtx.filter = `blur(${radius * 0.15}px)`;
        hdriCtx.beginPath();
        hdriCtx.arc(cx, cy, radius, 0, Math.PI * 2);
        hdriCtx.stroke();
        hdriCtx.filter = 'none';
      }
      hdriCtx.restore();
    }

    function drawHdriCanvas() {
      const dpr = _hdri_dpr || 1;
      const w = hdriCanvas.width / dpr;
      const h = hdriCanvas.height / dpr;
      hdriCtx.clearRect(0, 0, w, h);
      if (params.envMode === 'Solid') {
        hdriCtx.fillStyle = params.solidColor; hdriCtx.fillRect(0, 0, w, h);
      } else if (params.envMode === 'Gradient') {
        const grad = hdriCtx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, params.gradientTop); grad.addColorStop(1, params.gradientBottom);
        hdriCtx.fillStyle = grad; hdriCtx.fillRect(0, 0, w, h);
      } else if (params.envMode === 'Image' && hdriBgImage) {
        // draw background image without stretching: preserve aspect ratio and center (contain)
        const imgW = hdriBgImage.naturalWidth || hdriBgImage.width;
        const imgH = hdriBgImage.naturalHeight || hdriBgImage.height;
        if (imgW > 0 && imgH > 0) {
          const imgRatio = imgW / imgH;
          const canvasRatio = w / h;
          let drawW, drawH, dx, dy;
          if (imgRatio > canvasRatio) {
            // image wider than canvas -> fit by width
            drawW = w;
            drawH = Math.round(w / imgRatio);
            dx = 0;
            dy = Math.round((h - drawH) / 2);
          } else {
            // image taller or equal -> fit by height
            drawH = h;
            drawW = Math.round(h * imgRatio);
            dx = Math.round((w - drawW) / 2);
            dy = 0;
          }
          hdriCtx.drawImage(hdriBgImage, dx, dy, drawW, drawH);
        } else {
          hdriCtx.drawImage(hdriBgImage, 0, 0, w, h);
        }
      } else {
        hdriCtx.fillStyle = '#0b1120'; hdriCtx.fillRect(0, 0, w, h);
      }
      lights.forEach(drawShapeLight);
      drawLightHandles();
    }

    function drawLightHandles() {
      const dpr = _hdri_dpr || 1;
      const w = hdriCanvas.width / dpr;
      const h = hdriCanvas.height / dpr;
      hdriCtx.save();
      lights.forEach((light, idx) => {
        const x = light.x * w;
        const y = light.y * h;
        const selected = idx === params.lightIndex;
        const hovered = idx === hoveredLightIndex;
        // handle radius scales with light.size so selection box follows light scale
        const base = Math.min(w, h);
        const HANDLE_SCALE = selected ? 0.22 : 0.14;
        const MIN_HANDLE_PX = 6;
        const handleRadius = Math.max(MIN_HANDLE_PX, Math.round(light.size * base * HANDLE_SCALE));
        const lineW = Math.max(1, Math.round(Math.max(1, handleRadius * 0.18)));

        if (selected || hovered) {
          hdriCtx.beginPath();
          hdriCtx.arc(x, y, handleRadius + (selected ? 5 : 3), 0, Math.PI * 2);
          hdriCtx.fillStyle = selected ? 'rgba(34, 211, 238, 0.16)' : 'rgba(148, 163, 184, 0.12)';
          hdriCtx.fill();
        }

        hdriCtx.beginPath();
        hdriCtx.arc(x, y, handleRadius, 0, Math.PI * 2);
        hdriCtx.lineWidth = lineW;
        hdriCtx.strokeStyle = selected ? '#22d3ee' : (hovered ? '#f8fafc' : 'rgba(226,232,240,0.75)');
        hdriCtx.stroke();
      });
      hdriCtx.restore();
    }

    function rebuildEnvironmentFromCanvas() {
      drawHdriCanvas();
      envCanvasTexture.needsUpdate = true;
      if (envMapTexture) envMapTexture.dispose();
      envMapTexture = pmrem.fromEquirectangular(envCanvasTexture).texture;
      scene.environment = envMapTexture;
    }

    function applyParams() {
      renderer.toneMappingExposure = Math.pow(2, params.exposure);
      renderer.toneMapping = toneMapMap[params.toneMapping] || THREE.ACESFilmicToneMapping;
      sphereMat.envMapIntensity = params.envIntensity; knotMat.envMapIntensity = params.envIntensity;
      sphereMat.metalness = params.metalness; sphereMat.roughness = params.roughness;
      knotMat.metalness = Math.min(1, params.metalness * 0.8); knotMat.roughness = Math.min(1, params.roughness + 0.1);
      keyLight.intensity = params.keyIntensity; fillLight.intensity = params.fillIntensity; rimLight.intensity = params.rimIntensity; spotLight.intensity = params.spotIntensity;
      hemiLight.intensity = params.hemiIntensity; ambientLight.intensity = params.ambientIntensity;
      const az = THREE.MathUtils.degToRad(55); const el = THREE.MathUtils.degToRad(35);
      keyLight.position.set(Math.cos(el) * Math.sin(az) * 10, Math.sin(el) * 10, Math.cos(el) * Math.cos(az) * 10);
      const rot = THREE.MathUtils.degToRad(params.envRotation);
      if ('backgroundRotation' in scene) scene.backgroundRotation.set(0, rot, 0);
      if ('environmentRotation' in scene) scene.environmentRotation.set(0, rot, 0);
      scene.backgroundBlurriness = params.bgBlur;
      sphere.visible = params.model === 'Sphere' || params.model === 'Both';
      knot.visible = params.model === 'Knot' || params.model === 'Both';
      if (params.envMode === 'HDRFile' && hdrFileTexture) {
        if (envMapTexture) envMapTexture.dispose();
        envMapTexture = pmrem.fromEquirectangular(hdrFileTexture).texture;
        scene.environment = envMapTexture;
        scene.background = params.showBackground ? hdrFileTexture : new THREE.Color(0x0b1120);
      } else {
        scene.background = params.showBackground ? envCanvasTexture : new THREE.Color(0x0b1120);
        rebuildEnvironmentFromCanvas();
      }
    }

    function updateLightPicker() {
      if (!lightPicker) return;
      lightPicker.innerHTML = lights.map((l, i) => `<option value="${i}">${i + 1}. ${l.name}</option>`).join('');
      lightPicker.value = String(params.lightIndex);
    }

    let hoveredLightIndex = -1;
    let syncActiveLightEditor = null;

    function refreshLightControllers() {
      syncActiveFromIndex();
      updateLightPicker();
      updateActiveMeta();
      if (syncActiveLightEditor) syncActiveLightEditor();
      if (gui) gui.updateDisplay();
      const r = container.querySelector('#activeSizeRange');
      if (r) r.value = active.size;
      const rv = container.querySelector('#activeSizeValue');
      if (rv) rv.textContent = Number(active.size).toFixed(3);
    }

    function updateActiveMeta() {
      const meta = container.querySelector('#activeLightMeta');
      if (!meta) return;
      const picked = lights[clamp(params.lightIndex, 0, lights.length - 1)];
      if (!picked) {
        meta.textContent = '当前灯：-';
        return;
      }
      const x = Math.round((picked.x || 0) * 100);
      const y = Math.round((picked.y || 0) * 100);
      meta.textContent = `当前灯：${picked.name}（${TYPE_LABEL[picked.type] || picked.type}） · 位置 ${x}%, ${y}%`;
    }

    function bindActiveLightEditor() {
      const typeEl = container.querySelector('#activeLightType');
      const intensityEl = container.querySelector('#activeIntensityRange');
      const falloffEl = container.querySelector('#activeFalloffRange');
      const softnessEl = container.querySelector('#activeSoftnessRange');
      const colorEl = container.querySelector('#activeColorInput');
      const useKelvinEl = container.querySelector('#activeUseKelvin');
      const kelvinEl = container.querySelector('#activeKelvinRange');

      const mapValue = [
        [intensityEl, '#activeIntensityValue', (v) => Number(v).toFixed(2)],
        [falloffEl, '#activeFalloffValue', (v) => Number(v).toFixed(2)],
        [softnessEl, '#activeSoftnessValue', (v) => Number(v).toFixed(2)],
        [kelvinEl, '#activeKelvinValue', (v) => String(Math.round(v))]
      ];

      const commit = () => {
        syncIndexFromActive();
        applyParams();
        updateLightListUI();
        if (gui) gui.updateDisplay();
      };

      function syncEditor() {
        if (typeEl) typeEl.value = active.type;
        if (intensityEl) intensityEl.value = String(active.intensity);
        if (falloffEl) falloffEl.value = String(active.outerFalloff);
        if (softnessEl) softnessEl.value = String(active.innerSoftness);
        if (colorEl) colorEl.value = active.color || '#ffffff';
        if (useKelvinEl) useKelvinEl.checked = !!active.useKelvin;
        if (kelvinEl) {
          kelvinEl.value = String(active.kelvin || 6500);
          kelvinEl.disabled = !active.useKelvin;
        }
        mapValue.forEach(([input, selector, fmt]) => {
          if (!input) return;
          const label = container.querySelector(selector);
          if (label) label.textContent = fmt(input.value);
        });
      }

      if (typeEl) typeEl.addEventListener('change', (e) => { active.type = e.target.value; commit(); });
      if (intensityEl) intensityEl.addEventListener('input', (e) => { active.intensity = parseFloat(e.target.value) || 0; commit(); });
      if (falloffEl) falloffEl.addEventListener('input', (e) => { active.outerFalloff = parseFloat(e.target.value) || 0; commit(); });
      if (softnessEl) softnessEl.addEventListener('input', (e) => { active.innerSoftness = parseFloat(e.target.value) || 0; commit(); });
      if (colorEl) colorEl.addEventListener('input', (e) => { active.color = e.target.value; commit(); });
      if (useKelvinEl) useKelvinEl.addEventListener('change', (e) => { active.useKelvin = !!e.target.checked; if (kelvinEl) kelvinEl.disabled = !active.useKelvin; commit(); });
      if (kelvinEl) kelvinEl.addEventListener('input', (e) => { active.kelvin = parseFloat(e.target.value) || 6500; commit(); });

      syncEditor();
      return syncEditor;
    }

    function addLight(type = 'Circle') {
      lights.push(makeDefaultLight(type, lights.length));
      params.lightIndex = lights.length - 1; refreshLightControllers(); applyParams();
    }

    function duplicateCurrentLight() {
      const src = lights[clamp(params.lightIndex, 0, lights.length - 1)];
      const copy = JSON.parse(JSON.stringify(src)); copy.name = `${src.name} 复制`; copy.x = clamp(copy.x + 0.03, 0, 1); copy.y = clamp(copy.y + 0.03, 0, 1);
      lights.push(copy); params.lightIndex = lights.length - 1; refreshLightControllers(); applyParams();
    }

    function removeCurrentLight() {
      if (lights.length <= 1) { console.warn('至少保留一盏灯'); return; }
      lights.splice(params.lightIndex, 1); params.lightIndex = clamp(params.lightIndex, 0, lights.length - 1); refreshLightControllers(); applyParams();
    }

    function exportConfig() {
      const data = { params, lights, canvasSize: { width: hdriCanvas.width, height: hdriCanvas.height } };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'hdri_project.json'; a.click(); URL.revokeObjectURL(url);
    }

    // GUI
    function createNoopGui(host) {
      const root = document.createElement('div');
      root.className = 'fallback-gui custom-param-panel';
      const controllers = [];

      function createController(el, getter, setter, valueEl) {
        let onChangeCb = null;
        let onFinishCb = null;

        function parseByInput(raw) {
          if (el.type === 'checkbox') return !!el.checked;
          if (el.type === 'range' || el.type === 'number') {
            const num = parseFloat(raw);
            return Number.isFinite(num) ? num : getter();
          }
          return raw;
        }

        function updateValueBadge(v) {
          if (!valueEl) return;
          if (typeof v === 'number' && Number.isFinite(v)) {
            valueEl.textContent = Math.abs(v) >= 100 ? String(Math.round(v)) : v.toFixed(2).replace(/\.00$/, '');
          } else {
            valueEl.textContent = String(v);
          }
        }

        const api = {
          name(label) {
            const labelEl = el.closest('.fallback-row')?.querySelector('.fallback-label');
            if (labelEl) labelEl.textContent = label;
            return api;
          },
          onChange(cb) { onChangeCb = cb; return api; },
          onFinishChange(cb) { onFinishCb = cb; return api; },
          refresh() {
            const val = getter();
            if (el.type === 'checkbox') el.checked = !!val;
            else if (el.type === 'color') el.value = String(val || '#ffffff');
            else el.value = String(val);
            updateValueBadge(val);
          }
        };

        const fire = () => {
          const parsed = parseByInput(el.value);
          setter(parsed);
          updateValueBadge(parsed);
          if (onChangeCb) onChangeCb(parsed);
        };

        el.addEventListener('input', fire);
        el.addEventListener('change', () => {
          fire();
          const parsed = parseByInput(el.value);
          if (onFinishCb) onFinishCb(parsed);
        });

        controllers.push(api);
        return api;
      }

      function makeFolder(title) {
        const folder = document.createElement('fieldset');
        folder.className = 'fallback-folder';
        const legend = document.createElement('legend');
        legend.textContent = title;
        folder.appendChild(legend);
        root.appendChild(folder);

        return {
          open() { return this; },
          add(obj, key, a, b, step) {
            const row = document.createElement('div');
            row.className = 'fallback-row';

            const labelWrap = document.createElement('div');
            labelWrap.className = 'fallback-label-wrap';
            const label = document.createElement('label');
            label.className = 'fallback-label';
            label.textContent = key;
            labelWrap.appendChild(label);

            const valueEl = document.createElement('span');
            valueEl.className = 'fallback-value';

            let input;
            if (Array.isArray(a)) {
              input = document.createElement('select');
              a.forEach((opt) => {
                const o = document.createElement('option');
                o.value = opt;
                o.textContent = labelForValue(opt);
                input.appendChild(o);
              });
            } else if (typeof obj[key] === 'boolean') {
              input = document.createElement('input');
              input.type = 'checkbox';
              row.classList.add('is-checkbox');
            } else {
              input = document.createElement('input');
              if (typeof a === 'number' && typeof b === 'number') {
                input.type = 'range';
                input.min = String(a);
                input.max = String(b);
                if (typeof step === 'number') input.step = String(step);
              } else {
                input.type = 'text';
              }
            }

            if (input.type === 'range') labelWrap.appendChild(valueEl);
            row.appendChild(labelWrap);
            row.appendChild(input);
            folder.appendChild(row);
            const controller = createController(input, () => obj[key], (val) => { obj[key] = val; }, input.type === 'range' ? valueEl : null);
            controller.refresh();
            return controller;
          },
          addColor(obj, key) {
            const row = document.createElement('div');
            row.className = 'fallback-row';
            const label = document.createElement('label');
            label.className = 'fallback-label';
            label.textContent = key;
            row.appendChild(label);

            const input = document.createElement('input');
            input.type = 'color';
            row.appendChild(input);
            folder.appendChild(row);
            const controller = createController(input, () => obj[key], (val) => { obj[key] = val; });
            controller.refresh();
            return controller;
          }
        };
      }

      if (host) {
        host.innerHTML = '';
        host.appendChild(root);
      }

      return {
        domElement: root,
        updateDisplay() { controllers.forEach((c) => c.refresh()); },
        addFolder(name) { return makeFolder(name); }
      };
    }

    const guiHost = container.querySelector('#guiDock');
    const gui = createNoopGui(guiHost);

    const fCanvas = gui.addFolder('环境画布');
    if (fCanvas.open) fCanvas.open();
    fCanvas.add(params, 'canvasSize', ['1024x512', '2048x1024', '4096x2048']).name('分辨率').onChange((v) => { const [w, h] = v.split('x').map(Number); hdriCanvas.width = w; hdriCanvas.height = h; params.canvasSize = v; updateHdriCanvasStyle(); applyParams(); });
    fCanvas.add(params, 'envMode', ['Solid', 'Gradient', 'Image', 'HDRFile']).name('环境模式').onChange(applyParams);
    fCanvas.addColor(params, 'solidColor').name('纯色').onChange(applyParams);
    fCanvas.addColor(params, 'gradientTop').name('渐变-上').onChange(applyParams);
    fCanvas.addColor(params, 'gradientBottom').name('渐变-下').onChange(applyParams);

    const fEnv = gui.addFolder('渲染参数');
    if (fEnv.open) fEnv.open();
    fEnv.add(params, 'exposure', -2, 3, 0.05).name('曝光').onChange(applyParams);
    fEnv.add(params, 'saturation', 0, 2, 0.01).name('饱和度').onChange(applyParams);
    fEnv.add(params, 'envIntensity', 0, 5, 0.05).name('环境强度').onChange(applyParams);
    fEnv.add(params, 'envRotation', -180, 180, 1).name('环境旋转').onChange(applyParams);
    fEnv.add(params, 'bgBlur', 0, 1, 0.01).name('背景模糊').onChange(applyParams);
    fEnv.add(params, 'showBackground').name('显示背景').onChange(applyParams);
    fEnv.add(params, 'toneMapping', ['ACES', 'Reinhard', 'Cineon', 'Neutral', 'None']).name('色调映射').onChange(applyParams);

    const fModel = gui.addFolder('模型材质');
    if (fModel.open) fModel.open();
    fModel.add(params, 'model', ['Both', 'Sphere', 'Knot']).name('预览模型').onChange(applyParams);
    fModel.add(params, 'autoRotate').name('自动旋转');
    fModel.add(params, 'metalness', 0, 1, 0.01).name('金属度').onChange(applyParams);
    fModel.add(params, 'roughness', 0.02, 1, 0.01).name('粗糙度').onChange(applyParams);

    const fLights = gui.addFolder('场景灯光');
    if (fLights.open) fLights.open();
    fLights.add(params, 'keyIntensity', 0, 8, 0.1).onChange(applyParams);
    fLights.add(params, 'fillIntensity', 0, 4, 0.1).onChange(applyParams);
    fLights.add(params, 'rimIntensity', 0, 6, 0.1).onChange(applyParams);
    fLights.add(params, 'spotIntensity', 0, 8, 0.1).onChange(applyParams);
    fLights.add(params, 'hemiIntensity', 0, 3, 0.05).onChange(applyParams);
    fLights.add(params, 'ambientIntensity', 0, 1, 0.01).onChange(applyParams);

    const fHdriLight = gui.addFolder('HDRI 区域灯');
    if (fHdriLight.open) fHdriLight.open();
    fHdriLight.add(params, 'lightIndex', 0, lights.length - 1, 1).name('选择灯').onChange((i) => { params.lightIndex = clamp(Math.round(i), 0, lights.length - 1); syncActiveFromIndex(); gui.updateDisplay(); applyParams(); updateLightPicker(); });
    fHdriLight.add(active, 'name').name('名称').onFinishChange(() => { syncIndexFromActive(); updateLightPicker(); gui.updateDisplay(); });
    fHdriLight.add(active, 'type', ['Circle', 'Rect', 'Octagon', 'Ring']).name('光源形状').onChange(() => { syncIndexFromActive(); applyParams(); });
    fHdriLight.add(active, 'x', 0, 1, 0.001).name('位置X').onChange(() => { syncIndexFromActive(); applyParams(); });
    fHdriLight.add(active, 'y', 0, 1, 0.001).name('位置Y').onChange(() => { syncIndexFromActive(); applyParams(); });
    fHdriLight.add(active, 'size', 0.02, 0.5, 0.001).name('大小').onChange(() => { syncIndexFromActive(); applyParams(); });
    fHdriLight.add(active, 'intensity', 0, 5, 0.01).name('亮度').onChange(() => { syncIndexFromActive(); applyParams(); });
    fHdriLight.add(active, 'outerFalloff', 0, 2, 0.01).name('外侧衰减').onChange(() => { syncIndexFromActive(); applyParams(); });
    fHdriLight.add(active, 'innerSoftness', 0, 1, 0.01).name('内侧柔化').onChange(() => { syncIndexFromActive(); applyParams(); });
    fHdriLight.add(active, 'useKelvin').name('使用色温(K)').onChange(() => { syncIndexFromActive(); applyParams(); });
    fHdriLight.add(active, 'kelvin', 1000, 20000, 10).name('色温').onChange(() => { if (active.useKelvin) { /* convert later */ } syncIndexFromActive(); applyParams(); });
    fHdriLight.addColor(active, 'color').name('颜色').onChange(() => { syncIndexFromActive(); applyParams(); });


    syncActiveLightEditor = bindActiveLightEditor();

    const fLightMgr = gui.addFolder('灯光管理');
    if (fLightMgr.open) fLightMgr.open();
    fLightMgr.add({ addCircle: () => addLight('Circle') }, 'addCircle').name('新增圆形灯');
    fLightMgr.add({ addRect: () => addLight('Rect') }, 'addRect').name('新增矩形灯');
    fLightMgr.add({ addOctagon: () => addLight('Octagon') }, 'addOctagon').name('新增八边形灯');
    fLightMgr.add({ addRing: () => addLight('Ring') }, 'addRing').name('新增环形灯');
    fLightMgr.add({ duplicate: duplicateCurrentLight }, 'duplicate').name('复制当前灯');
    fLightMgr.add({ remove: removeCurrentLight }, 'remove').name('删除当前灯');

    function resize() {
      const wrapWidth = canvas.parentElement.clientWidth || 960;
      const width = Math.max(240, wrapWidth);
      const previewCard = container.querySelector('.preview-card');
      const maxHeightFromLayout = previewCard ? previewCard.clientHeight : 0;
      const autoHeight = Math.round(width * 0.58);
      const height = maxHeightFromLayout > 0
        ? clamp(maxHeightFromLayout - 2, 240, 860)
        : clamp(autoHeight, 240, 860);
      renderer.setSize(width, height, false);
      camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.render(scene, camera);
      // keep hdri canvas internal resolution in sync with its displayed size
      syncHdriCanvasResolution();
      // redraw environment canvas and update env texture
      rebuildEnvironmentFromCanvas();
    }

    function animate() {
      orbit.update();
      if (params.autoRotate) { knot.rotation.x += 0.003; knot.rotation.y += 0.005; sphere.rotation.y -= 0.002; }
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }

    const hdrLoader = new RGBELoader();
    container.querySelector('#hdrFileInput').addEventListener('change', function () {
      const file = this.files && this.files[0]; if (!file) return; const url = URL.createObjectURL(file); statusEl.textContent = `HDR载入中：${file.name}`;
      hdrLoader.load(url, (texture) => { texture.mapping = THREE.EquirectangularReflectionMapping; hdrFileTexture = texture; params.envMode = 'HDRFile'; gui.updateDisplay(); applyParams(); statusEl.textContent = `HDR已载入：${file.name}`; }, undefined, () => { statusEl.textContent = 'HDR载入失败，请检查文件。'; });
    });

    container.querySelector('#bgImageInput').addEventListener('change', function () {
      const file = this.files && this.files[0]; if (!file) return; const img = new Image(); img.onload = () => { hdriBgImage = img; params.envMode = 'Image'; gui.updateDisplay(); applyParams(); statusEl.textContent = `背景图已加载：${file.name}`; }; img.src = URL.createObjectURL(file);
    });

    container.querySelector('#addCircleBtn').addEventListener('click', () => addLight('Circle'));
    container.querySelector('#addRectBtn').addEventListener('click', () => addLight('Rect'));
    container.querySelector('#addOctagonBtn').addEventListener('click', () => addLight('Octagon'));
    container.querySelector('#addRingBtn').addEventListener('click', () => addLight('Ring'));
    container.querySelector('#duplicateLightBtn').addEventListener('click', duplicateCurrentLight);
    container.querySelector('#removeLightBtn').addEventListener('click', removeCurrentLight);
    container.querySelector('#saveConfig').addEventListener('click', exportConfig);
    container.querySelector('#loadConfig').addEventListener('change', async function () { const file = this.files && this.files[0]; if (!file) return; try { const text = await file.text(); const data = JSON.parse(text); if (data.params) Object.assign(params, data.params); if (Array.isArray(data.lights) && data.lights.length) { lights.length = 0; data.lights.forEach((l) => lights.push(l)); } if (data.canvasSize && data.canvasSize.width && data.canvasSize.height) { hdriCanvas.width = data.canvasSize.width; hdriCanvas.height = data.canvasSize.height; params.canvasSize = `${data.canvasSize.width}x${data.canvasSize.height}`; updateHdriCanvasStyle(); } params.lightIndex = clamp(params.lightIndex || 0, 0, lights.length - 1); refreshLightControllers(); applyParams(); statusEl.textContent = `配置已载入：${file.name}`; } catch (e) { statusEl.textContent = '配置文件读取失败，请检查 JSON 内容。'; } });

    container.querySelector('#exportHdri').addEventListener('click', async () => {
      try {
        if (!EXRExporter) {
          statusEl.textContent = 'EXR 导出器未加载，无法导出 .exr';
          return;
        }
        const dpr = _hdri_dpr || 1;
        const w = Math.max(1, Math.round(hdriCanvas.width / dpr));
        const h = Math.max(1, Math.round(hdriCanvas.height / dpr));
        const pixels = hdriCtx.getImageData(0, 0, w, h).data;
        const data = new Float32Array(w * h * 4);
        for (let i = 0; i < w * h; i += 1) {
          const r = pixels[i * 4] / 255;
          const g = pixels[i * 4 + 1] / 255;
          const b = pixels[i * 4 + 2] / 255;
          data[i * 4] = Math.pow(r, 2.2);
          data[i * 4 + 1] = Math.pow(g, 2.2);
          data[i * 4 + 2] = Math.pow(b, 2.2);
          data[i * 4 + 3] = 1;
        }
        const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
        tex.needsUpdate = true;
        tex.colorSpace = THREE.LinearSRGBColorSpace;
        const exrExporter = new EXRExporter();
        const out = exrExporter.parse(tex, { type: THREE.FloatType });
        const blob = new Blob([out], { type: 'image/x-exr' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'hdri_canvas.exr';
        a.click();
        URL.revokeObjectURL(a.href);
        tex.dispose();
      } catch (e) {
        console.error(e);
        statusEl.textContent = '导出 EXR 失败，请查看控制台。';
      }
    });
    container.querySelector('#exportPreview').addEventListener('click', () => { const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = 'hdri_preview.png'; a.click(); });

    // Model preview loader + interactive light controls
    let previewModel = null;
    let gltfLoader = null;
    if (GLTFLoader) {
      try { gltfLoader = new GLTFLoader(); } catch (e) { gltfLoader = null; }
    }

    const modelFileInput = container.querySelector('#modelFileInput');
    const removeModelBtn = container.querySelector('#removeModelBtn');
    if (modelFileInput) {
      modelFileInput.addEventListener('change', function () {
        const file = this.files && this.files[0];
        if (!file) return;
        if (!gltfLoader) { statusEl.textContent = 'GLTFLoader 未加载，无法加载模型'; return; }
        const url = URL.createObjectURL(file);
        statusEl.textContent = `模型加载中：${file.name}`;
        try {
          gltfLoader.load(url, (gltf) => {
            if (previewModel) { scene.remove(previewModel); }
            previewModel = gltf.scene || gltf.scenes && gltf.scenes[0];
            if (!previewModel) { statusEl.textContent = '模型解析失败'; return; }
            // center and scale model to fit
            const box = new THREE.Box3().setFromObject(previewModel);
            const size = box.getSize(new THREE.Vector3()).length();
            const scale = size > 0 ? (1.6 / size) : 1;
            previewModel.scale.setScalar(scale);
            // reposition so it sits on floor
            const newBox = new THREE.Box3().setFromObject(previewModel);
            const minY = newBox.min.y * scale;
            previewModel.position.set(0, -minY, 0);
            scene.add(previewModel);
            statusEl.textContent = `模型已加载：${file.name}`;
          }, undefined, (err) => { statusEl.textContent = '模型加载失败'; console.error(err); });
        } catch (e) { statusEl.textContent = '模型加载异常'; console.error(e); }
      });
    }

    if (removeModelBtn) removeModelBtn.addEventListener('click', () => { if (previewModel) { scene.remove(previewModel); previewModel = null; statusEl.textContent = '模型已移除'; } });

    // drag light on hdriCanvas; wheel adjusts active light size
    if (hdriCanvas) {
      let isDraggingLight = false;
      let pendingPickIndex = -1;
      let pointerDownUv = null;
      const DRAG_START_THRESHOLD = 0.008;

      function pointerToUv(ev) {
        const r = hdriCanvas.getBoundingClientRect();
        return {
          x: clamp((ev.clientX - r.left) / r.width, 0, 1),
          y: clamp((ev.clientY - r.top) / r.height, 0, 1)
        };
      }

      function pickLightIndex(uv) {
          // compute in displayed (client) pixels and use each light's visible area (outer falloff)
          const rect = hdriCanvas.getBoundingClientRect();
          const w = rect.width;
          const h = rect.height;
          const px = uv.x * w;
          const py = uv.y * h;
          let hit = -1;
          let bestDistPx = Number.POSITIVE_INFINITY;
          const MIN_THRESHOLD_PX = 6;
          lights.forEach((light, idx) => {
            const lx = light.x * w;
            const ly = light.y * h;
            const dx = px - lx;
            const dy = py - ly;
            const distPx = Math.hypot(dx, dy);
            // determine effective visible radius/extent depending on shape
            let inside = false;
            let effectiveDist = distPx;
            if (light.type === 'Circle') {
              // draw uses radius = light.size * h and outerFalloff multiplier
              const radius = light.size * h * (1 + (parseFloat(light.outerFalloff) || 0));
              if (distPx <= radius) inside = true;
              effectiveDist = Math.max(0, distPx - radius);
            } else if (light.type === 'Rect') {
              // draw used rw = radius * 2.2, rh = radius * 1.2 (radius based on light.size*h)
              const radius = light.size * h;
              const rw = radius * 2.2;
              const rh = radius * 1.2;
              if (Math.abs(dx) <= rw / 2 && Math.abs(dy) <= rh / 2) inside = true;
              // distance to rectangle edge (px)
              const dxOutside = Math.max(0, Math.abs(dx) - rw / 2);
              const dyOutside = Math.max(0, Math.abs(dy) - rh / 2);
              effectiveDist = Math.hypot(dxOutside, dyOutside);
            } else if (light.type === 'Octagon') {
              // approximate octagon with circle of radius = light.size*h
              const radius = light.size * h;
              if (distPx <= radius * 1.05) inside = true;
              effectiveDist = Math.max(0, distPx - radius);
            } else if (light.type === 'Ring') {
              const radius = light.size * h;
              const lineWidth = Math.max(2, radius * 0.35);
              // consider ring visible if within half line width + small tolerance
              if (Math.abs(distPx - radius) <= (lineWidth * 0.7 + 6)) inside = true;
              effectiveDist = Math.abs(distPx - radius);
            }

            // if inside visible area, prefer that hit; otherwise allow near misses within a small threshold
            if (inside) {
              // prefer the one with smallest effectiveDist (closest inside)
              if (effectiveDist < bestDistPx) {
                bestDistPx = effectiveDist;
                hit = idx;
              }
            } else {
              const thresholdPx = Math.max(MIN_THRESHOLD_PX, Math.round((light.size || 0.02) * Math.min(w, h) * 0.12));
              if (effectiveDist <= thresholdPx && effectiveDist < bestDistPx) {
                bestDistPx = effectiveDist;
                hit = idx;
              }
            }
          });
          return hit;
      }

      hdriCanvas.addEventListener('pointerdown', (ev) => {
        const uv = pointerToUv(ev);
        const pickedIndex = pickLightIndex(uv);
        pointerDownUv = uv;
        pendingPickIndex = pickedIndex;
        isDraggingLight = false;

        if (pickedIndex >= 0) {
          if (params.lightIndex !== pickedIndex) {
            params.lightIndex = pickedIndex;
            refreshLightControllers();
            applyParams();
            updateLightListUI();
          }
          try { hdriCanvas.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
        }
      });

      hdriCanvas.addEventListener('pointermove', (ev) => {
        const uv = pointerToUv(ev);

        if (!isDraggingLight) {
          hoveredLightIndex = pickLightIndex(uv);
          drawHdriCanvas();
        }

        if (pendingPickIndex < 0) return;

        const moved = pointerDownUv ? Math.hypot(uv.x - pointerDownUv.x, uv.y - pointerDownUv.y) : 0;
        if (!isDraggingLight && moved < DRAG_START_THRESHOLD) return;

        isDraggingLight = true;
        params.lightIndex = pendingPickIndex;
        active.x = uv.x;
        active.y = uv.y;
        syncIndexFromActive();
        refreshLightControllers();
        applyParams();
        updateLightListUI();
        if (gui) gui.updateDisplay();
      });

      function stopDragging(ev) {
        pendingPickIndex = -1;
        pointerDownUv = null;
        if (typeof ev.pointerId === 'number' && hdriCanvas.hasPointerCapture(ev.pointerId)) {
          hdriCanvas.releasePointerCapture(ev.pointerId);
        }
        isDraggingLight = false;
      }

      hdriCanvas.addEventListener('pointerup', stopDragging);
      hdriCanvas.addEventListener('pointercancel', stopDragging);
      hdriCanvas.addEventListener('pointerleave', (ev) => {
        hoveredLightIndex = -1;
        drawHdriCanvas();
        if (ev.buttons === 0) stopDragging(ev);
      });

      hdriCanvas.addEventListener('wheel', (ev) => {
        ev.preventDefault(); const d = ev.deltaY > 0 ? -0.01 : 0.01; active.size = clamp(active.size + d, 0.02, 0.8); syncIndexFromActive(); applyParams(); drawHdriCanvas(); updateLightListUI(); if (gui) gui.updateDisplay();
      }, { passive: false });
    }

    // active size slider
    const activeSizeRange = container.querySelector('#activeSizeRange');
    if (activeSizeRange) {
      activeSizeRange.value = active.size;
      activeSizeRange.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        if (isFinite(v)) { active.size = v; const rv = container.querySelector('#activeSizeValue'); if (rv) rv.textContent = Number(v).toFixed(3); syncIndexFromActive(); applyParams(); drawHdriCanvas(); updateLightListUI(); if (gui) gui.updateDisplay(); }
      });
    }

    function updateLightListUI() {
      const picker = container.querySelector('#lightPicker');
      picker.innerHTML = lights.map((l, i) => `<option value="${i}">${i + 1}. ${l.name}</option>`).join('');
      picker.value = String(params.lightIndex);
      updateActiveMeta();
      if (syncActiveLightEditor) syncActiveLightEditor();
    }

    lightPicker.addEventListener('change', (e) => { params.lightIndex = clamp(Number(e.target.value), 0, lights.length - 1); refreshLightControllers(); applyParams(); });
    lightPicker.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      setTimeout(() => {
        params.lightIndex = clamp(Number(lightPicker.value), 0, lights.length - 1);
        refreshLightControllers();
        applyParams();
      }, 0);
    });

    updateLightListUI(); window.addEventListener('resize', resize); resize(); applyParams(); animate();

    // histogram update (light)
    const histCanvas = document.createElement('canvas');
    histCanvas.width = 256;
    histCanvas.height = 128;
    const histCtx = histCanvas.getContext('2d');

    setInterval(() => {
      try {
        const w = Math.min(512, renderer.domElement.width);
        const h = Math.min(256, renderer.domElement.height);
        const tmp = document.createElement('canvas');
        tmp.width = w;
        tmp.height = h;
        const ctx2 = tmp.getContext('2d');
        ctx2.drawImage(renderer.domElement, 0, 0, w, h);
        const img = ctx2.getImageData(0, 0, w, h).data;
        const bins = new Uint32Array(256);
        for (let i = 0; i < img.length; i += 4) {
          const r = img[i], g = img[i + 1], b = img[i + 2];
          const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
          bins[clamp(lum, 0, 255)]++;
        }
        const max = Math.max(...bins);
        histCtx.clearRect(0, 0, histCanvas.width, histCanvas.height);
        histCtx.fillStyle = '#111827';
        histCtx.fillRect(0, 0, histCanvas.width, histCanvas.height);
        for (let x = 0; x < 256; x++) {
          const v = bins[x] / (max || 1);
          const hx = Math.floor((x / 256) * histCanvas.width);
          const hh = Math.floor(v * histCanvas.height);
          histCtx.fillStyle = '#60a5fa';
          histCtx.fillRect(hx, histCanvas.height - hh, Math.ceil(histCanvas.width / 256), hh);
        }

        const leftPanel = container.querySelector('#leftPanel');
        if (leftPanel) {
          const existing = leftPanel.querySelector('.hist-preview');
          if (!existing) {
            const el = document.createElement('div');
            el.className = 'hist-preview';
            el.style.marginTop = '12px';
            el.appendChild(histCanvas);
            leftPanel.appendChild(el);
          } else {
            const el = existing.querySelector('canvas');
            if (el) el.getContext('2d').drawImage(histCanvas, 0, 0);
          }
        }
      } catch (e) {
        /* ignore */
      }
    }, 900);
  };
})();
