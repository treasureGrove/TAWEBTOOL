/**
 * 小树林尸潮 Grove Horde — Three.js FPS mini-game
 * Systems: rng · audio · input · player · weapon · enemies · waves · vfx · ui · scores
 * Graphics pass-2: bright twilight range, authored silhouettes, material roles
 */
let THREE;
try {
  THREE = await import('three');
} catch {
  try {
    THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
  } catch {
    THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js');
  }
}

// ─── DOM ───
const $ = (id) => document.getElementById(id);
const canvas = $('grCanvas');
const shell = $('grShell');
const el = {
  hud: $('grHud'),
  wave: $('hudWave'),
  targets: $('hudTargets'),
  score: $('hudScore'),
  combo: $('hudCombo'),
  hp: $('hudHp'),
  hpBar: $('hudHpBar'),
  ammo: $('hudAmmo'),
  ammoBar: $('hudAmmoBar'),
  reserve: $('hudReserve'),
  feed: $('hudFeed'),
  toast: $('hudToast'),
  hit: $('grHit'),
  dmg: $('grDmg'),
  cross: $('grCross'),
  menu: $('grMenu'),
  pause: $('grPause'),
  over: $('grOver'),
  board: $('grBoard'),
  report: $('grReport'),
  name: $('inpName'),
  submitNote: $('submitNote'),
  boardSource: $('boardSource'),
  rankList: $('rankList'),
};

// ─── Tuning ───
const TUNE = {
  moveSpeed: 5.6,
  sprintMul: 1.55,
  dashSpeed: 14,
  dashTime: 0.14,
  dashCd: 1.1,
  eyeHeight: 1.55,
  arenaRadius: 18,
  hpMax: 100,
  magSize: 30,
  reserveMax: 120,
  fireInterval: 0.11,
  reloadTime: 1.35,
  adsFov: 48,
  hipFov: 74,
  comboWindow: 2.4,
  comboMax: 8,
};

// ─── Palette / material roles ───
const PAL = {
  skyTop: 0x7ec8bc,
  skyHorizon: 0xd4f3ea,
  ground: 0x3a5c52,
  groundDark: 0x243f38,
  ink: 0xe8fff8,
  accent: 0x2fd4a4,
  accentDeep: 0x0f7a62,
  threat: 0xff7a55,
  threatDeep: 0xc23a1a,
  ice: 0x9be7ff,
  wood: 0x6b5344,
  metal: 0x8a9aa3,
  metalDark: 0x3d4a52,
  paper: 0xf2efe6,
};

// ─── Seeded RNG ───
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rng = mulberry32(1337);
function rrange(a, b) { return a + (b - a) * rng(); }

// ─── Audio ───
const AudioSys = {
  ctx: null,
  master: null,
  enabled: true,
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.22;
    this.master.connect(this.ctx.destination);
  },
  tone(freq, dur, type = 'square', gain = 0.2, slide = 0) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  },
  noise(dur, gain = 0.15, filterFreq = 1800) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  },
  shoot() { this.tone(220, 0.07, 'square', 0.18, -80); this.noise(0.05, 0.1, 2400); },
  hit() { this.tone(880, 0.05, 'triangle', 0.12); },
  kill() { this.tone(520, 0.1, 'sawtooth', 0.14, 180); this.noise(0.08, 0.08, 3200); },
  core() { this.tone(1200, 0.12, 'triangle', 0.16, 300); },
  hurt() { this.tone(120, 0.18, 'sawtooth', 0.18, -40); this.noise(0.1, 0.12, 700); },
  reload() { this.tone(180, 0.08, 'square', 0.08); setTimeout(() => this.tone(260, 0.08, 'square', 0.08), 90); },
  wave() { this.tone(392, 0.12, 'triangle', 0.12); setTimeout(() => this.tone(523, 0.16, 'triangle', 0.12), 110); },
  over() { this.tone(200, 0.3, 'sawtooth', 0.14, -80); },
  ui() { this.tone(660, 0.05, 'triangle', 0.08); },
};

// ─── Game state ───
const S = {
  state: 'menu',
  pausedForScreenshot: false,
  reducedMotion: false,
  seed: 1337,
  wave: 0,
  score: 0,
  combo: 1,
  comboTimer: 0,
  kills: 0,
  shots: 0,
  hits: 0,
  cores: 0,
  hp: TUNE.hpMax,
  ammo: TUNE.magSize,
  reserve: TUNE.reserveMax,
  reloading: false,
  reloadT: 0,
  fireCd: 0,
  ads: false,
  sprint: false,
  dashT: 0,
  dashCd: 0,
  dashDir: new THREE.Vector3(),
  playMs: 0,
  submitted: false,
  lastLocalBest: 0,
};
S.accuracy = function accuracy() {
  return S.shots > 0 ? S.hits / S.shots : 0;
};

// ─── Three setup ───
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xb7e0d6, 28, 70);

const camera = new THREE.PerspectiveCamera(TUNE.hipFov, 1, 0.05, 140);
const yawObj = new THREE.Object3D();
const pitchObj = new THREE.Object3D();
yawObj.add(pitchObj);
pitchObj.add(camera);
scene.add(yawObj);
// Face arena center (camera looks along local -Z; yaw 0 = toward -Z from z>0).
yawObj.position.set(0, TUNE.eyeHeight, 11.5);
yawObj.rotation.set(0, 0, 0);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

// ─── World kit ───
const world = {
  colliders: [],
  bounds: TUNE.arenaRadius,
  enemies: [],
  bolts: [],
  particles: [],
  tracers: [],
};

function addBoxCollider(cx, cz, w, d) {
  world.colliders.push({ type: 'box', minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
}

function makeCanvasTexture(draw, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeSky() {
  const tex = makeCanvasTexture((g, s) => {
    const grd = g.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0, '#5eb8ad');
    grd.addColorStop(0.45, '#9ad9cc');
    grd.addColorStop(0.72, '#d8f3ea');
    grd.addColorStop(1, '#f0f7f2');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    // soft sun bloom
    const sun = g.createRadialGradient(s * 0.7, s * 0.28, 4, s * 0.7, s * 0.28, s * 0.35);
    sun.addColorStop(0, 'rgba(255,250,230,0.95)');
    sun.addColorStop(0.35, 'rgba(255,240,200,0.35)');
    sun.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, s, s);
  }, 512);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(80, 32, 16),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  scene.add(sky);
  scene.background = new THREE.Color(PAL.skyHorizon);
}

function makeGroundTex() {
  return makeCanvasTexture((g, s) => {
    g.fillStyle = '#4a6f64';
    g.fillRect(0, 0, s, s);
    const cell = s / 6;
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        g.fillStyle = (x + y) % 2 === 0 ? '#527a6e' : '#46685e';
        g.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
      }
    }
    // subtle seams
    g.strokeStyle = 'rgba(20,40,35,0.12)';
    g.lineWidth = 2;
    for (let i = 0; i <= 6; i++) {
      g.beginPath();
      g.moveTo(i * cell, 0); g.lineTo(i * cell, s);
      g.moveTo(0, i * cell); g.lineTo(s, i * cell);
      g.stroke();
    }
    for (let i = 0; i < 120; i++) {
      g.fillStyle = `rgba(30,55,48,${0.03 + Math.random() * 0.05})`;
      g.fillRect(Math.random() * s, Math.random() * s, 3 + Math.random() * 6, 2 + Math.random() * 4);
    }
  }, 512);
}

function makeTargetTex() {
  return makeCanvasTexture((g, s) => {
    g.fillStyle = '#f2efe6';
    g.fillRect(0, 0, s, s);
    const cx = s / 2, cy = s / 2;
    const rings = [
      [s * 0.42, '#e8e2d4'],
      [s * 0.34, '#2a2a2a'],
      [s * 0.26, '#f2efe6'],
      [s * 0.18, '#2a2a2a'],
      [s * 0.1, '#ff7a55'],
      [s * 0.05, '#2a2a2a'],
    ];
    for (const [r, col] of rings) {
      g.fillStyle = col;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 3;
    g.strokeRect(8, 8, s - 16, s - 16);
  }, 256);
}

function mat(geo, color, opts = {}) {
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.15,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    flatShading: !!opts.flat,
    map: opts.map || null,
  }));
}

