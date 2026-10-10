// The pelican: torso, S-curved neck, head with bill + gular pouch, eyes, legs, wing-arms, feather fans, crest.
// Frames: rig space = bike space (+X forward, +Y up, +Z rider's right). Body frame: origin at the pelvis,
// +X toward the chest, +Y up the back, +Z right; it is pitched around Z by the animated body pitch.
import * as THREE from 'three';
import { clamp, lerp, deg, smoothstep, V, rng, curve1D, splinePoint, cap, superEllipse, Loft, solveTwoBone, basisQuat, canvasTexture } from './util.js';
import { makePlumage, makeFeatherTextures, featherGeometry, featherMaterial, FeatherSet } from './feathers.js';

const _c2 = new THREE.Color();
const _c3 = new THREE.Color();
const UP = V(0, 1, 0);
const Z_AXIS = V(0, 0, 1);
const QID = new THREE.Quaternion();

// ---------------------------------------------------------------------------------------------
// Small procedural textures
// ---------------------------------------------------------------------------------------------
function billGrooveTexture() {
  // fine longitudinal grooves across the girth of the bill (varies with u only)
  const r = rng(77);
  return canvasTexture(
    256,
    8,
    (ctx, w, h) => {
      ctx.fillStyle = '#8c8c8c';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) {
        const x = r() * w;
        ctx.fillStyle = r() < 0.5 ? `rgba(0,0,0,${0.08 + r() * 0.22})` : `rgba(255,255,255,${0.06 + r() * 0.18})`;
        ctx.fillRect(x, 0, 0.8 + r() * 1.8, h);
      }
    },
    { srgb: false }
  );
}

function legScaleTexture() {
  // scutes: horizontal bands along the tarsus
  return canvasTexture(
    32,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, w, h);
      const n = 7;
      for (let i = 0; i < n; i++) {
        const y = (i / n) * h;
        const g = ctx.createLinearGradient(0, y, 0, y + h / n);
        g.addColorStop(0, '#d0d0d0');
        g.addColorStop(0.8, '#808080');
        g.addColorStop(1, '#2a2a2a');
        ctx.fillStyle = g;
        ctx.fillRect(0, y, w, h / n);
      }
    },
    { srgb: false }
  );
}

function veinTexture() {
  const r = rng(31);
  return canvasTexture(512, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ffb078');
    g.addColorStop(0.5, '#ff9c80');
    g.addColorStop(1, '#ff8f7e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(${200 + r() * 55},${90 + r() * 60},${70 + r() * 50},${0.05 + r() * 0.08})`;
      ctx.beginPath();
      ctx.ellipse(r() * w, r() * h, 10 + r() * 36, 6 + r() * 20, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const vein = (x, y, ang, len, wd, depth) => {
      ctx.strokeStyle = `rgba(${150 + r() * 30},${44 + r() * 20},${46 + r() * 20},${0.3 + 0.25 * r()})`;
      ctx.lineWidth = wd;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      const steps = 12;
      let px = x;
      let py = y;
      let a = ang;
      for (let i = 0; i < steps; i++) {
        a += (r() - 0.5) * 0.45;
        px += Math.cos(a) * (len / steps);
        py += Math.sin(a) * (len / steps);
        ctx.lineTo(px, py);
        if (depth > 0 && r() < 0.16) vein(px, py, a + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.5), len * 0.45, wd * 0.62, depth - 1);
      }
      ctx.stroke();
    };
    for (let i = 0; i < 34; i++) vein(r() * w, -10 + r() * 40, Math.PI / 2 + (r() - 0.5) * 0.5, 220 + r() * 260, 1.4 + r() * 2.4, 2);
  });
}

