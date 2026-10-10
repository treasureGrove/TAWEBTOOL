// Roadside props that scroll past the parked rig: cast-iron lamp posts with flower baskets, beach palms,
// flowering bushes, trees, grass and wildflowers. Everything is procedural, merged per material and drawn
// with InstancedMesh; instances are placed on a ring of `SPAN` metres that wraps as the world scrolls.
import * as THREE from 'three';
import { clamp, lerp, deg, smoothstep, rng, V, canvasTexture, Loft, cap } from './util.js';
import { prep, merge, bone, tubeAlong, faceted, blob, fbm3 } from './geo.js';

export const SPAN = 660;
export const BACK = -330;

/** Rig-space x of a prop that started at x0 after the world has scrolled `travelled` metres toward -X. */
export function wrapX(x0, travelled, span = SPAN, back = BACK) {
  let u = (x0 - back - travelled) % span;
  if (u < 0) u += span;
  return u + back;
}

const _M = new THREE.Matrix4();
const _M2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);
const _col = new THREE.Color();

// GLSL: cheap 3-D value noise for leafy normals and patchy tint.
const NOISE3 = /* glsl */ `
  float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vn3(vec3 x){
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
`;

// ---------------------------------------------------------------------------------------------
// A Family is one prop type: N slots on the ring, one InstancedMesh per material part.
// slot: { x0, z, y?, yaw, s, sy }
// ---------------------------------------------------------------------------------------------
class Family {
  constructor({ kind = '', parts, slots, span = SPAN, back = BACK, ground = null, fade = 40 }) {
    this.kind = kind;
    this.slots = slots;
    this.span = span;
    this.back = back;
    this.ground = ground;
    this.fade = fade;
    this.group = new THREE.Group();
    this.parts = parts.map(({ geometry, material, offset = null, renderOrder = 0 }) => {
      const mesh = new THREE.InstancedMesh(geometry, material, slots.length);
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = renderOrder;
      mesh.userData.offset = offset;
      this.group.add(mesh);
      return mesh;
    });
  }

  /** debug / camera helper: rig-space position of every slot at the given travelled distance */
  positions(travelled) {
    return this.slots.map((s) => {
      const x = wrapX(s.x0, travelled, this.span, this.back);
      const y = s.y !== undefined ? s.y : this.ground ? this.ground(x, s.z) : 0;
      return { x, y, z: s.z, s: s.s ?? 1 };
    });
  }

  /** per-instance colour multiplier on the chosen parts (all parts when `only` is null) */
  tint(fn, only = null) {
    this.parts.forEach((mesh, k) => {
      if (only && !only.includes(k)) return;
      this.slots.forEach((s, i) => mesh.setColorAt(i, _col.set(fn(s, i))));
      mesh.instanceColor.needsUpdate = true;
    });
  }

  update(travelled) {
    const { slots, span, back, fade } = this;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const x = wrapX(s.x0, travelled, span, back);
      const k = smoothstep(0, fade, x - back) * smoothstep(0, fade, back + span - x);
      const y = s.y !== undefined ? s.y : this.ground ? this.ground(x, s.z) : 0;
      const sc = (s.s ?? 1) * k + 1e-4;
      _p.set(x, y, s.z);
      _q.setFromAxisAngle(_Y, s.yaw || 0);
      _s.set(sc * (s.sx ?? 1), sc * (s.sy ?? 1), sc * (s.sx ?? 1));
      _M.compose(_p, _q, _s);
      for (const mesh of this.parts) {
        const off = mesh.userData.offset;
        if (off) mesh.setMatrixAt(i, _M2.multiplyMatrices(_M, off));
        else mesh.setMatrixAt(i, _M);
      }
    }
    for (const mesh of this.parts) mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Irregular spacing along the ring: returns x0 values between `lo`..`hi`, gaps in [gmin, gmax]. */
function spaced(R, gmin, gmax, lo = BACK, hi = BACK + SPAN) {
  const out = [];
  for (let x = lo + R() * gmax; x < hi; x += gmin + R() * (gmax - gmin)) out.push(x);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Shared materials
// ---------------------------------------------------------------------------------------------
function makeMaterials({ T, atmosphere }) {
  let key = 0;
  const U = atmosphere.U;

  // Cast iron: dark green-black with brass bands (vertex colours)
  const iron = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.4, metalness: 0.78 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xfff1cf, emissive: 0xffc977, emissiveIntensity: 0, roughness: 0.22, metalness: 0 });
  const bloom = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.7, metalness: 0 });

  // Opaque cores of bushes / trees (blobs + trunks): radial normals, broken up by noise so any gaps between
  // the leaf cards still read as shaded foliage rather than plastic.
  function core() {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0 });
    const id = `core-${key++}`;
    m.customProgramCacheKey = () => id;
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vObj;\n${NOISE3}`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          diffuseColor.rgb *= 0.7 + 0.6 * vn3(vObj * 3.3 + 2.0);`
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          {
            vec3 q = vObj * 8.0;
            vec3 g = vec3(vn3(q + 11.0), vn3(q + 37.0), vn3(q + 71.0)) - 0.5;
            normal = normalize(normal + g * 0.6 * (1.0 - smoothstep(0.8, 2.2, fwidth(q.x) + fwidth(q.y))));
          }`
        );
    };
    return m;
  }

  // Alpha-cut leaf cards. kind: 'frond' (palm: flutter grows with distance from the crown),
  // 'canopy' (trees and bushes: slow sway + per-card shimmer), 'bloom' (flowers, tinted per instance).
  // All three glow when the low sun is behind them (forward-scattered light).
  function leaf(map, kind, { alpha = 0.4, rough = 0.62 } = {}) {
    const m = new THREE.MeshStandardMaterial({
      map,
      color: 0xffffff,
      vertexColors: true,
      roughness: rough,
      metalness: 0,
      side: THREE.DoubleSide,
      alphaTest: alpha,
      alphaToCoverage: true,
    });
    const id = `leaf-${kind}-${key++}`;
    m.customProgramCacheKey = () => id;
    const motion = {
      frond: `
        float r = length(transformed.xz);
        float w1 = sin(uTime * 1.55 + gp + transformed.x * 0.8 + transformed.z * 0.6);
        float w2 = sin(uTime * 2.9 + gp * 1.7 + r * 2.4);
        float k = r * r * 0.05;
        transformed.y += (w1 * 0.5 + w2 * 0.3) * k * 0.55;
        transformed.x += w1 * k * 0.3;
        transformed.z += w2 * k * 0.18;`,
      canopy: `
        float hh = max(position.y, 0.0);
        transformed.x += sin(uTime * 1.25 + gp) * 0.012 * hh;
        transformed.z += cos(uTime * 1.05 + gp * 1.3) * 0.009 * hh;
        transformed += normal * sin(uTime * 3.3 + dot(position, vec3(12.9, 7.2, 9.1))) * 0.014;`,
      bloom: `
        float hh = max(position.y, 0.0);
        transformed.x += sin(uTime * 1.25 + gp) * 0.012 * hh;
        transformed.z += cos(uTime * 1.05 + gp * 1.3) * 0.009 * hh;`,
    }[kind];
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = T.uTime;
      sh.uniforms.uSunDirW = U.uSunDir;
      sh.uniforms.uSunCol = U.uSunColor;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vObj;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vObj = position;
          {
            #ifdef USE_INSTANCING
              float gp = instanceMatrix[3].x * 0.11 + instanceMatrix[3].z * 0.17;
            #else
              float gp = 0.0;
            #endif
            ${motion}
          }`
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform vec3 uSunDirW;\nuniform vec3 uSunCol;\nvarying vec3 vObj;\n${NOISE3}`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          ${kind === 'bloom' ? '' : 'diffuseColor.rgb *= 0.74 + 0.5 * vn3(vObj * 2.6 + 3.1);'}`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            vec3 Ls = normalize(mat3(viewMatrix) * uSunDirW);
            vec3 Nv = normalize(vNormal);
            Nv = gl_FrontFacing ? Nv : -Nv;
            float back = max(dot(-Nv, Ls), 0.0);
            float vdl = max(dot(-normalize(vViewPosition), Ls), 0.0);
            totalEmissiveRadiance += diffuseColor.rgb * (uSunCol * (0.2 * back + 0.5 * back * pow(vdl, 2.0)) + 0.045);
          }`
        );
    };
    return m;
  }

  // Tufts of grass: vertex-coloured blades that bend in a gust travelling along the road.
  function grass({ sway = 0.5 } = {}) {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.78, metalness: 0, side: THREE.DoubleSide });
    const id = `grass-${key++}`;
    m.customProgramCacheKey = () => id;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = T.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec2 wp = instanceMatrix[3].xz;
          #else
            vec2 wp = vec2(0.0);
          #endif
          float gust = sin(uTime * 2.1 + wp.x * 0.35 + wp.y * 0.5) * 0.65 + sin(uTime * 3.7 + wp.x * 0.9) * 0.35;
          float bend = position.y * position.y * ${sway.toFixed(3)};
          transformed.x += gust * bend * 0.55;
          transformed.z += cos(uTime * 1.7 + wp.x * 0.4) * bend * 0.3;`
        );
    };
    return m;
  }

  return { iron, glass, bloom, core, leaf, grass };
}

