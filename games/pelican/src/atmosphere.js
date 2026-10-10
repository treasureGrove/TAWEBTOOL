// Sky, light and colour presets. The sky is one analytic GLSL function shared by the sky dome, the sea
// (for reflections) and the PMREM bake that provides image-based lighting for every PBR material.
import * as THREE from 'three';
import { GLSL_NOISE, deg } from './util.js';

// azimuth is measured around +Y from +X toward +Z; elevation in degrees above the horizon.
// The sky runs horizon -> low -> mid -> zenith. The extra "low" stop (pink/lilac) matters: mixing peach
// straight into blue passes through grey, which is what makes naive sunset skies look muddy.
export const ATMOS = {
  golden: {
    label: '黄金时刻',
    sunEl: 20, sunAz: 214,
    sunColor: '#ffb26e', sunIntensity: 5.4,
    glow: '#ff9150',
    horizon: '#ffcb9a', low: '#f6b0b2', mid: '#8fb4e6', zenith: '#2c60b8', ground: '#a08a74',
    cloudLight: '#fff3e4', cloudShade: '#b9a0cc', cloudCover: 0.42,
    fog: '#f4c9ab', fogDensity: 0.0042,
    fill: '#ffe4cf', fillIntensity: 1.7,
    envIntensity: 1.05, exposure: 0.95, bloom: 0.3,
    seaDeep: '#0a5876', seaShallow: '#2aa3a8',
    lamp: 0.55,
  },
  morning: {
    label: '清晨',
    sunEl: 14, sunAz: 335,
    sunColor: '#ffd9ae', sunIntensity: 4.6,
    glow: '#ffb585',
    horizon: '#ffe3cc', low: '#f6cfd6', mid: '#a6c8ee', zenith: '#3f78c4', ground: '#9a9a92',
    cloudLight: '#ffffff', cloudShade: '#b3b8d6', cloudCover: 0.35,
    fog: '#e8e2de', fogDensity: 0.0042,
    fill: '#dbe8ff', fillIntensity: 1.6,
    envIntensity: 1.1, exposure: 0.98, bloom: 0.26,
    seaDeep: '#0e607c', seaShallow: '#3cb0b4',
    lamp: 0.18,
  },
  noon: {
    label: '正午',
    sunEl: 58, sunAz: 235,
    sunColor: '#fff4e4', sunIntensity: 5.2,
    glow: '#ffe2b8',
    horizon: '#d5e7f7', low: '#b6d4f2', mid: '#6aa8e8', zenith: '#1f64c4', ground: '#8f9080',
    cloudLight: '#ffffff', cloudShade: '#a9b9d8', cloudCover: 0.4,
    fog: '#cfe4f6', fogDensity: 0.0036,
    fill: '#d8e8ff', fillIntensity: 1.2,
    envIntensity: 1.2, exposure: 0.92, bloom: 0.16,
    seaDeep: '#07608c', seaShallow: '#25b3c0',
    lamp: 0,
  },
  dusk: {
    label: '暮色',
    sunEl: 5, sunAz: 205,
    sunColor: '#ff8a58', sunIntensity: 4.2,
    glow: '#ff5f6a',
    horizon: '#ff9a74', low: '#d98a9c', mid: '#7a68a8', zenith: '#1e2d6e', ground: '#6b5560',
    cloudLight: '#ffc4a8', cloudShade: '#5a4a86', cloudCover: 0.55,
    fog: '#d99a8e', fogDensity: 0.0042,
    fill: '#b6b0ff', fillIntensity: 1.3,
    envIntensity: 0.95, exposure: 1.05, bloom: 0.5,
    seaDeep: '#12304f', seaShallow: '#34667c',
    lamp: 1,
  },
};

export const SKY_GLSL = /* glsl */ `
  ${GLSL_NOISE}
  uniform vec3 uSunDir;
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uLow;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunColor;
  uniform vec3 uGlow;
  uniform vec3 uCloudLight;
  uniform vec3 uCloudShade;
  uniform float uCloudCover;
  uniform float uSunDisc;
  uniform float uCloudsOn;
  uniform float uTime;

  vec3 skyColor(vec3 d){
    float h = d.y;
    vec3 col = mix(uHorizon, uLow, smoothstep(0.0, 0.14, h));
    col = mix(col, uMid, smoothstep(0.10, 0.46, h));
    col = mix(col, uZenith, smoothstep(0.32, 0.98, h));
    col = mix(col, uGround, smoothstep(0.0, -0.3, h));

    float sd = max(dot(d, uSunDir), 0.0);
    float horizonBias = exp(-abs(h) * 4.0);
    col += uGlow * (0.46 * pow(sd, 4.0) * (0.30 + 0.70 * horizonBias) + 0.85 * pow(sd, 36.0));
    col += uSunColor * 1.3 * pow(sd, 380.0);
    col += uSunColor * uSunDisc * smoothstep(0.99962, 0.99988, sd) * 16.0;

    if (uCloudsOn > 0.5 && h > 0.0) {
      vec2 uv = d.xz / (h + 0.10);
      float t = uTime * 0.010;
      vec2 q = uv * 1.15 + vec2(t, t * 0.35);
      float cover = 0.54 - uCloudCover * 0.26;
      float n0 = fbm(q);
      float dens = smoothstep(cover, cover + 0.30, n0);
      float n1 = fbm(q + uSunDir.xz * 0.16);
      float dens1 = smoothstep(cover, cover + 0.30, n1);
      float lit = clamp((dens - dens1) * 3.0 + 0.66, 0.0, 1.0);
      vec3 cc = mix(uCloudShade, uCloudLight, lit);
      cc += uSunColor * pow(sd, 10.0) * 0.55 * (1.0 - 0.5 * dens);
      float fade = smoothstep(0.0, 0.16, h);
      col = mix(col, cc, dens * fade * 0.92);
    }
    return col;
  }
`;

