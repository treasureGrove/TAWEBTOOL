// A retro city bike: diamond frame in clear-coated turquoise, chrome parts, cream gum-wall tyres, leather
// saddle and grips, brass bell + lamp, wicker basket of fish. Bike frame: +X forward, +Y up, +Z right.
import * as THREE from 'three';
import { V, deg, canvasTexture, placeBone } from './util.js';
import { makeFish } from './fish.js';

export function createBicycle() {
  const g = new THREE.Group();
  g.name = 'bicycle';

  // ---------- materials
  const paintOpts = { roughness: 0.36, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.1 };
  const paint = new THREE.MeshPhysicalMaterial({ color: 0x1fb3a3, ...paintOpts });
  const paintDark = new THREE.MeshPhysicalMaterial({ color: 0x138a7e, ...paintOpts, roughness: 0.4 });
  const paintTwoSided = new THREE.MeshPhysicalMaterial({ color: 0x1fb3a3, ...paintOpts, side: THREE.DoubleSide });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xeef0f4, roughness: 0.16, metalness: 1 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xaab0b8, roughness: 0.35, metalness: 1 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1d1d20, roughness: 0.8, metalness: 0 });
  const leather = new THREE.MeshPhysicalMaterial({ color: 0x8a4f26, roughness: 0.52, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.4 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.28, metalness: 1 });
  const creamPaint = new THREE.MeshStandardMaterial({ color: 0xf4ead2, roughness: 0.5, metalness: 0 });

  // Torus UV.y runs round the tube: 0 = tread, 0.25 / 0.75 = the two side walls.
  const tireTex = canvasTexture(8, 64, (ctx, w, h) => {
    ctx.fillStyle = '#1b1b1e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#efe3c6';
    ctx.fillRect(0, h * 0.62, w, h * 0.2);
    ctx.fillRect(0, h * 0.18, w, h * 0.2);
    ctx.fillStyle = '#1b1b1e';
    ctx.fillRect(0, h * 0.26, w, h * 0.035);
    ctx.fillRect(0, h * 0.7, w, h * 0.035);
  });
  tireTex.wrapS = tireTex.wrapT = THREE.RepeatWrapping;
  const tireMat = new THREE.MeshStandardMaterial({ map: tireTex, roughness: 0.78, metalness: 0 });

  const mesh = (geo, mat, parent = g) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const line = (a, b) => new THREE.LineCurve3(a, b);
  const tube = (curve, r, mat = paint, seg = 24, parent = g) => mesh(new THREE.TubeGeometry(curve, seg, r, 14, false), mat, parent);
  const ball = (p, r, mat = paint, parent = g) => {
    const m = mesh(new THREE.SphereGeometry(r, 20, 14), mat, parent);
    m.position.copy(p);
    return m;
  };
  const cyl = (a, b, r, mat, parent = g) => {
    const m = mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 18), mat, parent);
    placeBone(m, a, b);
    m.position.lerpVectors(a, b, 0.5);
    return m;
  };

  // ---------- geometry constants
  const R_TIRE = 0.34;
  const RA = V(-0.45, R_TIRE);
  const FA = V(0.67, R_TIRE);
  const BB = V(0, 0.285);
  const CRANK = 0.17;
  const PEDAL_Z = 0.15;
  const R_RING = 0.1;
  const R_COG = 0.045;
  const seatDir = V(-Math.cos(deg(73)), Math.sin(deg(73)));
  const steerDir = V(-Math.cos(deg(70)), Math.sin(deg(70))); // up the head tube (leaning back)
  const HT = V(0.455, 0.8);
  const HB = HT.clone().addScaledVector(steerDir, -0.14);
  const ST = BB.clone().addScaledVector(seatDir, 0.52);
  const POST = BB.clone().addScaledVector(seatDir, 0.585);
  const TT_REAR = BB.clone().addScaledVector(seatDir, 0.485);
  const TT_FRONT = HT.clone().addScaledVector(steerDir, -0.03);
  const DT_FRONT = HB.clone().addScaledVector(steerDir, 0.035);
  const STEM_TOP = HT.clone().addScaledVector(steerDir, 0.17);
  const BAR_C = V(STEM_TOP.x + 0.05, STEM_TOP.y + 0.012);

  // ---------- main triangle
  const rClamp = (a, b, t, r) => {
    const m = mesh(new THREE.CylinderGeometry(r, r, 0.012, 20, 1, true), creamPaint);
    placeBone(m, a, b);
    m.position.lerpVectors(a, b, t);
  };
  tube(line(BB, ST), 0.0165);
  tube(line(TT_REAR, TT_FRONT), 0.0165);
  tube(line(BB, DT_FRONT), 0.0205);
  tube(line(HB, HT), 0.0235);
  for (const t of [0.2, 0.8]) {
    rClamp(TT_REAR, TT_FRONT, t, 0.0171);
    rClamp(BB, DT_FRONT, t, 0.0211);
  }
  rClamp(BB, ST, 0.5, 0.0171);
  for (const p of [TT_FRONT, DT_FRONT]) ball(p, 0.0255, paint);
  ball(TT_REAR, 0.0215, paint);
  const bbShell = mesh(new THREE.CylinderGeometry(0.0285, 0.0285, 0.1, 24), paintDark);
  bbShell.rotation.x = Math.PI / 2;
  bbShell.position.copy(BB);
  cyl(HT, HT.clone().addScaledVector(steerDir, 0.03), 0.0265, chrome);
  cyl(HB.clone().addScaledVector(steerDir, -0.03), HB, 0.0265, chrome);
  {
    const badge = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.006, 28), brass);
    badge.quaternion.setFromUnitVectors(V(0, 1, 0), V(1, 0.34, 0).normalize());
    badge.position.copy(HB).lerp(HT, 0.5).add(V(0.0235, 0.008, 0));
    const ring = mesh(new THREE.TorusGeometry(0.02, 0.0025, 8, 32), chrome, badge);
    ring.rotation.x = Math.PI / 2;
  }

  // ---------- rear triangle
  for (const s of [-1, 1]) {
    tube(line(V(BB.x - 0.01, BB.y, 0.032 * s), V(RA.x, RA.y, 0.057 * s)), 0.0095, paint, 8);
    tube(
      new THREE.QuadraticBezierCurve3(V(TT_REAR.x - 0.002, TT_REAR.y - 0.015, 0.02 * s), V(-0.3, 0.62, 0.045 * s), V(RA.x, RA.y, 0.057 * s)),
      0.008, paint, 24
    );
    ball(V(RA.x, RA.y, 0.057 * s), 0.0105, paint);
  }

  // ---------- steered assembly (fork, front wheel, bars, lamp, basket) pivots about the head-tube axis
  const crown = HB.clone().addScaledVector(steerDir, -0.012);
  const forkDown = steerDir.clone().negate();
  const steer = new THREE.Group();
  steer.position.copy(HB);
  g.add(steer);
  const steered = new THREE.Group();
  steered.position.copy(HB).negate();
  steer.add(steered);

  for (const s of [-1, 1]) {
    const c0 = V(crown.x, crown.y, 0.052 * s);
    const c1 = c0.clone().addScaledVector(forkDown, 0.2);
    const c2 = V(FA.x - 0.012, FA.y + 0.2, 0.056 * s);
    tube(new THREE.CubicBezierCurve3(c0, c1, c2, V(FA.x, FA.y, 0.058 * s)), 0.0108, paint, 28, steered);
    ball(V(FA.x, FA.y, 0.058 * s), 0.0118, paint, steered);
  }
  const crownBar = mesh(new THREE.CylinderGeometry(0.0128, 0.0128, 0.128, 18), paint, steered);
  crownBar.rotation.x = Math.PI / 2;
  crownBar.position.copy(crown);

  cyl(HT, STEM_TOP, 0.0115, chrome, steered);
  cyl(STEM_TOP, V(BAR_C.x, BAR_C.y, 0), 0.0118, chrome, steered);
  ball(V(BAR_C.x, BAR_C.y, 0), 0.0185, chrome, steered);
  const barSide = [
    V(BAR_C.x, BAR_C.y, 0.0),
    V(BAR_C.x + 0.012, BAR_C.y + 0.004, 0.09),
    V(BAR_C.x + 0.0, BAR_C.y + 0.016, 0.19),
    V(BAR_C.x - 0.09, BAR_C.y + 0.035, 0.245),
    V(BAR_C.x - 0.2, BAR_C.y + 0.05, 0.262),
    V(BAR_C.x - 0.27, BAR_C.y + 0.055, 0.264),
  ];
  const barPts = [...barSide.slice(1).reverse().map((p) => V(p.x, p.y, -p.z)), ...barSide];
  tube(new THREE.CatmullRomCurve3(barPts, false, 'centripetal'), 0.0112, chrome, 120, steered);

  const gripLocal = {};
  for (const s of [-1, 1]) {
    const a = V(BAR_C.x - 0.115, BAR_C.y + 0.044, 0.255 * s);
    const b = V(BAR_C.x - 0.275, BAR_C.y + 0.055, 0.264 * s);
    const grip = mesh(new THREE.CapsuleGeometry(0.0185, a.distanceTo(b) - 0.03, 6, 20), leather, steered);
    placeBone(grip, a, b);
    grip.position.lerpVectors(a, b, 0.5);
    ball(b, 0.0215, brass, steered);
    gripLocal[s] = a.clone().lerp(b, 0.5);
    const lever = new THREE.CatmullRomCurve3([
      V(a.x + 0.012, a.y - 0.003, a.z - 0.01 * s),
      V(a.x + 0.06, a.y - 0.04, a.z - 0.008 * s),
      V(a.x + 0.11, a.y - 0.07, a.z - 0.004 * s),
    ]);
    tube(lever, 0.0042, chrome, 12, steered);
  }
  {
    const bellPos = V(BAR_C.x + 0.03, BAR_C.y + 0.022, -0.13);
    const bell = mesh(new THREE.SphereGeometry(0.03, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), brass, steered);
    bell.position.copy(bellPos);
    mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 12), chrome, steered).position.copy(bellPos).add(V(0, 0.028, 0));
    mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.006, 24), chrome, steered).position.copy(bellPos);
  }

  // headlamp on the fork crown
  const lamp = new THREE.Group();
  lamp.position.set(crown.x + 0.075, crown.y + 0.12, 0);
  steered.add(lamp);
  {
    const shell = mesh(new THREE.SphereGeometry(0.052, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.62), brass, lamp);
    shell.rotation.z = -Math.PI / 2;
    const rim = mesh(new THREE.TorusGeometry(0.0455, 0.005, 10, 36), chrome, lamp);
    rim.rotation.y = Math.PI / 2;
    rim.position.x = 0.03;
    const lens = new THREE.Mesh(
      new THREE.SphereGeometry(0.0445, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.2),
      new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffe2a0, emissiveIntensity: 1.2, roughness: 0.1 })
    );
    lens.rotation.z = -Math.PI / 2;
    lens.position.x = 0.012;
    lamp.add(lens);
    tube(line(V(-0.03, -0.075, 0), V(0, 0, 0)), 0.006, chrome, 4, lamp);
  }

  // ---------- wheels
  function makeWheel() {
    const w = new THREE.Group();
    const tire = mesh(new THREE.TorusGeometry(0.31, 0.03, 24, 120), tireMat, w);
    tire.scale.z = 0.85;
    mesh(new THREE.TorusGeometry(0.2845, 0.0085, 12, 100), chrome, w);
    const hub = mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.1, 24), chrome, w);
    hub.rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) {
      const fl = mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.004, 28), chrome, w);
      fl.rotation.x = Math.PI / 2;
      fl.position.z = 0.032 * s;
      const nut = mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.018, 12), steel, w);
      nut.rotation.x = Math.PI / 2;
      nut.position.z = 0.058 * s;
    }
    const N = 36;
    const spokes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0017, 0.0017, 1, 5), steel, N);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const a = V();
    const b = V();
    const d = V();
    const up = V(0, 1, 0);
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2;
      const side = i % 2 ? 1 : -1;
      a.set(Math.cos(ang) * 0.033, Math.sin(ang) * 0.033, 0.032 * side);
      b.set(Math.cos(ang + 0.34 * side) * 0.2805, Math.sin(ang + 0.34 * side) * 0.2805, 0);
      d.subVectors(b, a);
      const len = d.length();
      q.setFromUnitVectors(up, d.normalize());
      m4.compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, len, 1));
      spokes.setMatrixAt(i, m4);
    }
    spokes.castShadow = true;
    w.add(spokes);
    return w;
  }
  const rearWheel = makeWheel();
  rearWheel.position.copy(RA);
  g.add(rearWheel);
  const frontWheel = makeWheel();
  frontWheel.position.copy(FA);
  steered.add(frontWheel);

  // fenders: an arched strip hugging each wheel (angles in degrees, counter-clockwise from +X)
  function fender(center, a0, a1, parent) {
    const N = 56;
    const M = 8;
    const pos = [];
    const idx = [];
    for (let i = 0; i <= N; i++) {
      const a = deg(a0 + ((a1 - a0) * i) / N);
      for (let j = 0; j <= M; j++) {
        const u = (j / M - 0.5) * 2;
        const r = 0.372 - 0.012 * Math.pow(u, 4);
        pos.push(center.x + Math.cos(a) * r, center.y + Math.sin(a) * r, u * 0.039);
      }
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < M; j++) {
        const A = i * (M + 1) + j;
        idx.push(A, A + 1, A + M + 1, A + 1, A + M + 2, A + M + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return mesh(geo, paintTwoSided, parent);
  }
  fender(RA, 28, 196, g);
  fender(FA, -12, 150, steered);
  {
    const rl = mesh(new THREE.SphereGeometry(0.016, 14, 10), new THREE.MeshStandardMaterial({ color: 0xd8262e, emissive: 0x7a0a10, roughness: 0.2 }));
    rl.position.set(RA.x + 0.372 * Math.cos(deg(194)), RA.y + 0.372 * Math.sin(deg(194)), 0);
    rl.scale.set(1, 1, 1.7);
  }

  // ---------- saddle (Brooks-style) on a post
  cyl(ST, POST, 0.0125, chrome);
  const saddle = new THREE.Group();
  saddle.position.set(POST.x + 0.01, POST.y + 0.035, 0);
  saddle.rotation.z = deg(-1.5);
  g.add(saddle);
  {
    const sh = new THREE.Shape();
    sh.moveTo(0.135, 0);
    sh.bezierCurveTo(0.135, 0.022, 0.06, 0.03, 0.0, 0.07);
    sh.bezierCurveTo(-0.05, 0.1, -0.135, 0.095, -0.135, 0);
    sh.bezierCurveTo(-0.135, -0.095, -0.05, -0.1, 0.0, -0.07);
    sh.bezierCurveTo(0.06, -0.03, 0.135, -0.022, 0.135, 0);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 5, curveSegments: 28 });
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      if (z > 0.01) p.setZ(i, z - 0.012 * Math.max(0, 1 - (x * x) / 0.012 - (y * y) / 0.009));
    }
    geo.computeVertexNormals();
    const m = mesh(geo, leather, saddle);
    m.rotation.x = -Math.PI / 2;
    for (const s of [-1, 1]) {
      const rail = new THREE.CatmullRomCurve3([V(-0.1, 0.0, 0.032 * s), V(-0.06, -0.012, 0.03 * s), V(0.06, -0.02, 0.012 * s), V(0.12, -0.002, 0.012 * s)]);
      tube(rail, 0.0042, chrome, 16, saddle);
      mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 14), steel, saddle).position.set(-0.115, -0.025, 0.04 * s);
    }
    mesh(new THREE.BoxGeometry(0.05, 0.02, 0.04), chrome, saddle).position.set(-0.02, -0.025, 0);
  }

  // ---------- drivetrain
  const crankGroup = new THREE.Group();
  crankGroup.position.copy(BB);
  g.add(crankGroup);
  const gearGeo = (rOut, teeth, holes) => {
    const shape = new THREE.Shape();
    const n = teeth * 2;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = i % 2 ? rOut * 0.93 : rOut;
      i === 0 ? shape.moveTo(r * Math.cos(a), r * Math.sin(a)) : shape.lineTo(r * Math.cos(a), r * Math.sin(a));
    }
    for (let i = 0; i < holes; i++) {
      const a = (i / holes) * Math.PI * 2 + 0.3;
      const hole = new THREE.Path();
      hole.absarc(Math.cos(a) * rOut * 0.56, Math.sin(a) * rOut * 0.56, rOut * 0.2, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
    return new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: false });
  };
  mesh(gearGeo(R_RING, 38, 5), chrome, crankGroup).position.z = 0.052;
  mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.19, 14), steel, crankGroup).rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) {
    const arm = mesh(new THREE.BoxGeometry(CRANK + 0.03, 0.022, 0.012), chrome, crankGroup);
    arm.position.set((CRANK / 2) * s, 0, 0.085 * s);
    const boss = mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.014, 20), chrome, crankGroup);
    boss.rotation.x = Math.PI / 2;
    boss.position.set(0, 0, 0.085 * s);
    const tip = mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.014, 20), chrome, crankGroup);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(CRANK * s, 0, 0.085 * s);
  }
  mesh(gearGeo(R_COG, 16, 0), chrome, rearWheel).position.z = 0.052;

  const pedals = {};
  for (const s of [-1, 1]) {
    const p = new THREE.Group();
    g.add(p);
    mesh(new THREE.BoxGeometry(0.115, 0.02, 0.085), rubber, p);
    mesh(new THREE.BoxGeometry(0.119, 0.006, 0.089), steel, p).position.y = -0.006;
    for (const x of [-0.05, 0.05]) mesh(new THREE.BoxGeometry(0.012, 0.006, 0.089), chrome, p).position.set(x, 0.012, 0);
    pedals[s] = p;
  }

  const chainPts = [];
  {
    const dx = RA.x - BB.x;
    const dy = RA.y - BB.y;
    const L = Math.hypot(dx, dy);
    const alpha = Math.atan2(dy, dx);
    const beta = Math.acos((R_RING - R_COG) / L);
    const tTop = alpha - beta;
    const tBot = alpha + beta;
    const zc = 0.056;
    const at = (c, r, a) => V(c.x + r * Math.cos(a), c.y + r * Math.sin(a), zc);
    const arc = (c, r, a0, a1, n) => {
      for (let i = 0; i <= n; i++) chainPts.push(at(c, r, a0 + ((a1 - a0) * i) / n));
    };
    const seg = (p, q, n) => {
      for (let i = 1; i < n; i++) chainPts.push(p.clone().lerp(q, i / n));
    };
    seg(at(BB, R_RING, tTop), at(RA, R_COG, tTop), 18);
    arc(RA, R_COG, tTop, tBot, 10);
    seg(at(RA, R_COG, tBot), at(BB, R_RING, tBot), 18);
    arc(BB, R_RING, tBot, tTop + Math.PI * 2, 24);
    chainPts.pop();
  }
  const chainCurve = new THREE.CatmullRomCurve3(chainPts, true);
  const chainLen = chainCurve.getLength();
  // one texture repeat = 4 link pairs of a 12.7 mm pitch chain
  const chainTex = canvasTexture(64, 8, (ctx, w, h) => {
    for (let x = 0; x < w; x += 16) {
      ctx.fillStyle = '#34363c';
      ctx.fillRect(x, 0, 8, h);
      ctx.fillStyle = '#a5acb8';
      ctx.fillRect(x + 8, 0, 8, h);
    }
  }, { repeat: [Math.round(chainLen / 0.1016), 1] });
  chainTex.magFilter = THREE.NearestFilter;
  mesh(new THREE.TubeGeometry(chainCurve, 320, 0.0048, 6, true), new THREE.MeshStandardMaterial({ map: chainTex, roughness: 0.4, metalness: 0.9 }));
  {
    const gm = mesh(new THREE.TorusGeometry(R_RING + 0.022, 0.0035, 8, 60, Math.PI * 1.1), paintDark);
    gm.position.set(BB.x, BB.y, 0.072);
    gm.rotation.z = deg(40);
  }

  // ---------- front basket (wicker) with the day's catch
  const basket = new THREE.Group();
  basket.position.set(0.74, 0.9, 0);
  steered.add(basket);
  {
    const wicker = canvasTexture(256, 128, (ctx, w, h) => {
      ctx.fillStyle = '#6e4724';
      ctx.fillRect(0, 0, w, h);
      for (let row = 0; row < 14; row++) {
        for (let col = -1; col < 9; col++) {
          const x = col * 32 + (row % 2) * 16;
          const y = row * (h / 14);
          const gr = ctx.createLinearGradient(0, y, 0, y + h / 14);
          gr.addColorStop(0, '#b27b44');
          gr.addColorStop(0.5, '#dfb27a');
          gr.addColorStop(1, '#94632f');
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.ellipse(x + 15, y + h / 28, 15.5, h / 28 - 0.6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }, { repeat: [2, 1.2] });
    const wickerMat = new THREE.MeshStandardMaterial({ map: wicker, roughness: 0.8, side: THREE.DoubleSide, bumpMap: wicker, bumpScale: 1.2 });
    mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.2, 40, 1, true), wickerMat, basket).scale.z = 1.12;
    const bottom = mesh(new THREE.CircleGeometry(0.14, 36), new THREE.MeshStandardMaterial({ color: 0x75481f, roughness: 0.9 }), basket);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = -0.099;
    bottom.scale.set(1, 1.12, 1);
    const rim = mesh(new THREE.TorusGeometry(0.17, 0.0125, 10, 48), new THREE.MeshStandardMaterial({ color: 0xa8713a, roughness: 0.7 }), basket);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.1;
    rim.scale.set(1, 1.12, 1);
    for (const s of [-1, 1]) tube(line(V(0.6, 0.86, 0.04 * s), V(0.5, 0.94, 0.05 * s)), 0.005, steel, 4, steered);
  }

  // the day's catch (see fish.js): forked tails, fins and a curious head peeking over the rim
  for (const [len, kind, pos, rot] of [
    [0.36, 'mackerel', [-0.03, -0.01, 0.05], [0.25, 0.35, -0.95]],
    [0.3, 'bream', [0.05, 0.03, -0.05], [-0.15, -0.45, 0.85]],
    [0.25, 'sardine', [-0.08, -0.02, -0.075], [0.3, 1.2, -1.05]],
  ]) {
    const f = makeFish(len, kind);
    f.position.set(...pos);
    f.rotation.set(...rot);
    basket.add(f);
  }

  // ---------- soft contact shadow blobs under the wheels (fake AO on the road)
  {
    const tex = canvasTexture(256, 64, (ctx, w, h) => {
      ctx.setTransform(1, 0, 0, h / w, 0, 0);
      const gr = ctx.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2);
      gr.addColorStop(0, 'rgba(0,0,0,0.55)');
      gr.addColorStop(0.5, 'rgba(0,0,0,0.22)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, w, w);
    });
    for (const x of [RA.x, FA.x]) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.46, 0.16),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9, toneMapped: false })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.004, 0);
      m.renderOrder = 1;
      g.add(m);
    }
  }

  // ---------- animation
  let wheelAngle = 0;
  let crankAngle = 0;
  const gripWorld = { 1: V(), [-1]: V() };
  const tmpMat = new THREE.Matrix4();

  function pedalPos(angle, side, out) {
    const a = -angle + (side < 0 ? Math.PI : 0);
    return out.set(BB.x + CRANK * Math.cos(a), BB.y + CRANK * Math.sin(a), PEDAL_Z * side);
  }
  const steerQ = new THREE.Quaternion();
  function update(distance, steerAngle = 0) {
    const dWheel = distance / R_TIRE;
    const dCrank = (dWheel * R_COG) / R_RING;
    wheelAngle += dWheel;
    crankAngle += dCrank;
    rearWheel.rotation.z = -wheelAngle;
    frontWheel.rotation.z = -wheelAngle;
    crankGroup.rotation.z = -crankAngle;
    pedalPos(crankAngle, 1, pedals[1].position);
    pedalPos(crankAngle, -1, pedals[-1].position);
    chainTex.offset.x += (dCrank * R_RING * chainTex.repeat.x) / chainLen;
    steer.quaternion.copy(steerQ.setFromAxisAngle(steerDir, steerAngle));
    steer.updateMatrix();
    steered.updateMatrix();
    tmpMat.copy(steer.matrix).multiply(steered.matrix);
    for (const s of [-1, 1]) gripWorld[s].copy(gripLocal[s]).applyMatrix4(tmpMat);
  }
  update(0);

  return {
    group: g,
    update,
    pedalPos,
    get crankAngle() {
      return crankAngle;
    },
    anchors: {
      saddle: V(saddle.position.x, saddle.position.y + 0.028, 0),
      grips: gripWorld,
      bb: BB,
      crank: CRANK,
      pedalZ: PEDAL_Z,
    },
    parts: { steer, steered, lamp, basket, saddle, frontWheel, rearWheel },
  };
}
