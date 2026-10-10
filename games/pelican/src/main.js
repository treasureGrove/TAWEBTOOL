import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { clamp, deg, lerp } from './util.js';
import { createAtmosphere, ATMOS } from './atmosphere.js';
import { createTerrain } from './terrain.js';
import { createScenery } from './scenery.js';
import { createBicycle } from './bicycle.js';
import { createPelican } from './pelican.js';
import { createLoader, createUI, ATMOS_ORDER } from './ui.js';

const params = new URLSearchParams(location.search);
const SHOT = params.has('shot'); // tools/shot.mjs: no animation loop, no intro, UI hidden unless &ui=1
const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
if (SHOT && !params.has('ui')) document.body.classList.add('shot');

const loader = createLoader();
const ui = createUI({ shot: SHOT });

const app = document.getElementById('app');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
} catch (err) {
  loader.fail('这个浏览器暂时无法启动 WebGL。\n请换用最新版的 Chrome、Edge、Firefox 或 Safari，\n并确认已开启硬件加速。');
  throw err;
}
const MAX_PR = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(MAX_PR);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.05, 9000);

// ---------------------------------------------------------------------------------------------
// World (built step by step in init(), behind the loading screen)
// ---------------------------------------------------------------------------------------------
const atmosphere = createAtmosphere({ renderer, scene });
const world = { bike: null, pelican: null, scenery: null };
let terrain = null;
let preset = ATMOS.golden;

// The rig (bike + rider) stays parked at the origin; the world scrolls past it.
const rig = new THREE.Group();
scene.add(rig);

