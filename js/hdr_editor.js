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
    const guiCandidates = [
      'https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm',
      'https://esm.sh/lil-gui@0.19.2'
    ];

    const [THREE, rgbe, controls, gltfMod, gui] = await Promise.all([
      importFromCandidates(threeCandidates),
      importFromCandidates(rgbeCandidates),
      importFromCandidates(controlsCandidates),
      importFromCandidates(gltfLoaderCandidates),
      importFromCandidates(guiCandidates)
    ]);

    const guiCtor = gui && (
      (typeof gui.GUI === 'function' && gui.GUI) ||
      (gui.default && typeof gui.default.GUI === 'function' && gui.default.GUI) ||
      (typeof gui.default === 'function' && gui.default) ||
      (typeof gui === 'function' && gui) ||
      null
    );

    return {
      THREE,
      RGBELoader: rgbe.RGBELoader,
      OrbitControls: controls.OrbitControls,
      GLTFLoader: gltfMod && (gltfMod.GLTFLoader || gltfMod.default && gltfMod.default.GLTFLoader) ? (gltfMod.GLTFLoader || gltfMod.default.GLTFLoader) : null,
      GUI: guiCtor
    };
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function makeDefaultLight(type, idx) {
    return {
      name: `${type} 灯 ${idx + 1}`,
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
          <div class="author-header">HDRI Studio 控制</div>
          <div id="guiContainer"></div>

          <div class="panel-section quick-controls">
            <label>环境模式
              <select id="envModeQuick">
                <option value="Solid">纯色</option>
                <option value="Gradient">渐变</option>
                <option value="Image">背景图</option>
                <option value="HDRFile">HDR 文件</option>
              </select>
            </label>
            <label>曝光
              <input id="exposureQuick" type="range" min="-2" max="3" step="0.05" />
            </label>
            <label>主光强度
              <input id="keyIntensityQuick" type="range" min="0" max="8" step="0.1" />
            </label>
            <label>渐变上色
              <input id="gradientTopQuick" type="color" />
            </label>
            <label>渐变下色
              <input id="gradientBottomQuick" type="color" />
            </label>
            <label class="quick-inline"><input id="useKelvinQuick" type="checkbox" /> 使用色温</label>
            <label>色温(K)
              <input id="kelvinQuick" type="range" min="1000" max="20000" step="10" />
            </label>
          </div>

          <div class="panel-section">
            <button id="addCircleBtn" class="secondary">圆形灯</button>
            <button id="addRectBtn" class="secondary">矩形灯</button>
            <button id="addOctagonBtn" class="secondary">八边形灯</button>
            <button id="addRingBtn" class="secondary">环形灯</button>
          </div>

          <div class="panel-section">
            <label class="hdr-file-btn">导入HDR <input id="hdrFileInput" type="file" accept=".hdr,image/vnd.radiance" /></label>
            <label class="hdr-file-btn">背景图 <input id="bgImageInput" type="file" accept="image/*" /></label>
            <label class="hdr-file-btn">上传模型 <input id="modelFileInput" type="file" accept=".gltf,.glb" /></label>
            <button id="removeModelBtn" class="secondary">移除模型</button>
          </div>

          <div class="panel-section">
            <button id="saveConfig" class="secondary">导出配置</button>
            <label class="hdr-file-btn">导入配置 <input id="loadConfig" type="file" accept=".json"/></label>
            <button id="exportHdri" class="secondary">导出 HDR PNG</button>
            <button id="exportPreview">导出预览 PNG</button>
          </div>

          <div class="panel-section light-list-block">
            <select id="lightPicker" size="7"></select>
            <div class="light-meta" id="activeLightMeta">当前灯：-</div>
            <label class="size-label">选中灯大小
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
            <canvas id="hdriCanvas" width="2048" height="1024"></canvas>
          </div>
          <div class="canvas-card preview-card">
            <div id="viewportWrap" class="hdr-canvas-3d">
              <canvas id="hdrEditorCanvas"></canvas>
            </div>
          </div>
        </div>
      </div>
    `;

    const statusEl = host.querySelector('#hdrStatus') || document.createElement('div');

    let THREE, RGBELoader, OrbitControls, GUI, GLTFLoader;
    try {
      const deps = await loadDeps();
      THREE = deps.THREE;
      RGBELoader = deps.RGBELoader;
      OrbitControls = deps.OrbitControls;
      GUI = deps.GUI;
      GLTFLoader = deps.GLTFLoader;
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
      const w = hdriCanvas.width;
      const h = hdriCanvas.height;
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
      const w = hdriCanvas.width;
      const h = hdriCanvas.height;
      hdriCtx.clearRect(0, 0, w, h);
      if (params.envMode === 'Solid') {
        hdriCtx.fillStyle = params.solidColor; hdriCtx.fillRect(0, 0, w, h);
      } else if (params.envMode === 'Gradient') {
        const grad = hdriCtx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, params.gradientTop); grad.addColorStop(1, params.gradientBottom);
        hdriCtx.fillStyle = grad; hdriCtx.fillRect(0, 0, w, h);
      } else if (params.envMode === 'Image' && hdriBgImage) {
        hdriCtx.drawImage(hdriBgImage, 0, 0, w, h);
      } else {
        hdriCtx.fillStyle = '#0b1120'; hdriCtx.fillRect(0, 0, w, h);
      }
      lights.forEach(drawShapeLight);
      drawLightHandles();
    }

    function drawLightHandles() {
      const w = hdriCanvas.width;
      const h = hdriCanvas.height;
      hdriCtx.save();
      lights.forEach((light, idx) => {
        const x = light.x * w;
        const y = light.y * h;
        const selected = idx === params.lightIndex;
        hdriCtx.beginPath();
        hdriCtx.arc(x, y, selected ? 9 : 6, 0, Math.PI * 2);
        hdriCtx.lineWidth = selected ? 3 : 2;
        hdriCtx.strokeStyle = selected ? '#22d3ee' : 'rgba(226,232,240,0.75)';
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

    let syncQuickControls = null;

    function refreshLightControllers() {
      syncActiveFromIndex();
      updateLightPicker();
      updateActiveMeta();
      if (syncQuickControls) syncQuickControls();
      if (gui) gui.updateDisplay();
      const r = container.querySelector('#activeSizeRange');
      if (r) r.value = active.size;
    }

    function updateActiveMeta() {
      const meta = container.querySelector('#activeLightMeta');
      if (!meta) return;
      const picked = lights[clamp(params.lightIndex, 0, lights.length - 1)];
      meta.textContent = picked ? `当前灯：${picked.name}（${picked.type}）` : '当前灯：-';
    }


    function bindQuickControls() {
      const envModeQuick = container.querySelector('#envModeQuick');
      const exposureQuick = container.querySelector('#exposureQuick');
      const keyIntensityQuick = container.querySelector('#keyIntensityQuick');
      const gradientTopQuick = container.querySelector('#gradientTopQuick');
      const gradientBottomQuick = container.querySelector('#gradientBottomQuick');
      const useKelvinQuick = container.querySelector('#useKelvinQuick');
      const kelvinQuick = container.querySelector('#kelvinQuick');

      function syncQuickControls() {
        if (envModeQuick) envModeQuick.value = params.envMode;
        if (exposureQuick) exposureQuick.value = String(params.exposure);
        if (keyIntensityQuick) keyIntensityQuick.value = String(params.keyIntensity);
        if (gradientTopQuick) gradientTopQuick.value = params.gradientTop;
        if (gradientBottomQuick) gradientBottomQuick.value = params.gradientBottom;
        if (useKelvinQuick) useKelvinQuick.checked = !!active.useKelvin;
        if (kelvinQuick) {
          kelvinQuick.value = String(active.kelvin);
          kelvinQuick.disabled = !active.useKelvin;
        }
      }

      if (envModeQuick) envModeQuick.addEventListener('change', (e) => { params.envMode = e.target.value; applyParams(); if (gui) gui.updateDisplay(); });
      if (exposureQuick) exposureQuick.addEventListener('input', (e) => { params.exposure = parseFloat(e.target.value) || 0; applyParams(); if (gui) gui.updateDisplay(); });
      if (keyIntensityQuick) keyIntensityQuick.addEventListener('input', (e) => { params.keyIntensity = parseFloat(e.target.value) || 0; applyParams(); if (gui) gui.updateDisplay(); });
      if (gradientTopQuick) gradientTopQuick.addEventListener('input', (e) => { params.gradientTop = e.target.value; applyParams(); if (gui) gui.updateDisplay(); });
      if (gradientBottomQuick) gradientBottomQuick.addEventListener('input', (e) => { params.gradientBottom = e.target.value; applyParams(); if (gui) gui.updateDisplay(); });
      if (useKelvinQuick) useKelvinQuick.addEventListener('change', (e) => { active.useKelvin = !!e.target.checked; syncIndexFromActive(); applyParams(); if (kelvinQuick) kelvinQuick.disabled = !active.useKelvin; if (gui) gui.updateDisplay(); });
      if (kelvinQuick) kelvinQuick.addEventListener('input', (e) => { active.kelvin = parseFloat(e.target.value) || active.kelvin; syncIndexFromActive(); applyParams(); if (gui) gui.updateDisplay(); });

      syncQuickControls();
      return syncQuickControls;
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
    function createNoopGui() {
      const makeController = () => ({
        name() { return this; },
        onChange() { return this; },
        onFinishChange() { return this; }
      });
      const makeFolder = () => ({
        add() { return makeController(); },
        addColor() { return makeController(); }
      });
      return {
        domElement: document.createElement('div'),
        updateDisplay() { },
        addFolder() { return makeFolder(); }
      };
    }

    let gui = createNoopGui();
    const guiHost = container.querySelector('#guiContainer');
    if (typeof GUI === 'function') {
      try {
        gui = new GUI({ title: 'HDRI 控制面板', width: 320, autoPlace: false });
        gui.domElement.classList.add('hdr-gui');
        if (guiHost) {
          guiHost.innerHTML = '';
          guiHost.appendChild(gui.domElement);
        }
      } catch (e) {
        console.warn('GUI 初始化失败，使用简化控制界面。', e);
      }
    }

    const fCanvas = gui.addFolder('HDRI 画布');
    fCanvas.add(params, 'canvasSize', ['1024x512', '2048x1024', '4096x2048']).onChange((v) => { const [w, h] = v.split('x').map(Number); hdriCanvas.width = w; hdriCanvas.height = h; applyParams(); });
    fCanvas.add(params, 'envMode', ['Solid', 'Gradient', 'Image', 'HDRFile']).onChange(applyParams);
    fCanvas.addColor(params, 'solidColor').name('纯色').onChange(applyParams);
    fCanvas.addColor(params, 'gradientTop').name('渐变-上').onChange(applyParams);
    fCanvas.addColor(params, 'gradientBottom').name('渐变-下').onChange(applyParams);

    const fEnv = gui.addFolder('环境参数');
    fEnv.add(params, 'exposure', -2, 3, 0.05).onChange(applyParams);
    fEnv.add(params, 'saturation', 0, 2, 0.01).onChange(applyParams);
    fEnv.add(params, 'envIntensity', 0, 5, 0.05).onChange(applyParams);
    fEnv.add(params, 'envRotation', -180, 180, 1).onChange(applyParams);
    fEnv.add(params, 'bgBlur', 0, 1, 0.01).onChange(applyParams);
    fEnv.add(params, 'showBackground').onChange(applyParams);
    fEnv.add(params, 'toneMapping', ['ACES', 'Reinhard', 'Cineon', 'Neutral', 'None']).onChange(applyParams);

    const fModel = gui.addFolder('模型与材质');
    fModel.add(params, 'model', ['Both', 'Sphere', 'Knot']).onChange(applyParams);
    fModel.add(params, 'autoRotate');
    fModel.add(params, 'metalness', 0, 1, 0.01).onChange(applyParams);
    fModel.add(params, 'roughness', 0.02, 1, 0.01).onChange(applyParams);

    const fLights = gui.addFolder('场景灯光');
    fLights.add(params, 'keyIntensity', 0, 8, 0.1).onChange(applyParams);
    fLights.add(params, 'fillIntensity', 0, 4, 0.1).onChange(applyParams);
    fLights.add(params, 'rimIntensity', 0, 6, 0.1).onChange(applyParams);
    fLights.add(params, 'spotIntensity', 0, 8, 0.1).onChange(applyParams);
    fLights.add(params, 'hemiIntensity', 0, 3, 0.05).onChange(applyParams);
    fLights.add(params, 'ambientIntensity', 0, 1, 0.01).onChange(applyParams);

    const fHdriLight = gui.addFolder('HDRI 区域灯');
    fHdriLight.add(params, 'lightIndex', 0, lights.length - 1, 1).name('选择灯').onChange((i) => { params.lightIndex = clamp(Math.round(i), 0, lights.length - 1); syncActiveFromIndex(); gui.updateDisplay(); applyParams(); updateLightPicker(); });
    fHdriLight.add(active, 'name').name('名称').onFinishChange(() => { syncIndexFromActive(); updateLightPicker(); gui.updateDisplay(); });
    fHdriLight.add(active, 'type', ['Circle', 'Rect', 'Octagon', 'Ring']).onChange(() => { syncIndexFromActive(); applyParams(); });
    fHdriLight.add(active, 'x', 0, 1, 0.001).name('位置X').onChange(() => { syncIndexFromActive(); applyParams(); });
    fHdriLight.add(active, 'y', 0, 1, 0.001).name('位置Y').onChange(() => { syncIndexFromActive(); applyParams(); });
    fHdriLight.add(active, 'size', 0.02, 0.5, 0.001).name('大小').onChange(() => { syncIndexFromActive(); applyParams(); });
    fHdriLight.add(active, 'intensity', 0, 5, 0.01).name('亮度').onChange(() => { syncIndexFromActive(); applyParams(); });
    fHdriLight.add(active, 'outerFalloff', 0, 2, 0.01).name('外侧衰减').onChange(() => { syncIndexFromActive(); applyParams(); });
    fHdriLight.add(active, 'innerSoftness', 0, 1, 0.01).name('内侧柔化').onChange(() => { syncIndexFromActive(); applyParams(); });
    fHdriLight.add(active, 'useKelvin').name('使用色温(K)').onChange(() => { syncIndexFromActive(); applyParams(); });
    fHdriLight.add(active, 'kelvin', 1000, 20000, 10).name('色温').onChange(() => { if (active.useKelvin) { /* convert later */ } syncIndexFromActive(); applyParams(); });
    fHdriLight.addColor(active, 'color').name('颜色').onChange(() => { syncIndexFromActive(); applyParams(); });

    syncQuickControls = bindQuickControls();

    const fLightMgr = gui.addFolder('灯光管理');
    fLightMgr.add({ addCircle: () => addLight('Circle') }, 'addCircle').name('新增圆形灯');
    fLightMgr.add({ addRect: () => addLight('Rect') }, 'addRect').name('新增矩形灯');
    fLightMgr.add({ addOctagon: () => addLight('Octagon') }, 'addOctagon').name('新增八边形灯');
    fLightMgr.add({ addRing: () => addLight('Ring') }, 'addRing').name('新增环形灯');
    fLightMgr.add({ duplicate: duplicateCurrentLight }, 'duplicate').name('复制当前灯');
    fLightMgr.add({ remove: removeCurrentLight }, 'remove').name('删除当前灯');

    function resize() {
      const wrapWidth = canvas.parentElement.clientWidth || 960;
      const width = Math.max(320, wrapWidth);
      const height = clamp(Math.round(width * 0.58), 280, 720);
      renderer.setSize(width, height, false);
      camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.render(scene, camera);
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
    container.querySelector('#loadConfig').addEventListener('change', async function () { const file = this.files && this.files[0]; if (!file) return; try { const text = await file.text(); const data = JSON.parse(text); if (data.params) Object.assign(params, data.params); if (Array.isArray(data.lights) && data.lights.length) { lights.length = 0; data.lights.forEach((l) => lights.push(l)); } if (data.canvasSize && data.canvasSize.width && data.canvasSize.height) { hdriCanvas.width = data.canvasSize.width; hdriCanvas.height = data.canvasSize.height; params.canvasSize = `${data.canvasSize.width}x${data.canvasSize.height}`; } params.lightIndex = clamp(params.lightIndex || 0, 0, lights.length - 1); refreshLightControllers(); applyParams(); statusEl.textContent = `配置已载入：${file.name}`; } catch (e) { statusEl.textContent = '配置文件读取失败，请检查 JSON 内容。'; } });

    container.querySelector('#exportHdri').addEventListener('click', () => { const a = document.createElement('a'); a.href = hdriCanvas.toDataURL('image/png'); a.download = 'hdri_canvas.png'; a.click(); });
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

      function pointerToUv(ev) {
        const r = hdriCanvas.getBoundingClientRect();
        return {
          x: clamp((ev.clientX - r.left) / r.width, 0, 1),
          y: clamp((ev.clientY - r.top) / r.height, 0, 1)
        };
      }

      function pickLightIndex(uv) {
        let hit = -1;
        let bestDist = Number.POSITIVE_INFINITY;
        lights.forEach((light, idx) => {
          const dx = uv.x - light.x;
          const dy = uv.y - light.y;
          const dist = Math.hypot(dx, dy);
          const threshold = Math.max(0.03, light.size * 0.6);
          if (dist <= threshold && dist < bestDist) {
            bestDist = dist;
            hit = idx;
          }
        });
        return hit;
      }

      hdriCanvas.addEventListener('pointerdown', (ev) => {
        const uv = pointerToUv(ev);
        const pickedIndex = pickLightIndex(uv);
        if (pickedIndex >= 0) params.lightIndex = pickedIndex;
        refreshLightControllers();
        active.x = uv.x;
        active.y = uv.y;
        syncIndexFromActive();
        isDraggingLight = true;
        hdriCanvas.setPointerCapture(ev.pointerId);
        applyParams();
        updateLightListUI();
        if (gui) gui.updateDisplay();
      });

      hdriCanvas.addEventListener('pointermove', (ev) => {
        if (!isDraggingLight) return;
        const uv = pointerToUv(ev);
        active.x = uv.x;
        active.y = uv.y;
        syncIndexFromActive();
        applyParams();
        if (gui) gui.updateDisplay();
      });

      function stopDragging(ev) {
        if (!isDraggingLight) return;
        isDraggingLight = false;
        if (typeof ev.pointerId === 'number' && hdriCanvas.hasPointerCapture(ev.pointerId)) {
          hdriCanvas.releasePointerCapture(ev.pointerId);
        }
      }

      hdriCanvas.addEventListener('pointerup', stopDragging);
      hdriCanvas.addEventListener('pointercancel', stopDragging);
      hdriCanvas.addEventListener('pointerleave', (ev) => {
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
        if (isFinite(v)) { active.size = v; syncIndexFromActive(); applyParams(); drawHdriCanvas(); updateLightListUI(); if (gui) gui.updateDisplay(); }
      });
    }

    function updateLightListUI() {
      const picker = container.querySelector('#lightPicker');
      picker.innerHTML = lights.map((l, i) => `<option value="${i}">${i + 1}. ${l.name}</option>`).join('');
      picker.value = String(params.lightIndex);
      updateActiveMeta();
    }

    lightPicker.addEventListener('change', (e) => { params.lightIndex = clamp(Number(e.target.value), 0, lights.length - 1); refreshLightControllers(); applyParams(); });

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
