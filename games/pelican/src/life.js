// Small living things that keep the frame moving: a loose flock of gulls circling over the beach (wings flap in
// the vertex shader, banked orbits are computed on the CPU) and a drift of blossom petals carried past the rider.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, rng } from './util.js';
import { prep, merge } from './geo.js';

// ---------------------------------------------------------------------------------------------
// Gull geometry. Faces +X, wings along +/-Z. Wing vertices carry `aSpan` (-1..1) used by the flap shader.
// ---------------------------------------------------------------------------------------------
function gullGeometry() {
  const parts = [];
  const white = '#f7f5f0';
  const part = (geo, color, span = 0) => {
    const g = prep(geo, color);
    g.setAttribute('aSpan', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(span), 1));
    return g;
  };

  // body, head, beak, eyes, tail
  const body = new THREE.SphereGeometry(1, 14, 10);
  body.scale(0.24, 0.062, 0.072);
  parts.push(part(body, (x, y) => (y < -0.012 ? '#e9e7e2' : white)));
  const head = new THREE.SphereGeometry(0.046, 12, 10);
  head.scale(1.12, 1, 0.95);
  head.translate(0.225, 0.03, 0);
  parts.push(part(head, white));
  const beak = new THREE.ConeGeometry(0.0145, 0.082, 8);
  beak.rotateZ(-Math.PI / 2);
  beak.translate(0.318, 0.02, 0);
  parts.push(part(beak, '#f1ae2b'));
  for (const s of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.0085, 6, 5);
    eye.translate(0.25, 0.043, 0.032 * s);
    parts.push(part(eye, '#15151a'));
  }
  // fan tail: a flat wedge (the material is double sided)
  {
    const fan = new THREE.BufferGeometry();
    fan.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          -0.15, 0.003, 0.03, // 0 root right
          -0.15, 0.003, -0.03, // 1 root left
          -0.34, 0.0, 0.07, // 2 tip right
          -0.37, 0.0, 0.0, // 3 tip centre
          -0.34, 0.0, -0.07, // 4 tip left
        ],
        3
      )
    );
    fan.setIndex([0, 3, 2, 0, 1, 3, 1, 4, 3]);
    fan.computeVertexNormals();
    parts.push(part(fan, white));
  }

  // wings: a swept, cambered strip per side
  const HALF = 0.62;
  const NU = 8;
  const NV = 3;
  for (const s of [-1, 1]) {
    const pos = [];
    const col = [];
    const spn = [];
    const idx = [];
    const top = new THREE.Color();
    const grey = new THREE.Color('#9aa4ae');
    const light = new THREE.Color('#e7e9ea');
    const dark = new THREE.Color('#1e1f24');
    for (let i = 0; i <= NU; i++) {
      const f = i / NU;
      const chord = lerp(0.2, 0.07, Math.pow(f, 0.9));
      const le = 0.075 - 0.17 * Math.pow(f, 1.7);
      // "M" profile: arm rises, hand drops slightly
      const lift = 0.05 * Math.sin(Math.min(f * 1.15, 1) * Math.PI * 0.62) - 0.03 * smoothstep(0.55, 1, f);
      for (let j = 0; j <= NV; j++) {
        const t = j / NV;
        const x = le - chord * t;
        const y = lift + 0.012 * Math.sin(Math.PI * t) * (1 - f * 0.6);
        pos.push(x, y, s * HALF * f);
        top.copy(grey).lerp(light, smoothstep(0.45, 1.0, t) * 0.8);
        top.lerp(dark, smoothstep(0.76, 0.9, f));
        col.push(top.r, top.g, top.b);
        spn.push(s * f);
      }
    }
    const W = NV + 1;
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NV; j++) {
        const k = i * W + j;
        // winding chosen so the upper face is the front face on both sides
        if (s > 0) idx.push(k, k + 1, k + W, k + 1, k + W + 1, k + W);
        else idx.push(k, k + W, k + 1, k + 1, k + W, k + W + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aSpan', new THREE.Float32BufferAttribute(spn, 1));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((NU + 1) * W * 2), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const ni = g.toNonIndexed();
    parts.push(ni);
  }
  return merge(parts);
}