function buildArena() {
  makeSky();

  const groundTex = makeGroundTex();
  groundTex.repeat.set(6, 6);
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(24, 64),
    new THREE.MeshStandardMaterial({ map: groundTex, color: 0xb0d4c8, roughness: 0.9, metalness: 0.05 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Outer apron
  const apron = new THREE.Mesh(
    new THREE.RingGeometry(TUNE.arenaRadius, 23, 64),
    new THREE.MeshStandardMaterial({ color: 0x2a4a42, roughness: 0.95 })
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = 0.005;
  apron.receiveShadow = true;
  scene.add(apron);

  // Boundary neon ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(TUNE.arenaRadius - 0.15, TUNE.arenaRadius + 0.05, 64),
    new THREE.MeshBasicMaterial({ color: PAL.accent, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  scene.add(ring);

  // Inner guide rings
  for (const r of [6, 11, 15]) {
    const g = new THREE.Mesh(
      new THREE.RingGeometry(r - 0.04, r, 64),
      new THREE.MeshBasicMaterial({ color: 0x9ad9cc, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
    );
    g.rotation.x = -Math.PI / 2;
    g.position.y = 0.02;
    scene.add(g);
  }

  // Lane ticks
  const tickMat = new THREE.MeshBasicMaterial({ color: 0xd8f3ea, transparent: true, opacity: 0.35 });
  const tickGeo = new THREE.BoxGeometry(0.15, 0.02, 1.2);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const t = new THREE.Mesh(tickGeo, tickMat);
    t.position.set(Math.cos(a) * 13, 0.03, Math.sin(a) * 13);
    t.rotation.y = -a;
    scene.add(t);
  }

  // Center pedestal / hologram beacon
  const ped = new THREE.Group();
  const pedBase = mat(new THREE.CylinderGeometry(0.9, 1.1, 0.35, 12), PAL.metalDark, { roughness: 0.4, metalness: 0.7 });
  pedBase.position.y = 0.18;
  const pedCore = mat(new THREE.CylinderGeometry(0.35, 0.45, 1.4, 10), PAL.accent, {
    emissive: PAL.accentDeep, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.4,
  });
  pedCore.position.y = 1.0;
  const holo = mat(new THREE.OctahedronGeometry(0.45, 0), PAL.accent, {
    emissive: PAL.accent, emissiveIntensity: 1.4, flat: true, roughness: 0.2,
  });
  holo.name = 'holo';
  holo.position.y = 2.2;
  ped.add(pedBase, pedCore, holo);
  ped.position.set(0, 0, 0);
  ped.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(ped);
  world.holo = holo;
  addBoxCollider(0, 0, 1.4, 1.4);

  // Crystal shard clusters (cover) — authored faceted forms
  const shardMat = new THREE.MeshStandardMaterial({
    color: 0x5fd4b0,
    emissive: 0x0d6b55,
    emissiveIntensity: 0.35,
    roughness: 0.22,
    metalness: 0.4,
    flatShading: true,
  });
  const shardMat2 = new THREE.MeshStandardMaterial({
    color: 0x3a9e86,
    emissive: 0x0a4a3c,
    emissiveIntensity: 0.25,
    roughness: 0.3,
    metalness: 0.35,
    flatShading: true,
  });

  function crystalCluster(x, z, scale = 1) {
    const g = new THREE.Group();
    const specs = [
      [0, 1.4 * scale, 0, 0.42 * scale, 2.6 * scale, 0.2],
      [0.35 * scale, 0.8 * scale, 0.2 * scale, 0.28 * scale, 1.5 * scale, 0.5],
      [-0.3 * scale, 0.7 * scale, -0.15 * scale, 0.24 * scale, 1.3 * scale, -0.3],
    ];
    for (let i = 0; i < specs.length; i++) {
      const [ox, oy, oz, r, h, tilt] = specs[i];
      const geo = new THREE.CylinderGeometry(r * 0.15, r, h, 5, 1);
      const m = new THREE.Mesh(geo, i === 0 ? shardMat : shardMat2);
      m.position.set(ox, oy * 0.5, oz);
      m.rotation.set(tilt * 0.3, rrange(0, 3), tilt);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    // base rocks
    for (let i = 0; i < 3; i++) {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.25 * scale * rrange(0.7, 1.2), 0),
        new THREE.MeshStandardMaterial({ color: 0x5a6e68, roughness: 0.9, flatShading: true })
      );
      rock.position.set(rrange(-0.5, 0.5) * scale, 0.12, rrange(-0.5, 0.5) * scale);
      rock.rotation.set(rrange(0, 1), rrange(0, 2), 0);
      rock.castShadow = true;
      g.add(rock);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    addBoxCollider(x, z, 0.95 * scale, 0.95 * scale);
  }

  const crystals = [
    [5, 3, 1], [-5, 3.5, 0.9], [4, -5, 1.1], [-4.5, -4, 0.95],
    [8, -1, 0.85], [-8, 0, 1], [0, 7.5, 0.8], [1, -8.5, 0.9],
    [10, 6, 0.75], [-10, 5, 0.8], [11, -6, 0.7], [-11, -5, 0.75],
  ];
  for (const [x, z, s] of crystals) crystalCluster(x, z, s);

  // Industrial supply crates
  const crateBody = new THREE.MeshStandardMaterial({ color: 0x6a7d86, roughness: 0.55, metalness: 0.45 });
  const crateTrim = new THREE.MeshStandardMaterial({ color: 0xff7a55, roughness: 0.4, metalness: 0.3, emissive: 0x4a1808, emissiveIntensity: 0.4 });
  function crate(x, z, rot) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.85, 1.15), crateBody);
    body.position.y = 0.42;
    body.castShadow = true;
    body.receiveShadow = true;
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 1.0), crateTrim);
    top.position.y = 0.88;
    top.castShadow = true;
    const band1 = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.08, 0.12), crateTrim);
    band1.position.set(0, 0.42, 0.5);
    const band2 = band1.clone();
    band2.position.z = -0.5;
    g.add(body, top, band1, band2);
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    scene.add(g);
    addBoxCollider(x, z, 1.2, 1.2);
  }
  const crates = [[6.5, 0], [-6.5, 0.5], [2, 5], [-2, -6], [7, -3], [-7, 4]];
  for (const [x, z] of crates) crate(x, z, rrange(-0.5, 0.5));

  // Barricades / hazard stands (landmark)
  const targetTex = makeTargetTex();
  function targetStand(x, z) {
    const g = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: PAL.wood, roughness: 0.75 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.1, 8), postMat);
    post.position.y = 1.05;
    post.castShadow = true;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.35), postMat);
    foot.position.y = 0.04;
    foot.castShadow = true;
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshStandardMaterial({ map: targetTex, roughness: 0.85, side: THREE.DoubleSide })
    );
    board.position.y = 1.85;
    board.castShadow = true;
    // frame
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.6, 0.06),
      new THREE.MeshStandardMaterial({ color: PAL.metalDark, roughness: 0.5, metalness: 0.6 })
    );
    frame.position.y = 1.85;
    frame.position.z = -0.04;
    frame.castShadow = true;
    g.add(post, foot, board, frame);
    g.position.set(x, 0, z);
    g.lookAt(0, 1, 0);
    scene.add(g);
  }
  targetStand(12, 2);
  targetStand(-12, 2);
  targetStand(3, -13);
  targetStand(-3, -13);
  targetStand(13, -4);
  targetStand(-13, -4);

  // Midground trees (lighter silhouettes against bright sky)
  function tree(x, z, h, tint) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.22, h * 0.35, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a3830, roughness: 0.9 })
    );
    trunk.position.y = h * 0.17;
    const foliage = new THREE.Mesh(
      new THREE.ConeGeometry(h * 0.28, h * 0.75, 7),
      new THREE.MeshStandardMaterial({ color: tint, roughness: 0.85, flatShading: true })
    );
    foliage.position.y = h * 0.55;
    g.add(trunk, foliage);
    g.position.set(x, 0, z);
    scene.add(g);
  }
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2 + rrange(-0.08, 0.08);
    const r = rrange(25.5, 36);
    tree(Math.cos(a) * r, Math.sin(a) * r, rrange(5, 10), i % 2 ? 0x2f6b58 : 0x3d826c);
  }
  // Far hill band
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const hill = new THREE.Mesh(
      new THREE.SphereGeometry(rrange(8, 14), 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x6fa89a, roughness: 1 })
    );
    hill.scale.set(1.6, 0.35, 1);
    hill.position.set(Math.cos(a) * 48, 0, Math.sin(a) * 48);
    scene.add(hill);
  }

  // Lighting stack: key + fill + rim + practicals
  const hemi = new THREE.HemisphereLight(0xd8f3ea, 0x3a5c52, 1.15);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff2dd, 2.1);
  key.position.set(14, 22, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(1536, 1536);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 55;
  key.shadow.camera.left = -24;
  key.shadow.camera.right = 24;
  key.shadow.camera.top = 24;
  key.shadow.camera.bottom = -24;
  key.shadow.bias = -0.0003;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xb8e8ff, 0.65);
  fill.position.set(-10, 8, -12);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0x8ff0d2, 0.55);
  rim.position.set(0, 6, -18);
  scene.add(rim);
  const practical = new THREE.PointLight(PAL.accent, 1.6, 16, 2);
  practical.position.set(0, 2.5, 0);
  scene.add(practical);
  // fill lights around arena so nothing is pitch black
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const p = new THREE.PointLight(0xd4f3ea, 0.55, 22, 2);
    p.position.set(Math.cos(a) * 10, 4, Math.sin(a) * 10);
    scene.add(p);
  }
  scene.add(new THREE.AmbientLight(0xc8e8df, 0.45));
}