// ---------------------------------------------------------------------------------------------
// Lamp posts
// ---------------------------------------------------------------------------------------------
const IRON = '#1e2b27';
const BRASS = '#b88f3a';

function buildLampGeometry() {
  const iron = [];
  const glass = [];
  const bloom = [];

  // --- column, a lathe profile with moulded base, beads and collar
  const prof = [
    [0.0, 0.0], [0.2, 0.0], [0.2, 0.035], [0.168, 0.055], [0.168, 0.11], [0.12, 0.16], [0.097, 0.27], [0.125, 0.285],
    [0.125, 0.315], [0.088, 0.335], [0.07, 0.37], [0.057, 0.46], [0.052, 1.1], [0.06, 1.12], [0.06, 1.16], [0.052, 1.18],
    [0.047, 2.0], [0.055, 2.02], [0.055, 2.06], [0.047, 2.08], [0.043, 3.1], [0.054, 3.14], [0.054, 3.2], [0.074, 3.26],
    [0.074, 3.3], [0.052, 3.33], [0.0, 3.33],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  iron.push(prep(new THREE.LatheGeometry(prof, 22), IRON));
  for (const [y, r] of [[0.345, 0.082], [1.17, 0.058], [2.07, 0.054], [3.2, 0.06]]) {
    const t = new THREE.TorusGeometry(r, 0.0085, 6, 22);
    t.rotateX(Math.PI / 2);
    t.translate(0, y, 0);
    iron.push(prep(t, BRASS));
  }

  // --- hexagonal lantern
  const hexAt = (R, y, k) => [Math.sin((k * Math.PI) / 3) * R, y, Math.cos((k * Math.PI) / 3) * R];
  iron.push(prep(faceted(new THREE.CylinderGeometry(0.1, 0.07, 0.1, 6).translate(0, 3.38, 0)), IRON));
  const gl = new THREE.LatheGeometry(
    [[0.0, 3.43], [0.082, 3.43], [0.118, 3.58], [0.136, 3.74], [0.124, 3.9], [0.108, 4.02], [0.0, 4.02]].map(([r, y]) => new THREE.Vector2(r, y)),
    6
  );
  glass.push(prep(faceted(gl), '#ffffff'));
  for (let k = 0; k < 6; k++) {
    iron.push(prep(bone(hexAt(0.084, 3.43, k), hexAt(0.138, 3.74, k), 0.0095, 0.0095, 5), IRON));
    iron.push(prep(bone(hexAt(0.138, 3.74, k), hexAt(0.11, 4.02, k), 0.0095, 0.0095, 5), IRON));
    iron.push(prep(bone(hexAt(0.11, 4.02, k), hexAt(0.11, 4.02, k + 1), 0.011, 0.011, 5), BRASS));
    iron.push(prep(bone(hexAt(0.084, 3.43, k), hexAt(0.084, 3.43, k + 1), 0.009, 0.009, 5), BRASS));
  }
  iron.push(prep(faceted(new THREE.ConeGeometry(0.205, 0.2, 6).translate(0, 4.12, 0)), IRON));
  iron.push(prep(faceted(new THREE.ConeGeometry(0.1, 0.12, 6).translate(0, 4.28, 0)), IRON));
  iron.push(prep(new THREE.SphereGeometry(0.03, 10, 8).translate(0, 4.37, 0), BRASS));
  iron.push(prep(new THREE.ConeGeometry(0.0085, 0.11, 6).translate(0, 4.46, 0), BRASS));

  // --- crook arm holding a hanging flower basket (towards +Z, the road)
  const arm = new THREE.CatmullRomCurve3([V(0, 2.36, 0.045), V(0, 2.56, 0.12), V(0, 2.82, 0.2), V(0, 3.0, 0.36), V(0, 3.03, 0.52), V(0, 2.95, 0.63)]);
  iron.push(prep(tubeAlong(arm, 26, 6, (t) => 0.0165 - 0.007 * t), IRON));
  const brace = new THREE.CatmullRomCurve3([V(0, 2.1, 0.05), V(0, 2.3, 0.2), V(0, 2.62, 0.38), V(0, 2.9, 0.5)]);
  iron.push(prep(tubeAlong(brace, 16, 5, 0.008), IRON));
  iron.push(prep(new THREE.SphereGeometry(0.017, 8, 6).translate(0, 2.95, 0.63), BRASS));

  const BY = 2.52;
  const BZ = 0.63;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    iron.push(prep(bone([0, 2.95, BZ], [Math.cos(a) * 0.17, BY + 0.01, BZ + Math.sin(a) * 0.17], 0.0035, 0.0035, 4), BRASS));
  }
  const bowl = new THREE.SphereGeometry(0.175, 20, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  bowl.scale(1, 0.78, 1);
  bowl.translate(0, BY, BZ);
  iron.push(prep(bowl, '#3a2d27'));
  const rim = new THREE.TorusGeometry(0.175, 0.009, 6, 24);
  rim.rotateX(Math.PI / 2);
  rim.translate(0, BY, BZ);
  iron.push(prep(rim, BRASS));

  // flowers: a mounded dome of petal-coloured blobs, green leaves and trailing vines
  const R = rng(91);
  const palette = ['#ff4f86', '#ff86ad', '#fff4ec', '#e8325a', '#ffc4d8', '#ff9a5c', '#b65cf0'];
  for (let i = 0; i < 30; i++) {
    const th = Math.acos(1 - R() * 0.62);
    const ph = R() * Math.PI * 2;
    const rr = 0.15 + R() * 0.05;
    const g = new THREE.IcosahedronGeometry(0.036 + R() * 0.026, 0);
    g.translate(Math.sin(th) * Math.cos(ph) * rr * 1.1, BY + 0.02 + Math.cos(th) * rr * 0.9, BZ + Math.sin(th) * Math.sin(ph) * rr * 1.1);
    bloom.push(prep(g, palette[Math.floor(R() * palette.length)]));
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + R() * 0.3;
    const g = new THREE.SphereGeometry(0.075, 7, 5);
    g.scale(1.2, 0.5, 1);
    g.translate(Math.cos(a) * 0.17, BY + 0.045 + R() * 0.03, BZ + Math.sin(a) * 0.17);
    bloom.push(prep(g, R() < 0.5 ? '#2f6a2c' : '#3f8a34'));
  }
  for (let v = 0; v < 4; v++) {
    const a = (v / 4) * Math.PI * 2 + 0.9;
    for (let i = 0; i < 6; i++) {
      const g = new THREE.SphereGeometry(0.03 - i * 0.002, 6, 4);
      g.scale(1, 1.3, 1);
      g.translate(Math.cos(a) * (0.18 + 0.01 * i), BY - 0.03 - i * 0.055, BZ + Math.sin(a) * (0.18 + 0.01 * i));
      bloom.push(prep(g, i % 3 === 2 ? '#ff7aa2' : '#3f8a34'));
    }
  }

  return { iron: merge(iron), glass: merge(glass), bloom: merge(bloom) };
}

const LAMP_Z = -2.98;
const LAMP_Y = 0.13;
const LAMP_TOP = V(0, 3.74, 0);

function buildLamps({ mats }) {
  const g = buildLampGeometry();
  const N = 40;
  const gap = SPAN / N;
  const slots = Array.from({ length: N }, (_, i) => ({ x0: BACK + i * gap + 3, z: LAMP_Z, y: LAMP_Y, yaw: 0, s: 1 }));
  const fam = new Family({
    kind: 'lamp',
    parts: [
      { geometry: g.iron, material: mats.iron },
      { geometry: g.glass, material: mats.glass },
      { geometry: g.bloom, material: mats.bloom },
    ],
    slots,
  });

  // soft additive halo billboards at the lanterns + pools of light on the road/sidewalk
  const glowMat = new THREE.ShaderMaterial({
    uniforms: { uGain: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){
        vUv = uv;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float s = length(vec3(instanceMatrix[0]));
        mv.xy += position.xy * s;
        mv.z += 0.4;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGain; varying vec2 vUv;
      void main(){
        float d = length(vUv - 0.5) * 2.0;
        float g = exp(-d * d * 4.5) * 0.55 + exp(-d * d * 30.0) * 1.4;
        g *= 1.0 - smoothstep(0.75, 1.0, d);
        gl_FragColor = vec4(vec3(1.0, 0.70, 0.36) * g * uGain, 1.0);
      }`,
  });
  const glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glowMat, N);
  glow.frustumCulled = false;
  glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glow.renderOrder = 5;

  const poolMat = new THREE.ShaderMaterial({
    uniforms: { uGain: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uGain; varying vec2 vUv;
      void main(){
        vec2 p = (vUv - 0.5) * 2.0;
        float d = length(p);
        float g = exp(-d * d * 3.2) * (1.0 - smoothstep(0.8, 1.0, d));
        gl_FragColor = vec4(vec3(1.0, 0.66, 0.32) * g * uGain, 1.0);
      }`,
  });
  const poolGeo = new THREE.PlaneGeometry(1, 1);
  poolGeo.rotateX(-Math.PI / 2);
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, N);
  pools.frustumCulled = false;
  pools.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pools.renderOrder = 4;
  fam.group.add(glow, pools);

  const baseUpdate = fam.update.bind(fam);
  fam.update = (travelled) => {
    baseUpdate(travelled);
    for (let i = 0; i < N; i++) {
      const s = slots[i];
      const x = wrapX(s.x0, travelled);
      const k = smoothstep(0, 40, x - BACK) * smoothstep(0, 40, BACK + SPAN - x);
      _p.set(x, LAMP_Y + LAMP_TOP.y, LAMP_Z);
      _M.compose(_p, _q.identity(), _s.set(2.8 * k + 1e-4, 2.8 * k + 1e-4, 1));
      glow.setMatrixAt(i, _M);
      _p.set(x + 0.4, 0.02, -0.7);
      _M.compose(_p, _q.identity(), _s.set(8.5 * k + 1e-4, 1, 6.4 * k + 1e-4));
      pools.setMatrixAt(i, _M);
    }
    glow.instanceMatrix.needsUpdate = true;
    pools.instanceMatrix.needsUpdate = true;
  };
  fam.setGlow = (v) => {
    mats.glass.emissiveIntensity = 0.04 + v * v * 2.6 + v * 0.5;
    glowMat.uniforms.uGain.value = v * v * 0.9 + v * 0.1;
    poolMat.uniforms.uGain.value = v * v * 0.42;
    glow.visible = pools.visible = v > 0.01;
  };
  return fam;
}

// ---------------------------------------------------------------------------------------------
// Textures for bark, fronds, leaves and blooms
// ---------------------------------------------------------------------------------------------
function barkTexture() {
  const r = rng(404);
  return canvasTexture(128, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#86694b');
    g.addColorStop(0.5, '#a58461');
    g.addColorStop(1, '#86694b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = r() < 0.5 ? `rgba(60,40,24,${0.05 + r() * 0.14})` : `rgba(230,205,170,${0.04 + r() * 0.1})`;
      ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 2 + r() * 14);
    }
    // ring scars (the tile holds 6 so they line up with the geometry ridges)
    for (let i = 0; i < 6; i++) {
      const y = (i / 6) * h + 6;
      const gr = ctx.createLinearGradient(0, y - 6, 0, y + 8);
      gr.addColorStop(0, 'rgba(50,32,18,0)');
      gr.addColorStop(0.55, 'rgba(50,32,18,0.55)');
      gr.addColorStop(0.7, 'rgba(230,205,170,0.25)');
      gr.addColorStop(1, 'rgba(50,32,18,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, y - 6, w, 14);
    }
  });
}

