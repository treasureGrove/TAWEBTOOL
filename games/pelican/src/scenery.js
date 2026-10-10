// Scenery registry: every layer exposes update(travelled, time, dt, camera), setAtmosphere(name, preset) and
// locate(kind, nth, nearX, ahead, travelled). Layers: roadside props (props.js), the sea horizon (horizon.js).
import { createProps } from './props.js';
import { createHorizon } from './horizon.js';
import { createLife } from './life.js';

export function createScenery({ scene, atmosphere, terrain, camera, renderer }) {
  let travelled = 0;
  const layers = [
    createProps({ scene, atmosphere, terrain }),
    createHorizon({ scene, atmosphere, terrain }),
    createLife({ scene, atmosphere, renderer }),
  ];

  function update(dt, distance, time) {
    travelled += distance;
    for (const l of layers) l.update(travelled, time, dt, camera);
  }
  function setAtmosphere(name, preset) {
    for (const l of layers) l.setAtmosphere?.(name, preset);
  }
  function locate(kind, nth = 0, nearX = 0, ahead = 0) {
    for (const l of layers) {
      const p = l.locate?.(kind, nth, nearX, ahead, travelled);
      if (p) return p;
    }
    return null;
  }
  return {
    update,
    setAtmosphere,
    locate,
    layers,
    get travelled() {
      return travelled;
    },
  };
}