// ─── Weapon viewmodel (authored carbine) ───
const weapon = {
  group: new THREE.Object3D(),
  kick: 0,
  flash: null,
};

function buildWeapon() {
  const g = weapon.group;
  // Compact carbine, pushed away from the eye and scaled so it never eats the FOV.
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6b7c88, roughness: 0.45, metalness: 0.55, emissive: 0x1a2228, emissiveIntensity: 0.15 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xb8c8d0, roughness: 0.35, metalness: 0.7, emissive: 0x223038, emissiveIntensity: 0.1 });
  const accentMat = new THREE.MeshStandardMaterial({ color: PAL.accent, emissive: PAL.accentDeep, emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.4 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x3a454e, roughness: 0.65, metalness: 0.2, emissive: 0x101418, emissiveIntensity: 0.12 });

  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.075, 0.28), bodyMat);
  receiver.position.set(0, 0, 0);

  const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.05, 0.16), trimMat);
  handguard.position.set(0, 0, -0.22);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.16, 8), bodyMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0, -0.36);

  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.04, 8), accentMat);
  tip.rotation.x = Math.PI / 2;
  tip.position.set(0, 0, -0.45);

  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.055, 0.1), bodyMat);
  stock.position.set(0, -0.01, 0.16);

  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.09, 0.06), gripMat);
  mag.position.set(0, -0.08, -0.02);
  mag.rotation.x = 0.12;
  mag.name = 'mag';

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.09, 0.055), gripMat);
  grip.position.set(0, -0.08, 0.08);
  grip.rotation.x = 0.35;

  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.05), accentMat);
  sight.position.set(0, 0.055, -0.02);

  for (const dz of [-0.08, -0.14, -0.2]) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.01, 0.015), accentMat);
    vent.position.set(0, 0.03, dz);
    g.add(vent);
  }

  weapon.flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xeafff8, transparent: true, opacity: 0 })
  );
  weapon.flash.position.set(0, 0, -0.5);

  g.add(receiver, handguard, barrel, tip, stock, mag, grip, sight, weapon.flash);
  // Tuck to lower-right, keep distance so perspective does not balloon the silhouette.
  g.position.set(0.22, -0.18, -0.55);
  g.rotation.y = -0.12;
  g.scale.setScalar(0.85);
  camera.add(g);

  // Dedicated viewmodel light so the gun never reads as a black slab.
  const vmLight = new THREE.PointLight(0xd8f3ea, 2.2, 2.5, 2);
  vmLight.position.set(0.2, 0.15, -0.3);
  camera.add(vmLight);
}

// ─── Input ───
const keys = Object.create(null);
const mouse = { dx: 0, dy: 0, down: false, right: false };
let pointerLocked = false;
let rightClickAt = 0;

function isPlayMode() {
  return S.state === 'playing' || S.state === 'paused';
}

function clearHeldButtons() {
  mouse.down = false;
  mouse.right = false;
  S.ads = false;
}

function syncAdsFromHeld() {
  // ADS on keyboard only (Q / LeftCtrl). Right mouse unused — browser
  // mouse-gestures cannot steal or kill the run.
  if ((keys.KeyQ || keys.ControlLeft) && S.state === 'playing') S.ads = true;
  else S.ads = false;
}

function onKey(e, down) {
  const k = e.code;
  keys[k] = down;
  if (k === 'Space' && isPlayMode()) e.preventDefault();
  if (k === 'KeyQ' || k === 'ControlLeft') syncAdsFromHeld();
  if (!down) return;
  if (k === 'KeyR') tryReload();
  if (k === 'Space') tryDash();
  if (k === 'Escape' && S.state === 'playing') pauseGame();
}

document.addEventListener('keydown', (e) => onKey(e, true));
document.addEventListener('keyup', (e) => onKey(e, false));

// Prefer Pointer Events: mouseup for button 2 is often swallowed by the
// browser context menu / mouse-gesture UI, which left ADS stuck on.
function applyButtonsMask(buttons) {
  const left = (buttons & 1) !== 0;
  const right = (buttons & 2) !== 0;
  mouse.down = left;
  mouse.right = right;
  syncAdsFromHeld();
}

document.addEventListener('pointerdown', (e) => {
  if (isPlayMode()) {
    // Kill browser context menu / secondary-click gestures before they open.
    if (e.button === 0 || e.button === 2 || e.button === 1) e.preventDefault();
  }
  if (e.button === 0) mouse.down = true;
  if (e.button === 2) {
    rightClickAt = performance.now();
    mouse.right = true;
    syncAdsFromHeld();
  }
}, { capture: true });

document.addEventListener('pointerup', (e) => {
  if (e.button === 0) mouse.down = false;
  if (e.button === 2) {
    mouse.right = false;
    syncAdsFromHeld();
  }
}, { capture: true });

document.addEventListener('pointermove', (e) => {
  if (typeof e.buttons === 'number' && (mouse.down || mouse.right)) {
    applyButtonsMask(e.buttons);
  }
  if (!pointerLocked || S.state !== 'playing') return;
  mouse.dx += e.movementX || 0;
  mouse.dy += e.movementY || 0;
});

document.addEventListener('pointercancel', () => clearHeldButtons());
document.addEventListener('lostpointercapture', () => clearHeldButtons());
window.addEventListener('blur', () => clearHeldButtons());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearHeldButtons();
});

