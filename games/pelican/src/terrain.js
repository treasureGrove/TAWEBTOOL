// Ground, road, sea wall, beach, sea and meadow. Surfaces are procedural shaders keyed on world position
// plus a scroll offset, so detail stays crisp at any distance while the bike stays parked at the origin.
import * as THREE from 'three';
import { GLSL_NOISE, rng } from './util.js';
import { SKY_GLSL } from './atmosphere.js';

// Layout across the road (world Z). The bike rides at z = 0.
export const LAYOUT = {
  roadL: -2.2, roadR: 4.2, centerLine: 1.0,
  curbTop: 0.13, sidewalkL: -3.4,
  wallL: -3.95, wallTop: 0.56,
  seaY: -2.4,
};

const COMMON = /* glsl */ `
  ${GLSL_NOISE}
  vec3 S(vec3 c){ return pow(c, vec3(2.2)); }
`;

const ROAD = /* glsl */ `
  vec3 roadAlbedo(vec2 w, vec3 wp, vec3 n){
    float z = wp.z;
    float dist = length(cameraPosition - wp);
    float near = 1.0 - smoothstep(14.0, 70.0, dist);
    float large = fbm(w * 0.30);
    float mid = fbm(w * 2.4);
    float fine = vnoise(w * 30.0);
    float grain = hash21(floor(w * 300.0));
    vec3 col = vec3(0.092, 0.095, 0.106);
    col *= 0.72 + 0.56 * large;
    col *= 0.86 + 0.28 * mid;
    col *= 1.0 - 0.10 * near + 0.20 * near * fine;
    col += step(0.972, grain) * 0.045 * near;

    float track = exp(-pow((z + 0.05) / 0.38, 2.0));
    col *= 1.0 - 0.12 * track * (0.5 + 0.5 * mid);

    float aaz = max(fwidth(z) * 1.3, 0.004);
    float aax = max(fwidth(w.x) * 1.3, 0.004);
    float e0 = 1.0 - smoothstep(0.055 - aaz, 0.055 + aaz, abs(z + 1.9));
    float e1 = 1.0 - smoothstep(0.055 - aaz, 0.055 + aaz, abs(z - 3.9));
    float ph = mod(w.x, 8.0);
    float dash = smoothstep(0.0, aax, ph) * (1.0 - smoothstep(3.5 - aax, 3.5 + aax, ph));
    float c0 = (1.0 - smoothstep(0.06 - aaz, 0.06 + aaz, abs(z - 1.0))) * dash;
    float mask = clamp(e0 + e1 + c0, 0.0, 1.0);
    float wear = smoothstep(0.26, 0.60, fbm(w * vec2(10.0, 34.0)) + 0.18 * large);
    wear = mix(0.85, wear, near);
    vec3 paint = S(vec3(0.84, 0.80, 0.68)) * (0.82 + 0.2 * mid);
    col = mix(col, paint, mask * wear);
    return col;
  }
`;

const CONCRETE = /* glsl */ `
  vec3 concreteAlbedo(vec2 w, vec3 wp, vec3 n){
    vec2 uv = abs(n.y) > 0.5 ? vec2(w.x, wp.z) : vec2(w.x, wp.y);
    float dist = length(cameraPosition - wp);
    float near = 1.0 - smoothstep(12.0, 60.0, dist);
    vec3 col = S(vec3(0.70, 0.67, 0.62));
    col *= 0.80 + 0.35 * fbm(uv * 1.5);
    col *= 0.94 + 0.10 * near * vnoise(uv * 60.0);
    float aa = max(fwidth(uv.x) * 1.4, 0.004);
    float joint = 1.0 - smoothstep(0.012 - aa, 0.012 + aa, abs(fract(uv.x / 2.0 + 0.5) - 0.5) * 2.0);
    col *= 1.0 - 0.38 * joint * (0.4 + 0.6 * near);
    return col;
  }
`;