function frondTexture() {
  const r = rng(2024);
  return canvasTexture(1024, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const cy = h / 2;
    const Lmax = cy - 4;
    const N = 104;
    for (const side of [-1, 1]) {
      for (let i = 0; i < N; i++) {
        const u = 0.1 + 0.9 * ((i + r() * 0.5) / N);
        const x0 = u * w;
        const p = Math.sin(Math.PI * clamp((u - 0.06) / 0.96, 0, 1));
        const len = Lmax * (0.22 + 0.78 * Math.pow(p, 0.45)) * (0.88 + 0.22 * r());
        const sweep = len * (0.44 + 0.14 * r());
        const x1 = x0 + sweep;
        const y1 = cy + side * len;
        const mx = x0 + sweep * 0.3;
        const my = cy + side * len * 0.55;
        const gr = ctx.createLinearGradient(x0, cy, x1, y1);
        const hue = 84 + r() * 18;
        gr.addColorStop(0, `hsl(${hue + 8}, 55%, 24%)`);
        gr.addColorStop(0.5, `hsl(${hue}, 58%, ${34 + r() * 6}%)`);
        gr.addColorStop(1, `hsl(${hue - 12}, 66%, ${50 + r() * 8}%)`);
        ctx.fillStyle = gr;
        const wd = 4.6 + 1.6 * (1 - u * 0.4);
        ctx.beginPath();
        ctx.moveTo(x0 - wd * 0.5, cy);
        ctx.quadraticCurveTo(mx - wd * 0.9, my, x1, y1);
        ctx.quadraticCurveTo(mx + wd * 0.9, my, x0 + wd * 0.5, cy);
        ctx.closePath();
        ctx.fill();
      }
    }
    const rg = ctx.createLinearGradient(0, 0, w, 0);
    rg.addColorStop(0, '#6a4c2a');
    rg.addColorStop(0.18, '#83853a');
    rg.addColorStop(1, '#a3b048');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(0, cy - 6);
    ctx.lineTo(w * 0.98, cy - 1.4);
    ctx.lineTo(w, cy);
    ctx.lineTo(w * 0.98, cy + 1.4);
    ctx.lineTo(0, cy + 6);
    ctx.closePath();
    ctx.fill();
  });
}