// Block browser chrome that steals the right button during play.
function blockBrowserChrome(e) {
  if (isPlayMode()) {
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  }
}
document.addEventListener('contextmenu', blockBrowserChrome, { capture: true });
document.addEventListener('auxclick', blockBrowserChrome, { capture: true });
document.addEventListener('mousedown', (e) => {
  if (isPlayMode() && e.button === 2) e.preventDefault();
}, { capture: true });
// Trackpad / browser swipe gestures (back/forward, zoom)
document.addEventListener('gesturestart', blockBrowserChrome, { capture: true });
document.addEventListener('gesturechange', blockBrowserChrome, { capture: true });
document.addEventListener('gestureend', blockBrowserChrome, { capture: true });
// Right-drag "画线" is a browser mouse-gesture (usually History Back) and
// leaves the page instantly ("GG"). Trap history and swallow the drag.
function trapHistory() {
  try {
    history.scrollRestoration = 'manual';
    history.pushState(null, document.title, location.href);
  } catch (_) { /* ignore */ }
}
trapHistory();
window.addEventListener('popstate', () => {
  // Stay on this page no matter how many Back gestures fire.
  trapHistory();
  if (S.state === 'playing' && !pointerLocked) requestLock();
});
window.addEventListener('beforeunload', (e) => {
  if (S.state === 'playing') {
    e.preventDefault();
    e.returnValue = '';
  }
});
document.addEventListener('dragstart', blockBrowserChrome, { capture: true });
document.addEventListener('selectstart', blockBrowserChrome, { capture: true });
document.addEventListener('wheel', (e) => {
  if (S.state === 'playing') e.preventDefault();
}, { capture: true, passive: false });

canvas.addEventListener('click', () => {
  if (S.state === 'playing' && !pointerLocked) requestLock();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
shell.addEventListener('contextmenu', (e) => e.preventDefault());

function requestLock() {
  canvas.requestPointerLock?.();
}

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  if (!pointerLocked) {
    const lostFromRight = typeof rightClickAt === 'number' && (performance.now() - rightClickAt) < 500;
    clearHeldButtons();
    if (S.state !== 'playing' || S.pausedForScreenshot) return;
    if (lostFromRight) {
      // RMB / 浏览器手势抢走指针锁：不要暂停，尽量夺回
      try { canvas.requestPointerLock?.(); } catch (_) {}
      if (el.toast) {
        el.toast.hidden = false;
        el.toast.textContent = '点击画面继续瞄准';
      }
      return;
    }
    pauseGame();
  } else if (el.toast && el.toast.textContent === '点击画面继续瞄准') {
    el.toast.hidden = true;
  }
});

// ─── Player physics ───
const player = {
  vel: new THREE.Vector3(),
  radius: 0.35,
};

function collideMove(pos, dx, dz) {
  let nx = pos.x + dx;
  let nz = pos.z + dz;
  const r = player.radius;
  const d = Math.hypot(nx, nz);
  const maxR = world.bounds - r;
  if (d > maxR) {
    nx = (nx / d) * maxR;
    nz = (nz / d) * maxR;
  }
  for (const c of world.colliders) {
    if (c.type !== 'box') continue;
    const cx = Math.max(c.minX, Math.min(nx, c.maxX));
    const cz = Math.max(c.minZ, Math.min(nz, c.maxZ));
    const ddx = nx - cx;
    const ddz = nz - cz;
    const dist = Math.hypot(ddx, ddz);
    if (dist < r && dist > 1e-5) {
      const push = (r - dist) / dist;
      nx += ddx * push;
      nz += ddz * push;
    } else if (dist <= 1e-5) {
      if (Math.min(nx - c.minX, c.maxX - nx) < Math.min(nz - c.minZ, c.maxZ - nz)) {
        nx = (nx < (c.minX + c.maxX) / 2) ? c.minX - r : c.maxX + r;
      } else {
        nz = (nz < (c.minZ + c.maxZ) / 2) ? c.minZ - r : c.maxZ + r;
      }
    }
  }
  pos.x = nx;
  pos.z = nz;
}

/** World point in front of the player camera. */
function pointInFront(lateral, dist) {
  const th = yawObj.rotation.y;
  const fx = -Math.sin(th);
  const fz = -Math.cos(th);
  const rx = Math.cos(th);
  const rz = -Math.sin(th);
  return {
    x: yawObj.position.x + fx * dist + rx * lateral,
    z: yawObj.position.z + fz * dist + rz * lateral,
  };
}

// ─── Enemies (zombie family: walker / runner / spitter) ───
const shared = {
  skin: new THREE.MeshStandardMaterial({ color: 0x6f9a62, roughness: 0.75, metalness: 0.05, emissive: 0x1a2a14, emissiveIntensity: 0.15, flatShading: true }),
  skinPale: new THREE.MeshStandardMaterial({ color: 0x8fad78, roughness: 0.7, metalness: 0.05, emissive: 0x223018, emissiveIntensity: 0.12, flatShading: true }),
  cloth: new THREE.MeshStandardMaterial({ color: 0x2a3330, roughness: 0.85, metalness: 0.05, flatShading: true }),
  clothRag: new THREE.MeshStandardMaterial({ color: 0x3a2a28, roughness: 0.9, metalness: 0.02, flatShading: true }),
  eye: new THREE.MeshBasicMaterial({ color: 0xffc857 }),
  eyeHot: new THREE.MeshBasicMaterial({ color: 0xff5a3c }),
  bile: new THREE.MeshStandardMaterial({ color: 0x9ccc3a, emissive: 0x5a8a10, emissiveIntensity: 0.8, roughness: 0.3 }),
  glowMat: new THREE.MeshBasicMaterial({ color: 0xff5a3c }),
};

function makeEnemyMesh(type) {
  const g = new THREE.Group();
  const skin = type === 'runner' ? shared.skinPale : shared.skin;
  const cloth = type === 'spitter' ? shared.clothRag : shared.cloth;
  const eyeMat = type === 'spitter' ? shared.eyeHot : shared.eye;

  // proportions
  const isSpitter = type === 'spitter';
  const isRunner = type === 'runner';
  const legH = isRunner ? 0.55 : 0.5;
  const torsoH = isSpitter ? 0.55 : 0.45;
  const torsoW = isSpitter ? 0.42 : 0.32;
  const headY = legH + torsoH + 0.18;

  // legs
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, legH, 0.14), cloth);
    leg.position.set(side * 0.1, legH * 0.5, 0);
    leg.name = side < 0 ? 'legL' : 'legR';
    g.add(leg);
  }

  // torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(torsoW, torsoH, 0.22), cloth);
  torso.position.y = legH + torsoH * 0.5;
  torso.name = 'torso';
  g.add(torso);

  // belly (spitter)
  if (isSpitter) {
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), shared.bile);
    belly.position.set(0, legH + 0.18, 0.1);
    belly.scale.set(1.1, 0.8, 0.7);
    belly.name = 'belly';
    g.add(belly);
  }

  // arms outstretched (zombie reach)
  for (const side of [-1, 1]) {
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.38), skin);
    upper.position.set(side * (torsoW * 0.5 + 0.1), legH + torsoH - 0.05, 0.22);
    upper.name = side < 0 ? 'armL' : 'armR';
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.1), skin);
    hand.position.set(side * (torsoW * 0.5 + 0.1), legH + torsoH - 0.05, 0.42);
    g.add(upper, hand);
  }

  // head — headshot hitbox / core
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), skin);
  head.position.y = headY;
  head.name = 'core';
  // jaw / bite
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.1), shared.clothRag);
  jaw.position.set(0, headY - 0.1, 0.12);
  // eyes
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.04), eyeMat);
    eye.position.set(side * 0.07, headY + 0.03, 0.12);
    eye.name = 'eye';
    g.add(eye);
  }
  // runner crest / torn scalp
  if (isRunner) {
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.18), shared.clothRag);
    crest.position.set(0, headY + 0.16, 0);
    crest.rotation.x = -0.3;
    g.add(crest);
  }
  // spitter maw glow
  if (isSpitter) {
    const maw = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.05), shared.bile);
    maw.position.set(0, headY - 0.08, 0.13);
    maw.name = 'maw';
    g.add(maw);
  }

  g.add(head, jaw);
  // face player-ish default
  g.rotation.y = Math.PI;

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

