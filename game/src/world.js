// world.js — the static shape of the course: terrain colouring, scattered
// landmarks, clouds, and the ring course for a mission. Everything here is
// derived from fixed seeds, so the world never changes between runs.

import {
  COAST_X, RIVER_Z, RIVER_HALF_WIDTH, HARBOR, LEVELS, RING_RADIUS,
} from './config.js';
import { makeRng } from './random.js';

// What the ground looks like at a point, as a flat colour. The renderer
// paints the ground as a patchwork of cells coloured by their centres,
// which is what makes fields, the coast and the river recognisable.
export function terrainColor(x, z) {
  if (x < COAST_X) {
    // Open sea, banded so the water reads as moving water from altitude.
    const band = Math.floor((z + x * 0.35) / 260) % 2;
    return band === 0 ? '#2e6da8' : '#3578b5';
  }
  if (Math.abs(z - RIVER_Z) < RIVER_HALF_WIDTH && x > COAST_X) {
    return '#3f83b8'; // the river, a blue cut through the fields
  }
  if (x >= HARBOR.xFrom && x <= HARBOR.xTo && z >= HARBOR.zFrom && z <= HARBOR.zTo) {
    return '#9a8f7d'; // harbour town ground: packed gravel and concrete
  }
  if (Math.abs(x) < 70) {
    return '#7fae56'; // the airfield strip stays plain grass
  }
  // Farm patchwork: a chequer of fields whose pattern is fixed by cell.
  const cx = Math.floor(x / 200);
  const cz = Math.floor(z / 200);
  const n = ((cx * 73856093) ^ (cz * 19349663)) >>> 0;
  const shade = n % 5;
  if (shade === 0) return '#79a84f';
  if (shade === 1) return '#8ab45e';
  if (shade === 2) return '#c9b458'; // ripe wheat
  if (shade === 3) return '#6f9c48';
  return '#a8bf62';
}

// Decorations scattered once at load: trees on the farmland, houses in the
// harbour town, a lighthouse on the coast, and moored boats offshore.
export function buildScenery() {
  const rng = makeRng(20261126);
  const items = [];
  for (let i = 0; i < 240; i++) {
    const x = COAST_X + 60 + rng() * 1500;
    const z = -200 + rng() * 13200;
    if (Math.abs(x) < 110) continue;                    // keep the strip clear
    if (Math.abs(z - RIVER_Z) < 130) continue;          // not in the river
    if (x > HARBOR.xFrom - 40 && x < HARBOR.xTo && z > HARBOR.zFrom - 40 && z < HARBOR.zTo) continue;
    items.push({ kind: 'tree', x, z, size: 9 + rng() * 10 });
  }
  for (let i = 0; i < 46; i++) {
    const x = HARBOR.xFrom + 30 + rng() * (HARBOR.xTo - HARBOR.xFrom - 60);
    const z = HARBOR.zFrom + 30 + rng() * (HARBOR.zTo - HARBOR.zFrom - 60);
    items.push({ kind: 'house', x, z, size: 14 + rng() * 12, hue: Math.floor(rng() * 4) });
  }
  for (let i = 0; i < 26; i++) {
    const x = COAST_X - 90 - rng() * 420;
    const z = rng() * 13000;
    items.push({ kind: 'boat', x, z, size: 10 + rng() * 9 });
  }
  items.push({ kind: 'lighthouse', x: COAST_X - 26, z: 6950, size: 46 });
  items.push({ kind: 'hangar', x: 120, z: 120, size: 30 });
  items.push({ kind: 'hangar', x: -130, z: 12150, size: 30 });
  items.push({ kind: 'tower', x: 95, z: 480, size: 26 });
  return items;
}

// Clouds drift on fixed rails: each has a home position and a slow offset
// that is a pure function of time, so screenshots stay reproducible.
export function buildClouds() {
  const rng = makeRng(774411);
  const clouds = [];
  for (let i = 0; i < 42; i++) {
    clouds.push({
      x: -1500 + rng() * 3000,
      alt: 520 + rng() * 480,
      z: -300 + rng() * 13800,
      size: 90 + rng() * 160,
      drift: 1.5 + rng() * 3,
    });
  }
  return clouds;
}

// The ring course for a mission, with live state hung off each ring.
export function buildRings(levelIndex) {
  const level = LEVELS[levelIndex];
  return level.rings.map((r, i) => ({
    x: r.x, alt: r.alt, z: r.z, radius: RING_RADIUS,
    index: i, state: 'pending', // pending | passed | missed
  }));
}

export function levelAt(index) {
  return LEVELS[Math.min(index, LEVELS.length - 1)];
}
