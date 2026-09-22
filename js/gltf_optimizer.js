/**
 * glTF 压缩与 LOD — 本地查看面数/贴图/显存，减面 + 缩贴图并导出 GLB
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const $ = (id) => document.getElementById(id);
const drop = $('drop');
const fileInput = $('file');
const btnOptimize = $('btnOptimize');
const btnExport = $('btnExport');
const statusEl = $('status');
const statsEl = $('stats');
const texListEl = $('texList');
const compareBody = document.querySelector('#compare tbody');
const canvas = $('cv');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1714);
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
camera.position.set(2.2, 1.6, 2.8);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xd8f3ea, 0x1a2a24, 1.1));
const key = new THREE.DirectionalLight(0xfff2dd, 1.6);
key.position.set(4, 6, 3);
scene.add(key);
scene.add(new THREE.GridHelper(8, 16, 0x2a5a4e, 0x1a332c));

const state = {
  original: null,
  optimized: null,
  fileName: 'model',
  origBytes: 0,
  origStats: null,
  optStats: null,
};

function setStatus(t) { statusEl.textContent = t; }

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

function analyze(root) {
  let meshes = 0, tris = 0, verts = 0, materials = 0;
  const matSet = new Set();
  const textures = new Map();
  root.traverse((o) => {
    if (o.isMesh && o.geometry) {
      meshes++;
      const g = o.geometry;
      const vc = g.attributes.position ? g.attributes.position.count : 0;
      verts += vc;
      const ic = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
      tris += Math.floor(ic / 3);
    }
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (!m) continue;
      matSet.add(m);
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap']) {
        const t = m[k];
        if (t && t.image) {
          const w = t.image.width || 0;
          const h = t.image.height || 0;
          const key = `${k} ${w}x${h}`;
          if (!textures.has(key)) {
            // RGBA8 estimate
            textures.set(key, { name: k, w, h, bytes: w * h * 4 });
          }
        }
      }
    }
  });
  materials = matSet.size;
  let texBytes = 0;
  textures.forEach((v) => { texBytes += v.bytes; });
  return {
    meshes, tris, verts, materials,
    textures: [...textures.values()],
    texBytes,
    vram: texBytes + verts * (12 + 12 + 8), // pos+nrm+uv rough
  };
}

function renderStats() {
  const o = state.origStats;
  const p = state.optStats;
  if (!o) { statsEl.textContent = '尚未加载模型'; return; }
  let s = `文件: ${state.fileName}  ${fmtBytes(state.origBytes)}\n`;
  s += `Mesh ${o.meshes} · 三角面 ${o.tris.toLocaleString()} · 顶点 ${o.verts.toLocaleString()} · 材质 ${o.materials}\n`;
  s += `贴图估 ${fmtBytes(o.texBytes)} · 显存约 ${fmtBytes(o.vram)}`;
  if (p) {
    s += `\n—— 优化 ——\nMesh ${p.meshes} · 三角面 ${p.tris.toLocaleString()} · 顶点 ${p.verts.toLocaleString()} · 材质 ${p.materials}\n`;
    s += `贴图估 ${fmtBytes(p.texBytes)} · 显存约 ${fmtBytes(p.vram)}`;
  }
  statsEl.textContent = s;

  texListEl.innerHTML = (o.textures || []).map((t) =>
    `<span class="chip">${t.name} ${t.w}×${t.h} · ${fmtBytes(t.bytes)}</span>`
  ).join('') || '<span class="chip">无贴图</span>';

  const rows = [
    ['三角面', o.tris, p ? p.tris : '—'],
    ['顶点', o.verts, p ? p.verts : '—'],
    ['材质', o.materials, p ? p.materials : '—'],
    ['贴图占用', fmtBytes(o.texBytes), p ? fmtBytes(p.texBytes) : '—'],
    ['显存约', fmtBytes(o.vram), p ? fmtBytes(p.vram) : '—'],
  ];
  compareBody.innerHTML = rows.map((r) =>
    `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`
  ).join('');
}

function frameObject(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3()).length() || 1;
  const center = box.getCenter(new THREE.Vector3());
  controls.target.copy(center);
  const dist = size * 1.1;
  camera.position.set(center.x + dist * 0.7, center.y + dist * 0.5, center.z + dist * 0.7);
  camera.near = size / 200;
  camera.far = size * 20;
  camera.updateProjectionMatrix();
  controls.update();
}

function showRoot(root) {
  if (state.preview) scene.remove(state.preview);
  state.preview = root;
  scene.add(root);
  frameObject(root);
}

async function loadFile(file) {
  setStatus('读取 ' + file.name + ' …');
  state.fileName = file.name.replace(/\.(glb|gltf)$/i, '');
  state.origBytes = file.size;
  state.optimized = null;
  state.optStats = null;
  btnExport.disabled = true;

  const buf = await file.arrayBuffer();
  const loader = new GLTFLoader();
  const gltf = await new Promise((resolve, reject) => {
    loader.parse(buf, '', resolve, reject);
  });
  state.original = gltf.scene;
  state.origStats = analyze(state.original);
  showRoot(state.original.clone(true));
  renderStats();
  btnOptimize.disabled = false;
  setStatus(`已加载 ${file.name}（${fmtBytes(file.size)}）。可调参数后点「生成优化版」。`);
}

function resizeTex(tex, maxSize) {
  const img = tex.image;
  if (!img || !img.width || !img.height) return tex;
  if (img.width <= maxSize && img.height <= maxSize) return tex;
  const scale = Math.min(maxSize / img.width, maxSize / img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, w, h);
  const nt = new THREE.CanvasTexture(c);
  nt.colorSpace = tex.colorSpace;
  nt.wrapS = tex.wrapS;
  nt.wrapT = tex.wrapT;
  nt.flipY = tex.flipY;
  nt.needsUpdate = true;
  return nt;
}

/** Vertex-cluster decimation (simple, keeps a readable silhouette). */
function decimateGeometry(geo, ratio) {
  if (ratio <= 0) return geo;
  const pos = geo.attributes.position;
  if (!pos) return geo;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const sx = bb.max.x - bb.min.x || 1;
  const sy = bb.max.y - bb.min.y || 1;
  const sz = bb.max.z - bb.min.z || 1;
  // cell size grows with decimate strength
  const cells = Math.max(2, Math.floor(24 * (1 - ratio * 0.85)));
  const cx = sx / cells, cy = sy / cells, cz = sz / cells;
  const map = new Map();
  const newPos = [];
  const remap = new Uint32Array(pos.count);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ix = Math.floor((x - bb.min.x) / cx);
    const iy = Math.floor((y - bb.min.y) / cy);
    const iz = Math.floor((z - bb.min.z) / cz);
    const key = ix + '_' + iy + '_' + iz;
    let idx = map.get(key);
    if (idx === undefined) {
      idx = newPos.length / 3;
      map.set(key, idx);
      newPos.push(x, y, z);
    }
    remap[i] = idx;
  }

  const index = geo.index;
  const outIdx = [];
  const seen = new Set();
  const count = index ? index.count : pos.count;
  for (let i = 0; i < count; i += 3) {
    const a = remap[index ? index.getX(i) : i];
    const b = remap[index ? index.getX(i + 1) : i + 1];
    const c = remap[index ? index.getX(i + 2) : i + 2];
    if (a === b || b === c || a === c) continue;
    const k = a + ',' + b + ',' + c;
    if (seen.has(k)) continue;
    seen.add(k);
    outIdx.push(a, b, c);
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3));
  out.setIndex(outIdx);
  out.computeVertexNormals();
  // keep uv if possible by nearest original (skip for simplicity on strong decimate)
  if (geo.attributes.uv) {
    const uv = new Float32Array((newPos.length / 3) * 2);
    for (let i = 0; i < pos.count; i++) {
      const di = remap[i];
      uv[di * 2] = geo.attributes.uv.getX(i);
      uv[di * 2 + 1] = geo.attributes.uv.getY(i);
    }
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  return out;
}