function spawnEnemy(type, x, z) {
  const mesh = makeEnemyMesh(type);
  // stand on ground (y is base of feet); mesh origin at feet
  const y = 0;
  mesh.position.set(x, y, z);
  scene.add(mesh);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(type === 'spitter' ? 0.42 : 0.34, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(x, 0.03, z);
  scene.add(shadow);

  spawnRingVfx(x, z, type === 'spitter' ? 0x9ccc3a : type === 'runner' ? 0xff5a3c : 0x8fad78);

  const hp = type === 'walker' ? 1 : type === 'runner' ? 2 : 3;
  const score = type === 'walker' ? 100 : type === 'runner' ? 160 : 220;
  const speed = type === 'runner' ? 3.4 : type === 'spitter' ? 1.2 : 1.7;
  const enemy = {
    type,
    mesh,
    shadow,
    hp,
    maxHp: hp,
    score,
    alive: true,
    radius: type === 'spitter' ? 0.5 : 0.42,
    coreRadius: 0.2,
    bob: rrange(0, Math.PI * 2),
    fireCd: rrange(1.2, 2.4),
    speed,
    meleeCd: 0,
    home: new THREE.Vector3(x, y, z),
  };
  world.enemies.push(enemy);
  return enemy;
}

function spawnRingVfx(x, z, color) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.25, 0.4, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, side: THREE.DoubleSide })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.05, z);
  scene.add(m);
  world.particles.push({ mesh: m, life: 0.45, maxLife: 0.45, grow: 2.2, kind: 'ring' });
}

function burst(pos, color, n = 10) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(
      new THREE.TetrahedronGeometry(0.05, 0),
      new THREE.MeshBasicMaterial({ color })
    );
    m.position.copy(pos);
    scene.add(m);
    world.particles.push({
      mesh: m,
      vel: tmpV.set(rrange(-1, 1), rrange(0.2, 1.5), rrange(-1, 1)).multiplyScalar(rrange(1.5, 4)).clone(),
      life: rrange(0.25, 0.55),
      maxLife: 0.55,
      kind: 'bit',
    });
  }
}

function addTracer(from, to, color) {
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  scene.add(line);
  world.tracers.push({ line, life: 0.08 });
}

// ─── Waves ───
const wavePlan = {
  pending: 0,
  clearT: 0,
};

function startWave(n) {
  S.wave = n;
  const count = Math.min(3 + n, 12);
  const runners = n >= 3 ? Math.min(1 + Math.floor(n / 3), 4) : 0;
  const spitters = Math.max(n >= 2 ? 1 : 0, Math.min(1 + Math.floor(n / 3), 4));
  const walkers = Math.max(2, count - runners - spitters);

  // Bias early waves into the player's forward cone so zombies are visible immediately.
  const spots = [];
  const total = walkers + runners + spitters;
  for (let i = 0; i < total; i++) {
    if (n <= 2) {
      const lateral = rrange(-8, 8);
      const dist = rrange(6, 14);
      spots.push(pointInFront(lateral, dist));
    } else if (rng() < 0.55) {
      const lateral = rrange(-10, 10);
      const dist = rrange(6, 15);
      spots.push(pointInFront(lateral, dist));
    } else {
      const a = rrange(0, Math.PI * 2);
      const r = rrange(6, TUNE.arenaRadius - 2);
      spots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
    }
  }

  let si = 0;
  const place = () => spots[(si++) % spots.length];
  for (let i = 0; i < walkers; i++) {
    const p = place();
    spawnEnemy('walker', p.x, p.z);
  }
  for (let i = 0; i < runners; i++) {
    const p = place();
    spawnEnemy('runner', p.x, p.z);
  }
  for (let i = 0; i < spitters; i++) {
    const p = place();
    spawnEnemy('spitter', p.x, p.z);
  }

  wavePlan.pending = 0;
  AudioSys.wave();
  toast(`尸潮 ${n}`);
  updateHud();
}

// ─── Combat ───
function tryReload() {
  if (S.reloading || S.ammo >= TUNE.magSize || S.reserve <= 0 || S.state !== 'playing') return;
  S.reloading = true;
  S.reloadT = TUNE.reloadTime;
  AudioSys.reload();
  feed('换弹中…');
}

function tryDash() {
  if (S.dashCd > 0 || S.state !== 'playing') return;
  const forward = tmpV.set(0, 0, -1).applyQuaternion(yawObj.quaternion);
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
  forward.normalize();
  const right = tmpV2.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const dir = new THREE.Vector3().addScaledVector(forward, f).addScaledVector(right, s);
  if (dir.lengthSq() < 0.01) dir.copy(forward);
  dir.y = 0;
  S.dashDir.copy(dir.normalize());
  S.dashT = TUNE.dashTime;
  S.dashCd = TUNE.dashCd;
}

function shoot() {
  if (S.state !== 'playing' || S.fireCd > 0 || S.reloading) return;
  if (S.ammo <= 0) {
    tryReload();
    return;
  }
  S.ammo -= 1;
  S.shots += 1;
  S.fireCd = TUNE.fireInterval;
  weapon.kick = 1;
  AudioSys.shoot();
  spreadCross();

  if (weapon.flash) {
    weapon.flash.material.opacity = 1;
    weapon.flash.scale.setScalar(1 + Math.random() * 0.4);
  }

  const spread = S.ads ? 0.002 : 0.01;
  raycaster.setFromCamera(
    { x: (Math.random() - 0.5) * spread, y: (Math.random() - 0.5) * spread },
    camera
  );

  const hits = [];
  for (const e of world.enemies) {
    if (!e.alive) continue;
    // body hit sphere sits at chest height (mesh origin is at the feet)
    const center = tmpV.copy(e.mesh.position);
    center.y += e.type === 'spitter' ? 1.05 : 0.95;
    const v = tmpV2.copy(center).sub(raycaster.ray.origin);
    const t = v.dot(raycaster.ray.direction);
    if (t < 0) continue;
    const closest = raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, t);
    const dist = closest.distanceTo(center);
    const core = e.mesh.getObjectByName('core');
    let isCore = false;
    if (core) {
      const headPos = core.getWorldPosition(new THREE.Vector3());
      const v2 = headPos.sub(raycaster.ray.origin);
      const t2 = v2.dot(raycaster.ray.direction);
      if (t2 > 0) {
        const c2 = raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, t2);
        isCore = c2.distanceTo(headPos) < e.coreRadius;
      }
    }
    if (dist <= e.radius) {
      hits.push({ enemy: e, t, isCore, point: closest.clone() });
    }
  }

  hits.sort((a, b) => a.t - b.t);
  const from = camera.getWorldPosition(new THREE.Vector3());
  const end = from.clone().addScaledVector(raycaster.ray.direction, hits[0] ? hits[0].t : 40);
  addTracer(from.clone().addScaledVector(raycaster.ray.direction, 0.4), end, 0xbfffe8);

  if (hits[0]) {
    S.hits += 1;
    damageEnemy(hits[0].enemy, hits[0].isCore, hits[0].point);
  } else {
    S.comboTimer = Math.min(S.comboTimer, 0.35);
  }

  if (S.ammo === 0) tryReload();
  updateHud();
}

function damageEnemy(enemy, isCore, point) {
  const dmg = isCore ? 2 : 1;
  enemy.hp -= dmg;
  burst(point || enemy.mesh.position, isCore ? PAL.threat : 0xbfffe8, isCore ? 12 : 6);
  if (isCore) { S.cores += 1; AudioSys.core(); feed('爆头!'); }
  else AudioSys.hit();
  showHit(enemy.hp <= 0);

  if (enemy.hp <= 0) {
    enemy.alive = false;
    scene.remove(enemy.mesh);
    if (enemy.shadow) scene.remove(enemy.shadow);
    S.kills += 1;
    AudioSys.kill();
    const mult = S.combo;
    const gain = Math.floor(enemy.score * mult * (isCore ? 1.5 : 1));
    addScore(gain);
    feed(`+${gain}  ${isCore ? 'HEAD' : 'KILL'}  x${mult}`);
    if (S.comboTimer > 0) S.combo = Math.min(TUNE.comboMax, S.combo + (isCore ? 2 : 1));
    else S.combo = Math.min(TUNE.comboMax, 1 + (isCore ? 1 : 0));
    S.comboTimer = TUNE.comboWindow;
    pulseCombo();
  } else {
    S.comboTimer = Math.max(S.comboTimer, 0.8);
    addScore(Math.floor(20 * S.combo));
  }
  updateHud();
}

