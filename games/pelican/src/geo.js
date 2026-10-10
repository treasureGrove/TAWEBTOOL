// Small geometry toolkit for the scenery: build parts, tint them with vertex colours, merge them into one
// geometry per material (so a whole lamp post or palm is a single instanced draw).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp } from './util.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------------------------------------
// Value noise (JS side) for displacing blobs, bark, islands...
// ---------------------------------------------------------------------------------------------
function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise3(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
    w
  );
}
export function fbm3(x, y, z, oct = 3) {
  let a = 0.5;
  let s = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise3(x, y, z);
    x *= 2.03;
    y *= 2.03;
    z *= 2.03;
    a *= 0.5;
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// Preparing + merging
// ---------------------------------------------------------------------------------------------
/** Normalise a geometry so any set of them can be merged: non-indexed, position/normal/uv/color only. */
export function prep(geo, color = null, uvx = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k);
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (uvx) {
    const uv = g.attributes.uv;
    for (let i = 0; i < n; i++) uv.setX(i, uvx);
  }
  if (!g.attributes.color) {
    const col = new Float32Array(n * 3).fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  if (color !== null) paint(g, color);
  return g;
}

/** Fill the colour attribute with one colour, or fn(x, y, z, nx, ny, nz, i) -> Color-like / hex. */
export function paint(g, color) {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const col = g.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    if (typeof color === 'function') {
      const r = color(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i), i);
      _c.set(r);
    } else _c.set(color);
    col.setXYZ(i, _c.r, _c.g, _c.b);
  }
  col.needsUpdate = true;
  return g;
}

/** Apply translate / euler rotation / scale in place. */
export function xf(g, { p = [0, 0, 0], r = [0, 0, 0], s = 1 } = {}) {
  const sc = typeof s === 'number' ? [s, s, s] : s;
  _q.setFromEuler(_e.set(r[0], r[1], r[2]));
  _m.compose(_v.set(p[0], p[1], p[2]), _q, _a.set(sc[0], sc[1], sc[2]));
  g.applyMatrix4(_m);
  return g;
}

export function merge(list) {
  const m = mergeGeometries(list, false);
  if (!m) throw new Error('mergeGeometries failed (attribute mismatch)');
  list.forEach((g) => g.dispose());
  return m;
}

/** Cylinder (optionally tapered) between two points. */
export function bone(a, b, r0, r1 = r0, seg = 8, capEnds = true) {
  const A = Array.isArray(a) ? _a.set(a[0], a[1], a[2]).clone() : a.clone();
  const B = Array.isArray(b) ? _b.set(b[0], b[1], b[2]).clone() : b.clone();
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, !capEnds);
  _q.setFromUnitVectors(UP, B.clone().sub(A).normalize());
  _m.compose(A.add(B).multiplyScalar(0.5), _q, _v.set(1, 1, 1));
  g.applyMatrix4(_m);
  return g;
}

/** Tube along a curve whose radius can vary: rad(t). */
export function tubeAlong(curve, segs, radial, rad) {
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = g.attributes.position;
  const ring = radial + 1;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const c = curve.getPointAt(t);
    const k = typeof rad === 'function' ? rad(t) : rad;
    for (let j = 0; j < ring; j++) {
      const id = i * ring + j;
      pos.setXYZ(id, c.x + (pos.getX(id) - c.x) * k, c.y + (pos.getY(id) - c.y) * k, c.z + (pos.getZ(id) - c.z) * k);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** Flat-shaded copy (hard facets), e.g. for the hexagonal lantern. */
export function faceted(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------------------------
// Foliage blob: a displaced ellipsoid with soft, radial normals (reads as a volume of leaves).
// ---------------------------------------------------------------------------------------------
export function blob({ p = [0, 0, 0], r = 1, sx = 1, sy = 1, sz = 1, noise = 0.16, freq = 1.7, seed = 0, detail = 18, pinch = 0 }) {
  const g = new THREE.SphereGeometry(1, detail, Math.max(8, Math.round(detail * 0.72)));
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = (fbm3(x * freq + seed, y * freq + seed * 0.7, z * freq - seed, 3) - 0.44) * 2.2;
    let d = 1 + noise * n;
    let px = x * d * r * sx;
    let py = y * d * r * sy;
    let pz = z * d * r * sz;
    if (pinch) {
      const k = 1 - pinch * clamp((y - 0.25) / 0.75, 0, 1);
      px *= k;
      pz *= k;
    }
    pos.setXYZ(i, px + p[0], py + p[1], pz + p[2]);
    _v.set(x / sx, y / sy, z / sz).normalize();
    nor.setXYZ(i, _v.x, _v.y, _v.z);
  }
  return g;
}

export { UP };