// ---------------------------------------------------------------------------------------------
// Post-processing: MSAA HDR target -> bloom -> tone map -> grade (vignette, split tone, grain, fade)
// ---------------------------------------------------------------------------------------------
const size = new THREE.Vector2();
renderer.getDrawingBufferSize(size);
const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), preset.bloom, 0.75, 0.88);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uVignette: { value: 0.38 },
    uGrain: { value: 0.016 },
    uFade: { value: 0 },
    uFadeColor: { value: new THREE.Color(1, 0.85, 0.7) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uRes;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uFade;
    uniform vec3 uFadeColor;
    varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 q = vUv - 0.5;
      q.x *= uRes.x / uRes.y;
      c.rgb *= clamp(1.0 - dot(q, q) * uVignette * 1.35, 0.0, 1.0);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb += (vec3(0.014, 0.005, -0.010) * (1.0 - l) + vec3(-0.004, 0.002, 0.010) * l) * 0.6;
      float g = fract(sin(dot(vUv * uRes + fract(uTime) * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
      c.rgb += (g - 0.5) * uGrain;
      c.rgb = mix(c.rgb, uFadeColor, uFade);
      gl_FragColor = c;
    }`,
});
composer.addPass(grade);

// ---------------------------------------------------------------------------------------------
// Orbit camera (spherical around a target; azimuth measured from +X toward +Z)
// ---------------------------------------------------------------------------------------------
const VIEWS = {
  hero: { r: 5.3, az: 38, pol: 82, tx: 0.1, ty: 1.12, tz: 0, fov: 34 },
  side: { r: 5.6, az: 90, pol: 87, tx: 0.1, ty: 1.08, tz: 0, fov: 34 },
  front: { r: 4.8, az: 10, pol: 80, tx: 0.2, ty: 1.2, tz: 0, fov: 34 },
  chase: { r: 4.8, az: 165, pol: 76, tx: 0.2, ty: 1.2, tz: 0, fov: 34 },
  face: { r: 1.6, az: 40, pol: 85, tx: 0.5, ty: 1.78, tz: 0, fov: 34 },
};
// The opening shot starts behind and to the right, wide and low, then swings round to the hero view.
const INTRO_FROM = { r: 9.6, az: 158, pol: 88, tx: -0.5, ty: 0.94, tz: 0, fov: 29 };
const INTRO_SECONDS = 6.4;
const CAM_KEYS = ['r', 'az', 'pol', 'tx', 'ty', 'tz', 'fov'];
const toRad = (v) => ({ ...v, az: deg(v.az), pol: deg(v.pol) });

const cam = toRad(VIEWS.hero);
let goal = null;
let intro = null;
let activeView = null;
let autoOrbit = false;
let dragging = false;
let maxR = 14; // the screenshot tool may lift this to frame far scenery
let clock = 0; // wall-clock seconds; keeps the camera "breathing" even while the ride is paused
const DRIFT = !SHOT && !REDUCED_MOTION;
const ORBIT_RATE = 0.17; // rad/s

function setActiveView(name) {
  if (activeView === name) return;
  activeView = name;
  ui.setView(name);
}

function setView(name) {
  const v = VIEWS[name];
  if (!v) return;
  intro = null;
  let az = deg(v.az);
  while (az - cam.az > Math.PI) az -= Math.PI * 2;
  while (az - cam.az < -Math.PI) az += Math.PI * 2;
  goal = { ...v, az, pol: deg(v.pol) };
  setActiveView(name);
  ui.hideHint();
}

// The user grabbed the camera: stop any scripted move.
function takeCamera() {
  goal = null;
  intro = null;
  setActiveView(null);
  ui.hideHint();
}

function startIntro() {
  Object.assign(cam, toRad(INTRO_FROM));
  intro = { t: -0.7, dur: INTRO_SECONDS, from: toRad(INTRO_FROM), to: toRad(VIEWS.hero) };
}

function endIntro() {
  intro = null;
  setActiveView('hero');
  ui.startIdleClock();
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  ui.hint(
    coarse
      ? '<b>拖动</b>旋转<i></i><b>双指</b>缩放<i></i><b>双击</b>复位'
      : '<b>拖动</b>旋转<i></i><b>滚轮</b>缩放<i></i><b>双击</b>复位<i></i><b>?</b>帮助'
  );
}

const smoother = (u) => u * u * u * (u * (u * 6 - 15) + 10);

function applyCamera(dt) {
  const ax = ui.axes;
  if (!SHOT && (ax.yaw || ax.zoom)) {
    takeCamera();
    cam.az -= ax.yaw * dt * 1.2;
    cam.r *= 1 + ax.zoom * dt * 1.2;
  }
  const orbitStep = autoOrbit && !dragging ? dt * ORBIT_RATE : 0;
  if (intro) {
    intro.t += dt;
    const u = clamp(intro.t / intro.dur, 0, 1);
    const k = smoother(u);
    for (const key of CAM_KEYS) cam[key] = lerp(intro.from[key], intro.to[key], k);
    if (u >= 1) endIntro();
  } else if (goal) {
    goal.az += orbitStep;
    const k = Math.min(1, dt * 3.2);
    for (const key of CAM_KEYS) cam[key] += (goal[key] - cam[key]) * k;
    if (Math.abs(goal.az - cam.az) < 1e-3 && Math.abs(goal.r - cam.r) < 1e-3 && Math.abs(goal.pol - cam.pol) < 1e-3) goal = null;
  }
  cam.az += orbitStep;
  cam.pol = clamp(cam.pol, 0.2, 1.62);
  cam.r = clamp(cam.r, 0.8, maxR);

  // gentle breathing so the frame is never perfectly static (applied on top, never stored)
  let az = cam.az;
  let pol = cam.pol;
  let r = cam.r;
  if (DRIFT) {
    az += Math.sin(clock * 0.23) * 0.016 + Math.sin(clock * 0.11 + 1.7) * 0.01;
    pol += Math.sin(clock * 0.19 + 0.6) * 0.007;
    r *= 1 + Math.sin(clock * 0.15 + 2.2) * 0.008;
  }
  // tall (portrait) windows: pull back so the whole bike still fits across the narrower frame
  const aspect = camera.aspect;
  if (aspect < 1.25) r *= Math.min(2, Math.pow(1.25 / aspect, 0.8));

  const s = Math.sin(pol);
  camera.position.set(cam.tx + r * s * Math.cos(az), cam.ty + r * Math.cos(pol), cam.tz + r * s * Math.sin(az));
  if (camera.position.y < 0.18) camera.position.y = 0.18;
  camera.lookAt(cam.tx, cam.ty, cam.tz);
  if (Math.abs(camera.fov - cam.fov) > 1e-3) {
    camera.fov = cam.fov;
    camera.updateProjectionMatrix();
  }
}

const pointers = new Map();
let pinch = 0;
const el = renderer.domElement;
el.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  el.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  dragging = true;
  document.body.classList.add('dragging');
  if (goal || intro) takeCamera();
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = Math.hypot(a.x - b.x, a.y - b.y);
  }
});
el.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (pointers.size === 1) {
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (dx || dy) takeCamera();
    cam.az -= dx * 0.006;
    cam.pol -= dy * 0.006;
  }
  p.x = e.clientX;
  p.y = e.clientY;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    takeCamera();
    if (pinch > 0 && d > 0) cam.r *= pinch / d;
    pinch = d;
  }
});
const release = (e) => {
  pointers.delete(e.pointerId);
  dragging = pointers.size > 0;
  if (!dragging) document.body.classList.remove('dragging');
  pinch = 0;
};
el.addEventListener('pointerup', release);
el.addEventListener('pointercancel', release);
el.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    takeCamera();
    const unit = e.deltaMode === 1 ? 33 : 1; // Firefox reports lines
    cam.r *= Math.exp(clamp(e.deltaY * unit, -160, 160) * (e.ctrlKey ? 0.0022 : 0.0009));
  },
  { passive: false }
);
el.addEventListener('dblclick', () => setView('hero'));

el.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  ui.toast('显卡画面中断了，正在尝试恢复…', 5000);
});
el.addEventListener('webglcontextrestored', () => {
  atmosphere.apply(atmosphere.state.name); // the baked environment map lived on the GPU
  ui.toast('已恢复', 1600);
});

// ---------------------------------------------------------------------------------------------
// Resize + adaptive resolution
// ---------------------------------------------------------------------------------------------
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.resolution.set(w, h);
  grade.uniforms.uRes.value.set(w, h);
}
window.addEventListener('resize', resize);

// Frame-time governor: steps the render scale down when the GPU struggles and cautiously back up
// when there is headroom (never back to a level that already failed).
const PR_STEPS = [MAX_PR, 1.6, 1.3, 1, 0.8, 0.65].filter((p, i) => i === 0 || p < MAX_PR - 0.05);
const perf = { level: 0, acc: 0, frames: 0, calm: 0, settle: 3.5, bad: new Set() };
function setQuality(level) {
  perf.level = level;
  perf.settle = 2.5;
  renderer.setPixelRatio(PR_STEPS[level]);
  composer.setPixelRatio(PR_STEPS[level]);
}
function tuneQuality(rawDt) {
  if (SHOT || document.hidden || rawDt <= 0) return;
  if (perf.settle > 0) {
    perf.settle -= rawDt;
    return;
  }
  if (rawDt > 0.4) return; // tab switch or one-off hitch, not a trend
  perf.acc += rawDt;
  perf.frames++;
  if (perf.acc < 1.5) return;
  const avg = perf.acc / perf.frames;
  perf.acc = 0;
  perf.frames = 0;
  if (avg > 1 / 40 && perf.level < PR_STEPS.length - 1) {
    perf.bad.add(perf.level);
    perf.calm = 0;
    setQuality(perf.level + 1);
  } else if (avg < 1 / 54) {
    if (++perf.calm >= 5 && perf.level > 0 && !perf.bad.has(perf.level - 1)) {
      perf.calm = 0;
      setQuality(perf.level - 1);
    }
  } else {
    perf.calm = 0;
  }
}

// ---------------------------------------------------------------------------------------------
// Simulation loop
// ---------------------------------------------------------------------------------------------
const BASE_SPEED = 4.5;
let speedFactor = 1;
let paused = false;
let simTime = 0;
let speed = SHOT ? BASE_SPEED : 0.9; // the ride starts from a slow roll
let travelled = 0;

function stepSim(dt) {
  simTime += dt;
  speed += (BASE_SPEED * speedFactor - speed) * Math.min(1, dt * (simTime < 5 ? 0.85 : 2));
  const distance = speed * dt;
  travelled += distance;
  terrain?.update(travelled, camera);
  atmosphere.update(simTime, camera);
  if (world.bike) world.bike.update(distance);
  if (world.scenery) world.scenery.update(dt, distance, simTime);
  if (world.pelican) world.pelican.update(dt, simTime, { speed, camera, travelled });
}

function render(dt = 1 / 60) {
  applyCamera(dt);
  atmosphere.update(simTime, camera);
  grade.uniforms.uTime.value = simTime;
  composer.render(dt);
}

// ---------------------------------------------------------------------------------------------
// Time of day: dip through the incoming sky colour, swap while hidden, then fade back in
// ---------------------------------------------------------------------------------------------
let swap = null;
const FADE_OUT = 0.3;
const FADE_IN = 0.85;
const FADE_MAX = 0.92;

function applyAtmosphere(name) {
  if (!ATMOS[name]) return;
  preset = atmosphere.apply(name);
  bloom.strength = preset.bloom;
  world.scenery?.setAtmosphere(name, preset);
  ui.setAtmos(name);
}

function setAtmosphere(name, animated = false) {
  if (!ATMOS[name]) return;
  if (!animated || SHOT || REDUCED_MOTION || !world.scenery) {
    swap = null;
    grade.uniforms.uFade.value = 0;
    applyAtmosphere(name);
    return;
  }
  if (swap) {
    // retarget a dip that is already running
    swap.name = name;
    swap.colorSet = false;
    ui.setAtmos(name);
    return;
  }
  if (name === atmosphere.state.name) return;
  swap = { name, t: 0, switched: false, colorSet: false };
  ui.setAtmos(name);
}

function stepSwap(dt) {
  if (!swap) return;
  const u = grade.uniforms;
  if (!swap.colorSet) {
    // raw (display-space) components: the grade pass runs after tone mapping
    u.uFadeColor.value.setStyle(ATMOS[swap.name].fog, THREE.LinearSRGBColorSpace);
    swap.colorSet = true;
  }
  swap.t += dt;
  if (!swap.switched) {
    const k = clamp(swap.t / FADE_OUT, 0, 1);
    u.uFade.value = FADE_MAX * k * k;
    if (swap.t >= FADE_OUT) {
      applyAtmosphere(swap.name);
      swap.switched = true;
      swap.t = 0;
    }
  } else {
    const k = clamp(swap.t / FADE_IN, 0, 1);
    u.uFade.value = FADE_MAX * (1 - k * k * (3 - 2 * k));
    if (swap.t >= FADE_IN) {
      u.uFade.value = 0;
      swap = null;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Photo + fullscreen
// ---------------------------------------------------------------------------------------------
let photoPending = false;
function capturePhoto() {
  ui.flash();
  renderer.domElement.toBlob((blob) => {
    if (!blob) {
      ui.toast('截图失败了，请再试一次');
      return;
    }
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const a = document.createElement('a');
    a.download = `鹈鹕骑行-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    ui.toast(`已保存截图 · ${renderer.domElement.width}×${renderer.domElement.height}`, 2600);
  }, 'image/png');
}