const STONE = /* glsl */ `
  vec3 stoneAlbedo(vec2 w, vec3 wp, vec3 n){
    bool top = abs(n.y) > 0.5;
    vec2 uv = top ? vec2(w.x, wp.z) : vec2(w.x, wp.y);
    float dist = length(cameraPosition - wp);
    float near = 1.0 - smoothstep(14.0, 70.0, dist);
    float bh = top ? 0.5 : 0.30;
    float row = floor(uv.y / bh);
    float off = mod(row, 2.0) * 0.45;
    vec2 cell = vec2(floor((uv.x + off) / 0.9), row);
    vec2 f = vec2(fract((uv.x + off) / 0.9), fract(uv.y / bh));
    float h = hash21(cell + 11.0);
    vec3 a = S(vec3(0.74, 0.66, 0.54));
    vec3 b = S(vec3(0.58, 0.54, 0.50));
    vec3 c = S(vec3(0.82, 0.72, 0.55));
    vec3 stone = mix(a, b, h);
    stone = mix(stone, c, smoothstep(0.7, 1.0, hash21(cell + 4.0)) * 0.7);
    stone *= 0.82 + 0.36 * fbm(uv * 3.0 + h * 10.0);
    stone *= 0.92 + 0.14 * near * vnoise(uv * 40.0);
    float aa = 0.012;
    float mx = min(f.x, 1.0 - f.x) * 0.9;
    float my = min(f.y, 1.0 - f.y) * bh;
    float mortar = 1.0 - smoothstep(0.012 - aa, 0.012 + aa + 0.01, min(mx, my));
    stone = mix(stone, S(vec3(0.34, 0.31, 0.28)), mortar * 0.85);
    // mossy toe near the ground and warm top light
    stone = mix(stone, S(vec3(0.30, 0.42, 0.22)), (1.0 - smoothstep(0.0, 0.22, wp.y)) * 0.35 * fbm(uv * 6.0));
    return stone;
  }
`;

const SAND = /* glsl */ `
  vec3 sandAlbedo(vec2 w, vec3 wp, vec3 n){
    float n1 = fbm(w * 0.5);
    float n2 = vnoise(w * 25.0 + wp.z * 7.0);
    vec3 col = mix(S(vec3(0.89, 0.78, 0.60)), S(vec3(0.80, 0.68, 0.50)), n1);
    col *= 0.92 + 0.14 * n2;
    float rip = sin(wp.z * 9.0 + fbm(w * 1.2) * 6.0);
    col *= 0.95 + 0.05 * rip;
    float wet = smoothstep(-1.5, -2.35, wp.y);
    col = mix(col, col * S(vec3(0.62, 0.58, 0.55)), wet);
    return col;
  }
`;

const MEADOW = /* glsl */ `
  vec3 meadowAlbedo(vec2 w, vec3 wp, vec3 n){
    float dist = length(cameraPosition - wp);
    float near = 1.0 - smoothstep(10.0, 55.0, dist);
    float n1 = fbm(w * 0.10);
    float n2 = fbm(w * 1.2);
    float blade = vnoise(w * 48.0);
    vec3 g1 = S(vec3(0.36, 0.60, 0.22));
    vec3 g2 = S(vec3(0.56, 0.76, 0.28));
    vec3 g3 = S(vec3(0.22, 0.45, 0.20));
    vec3 col = mix(g1, g2, n1);
    col = mix(col, g3, smoothstep(0.42, 0.82, n2) * 0.55);
    col *= 1.0 - 0.18 * near + 0.36 * near * blade;
    col = mix(col, S(vec3(0.72, 0.66, 0.32)), smoothstep(0.58, 0.8, fbm(w * 0.045 + 7.0)) * 0.55);

    float sc = 3.2;
    vec2 cell = floor(w * sc);
    float r = hash21(cell);
    if (r > 0.80) {
      vec2 c = (cell + 0.2 + 0.6 * hash22(cell + 3.1)) / sc;
      float d = length(w - c) * sc;
      float petal = (1.0 - smoothstep(0.11, 0.17, d)) * mix(0.35, 1.0, near);
      float k = hash21(cell + 9.0);
      vec3 fc = k < 0.30 ? S(vec3(1.0, 0.98, 0.92)) : (k < 0.55 ? S(vec3(1.0, 0.82, 0.25)) : (k < 0.80 ? S(vec3(1.0, 0.55, 0.68)) : S(vec3(0.74, 0.62, 0.98))));
      col = mix(col, fc, petal);
      col = mix(col, S(vec3(0.95, 0.75, 0.2)), (1.0 - smoothstep(0.0, 0.05, d)) * petal);
    }
    return col;
  }
`;