function gullMaterial(U, T) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, side: THREE.DoubleSide });
  m.customProgramCacheKey = () => 'gull';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = T.uTime;
    sh.uniforms.uSunDirW = U.uSunDir;
    sh.uniforms.uSunCol = U.uSunColor;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aSpan;\nattribute float aPhase;\nvarying float vSpan;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vSpan = aSpan;
        float fs = abs(aSpan);
        if (fs > 0.001) {
          float gate = smoothstep(0.2, 0.7, 0.5 + 0.5 * sin(uTime * 0.31 + aPhase * 5.1));
          float beat = sin(uTime * 13.0 + aPhase * 6.2831 - fs * 1.4);
          float ang = beat * 0.62 * gate * (0.3 + 0.7 * fs) + (1.0 - gate) * 0.05 + 0.1;
          float ca = cos(ang);
          float sa = sin(ang);
          float az = abs(transformed.z);
          float y0 = transformed.y;
          transformed.y = y0 * ca + az * sa;
          transformed.z = sign(aSpan) * (az * ca - y0 * sa);
        }`
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSunDirW;\nuniform vec3 uSunCol;\nvarying float vSpan;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float tip = smoothstep(0.76, 0.9, abs(vSpan));
          if (!gl_FrontFacing && abs(vSpan) > 0.001) diffuseColor.rgb = mix(vec3(0.93, 0.93, 0.91), vec3(0.12, 0.12, 0.14), tip * 0.92);
        }`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 Ls = normalize(mat3(viewMatrix) * uSunDirW);
          float behind = max(dot(-normal, Ls), 0.0);
          totalEmissiveRadiance += diffuseColor.rgb * uSunCol * (0.08 + 0.55 * behind);
        }`
      );
  };
  return m;
}

// ---------------------------------------------------------------------------------------------
// Blossom petals: points tumbling through a wrapped box around the rider
// ---------------------------------------------------------------------------------------------
function buildPetals(U, renderer) {
  const N = 220;
  const R = rng(4242);
  const base = new Float32Array(N * 3);
  const rnd = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    base.set([R(), R(), R()], i * 3);
    rnd.set([R(), R(), R(), R()], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
  g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uTravel: { value: 0 },
      uHeight: { value: 720 },
      uSunColor: U.uSunColor,
      uMin: { value: new THREE.Vector3(-13, 0.25, -7.0) },
      uBox: { value: new THREE.Vector3(26, 5.0, 14) },
      uStrength: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aBase;
      attribute vec4 aRnd;
      uniform float uTime;
      uniform float uTravel;
      uniform float uHeight;
      uniform vec3 uMin;
      uniform vec3 uBox;
      varying float vAlpha;
      varying float vRot;
      varying float vFlip;
      varying float vTone;
      void main(){
        vec3 p = aBase * uBox;
        p.x -= uTravel;
        p += vec3(0.55, -0.16, 0.28) * uTime;
        p.x += sin(uTime * 0.9 + aRnd.x * 6.28) * 0.5;
        p.y += sin(uTime * 1.3 + aRnd.y * 6.28) * 0.3;
        p.z += cos(uTime * 0.7 + aRnd.z * 6.28) * 0.5;
        vec3 q = mod(p, uBox);
        vec3 e = q / uBox;
        float edge = smoothstep(0.0, 0.07, e.x) * smoothstep(1.0, 0.93, e.x) * smoothstep(0.0, 0.1, e.y) * smoothstep(1.0, 0.9, e.y) * smoothstep(0.0, 0.1, e.z) * smoothstep(1.0, 0.9, e.z);
        vec3 w = q + uMin;
        vec4 mv = modelViewMatrix * vec4(w, 1.0);
        float d = max(-mv.z, 0.01);
        float size = 0.07 + 0.07 * aRnd.w;
        gl_PointSize = clamp(size * projectionMatrix[1][1] * uHeight * 0.5 / d, 1.5, 48.0);
        gl_Position = projectionMatrix * mv;
        vAlpha = edge * smoothstep(0.7, 2.2, d) * (1.0 - smoothstep(25.0, 40.0, d));
        vRot = aRnd.x * 6.28 + uTime * (0.6 + aRnd.y);
        vFlip = uTime * (1.1 + aRnd.z * 1.4) + aRnd.w * 6.28;
        vTone = aRnd.y;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunColor;
      uniform float uStrength;
      varying float vAlpha;
      varying float vRot;
      varying float vFlip;
      varying float vTone;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float ca = cos(vRot);
        float sa = sin(vRot);
        c = mat2(ca, -sa, sa, ca) * c;
        float flip = max(abs(cos(vFlip)), 0.22);
        float d = length(vec2(c.x * 1.15, c.y / flip * 1.9));
        float a = smoothstep(0.5, 0.36, d) * vAlpha * uStrength;
        if (a < 0.01) discard;
        vec3 pink = mix(vec3(1.0, 0.62, 0.74), vec3(1.0, 0.9, 0.9), vTone);
        float shade = 0.75 + 0.25 * cos(vFlip);
        vec3 col = pink * shade * mix(vec3(0.8), uSunColor * 1.15, 0.5);
        gl_FragColor = vec4(col, a * 0.92);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  return {
    object: pts,
    update(time, travelled) {
      mat.uniforms.uTime.value = time;
      mat.uniforms.uTravel.value = travelled;
      mat.uniforms.uHeight.value = renderer ? renderer.getDrawingBufferSize(_sz).y : 720;
    },
    material: mat,
  };
}
const _sz = new THREE.Vector2();

// ---------------------------------------------------------------------------------------------
export function createLife({ scene, atmosphere, renderer }) {
  const U = atmosphere.U;
  const T = { uTime: { value: 0 } };
  const group = new THREE.Group();
  group.name = 'life';
  scene.add(group);

  // ----- gulls
  const geo = gullGeometry();
  const FLOCK = [
    // cx, cy, cz: orbit centre in rig space; rx, rz radii; speed m/s along the path; sign: turning direction.
    // Heights are low on purpose: the hero camera only sees a thin band of sky above the horizon.
    { cx: -8, cy: 3.8, cz: -14, rx: 7, rz: 5, v: 5.0, dir: 1 },
    { cx: -12, cy: 4.6, cz: -17, rx: 9, rz: 6.5, v: 5.6, dir: -1 },
    { cx: -3, cy: 3.2, cz: -11, rx: 6, rz: 4.5, v: 4.7, dir: 1 },
    { cx: -14, cy: 5.6, cz: -21, rx: 11, rz: 8, v: 6.2, dir: -1 },
    { cx: 3, cy: 6.8, cz: -24, rx: 15, rz: 9, v: 6.9, dir: 1 },
    { cx: 6, cy: 8.5, cz: -28, rx: 18, rz: 11, v: 7.4, dir: -1 },
    { cx: -18, cy: 5.2, cz: -19, rx: 12, rz: 8, v: 6.4, dir: 1 },
  ];
  const R = rng(99);
  const gulls = FLOCK.map((f, i) => ({
    ...f,
    phi0: R() * Math.PI * 2,
    bob: 0.4 + R() * 0.6,
    bobRate: 0.45 + R() * 0.4,
    s: 1.15 + R() * 0.3,
    omega: (f.v / ((f.rx + f.rz) * 0.5)) * f.dir,
  }));
  const phase = new Float32Array(gulls.length);
  gulls.forEach((g, i) => (phase[i] = R()));
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  const mesh = new THREE.InstancedMesh(geo, gullMaterial(U, T), gulls.length);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(mesh);

  const _p = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _s = new THREE.Vector3();
  const _e = new THREE.Euler();
  const _m = new THREE.Matrix4();
  const where = gulls.map(() => new THREE.Vector3());

  function placeGulls(time) {
    gulls.forEach((g, i) => {
      const phi = g.phi0 + g.omega * time;
      const x = g.cx + g.rx * Math.cos(phi);
      const z = g.cz + g.rz * Math.sin(phi);
      const bp = time * g.bobRate + g.phi0 * 3;
      const y = g.cy + g.bob * Math.sin(bp);
      const vx = -g.rx * g.omega * Math.sin(phi);
      const vz = g.rz * g.omega * Math.cos(phi);
      const vy = g.bob * g.bobRate * Math.cos(bp);
      const spd = Math.hypot(vx, vz) || 1;
      const yaw = Math.atan2(-vz, vx);
      const pitch = clamp(Math.atan2(vy, spd) * 1.3, -0.4, 0.4) + 0.04;
      const roll = Math.atan((1.7 * spd * Math.abs(g.omega)) / 9.8) * Math.sign(g.omega) * 1.0;
      _e.set(roll, yaw, pitch, 'YZX');
      _q.setFromEuler(_e);
      _p.set(x, y, z);
      _s.setScalar(g.s);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      where[i].set(x, y, z);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  // ----- petals
  const petals = buildPetals(U, renderer);
  group.add(petals.object);

  function update(travelled, time) {
    T.uTime.value = time;
    placeGulls(time);
    petals.update(time, travelled);
  }

  function setAtmosphere(name, p) {
    // petals stay readable but never glow at night
    petals.material.uniforms.uStrength.value = name === 'dusk' ? 0.85 : 1;
  }

  function locate(kind, nth = 0) {
    if (kind !== 'gull') return null;
    const w = where[nth % where.length];
    return { x: w.x, y: w.y, z: w.z };
  }

  return { group, update, setAtmosphere, locate, gulls, mesh, petals };
}
