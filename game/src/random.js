// random.js — a tiny seeded generator so the world is the same on every
// visit and in every screenshot. Nothing in the game uses Math.random.

export function makeRng(seed) {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return function next() {
    // xorshift32: small, fast, and good enough for scattering trees.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}