function toggleFullscreen() {
  const d = document;
  if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
  else {
    const root = d.documentElement;
    const req = root.requestFullscreen || root.webkitRequestFullscreen;
    if (req) Promise.resolve(req.call(root)).catch(() => ui.toast('浏览器拒绝了全屏请求'));
  }
}

// ---------------------------------------------------------------------------------------------
// Controls -> simulation
// ---------------------------------------------------------------------------------------------
const kmh = (f) => Math.round(BASE_SPEED * f * 3.6);
const actions = {
  view: setView,
  atmos: (name) => setAtmosphere(name, true),
  atmosNext: () => {
    const cur = swap ? swap.name : atmosphere.state.name;
    setAtmosphere(ATMOS_ORDER[(ATMOS_ORDER.indexOf(cur) + 1) % ATMOS_ORDER.length], true);
  },
  pause() {
    paused = !paused;
    ui.setPaused(paused);
    ui.toast(paused ? '已暂停 · 空格继续' : '继续骑行', 1400);
  },
  orbit() {
    autoOrbit = !autoOrbit;
    ui.setOrbit(autoOrbit);
    ui.toast(autoOrbit ? '自动环绕 · 开' : '自动环绕 · 关', 1400);
  },
  speed(f) {
    speedFactor = clamp(f, 0.25, 2);
    ui.setSpeed(speedFactor);
  },
  speedStep(dir) {
    actions.speed(Math.round((speedFactor + dir * 0.25) * 20) / 20);
    ui.toast(`车速 ${kmh(speedFactor)} km/h`, 1100);
  },
  shot() {
    photoPending = true;
  },
  fullscreen: toggleFullscreen,
};
ui.bind(actions);
ui.setSpeed(1);
ui.setPaused(false);
ui.setOrbit(false);

