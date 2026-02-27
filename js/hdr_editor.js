(function () {
  async function importFromCandidates(candidates) {
    let lastError = null;
    for (const url of candidates) {
      try {
        return await import(url);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('module import failed');
  }

  async function loadDeps() {
    const threeCandidates = ['three', 'https://esm.sh/three@0.160.0'];
    const rgbeCandidates = [
      'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/RGBELoader.js',
      'https://unpkg.com/three@0.160.0/examples/jsm/loaders/RGBELoader.js',
      'https://esm.sh/three@0.160.0/examples/jsm/loaders/RGBELoader.js'
    ];
    const controlsCandidates = [
      'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js',
      'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js',
      'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js'
    ];
    const guiCandidates = [
      'https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm',
      'https://esm.sh/lil-gui@0.19.2'
    ];

    const [THREE, rgbe, controls, gui] = await Promise.all([
      importFromCandidates(threeCandidates),
      importFromCandidates(rgbeCandidates),
      importFromCandidates(controlsCandidates),
      importFromCandidates(guiCandidates)
    ]);

    return {
      THREE,
      RGBELoader: rgbe.RGBELoader,
      OrbitControls: controls.OrbitControls,
      GUI: gui.GUI
    };
  }

  function kelvinToRgb(kelvin) {
    const temp = kelvin / 100;
    let red;
    let green;
    let blue;

    if (temp <= 66) {
      red = 255;
      green = 99.4708025861 * Math.log(Math.max(temp, 1)) - 161.1195681661;
      if (temp <= 19) {
        blue = 0;
      } else {
        blue = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
      }
    } else {
      red = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
      green = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
      blue = 255;
    }

    return {
      r: Math.max(0, Math.min(255, red)),
      g: Math.max(0, Math.min(255, green)),
      b: Math.max(0, Math.min(255, blue))
    };
  }

  function rgbToHex(rgb) {
    const r = Math.round(rgb.r).toString(16).padStart(2, '0');
    const g = Math.round(rgb.g).toString(16).padStart(2, '0');
    const b = Math.round(rgb.b).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

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
    host.innerHTML = `
      <div class="hdr-shell">
        <div class="hdr-topbar">
          <span class="hdr-title">HDRI Studio（继续对齐成熟站）</span>
          <label class="hdr-file-btn">导入背景图<input id="bgImageInput" type="file" accept="image/*" /></label>
          <label class="hdr-file-btn">导入HDR<input id="hdrFileInput" type="file" accept=".hdr,image/vnd.radiance" /></label>
          <label>灯光列表<select id="lightPicker"></select></label>
          <button id="addCircleBtn" class="secondary" type="button">圆形灯</button>
          <button id="addRectBtn" class="secondary" type="button">矩形灯</button>
          <button id="addOctagonBtn" class="secondary" type="button">八边形灯</button>
          <button id="addRingBtn" class="secondary" type="button">环形灯</button>
          <button id="duplicateLightBtn" class="secondary" type="button">复制灯</button>
          <button id="removeLightBtn" class="secondary" type="button">删除灯</button>
          <button id="saveConfig" class="secondary" type="button">导出配置</button>
          <label class="hdr-file-btn">导入配置<input id="loadConfig" type="file" accept=".json" /></label>
          <button id="exportHdri" class="secondary" type="button">导出HDRI(PNG)</button>
          <button id="exportPreview" type="button">导出预览PNG</button>
          <span id="hdrStatus" class="hdr-status">初始化中...</span>
        </div>
        <div class="hdr-grid-main">
          <div class="hdri-author card-lite">
            <div class="author-header">HDRI 画布</div>
            <canvas id="hdriCanvas" width="2048" height="1024"></canvas>
          </div>
          <div id="viewportWrap" class="hdr-canvas-wrap"><canvas id="hdrEditorCanvas"></canvas></div>
        </div>
      </div>
    `;

    const status = host.querySelector('#hdrStatus');
    const lightPicker = host.querySelector('#lightPicker');
    let THREE;
    let RGBELoader;
    let OrbitControls;
    let GUI;

    try {
      const deps = await loadDeps();
      THREE = deps.THREE;
      RGBELoader = deps.RGBELoader;
      OrbitControls = deps.OrbitControls;
      GUI = deps.GUI;
    } catch (error) {
      status.textContent = '依赖加载失败，请检查网络/CDN。';
      return;
    }

    const hdriCanvas = host.querySelector('#hdriCanvas');
    const hdriCtx = hdriCanvas.getContext('2d');
    const canvas = host.querySelector('#hdrEditorCanvas');

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

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.88, metalness: 0.03 })
    );
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
      { name: '圆形灯 1', type: 'Circle', x: 0.22, y: 0.34, size: 0.16, color: '#ffffff', useKelvin: false, kelvin: 6500, intensity: 1.8, outerFalloff: 1.1, innerSoftness: 0.25 },
      { name: '矩形灯 1', type: 'Rect', x: 0.76, y: 0.38, size: 0.2, color: '#ffd8aa', useKelvin: false, kelvin: 4200, intensity: 1.2, outerFalloff: 1.0, innerSoftness: 0.2 },
      { name: '环形灯 1', type: 'Ring', x: 0.5, y: 0.17, size: 0.14, color: '#c5dcff', useKelvin: false, kelvin: 9000, intensity: 1.0, outerFalloff: 1.1, innerSoftness: 0.4 }
    ];

    const active = {
      name: lights[0].name,
      type: lights[0].type,
      size: lights[0].size,
      color: lights[0].color,
      useKelvin: lights[0].useKelvin,
      kelvin: lights[0].kelvin,
      intensity: lights[0].intensity,
      outerFalloff: lights[0].outerFalloff,
      innerSoftness: lights[0].innerSoftness,
      x: lights[0].x,
      y: lights[0].y
    };

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
      Neutral: THREE.NeutralToneMapping,
      None: THREE.NoToneMapping
    };

    let gui;
    let lightIndexController;

    function syncActiveFromIndex() {
      const idx = clamp(Math.round(params.lightIndex), 0, lights.length - 1);
      params.lightIndex = idx;
      const l = lights[idx];
      active.name = l.name;
      active.type = l.type;
      active.size = l.size;
      active.color = l.color;
      active.useKelvin = l.useKelvin;
      active.kelvin = l.kelvin;
      active.intensity = l.intensity;
      active.outerFalloff = l.outerFalloff;
      active.innerSoftness = l.innerSoftness;
      active.x = l.x;
      active.y = l.y;
    }

    function syncIndexFromActive() {
      const idx = clamp(Math.round(params.lightIndex), 0, lights.length - 1);
      const l = lights[idx];
      l.name = active.name;
      l.type = active.type;
      l.size = active.size;
      l.color = active.color;
      l.useKelvin = active.useKelvin;
      l.kelvin = active.kelvin;
      l.intensity = active.intensity;
      l.outerFalloff = active.outerFalloff;
      l.innerSoftness = active.innerSoftness;
      l.x = active.x;
      l.y = active.y;
    }

    function drawShapeLight(light) {
      const w = hdriCanvas.width;
      const h = hdriCanvas.height;
      const cx = light.x * w;
      const cy = light.y * h;
      const radius = light.size * h;

      const color = light.useKelvin ? rgbToHex(kelvinToRgb(light.kelvin)) : light.color;
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
        hdriCtx.fillStyle = params.solidColor;
        hdriCtx.fillRect(0, 0, w, h);
      } else if (params.envMode === 'Gradient') {
        const grad = hdriCtx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, params.gradientTop);
        grad.addColorStop(1, params.gradientBottom);
        hdriCtx.fillStyle = grad;
        hdriCtx.fillRect(0, 0, w, h);
      } else if (params.envMode === 'Image' && hdriBgImage) {
        hdriCtx.drawImage(hdriBgImage, 0, 0, w, h);
      } else {
        hdriCtx.fillStyle = '#0b1120';
        hdriCtx.fillRect(0, 0, w, h);
      }

      lights.forEach(drawShapeLight);
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

      sphereMat.envMapIntensity = params.envIntensity;
      knotMat.envMapIntensity = params.envIntensity;
      sphereMat.metalness = params.metalness;
      sphereMat.roughness = params.roughness;
      knotMat.metalness = Math.min(1, params.metalness * 0.8);
      knotMat.roughness = Math.min(1, params.roughness + 0.1);

      keyLight.intensity = params.keyIntensity;
      fillLight.intensity = params.fillIntensity;
      rimLight.intensity = params.rimIntensity;
      spotLight.intensity = params.spotIntensity;
      hemiLight.intensity = params.hemiIntensity;
      ambientLight.intensity = params.ambientIntensity;

      sphereMat.color.setRGB(clamp(0.5 * params.saturation, 0, 1), clamp(0.5 * params.saturation, 0, 1), clamp(0.5 * params.saturation, 0, 1));
      knotMat.color.setRGB(clamp(0.4 + 0.3 * params.saturation, 0, 1), clamp(0.6 + 0.15 * params.saturation, 0, 1), 1);

      const az = THREE.MathUtils.degToRad(55);
      const el = THREE.MathUtils.degToRad(35);
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

    function refreshLightControllers() {
      if (lightIndexController) {
        lightIndexController.max(lights.length - 1);
      }
      syncActiveFromIndex();
      updateLightPicker();
      gui.updateDisplay();
    }
    function addLight(type = 'Circle') {
      lights.push(makeDefaultLight(type, lights.length));
      params.lightIndex = lights.length - 1;
      refreshLightControllers();
      applyParams();
    }

    function duplicateCurrentLight() {
      const src = lights[clamp(params.lightIndex, 0, lights.length - 1)];
      const copy = JSON.parse(JSON.stringify(src));
      copy.name = `${src.name} 复制`;
      copy.x = clamp(copy.x + 0.03, 0, 1);
      copy.y = clamp(copy.y + 0.03, 0, 1);
      lights.push(copy);
      params.lightIndex = lights.length - 1;
      refreshLightControllers();
      applyParams();
    }

    function removeCurrentLight() {
      if (lights.length <= 1) {
        status.textContent = '至少保留一盏 HDRI 灯。';
        return;
      }
      lights.splice(params.lightIndex, 1);
      params.lightIndex = clamp(params.lightIndex, 0, lights.length - 1);
      refreshLightControllers();
      applyParams();
    }

    function exportConfig() {
      const data = {
        params,
        lights,
        canvasSize: { width: hdriCanvas.width, height: hdriCanvas.height }
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'hdri_project.json';
      a.click();
      URL.revokeObjectURL(url);
    }

    gui = new GUI({ title: 'HDRI 控制面板', width: 330, container: host.querySelector('#viewportWrap') });
    gui.domElement.classList.add('hdr-gui');

    const fCanvas = gui.addFolder('HDRI画布');
    fCanvas.add(params, 'canvasSize', ['1024x512', '2048x1024', '4096x2048']).onChange((v) => {
      const [w, h] = v.split('x').map(Number);
      hdriCanvas.width = w;
      hdriCanvas.height = h;
      applyParams();
    });
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

    const fHdriLight = gui.addFolder('HDRI区域灯');
    lightIndexController = fHdriLight.add(params, 'lightIndex', 0, lights.length - 1, 1).name('选择灯').onChange((i) => {
      params.lightIndex = clamp(Math.round(i), 0, lights.length - 1);
      syncActiveFromIndex();
      gui.updateDisplay();
      applyParams();
    });
    fHdriLight.add(active, 'name').name('名称').onFinishChange(() => { syncIndexFromActive(); updateLightPicker(); gui.updateDisplay(); });
    fHdriLight.add(active, 'type', ['Circle', 'Rect', 'Octagon', 'Ring']).onChange(() => { syncIndexFromActive(); applyParams(); });
    fHdriLight.add(active, 'x', 0, 1, 0.001).name('位置X').onChange(() => { syncIndexFromActive(); applyParams(); });
    fHdriLight.add(active, 'y', 0, 1, 0.001).name('位置Y').onChange(() => { syncIndexFromActive(); applyParams(); });
    fHdriLight.add(active, 'size', 0.02, 0.5, 0.001).name('大小').onChange(() => { syncIndexFromActive(); applyParams(); });
    fHdriLight.add(active, 'intensity', 0, 5, 0.01).name('亮度').onChange(() => { syncIndexFromActive(); applyParams(); });
    fHdriLight.add(active, 'outerFalloff', 0, 2, 0.01).name('外侧衰减').onChange(() => { syncIndexFromActive(); applyParams(); });
    fHdriLight.add(active, 'innerSoftness', 0, 1, 0.01).name('内侧柔化').onChange(() => { syncIndexFromActive(); applyParams(); });
    fHdriLight.add(active, 'useKelvin').name('使用色温(K)').onChange(() => { syncIndexFromActive(); applyParams(); });
    fHdriLight.add(active, 'kelvin', 1000, 20000, 10).name('色温').onChange(() => {
      if (active.useKelvin) active.color = rgbToHex(kelvinToRgb(active.kelvin));
      syncIndexFromActive();
      applyParams();
    });
    fHdriLight.addColor(active, 'color').name('颜色').onChange(() => { syncIndexFromActive(); applyParams(); });

    const fLightMgr = gui.addFolder('灯光管理');
    fLightMgr.add({ addCircle: () => addLight('Circle') }, 'addCircle').name('新增圆形灯');
    fLightMgr.add({ addRect: () => addLight('Rect') }, 'addRect').name('新增矩形灯');
    fLightMgr.add({ addOctagon: () => addLight('Octagon') }, 'addOctagon').name('新增八边形灯');
    fLightMgr.add({ addRing: () => addLight('Ring') }, 'addRing').name('新增环形灯');
    fLightMgr.add({ duplicate: duplicateCurrentLight }, 'duplicate').name('复制当前灯');
    fLightMgr.add({ remove: removeCurrentLight }, 'remove').name('删除当前灯');

    function resize() {
      const width = Math.max(920, canvas.parentElement.clientWidth || 920);
      const height = Math.round(width * 0.58);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    }

    function animate() {
      orbit.update();
      if (params.autoRotate) {
        knot.rotation.x += 0.003;
        knot.rotation.y += 0.005;
        sphere.rotation.y -= 0.002;
      }
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }


    const hdrLoader = new RGBELoader();
    host.querySelector('#hdrFileInput').addEventListener('change', function () {
      const file = this.files && this.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      status.textContent = `HDR载入中：${file.name}`;
      hdrLoader.load(url, (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        hdrFileTexture = texture;
        params.envMode = 'HDRFile';
        gui.updateDisplay();
        applyParams();
        status.textContent = `HDR已载入：${file.name}`;
      }, undefined, () => {
        status.textContent = 'HDR载入失败，请检查文件。';
      });
    });

    lightPicker.addEventListener('change', (e) => {
      params.lightIndex = clamp(Number(e.target.value), 0, lights.length - 1);
      refreshLightControllers();
      applyParams();
    });

    host.querySelector('#bgImageInput').addEventListener('change', function () {
      const file = this.files && this.files[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => {
        hdriBgImage = img;
        params.envMode = 'Image';
        gui.updateDisplay();
        applyParams();
        status.textContent = `背景图已加载：${file.name}`;
      };
      img.src = URL.createObjectURL(file);
    });

    host.querySelector('#addCircleBtn').addEventListener('click', () => addLight('Circle'));
    host.querySelector('#addRectBtn').addEventListener('click', () => addLight('Rect'));
    host.querySelector('#addOctagonBtn').addEventListener('click', () => addLight('Octagon'));
    host.querySelector('#addRingBtn').addEventListener('click', () => addLight('Ring'));
    host.querySelector('#duplicateLightBtn').addEventListener('click', duplicateCurrentLight);
    host.querySelector('#removeLightBtn').addEventListener('click', removeCurrentLight);

    host.querySelector('#saveConfig').addEventListener('click', exportConfig);

    host.querySelector('#loadConfig').addEventListener('change', async function () {
      const file = this.files && this.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.params) Object.assign(params, data.params);
        if (Array.isArray(data.lights) && data.lights.length) {
          lights.length = 0;
          data.lights.forEach((l) => lights.push(l));
        }
        if (data.canvasSize && data.canvasSize.width && data.canvasSize.height) {
          hdriCanvas.width = data.canvasSize.width;
          hdriCanvas.height = data.canvasSize.height;
          params.canvasSize = `${data.canvasSize.width}x${data.canvasSize.height}`;
        }
        params.lightIndex = clamp(params.lightIndex || 0, 0, lights.length - 1);
        refreshLightControllers();
        applyParams();
        status.textContent = `配置已载入：${file.name}`;
      } catch (e) {
        status.textContent = '配置文件读取失败，请检查 JSON 内容。';
      }
    });

    host.querySelector('#exportHdri').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = hdriCanvas.toDataURL('image/png');
      a.download = 'hdri_canvas.png';
      a.click();
    });

    host.querySelector('#exportPreview').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'hdri_preview.png';
      a.click();
    });

    refreshLightControllers();
    window.addEventListener('resize', resize);
    resize();
    applyParams();
    status.textContent = 'HDRI 编辑器已就绪（支持灯光列表管理/配置导入导出）。';
    animate();
  };
})();
