// Shared math + modelling helpers. Frames everywhere: +X forward, +Y up, +Z = the rider's right.
import * as THREE from 'three';

export const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
export const lerp = (a, b, t) => a + (b - a) * t;
export const deg = (d) => (d * Math.PI) / 180;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// Smooth 1-D curve through [x, y] keys (cubic Hermite, Catmull-Rom tangents).
export function curve1D(keys) {
  const n = keys.length;
  const m = keys.map((_, i) => {
    const a = keys[Math.max(0, i - 1)];
    const b = keys[Math.min(n - 1, i + 1)];
    return (b[1] - a[1]) / Math.max(1e-6, b[0] - a[0]);
  });
  return (x) => {
    if (x <= keys[0][0]) return keys[0][1];
    if (x >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0;
    while (x > keys[i + 1][0]) i++;
    const [x0, y0] = keys[i];
    const [x1, y1] = keys[i + 1];
    const h = x1 - x0;
    const t = (x - x0) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m[i + 1];
  };
}

// Uniform Catmull-Rom through a list of points, u in [0,1] across the whole chain.
export function splinePoint(pts, u, out) {
  const n = pts.length - 1;
  const f = clamp(u, 0, 1) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const t = f - i;
  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[Math.min(n, i + 2)];
  const t2 = t * t;
  const t3 = t2 * t;
  const c = (a, b, c2, d) =>
    0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (-a + 3 * b - 3 * c2 + d) * t3);
  out.x = c(p0.x, p1.x, p2.x, p3.x);
  out.y = c(p0.y, p1.y, p2.y, p3.y);
  out.z = c(p0.z, p1.z, p2.z, p3.z);
  return out;
}

// Fast rounded end-cap factor: 0 at t=0 rising like a quarter circle to 1 at t=e (and mirrored at the far end).
export function cap(t, e = 0.06) {
  const a = Math.min(t, 1 - t);
  if (a >= e) return 1;
  const k = 1 - a / e;
  return Math.sqrt(Math.max(0, 1 - k * k));
}

// Super-ellipse unit point for angle a and squareness exponent p (2 = ellipse).
export function superEllipse(a, p, out) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const e = 2 / p;
  out.x = Math.sign(c) * Math.pow(Math.abs(c), e);
  out.y = Math.sign(s) * Math.pow(Math.abs(s), e);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Loft: a closed-ring tube swept along a polyline. `section(t, angle, out)` writes the ring point