function addScore(n) {
  S.score += Math.max(0, Math.floor(n));
}

function enemyFire(enemy) {
  // Spitter bile lob
  const from = enemy.mesh.position.clone().add(tmpV.set(0, 1.4, 0));
  const to = yawObj.position.clone().add(tmpV.set(0, 0.2, 0));
  const dir = to.clone().sub(from).normalize();
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0x9ccc3a })
  );
  mesh.position.copy(from);
  scene.add(mesh);
  world.bolts.push({ mesh, vel: dir.multiplyScalar(9), life: 3, dmg: 6 + S.wave * 0.5 });
  addTracer(from, to, 0x6a9a20);
  AudioSys.tone(180, 0.1, 'sawtooth', 0.1, -40);
}

function hurtPlayer(dmg) {
  if (S.state !== 'playing') return;
  S.hp -= dmg;
  AudioSys.hurt();
  el.dmg.classList.add('is-on');
  setTimeout(() => el.dmg.classList.remove('is-on'), 140);
  if (S.combo > 1) {
    S.combo = 1;
    S.comboTimer = 0;
  }
  if (S.hp <= 0) {
    S.hp = 0;
    gameOver();
  }
  updateHud();
}

// ─── VFX updates ───
function updateFx(dt) {
  for (let i = world.particles.length - 1; i >= 0; i--) {
    const p = world.particles[i];
    p.life -= dt;
    if (p.kind === 'bit' && p.vel) {
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.y -= 6 * dt;
      p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
      p.mesh.material.transparent = true;
    } else if (p.kind === 'ring') {
      const k = 1 - p.life / p.maxLife;
      p.mesh.scale.setScalar(1 + k * (p.grow || 1));
      p.mesh.material.opacity = Math.max(0, 1 - k);
      p.mesh.material.transparent = true;
    }
    if (p.life <= 0) {
      scene.remove(p.mesh);
      world.particles.splice(i, 1);
    }
  }
  for (let i = world.tracers.length - 1; i >= 0; i--) {
    const t = world.tracers[i];
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.08);
    if (t.life <= 0) {
      scene.remove(t.line);
      world.tracers.splice(i, 1);
    }
  }
  for (let i = world.bolts.length - 1; i >= 0; i--) {
    const b = world.bolts[i];
    b.life -= dt;
    b.mesh.position.addScaledVector(b.vel, dt);
    const d = b.mesh.position.distanceTo(yawObj.position.clone().setY(yawObj.position.y + 0.2));
    if (d < 0.55) {
      hurtPlayer(b.dmg);
      burst(b.mesh.position, PAL.threat, 6);
      scene.remove(b.mesh);
      world.bolts.splice(i, 1);
      continue;
    }
    if (b.life <= 0 || b.mesh.position.y < 0) {
      scene.remove(b.mesh);
      world.bolts.splice(i, 1);
    }
  }
  if (weapon.flash) {
    weapon.flash.material.opacity = Math.max(0, weapon.flash.material.opacity - dt * 20);
  }
  weapon.kick = Math.max(0, weapon.kick - dt * 10);
  const kickZ = -weapon.kick * 0.03;
  // Reload pose: tilt the carbine down and roll it, ease in/out over reloadTime.
  let relT = 0;
  if (S.reloading) {
    const p = 1 - Math.max(0, S.reloadT) / TUNE.reloadTime;
    // 0→0.35 dip, 0.35→0.75 hold, 0.75→1 rise
    relT = p < 0.35 ? p / 0.35 : p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25;
    relT = Math.max(0, Math.min(1, relT));
  }
  const baseX = S.ads ? 0.02 : 0.22;
  const baseY = S.ads ? -0.1 : -0.18;
  const baseZ = -0.55 + kickZ + (S.ads ? 0.08 : 0);
  weapon.group.position.set(baseX + relT * 0.04, baseY - relT * 0.12, baseZ - relT * 0.02);
  weapon.group.rotation.set(relT * 0.55, relT * -0.15, relT * 0.25);
  weapon.group.visible = !S.ads || S.reloading;
  // Magazine dip during reload (named mag mesh if present)
  const mag = weapon.group.getObjectByName('mag');
  if (mag) mag.position.y = -0.08 - relT * 0.12;

  if (world.holo) {
    world.holo.rotation.y += dt * 0.8;
    world.holo.position.y = 2.2 + Math.sin(performance.now() * 0.002) * 0.08;
  }
}

// ─── Enemy AI (shamble toward player, runner sprint, spitter kite) ───
function updateEnemies(dt) {
  const px = yawObj.position.x;
  const pz = yawObj.position.z;

  for (const e of world.enemies) {
    if (!e.alive) continue;
    e.bob += dt * (e.type === 'runner' ? 6 : e.type === 'walker' ? 3.2 : 2);
    if (e.meleeCd > 0) e.meleeCd -= dt;

    const dx = px - e.mesh.position.x;
    const dz = pz - e.mesh.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    const nx = dx / dist;
    const nz = dz / dist;

    // face the player
    e.mesh.rotation.y = Math.atan2(nx, nz);

    let step = 0;
    if (e.type === 'spitter') {
      // kite: hold ~8–11m and spit
      const want = 9;
      const err = dist - want;
      if (Math.abs(err) > 0.6) {
        step = Math.sign(err) * e.speed * dt * (Math.abs(err) > 3 ? 1 : 0.4);
      }
      e.fireCd -= dt;
      if (e.fireCd <= 0 && dist < 18) {
        enemyFire(e);
        e.fireCd = rrange(1.6, 2.8) * Math.max(0.55, 1 - S.wave * 0.03);
      }
    } else if (dist > 1.15) {
      // walk / run toward player
      step = e.speed * dt * (e.type === 'runner' ? 1 : 0.85);
    } else if (e.meleeCd <= 0) {
      // melee swipe
      hurtPlayer(e.type === 'runner' ? 10 : e.type === 'spitter' ? 8 : 7);
      e.meleeCd = 1.0;
      burst(e.mesh.position.clone().add(tmpV.set(0, 1.2, 0)), 0x9ccc3a, 5);
    }

    if (step !== 0) {
      const targetX = e.mesh.position.x + nx * step;
      const targetZ = e.mesh.position.z + nz * step;
      // stay in arena
      const d2 = Math.hypot(targetX, targetZ);
      const maxR = world.bounds - 0.4;
      if (d2 < maxR) {
        e.mesh.position.x = targetX;
        e.mesh.position.z = targetZ;
      }
    }

    // shambling bob + lean
    e.mesh.position.y = Math.abs(Math.sin(e.bob)) * (e.type === 'runner' ? 0.08 : 0.05);
    e.mesh.rotation.z = Math.sin(e.bob * 0.7) * (e.type === 'runner' ? 0.08 : 0.12);

    if (e.shadow) {
      e.shadow.position.x = e.mesh.position.x;
      e.shadow.position.z = e.mesh.position.z;
    }

    // arm reach sway
    const armL = e.mesh.getObjectByName('armL');
    const armR = e.mesh.getObjectByName('armR');
    const reach = Math.sin(e.bob) * 0.08;
    if (armL) armL.rotation.x = reach;
    if (armR) armR.rotation.x = -reach;
  }
}

// ─── UI helpers ───
function updateHud() {
  el.wave.textContent = String(S.wave);
  el.targets.textContent = String(world.enemies.filter((e) => e.alive).length);
  el.score.textContent = String(S.score);
  el.combo.textContent = `x${S.combo}`;
  el.hp.textContent = String(Math.ceil(S.hp));
  el.hpBar.style.transform = `scaleX(${Math.max(0, S.hp / TUNE.hpMax)})`;
  el.ammo.textContent = S.reloading
    ? '换弹 ' + Math.ceil(S.reloadT * 10) / 10 + 's'
    : String(S.ammo);
  el.ammoBar.style.transform = `scaleX(${S.ammo / TUNE.magSize})`;
  el.reserve.textContent = String(S.reserve);
}

