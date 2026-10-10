// Everything out on the water: hazy islands, a lighthouse on a rocky islet, and sailing boats.
// The sea is only a shader plane, so far objects fake their own atmospheric perspective using the same
// horizon colours as the sea haze; nothing here is lit by the (tiny) shadow camera.
import * as THREE from 'three';
import { clamp, lerp, deg, smoothstep, rng, V, canvasTexture, Loft, cap } from './util.js';
import { prep, merge, bone, fbm3 } from './geo.js';
import { wrapX } from './props.js';
import { LAYOUT } from './terrain.js';

const SEA_Y = LAYOUT.seaY;
const V2 = (x, y) => new THREE.Vector2(x, y);

// ---------------------------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------------------------

/** Unlit-by-shadow, sun-and-sky shaded material with strong aerial perspective (islands, lighthouse). */
function hazeMaterial(U, { min = 0.5, max = 0.9, k = 0.0016 } = {}) {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    fog: false,
    uniforms: {
      uSunDir: U.uSunDir,
      uSunColor: U.uSunColor,
      uHorizon: U.uHorizon,
      uLow: U.uLow,
      uMid: U.uMid,
      uHazeMin: { value: min },
      uHazeMax: { value: max },
      uHazeK: { value: k },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNrm;
      varying vec3 vCol;
      varying float vDist;
      varying float vAlt;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNrm = normalize(mat3(modelMatrix) * normal);
        vCol = color;
        vAlt = position.y;
        vDist = length(wp.xyz - cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uHorizon;
      uniform vec3 uLow;
      uniform vec3 uMid;
      uniform float uHazeMin;
      uniform float uHazeMax;
      uniform float uHazeK;
      varying vec3 vNrm;
      varying vec3 vCol;
      varying float vDist;
      varying float vAlt;
      void main(){
        vec3 N = normalize(vNrm);
        float lit = smoothstep(-0.3, 0.85, dot(N, uSunDir));
        vec3 amb = mix(uHorizon, uMid, 0.35 + 0.35 * N.y);
        vec3 col = vCol * (amb * 0.62 + uSunColor * lit * 0.8);
        float haze = (1.0 - exp(-vDist * uHazeK)) * uHazeMax;
        haze = max(haze, uHazeMin);
        haze = mix(haze, 1.0, 0.5 * exp(-max(vAlt, 0.0) / 30.0));
        vec3 hz = mix(uHorizon, uLow, 0.3);
        col = mix(col, hz, haze);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/**
 * Make a regular PBR / basic material fade into the same haze the sea uses (instead of the scene's much
 * denser exponential fog), and optionally let thin cloth glow when the sun is behind it.
 */
function hazePatch(material, U, key, { translucent = 0 } = {}) {
  material.customProgramCacheKey = () => `horizon-${key}`;
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uHazeCol = U.uHorizon;
    sh.uniforms.uSunDirW = U.uSunDir;
    sh.uniforms.uSunCol = U.uSunColor;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uHazeCol;\nuniform vec3 uSunDirW;\nuniform vec3 uSunCol;')
      .replace(
        '#include <fog_fragment>',
        `#ifdef USE_FOG
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeCol, (1.0 - exp(-vFogDepth * 0.0016)) * 0.55);
        #endif`
      );
    if (translucent > 0) {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 Ls = normalize(mat3(viewMatrix) * uSunDirW);
          float behind = max(dot(-normal, Ls), 0.0);
          totalEmissiveRadiance += diffuseColor.rgb * uSunCol * ${translucent.toFixed(2)} * (0.1 + 0.9 * behind);
        }`
      );
    }
  };
  return material;
}

// ---------------------------------------------------------------------------------------------
// Islands
// ---------------------------------------------------------------------------------------------
function islandHeight({ rx, rz, peak, seed }) {
  return (x, z) => {
    const nx = x / rx;
    const nz = z / rz;
    const warp = (fbm3(nx * 1.7 + seed, 0.7, nz * 1.7 - seed, 3) - 0.44) * 0.9;
    const d = Math.hypot(nx, nz) + warp * 0.55;
    const mask = smoothstep(1.0, 0.16, d);
    const n = fbm3(nx * 2.4 + seed, 1.7, nz * 2.4 - seed, 4);
    const ridge = 1 - Math.abs(fbm3(nx * 1.6 - seed, 3.3, nz * 1.6 + seed * 2, 3) * 2 - 1);
    const shape = clamp(0.3 + 0.95 * (n - 0.3) + 0.7 * ridge * ridge, 0.1, 1.5);
    const h = Math.pow(mask, 1.1) * peak * shape;
    // far from the island the grid dives below the sea so no edge is ever visible
    return { y: h - 5 * (1 - smoothstep(0, 0.12, mask)), h, mask };
  };
}

function buildIsland(spec) {
  const { rx, rz, peak, seed } = spec;
  const segX = clamp(Math.round((rx * 2.5) / 10), 40, 190);
  const segZ = clamp(Math.round((rz * 2.5) / 10), 16, 90);
  const g = new THREE.PlaneGeometry(rx * 2.5, rz * 2.5, segX, segZ);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const height = islandHeight(spec);
  for (let i = 0; i < pos.count; i++) pos.setY(i, height(pos.getX(i), pos.getZ(i)).y);
  g.computeVertexNormals();
  const nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const sand = new THREE.Color('#cdb88e');
  const forestA = new THREE.Color('#27462c');
  const forestB = new THREE.Color('#5b7d3a');
  const rockA = new THREE.Color('#6d655d');
  const rockB = new THREE.Color('#a39888');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = clamp(y / peak, 0, 1.2);
    const slope = 1 - nor.getY(i);
    const nn = fbm3(x * 0.02 + seed, 5, z * 0.02, 3);
    c.copy(forestA).lerp(forestB, clamp(nn * 1.6 - 0.2 + t * 0.3, 0, 1));
    c.lerp(t > 0.8 ? rockB : rockA, clamp((slope - 0.16) * 3.5 + (t - 0.78) * 3.0, 0, 1));
    c.lerp(sand, (1 - smoothstep(0, 2.6, y)) * 0.85);
    c.toArray(col, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return { geometry: g, height };
}

// ---------------------------------------------------------------------------------------------
// Lighthouse (tower, gallery, lantern, keeper's house, flare glow and two rotating beams)
// ---------------------------------------------------------------------------------------------
function buildLighthouse(U) {
  const g = new THREE.Group();
  const white = '#efe9df';
  const red = '#bd3a30';
  const stone = '#8d857b';
  const parts = [];

  const prof = [];
  for (let i = 0; i <= 90; i++) {
    const y = lerp(-3, 24.4, i / 90);
    const t = clamp(y / 24, 0, 1);
    prof.push(V2(lerp(3.7, 2.45, Math.pow(t, 0.9)) + (y < 1.2 ? 0.2 : 0), y));
  }
  parts.push(
    prep(new THREE.LatheGeometry(prof, 28), (x, y) => (y < 1.6 ? stone : (y > 7 && y < 12.5) || (y > 17 && y < 22) ? red : white))
  );
  const gallery = new THREE.CylinderGeometry(3.3, 2.7, 0.7, 28);
  gallery.translate(0, 24.75, 0);
  parts.push(prep(gallery, '#3b3a3a'));
  const rail = new THREE.TorusGeometry(3.2, 0.07, 5, 32);
  rail.rotateX(Math.PI / 2);
  rail.translate(0, 25.9, 0);
  parts.push(prep(rail, '#2a2a2a'));
  const roof = new THREE.ConeGeometry(2.15, 2.5, 24);
  roof.translate(0, 29.4, 0);
  parts.push(prep(roof, red));
  const finial = new THREE.SphereGeometry(0.28, 10, 8);
  finial.translate(0, 30.9, 0);
  parts.push(prep(finial, '#2a2a2a'));
  const house = new THREE.BoxGeometry(7.5, 3.2, 4.6);
  house.translate(-9.5, 1.5, 3.5);
  parts.push(prep(house, white));
  const houseRoof = new THREE.BoxGeometry(8.1, 0.6, 5.2);
  houseRoof.translate(-9.5, 3.4, 3.5);
  parts.push(prep(houseRoof, '#7d2f2a'));
  const body = new THREE.Mesh(merge(parts), hazeMaterial(U, { min: 0.42, max: 0.9 }));
  g.add(body);

  // lantern glass: a cylinder that gets hot-white at night
  const glassMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.7, 0.34), fog: false });
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 3.0, 20), glassMat);
  glass.position.y = 26.6;
  g.add(glass);

  // flare: an additive glow sprite that swells when a beam sweeps past the viewer
  const glowTex = canvasTexture(128, 128, (ctx, w, h) => {
    const gr = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,244,214,1)');
    gr.addColorStop(0.12, 'rgba(255,214,150,0.65)');
    gr.addColorStop(0.4, 'rgba(255,170,90,0.16)');
    gr.addColorStop(1, 'rgba(255,150,70,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, w, h);
  });
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0 });
  const glow = new THREE.Sprite(glowMat);
  glow.position.y = 26.6;
  glow.scale.setScalar(55);
  g.add(glow);

  // two opposite beams, rotating about the lantern
  const BEAM_LEN = 520;
  const beamGeo = new THREE.ConeGeometry(15, BEAM_LEN, 20, 1, true);
  beamGeo.translate(0, -BEAM_LEN / 2, 0);
  beamGeo.rotateZ(Math.PI / 2);
  const beamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: { uColor: { value: new THREE.Color('#ffe0a0') }, uStrength: { value: 0 }, uLen: { value: BEAM_LEN } },
    vertexShader: /* glsl */ `
      uniform float uLen;
      varying vec3 vNrm;
      varying vec3 vView;
      varying float vAlong;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNrm = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        vAlong = clamp(position.x / uLen, 0.0, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uStrength;
      varying vec3 vNrm;
      varying vec3 vView;
      varying float vAlong;
      void main(){
        // pow() of a (rounding-error) negative base is NaN, and one NaN pixel poisons the whole bloom chain
        float edge = pow(clamp(abs(dot(normalize(vNrm), normalize(vView))), 0.0, 1.0), 2.0);
        float a = edge * pow(clamp(1.0 - vAlong, 0.0, 1.0), 1.5) * uStrength;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
  const beams = new THREE.Group();
  beams.position.y = 26.6;
  const b1 = new THREE.Mesh(beamGeo, beamMat);
  const b2 = new THREE.Mesh(beamGeo, beamMat);
  b2.rotation.y = Math.PI;
  b1.frustumCulled = b2.frustumCulled = false;
  beams.add(b1, b2);
  g.add(beams);

  const state = { lamp: 0 };
  const _v = new THREE.Vector3();
  return {
    group: g,
    setLamp(v) {
      state.lamp = v;
      glassMat.color.setRGB(1, 0.7, 0.34).multiplyScalar(0.9 + 6 * v * v);
      beamMat.uniforms.uStrength.value = 0.05 + 0.5 * v * v;
    },
    update(time, camera) {
      beams.rotation.y = time * 0.55;
      // flare when a beam points toward the camera
      g.getWorldPosition(_v);
      const dx = camera.position.x - _v.x;
      const dz = camera.position.z - _v.z;
      const l = Math.hypot(dx, dz) || 1;
      const bx = Math.cos(-beams.rotation.y);
      const bz = Math.sin(-beams.rotation.y);
      const align = Math.abs((dx * bx + dz * bz) / l);
      const flash = Math.pow(align, 9);
      glowMat.opacity = clamp((0.02 + 0.98 * state.lamp * state.lamp) * (0.25 + 0.75 * flash), 0, 1);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Sailboats
// ---------------------------------------------------------------------------------------------
const BOAT_SPAN = 1400;
const BOAT_BACK = -700;
const REF_L = 9;

function hullGeometry(L, hullCol, stripeCol) {
  const B = L * 0.3;
  const D = L * 0.14;
  const F = L * 0.115;
  const stations = 60;
  const radial = 48;
  // plan outline: broad transom, widest at ~40 %, then a long straight-ish entry to a sharp bow
  const plan = (u) => {
    const grow = lerp(0.5, 1.0, Math.sin(smoothstep(0, 0.42, u) * Math.PI * 0.5));
    const taper = u < 0.42 ? 1 : Math.pow(Math.max(1 - (u - 0.42) / 0.58, 0), 0.9);
    return grow * taper * cap(u, 0.03);
  };
  // sheer line: sweeps up toward the bow, a little lift at the stern
  const free = (u) => F * (0.8 + 0.55 * Math.pow(u, 3.2) + 0.1 * (1 - u) * (1 - u));
  const topside = new THREE.Color(hullCol);
  const stripe = new THREE.Color(stripeCol);
  const teak = new THREE.Color('#bf9b66');
  const antifoul = new THREE.Color('#6d2c2a');
  const loft = new Loft({
    stations,
    radial,
    section: (u, a, out) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const p = plan(u);
      const hw = 0.5 * B * p;
      if (s >= 0) {
        out.x = hw * Math.sign(c) * Math.pow(Math.abs(c), 0.57);
        out.y = free(u) * Math.pow(s, 0.57);
      } else {
        out.x = hw * c;
        out.y = D * p * s;
      }
    },
    color: (u, a, c) => {
      const s = Math.sin(a);
      if (s < 0) c.copy(antifoul);
      else {
        const rel = Math.pow(s, 0.57);
        if (rel > 0.94) c.copy(teak);
        else if (rel < 0.16) c.copy(stripe);
        else c.copy(topside);
      }
    },
  });
  const pts = Array.from({ length: stations }, (_, i) => V((i / (stations - 1) - 0.5) * L, 0, 0));
  loft.update(pts, V(0, 0, 1));
  const parts = [prep(loft.geometry)];
  const fbMid = free(0.45);
  const cabin = new THREE.BoxGeometry(L * 0.34, L * 0.06, B * 0.5);
  cabin.translate(-L * 0.06, fbMid + L * 0.02, 0);
  parts.push(prep(cabin, '#f4efe4'));
  const win = new THREE.BoxGeometry(L * 0.22, L * 0.022, B * 0.508);
  win.translate(-L * 0.06, fbMid + L * 0.03, 0);
  parts.push(prep(win, '#1c2a3a'));
  return { geometry: merge(parts), fbMid, free };
}

/** A triangular sail in the XY plane that bulges toward +Z. tack/head/clew are [x, y]. */
function sailGeometry({ tack, head, clew, draft = 0.13, color = '#f6f0e4', edge = '#e2d8c4', nu = 14, nv = 10 }) {
  const pos = [];
  const col = [];
  const idx = [];
  const luff = [head[0] - tack[0], head[1] - tack[1]];
  const foot = [clew[0] - tack[0], clew[1] - tack[1]];
  const footLen = Math.hypot(foot[0], foot[1]);
  const A = new THREE.Color(color);
  const B = new THREE.Color(edge);
  const c = new THREE.Color();
  for (let i = 0; i <= nu; i++) {
    const a = i / nu;
    for (let j = 0; j <= nv; j++) {
      const b = j / nv;
      const x = tack[0] + luff[0] * a + foot[0] * b * (1 - a);
      const y = tack[1] + luff[1] * a + foot[1] * b * (1 - a);
      const chord = footLen * (1 - a);
      const z = draft * chord * Math.sin(Math.PI * Math.pow(b, 0.78)) * (0.2 + 0.8 * smoothstep(0, 0.35, a));
      pos.push(x, y, z);
      c.copy(A).lerp(B, clamp(Math.pow(b, 3) * 0.7 + (1 - a) * 0.0 + Math.pow(1 - a, 6) * 0.5, 0, 1));
      col.push(c.r, c.g, c.b);
    }
  }
  const W = nv + 1;
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const k = i * W + j;
      idx.push(k, k + 1, k + W, k + 1, k + W + 1, k + W);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((nu + 1) * W * 2), 2));
  return g;
}

function wakeTexture(L, B) {
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const planeW = L * 3.4;
    const planeD = B * 3.6;
    const px = (x) => ((x + L * 2.5) / planeW) * w; // boat-local x -> pixel
    const pz = (z) => (0.5 + z / planeD) * h;
    const blob = (x, z, r, a) => {
      const X = px(x);
      const Z = pz(z);
      const gr = ctx.createRadialGradient(X, Z, 0, X, Z, r);
      gr.addColorStop(0, `rgba(255,255,255,${a})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(X, Z, r, 0, Math.PI * 2);
      ctx.fill();
    };
    // foam collar around the hull
    for (let i = 0; i <= 28; i++) {
      const u = i / 28;
      const x = lerp(-0.5, 0.5, u) * L * 0.96;
      const half = 0.5 * B * Math.pow(Math.max(Math.sin(Math.PI * Math.pow(u, 0.82)), 0), 0.7);
      blob(x, half, 7, 0.55);
      blob(x, -half, 7, 0.55);
    }
    // trailing wake: two diverging lines plus a turbulent centre
    for (let i = 0; i < 60; i++) {
      const t = i / 59;
      const x = -0.5 * L - t * L * 1.9;
      const spread = 0.35 * B + t * B * 1.0;
      const a = 0.5 * Math.pow(1 - t, 1.4);
      blob(x, spread, 6 + 6 * t, a);
      blob(x, -spread, 6 + 6 * t, a);
      blob(x, (Math.sin(i * 12.9) * 0.5) * B * 0.35, 5 + 7 * t, a * 0.6);
    }
  });
}

function buildBoat(spec, shared) {
  const { L, hull, stripe, sail, seed } = spec;
  const R = rng(seed * 977 + 13);
  const k = L / REF_L;
  const B = L * 0.31;
  const H = L * 1.1;
  const { geometry: hullGeo, fbMid, free } = hullGeometry(L, hull, stripe);
  const mastX = L * 0.08;
  const boat = new THREE.Group();
  const roll = new THREE.Group();
  const mirror = new THREE.Group();
  boat.add(roll);
  roll.add(mirror);

  const hullMesh = new THREE.Mesh(hullGeo, shared.hullMat);
  mirror.add(hullMesh);

  // standing rig
  const rig = [
    bone([mastX, fbMid, 0], [mastX, H, 0], 0.075 * k, 0.04 * k, 8),
    bone([mastX, H * 0.98, 0], [L * 0.5, free(1) * 0.9, 0], 0.012 * k, 0.012 * k, 3, false),
    bone([mastX, H * 0.98, 0], [-L * 0.5, free(0) * 0.9, 0], 0.01 * k, 0.01 * k, 3, false),
  ].map((geo) => prep(geo, '#d9d9d2'));
  mirror.add(new THREE.Mesh(merge(rig), shared.rigMat));

  // main sail + boom swing about the mast
  const swing = new THREE.Group();
  swing.position.set(mastX, fbMid, 0);
  const boomY = 1.35 * k;
  const mainTack = [0.05, boomY];
  const mainHead = [0.05, H - fbMid - 0.2];
  const mainClew = [-L * 0.46, boomY - 0.08 * k];
  const mainGeo = merge([
    prep(sailGeometry({ tack: mainTack, head: mainHead, clew: mainClew, draft: 0.14, color: sail, edge: new THREE.Color(sail).multiplyScalar(0.86) }), null),
    prep(bone([0.05, boomY, 0], [mainClew[0] - 0.1, mainClew[1], 0], 0.05 * k, 0.04 * k, 6), '#d9d9d2'),
  ]);
  swing.add(new THREE.Mesh(mainGeo, shared.sailMat));
  mirror.add(swing);

  // jib
  if (spec.jib !== false) {
    const jibGeo = prep(
      sailGeometry({
        tack: [L * 0.47, free(0.97) + 0.2 * k],
        head: [mastX + 0.12, H * 0.93],
        clew: [mastX - L * 0.1, 1.15 * k + fbMid],
        draft: 0.17,
        color: sail,
        edge: new THREE.Color(sail).multiplyScalar(0.86),
      }),
      null
    );
    mirror.add(new THREE.Mesh(jibGeo, shared.sailMat));
  }

  // wake / foam decal: drawn right after the sea, before anything else, without depth test (the sea is flat, so
  // anything nearer simply overdraws it) which avoids z-fighting with the sea plane at long range
  const wakeMat = shared.makeWakeMat();
  wakeMat.map = wakeTexture(L, B);
  const wake = new THREE.Mesh(new THREE.PlaneGeometry(L * 3.4, B * 3.6), wakeMat);
  wake.rotation.x = -Math.PI / 2;
  wake.position.set(-L * 2.5 + (L * 3.4) / 2, 0, 0);
  wake.renderOrder = -4;
  boat.add(wake);

  return { boat, roll, mirror, swing, wake, wakeMat, phase: R() * 6.28, R };
}

// ---------------------------------------------------------------------------------------------
const ISLANDS = [
  // x0: rig-space x at travelled=0; z: offshore (negative); lighthouse islet has a short ring so it comes back around
  { x0: -320, z: -554, rx: 210, rz: 85, peak: 32, seed: 6.4, min: 0.34, span: 2800, fade: 260, lighthouse: true },
  { x0: -1272, z: -795, rx: 640, rz: 180, peak: 82, seed: 3.1, min: 0.5 },
  { x0: -266, z: -1067, rx: 390, rz: 150, peak: 62, seed: 8.7, min: 0.55 },
  { x0: -1601, z: -2049, rx: 1500, rz: 300, peak: 170, seed: 5.2, min: 0.72 },
  { x0: 1700, z: -900, rx: 520, rz: 160, peak: 70, seed: 1.9, min: 0.5 },
  { x0: 2900, z: -1500, rx: 900, rz: 240, peak: 120, seed: 2.6, min: 0.64 },
  { x0: -3000, z: -1200, rx: 600, rz: 200, peak: 90, seed: 9.9, min: 0.56 },
  { x0: 800, z: -2300, rx: 1300, rz: 300, peak: 200, seed: 4.4, min: 0.76 },
];

const BOATS = [
  { x0: -36, z: -88, L: 9.2, dir: 1, speed: 1.3, hull: '#f3efe6', stripe: '#1f3f6e', sail: '#f7f1e6', seed: 1 },
  { x0: -178, z: -160, L: 7.4, dir: -1, speed: 1.0, hull: '#f1ece0', stripe: '#b8322c', sail: '#f3ead8', seed: 2 },
  { x0: -144, z: -250, L: 11.5, dir: 1, speed: 1.6, hull: '#22405e', stripe: '#e8e0cf', sail: '#efe3c8', seed: 3 },
  { x0: -420, z: -330, L: 8, dir: 1, speed: 1.1, hull: '#f4efe5', stripe: '#1e7a78', sail: '#f7f1e6', seed: 4 },
  { x0: 240, z: -130, L: 6.8, dir: -1, speed: 0.8, hull: '#e9e1cf', stripe: '#8a5a2c', sail: '#d8622f', seed: 5 },
  { x0: 420, z: -420, L: 9, dir: -1, speed: 1.2, hull: '#f2eee4', stripe: '#c88a2a', sail: '#f7f1e6', seed: 6 },
  { x0: 560, z: -200, L: 8.4, dir: 1, speed: 1.4, hull: '#1c3a4a', stripe: '#d7c9a3', sail: '#f3ead8', seed: 7 },
  { x0: -610, z: -120, L: 7.8, dir: -1, speed: 0.9, hull: '#f1ece0', stripe: '#2d6a3a', sail: '#f7f1e6', seed: 8 },
];

export function createHorizon({ scene, atmosphere }) {
  const U = atmosphere.U;
  const group = new THREE.Group();
  group.name = 'horizon';
  scene.add(group);

  // ----- islands
  const islands = ISLANDS.map((spec) => {
    const { geometry, height } = buildIsland(spec);
    const mesh = new THREE.Mesh(geometry, hazeMaterial(U, { min: spec.min, max: 0.9 }));
    mesh.frustumCulled = false;
    mesh.position.set(spec.x0, SEA_Y, spec.z);
    group.add(mesh);
    const span = spec.span ?? 7000;
    return { ...spec, mesh, height, span, back: -span / 2, fadeLen: spec.fade ?? 520 };
  });

  // ----- lighthouse on the islet flagged `lighthouse`
  const lighthouse = buildLighthouse(U);
  const hostIdx = islands.findIndex((i) => i.lighthouse);
  const host = islands[hostIdx];
  const hostTop = host.height(-12, -6).h;
  const lhOffset = { x: -12, z: -6 };
  group.add(lighthouse.group);

  // ----- boats
  const shared = {
    hullMat: hazePatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0 }), U, 'hull'),
    sailMat: hazePatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide }), U, 'sail', { translucent: 0.9 }),
    rigMat: hazePatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.75 }), U, 'rig'),
    makeWakeMat: () =>
      hazePatch(new THREE.MeshBasicMaterial({ transparent: false, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, color: 0x888888 }), U, 'wake'),
  };
  const boats = BOATS.map((spec) => {
    const b = buildBoat(spec, shared);
    const s = spec.scale ?? 1;
    b.spec = spec;
    b.s = s;
    b.yaw = spec.dir > 0 ? 0 : Math.PI;
    b.yaw += (b.R() - 0.5) * 0.16;
    b.boat.rotation.order = 'YXZ';
    b.mirror.scale.z = spec.dir > 0 ? 1 : -1;
    b.heel = deg(5 + b.R() * 5) * (spec.dir > 0 ? 1 : -1);
    b.vx = Math.cos(b.yaw) * spec.speed;
    b.vz = 0;
    group.add(b.boat);
    return b;
  });

  const atm = { foam: new THREE.Color() };
  let lastTime = 0;

  function update(travelled, time, dt, camera) {
    lastTime = time;
    if (camera) lighthouse.update(time, camera);
    for (const isl of islands) {
      const x = wrapX(isl.x0, travelled, isl.span, isl.back);
      const k = smoothstep(0, isl.fadeLen, x - isl.back) * smoothstep(0, isl.fadeLen, isl.back + isl.span - x);
      isl.mesh.position.x = x;
      isl.mesh.scale.y = Math.max(k, 1e-3);
      isl.mesh.visible = k > 0.002;
      if (isl.lighthouse) {
        lighthouse.group.visible = k > 0.002;
        lighthouse.group.position.set(x + lhOffset.x, SEA_Y + hostTop * k, isl.z + lhOffset.z);
        lighthouse.group.scale.setScalar(Math.max(k, 1e-3));
      }
    }
    for (const b of boats) {
      const x = wrapX(b.spec.x0 + b.vx * time, travelled, BOAT_SPAN, BOAT_BACK);
      const k = smoothstep(0, 90, x - BOAT_BACK) * smoothstep(0, 90, BOAT_BACK + BOAT_SPAN - x);
      const ph = b.phase;
      b.boat.visible = k > 0.01;
      b.boat.position.set(x, SEA_Y + 0.04 + 0.09 * Math.sin(time * 0.72 + ph), b.spec.z);
      b.boat.scale.setScalar(Math.max(k, 1e-3));
      b.boat.rotation.y = b.yaw;
      b.boat.rotation.z = 0.025 * Math.sin(time * 0.83 + ph * 1.3);
      b.roll.rotation.x = b.heel * (1 + 0.12 * Math.sin(time * 0.5 + ph)) + 0.03 * Math.sin(time * 0.93 + ph) * Math.sign(b.heel);
      b.swing.rotation.y = 0.32 + 0.025 * Math.sin(time * 1.3 + ph);
    }
  }

  function setAtmosphere(name, p) {
    lighthouse.setLamp(p.lamp ?? 0);
    const k = 0.25 + 0.35 * Math.sin(deg(p.sunEl));
    atm.foam.set(p.sunColor).lerp(new THREE.Color(1, 1, 1), 0.55).multiplyScalar(k);
    for (const b of boats) b.wakeMat.color.copy(atm.foam);
  }

  function locate(kind, nth = 0, nearX = 0, ahead = 0, travelled = 0) {
    const list = [];
    if (kind === 'boat') {
      for (const b of boats) {
        const x = wrapX(b.spec.x0 + b.vx * lastTime, travelled + ahead, BOAT_SPAN, BOAT_BACK);
        list.push({ x, y: SEA_Y + 1.2 * (b.spec.L / REF_L), z: b.spec.z });
      }
    } else if (kind === 'lighthouse') {
      const x = wrapX(host.x0, travelled + ahead, host.span, host.back);
      list.push({ x: x + lhOffset.x, y: SEA_Y + hostTop + 14, z: host.z + lhOffset.z });
    } else if (kind === 'island') {
      for (const i of islands) list.push({ x: wrapX(i.x0, travelled + ahead, i.span, i.back), y: SEA_Y + i.peak * 0.4, z: i.z });
    }
    list.sort((a, b) => Math.abs(a.x - nearX) - Math.abs(b.x - nearX));
    return list[nth] || null;
  }

  return { group, update, setAtmosphere, locate, islands, boats, lighthouse };
}
