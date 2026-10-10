// Feather textures, card geometry and an instanced feather set.
import * as THREE from 'three';
import { canvasTexture, curve1D, rng } from './util.js';

// ---------------------------------------------------------------------------------------------
// Single-feather texture. Canvas y = 0 is the tip, y = H the quill; x = W/2 is the rachis (shaft).
// ---------------------------------------------------------------------------------------------
function drawFeather(ctx, W, H, { profile, barbAngle = 0.62, seed = 1, split = 0.5, shade = 0.12 }) {
  const rand = rng(seed);
  const hw = curve1D(profile);
  const cx = W / 2;
  const maxW = W * 0.5 - 3;
  ctx.clearRect(0, 0, W, H);

  const half = (y01, side) => hw(y01) * maxW * (side < 0 ? 0.86 : 1.0);

  // silhouette
  const path = new Path2D();
  const N = 90;
  for (let i = 0; i <= N; i++) {
    const y = i / N;
    const x = cx + half(y, 1);
    i === 0 ? path.moveTo(x, y * H) : path.lineTo(x, y * H);
  }
  for (let i = N; i >= 0; i--) {
    const y = i / N;
    path.lineTo(cx - half(y, -1), y * H);
  }
  path.closePath();

  ctx.save();
  ctx.clip(path);
  // base vane colour: white with a soft warm edge and slightly darker quill end
  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#ffffff');
  base.addColorStop(0.55, '#f6f1e8');
  base.addColorStop(1, '#d9d0c0');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  // barbs: thin lines sweeping from the rachis toward the tip
  for (const side of [-1, 1]) {
    const count = Math.floor(H / 3.1);
    for (let k = 0; k < count; k++) {
      const y0 = (k / count) * H + rand() * 2;
      const y01 = y0 / H;
      const w = half(y01 + 0.12, side) + 8;
      const len = w * 1.05;
      const x1 = cx + side * len;
      const y1 = y0 - len * barbAngle;
      ctx.strokeStyle = `rgba(${40 + rand() * 30}, ${34 + rand() * 24}, ${30 + rand() * 20}, ${shade * (0.4 + rand() * 0.9)})`;
      ctx.lineWidth = 0.8 + rand() * 0.9;
      ctx.beginPath();
      ctx.moveTo(cx + side * 1.5, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      if (rand() < 0.5) {
        ctx.strokeStyle = `rgba(255, 252, 244, ${0.35 * rand()})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(cx + side * 1.5, y0 + 1.4);
        ctx.lineTo(x1, y1 + 1.4);
        ctx.stroke();
      }
    }
  }
  // soft fade toward the vane edge to give a gentle translucent rim
  const edge = ctx.createLinearGradient(cx - maxW, 0, cx + maxW, 0);
  edge.addColorStop(0, 'rgba(120,105,85,0.20)');
  edge.addColorStop(0.18, 'rgba(120,105,85,0)');
  edge.addColorStop(0.82, 'rgba(120,105,85,0)');
  edge.addColorStop(1, 'rgba(120,105,85,0.20)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // splits (barb separation): cut thin wedges from the edge, angled with the barbs
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  const cuts = Math.round(split * 14);
  for (let i = 0; i < cuts; i++) {
    const side = rand() < 0.5 ? -1 : 1;
    const y01 = 0.1 + rand() * 0.7;
    const y = y01 * H;
    const x = cx + side * half(y01, side);
    const len = 10 + rand() * 26;
    ctx.fillStyle = 'rgba(0,0,0,0.95)';
    ctx.beginPath();
    ctx.moveTo(x + side * 3, y + 1);
    ctx.lineTo(x - side * len, y - len * barbAngle - 1);
    ctx.lineTo(x - side * len + side * 0.8, y - len * barbAngle + 1.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // rachis
  const shaft = ctx.createLinearGradient(0, 0, 0, H);
  shaft.addColorStop(0, 'rgba(210,198,176,0.0)');
  shaft.addColorStop(0.12, 'rgba(210,198,176,0.9)');
  shaft.addColorStop(1, 'rgba(236,228,210,1)');
  ctx.strokeStyle = shaft;
  ctx.lineCap = 'round';
  for (const [lw, a] of [[3.2, 1], [1.2, 0.7]]) {
    ctx.lineWidth = lw;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.moveTo(cx, H * 0.04);
    ctx.lineTo(cx, H);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(70,58,46,0.35)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(cx + 1.8, H * 0.1);
  ctx.lineTo(cx + 1.8, H);
  ctx.stroke();
}

const PROFILES = {
  // long flight feather: parallel-sided, rounded tip
  flight: [[0, 0.0], [0.015, 0.4], [0.06, 0.78], [0.15, 0.95], [0.4, 1.0], [0.7, 0.9], [0.9, 0.4], [1, 0.06]],
  // short rounded covert
  covert: [[0, 0.0], [0.03, 0.45], [0.12, 0.82], [0.3, 1.0], [0.6, 0.95], [0.85, 0.55], [1, 0.08]],
  // slim, pointed (crest, nape plumes)
  plume: [[0, 0.0], [0.08, 0.35], [0.25, 0.8], [0.5, 1.0], [0.8, 0.7], [1, 0.05]],
};

export function makeFeatherTextures() {
  const make = (profile, seed, extra = {}) => {
    const map = canvasTexture(128, 512, (ctx, w, h) => drawFeather(ctx, w, h, { profile, seed, ...extra }), { aniso: 8 });
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    return map;
  };
  return {
    flight: make(PROFILES.flight, 11, { split: 0.9, barbAngle: 0.6 }),
    covert: make(PROFILES.covert, 23, { split: 0.3, barbAngle: 0.8 }),
    plume: make(PROFILES.plume, 37, { split: 0.15, barbAngle: 0.7 }),
  };
}

// A curved card: x in [-0.5, 0.5] (width), y in [0, 1] (root -> tip), bulging toward +Z.
export function featherGeometry({ curl = 0.1, cup = 0.05, sx = 2, sy = 8, rootShade = 0.7 } = {}) {
  const pos = [];
  const uv = [];
  const col = [];
  const idx = [];
  for (let j = 0; j <= sy; j++) {
    const y = j / sy;
    for (let i = 0; i <= sx; i++) {
      const x = i / sx - 0.5;
      pos.push(x, y, -curl * y * y - cup * 4 * x * x * (0.35 + 0.65 * y) + cup * 0.5);
      uv.push(i / sx, y);
      const s = rootShade + (1 - rootShade) * Math.min(1, y / 0.4);
      col.push(s, s, s);
    }
  }
  for (let j = 0; j < sy; j++) {
    for (let i = 0; i < sx; i++) {
      const a = j * (sx + 1) + i;
      const b = a + 1;
      const c = a + sx + 1;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function featherMaterial(map, { roughness = 0.62, sheen = 0.6 } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    map,
    bumpMap: map,
    bumpScale: 1.4,
    vertexColors: true,
    roughness,
    metalness: 0,
    sheen,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(0xfff0dc),
    alphaTest: 0.42,
    side: THREE.DoubleSide,
  });
  m.alphaToCoverage = true;
  return m;
}

const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export class FeatherSet {
  constructor(geometry, material, capacity) {
    this.capacity = capacity;
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    this.n = 0;
    for (let i = 0; i < capacity; i++) this.mesh.setColorAt(i, _c.setRGB(1, 1, 1));
  }
  /** Allocate the next slot. Returns its index. */
  push() {
    const i = this.n++;
    this.mesh.count = this.n;
    return i;
  }
  set(i, pos, quat, width, length, color) {
    // z scales with the length so curl/cup stay proportional to the feather size
    _s.set(width, length, length);
    _m.compose(pos, quat, _s);
    this.mesh.setMatrixAt(i, _m);
    if (color !== undefined) {
      _c.set(color);
      this.mesh.setColorAt(i, _c);
      this.mesh.instanceColor.needsUpdate = true;
    }
  }
  commit() {
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------------------------
// Body plumage: overlapping feather tips, painted as a tileable colour + bump pair.
// Canvas y grows toward the tail, so each scale's rounded tip points down.
// ---------------------------------------------------------------------------------------------
export function makePlumage() {
  const W = 256;
  const H = 256;
  const cols = 4;
  const rows = 4;
  const cw = W / cols;
  const ch = H / rows;
  const rand = rng(5);
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // per-cell randomness is fixed up front so the wrapped copies of a cell stay identical (seamless tiling)
      const streaks = Array.from({ length: 16 }, () => ({ x: (rand() - 0.5) * 0.9, a: 0.03 + rand() * 0.06, l: 0.5 + rand() * 0.5 }));
      cells.push({ r, c, tone: rand(), jx: (rand() - 0.5) * 8, streaks });
    }
  }

  function scalePath(ctx, cx, tipY, w, len) {
    ctx.beginPath();
    ctx.moveTo(cx - w, tipY - len);
    ctx.lineTo(cx - w, tipY - 30);
    ctx.bezierCurveTo(cx - w, tipY - 8, cx - w * 0.45, tipY, cx, tipY);
    ctx.bezierCurveTo(cx + w * 0.45, tipY, cx + w, tipY - 8, cx + w, tipY - 30);
    ctx.lineTo(cx + w, tipY - len);
    ctx.closePath();
  }
  function each(fn) {
    // bottom rows first so anterior feather tips overlap the ones behind them
    for (let r = rows - 1; r >= 0; r--) {
      for (const cell of cells.filter((q) => q.r === r)) {
        const cx = (cell.c + 0.5 + (r % 2) * 0.5) * cw;
        const tipY = (r + 1) * ch + 12;
        for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) fn(cell, cx + dx, tipY + dy);
      }
    }
  }
  const map = canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = '#ece5d8';
    ctx.fillRect(0, 0, W, H);
    each((cell, cx0, tipY) => {
      const cx = cx0 + cell.jx;
      const g = ctx.createLinearGradient(0, tipY - 74, 0, tipY);
      const t = 0.978 + cell.tone * 0.03;
      g.addColorStop(0, `rgb(${Math.round(240 * t)},${Math.round(233 * t)},${Math.round(220 * t)})`);
      g.addColorStop(0.55, `rgb(${Math.round(251 * t)},${Math.round(247 * t)},${Math.round(238 * t)})`);
      g.addColorStop(1, `rgb(${Math.round(255 * t)},${Math.round(253 * t)},${Math.round(248 * t)})`);
      ctx.fillStyle = g;
      scalePath(ctx, cx, tipY, cw * 0.52, 84);
      ctx.fill();
      // silky barb streaks flowing toward the feather tip
      ctx.save();
      scalePath(ctx, cx, tipY, cw * 0.52, 84);
      ctx.clip();
      ctx.lineWidth = 0.9;
      for (const s of cell.streaks) {
        ctx.strokeStyle = `rgba(150,134,108,${s.a})`;
        ctx.beginPath();
        ctx.moveTo(cx + s.x * cw * 0.2, tipY - 80);
        ctx.lineTo(cx + s.x * cw * 0.9, tipY - 80 + 78 * s.l + 10);
        ctx.stroke();
      }
      ctx.restore();
      // faint soft edge only along the free tip
      ctx.strokeStyle = 'rgba(135,118,94,0.12)';
      ctx.lineWidth = 1.5;
      scalePath(ctx, cx, tipY, cw * 0.52, 84);
      ctx.stroke();
    });
  });
  const bump = canvasTexture(
    W,
    H,
    (ctx) => {
      ctx.fillStyle = '#6a6a6a';
      ctx.fillRect(0, 0, W, H);
      each((cell, cx0, tipY) => {
        const cx = cx0 + cell.jx;
        const g = ctx.createLinearGradient(0, tipY - 74, 0, tipY);
        g.addColorStop(0, '#7c7c7c');
        g.addColorStop(1, '#f0f0f0');
        ctx.fillStyle = g;
        scalePath(ctx, cx, tipY, cw * 0.52, 84);
        ctx.fill();
      });
    },
    { srgb: false }
  );
  for (const t of [map, bump]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  return { map, bump };
}