function feed(text) {
  el.feed.textContent = text;
  clearTimeout(feed._t);
  feed._t = setTimeout(() => { el.feed.textContent = ''; }, 1200);
}

function toast(text) {
  el.toast.hidden = false;
  el.toast.textContent = text;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.toast.hidden = true; }, 1400);
}

function showHit(kill) {
  el.hit.hidden = false;
  el.hit.classList.remove('is-show', 'is-kill');
  void el.hit.offsetWidth;
  el.hit.classList.add('is-show');
  if (kill) el.hit.classList.add('is-kill');
  setTimeout(() => { el.hit.hidden = true; el.hit.classList.remove('is-show', 'is-kill'); }, 180);
}

function spreadCross() {
  el.cross.classList.add('is-spread');
  setTimeout(() => el.cross.classList.remove('is-spread'), 80);
}

function pulseCombo() {
  el.combo.classList.remove('is-hot');
  void el.combo.offsetWidth;
  el.combo.classList.add('is-hot');
}

// ─── Screens ───
function showOverlay(which) {
  el.menu.hidden = which !== 'menu';
  el.pause.hidden = which !== 'pause';
  el.over.hidden = which !== 'over';
  el.board.hidden = which !== 'board';
  el.hud.hidden = which !== 'play';
}

function resetRun(seed) {
  for (const e of world.enemies) {
    if (e.mesh) scene.remove(e.mesh);
    if (e.shadow) scene.remove(e.shadow);
  }
  for (const b of world.bolts) if (b.mesh) scene.remove(b.mesh);
  for (const p of world.particles) if (p.mesh) scene.remove(p.mesh);
  for (const t of world.tracers) if (t.line) scene.remove(t.line);
  world.enemies.length = 0;
  world.bolts.length = 0;
  world.particles.length = 0;
  world.tracers.length = 0;
  wavePlan.clearT = 0;
  wavePlan.pending = 0;

  S.seed = seed ?? ((Math.random() * 1e9) | 0);
  rng = mulberry32(S.seed);
  S.wave = 0;
  S.score = 0;
  S.combo = 1;
  S.comboTimer = 0;
  S.kills = 0;
  S.shots = 0;
  S.hits = 0;
  S.cores = 0;
  S.hp = TUNE.hpMax;
  S.ammo = TUNE.magSize;
  S.reserve = TUNE.reserveMax;
  S.reloading = false;
  S.reloadT = 0;
  S.fireCd = 0;
  clearHeldButtons();
  S.dashT = 0;
  S.dashCd = 0;
  S.playMs = 0;
  S.submitted = false;
  el.submitNote.textContent = '';
  // Spawn looking at arena center / forward cone targets
  yawObj.position.set(0, TUNE.eyeHeight, 11.5);
  yawObj.rotation.set(0, 0, 0);
  pitchObj.rotation.set(0, 0, 0);
  updateHud();
}

function startGame() {
  AudioSys.unlock();
  AudioSys.ui();
  trapHistory();
  resetRun(S.seed);
  S.state = 'playing';
  showOverlay('play');
  startWave(1);
  requestLock();
}

function pauseGame() {
  if (S.state !== 'playing') return;
  S.state = 'paused';
  clearHeldButtons();
  showOverlay('pause');
  if (document.pointerLockElement) document.exitPointerLock();
}

function resumeGame() {
  if (S.state !== 'paused') return;
  S.state = 'playing';
  clearHeldButtons();
  showOverlay('play');
  requestLock();
  clock.getDelta();
}

function gameOver() {
  S.state = 'gameover';
  clearHeldButtons();
  AudioSys.over();
  if (document.pointerLockElement) document.exitPointerLock();
  showOverlay('over');
  const acc = Math.round(S.accuracy() * 100);
  el.report.innerHTML = [
    item('得分', S.score),
    item('波次', S.wave),
    item('击杀', S.kills),
    item('爆头', S.cores),
    item('命中率', acc + '%'),
    item('用时', Math.floor(S.playMs / 1000) + 's'),
  ].join('');
  const best = getLocalBest();
  if (S.score > best) {
    setLocalBest(S.score);
    el.submitNote.textContent = `本机新纪录！${S.score}`;
  } else {
    el.submitNote.textContent = `本机最高 ${best}`;
  }
  el.name.value = getLocalName();
  loadLeaderboard();
}

function item(label, value) {
  return `<div class="gr-report-item"><span>${label}</span><b>${value}</b></div>`;
}