export function createAtmosphere({ renderer, scene }) {
  const U = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uZenith: { value: new THREE.Color() },
    uMid: { value: new THREE.Color() },
    uLow: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGround: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() },
    uCloudLight: { value: new THREE.Color() },
    uCloudShade: { value: new THREE.Color() },
    uCloudCover: { value: 0.5 },
    uSunDisc: { value: 1 },
    uCloudsOn: { value: 1 },
    uTime: { value: 0 },
    uSeaDeep: { value: new THREE.Color() },
    uSeaShallow: { value: new THREE.Color() },
  };

  const skyVert = /* glsl */ `
    varying vec3 vDir;
    void main(){
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
  const skyFrag = /* glsl */ `
    ${SKY_GLSL}
    varying vec3 vDir;
    void main(){
      gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;

  const skyGeo = new THREE.SphereGeometry(1, 48, 28);
  const dome = new THREE.Mesh(
    skyGeo,
    new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
  );
  dome.scale.setScalar(3000);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  scene.add(dome);

  // Sky used only for baking image-based lighting (no sun disc / clouds; those come from direct lights).
  const envU = { ...U, uSunDisc: { value: 0 }, uCloudsOn: { value: 0 } };
  const envScene = new THREE.Scene();
  const envDome = new THREE.Mesh(
    skyGeo,
    new THREE.ShaderMaterial({ uniforms: envU, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false })
  );
  envDome.scale.setScalar(50);
  envScene.add(envDome);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;

  // ----- lights
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -3.6, right: 3.6, top: 3.6, bottom: -3.6, near: 1, far: 60 });
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.012;
  sun.target.position.set(0.1, 0.9, 0);
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(0xffffff, 1);
  fill.castShadow = false;
  scene.add(fill, fill.target);
  fill.target.position.copy(sun.target.position);

  scene.fog = new THREE.FogExp2(0xffffff, 0.01);
  scene.environmentIntensity = 1;

  const state = { name: 'golden', preset: ATMOS.golden, sunDir: new THREE.Vector3() };

  function apply(name) {
    const p = ATMOS[name] || ATMOS.golden;
    state.name = name;
    state.preset = p;
    const el = deg(p.sunEl);
    const az = deg(p.sunAz);
    state.sunDir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    U.uSunDir.value.copy(state.sunDir);
    U.uZenith.value.set(p.zenith);
    U.uMid.value.set(p.mid);
    U.uLow.value.set(p.low);
    U.uHorizon.value.set(p.horizon);
    U.uGround.value.set(p.ground);
    U.uSunColor.value.set(p.sunColor);
    U.uGlow.value.set(p.glow);
    U.uCloudLight.value.set(p.cloudLight);
    U.uCloudShade.value.set(p.cloudShade);
    U.uCloudCover.value = p.cloudCover;
    U.uSeaDeep.value.set(p.seaDeep);
    U.uSeaShallow.value.set(p.seaShallow);

    sun.color.set(p.sunColor);
    sun.intensity = p.sunIntensity;
    sun.position.copy(sun.target.position).addScaledVector(state.sunDir, 30);

    // Soft fill from the camera side of the hero shot, opposite to the key.
    fill.color.set(p.fill);
    fill.intensity = p.fillIntensity;
    fill.position.set(6, 5, 7);

    scene.fog.color.set(p.fog);
    scene.fog.density = p.fogDensity;
    scene.environmentIntensity = p.envIntensity;
    renderer.toneMappingExposure = p.exposure;

    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(envScene, 0.0, 0.1, 200);
    scene.environment = envRT.texture;
    return p;
  }

  function update(time, camera) {
    U.uTime.value = time;
    dome.position.copy(camera.position);
  }

  return { U, sun, fill, dome, state, apply, update };
}