// (out.x along the side axis, out.y along the normal axis). Rings at t=0 / t=1 should collapse to a
// point (use cap()) so the mesh is watertight. Normals are rebuilt analytically (seam-free).
// ---------------------------------------------------------------------------------------------
export class Loft {
  constructor({ stations, radial, section, color = null, uvRepeat = [1, 1] }) {
    this.stations = stations;
    this.radial = radial;
    this.section = section;
    const cols = radial + 1;
    this.cols = cols;
    const count = stations * cols;
    this.pos = new Float32Array(count * 3);
    this.nor = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    const idx = [];
    for (let i = 0; i < stations; i++) {
      for (let j = 0; j < cols; j++) {
        uvs[(i * cols + j) * 2] = (j / radial) * uvRepeat[0];
        uvs[(i * cols + j) * 2 + 1] = (i / (stations - 1)) * uvRepeat[1];
      }
    }
    for (let i = 0; i < stations - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * cols + j;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    if (color) {
      const col = new Float32Array(count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < stations; i++) {
        for (let j = 0; j < cols; j++) {
          c.setRGB(1, 1, 1);
          color(i / (stations - 1), (j / radial) * Math.PI * 2, c);
          c.toArray(col, (i * cols + j) * 3);
        }
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    this.geometry = g;
    this._T = new THREE.Vector3();
    this._S = new THREE.Vector3();
    this._N = new THREE.Vector3();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._sec = { x: 0, y: 0 };
    this._tangents = Array.from({ length: stations }, () => new THREE.Vector3());
  }

  /** points: Vector3[stations]; side: Vector3 (or Vector3[stations]) hint for the ring's lateral axis. */
  update(points, side) {
    const { stations, radial, cols, pos, nor, _T: T, _S: S, _N: N, _sec: sec } = this;
    for (let i = 0; i < stations; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[Math.min(stations - 1, i + 1)];
      T.subVectors(p1, p0).normalize();
      this._tangents[i].copy(T);
      const h = Array.isArray(side) ? side[i] : side;
      S.copy(h).addScaledVector(T, -h.dot(T)).normalize();
      N.crossVectors(S, T);
      const t = i / (stations - 1);
      const P = points[i];
      for (let j = 0; j < cols; j++) {
        this.section(t, (j / radial) * Math.PI * 2, sec);
        const k = (i * cols + j) * 3;
        pos[k] = P.x + S.x * sec.x + N.x * sec.y;
        pos[k + 1] = P.y + S.y * sec.x + N.y * sec.y;
        pos[k + 2] = P.z + S.z * sec.x + N.z * sec.y;
      }
    }
    const a = this._a;
    const b = this._b;
    for (let i = 0; i < stations; i++) {
      const ip = Math.max(0, i - 1);
      const inx = Math.min(stations - 1, i + 1);
      for (let j = 0; j < cols; j++) {
        const jj = j % radial;
        const jn = (jj + 1) % radial;
        const jp = (jj + radial - 1) % radial;
        const k0 = (inx * cols + jj) * 3;
        const k1 = (ip * cols + jj) * 3;
        a.set(pos[k0] - pos[k1], pos[k0 + 1] - pos[k1 + 1], pos[k0 + 2] - pos[k1 + 2]);
        const k2 = (i * cols + jn) * 3;
        const k3 = (i * cols + jp) * 3;
        b.set(pos[k2] - pos[k3], pos[k2 + 1] - pos[k3 + 1], pos[k2 + 2] - pos[k3 + 2]);
        a.cross(b);
        const l = a.lengthSq();
        const k = (i * cols + j) * 3;
        if (l < 1e-14) {
          const tg = this._tangents[i];
          const sgn = i === 0 ? -1 : 1;
          nor[k] = tg.x * sgn;
          nor[k + 1] = tg.y * sgn;
          nor[k + 2] = tg.z * sgn;
        } else {
          const il = 1 / Math.sqrt(l);
          nor[k] = a.x * il;
          nor[k + 1] = a.y * il;
          nor[k + 2] = a.z * il;
        }
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    return this;
  }
}

// Straight/curved helper: sample a spline into `n` evenly spaced stations (allocates; for static meshes).
export function samplePath(ctrl, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(splinePoint(ctrl, i / (n - 1), new THREE.Vector3()));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Analytic two-bone IK. Writes the joint and the reachable end point.
// ---------------------------------------------------------------------------------------------
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
export function solveTwoBone(root, target, a, b, pole, outMid, outEnd) {
  _d.subVectors(target, root);
  const dist = clamp(_d.length(), Math.abs(a - b) + 1e-4, a + b - 1e-4);
  _d.normalize();
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize();
  const x = (a * a - b * b + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  outMid.copy(root).addScaledVector(_d, x).addScaledVector(_p, h);
  outEnd.copy(root).addScaledVector(_d, dist);
}

// Points an object's local +Y from `from` to `to` (limb segments are modelled along +Y).
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
export function placeBone(obj, from, to) {
  obj.position.copy(from);
  _dir.subVectors(to, from).normalize();
  obj.quaternion.setFromUnitVectors(_up, _dir);
}

// Orthonormal basis quaternion from a forward (+Y) direction and a normal hint (+Z).
const _m = new THREE.Matrix4();
const _bx = new THREE.Vector3();
const _by = new THREE.Vector3();
const _bz = new THREE.Vector3();
export function basisQuat(yAxis, zHint, out) {
  _by.copy(yAxis).normalize();
  _bz.copy(zHint).addScaledVector(_by, -zHint.dot(_by));
  if (_bz.lengthSq() < 1e-8) _bz.set(0, 0, 1).addScaledVector(_by, -_by.z);
  _bz.normalize();
  _bx.crossVectors(_by, _bz);
  return out.setFromRotationMatrix(_m.makeBasis(_bx, _by, _bz));
}

export function canvasTexture(w, h, draw, { repeat = null, srgb = true, aniso = 8, mip = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  tex.generateMipmaps = mip;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

// GLSL noise shared by the sky, sea and procedural ground shaders.
export const GLSL_NOISE = /* glsl */ `
  float hash11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
  float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p){
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; }
    return s;
  }
`;