// A leafy sprig: a stem with pairs of oval leaves, near-white so vertex colours set the hue.
function leafTexture() {
  const r = rng(77);
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const leaf = (x, y, ang, len, wid) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      const g = ctx.createLinearGradient(0, 0, 0, -len);
      const sh = 0.62 + 0.3 * r();
      g.addColorStop(0, `rgb(${Math.round(200 * sh)},${Math.round(214 * sh)},${Math.round(190 * sh)})`);
      g.addColorStop(1, `rgb(${Math.round(255 * sh)},${Math.round(255 * sh)},${Math.round(240 * sh)})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(wid * 1.15, -len * 0.42, 0, -len);
      ctx.quadraticCurveTo(-wid * 1.15, -len * 0.42, 0, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.lineTo(0, -len * 0.88);
      ctx.stroke();
      ctx.restore();
    };
    ctx.strokeStyle = '#a9b39a';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(64, 127);
    ctx.lineTo(64, 40);
    ctx.stroke();
    for (let k = 0; k < 5; k++) {
      const y = 118 - k * 17;
      const len = 40 - k * 2.2;
      leaf(64, y, -1.0 - r() * 0.25, len, 11.5);
      leaf(64, y - 7, 1.0 + r() * 0.25, len, 11.5);
    }
    leaf(64, 44, 0, 36, 11);
  });
}

// A five-petal bloom with a darker eye, near-white so the per-instance tint sets the colour.
function bloomTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.rotate((i / 5) * Math.PI * 2);
      const g = ctx.createRadialGradient(0, -26, 4, 0, -30, 34);
      g.addColorStop(0, 'rgb(255,255,255)');
      g.addColorStop(0.7, 'rgb(236,230,236)');
      g.addColorStop(1, 'rgb(205,196,206)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, -31, 20, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = 'rgb(150,120,70)';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ---------------------------------------------------------------------------------------------
// Palms
// ---------------------------------------------------------------------------------------------
function buildFrond(az, elev0, len, droop, width, age, R) {
  const NS = 16;
  const NW = 4;
  const pos = [];
  const uv = [];
  const col = [];
  const idx = [];
  const dirH = V(Math.cos(az), 0, Math.sin(az));
  const S = V(-Math.sin(az), 0, Math.cos(az));
  const T = V();
  const P = V();
  let d = 0;
  let h = 0;
  const c0 = new THREE.Color('#79b03a');
  const c1 = new THREE.Color('#d2c35a');
  const tint = new THREE.Color().copy(c0).lerp(c1, clamp(age * 0.5 + (R() - 0.5) * 0.15, 0, 1));
  const twist = (R() - 0.5) * 0.5;
  for (let j = 0; j <= NS; j++) {
    const s = j / NS;
    const ang = elev0 - droop * Math.pow(s, 1.45);
    if (j > 0) {
      const a2 = elev0 - droop * Math.pow((j - 0.5) / NS, 1.45);
      d += (Math.cos(a2) * len) / NS;
      h += (Math.sin(a2) * len) / NS;
    }
    T.copy(dirH).multiplyScalar(Math.cos(ang)).addScaledVector(_Y, Math.sin(ang));
    P.copy(dirH).multiplyScalar(d).addScaledVector(_Y, h);
    const roll = twist * s;
    const half = 0.5 * width * (0.5 + 0.5 * smoothstep(0, 0.1, s)) * (0.45 + 0.55 * smoothstep(1.02, 0.6, s));
    for (let i = 0; i <= NW; i++) {
      const t = (i / NW) * 2 - 1;
      const lat = t * half;
      const fold = 0.55 * half * Math.pow(Math.abs(t), 1.25) + 0.22 * half * Math.abs(t) * s;
      pos.push(P.x + S.x * lat * Math.cos(roll), P.y - fold + lat * Math.sin(roll) * 0.4, P.z + S.z * lat * Math.cos(roll));
      uv.push(s, (t + 1) / 2);
      col.push(tint.r, tint.g, tint.b);
    }
  }
  const row = NW + 1;
  for (let j = 0; j < NS; j++) {
    for (let i = 0; i < NW; i++) {
      const a = j * row + i;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
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

function buildPalm(seed, { H, lean, fronds = 19, len = 3.7 }) {
  const R = rng(seed);
  // trunk: a gentle S-curve (quadratic bezier) that leans out toward its crown
  const NS = 34;
  const pts = [];
  const P1 = V(lean * 0.08, H * 0.58, lean * 0.05);
  const P2 = V(lean, H, lean * 0.12);
  for (let i = 0; i < NS; i++) {
    const t = i / (NS - 1);
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    pts.push(V(b * P1.x + c * P2.x, -0.25 * a + b * P1.y + c * P2.y, b * P1.z + c * P2.z));
  }
  const loft = new Loft({
    stations: NS,
    radial: 16,
    uvRepeat: [1, H / 1.0],
    section: (t, a, out) => {
      const flare = 1 + 0.6 * Math.exp(-t * H * 3.1);
      const f = (t * H * 6) % 1;
      const ridge = 1 + 0.04 * Math.pow(f, 3);
      const r = lerp(0.235, 0.135, Math.pow(t, 0.8)) * flare * ridge * (1 + 0.035 * Math.sin(a * 5 + t * 4)) * cap(t, 0.012);
      out.x = Math.cos(a) * r;
      out.y = Math.sin(a) * r;
    },
  });
  loft.update(pts, V(0, 0, 1));
  const trunk = prep(loft.geometry.clone(), '#ffffff');

  const top = pts[NS - 1].clone();
  top.y -= 0.02;

  // crown core: a fibrous boot and a cluster of coconuts (vertex coloured)
  const core = [];
  const boot = new THREE.SphereGeometry(0.15, 12, 9);
  boot.scale(1, 1.1, 1);
  core.push(prep(boot, '#9a8a58'));
  const cn = 7;
  for (let i = 0; i < cn; i++) {
    const a = (i / cn) * Math.PI * 2 + R() * 0.4;
    const g = new THREE.SphereGeometry(0.085 + R() * 0.02, 9, 7);
    g.scale(1, 1.1, 1);
    g.translate(Math.cos(a) * 0.16, -0.18 - R() * 0.1, Math.sin(a) * 0.16);
    core.push(prep(g, R() < 0.55 ? '#7d9a3a' : '#96733a'));
  }

  // fronds in a golden-angle spiral; older (lower) fronds are longer and droop more
  const fr = [];
  for (let i = 0; i < fronds; i++) {
    const k = i / (fronds - 1);
    const az = i * 2.399963 + R() * 0.2;
    const elev0 = deg(lerp(20, 80, Math.pow(k, 0.85)));
    const length = len * lerp(1.0, 0.6, k) * (0.92 + 0.16 * R());
    const droop = lerp(1.3, 0.3, k) * (0.85 + 0.3 * R());
    fr.push(prep(buildFrond(az, elev0, length, droop, 1.75 * lerp(1, 0.7, k), 1 - k, R)));
  }
  const crown = merge(fr);

  return { trunk, core: merge(core), crown, top };
}

function buildPalms({ mats, ground }) {
  const bark = barkTexture();
  const barkMat = new THREE.MeshStandardMaterial({ map: bark, bumpMap: bark, bumpScale: 2.2, color: 0xffffff, vertexColors: true, roughness: 0.92 });
  const frondMat = mats.leaf(frondTexture(), 'frond', { alpha: 0.36 });
  const coreMat = mats.bloom;

  const defs = [
    { seed: 11, H: 7.2, lean: 1.5 },
    { seed: 23, H: 8.6, lean: -1.3, len: 3.9 },
    { seed: 37, H: 6.1, lean: 0.8, len: 3.5 },
  ];
  const R = rng(555);
  const xs = spaced(R, 12, 34);
  const per = defs.map(() => []);
  xs.forEach((x0, i) => {
    const v = i % defs.length;
    const z = -(5.6 + R() * 5.5);
    per[v].push({
      x0,
      z,
      yaw: Math.PI / 2 + (R() - 0.5) * 2.2,
      s: 0.82 + R() * 0.42,
      y: ground(z) - 0.12,
    });
  });
  return defs.map((d, v) => {
    const g = buildPalm(d.seed, d);
    const off = new THREE.Matrix4().makeTranslation(g.top.x, g.top.y, g.top.z);
    const fam = new Family({
      kind: 'palm',
      parts: [
        { geometry: g.trunk, material: barkMat },
        { geometry: g.core, material: coreMat, offset: off },
        { geometry: g.crown, material: frondMat, offset: off },
      ],
      slots: per[v],
    });
    // only the fronds get a per-tree tint (a little yellower / darker); trunk and core keep their natural colour
    fam.tint((s, i) => new THREE.Color().setHSL(0.27 + ((i * 0.37) % 1) * 0.04, 0.12, 0.8 + ((i * 0.53) % 1) * 0.2), [2]);
    return fam;
  });
}

// ---------------------------------------------------------------------------------------------
// Bushes + trees: dark core blobs wrapped in alpha-cut leaf cards (and flower cards on bushes)
// ---------------------------------------------------------------------------------------------
function leafColor(lo, hi, y0, y1, seed) {
  const A = new THREE.Color(lo);
  const B = new THREE.Color(hi);
  const c = new THREE.Color();
  return (x, y, z) => {
    const t = clamp((y - y0) / (y1 - y0), 0, 1);
    const n = fbm3(x * 1.3 + seed, y * 1.3, z * 1.3, 3);
    c.copy(A).lerp(B, clamp(Math.pow(t, 0.85) * 0.8 + (n - 0.44) * 0.9, 0, 1));
    return c;
  };
}

/** Scatter cards over an ellipsoid. Normals follow the ellipsoid (soft, volumetric shading). */
function cards({ p = [0, 0, 0], sx = 1, sy = 1, sz = 1, count, size, seed, inner = 0.8, outer = 1.04, bias = 0.15, scatter = 0.35, color }) {
  const R = rng(seed);
  const pos = [];
  const nor = [];
  const uv = [];
  const col = [];
  const idx = [];
  const d = V();
  const n = V();
  const N2 = V();
  const T = V();
  const B = V();
  const T2 = V();
  const B2 = V();
  const c = new THREE.Color();
  let vi = 0;
  for (let i = 0; i < count; i++) {
    const y = clamp(R() * 2 - 1 + bias, -1, 1);
    if (y < -0.45 && R() < 0.85) continue;
    const phi = R() * Math.PI * 2;
    const rr = Math.sqrt(1 - y * y);
    d.set(rr * Math.cos(phi), y, rr * Math.sin(phi));
    const k = lerp(inner, outer, R());
    const px = p[0] + d.x * sx * k;
    const py = p[1] + d.y * sy * k;
    const pz = p[2] + d.z * sz * k;
    n.set(d.x / sx, d.y / sy, d.z / sz).normalize();
    N2.set(n.x + (R() - 0.5) * scatter * 2, n.y + (R() - 0.5) * scatter * 2, n.z + (R() - 0.5) * scatter * 2).normalize();
    T.crossVectors(N2, Math.abs(N2.y) > 0.95 ? V(1, 0, 0) : _Y).normalize();
    B.crossVectors(N2, T);
    const a = R() * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    T2.copy(T).multiplyScalar(ca).addScaledVector(B, sa);
    B2.copy(B).multiplyScalar(ca).addScaledVector(T, -sa);
    const h = size * (0.75 + 0.5 * R());
    const tone = 0.82 + 0.36 * R();
    c.set(color ? color(px, py, pz) : '#ffffff').multiplyScalar(tone);
    for (const [cx, cy, u, v] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      pos.push(px + T2.x * cx * h + B2.x * cy * h, py + T2.y * cx * h + B2.y * cy * h - (cy > 0 ? h * 0.18 : 0), pz + T2.z * cx * h + B2.z * cy * h);
      nor.push(n.x, n.y, n.z);
      uv.push(u, v);
      col.push(c.r, c.g, c.b);
    }
    idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    vi += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function bushGeometry(seed) {
  const R = rng(seed);
  const core = [];
  const leaves = [];
  const blooms = [];
  const dark = leafColor('#1f4422', '#2f6a2a', 0, 1, seed);
  const lit = leafColor('#2f6b2a', '#8cc044', 0.05, 1.0, seed);
  for (let i = 0; i < 5; i++) {
    const a = i * 2.4 + R();
    const rad = i === 0 ? 0 : 0.34 + R() * 0.28;
    const p = [Math.cos(a) * rad, 0.3 + R() * 0.2 + (i === 0 ? 0.1 : 0), Math.sin(a) * rad];
    const r = 0.45 + R() * 0.22;
    // the dark core sits a little inside the leaf shell so the cards read as foliage, not as stickers on a rock
    core.push(prep(blob({ p, r: r * 0.84, sy: 0.78, noise: 0.2, seed: seed + i * 5.3, detail: 12 }), dark));
    leaves.push(prep(cards({ p, sx: r, sy: r * 0.78, sz: r, count: 170, size: 0.19, seed: seed * 7 + i, inner: 0.9, outer: 1.12, color: lit })));
    blooms.push(prep(cards({ p, sx: r, sy: r * 0.78, sz: r, count: 46, size: 0.052, seed: seed * 13 + i, inner: 1.04, outer: 1.16, bias: 0.4, scatter: 0.2 })));
  }
  return { core: merge(core), leaves: merge(leaves), blooms: merge(blooms) };
}

function treeGeometry(kind, seed) {
  const R = rng(seed);
  const core = [];
  const leaves = [];
  const bark = '#5b4332';
  const addCrown = (p, r, sx, sy, sz, count, size, lo, hi, y0, y1) => {
    const lit = leafColor(lo, hi, y0, y1, seed);
    const dark = leafColor('#17381f', '#2a5a2a', y0, y1, seed);
    core.push(prep(blob({ p, r: r * 0.84, sx, sy, sz, noise: 0.18, seed: seed + p[0] * 3.1, detail: 12 }), dark));
    leaves.push(prep(cards({ p, sx: r * sx, sy: r * sy, sz: r * sz, count: Math.round(count * 1.15), size: size * 1.05, inner: 0.9, outer: 1.14, seed: Math.floor(seed * 17 + p[0] * 13 + p[2] * 7 + 100), color: lit })));
  };
  if (kind === 'round') {
    const trunk = new THREE.CatmullRomCurve3([V(0, -0.1, 0), V(0.08, 1.0, 0.03), V(0.0, 1.9, -0.05), V(-0.1, 2.5, 0.05)]);
    core.push(prep(tubeAlong(trunk, 12, 8, (t) => 0.17 - 0.07 * t + 0.1 * Math.exp(-t * 12)), bark));
    core.push(prep(bone([-0.1, 2.4, 0.05], [-0.9, 3.5, 0.3], 0.07, 0.03, 6), bark));
    core.push(prep(bone([-0.1, 2.4, 0.05], [0.9, 3.4, -0.3], 0.07, 0.03, 6), bark));
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4 + R() * 0.5;
      const rad = i === 0 ? 0 : 0.95 + R() * 0.55;
      addCrown([Math.cos(a) * rad, 3.7 + (i === 0 ? 0.55 : R() * 0.9 - 0.35), Math.sin(a) * rad], 0.95 + R() * 0.45, 1, 0.82, 1, 150, 0.4, '#2f6a2a', '#9ac94a', 2.7, 5.8);
    }
  } else if (kind === 'pine') {
    const trunk = new THREE.CatmullRomCurve3([V(0, -0.1, 0), V(0.25, 1.6, 0.1), V(0.1, 3.4, -0.1), V(-0.2, 5.0, 0.0)]);
    core.push(prep(tubeAlong(trunk, 14, 8, (t) => 0.2 - 0.09 * t + 0.1 * Math.exp(-t * 10)), '#76503a'));
    core.push(prep(bone([-0.2, 4.7, 0], [-1.6, 5.7, 0.5], 0.08, 0.04, 6), '#76503a'));
    core.push(prep(bone([-0.2, 4.8, 0], [1.4, 5.8, -0.6], 0.08, 0.04, 6), '#76503a'));
    const spots = [[0, 0, 0], [-1.5, 0.0, 0.5], [1.4, 0.15, -0.6], [0.3, 0.1, 1.5], [-0.2, 0.05, -1.5]];
    spots.forEach(([x, y, z]) => {
      addCrown([-0.2 + x, 5.9 + y, z], 1.45 + R() * 0.4, 1.15, 0.4, 1.15, 190, 0.34, '#2d5a30', '#78a64a', 5.3, 6.6);
    });
  } else {
    core.push(prep(bone([0, -0.1, 0], [0, 0.9, 0], 0.1, 0.07, 6), bark));
    const dark = leafColor('#12301c', '#245a2c', 0.5, 6.0, seed);
    core.push(prep(blob({ p: [0, 3.2, 0], r: 1, sx: 0.46, sy: 3.1, sz: 0.46, noise: 0.1, seed, detail: 14, pinch: 0.85 }), dark));
    // cypress foliage: tall narrow stack of cards
    const lit = leafColor('#1f4d2c', '#4a8a3e', 0.5, 6.0, seed);
    for (let i = 0; i < 4; i++) {
      leaves.push(prep(cards({ p: [0, 3.2, 0], sx: 0.46, sy: 3.1, sz: 0.46, count: 140, size: 0.26, seed: seed * 5 + i, color: lit, inner: 0.9, outer: 1.0, bias: 0, scatter: 0.4 })));
    }
  }
  return { core: merge(core), leaves: merge(leaves) };
}

function buildBushesAndTrees({ mats, ground }) {
  const R = rng(808);
  const fams = [];
  const coreMat = mats.core();
  const leafMat = mats.leaf(leafTexture(), 'canopy', { alpha: 0.4, rough: 0.7 });
  const bloomMat = mats.leaf(bloomTexture(), 'bloom', { alpha: 0.45, rough: 0.55 });

  // bushes: meadow side only, several flower colours (a few stay plain green)
  const flowerCols = ['#e22f7c', '#ff7fa8', '#fff4e6', '#ffc83a', '#9a6ee6', '#ff8a3d'];
  const bushGeos = [bushGeometry(3), bushGeometry(9), bushGeometry(15)];
  const bushSlots = bushGeos.map(() => []);
  spaced(R, 8, 20).forEach((x0, i) => {
    bushSlots[i % bushGeos.length].push({
      x0,
      z: 5.0 + R() * 3.4,
      yaw: R() * 6.28,
      s: 0.8 + R() * 0.9,
      sy: 0.85 + R() * 0.4,
      flower: R() < 0.8 ? flowerCols[Math.floor(R() * flowerCols.length)] : null,
    });
  });
  bushGeos.forEach((g, v) => {
    const fam = new Family({
      kind: 'bush',
      parts: [
        { geometry: g.core, material: coreMat },
        { geometry: g.leaves, material: leafMat },
        { geometry: g.blooms, material: bloomMat },
      ],
      slots: bushSlots[v],
      ground: (x, z) => ground.meadow(x, z) - 0.03,
    });
    // plain bushes: shrink the bloom cards away by tinting them to the leaf colour
    fam.tint((s) => s.flower || '#3f7a35', [2]);
    fams.push(fam);
  });

  // trees
  const kinds = [
    ['round', 21],
    ['pine', 34],
    ['cypress', 47],
    ['round', 58],
  ];
  const treeSlots = kinds.map(() => []);
  spaced(R, 16, 40).forEach((x0) => {
    const v = Math.floor(R() * kinds.length);
    treeSlots[v].push({ x0, z: 9.5 + R() * 13, yaw: R() * 6.28, s: 0.85 + R() * 0.5, sy: 0.92 + R() * 0.25 });
  });
  kinds.forEach(([kind, seed], v) => {
    const g = treeGeometry(kind, seed);
    fams.push(
      new Family({
        kind: 'tree',
        parts: [
          { geometry: g.core, material: coreMat },
          { geometry: g.leaves, material: leafMat },
        ],
        slots: treeSlots[v],
        ground: (x, z) => ground.meadow(x, z) - 0.05,
      })
    );
  });
  return fams;
}

// ---------------------------------------------------------------------------------------------
// Grass tufts, wildflowers and dune grass
// ---------------------------------------------------------------------------------------------
function tuftGeometry(seed, { blades = 11, hMin = 0.22, hMax = 0.5, spread = 0.07, dry = 0.0, lo = '#2e4f1c', hi = '#9bc23e', flower = null }) {
  const R = rng(seed);
  const parts = [];
  const cLo = new THREE.Color(lo);
  const cHi = new THREE.Color(hi);
  const dryC = new THREE.Color('#d2b865');
  for (let b = 0; b < blades; b++) {
    const h = lerp(hMin, hMax, R());
    const w0 = 0.012 + R() * 0.008;
    const yaw = R() * Math.PI * 2;
    const lean = 0.15 + R() * 0.55;
    const bend = 0.1 + R() * 0.4;
    const rr = Math.sqrt(R()) * spread;
    const ox = Math.cos(yaw + 1.3) * rr;
    const oz = Math.sin(yaw + 1.3) * rr;
    const isDry = R() < dry;
    const ring = 4;
    const pos = [];
    const col = [];
    const idx = [];
    for (let k = 0; k <= ring; k++) {
      const t = k / ring;
      const tip = k === ring;
      const half = tip ? 0 : w0 * Math.pow(1 - t, 0.75);
      const fwd = lean * h * t + bend * h * t * t;
      const y = h * t;
      const c = new THREE.Color().copy(cLo).lerp(cHi, Math.pow(t, 0.8) * (0.85 + 0.3 * R()));
      if (isDry) c.lerp(dryC, 0.35 + 0.5 * t);
      for (const sgn of tip ? [0] : [-1, 1]) {
        const lz = sgn * half;
        pos.push(ox + fwd * Math.cos(yaw) - lz * Math.sin(yaw), y, oz + fwd * Math.sin(yaw) + lz * Math.cos(yaw));
        col.push(c.r, c.g, c.b);
      }
    }
    for (let k = 0; k < ring - 1; k++) {
      const a = k * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const top = (ring - 1) * 2;
    idx.push(top, top + 1, top + 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // blades face up-and-out: normals are mostly vertical so they catch the sky
    const nor = g.attributes.normal;
    for (let i = 0; i < nor.count; i++) nor.setXYZ(i, nor.getX(i) * 0.5, 0.85, nor.getZ(i) * 0.5);
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    parts.push(prep(g));
  }
  if (flower) {
    const n = flower.count ?? 4;
    for (let f = 0; f < n; f++) {
      const a = R() * Math.PI * 2;
      const rr = Math.sqrt(R()) * spread * 1.6;
      const h = lerp(hMax * 0.95, hMax * 1.35, R());
      const base = [Math.cos(a) * rr, 0, Math.sin(a) * rr];
      const head = [base[0] + (R() - 0.5) * 0.08, h, base[2] + (R() - 0.5) * 0.08];
      parts.push(prep(bone(base, head, 0.0042, 0.003, 4, false), '#4f8a30'));
      const petal = new THREE.CircleGeometry(0.026 + R() * 0.01, 7);
      petal.rotateX(-Math.PI / 2 + (R() - 0.5) * 0.7);
      petal.rotateY(R() * 6.28);
      petal.translate(head[0], head[1], head[2]);
      parts.push(prep(petal, flower.color));
      const eye = new THREE.CircleGeometry(0.0105, 6);
      eye.rotateX(-Math.PI / 2);
      eye.translate(head[0], head[1] + 0.003, head[2]);
      parts.push(prep(eye, flower.eye ?? '#ffcf3a'));
    }
  }
  return merge(parts);
}

function buildGrass({ mats, ground }) {
  const R = rng(1234);
  const SP = 220;
  const BK = -80;
  const fams = [];
  const grassMat = mats.grass({ sway: 0.55 });
  const duneMat = mats.grass({ sway: 0.35 });
  const lush = (x, z) => ground.meadow(x, z) - 0.01;

  // meadow-edge tufts
  const meadowGeos = [
    tuftGeometry(1, { blades: 16, hMin: 0.14, hMax: 0.34, lo: '#32561e', hi: '#a6cc48' }),
    tuftGeometry(2, { blades: 18, hMin: 0.18, hMax: 0.42, lo: '#365c20', hi: '#b8d452', dry: 0.08 }),
  ];
  const mSlots = meadowGeos.map(() => []);
  for (let i = 0; i < 520; i++) {
    mSlots[i % meadowGeos.length].push({
      x0: BK + R() * SP,
      z: 4.35 + Math.pow(R(), 1.7) * 5.2,
      yaw: R() * 6.28,
      s: 0.75 + R() * 0.8,
      sy: 0.8 + R() * 0.6,
    });
  }
  meadowGeos.forEach((g, v) => fams.push(new Family({ kind: 'tuft', parts: [{ geometry: g, material: grassMat }], slots: mSlots[v], span: SP, back: BK, fade: 30, ground: lush })));

  // wildflower patches
  const flowerSets = [
    { color: '#fffaf0', eye: '#ffcf3a', seed: 31 },
    { color: '#ff8fb5', eye: '#ffe27a', seed: 32 },
    { color: '#ffd23c', eye: '#c97a1a', seed: 33 },
    { color: '#a37cf2', eye: '#ffe27a', seed: 34 },
    { color: '#ff7a4a', eye: '#ffe27a', seed: 35 },
  ];
  flowerSets.forEach((fs) => {
    const geo = tuftGeometry(fs.seed, { blades: 12, hMin: 0.12, hMax: 0.24, spread: 0.08, lo: '#32561e', hi: '#a6cc48', flower: { color: fs.color, eye: fs.eye, count: 5 } });
    const slots = [];
    for (let c = 0; c < 8; c++) {
      const cx = BK + R() * SP;
      const cz = 4.6 + R() * 4.2;
      for (let k = 0; k < 7; k++) {
        const a = R() * 6.28;
        const rr = Math.sqrt(R()) * 1.4;
        slots.push({ x0: cx + Math.cos(a) * rr, z: cz + Math.sin(a) * rr * 0.8, yaw: R() * 6.28, s: 0.85 + R() * 0.6, sy: 0.9 + R() * 0.4 });
      }
    }
    fams.push(new Family({ kind: 'flower', parts: [{ geometry: geo, material: grassMat }], slots, span: SP, back: BK, fade: 30, ground: lush }));
  });

  // dune grass along the foot of the sea wall
  const duneGeo = tuftGeometry(77, { blades: 24, hMin: 0.4, hMax: 0.85, spread: 0.12, lo: '#6a7a3a', hi: '#d6cf86', dry: 0.3 });
  const dSlots = [];
  for (let i = 0; i < 110; i++) {
    dSlots.push({ x0: BK + R() * SP, z: -(4.25 + Math.pow(R(), 1.6) * 3.5), yaw: R() * 6.28, s: 0.8 + R() * 0.8, sy: 0.8 + R() * 0.5 });
  }
  fams.push(new Family({ kind: 'dune', parts: [{ geometry: duneGeo, material: duneMat }], slots: dSlots, span: SP, back: BK, fade: 30, ground: (x, z) => ground.beach(z) - 0.02 }));
  return fams;
}

// ---------------------------------------------------------------------------------------------
export function createProps({ scene, atmosphere, terrain }) {
  const T = { uTime: { value: 0 } };
  const mats = makeMaterials({ T, atmosphere });
  const ground = {
    beach: terrain.beachH,
    meadow: (x, z) => terrain.hillH(x, z),
  };
  const group = new THREE.Group();
  group.name = 'roadside';
  scene.add(group);

  const lamps = buildLamps({ mats });
  const families = [lamps, ...buildPalms({ mats, ground: ground.beach }), ...buildBushesAndTrees({ mats, ground }), ...buildGrass({ mats, ground })];
  for (const f of families) group.add(f.group);

  function update(travelled, time) {
    T.uTime.value = time;
    for (const f of families) f.update(travelled);
  }
  function setAtmosphere(name, p) {
    lamps.setGlow(p.lamp ?? 0);
  }
  /** nth-closest prop of a kind to rig x = nearX (after `ahead` more metres of travel); used by the screenshot tool */
  function locate(kind, nth = 0, nearX = 0, ahead = 0, travelled = 0) {
    const all = [];
    for (const f of families) if (f.kind === kind) all.push(...f.positions(travelled + ahead));
    all.sort((a, b) => Math.abs(a.x - nearX) - Math.abs(b.x - nearX));
    return all[nth] || null;
  }
  return { group, update, setAtmosphere, families, locate };
}