function optimize() {
  if (!state.original) return;
  const texMax = Number($('texMax').value) || 0;
  const dec = Number($('decimate').value) || 0;
  setStatus('生成优化版…');

  const root = state.original.clone(true);
  root.traverse((o) => {
    if (o.isMesh && o.geometry) {
      if (dec > 0) {
        const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
        // toNonIndexed already unique verts; run cluster then
        const src = o.geometry;
        o.geometry = decimateGeometry(src.clone(), dec);
      }
    }
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      if (!m) continue;
      const cloned = m.clone();
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap']) {
        if (cloned[k] && texMax > 0) cloned[k] = resizeTex(cloned[k], texMax);
      }
      if (Array.isArray(o.material)) o.material[i] = cloned;
      else o.material = cloned;
    }
  });

  state.optimized = root;
  state.optStats = analyze(root);
  showRoot(root.clone(true));
  renderStats();
  btnExport.disabled = false;
  const o = state.origStats, p = state.optStats;
  setStatus(`优化完成：面 ${o.tris.toLocaleString()} → ${p.tris.toLocaleString()}，显存约 ${fmtBytes(o.vram)} → ${fmtBytes(p.vram)}`);
}

function exportGlb() {
  const root = state.optimized;
  if (!root) return;
  setStatus('导出 GLB…');
  const exporter = new GLTFExporter();
  exporter.parse(root, (result) => {
    const blob = new Blob([result], { type: 'model/gltf-binary' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = state.fileName + '_optimized.glb';
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus(`已导出 ${a.download}（${fmtBytes(blob.size)}）`);
  }, (err) => {
    setStatus('导出失败: ' + err.message);
  }, { binary: true });
}

// UI
drop.addEventListener('click', () => fileInput.click());
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('dragover');
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) loadFile(f).catch((err) => setStatus('加载失败: ' + err.message));
});
fileInput.addEventListener('change', () => {
  const f = fileInput.files && fileInput.files[0];
  if (f) loadFile(f).catch((err) => setStatus('加载失败: ' + err.message));
});
btnOptimize.addEventListener('click', () => optimize());
btnExport.addEventListener('click', () => exportGlb());

function resize() {
  const w = canvas.clientWidth || 600;
  const h = canvas.clientHeight || 360;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener('resize', resize);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

resize();
renderStats();
animate();