export function createTerrain({ scene, atmosphere }) {
  const scroll = { value: 0 };
  const U = atmosphere.U;
  let keyId = 0;

  function patch(mat, chunk, fn, { scrolls = true } = {}) {
    const key = `terrain-${fn}-${keyId++}`;
    mat.customProgramCacheKey = () => key;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uScroll = scroll;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWN;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * normal);'
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWN;\nuniform float uScroll;\n${COMMON}\n${chunk}`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>\n diffuseColor.rgb = ${fn}(vec2(vWPos.x + ${scrolls ? 'uScroll' : '0.0'}, vWPos.z), vWPos, normalize(vWN));`
        );
    };
    return mat;
  }
  const std = (rough = 0.9) => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: rough, metalness: 0 });

  const group = new THREE.Group();
  scene.add(group);
  const L = LAYOUT;

  // Road
  const road = new THREE.Mesh(new THREE.PlaneGeometry(2400, L.roadR - L.roadL), patch(std(0.92), ROAD, 'roadAlbedo'));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, (L.roadR + L.roadL) / 2);
  road.receiveShadow = true;
  group.add(road);

  // Sidewalk + curb
  const sw = new THREE.Mesh(
    new THREE.BoxGeometry(2400, L.curbTop, L.roadL - L.sidewalkL),
    patch(std(0.95), CONCRETE, 'concreteAlbedo')
  );
  sw.position.set(0, L.curbTop / 2, (L.roadL + L.sidewalkL) / 2);
  sw.receiveShadow = true;
  sw.castShadow = true;
  group.add(sw);

  // Sea wall
  const wallW = L.sidewalkL - L.wallL;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(2400, L.wallTop, wallW), patch(std(0.9), STONE, 'stoneAlbedo'));
  wall.position.set(0, L.wallTop / 2, (L.sidewalkL + L.wallL) / 2);
  wall.receiveShadow = true;
  wall.castShadow = true;
  group.add(wall);

  // Beach slope that dives under the sea. Built from explicit vertices so the facing is unambiguous.
  const beachLen = 60;
  const bz0 = L.wallL - 0.05;
  const by0 = 0.35;
  const bz1 = bz0 - beachLen;
  const by1 = L.seaY - 2.0;
  const beachGeo = new THREE.BufferGeometry();
  const bw = 1200;
  beachGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-bw, by0, bz0, bw, by0, bz0, -bw, by1, bz1, bw, by1, bz1], 3)
  );
  beachGeo.setIndex([0, 1, 2, 1, 3, 2]);
  beachGeo.computeVertexNormals();
  const beach = new THREE.Mesh(beachGeo, patch(std(0.95), SAND, 'sandAlbedo'));
  beach.receiveShadow = true;
  group.add(beach);
  const shoreT = (by0 - L.seaY) / (by0 - by1);
  const shoreZ = bz0 - shoreT * beachLen;
  // ground height of the beach at world z (flat up against the wall, then sloping into the sea)
  const beachH = (z) => (z >= bz0 ? by0 : by0 + (by1 - by0) * Math.min(1, (bz0 - z) / beachLen));

  // Meadow + hills (one displaced grid, flat near the road)
  const mw = 1800;
  const md = 900;
  const mg = new THREE.PlaneGeometry(mw, md, 180, 150);
  mg.rotateX(-Math.PI / 2);
  const mp = mg.attributes.position;
  const hillNoise = (() => {
    const r = rng(77);
    const g = Array.from({ length: 64 * 64 }, () => r());
    const at = (x, z) => g[(((z % 64) + 64) % 64) * 64 + (((x % 64) + 64) % 64)];
    return (x, z) => {
      const xi = Math.floor(x);
      const zi = Math.floor(z);
      const fx = x - xi;
      const fz = z - zi;
      const u = fx * fx * (3 - 2 * fx);
      const v = fz * fz * (3 - 2 * fz);
      return (at(xi, zi) * (1 - u) + at(xi + 1, zi) * u) * (1 - v) + (at(xi, zi + 1) * (1 - u) + at(xi + 1, zi + 1) * u) * v;
    };
  })();
  const hillH = (x, z) => {
    const zz = z - L.roadR;
    const ramp = Math.min(1, Math.max(0, (zz - 24) / 220));
    const r = ramp * ramp * (3 - 2 * ramp);
    const n = 0.55 * hillNoise(x * 0.006 + 3, zz * 0.009) + 0.3 * hillNoise(x * 0.016, zz * 0.02 + 5) + 0.15 * hillNoise(x * 0.05, zz * 0.05);
    const gentle = Math.min(1, Math.max(0, (zz - 8) / 30)) * 0.9 * (0.5 + 0.5 * Math.sin(x * 0.03));
    return r * (10 + 120 * n * n) * 0.6 + gentle;
  };
  for (let i = 0; i < mp.count; i++) {
    const x = mp.getX(i);
    const z = mp.getZ(i);
    mp.setY(i, hillH(x, z + md / 2 + L.roadR));
  }
  mg.computeVertexNormals();
  const meadow = new THREE.Mesh(mg, patch(std(0.96), MEADOW, 'meadowAlbedo'));
  meadow.position.set(0, 0, L.roadR + md / 2);
  meadow.receiveShadow = true;
  group.add(meadow);
  // ----- Sea
  const seaMat = new THREE.ShaderMaterial({
    uniforms: { ...U, uShoreZ: { value: shoreZ } },
    transparent: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      ${SKY_GLSL}
      uniform float uShoreZ;
      uniform vec3 uSeaDeep;
      uniform vec3 uSeaShallow;
      varying vec3 vWorld;
      vec2 waveGrad(vec2 p, float t){
        vec2 g = vec2(0.0);
        g += vec2( 0.86, 0.50) * 0.050 * 0.55 * cos(dot(vec2( 0.86, 0.50), p) * 0.55 + t * 0.80);
        g += vec2(-0.50, 0.86) * 0.035 * 0.95 * cos(dot(vec2(-0.50, 0.86), p) * 0.95 + t * 1.10);
        g += vec2( 0.30,-0.95) * 0.024 * 1.70 * cos(dot(vec2( 0.30,-0.95), p) * 1.70 + t * 1.45);
        g += vec2( 0.95, 0.30) * 0.016 * 3.10 * cos(dot(vec2( 0.95, 0.30), p) * 3.10 + t * 1.90);
        float e = 0.06;
        float q = 2.3;
        float a = fbm(p * q + t * 0.12);
        g += vec2(fbm((p + vec2(e, 0.0)) * q + t * 0.12) - a, fbm((p + vec2(0.0, e)) * q + t * 0.12) - a) / e * 0.020;
        return g;
      }
      void main(){
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        vec3 V = toCam / dist;
        vec2 g = waveGrad(vWorld.xz * 0.8 + vec2(uTime * 0.05, 0.0), uTime);
        float fade = 1.0 - smoothstep(40.0, 420.0, dist);
        vec3 N = normalize(vec3(-g.x * fade * 1.5, 1.0, -g.y * fade * 1.5));
        vec3 R = reflect(-V, N);
        R.y = abs(R.y);
        vec3 refl = skyColor(R);
        float cosv = max(dot(N, V), 0.0);
        float fres = 0.03 + 0.97 * pow(1.0 - cosv, 5.0);

        float depthT = smoothstep(uShoreZ + 14.0, uShoreZ - 2.0, vWorld.z);
        vec3 body = mix(uSeaShallow, uSeaDeep, clamp(depthT * 1.1 + 0.15, 0.0, 1.0));
        body *= 0.85 + 0.30 * fbm(vWorld.xz * 0.08 + uTime * 0.01);
        vec3 col = mix(body, refl, clamp(fres, 0.0, 1.0));

        // sun glitter
        vec3 H = normalize(V + uSunDir);
        float spec = pow(max(dot(N, H), 0.0), 900.0);
        float spec2 = pow(max(dot(N, H), 0.0), 90.0);
        col += uSunColor * (spec * 22.0 + spec2 * 0.9) * (0.45 + 0.55 * fade);

        // shore foam
        float sd = vWorld.z - uShoreZ;
        float wob = sin(vWorld.x * 0.35 + uTime * 0.7) * 0.5 + sin(vWorld.x * 0.9 - uTime * 0.5) * 0.25;
        float line = 1.0 - smoothstep(0.0, 1.6, abs(sd - 1.2 - wob - 0.6 * sin(uTime * 0.6)));
        float foam = line * smoothstep(0.35, 0.8, fbm(vWorld.xz * 1.8 + uTime * 0.2));
        col = mix(col, vec3(1.0, 0.97, 0.92) * (0.9 + 0.4 * uSunColor), foam * 0.85 * (1.0 - smoothstep(60.0, 200.0, dist)));

        // aerial perspective into the horizon colour
        float haze = 1.0 - exp(-dist * 0.0016);
        col = mix(col, uHorizon, haze * 0.55);

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000, 1, 1), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = L.seaY;
  sea.frustumCulled = false;
  sea.renderOrder = -5;
  scene.add(sea);

  // Far headlands on the sea side, tinted by haze (fog off so they stay readable at distance).
  const islandGroup = new THREE.Group();
  scene.add(islandGroup);

  function update(travelled, camera) {
    scroll.value = travelled % 2048;
    sea.position.x = Math.round(camera.position.x / 100) * 100;
    sea.position.z = Math.round(camera.position.z / 100) * 100;
  }

  return { group, sea, islandGroup, update, scroll, seaMat, hillH, beachH, shoreZ };
}