// iris + pupil, designed for a planar projection onto the eye's front hemisphere
function irisTexture() {
  return canvasTexture(256, 256, (ctx, w) => {
    const cx = w / 2;
    ctx.fillStyle = '#f2eee4';
    ctx.fillRect(0, 0, w, w);
    const iris = ctx.createRadialGradient(cx, cx, 6, cx, cx, 104);
    iris.addColorStop(0, '#3a2210');
    iris.addColorStop(0.35, '#a65e18');
    iris.addColorStop(0.7, '#e8a233');
    iris.addColorStop(0.93, '#8a4a10');
    iris.addColorStop(1, '#2a1608');
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.arc(cx, cx, 104, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2;
      ctx.strokeStyle = `rgba(${i % 2 ? '255,222,150' : '60,28,6'},0.18)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 36, cx + Math.sin(a) * 36);
      ctx.lineTo(cx + Math.cos(a) * 100, cx + Math.sin(a) * 100);
      ctx.stroke();
    }
    ctx.fillStyle = '#07060a';
    ctx.beginPath();
    ctx.arc(cx, cx, 42, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Totipalmate (fully webbed) foot, modelled flat on the pedal. Foot frame: +X toes, +Y up, +Z outward (right foot).
function buildFoot(mat, webMat, clawMat) {
  const g = new THREE.Group();
  const O = [0.152, -0.086]; // outer toe tip   (shape-y is negated into +Z when rotated)
  const Mi = [0.2, 0.0]; // middle toe tip
  const I = [0.15, 0.074]; // inner toe tip
  const Hh = [0.098, 0.103]; // hallux tip
  const mid = (a, b, pull) => [(a[0] + b[0]) / 2 - pull, (a[1] + b[1]) / 2];
  const sh = new THREE.Shape();
  sh.moveTo(-0.03, 0);
  sh.quadraticCurveTo(0.03, -0.075, O[0], O[1]);
  let c = mid(O, Mi, 0.045);
  sh.quadraticCurveTo(c[0], c[1], Mi[0], Mi[1]);
  c = mid(Mi, I, 0.045);
  sh.quadraticCurveTo(c[0], c[1], I[0], I[1]);
  c = mid(I, Hh, 0.03);
  sh.quadraticCurveTo(c[0], c[1], Hh[0], Hh[1]);
  sh.quadraticCurveTo(0.03, 0.075, -0.03, 0);
  const webGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.0045, bevelEnabled: true, bevelThickness: 0.0016, bevelSize: 0.0016, bevelSegments: 2, curveSegments: 14 });
  webGeo.rotateX(-Math.PI / 2);
  webGeo.translate(0, 0.0016, 0);
  const web = new THREE.Mesh(webGeo, webMat);
  web.castShadow = true;
  web.receiveShadow = true;
  g.add(web);
  const toes = [
    [O, 0.0095],
    [Mi, 0.0105],
    [I, 0.0095],
    [Hh, 0.0082],
  ];
  for (const [tip, r] of toes) {
    const z = -tip[1];
    const curve = new THREE.CatmullRomCurve3([V(-0.004, 0.011, 0), V(tip[0] * 0.5, 0.0125, z * 0.5), V(tip[0] - 0.008, 0.0105, z * 0.97), V(tip[0] + 0.004, 0.0075, z)]);
    const geo = new THREE.TubeGeometry(curve, 14, r, 10, false);
    // taper toward the tip
    const p = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const segs = 14;
    const ring = 11;
    for (let i = 0; i <= segs; i++) {
      const k = 1 - 0.38 * (i / segs);
      const cpt = curve.getPointAt(i / segs);
      for (let j = 0; j < ring; j++) {
        const id = i * ring + j;
        p.setXYZ(id, cpt.x + (p.getX(id) - cpt.x) * k, cpt.y + (p.getY(id) - cpt.y) * k, cpt.z + (p.getZ(id) - cpt.z) * k);
      }
    }
    geo.computeVertexNormals();
    const toe = new THREE.Mesh(geo, mat);
    toe.castShadow = true;
    toe.receiveShadow = true;
    g.add(toe);
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.0046, 0.017, 8), clawMat);
    claw.position.set(tip[0] + 0.011, 0.0058, z * 1.0);
    claw.rotation.z = -Math.PI / 2 + 0.25;
    claw.rotation.y = Math.atan2(z, tip[0]) * -0.6;
    claw.castShadow = true;
    g.add(claw);
  }
  const heel = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat);
  heel.scale.set(0.036, 0.019, 0.036);
  heel.position.set(0.002, 0.0125, 0);
  heel.castShadow = true;
  g.add(heel);
  return g;
}

// ---------------------------------------------------------------------------------------------
export function createPelican(bike) {
  const group = new THREE.Group();
  group.name = 'pelican';

  const plumage = makePlumage();

  // ----- materials -----------------------------------------------------------------------
  const bodyMat = new THREE.MeshPhysicalMaterial({
    map: plumage.map,
    bumpMap: plumage.bump,
    bumpScale: 1.3,
    vertexColors: true,
    roughness: 0.84,
    sheen: 1,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(0xfff1de),
  });
  const headMat = bodyMat.clone();
  headMat.bumpScale = 0.7;

  const billTex = billGrooveTexture();
  const billMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.42,
    clearcoat: 0.7,
    clearcoatRoughness: 0.3,
    bumpMap: billTex,
    bumpScale: 0.35,
  });
  const veins = veinTexture();
  const pouchMat = new THREE.MeshPhysicalMaterial({
    map: veins,
    vertexColors: true,
    roughness: 0.48,
    clearcoat: 0.25,
    clearcoatRoughness: 0.5,
    sheen: 0.6,
    sheenColor: new THREE.Color(0xffc9b0),
    side: THREE.DoubleSide,
  });
  const skinMat = new THREE.MeshPhysicalMaterial({ color: 0xf59a4c, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.5 });
  const scaleTex = legScaleTexture();
  const legMat = new THREE.MeshPhysicalMaterial({
    color: 0xf08a34,
    roughness: 0.46,
    clearcoat: 0.3,
    clearcoatRoughness: 0.45,
    bumpMap: scaleTex,
    bumpScale: 0.8,
  });
  const webMat = new THREE.MeshPhysicalMaterial({ color: 0xf3a443, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.5 });
  const clawMat = new THREE.MeshStandardMaterial({ color: 0x3b2c24, roughness: 0.5 });
  const gloveMat = new THREE.MeshPhysicalMaterial({ color: 0x1d2026, roughness: 0.55, sheen: 0.7, sheenColor: new THREE.Color(0x7d8cab), sheenRoughness: 0.4 });

  const M = (geo, mat, parent, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  };

  // ----- feather sets ---------------------------------------------------------------------
  const ftex = makeFeatherTextures();
  const gFlight = featherGeometry({ curl: 0.1, cup: 0.045 });
  const gCovert = featherGeometry({ curl: 0.15, cup: 0.07, sy: 6 });
  const gPlume = featherGeometry({ curl: 0.22, cup: 0.05, sy: 8 });
  const wingSet = new FeatherSet(gFlight, featherMaterial(ftex.flight), 96);
  const covertSet = new FeatherSet(gCovert, featherMaterial(ftex.covert), 72);
  const plumeSet = new FeatherSet(gPlume, featherMaterial(ftex.plume), 64);
  group.add(wingSet.mesh, covertSet.mesh, plumeSet.mesh);
  const _fq = new THREE.Quaternion();
  const ZERO = V();
  function put(set, idx, root, dir, nrm, len, wid) {
    basisQuat(dir, nrm, _fq);
    set.set(idx, root, _fq, wid, len);
  }

  // ----- body frame ----------------------------------------------------------------------
  const body = new THREE.Group();
  group.add(body);

  const TORSO = {
    x0: -0.4,
    x1: 0.41,
    w: curve1D([[0, 0], [0.04, 0.06], [0.14, 0.135], [0.3, 0.185], [0.5, 0.217], [0.65, 0.226], [0.8, 0.2], [0.92, 0.14], [1, 0]]),
    h: curve1D([[0, 0], [0.04, 0.05], [0.14, 0.095], [0.3, 0.14], [0.5, 0.18], [0.65, 0.2], [0.8, 0.205], [0.92, 0.16], [1, 0]]),
    cy: curve1D([[0, 0.14], [0.3, 0.165], [0.6, 0.205], [1, 0.27]]),
  };
  const torsoPts = [];
  const TN = 64;
  for (let i = 0; i < TN; i++) torsoPts.push(V(lerp(TORSO.x0, TORSO.x1, i / (TN - 1)), 0, 0));
  const torsoLoft = new Loft({
    stations: TN,
    radial: 48,
    uvRepeat: [10, 6.5],
    section: (t, a, out) => {
      const k = cap(t, 0.06);
      superEllipse(a, 2.35, out);
      const low = out.y < 0;
      out.x *= TORSO.w(t) * k * 1.08;
      out.y = out.y * TORSO.h(t) * k * 1.08 * (low ? 0.94 : 1) + TORSO.cy(t);
    },
    color: (t, a, c) => {
      const s = Math.sin(a);
      const belly = smoothstep(0.2, -0.95, s);
      c.setRGB(1, 1, 1);
      c.lerp(_c2.setRGB(0.8, 0.78, 0.78), belly * 0.55);
      c.lerp(_c2.set('#fff0cf'), smoothstep(0.55, 0.95, t) * 0.5 * (1 - belly));
    },
  });
  torsoLoft.update(torsoPts, V(0, 0, 1));
  const torso = M(torsoLoft.geometry, bodyMat, body);

  // ----- neck ----------------------------------------------------------------------------
  const NECK_N = 44;
  const neckProfileZ = curve1D([[0, 0.12], [0.15, 0.095], [0.4, 0.074], [0.7, 0.062], [0.92, 0.058], [1, 0.058]]);
  const neckProfileN = curve1D([[0, 0.11], [0.15, 0.088], [0.4, 0.068], [0.7, 0.056], [0.92, 0.054], [1, 0.054]]);
  const neckLoft = new Loft({
    stations: NECK_N,
    radial: 32,
    uvRepeat: [5, 9],
    section: (t, a, out) => {
      superEllipse(a, 2.1, out);
      out.x *= neckProfileZ(t);
      out.y *= neckProfileN(t);
    },
    color: (t, a, c) => {
      const s = Math.sin(a);
      c.setRGB(1, 1, 1);
      c.lerp(_c2.setRGB(0.88, 0.86, 0.84), smoothstep(0.2, -0.9, s) * 0.4 * (1 - t));
      c.lerp(_c2.set('#fff0d4'), smoothstep(0.1, 0.9, t) * 0.3);
    },
  });
  const neck = M(neckLoft.geometry, bodyMat, group);
  neck.frustumCulled = false;

  // ----- head (head frame: origin at the head centre, +X toward the bill, +Y up, +Z right) ------
  const head = new THREE.Group();
  group.add(head);

  const HEAD_X0 = -0.1;
  const HEAD_X1 = 0.086;
  const headW = curve1D([[0, 0], [0.1, 0.038], [0.3, 0.064], [0.55, 0.07], [0.8, 0.056], [0.94, 0.038], [1, 0]]);
  const headH = curve1D([[0, 0], [0.1, 0.044], [0.3, 0.07], [0.55, 0.076], [0.8, 0.06], [0.94, 0.036], [1, 0]]);
  const headPts = [];
  const HN = 36;
  for (let i = 0; i < HN; i++) headPts.push(V(lerp(HEAD_X0, HEAD_X1, i / (HN - 1)), 0.004, 0));
  const headLoft = new Loft({
    stations: HN,
    radial: 32,
    uvRepeat: [7, 4],
    section: (t, a, out) => {
      const k = cap(t, 0.08);
      superEllipse(a, 2.2, out);
      out.x *= headW(t) * k;
      out.y *= headH(t) * k * (out.y < 0 ? 0.9 : 1);
    },
    color: (t, a, c) => {
      const s = Math.sin(a);
      const skin = smoothstep(0.7, 0.98, t) * (0.4 + 0.6 * smoothstep(0.35, -0.6, s));
      c.setRGB(1, 1, 1);
      c.lerp(_c2.set('#fff1d6'), smoothstep(0.1, 0.9, t) * 0.3);
      c.lerp(_c2.set('#f6a455'), skin);
    },
  });
  headLoft.update(headPts, V(0, 0, 1));
  M(headLoft.geometry, headMat, head);

  // ---- upper mandible
  const BILL_N = 54;
  const BILL_X0 = 0.03;
  const BILL_LEN = 0.47;
  const billW = curve1D([[0, 0.058], [0.12, 0.06], [0.45, 0.052], [0.75, 0.037], [0.93, 0.02], [1, 0.0035]]);
  const billTop = curve1D([[0, 0.032], [0.2, 0.027], [0.5, 0.0175], [0.8, 0.011], [1, 0.0045]]);
  const billBot = curve1D([[0, 0.015], [0.5, 0.009], [1, 0.0035]]);
  const billY = (t) => -0.006 * t - 0.085 * Math.pow(smoothstep(0.7, 1, t), 2.2);
  const billPts = [];
  for (let i = 0; i < BILL_N; i++) {
    const t = i / (BILL_N - 1);
    billPts.push(V(BILL_X0 + BILL_LEN * t, billY(t), 0));
  }
  const billLoft = new Loft({
    stations: BILL_N,
    radial: 32,
    uvRepeat: [1, 1],
    section: (t, a, out) => {
      const k = cap(t, 0.012);
      const c = Math.cos(a);
      const s = Math.sin(a);
      const w = billW(t) * k;
      if (s >= 0) {
        const e = Math.pow(s, 0.8);
        out.x = Math.sign(c) * Math.pow(Math.abs(c), 0.9) * w;
        out.y = e * (billTop(t) + 0.0045 * Math.exp(-Math.pow(out.x / (w * 0.32 + 1e-5), 2)) * (1 - t * 0.8)) * k;
      } else {
        out.x = Math.sign(c) * Math.pow(Math.abs(c), 0.75) * w * 0.96;
        out.y = -Math.pow(-s, 0.7) * billBot(t) * k;
      }
    },
    color: (t, a, c) => {
      const s = Math.sin(a);
      c.set('#ee7f1c');
      c.lerp(_c2.set('#ffc247'), smoothstep(0.5, 1, s) * 0.8); // yellow ridge on top
      c.lerp(_c2.set('#e8541a'), smoothstep(0.05, -0.7, s) * 0.3);
      c.lerp(_c2.set('#6b3a14'), smoothstep(0.9, 0.975, t)); // nail
    },
  });
  billLoft.update(billPts, V(0, 0, 1));
  const bill = M(billLoft.geometry, billMat, head);

  // ---- lower mandible + gular pouch (rebuilt every frame so it can slosh)
  const POUCH_N = 40;
  const POUCH_X0 = -0.08;
  const POUCH_X1 = BILL_X0 + BILL_LEN * 0.95;
  const pouchW = curve1D([[0, 0.036], [0.12, 0.052], [0.4, 0.058], [0.7, 0.041], [0.92, 0.02], [1, 0.004]]);
  const pouchD = curve1D([[0, 0.016], [0.15, 0.046], [0.38, 0.066], [0.62, 0.05], [0.84, 0.02], [1, 0.0035]]);
  const pouchState = { sag: 1, vel: 0, wob: 0 };
  const pouchPts = [];
  for (let i = 0; i < POUCH_N; i++) pouchPts.push(V());
  const pouchLoft = new Loft({
    stations: POUCH_N,
    radial: 28,
    uvRepeat: [1, 1],
    section: (t, a, out) => {
      const k = cap(t, 0.02);
      const c = Math.cos(a);
      const s = Math.sin(a);
      const w = pouchW(t) * k;
      if (s >= 0) {
        out.x = c * w;
        out.y = s * 0.004 * k;
      } else {
        const d = pouchD(t) * pouchState.sag * (1 + 0.1 * pouchState.wob * Math.sin(t * 7 + 1.3));
        out.x = c * w * (1 + 0.08 * Math.min(1, -s) * Math.sin(t * Math.PI));
        out.y = s * (0.004 + d) * k;
      }
    },
    color: (t, a, c) => {
      const s = Math.sin(a);
      c.set('#ffb38c');
      c.lerp(_c2.set('#ffc65a'), smoothstep(-0.55, 0.3, s) * 0.75);
      c.lerp(_c2.set('#ff9a85'), smoothstep(0.0, 0.7, t) * 0.4);
    },
  });
  const pouch = M(pouchLoft.geometry, pouchMat, head);
  pouch.frustumCulled = false;
  function updatePouch() {
    for (let i = 0; i < POUCH_N; i++) {
      const t = i / (POUCH_N - 1);
      const x = lerp(POUCH_X0, POUCH_X1, t);
      const bt = clamp((x - BILL_X0) / BILL_LEN, 0, 1);
      pouchPts[i].set(x, billY(bt) - billBot(bt) * 0.98 - 0.0015 + (1 - smoothstep(0, 0.2, t)) * -0.006, 0);
    }
    pouchLoft.update(pouchPts, V(0, 0, 1));
  }
  updatePouch();

  // ---- nostril slits
  for (const s of [-1, 1]) {
    const n = M(new THREE.SphereGeometry(0.0062, 10, 8), new THREE.MeshStandardMaterial({ color: 0x4a2a10, roughness: 0.6 }), head, false);
    n.scale.set(2.6, 0.35, 0.7);
    n.position.set(0.105, billY(0.12) + billTop(0.12) * 0.55, 0.022 * s);
    n.rotation.z = -0.1;
  }

  // ---- eyes
  const irisTex = irisTexture();
  const EYE_R = 0.0245;
  const eyeGeo = new THREE.SphereGeometry(EYE_R, 28, 20);
  {
    const p = eyeGeo.attributes.position;
    const uv = eyeGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + (p.getX(i) / EYE_R) * 0.5, 0.5 + (p.getY(i) / EYE_R) * 0.5);
  }
  const eyeMat = new THREE.MeshPhysicalMaterial({ map: irisTex, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02 });
  const eyes = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(0.03, 0.019, 0.05 * s);
    // local +Z is the gaze: outward and a little forward
    eye.rotation.y = s > 0 ? deg(36) : deg(180 - 36);
    head.add(eye);
    const ball = M(eyeGeo, eyeMat, eye, false);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.0031, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    glint.position.set(0.0078, 0.0094, 0.0205);
    eye.add(glint);
    const ring = M(new THREE.TorusGeometry(EYE_R * 0.97, 0.0068, 10, 36), skinMat, eye, false);
    ring.position.z = 0.0095;
    ring.scale.set(1, 1, 0.8);
    eyes.push({ eye, ball, glint, ring });
  }

  // ----- crest (nape plumes) --------------------------------------------------------------
  const crest = [];
  for (let i = 0; i < 9; i++) {
    const k = i / 8 - 0.5;
    const idx = plumeSet.push();
    plumeSet.set(idx, ZERO, QID, 0.02, 0.1, 0xfffaf0);
    crest.push({ idx, z: k * 0.07, x: -0.052 - 0.012 * (1 - Math.abs(k) * 2), y: 0.052 - Math.abs(k) * 0.02, len: 0.17 - Math.abs(k) * 0.07, wid: 0.026, ph: i * 1.7 });
  }

  // ----- scarf: a chunky neck roll, a knot and two verlet ribbons streaming in the wind ----------
  const scarfTex = canvasTexture(512, 64, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#f05d4e');
    g.addColorStop(1, '#d93f3c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      ctx.fillStyle = `rgba(255,255,255,${0.02 + 0.025 * ((y / 2) % 2)})`;
      ctx.fillRect(0, y, w, 1);
    }
    for (let x = 0; x < w; x += 3) {
      ctx.fillStyle = 'rgba(90,10,10,0.05)';
      ctx.fillRect(x, 0, 1, h);
    }
    ctx.fillStyle = '#fff1dc';
    for (const x0 of [0.78, 0.845, 0.91]) ctx.fillRect(x0 * w, 0, 0.026 * w, h);
    ctx.fillStyle = 'rgba(90,10,10,0.35)';
    ctx.fillRect(w - 5, 0, 5, h);
  });
  const ringTex = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#e8503f';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff1dc';
    for (const y of [0.18, 0.5, 0.82]) ctx.fillRect(0, y * h - 3, w, 6);
    for (let x = 0; x < w; x += 3) {
      ctx.fillStyle = 'rgba(90,10,10,0.05)';
      ctx.fillRect(x, 0, 1, h);
    }
  });
  ringTex.wrapS = ringTex.wrapT = THREE.RepeatWrapping;
  // A pale sheen lobe bleaches a red fabric to peach whenever it is backlit by the low sun, so the sheen is kept
  // faint and tinted to the cloth colour: it softens the grazing edges without washing the stripes out.
  const scarfMat = new THREE.MeshPhysicalMaterial({
    map: scarfTex,
    roughness: 0.74,
    sheen: 0.22,
    sheenColor: new THREE.Color(0xff5a40),
    sheenRoughness: 0.5,
    side: THREE.DoubleSide,
  });
  const ringMat = scarfMat.clone();
  ringMat.map = ringTex;
  const ring = M(new THREE.TorusGeometry(0.108, 0.03, 18, 56), ringMat, group);
  ring.frustumCulled = false;
  const knot = M(new THREE.SphereGeometry(0.037, 18, 14), ringMat, group);
  knot.scale.set(1.15, 1, 0.95);
  const SC_N = 22;
  function makeTail(length, width, side, phase) {
    const N = SC_N;
    const pos = new Float32Array(N * 2 * 3);
    const nor = new Float32Array(N * 2 * 3);
    const uv = new Float32Array(N * 2 * 2);
    const idx = [];
    for (let i = 0; i < N; i++) {
      uv[i * 4] = i / (N - 1);
      uv[i * 4 + 1] = 0;
      uv[i * 4 + 2] = i / (N - 1);
      uv[i * 4 + 3] = 1;
    }
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const mesh = M(geo, scarfMat, group);
    mesh.frustumCulled = false;
    return {
      geo,
      pos,
      nor,
      N,
      width,
      side,
      phase,
      seg: length / (N - 1),
      init: false,
      p: Array.from({ length: N }, () => V()),
      q: Array.from({ length: N }, () => V()),
    };
  }
  const scarfTails = [makeTail(0.95, 0.105, 1, 0), makeTail(0.72, 0.09, -1, 2.1)];
  const _bodyInv = new THREE.Matrix4();

  // ----- legs -------------------------------------------------------------------------------
  const L1 = 0.45;
  const L2 = 0.4;
  const legs = [-1, 1].map((s) => {
    const thighLoft = new Loft({
      stations: 14,
      radial: 22,
      uvRepeat: [5, 2.5],
      section: (t, a, out) => {
        const k = cap(t, 0.2);
        const r = lerp(0.092, 0.036, Math.pow(t, 0.85));
        superEllipse(a, 2, out);
        out.x *= r * k;
        out.y *= r * k * 1.04;
      },
      color: (t, a, c) => {
        c.setRGB(1, 1, 1);
        c.lerp(_c2.setRGB(0.88, 0.86, 0.84), smoothstep(0.3, 1, t) * 0.3);
      },
    });
    const thigh = M(thighLoft.geometry, bodyMat, group);
    thigh.frustumCulled = false;
    const shankLoft = new Loft({
      stations: 26,
      radial: 14,
      uvRepeat: [1, 7],
      section: (t, a, out) => {
        const k = cap(t, 0.05);
        const r = lerp(0.0125, 0.0088, t);
        out.x = Math.cos(a) * r * 0.86 * k;
        out.y = Math.sin(a) * r * 1.12 * k;
      },
    });
    const shank = M(shankLoft.geometry, legMat, group);
    shank.frustumCulled = false;
    const knee = M(new THREE.SphereGeometry(0.0145, 18, 14), legMat, group);
    const foot = buildFoot(legMat, webMat, clawMat);
    foot.scale.z = s;
    group.add(foot);
    const ruffle = [];
    for (let i = 0; i < 9; i++) {
      const idx = plumeSet.push();
      plumeSet.set(idx, ZERO, QID, 0.04, 0.09, 0xfffaf2);
      ruffle.push({ idx, ang: (i / 9) * Math.PI * 2, len: 0.06 + (0.025 * ((i * 7) % 5)) / 4, ph: i * 2.3 });
    }
    return {
      s,
      thighLoft,
      shankLoft,
      thigh,
      shank,
      knee,
      foot,
      ruffle,
      H: V(),
      K: V(),
      Fend: V(),
      T: V(),
      P55: V(),
      thighPts: Array.from({ length: 14 }, () => V()),
      shankCtrl: [V(), V(), V()],
      shankPts: Array.from({ length: 26 }, () => V()),
    };
  });

  // ----- wings (arms) ------------------------------------------------------------------------
  const A1 = 0.29;
  const A2 = 0.29;
  function armLoft(r0, r1) {
    return new Loft({
      stations: 14,
      radial: 20,
      uvRepeat: [3, 2],
      section: (t, a, out) => {
        const k = cap(t, 0.14);
        const r = lerp(r0, r1, t);
        superEllipse(a, 2, out);
        out.x *= r * k;
        out.y *= r * k;
      },
      color: (t, a, c) => {
        c.setRGB(1, 1, 1);
      },
    });
  }
  const wings = [-1, 1].map((s) => {
    const upperLoft = armLoft(0.054, 0.042);
    const foreLoft = armLoft(0.042, 0.03);
    const upper = M(upperLoft.geometry, bodyMat, group);
    const fore = M(foreLoft.geometry, bodyMat, group);
    upper.frustumCulled = fore.frustumCulled = false;
    const elbow = M(new THREE.SphereGeometry(0.042, 20, 16), bodyMat, group);
    const glove = M(new THREE.CapsuleGeometry(0.0335, 0.1, 6, 18), gloveMat, group);
    // tiny dark fingertips curling round the grip
    const list = [];
    const add = (set, seg, u, len, wid, color, o = {}) => {
      const idx = set.push();
      set.set(idx, ZERO, QID, wid, len, color);
      list.push({ set, idx, seg, u, len, wid, lift: o.lift ?? 0.012, fan: o.fan ?? 0, amp: o.amp ?? 1, ph: list.length * 1.913 + s });
    };
    // upper arm: long white scapulars + short coverts
    for (let i = 0; i < 7; i++) add(wingSet, 0, 0.06 + (0.88 * i) / 6, 0.36 - 0.018 * i, 0.092, 0xf9f5ed, { lift: 0.016, fan: 0.1 - 0.02 * i });
    for (let i = 0; i < 7; i++) add(covertSet, 0, 0.03 + (0.94 * i) / 6, 0.2 - 0.01 * i, 0.088, 0xffffff, { lift: 0.04, fan: 0.05 - 0.01 * i });
    // forearm: black secondaries with white coverts on top
    for (let i = 0; i < 9; i++) add(wingSet, 1, 0.03 + (0.94 * i) / 8, 0.46 - 0.018 * i, 0.074, 0x23262d, { lift: 0.012, fan: 0.12 - 0.015 * i });
    for (let i = 0; i < 8; i++) add(covertSet, 1, 0.05 + (0.9 * i) / 7, 0.23, 0.082, 0xfbf8f1, { lift: 0.036 });
    // hand: black primaries fanned out, with pale coverts
    for (let i = 0; i < 9; i++) add(wingSet, 2, i / 8, 0.56 - 0.027 * i, 0.062, 0x15171b, { lift: 0.012, fan: -0.1 + (i / 8) * 0.5, amp: 1.6 });
    for (let i = 0; i < 5; i++) add(covertSet, 2, i / 4, 0.16, 0.07, 0xe9e5de, { lift: 0.032, fan: (i / 4) * 0.3 });
    return {
      s,
      upperLoft,
      foreLoft,
      upper,
      fore,
      elbow,
      glove,
      list,
      S: V(),
      E: V(),
      W: V(),
      Wr: V(),
      G: V(),
      Hend: V(),
      upperPts: Array.from({ length: 14 }, () => V()),
      forePts: Array.from({ length: 14 }, () => V()),
    };
  });

  // ----- tail fan ----------------------------------------------------------------------------
  const tail = [];
  for (let layer = 0; layer < 2; layer++) {
    const n = layer ? 7 : 11;
    for (let i = 0; i < n; i++) {
      const phi = lerp(-0.34, 0.34, i / (n - 1)) * (layer ? 0.85 : 1);
      const idx = wingSet.push();
      wingSet.set(idx, ZERO, QID, 0.07, 0.3, layer ? 0xcfcbc6 : 0xf0ede8);
      tail.push({ idx, phi, layer, len: (0.26 + 0.07 * Math.cos(phi * 2.6)) * (layer ? 0.88 : 1), wid: 0.066, ph: i * 1.31 + layer });
    }
  }

  // ----- animation state ---------------------------------------------------------------------
  const pelvis = V();
  let bodyPitch = deg(12);
  const tmp = { a: V(), b: V(), c: V(), d: V(), n: V(), root: V(), dir: V(), nrm: V() };
  const headState = { yaw: 0, pitch: -0.1, blink: 0, nextBlink: 2.5, blinkT: -1 };
  const neckCtrl = [V(), V(), V(), V(), V()];
  const NECK_LOCAL = [
    [0.26, 0.27, 1],
    [0.5, 0.38, 0.85],
    [0.44, 0.55, 0.55],
    [0.5, 0.69, 0.25],
    [0.58, 0.78, 0.0],
  ];
  const _m4 = new THREE.Matrix4();
  const _hx = V();
  const _hy = V();
  const _hz = V();
  const headDir = V(1, -0.1, 0).normalize();
  const neckPts = Array.from({ length: NECK_N }, () => V());
  const wind = V();

  function bodyToRig(x, y, z, out) {
    return out.set(x, y, z).applyMatrix4(body.matrix);
  }

  // push a point out of the torso ellipsoid (keeps the scarf from sinking into the back)
  function collideBody(p) {
    tmp.d.copy(p).applyMatrix4(_bodyInv);
    const t = (tmp.d.x - TORSO.x0) / (TORSO.x1 - TORSO.x0);
    if (t <= 0.03 || t >= 0.97) return;
    const w = TORSO.w(t) * 1.08 + 0.03;
    const hh = TORSO.h(t) * 1.08 + 0.03;
    const cy = TORSO.cy(t);
    const yy = (tmp.d.y - cy) / hh;
    const zz = tmp.d.z / w;
    const v = yy * yy + zz * zz;
    if (v < 1) {
      const k = 1 / Math.sqrt(Math.max(v, 1e-4));
      tmp.d.y = cy + (tmp.d.y - cy) * k;
      tmp.d.z *= k;
      p.copy(tmp.d).applyMatrix4(body.matrix);
    }
  }

  function updateScarfTail(T, anchor, dt, time, windK) {
    const N = T.N;
    if (!T.init) {
      for (let i = 0; i < N; i++) {
        T.p[i].set(anchor.x - T.seg * i, anchor.y - 0.01 * i, anchor.z + T.side * 0.01 * i);
        T.q[i].copy(T.p[i]);
      }
      T.init = true;
    }
    const h = 1 / 120;
    const steps = clamp(Math.round(dt / h), 1, 4);
    for (let s = 0; s < steps; s++) {
      for (let i = 1; i < N; i++) {
        const u = i / (N - 1);
        const p = T.p[i];
        const q = T.q[i];
        tmp.a.subVectors(p, q).multiplyScalar(0.986);
        q.copy(p);
        p.add(tmp.a);
        // the apparent wind pushes the ribbon back and lifts it; waves travel down its length
        const ax = -15 * windK;
        const ay = -1.5 + (Math.sin(time * 8.2 - i * 0.55 + T.phase) * 6 + 6.5) * windK * (0.4 + 0.6 * u);
        const az = (Math.sin(time * 6.4 - i * 0.72 + T.phase * 1.7) * 6 + T.side * 3.2) * windK * u;
        p.x += ax * h * h;
        p.y += ay * h * h;
        p.z += az * h * h;
      }
      T.p[0].copy(anchor);
      for (let it = 0; it < 5; it++) {
        for (let i = 0; i < N - 1; i++) {
          const a = T.p[i];
          const b = T.p[i + 1];
          tmp.b.subVectors(b, a);
          const d = tmp.b.length() || 1e-6;
          const diff = (d - T.seg) / d;
          if (i === 0) b.addScaledVector(tmp.b, -diff);
          else {
            a.addScaledVector(tmp.b, diff * 0.5);
            b.addScaledVector(tmp.b, -diff * 0.5);
          }
        }
        T.p[0].copy(anchor);
      }
      for (let i = 2; i < N; i++) collideBody(T.p[i]);
    }
    // ribbon mesh: width stays mostly vertical, twisting as it flutters
    for (let i = 0; i < N; i++) {
      const a = T.p[Math.max(0, i - 1)];
      const b = T.p[Math.min(N - 1, i + 1)];
      tmp.a.subVectors(b, a).normalize();
      tmp.b.set(0, 1, 0).addScaledVector(tmp.a, -tmp.a.y);
      if (tmp.b.lengthSq() < 1e-6) tmp.b.set(0, 0, 1);
      tmp.b.normalize();
      const u = i / (N - 1);
      const tw = (0.55 * Math.sin(time * 4.6 - i * 0.5 + T.phase) + 0.25 * T.side) * Math.min(1, u * 3);
      tmp.c.crossVectors(tmp.a, tmp.b);
      tmp.n.copy(tmp.b).multiplyScalar(Math.cos(tw)).addScaledVector(tmp.c, Math.sin(tw));
      const half = 0.5 * T.width * (0.55 + 0.45 * smoothstep(0, 0.18, u)) * (1 - 0.14 * smoothstep(0.7, 1, u));
      const P = T.p[i];
      const k = i * 6;
      T.pos[k] = P.x + tmp.n.x * half;
      T.pos[k + 1] = P.y + tmp.n.y * half;
      T.pos[k + 2] = P.z + tmp.n.z * half;
      T.pos[k + 3] = P.x - tmp.n.x * half;
      T.pos[k + 4] = P.y - tmp.n.y * half;
      T.pos[k + 5] = P.z - tmp.n.z * half;
      tmp.c.crossVectors(tmp.a, tmp.n);
      T.nor[k] = T.nor[k + 3] = tmp.c.x;
      T.nor[k + 1] = T.nor[k + 4] = tmp.c.y;
      T.nor[k + 2] = T.nor[k + 5] = tmp.c.z;
    }
    T.geo.attributes.position.needsUpdate = true;
    T.geo.attributes.normal.needsUpdate = true;
  }
  function frameQuat(xAxis, yHint, out) {
    _hx.copy(xAxis).normalize();
    _hz.crossVectors(_hx, yHint).normalize();
    _hy.crossVectors(_hz, _hx);
    return out.setFromRotationMatrix(_m4.makeBasis(_hx, _hy, _hz));
  }

  function update(dt, time, ctx = {}) {
    const speed = ctx.speed ?? 4.5;
    const windK = clamp(speed / 4.5, 0, 1.35);
    const crank = bike.crankAngle;
    // trailing direction for loose feathers: streams back with the apparent wind, droops with gravity
    wind.set(-windK, -(0.16 + 0.9 * Math.max(0, 1 - windK)), 0).normalize();

    // --- body
    const bob = Math.sin(crank * 2) * 0.007 * Math.min(1, windK * 1.2);
    const sway = Math.sin(crank) * 0.01;
    bodyPitch = deg(12) + Math.sin(crank * 2 + 0.7) * 0.012 + Math.sin(time * 1.3) * 0.004;
    pelvis.set(bike.anchors.saddle.x, bike.anchors.saddle.y - 0.03 + bob, sway);
    body.position.copy(pelvis);
    body.rotation.set(0, 0, bodyPitch);
    body.updateMatrix();
    const breathe = 1 + Math.sin(time * 1.9) * 0.006;
    torso.scale.set(1, breathe, breathe);

    // --- head look-at (camera) + neck
    const cam = ctx.camera;
    let yawT = 0;
    let pitchT = -0.1;
    if (cam) {
      tmp.a.subVectors(cam.position, head.position);
      const az = Math.atan2(tmp.a.z, tmp.a.x);
      const horiz = Math.hypot(tmp.a.x, tmp.a.z);
      const wgt = smoothstep(2.5, 1.3, Math.abs(az)) * smoothstep(0.6, 1.4, horiz);
      yawT = clamp(az, -0.36, 0.36) * wgt;
      pitchT = -0.1 + clamp(Math.atan2(tmp.a.y, horiz), -0.5, 0.5) * 0.3 * wgt;
    }
    const k = 1 - Math.exp(-Math.max(dt, 1 / 120) * 3);
    headState.yaw += (yawT - headState.yaw) * k;
    headState.pitch += (pitchT - headState.pitch) * k;
    const yaw = headState.yaw + Math.sin(time * 0.9) * 0.025;
    const pit = headState.pitch + Math.sin(crank * 2 + 1.2) * 0.012;
    headDir.set(Math.cos(pit) * Math.cos(yaw), Math.sin(pit), Math.cos(pit) * Math.sin(yaw));
    for (let i = 0; i < NECK_LOCAL.length; i++) {
      const [x, y, kk] = NECK_LOCAL[i];
      const a = bodyPitch * kk;
      const sw = Math.sin(time * 1.4 + i * 0.9) * 0.006 * (i > 0 ? 1 : 0);
      neckCtrl[i].set(pelvis.x + x * Math.cos(a) - y * Math.sin(a) + sw, pelvis.y + x * Math.sin(a) + y * Math.cos(a), pelvis.z + yaw * 0.12 * (i / 4));
    }
    const roll = Math.sin(time * 0.7) * 0.03 + sway * 1.5;
    tmp.a.set(-Math.sin(roll) * 0, 1, Math.sin(roll)).normalize();
    frameQuat(headDir, tmp.a, head.quaternion);
    head.position.copy(neckCtrl[4]).addScaledVector(headDir, 0.062);
    neckCtrl[4].copy(head.position).addScaledVector(headDir, -0.078).addScaledVector(UP, -0.014);
    for (let i = 0; i < NECK_N; i++) splinePoint(neckCtrl, i / (NECK_N - 1), neckPts[i]);
    neckLoft.update(neckPts, tmp.b.set(0, 0, 1));

    // --- scarf (roll around the lower neck, knot at the front-right, two ribbons)
    {
      const ci = Math.round(0.15 * (NECK_N - 1));
      tmp.a.subVectors(neckPts[ci + 1], neckPts[ci - 1]).normalize(); // neck axis
      ring.position.copy(neckPts[ci]);
      ring.quaternion.setFromUnitVectors(Z_AXIS, tmp.a);
      tmp.b.crossVectors(tmp.a, Z_AXIS).normalize(); // front of the neck
      knot.position.copy(neckPts[ci]).addScaledVector(tmp.b, 0.1).addScaledVector(Z_AXIS, 0.07).addScaledVector(tmp.a, -0.01);
      _bodyInv.copy(body.matrix).invert();
      tmp.root.copy(knot.position).addScaledVector(Z_AXIS, 0.01);
      updateScarfTail(scarfTails[0], tmp.root, dt, time, windK);
      tmp.root.copy(knot.position).addScaledVector(Z_AXIS, -0.012).addScaledVector(UP, -0.02);
      updateScarfTail(scarfTails[1], tmp.root, dt, time, windK);
    }

    // --- blink
    headState.nextBlink -= dt;
    if (headState.nextBlink <= 0 && headState.blinkT < 0) {
      headState.blinkT = 0;
      headState.nextBlink = 2.4 + ((Math.sin(time * 12.9898) * 43758.5453) % 1 + 1) * 1.8;
    }
    let blink = 0;
    if (headState.blinkT >= 0) {
      headState.blinkT += dt;
      const bt = headState.blinkT / 0.16;
      blink = bt >= 1 ? 0 : Math.sin(bt * Math.PI);
      if (bt >= 1) headState.blinkT = -1;
    }
    for (const e of eyes) e.ball.scale.y = e.glint.scale.y = 1 - 0.92 * blink;
    for (const e of eyes) e.ring.scale.y = 1 - 0.1 * blink;

    // --- pouch slosh: damped spring driven by the pedalling bob
    const omega = 2 * Math.PI * 0.21 * speed * 2;
    const drive = -Math.sin(crank * 2) * omega * omega * 0.007 * 0.8 + Math.sin(time * 5.1) * windK * 0.6;
    const sdt = Math.min(dt, 1 / 30);
    pouchState.vel += (-90 * (pouchState.sag - 1) - 7 * pouchState.vel + drive * 3) * sdt;
    pouchState.sag = clamp(pouchState.sag + pouchState.vel * sdt, 0.55, 1.5);
    pouchState.wob = Math.sin(time * 4.2) * windK;
    updatePouch();

    // --- crest
    head.updateMatrix();
    for (const c of crest) {
      tmp.root.set(c.x, c.y, c.z).applyMatrix4(head.matrix);
      // trails along the wind but is dragged toward the back of the head
      tmp.dir.copy(wind).multiplyScalar(0.9).addScaledVector(headDir, -0.45).addScaledVector(UP, 0.35);
      tmp.dir.z += Math.sin(time * 5 + c.ph) * 0.1 * windK + c.z * 2.2;
      tmp.dir.y += Math.sin(time * 6.3 + c.ph * 1.3) * 0.08 * windK;
      tmp.dir.normalize();
      tmp.nrm.set(0, 0, 1);
      put(plumeSet, c.idx, tmp.root, tmp.dir, tmp.nrm, c.len, c.wid);
    }

    // --- legs (two-bone IK on the pedals)
    for (const L of legs) {
      const s = L.s;
      bodyToRig(-0.03, 0.07, 0.13 * s, L.H);
      bike.pedalPos(crank, s, tmp.a);
      const ankle = Math.sin(crank + (s < 0 ? Math.PI : 0)) * 0.1;
      const footPitch = deg(4) + ankle;
      L.foot.position.set(tmp.a.x - 0.075, tmp.a.y + 0.0165, tmp.a.z);
      L.foot.rotation.set(0, s > 0 ? deg(-6) : deg(6), footPitch);
      L.T.copy(L.foot.position).add(tmp.b.set(-Math.sin(footPitch) * 0.02, Math.cos(footPitch) * 0.02, 0));
      solveTwoBone(L.H, L.T, L1, L2, tmp.c.set(-1, 0.05, 0.08 * s), L.K, L.Fend);
      // thigh (feathered)
      L.P55.lerpVectors(L.H, L.K, 0.7);
      for (let i = 0; i < 14; i++) L.thighPts[i].lerpVectors(L.H, L.P55, i / 13);
      L.thighLoft.update(L.thighPts, tmp.d.set(0, 0, 1));
      // bare lower leg through P55 -> knee -> foot
      L.shankCtrl[0].lerpVectors(L.H, L.K, 0.64);
      L.shankCtrl[1].copy(L.K);
      L.shankCtrl[2].copy(L.Fend);
      for (let i = 0; i < 26; i++) splinePoint(L.shankCtrl, i / 25, L.shankPts[i]);
      L.shankLoft.update(L.shankPts, tmp.d.set(0, 0, 1));
      L.knee.position.copy(L.K);
      // ruffle of plumes around the end of the trouser
      tmp.a.subVectors(L.K, L.H).normalize();
      for (const r of L.ruffle) {
        // radial direction around the leg axis (a ring in the plane perpendicular to it)
        tmp.c.set(Math.cos(r.ang), 0, Math.sin(r.ang));
        tmp.c.addScaledVector(tmp.a, -tmp.c.dot(tmp.a)).normalize();
        tmp.root.copy(L.P55).addScaledVector(tmp.c, 0.04).addScaledVector(tmp.a, -0.025);
        tmp.dir.copy(tmp.a).multiplyScalar(1.0).addScaledVector(tmp.c, 0.16).addScaledVector(wind, 0.22);
        tmp.dir.x += Math.sin(time * 4.2 + r.ph) * 0.04 * windK;
        tmp.dir.normalize();
        put(plumeSet, r.idx, tmp.root, tmp.dir, tmp.c, r.len, 0.036);
      }
    }

    // --- wings
    const stir = Math.sin(time * 2.3);
    for (const w of wings) {
      const s = w.s;
      bodyToRig(0.15, 0.31, 0.175 * s, w.S);
      w.G.copy(bike.anchors.grips[s]);
      w.W.copy(w.G).add(tmp.a.set(-0.075, 0.062, -0.012 * s));
      solveTwoBone(w.S, w.W, A1, A2, tmp.b.set(-0.5, -0.5, 1.0 * s), w.E, w.Wr);
      for (let i = 0; i < 14; i++) {
        const t = i / 13;
        w.upperPts[i].lerpVectors(w.S, w.E, t);
        w.forePts[i].lerpVectors(w.E, w.Wr, t);
      }
      w.upperLoft.update(w.upperPts, tmp.c.set(0, 0, 1));
      w.foreLoft.update(w.forePts, tmp.c.set(0, 0, 1));
      w.elbow.position.copy(w.E);
      // glove around the grip, aligned with the (backward-swept) grip axis
      w.glove.position.copy(w.G);
      w.glove.quaternion.setFromUnitVectors(UP, tmp.d.set(-1, 0.07, 0.05 * s).normalize());
      w.Hend.copy(w.G).add(tmp.a.set(0.0, 0.01, 0));
      // feathers
      tmp.n.set(0, 0.12, s).normalize();
      for (const f of w.list) {
        if (f.seg === 0) tmp.root.lerpVectors(w.S, w.E, f.u);
        else if (f.seg === 1) tmp.root.lerpVectors(w.E, w.Wr, f.u);
        else tmp.root.lerpVectors(w.Wr, w.Hend, f.u);
        tmp.nrm.copy(tmp.n);
        tmp.root.addScaledVector(tmp.nrm, f.lift);
        // rotate the trailing direction about the outward normal by `fan` (mirrored per side)
        tmp.dir.copy(wind);
        const ang = f.fan * s;
        tmp.a.crossVectors(tmp.nrm, wind);
        tmp.dir.multiplyScalar(Math.cos(ang)).addScaledVector(tmp.a, Math.sin(ang));
        // gentle flutter
        const fl = (Math.sin(time * 7.3 + f.ph) * 0.07 + Math.sin(time * 11.7 + f.ph * 1.7) * 0.04) * windK * f.amp + stir * 0.01;
        tmp.dir.addScaledVector(tmp.nrm, fl);
        tmp.dir.y += Math.sin(time * 5.1 + f.ph * 0.6) * 0.05 * windK * f.amp;
        tmp.dir.normalize();
        put(f.set, f.idx, tmp.root, tmp.dir, tmp.nrm, f.len, f.wid);
      }
    }

    // --- tail
    for (const f of tail) {
      const phi = f.phi + Math.sin(time * 2.1 + f.ph) * 0.012 * windK;
      bodyToRig(-0.37, 0.17 - f.layer * 0.014, 0, tmp.root);
      tmp.dir.set(-Math.cos(phi), 0.06 + Math.sin(time * 4 + f.ph) * 0.02 * windK, Math.sin(phi)).normalize().transformDirection(body.matrix);
      tmp.dir.y -= 0.02 * (1 - windK * 0.5);
      tmp.dir.normalize();
      // card normal: mostly up, rolled outward to cup the fan
      tmp.nrm.set(Math.sin(phi) * 0.5, 1, -Math.sin(phi) * 0.5 * 0).normalize().transformDirection(body.matrix);
      put(wingSet, f.idx, tmp.root, tmp.dir, tmp.nrm, f.len, f.wid);
    }
    wingSet.commit();
    covertSet.commit();
    plumeSet.commit();
  }
  update(0, 0, { speed: 4.5 });

  return { group, update, parts: { body, head, bill, pouch, torso, neck, eyes, legs, wings }, feathers: { wingSet, covertSet, plumeSet }, pelvis, headDir };
}