let last = performance.now();
function frame(now) {
  const raw = (now - last) / 1000;
  last = now;
  const dt = Math.min(Math.max(raw, 0), 1 / 20);
  clock += dt;
  if (!paused) stepSim(dt);
  stepSwap(dt);
  render(dt);
  if (photoPending) {
    photoPending = false;
    capturePhoto(); // same task as the render, so the drawing buffer is still intact
  }
  ui.setKmh(speed * 3.6);
  tuneQuality(raw);
}
document.addEventListener('visibilitychange', () => {
  last = performance.now();
});

// ---------------------------------------------------------------------------------------------
// Public hooks (also used by tools/shot.mjs)
// ---------------------------------------------------------------------------------------------
window.__pelican = {
  ready: false,
  THREE,
  scene,
  camera,
  renderer,
  world,
  ui,
  info() {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      three: THREE.REVISION,
      gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/a',
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      pixelRatio: renderer.getPixelRatio(),
    };
  },
  shoot(o = {}) {
    intro = null;
    swap = null;
    grade.uniforms.uFade.value = 0;
    if (o.time && o.time !== atmosphere.state.name) applyAtmosphere(o.time);
    const t = o.t ?? simTime;
    const base = VIEWS[o.view] || VIEWS.hero;
    cam.r = o.r ?? base.r;
    maxR = Math.max(14, cam.r);
    cam.az = deg(o.az ?? base.az);
    cam.pol = deg(o.pol ?? base.pol);
    cam.tx = o.tx ?? base.tx;
    cam.ty = o.ty ?? base.ty;
    cam.tz = o.tz ?? base.tz;
    cam.fov = o.fov ?? base.fov;
    if (o.focus && world.scenery) {
      // aim at the nth-closest prop of a kind, as it will be once the sim has run up to time t
      const p = world.scenery.locate(o.focus, o.nth ?? 0, o.nearX ?? 0, speed * Math.max(0, t - simTime));
      if (p) {
        cam.tx = p.x + (o.fx ?? 0);
        cam.ty = p.y + (o.fy ?? 0);
        cam.tz = p.z + (o.fz ?? 0);
      }
    }
    goal = null;
    applyCamera(0);
    while (simTime < t) stepSim(1 / 60);
    render(1 / 60);
    render(1 / 60);
    return this.info();
  },
  step(n = 1) {
    for (let i = 0; i < n; i++) stepSim(1 / 60);
  },
};

