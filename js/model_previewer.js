(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }

  /* ========== CDN Loader (from hdr_editor.js pattern) ========== */
  async function importFirst(list) {
    for (var i = 0; i < list.length; i++) {
      try { return await import(list[i]); } catch (e) { /* try next */ }
    }
    throw new Error('所有候选 CDN 均失败');
  }

  async function loadDeps() {
    var v = '0.160.0';
    var base = 'https://cdn.jsdelivr.net/npm/three@' + v;
    var base2 = 'https://unpkg.com/three@' + v;
    function jsm(mod) {
      return [base + '/examples/jsm/' + mod, base2 + '/examples/jsm/' + mod];
    }
    var results = await Promise.all([
      importFirst(['three', base + '/build/three.module.js']),
      importFirst(jsm('controls/OrbitControls.js')),
      importFirst(jsm('loaders/GLTFLoader.js')).catch(function () { return null; }),
      importFirst(jsm('loaders/FBXLoader.js')).catch(function () { return null; }),
      importFirst(jsm('loaders/OBJLoader.js')).catch(function () { return null; }),
      importFirst(jsm('loaders/RGBELoader.js')).catch(function () { return null; }),
      importFirst(jsm('loaders/DRACOLoader.js')).catch(function () { return null; }),
    ]);
    return {
      THREE: results[0],
      OrbitControls: results[1].OrbitControls,
      GLTFLoader: results[2] ? (results[2].GLTFLoader || null) : null,
      FBXLoader: results[3] ? (results[3].FBXLoader || null) : null,
      OBJLoader: results[4] ? (results[4].OBJLoader || null) : null,
      RGBELoader: results[5] ? (results[5].RGBELoader || null) : null,
      DRACOLoader: results[6] ? (results[6].DRACOLoader || null) : null,
    };
  }

  /* ========== State ========== */
  var THREE, renderer, scene, camera, controls, clock;
  var gridHelper;
  var currentModel = null, currentAnimations = [];
  var mixer = null, activeAction = null;
  var skeletonHelper = null;
  var compareModel = null;
  var materialList = []; // [{name, material, meshes}]
  var envMap = null;
  var pmremGen = null;
  var loaders = {};
  var isAnimPlaying = false;
  var autoRotateSpeed = 0.005;
  var originalMaterials = new WeakMap(); // for wireframe restore

  /* ========== Init ========== */
  async function init() {
    setStatus('正在加载 Three.js 依赖...');
    try {
      var deps = await loadDeps();
      THREE = deps.THREE;

      initRenderer();
      initScene();
      initControls(deps.OrbitControls);
      initLights();
      clock = new THREE.Clock();
      pmremGen = new THREE.PMREMGenerator(renderer);
      pmremGen.compileEquirectangularShader();

      // Create loaders
      if (deps.GLTFLoader) {
        loaders.gltf = new deps.GLTFLoader();
        if (deps.DRACOLoader) {
          var draco = new deps.DRACOLoader();
          draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/');
          loaders.gltf.setDRACOLoader(draco);
        }
      }
      if (deps.FBXLoader) loaders.fbx = new deps.FBXLoader();
      if (deps.OBJLoader) loaders.obj = new deps.OBJLoader();
      if (deps.RGBELoader) loaders.rgbe = new deps.RGBELoader();

      bindUpload();
      bindUI();
      animate();
      setStatus('就绪 — 拖拽或点击上传模型');
    } catch (e) {
      setStatus('加载失败: ' + e.message);
      console.error(e);
    }
  }

  function initRenderer() {
    var canvas = $('renderCanvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    resizeRenderer();

    var vp = $('viewport');
    new ResizeObserver(resizeRenderer).observe(vp);
  }

  function resizeRenderer() {
    var vp = $('viewport');
    var w = vp.clientWidth, h = vp.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    if (camera) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color($('bgColor').value);

    gridHelper = new THREE.GridHelper(10, 20, 0x444466, 0x333355);
    scene.add(gridHelper);
  }

  function initControls(OrbitControls) {
    camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
    camera.position.set(2, 1.5, 2);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.1;
    controls.maxDistance = 100;
    controls.target.set(0, 0.5, 0);
    resizeRenderer();
  }

  function initLights() {
    var ambient = new THREE.AmbientLight(0xffffff, 0.5);
    ambient.name = '__ambient';
    scene.add(ambient);

    var dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.name = '__dir';
    dir.position.set(3, 5, 3);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    scene.add(dir);

    var fill = new THREE.DirectionalLight(0x8888ff, 0.3);
    fill.name = '__fill';
    fill.position.set(-3, 2, -3);
    scene.add(fill);
  }

  /* ========== Animation Loop ========== */
  function animate() {
    requestAnimationFrame(animate);
    var delta = clock.getDelta();
    controls.update();
    if (mixer && isAnimPlaying) {
      mixer.update(delta);
      updateAnimTimeline();
    }
    if ($('chkAutoRotate').checked && currentModel) {
      currentModel.rotation.y += autoRotateSpeed;
    }
    renderer.render(scene, camera);
  }

  /* ========== Model Loading ========== */
  function loadModel(file) {
    var ext = file.name.split('.').pop().toLowerCase();
    var url = URL.createObjectURL(file);
    setStatus('模型加载中: ' + file.name);
    showLoading(true);

    function onLoad(obj, animations) {
      placeModel(obj, file.name);
      currentAnimations = animations || [];
      setupAnimations();
      collectModelInfo();
      collectMaterials();
      showLoading(false);
      URL.revokeObjectURL(url);
    }

    function onError(err) {
      setStatus('模型加载失败: ' + file.name);
      showLoading(false);
      console.error(err);
      URL.revokeObjectURL(url);
    }

    if ((ext === 'gltf' || ext === 'glb') && loaders.gltf) {
      loaders.gltf.load(url, function (gltf) {
        onLoad(gltf.scene, gltf.animations);
      }, undefined, onError);
    } else if (ext === 'fbx' && loaders.fbx) {
      loaders.fbx.load(url, function (obj) {
        onLoad(obj, obj.animations);
      }, undefined, onError);
    } else if (ext === 'obj' && loaders.obj) {
      loaders.obj.load(url, function (obj) {
        onLoad(obj, []);
      }, undefined, onError);
    } else {
      setStatus('不支持该格式，请使用 GLB/GLTF/FBX/OBJ');
      showLoading(false);
      URL.revokeObjectURL(url);
    }
  }

  function placeModel(obj, name) {
    // Remove old model
    if (currentModel) {
      scene.remove(currentModel);
      disposeObject(currentModel);
    }
    // Clean up old state
    if (skeletonHelper) { scene.remove(skeletonHelper); skeletonHelper = null; }
    if (mixer) { mixer.stopAllAction(); mixer = null; }
    activeAction = null;
    isAnimPlaying = false;
    materialList = [];

    currentModel = obj;
    if (!currentModel) { setStatus('模型解析失败'); return; }

    // Auto-scale and center
    var box = new THREE.Box3().setFromObject(currentModel);
    var size = box.getSize(new THREE.Vector3()).length();
    var scale = size > 0 ? 2.5 / size : 1;
    currentModel.scale.setScalar(scale);

    var nb = new THREE.Box3().setFromObject(currentModel);
    var center = nb.getCenter(new THREE.Vector3());
    currentModel.position.sub(center);
    currentModel.position.y -= nb.min.y;

    scene.add(currentModel);

    // Adjust camera
    controls.target.set(0, (nb.max.y - nb.min.y) * 0.4, 0);
    camera.position.set(2, 1.5, 2);
    controls.update();

    setStatus('模型已加载: ' + name);
  }

  function disposeObject(obj) {
    obj.traverse(function (child) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(function (m) { m.dispose(); });
        } else {
          child.material.dispose();
        }
      }
    });
  }

  /* ========== Model Info ========== */
  function collectModelInfo() {
    if (!currentModel) return;
    var verts = 0, faces = 0, mats = new Set(), texs = new Set();
    currentModel.traverse(function (child) {
      if (child.isMesh && child.geometry) {
        var pos = child.geometry.attributes.position;
        if (pos) verts += pos.count;
        if (child.geometry.index) faces += child.geometry.index.count / 3;
        else if (pos) faces += pos.count / 3;

        var ms = Array.isArray(child.material) ? child.material : [child.material];
        ms.forEach(function (m) {
          mats.add(m);
          ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'].forEach(function (k) {
            if (m[k]) texs.add(m[k]);
          });
        });
      }
    });

    var box = new THREE.Box3().setFromObject(currentModel);
    var s = box.getSize(new THREE.Vector3());

    $('infoVerts').textContent = formatNumber(Math.round(verts));
    $('infoFaces').textContent = formatNumber(Math.round(faces));
    $('infoMats').textContent = mats.size;
    $('infoTexs').textContent = texs.size;
    $('infoBBox').textContent = s.x.toFixed(2) + ' x ' + s.y.toFixed(2) + ' x ' + s.z.toFixed(2);
    $('sectionInfo').style.display = '';
  }

  function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }

  /* ========== Animation ========== */
  function setupAnimations() {
    var section = $('sectionAnim');
    var select = $('animClip');
    select.innerHTML = '';

    if (!currentAnimations || currentAnimations.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = '';
    mixer = new THREE.AnimationMixer(currentModel);

    currentAnimations.forEach(function (clip, i) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = clip.name || ('Animation ' + i);
      select.appendChild(opt);
    });

    playAnimation(0);
  }

  function playAnimation(index) {
    if (!mixer || !currentAnimations[index]) return;
    if (activeAction) { activeAction.stop(); }

    var clip = currentAnimations[index];
    activeAction = mixer.clipAction(clip);
    activeAction.reset().play();
    isAnimPlaying = true;
    $('btnPlayPause').textContent = '⏸';
    $('animTimeline').max = clip.duration;
    $('animSpeed').value = 1;
    $('animSpeedVal').textContent = '1.0x';
  }

  function updateAnimTimeline() {
    if (!activeAction) return;
    var t = activeAction.time;
    $('animTimeline').value = t;
    $('animTimeVal').textContent = t.toFixed(2) + 's';
  }

  /* ========== Material Inspector ========== */
  function collectMaterials() {
    materialList = [];
    var seen = new Set();
    if (!currentModel) return;

    currentModel.traverse(function (child) {
      if (!child.isMesh) return;
      var ms = Array.isArray(child.material) ? child.material : [child.material];
      ms.forEach(function (m) {
        if (seen.has(m.uuid)) {
          // Add mesh to existing entry
          materialList.forEach(function (entry) {
            if (entry.material === m) entry.meshes.push(child);
          });
        } else {
          seen.add(m.uuid);
          materialList.push({ name: m.name || 'Material', material: m, meshes: [child] });
        }
      });
    });

    renderMaterialList();
    $('matHint').style.display = materialList.length > 0 ? 'none' : '';

    // Update texture replacement dropdown
    var sel = $('texTargetMat');
    sel.innerHTML = '';
    materialList.forEach(function (entry, i) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = entry.name;
      sel.appendChild(opt);
    });
    $('sectionTexReplace').style.display = materialList.length > 0 ? '' : 'none';
  }

  function renderMaterialList() {
    var list = $('matList');
    list.innerHTML = '';
    materialList.forEach(function (entry, i) {
      var card = document.createElement('div');
      card.className = 'mat-card';
      card.dataset.index = i;

      var m = entry.material;
      var color = m.color ? '#' + m.color.getHexString() : '#888888';

      card.innerHTML =
        '<div class="mat-swatch" style="background:' + color + '"></div>' +
        '<div class="mat-info">' +
          '<div class="mat-name">' + escHtml(entry.name) + '</div>' +
          '<div class="mat-props">' +
            (m.metalness !== undefined ? 'M:' + m.metalness.toFixed(1) + ' ' : '') +
            (m.roughness !== undefined ? 'R:' + m.roughness.toFixed(1) : '') +
          '</div>' +
        '</div>';

      card.addEventListener('click', function () {
        highlightMaterial(i);
      });
      list.appendChild(card);
    });
  }

  function highlightMaterial(index) {
    // Reset all
    materialList.forEach(function (entry) {
      if (entry.material.emissive) {
        entry.material.emissive.setHex(entry._origEmissive || 0x000000);
        entry.material.emissiveIntensity = entry._origEmissiveIntensity || 0;
      }
    });

    // Highlight selected
    var entry = materialList[index];
    if (entry && entry.material.emissive) {
      entry._origEmissive = entry._origEmissive || entry.material.emissive.getHex();
      entry._origEmissiveIntensity = entry._origEmissiveIntensity || entry.material.emissiveIntensity;
      entry.material.emissive.setHex(0x37b18c);
      entry.material.emissiveIntensity = 0.4;
    }

    // Update UI active state
    var cards = $('matList').querySelectorAll('.mat-card');
    cards.forEach(function (c, ci) {
      c.classList.toggle('active', ci === index);
    });
  }

  /* ========== Wireframe ========== */
  function toggleWireframe(on) {
    if (!currentModel) return;
    currentModel.traverse(function (child) {
      if (!child.isMesh) return;
      var ms = Array.isArray(child.material) ? child.material : [child.material];
      ms.forEach(function (m) {
        if (on) {
          if (!originalMaterials.has(m)) originalMaterials.set(m, m.wireframe);
          m.wireframe = true;
        } else {
          var orig = originalMaterials.get(m);
          m.wireframe = orig !== undefined ? orig : false;
        }
      });
    });
  }

  /* ========== Skeleton ========== */
  function toggleSkeleton(on) {
    if (skeletonHelper) {
      scene.remove(skeletonHelper);
      skeletonHelper = null;
    }
    if (on && currentModel) {
      var hasBones = false;
      currentModel.traverse(function (c) { if (c.isBone) hasBones = true; });
      if (hasBones) {
        skeletonHelper = new THREE.SkeletonHelper(currentModel);
        scene.add(skeletonHelper);
      } else {
        setStatus('该模型没有骨骼数据');
        $('chkSkeleton').checked = false;
      }
    }
  }

  /* ========== Environment ========== */
  function applyEnvironment(preset) {
    if (preset === 'default') {
      scene.environment = null;
      if (!$('chkEnvBg').checked) {
        scene.background = new THREE.Color($('bgColor').value);
      }
      return;
    }

    // Generate environment texture from colors
    var colors;
    if (preset === 'studio') {
      colors = [
        new THREE.Color(0.8, 0.8, 0.85),
        new THREE.Color(0.6, 0.6, 0.65),
        new THREE.Color(0.4, 0.4, 0.42),
      ];
    } else if (preset === 'outdoor') {
      colors = [
        new THREE.Color(0.3, 0.5, 0.9),
        new THREE.Color(0.7, 0.85, 1.0),
        new THREE.Color(0.4, 0.35, 0.3),
      ];
    } else if (preset === 'night') {
      colors = [
        new THREE.Color(0.02, 0.02, 0.06),
        new THREE.Color(0.05, 0.05, 0.15),
        new THREE.Color(0.01, 0.01, 0.03),
      ];
    }

    // Create a simple gradient DataTexture for environment
    var size = 256;
    var data = new Float32Array(size * size * 4);
    for (var y = 0; y < size; y++) {
      var t = y / (size - 1);
      var c;
      if (t < 0.5) {
        c = colors[0].clone().lerp(colors[1], t * 2);
      } else {
        c = colors[1].clone().lerp(colors[2], (t - 0.5) * 2);
      }
      for (var x = 0; x < size; x++) {
        var idx = (y * size + x) * 4;
        data[idx] = c.r;
        data[idx + 1] = c.g;
        data[idx + 2] = c.b;
        data[idx + 3] = 1;
      }
    }

    var tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.needsUpdate = true;

    envMap = pmremGen.fromEquirectangular(tex).texture;
    scene.environment = envMap;

    if ($('chkEnvBg').checked) {
      scene.background = envMap;
    }
    tex.dispose();
  }

  function loadHDR(file) {
    if (!loaders.rgbe) { setStatus('RGBELoader 不可用'); return; }
    var url = URL.createObjectURL(file);
    loaders.rgbe.load(url, function (texture) {
      envMap = pmremGen.fromEquirectangular(texture).texture;
      scene.environment = envMap;
      if ($('chkEnvBg').checked) scene.background = envMap;
      texture.dispose();
      URL.revokeObjectURL(url);
      setStatus('HDR 环境已加载');
    }, undefined, function () {
      setStatus('HDR 加载失败');
      URL.revokeObjectURL(url);
    });
  }

  /* ========== Comparison ========== */
  function loadCompareModel(file) {
    var ext = file.name.split('.').pop().toLowerCase();
    var url = URL.createObjectURL(file);
    setStatus('加载对比模型: ' + file.name);
    showLoading(true);

    function onLoad(obj) {
      if (compareModel) { scene.remove(compareModel); disposeObject(compareModel); }
      compareModel = obj;

      // Scale same as current model
      var box = new THREE.Box3().setFromObject(compareModel);
      var size = box.getSize(new THREE.Vector3()).length();
      var scale = size > 0 ? 2.5 / size : 1;
      compareModel.scale.setScalar(scale);
      var nb = new THREE.Box3().setFromObject(compareModel);
      var center = nb.getCenter(new THREE.Vector3());
      compareModel.position.sub(center);
      compareModel.position.y -= nb.min.y;

      applyCompareMode();
      scene.add(compareModel);
      $('btnClearCompare').style.display = '';
      $('compareModeRow').style.display = '';
      showLoading(false);
      setStatus('对比模型已加载: ' + file.name);
      URL.revokeObjectURL(url);
    }

    function onError(err) {
      setStatus('对比模型加载失败');
      showLoading(false);
      console.error(err);
      URL.revokeObjectURL(url);
    }

    if ((ext === 'gltf' || ext === 'glb') && loaders.gltf) {
      loaders.gltf.load(url, function (gltf) { onLoad(gltf.scene); }, undefined, onError);
    } else if (ext === 'fbx' && loaders.fbx) {
      loaders.fbx.load(url, function (obj) { onLoad(obj); }, undefined, onError);
    } else if (ext === 'obj' && loaders.obj) {
      loaders.obj.load(url, function (obj) { onLoad(obj); }, undefined, onError);
    } else {
      setStatus('不支持该格式'); showLoading(false); URL.revokeObjectURL(url);
    }
  }

  function applyCompareMode() {
    if (!currentModel || !compareModel) return;
    var mode = $('compareMode').value;
    if (mode === 'sideBySide') {
      currentModel.position.x = -1.2;
      compareModel.position.x = 1.2;
      compareModel.traverse(function (c) {
        if (c.isMesh) {
          var ms = Array.isArray(c.material) ? c.material : [c.material];
          ms.forEach(function (m) { m.transparent = false; m.opacity = 1; });
        }
      });
    } else {
      currentModel.position.x = 0;
      compareModel.position.x = 0;
      compareModel.traverse(function (c) {
        if (c.isMesh) {
          var ms = Array.isArray(c.material) ? c.material : [c.material];
          ms.forEach(function (m) { m.transparent = true; m.opacity = 0.5; });
        }
      });
    }
  }

  function clearCompare() {
    if (compareModel) {
      scene.remove(compareModel);
      disposeObject(compareModel);
      compareModel = null;
    }
    if (currentModel) currentModel.position.x = 0;
    $('btnClearCompare').style.display = 'none';
    $('compareModeRow').style.display = 'none';
    setStatus('对比模型已清除');
  }

  /* ========== PBR Texture Replacement ========== */
  function replaceTexture(channel, file) {
    var idx = parseInt($('texTargetMat').value);
    var entry = materialList[idx];
    if (!entry) return;

    var url = URL.createObjectURL(file);
    var loader = new THREE.TextureLoader();
    loader.load(url, function (texture) {
      texture.colorSpace = (channel === 'map') ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
      texture.flipY = true;
      entry.material[channel] = texture;
      entry.material.needsUpdate = true;
      setStatus('贴图已替换: ' + channel);
      URL.revokeObjectURL(url);
    });
  }

  /* ========== Screenshot ========== */
  function takeScreenshot() {
    renderer.render(scene, camera);
    var link = document.createElement('a');
    link.download = 'model_screenshot.png';
    link.href = renderer.domElement.toDataURL('image/png');
    link.click();
  }

  /* ========== Upload Binding ========== */
  function bindUpload() {
    var dropzone = $('uploadDrop');
    var fileInput = $('modelFile');
    var viewport = $('viewport');
    var overlay = $('dropOverlay');

    // Click upload
    fileInput.addEventListener('change', function () {
      if (this.files && this.files[0]) loadModel(this.files[0]);
    });

    // Dropzone drag events
    ['dragenter', 'dragover'].forEach(function (evt) {
      dropzone.addEventListener(evt, function (e) {
        e.preventDefault(); e.stopPropagation();
        dropzone.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      dropzone.addEventListener(evt, function (e) {
        e.preventDefault(); e.stopPropagation();
        dropzone.classList.remove('dragover');
      });
    });
    dropzone.addEventListener('drop', function (e) {
      var files = e.dataTransfer.files;
      if (files && files[0]) loadModel(files[0]);
    });

    // Viewport drag-drop
    var dragCounter = 0;
    viewport.addEventListener('dragenter', function (e) {
      e.preventDefault();
      dragCounter++;
      overlay.classList.add('active');
    });
    viewport.addEventListener('dragover', function (e) {
      e.preventDefault();
    });
    viewport.addEventListener('dragleave', function (e) {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) { dragCounter = 0; overlay.classList.remove('active'); }
    });
    viewport.addEventListener('drop', function (e) {
      e.preventDefault();
      dragCounter = 0;
      overlay.classList.remove('active');
      var files = e.dataTransfer.files;
      if (files && files[0]) loadModel(files[0]);
    });
  }

  /* ========== UI Binding ========== */
  function bindUI() {
    // Background color
    $('bgColor').addEventListener('input', function () {
      $('bgColorVal').textContent = this.value;
      if (!$('chkEnvBg').checked) {
        scene.background = new THREE.Color(this.value);
      }
    });

    // Wireframe
    $('chkWireframe').addEventListener('change', function () {
      toggleWireframe(this.checked);
    });

    // Skeleton
    $('chkSkeleton').addEventListener('change', function () {
      toggleSkeleton(this.checked);
    });

    // Grid
    $('chkGrid').addEventListener('change', function () {
      gridHelper.visible = this.checked;
    });

    // Environment preset
    $('envPreset').addEventListener('change', function () {
      applyEnvironment(this.value);
    });

    // Env as background
    $('chkEnvBg').addEventListener('change', function () {
      if (this.checked && envMap) {
        scene.background = envMap;
      } else {
        scene.background = new THREE.Color($('bgColor').value);
      }
    });

    // HDR upload
    $('btnLoadHdr').addEventListener('click', function () { $('hdrFile').click(); });
    $('hdrFile').addEventListener('change', function () {
      if (this.files && this.files[0]) loadHDR(this.files[0]);
    });

    // Animation controls
    $('animClip').addEventListener('change', function () {
      playAnimation(parseInt(this.value));
    });
    $('btnPlayPause').addEventListener('click', function () {
      if (!activeAction) return;
      isAnimPlaying = !isAnimPlaying;
      this.textContent = isAnimPlaying ? '⏸' : '▶';
    });
    $('btnStop').addEventListener('click', function () {
      if (!activeAction) return;
      activeAction.stop();
      activeAction.reset();
      isAnimPlaying = false;
      $('btnPlayPause').textContent = '▶';
      $('animTimeline').value = 0;
      $('animTimeVal').textContent = '0.00s';
    });
    $('animTimeline').addEventListener('input', function () {
      if (!activeAction) return;
      activeAction.time = parseFloat(this.value);
      $('animTimeVal').textContent = parseFloat(this.value).toFixed(2) + 's';
      if (!isAnimPlaying) {
        mixer.update(0);
        renderer.render(scene, camera);
      }
    });
    $('animSpeed').addEventListener('input', function () {
      var v = parseFloat(this.value);
      $('animSpeedVal').textContent = v.toFixed(1) + 'x';
      if (activeAction) activeAction.timeScale = v;
    });

    // Comparison
    $('btnLoadCompare').addEventListener('click', function () { $('compareFile').click(); });
    $('compareFile').addEventListener('change', function () {
      if (this.files && this.files[0]) loadCompareModel(this.files[0]);
    });
    $('btnClearCompare').addEventListener('click', clearCompare);
    $('compareMode').addEventListener('change', applyCompareMode);

    // Screenshot
    $('btnScreenshot').addEventListener('click', takeScreenshot);

    // PBR texture replacement
    var texSlots = document.querySelectorAll('.tex-slot');
    texSlots.forEach(function (slot) {
      var btn = slot.querySelector('button[data-channel]');
      var input = slot.querySelector('input[type="file"]');
      var channel = btn.dataset.channel;
      btn.addEventListener('click', function () { input.click(); });
      input.addEventListener('change', function () {
        if (this.files && this.files[0]) replaceTexture(channel, this.files[0]);
      });
    });
  }

  /* ========== Helpers ========== */
  function setStatus(msg) {
    $('statusBar').textContent = msg;
  }
  function showLoading(on) {
    $('loadingOverlay').style.display = on ? '' : 'none';
  }
  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  /* ========== Boot ========== */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