// ─── Scores ───
function getLocalName() {
  try { return localStorage.getItem('gr_name') || ''; } catch { return ''; }
}
function getLocalBest() {
  try { return Number(localStorage.getItem('gr_best') || 0); } catch { return 0; }
}
function setLocalBest(v) {
  try { localStorage.setItem('gr_best', String(v)); } catch { /* ignore */ }
}
function getLocalBoard() {
  try {
    const list = JSON.parse(localStorage.getItem('gr_board') || '[]');
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
function saveLocalBoard(entry) {
  const list = getLocalBoard();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  try { localStorage.setItem('gr_board', JSON.stringify(list.slice(0, 20))); } catch { /* ignore */ }
}

async function loadLeaderboard() {
  el.rankList.innerHTML = '<li><span class="rank">…</span><span class="meta">加载中</span><span class="pts"></span></li>';
  el.boardSource.textContent = '服务器记录';
  try {
    const res = await fetch('/api/scores?game=grove_range&limit=10');
    if (!res.ok) throw new Error('bad status');
    const data = await res.json();
    const scores = data.scores || [];
    renderBoard(scores, '服务器记录 · TOP 10');
  } catch {
    const local = getLocalBoard().slice(0, 10).map((x, i) => ({ ...x, rank: i + 1 }));
    renderBoard(local, '离线本机记录（服务器暂不可用）');
    el.boardSource.textContent = '离线本机记录';
  }
}

function renderBoard(scores, title) {
  el.boardSource.textContent = title;
  if (!scores.length) {
    el.rankList.innerHTML = '<li><span class="rank">—</span><span class="meta">暂无记录，来打第一枪</span><span class="pts"></span></li>';
    return;
  }
  const me = (el.name.value || getLocalName() || '').trim();
  el.rankList.innerHTML = scores.map((s) => {
    const acc = s.accuracy != null ? Math.round(s.accuracy * 100) : '—';
    const isMe = me && s.name === me ? ' is-me' : '';
    return `<li class="${isMe}">
      <span class="rank">${s.rank || '·'}</span>
      <span class="meta">${escapeHtml(s.name || '匿名')} · 波次${s.wave ?? '—'} · 命中${acc}%</span>
      <span class="pts">${s.score}</span>
    </li>`;
  }).join('');
}

function escapeHtml(v) {
  return String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

async function submitScore() {
  if (S.submitted) {
    el.submitNote.textContent = '本局成绩已上传';
    return;
  }
  const name = (el.name.value || '匿名').trim().slice(0, 16) || '匿名';
  try { localStorage.setItem('gr_name', name); } catch { /* ignore */ }
  const payload = {
    game: 'grove_range',
    name,
    score: S.score,
    wave: S.wave,
    kills: S.kills,
    shots: S.shots,
    hits: S.hits,
    accuracy: S.accuracy(),
    durationMs: Math.floor(S.playMs),
  };
  saveLocalBoard({ ...payload, createdAt: new Date().toISOString(), rank: undefined });
  try {
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || '上传失败');
    S.submitted = true;
    el.submitNote.textContent = data.rank
      ? `已上榜 · 当前第 ${data.rank} 名 · 个人最佳 ${data.personalBest}`
      : '成绩已保存到服务器';
    loadLeaderboard();
  } catch (err) {
    el.submitNote.textContent = `已存本机 · 服务器上传失败（${err.message || '网络'}）`;
    S.submitted = true;
  }
}

// ─── Tick ───
function tick(dt) {
  // Safety: ADS only while Q / LeftCtrl held (right mouse is unused).
  if (S.ads && !(keys.KeyQ || keys.ControlLeft)) S.ads = false;

  const sens = S.ads ? 0.0013 : 0.0021;
  yawObj.rotation.y -= mouse.dx * sens;
  pitchObj.rotation.x -= mouse.dy * sens;
  pitchObj.rotation.x = Math.max(-1.35, Math.min(1.35, pitchObj.rotation.x));
  mouse.dx = 0;
  mouse.dy = 0;

  const speed = TUNE.moveSpeed * (S.sprint && !S.ads ? TUNE.sprintMul : 1) * (S.ads ? 0.7 : 1);
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  S.sprint = !!keys.ShiftLeft || !!keys.ShiftRight;

  const forward = tmpV.set(0, 0, -1).applyQuaternion(yawObj.quaternion);
  forward.y = 0; forward.normalize();
  const right = tmpV2.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const wish = new THREE.Vector3()
    .addScaledVector(forward, f)
    .addScaledVector(right, s);
  if (wish.lengthSq() > 0) wish.normalize();

  if (S.dashT > 0) {
    S.dashT -= dt;
    collideMove(yawObj.position, S.dashDir.x * TUNE.dashSpeed * dt, S.dashDir.z * TUNE.dashSpeed * dt);
  } else {
    collideMove(yawObj.position, wish.x * speed * dt, wish.z * speed * dt);
  }
  if (S.dashCd > 0) S.dashCd -= dt;

  const moving = wish.lengthSq() > 0;
  const bob = S.reducedMotion ? 0 : Math.sin(performance.now() * 0.012 * (S.sprint ? 1.4 : 1)) * (moving ? 0.03 : 0.008);
  camera.position.y = bob;

  if (S.fireCd > 0) S.fireCd -= dt;
  if (S.reloading) {
    S.reloadT -= dt;
    if (S.reloadT <= 0) {
      const need = TUNE.magSize - S.ammo;
      const take = Math.min(need, S.reserve);
      S.ammo += take;
      S.reserve -= take;
      S.reloading = false;
      updateHud();
    } else {
      updateHud();
    }
  }
  if (mouse.down) shoot();

  const targetFov = S.ads ? TUNE.adsFov : TUNE.hipFov;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
  camera.updateProjectionMatrix();

  if (S.comboTimer > 0) {
    S.comboTimer -= dt;
    if (S.comboTimer <= 0) {
      S.combo = 1;
      updateHud();
    }
  }

  if (wavePlan.clearT > 0) {
    wavePlan.clearT -= dt;
    if (wavePlan.clearT <= 0) {
      startWave(S.wave + 1);
    }
  }

  S.playMs += dt * 1000;
  updateEnemies(dt);
  updateFx(dt);

  const alive = world.enemies.some((e) => e.alive);
  if (!alive && wavePlan.clearT <= 0 && S.state === 'playing') {
    wavePlan.clearT = 2.5;
    const bonus = 150 * S.wave + Math.floor(S.accuracy() * 200);
    addScore(bonus);
    S.hp = Math.min(TUNE.hpMax, S.hp + 12);
    S.reserve = Math.min(TUNE.reserveMax, S.reserve + 30);
    toast(`波次清场 +${bonus}`);
    feed('短暂喘息，HP +12 · 弹药补给');
    updateHud();
  }
}

function animate() {
  requestAnimationFrame(animate);
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);

  if (S.state === 'playing' && !S.pausedForScreenshot) {
    tick(dt);
  } else if (S.state === 'menu') {
    if (!S.reducedMotion) {
      // slow orbit looking toward the range center
      const t = performance.now() * 0.00015;
      yawObj.position.set(Math.sin(t) * 2.2, TUNE.eyeHeight, 11 + Math.cos(t) * 1.2);
      const lookX = 0, lookZ = 0;
      yawObj.rotation.y = Math.atan2(yawObj.position.x - lookX, yawObj.position.z - lookZ);
      pitchObj.rotation.x = -0.08;
    }
    updateFx(dt);
  } else if (S.pausedForScreenshot) {
    // freeze sim, keep render
  }

  renderer.render(scene, camera);
}

function resize() {
  const w = shell.clientWidth || canvas.clientWidth || 800;
  const h = shell.clientHeight || canvas.clientHeight || 500;
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

window.addEventListener('resize', resize);

// ─── Buttons ───
$('btnStart').addEventListener('click', () => startGame());
$('btnBoard').addEventListener('click', () => { AudioSys.ui(); showOverlay('board'); loadLeaderboard(); });
$('btnBoardClose').addEventListener('click', () => {
  AudioSys.ui();
  if (S.state === 'gameover') showOverlay('over');
  else if (S.state === 'paused') showOverlay('pause');
  else showOverlay('menu');
});
$('btnBoardRefresh').addEventListener('click', () => { AudioSys.ui(); loadLeaderboard(); });
$('btnResume').addEventListener('click', () => resumeGame());
$('btnRestartPause').addEventListener('click', () => startGame());
$('btnQuit').addEventListener('click', () => {
  S.state = 'menu';
  showOverlay('menu');
});
$('btnSubmit').addEventListener('click', () => submitScore());
$('btnRetry').addEventListener('click', () => startGame());
$('btnBoardOver').addEventListener('click', () => { showOverlay('board'); loadLeaderboard(); });

// ─── Test hooks ───
window.__THREE_GAME_DIAGNOSTICS__ = {
  get state() { return S.state; },
  get score() { return S.score; },
  get wave() { return S.wave; },
  get enemies() { return world.enemies.filter((e) => e.alive).length; },
  get shots() { return S.shots; },
  get hits() { return S.hits; },
  get kills() { return S.kills; },
  get hp() { return S.hp; },
  get combo() { return S.combo; },
  get ads() { return S.ads; },
  get rightHeld() { return mouse.right; },
  get leftHeld() { return mouse.down; },
  get facing() {
    const th = yawObj.rotation.y;
    return {
      yaw: th,
      forward: { x: -Math.sin(th), z: -Math.cos(th) },
      pos: { x: yawObj.position.x, y: yawObj.position.y, z: yawObj.position.z },
    };
  },
  get nearestEnemy() {
    let best = null;
    let bestD = Infinity;
    for (const e of world.enemies) {
      if (!e.alive) continue;
      const d = e.mesh.position.distanceTo(yawObj.position);
      if (d < bestD) {
        bestD = d;
        best = { type: e.type, pos: { ...e.mesh.position }, dist: d };
      }
    }
    return best;
  },
  get renderer() {
    return {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    };
  },
};

window.__THREE_GAME_TEST_HOOKS__ = {
  seed(n) {
    S.seed = Number(n) || 1337;
    rng = mulberry32(S.seed);
    return { seed: S.seed };
  },
  setState(name) {
    if (name === 'menu') {
      S.state = 'menu';
      showOverlay('menu');
    } else if (name === 'active-play' || name === 'playing') {
      startGame();
    } else if (name === 'paused') {
      if (S.state !== 'playing') startGame();
      pauseGame();
    } else if (name === 'gameover' || name === 'fail') {
      if (S.state !== 'playing') startGame();
      S.hp = 0;
      gameOver();
    } else {
      return { state: name, ok: false, error: 'unknown state' };
    }
    return { state: name, ok: true, gameState: S.state };
  },
  setPausedForScreenshot(v) {
    S.pausedForScreenshot = !!v;
    return { state: S.pausedForScreenshot ? 'pausedForScreenshot' : 'resumed', pausedForScreenshot: S.pausedForScreenshot };
  },
  setReducedMotion(v) {
    S.reducedMotion = !!v;
    return { reducedMotion: S.reducedMotion };
  },
  hideDebugUi(v = true) {
    el.feed.style.display = v ? 'none' : '';
    return { hidden: !!v };
  },
};

// ─── Boot ───
buildArena();
buildWeapon();
resize();
showOverlay('menu');
animate();
updateHud();