// ---------------------------------------------------------------------------------------------
// Boot: build the world in stages so the loading screen can show progress
// ---------------------------------------------------------------------------------------------
const tick = () =>
  new Promise((res) => {
    let done = false;
    const go = () => {
      if (!done) {
        done = true;
        res();
      }
    };
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 120); // background tabs do not run rAF
  });

async function init() {
  loader.set(0.06, '铺设海岸公路…');
  await tick();
  preset = atmosphere.apply('golden');
  bloom.strength = preset.bloom;
  terrain = createTerrain({ scene, atmosphere });

  loader.set(0.3, '栽下棕榈与路灯…');
  await tick();
  world.scenery = createScenery({ scene, atmosphere, terrain, camera, renderer });
  world.scenery.setAtmosphere('golden', preset);

  loader.set(0.55, '擦亮自行车…');
  await tick();
  world.bike = createBicycle();
  rig.add(world.bike.group);

  loader.set(0.72, '梳理羽毛…');
  await tick();
  world.pelican = createPelican(world.bike);
  rig.add(world.pelican.group);

  loader.set(0.88, '等一缕晚风…');
  await tick();
  resize();
  ui.setAtmos('golden');
  try {
    await renderer.compileAsync(scene, camera);
  } catch (err) {
    console.warn('shader precompile skipped:', err);
  }
  if (!SHOT && !REDUCED_MOTION) startIntro();
  else setActiveView('hero');
  render();
  render();
  loader.set(1, '出发');
  await tick();

  loader.done();
  if (!SHOT) {
    last = performance.now();
    renderer.setAnimationLoop(frame);
    if (REDUCED_MOTION) endIntro();
  }
  window.__pelican.ready = true;
}

init().catch((err) => {
  console.error(err);
  loader.fail(`场景生成时出了点问题：\n${err && err.message ? err.message : err}`);
});

export { world, setView, applyAtmosphere, VIEWS, ATMOS };
