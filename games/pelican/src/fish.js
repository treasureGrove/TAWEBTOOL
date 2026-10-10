// The pelican's catch: plump lofted bodies with painted skin, big glossy eyes, gill line and forked fins.
// Faces +X (head) with the tail toward -X; lateral flattening is in Z, so the fish reads from the side.
import * as THREE from 'three';
import { smoothstep, Loft } from './util.js';

const PALETTES = {
  mackerel: { back: '#27566b', flank: '#b8c8d0', belly: '#f1f2ec', fin: '#3a6a79', finTip: '#14303b', stripe: true, depth: 0.15, blunt: 0.72, eye: '#f2ead0' },
  bream: { back: '#c0402c', flank: '#ea9a82', belly: '#f7e6d6', fin: '#e0603f', finTip: '#8a2216', stripe: false, depth: 0.21, blunt: 0.55, eye: '#f7d878' },
  sardine: { back: '#3c6e86', flank: '#d6e1e7', belly: '#fcfcf8', fin: '#4d7a8e', finTip: '#223f4d', stripe: false, depth: 0.13, blunt: 0.72, eye: '#fff3cf' },
};

function finGeometry(shape, scale, base, tip, reach) {
  const g = new THREE.ShapeGeometry(shape, 10);
  g.scale(scale, scale, 1);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Color(base);
  const b = new THREE.Color(tip);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const d = Math.min(1, Math.hypot(pos.getX(i), pos.getY(i)) / (reach * scale));
    c.copy(a).lerp(b, d * d);
    c.toArray(col, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function makeFish(len, kind = 'mackerel') {
  const pal = PALETTES[kind];
  const back = new THREE.Color(pal.back);
  const flank = new THREE.Color(pal.flank);
  const belly = new THREE.Color(pal.belly);
  const prof = (t) => Math.pow(Math.max(Math.sin(Math.PI * Math.pow(t, 1.5)), 0), pal.blunt);
  const stations = 40;
  const radial = 28;

  const body = new Loft({
    stations,
    radial,
    section: (t, a, out) => {
      const p = prof(t);
      const s = Math.sin(a);
      out.x = Math.cos(a) * 0.1 * len * p;
      out.y = s * pal.depth * len * p * (s < 0 ? 0.92 : 1);
    },
    color: (t, a, col) => {
      const up = Math.sin(a);
      col.copy(flank);
      if (up > 0.15) col.lerp(back, smoothstep(0.15, 0.7, up));
      if (up < -0.1) col.lerp(belly, smoothstep(-0.1, -0.6, up));
      if (pal.stripe && up > 0.2) {
        const w = 0.5 + 0.5 * Math.sin(t * 70 + up * 4);
        col.multiplyScalar(1 - 0.38 * smoothstep(0.55, 0.9, w) * smoothstep(0.2, 0.6, up));
      }
      // gill cover line and a slightly darker head
      col.multiplyScalar(1 - 0.4 * Math.exp(-Math.pow((t - 0.79) / 0.011, 2)));
      if (t > 0.86) col.lerp(back, 0.28 * smoothstep(0.86, 0.95, t));
    },
  });
  const pts = Array.from({ length: stations }, (_, i) => new THREE.Vector3((i / (stations - 1) - 0.5) * len, 0, 0));
  body.update(pts, new THREE.Vector3(0, 0, 1));

  const grp = new THREE.Group();
  const add = (geo, mat) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    grp.add(m);
    return m;
  };
  add(body.geometry, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.12, clearcoat: 0.7, clearcoatRoughness: 0.2 }));

  const finMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.55 });

  // forked tail
  const tail = new THREE.Shape();
  tail.moveTo(0, 0.018);
  tail.bezierCurveTo(-0.05, 0.05, -0.1, 0.12, -0.17, 0.15);
  tail.quadraticCurveTo(-0.115, 0.04, -0.1, 0.0);
  tail.quadraticCurveTo(-0.115, -0.04, -0.17, -0.15);
  tail.bezierCurveTo(-0.1, -0.12, -0.05, -0.05, 0, -0.018);
  tail.closePath();
  add(finGeometry(tail, len, pal.fin, pal.finTip, 0.2), finMat).position.x = -len * 0.5 + len * 0.012;

  // dorsal fin
  const dorsal = new THREE.Shape();
  dorsal.moveTo(-0.08, 0);
  dorsal.lineTo(-0.03, 0.09);
  dorsal.quadraticCurveTo(0.08, 0.06, 0.22, 0);
  dorsal.closePath();
  add(finGeometry(dorsal, len, pal.fin, pal.finTip, 0.22), finMat).position.set(0, pal.depth * len * 0.86, 0);

  // pectoral fins
  const pect = new THREE.Shape();
  pect.moveTo(0, 0);
  pect.quadraticCurveTo(-0.05, -0.035, -0.12, -0.065);
  pect.quadraticCurveTo(-0.05, 0.0, 0, 0);
  for (const s of [-1, 1]) {
    const f = add(finGeometry(pect, len, pal.fin, pal.finTip, 0.14), finMat);
    f.position.set(len * 0.28, -len * 0.03, len * 0.088 * s);
    f.rotation.x = 0.55 * s;
  }

  // eyes: pale ring + black pupil, slightly proud of the head
  const ringMat = new THREE.MeshStandardMaterial({ color: pal.eye, roughness: 0.3 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.12, metalness: 0.2 });
  const eyeT = 0.88;
  for (const s of [-1, 1]) {
    const ring = add(new THREE.SphereGeometry(len * 0.038, 14, 10), ringMat);
    ring.scale.set(1, 1, 0.6);
    ring.position.set((eyeT - 0.5) * len, len * 0.035, s * len * 0.1 * prof(eyeT) * 0.96);
    const pupil = add(new THREE.SphereGeometry(len * 0.026, 12, 10), pupilMat);
    pupil.scale.set(1, 1, 0.6);
    pupil.position.set((eyeT - 0.5) * len + len * 0.004, len * 0.036, s * (len * 0.1 * prof(eyeT) * 0.96 + len * 0.012));
  }
  // mouth slit
  const mouth = add(new THREE.SphereGeometry(len * 0.014, 8, 6), new THREE.MeshStandardMaterial({ color: 0x2a1812, roughness: 0.6 }));
  mouth.scale.set(1.8, 0.3, 1.3);
  mouth.position.set(len * 0.49, -len * 0.012, 0);
  return grp;
}
