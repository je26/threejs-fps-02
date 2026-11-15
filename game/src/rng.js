// Seeded random number generator (mulberry32). One job: deterministic
// randomness for textures, bot skill rolls and map dressing, so a given seed
// always builds the same world.

export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Gameplay RNG: one shared stream, seeded once per match so bot behaviour is
// reproducible for a given match seed while still varying between matches.
let stream = makeRng(0xc1d3);
export function reseed(n) { stream = makeRng(n >>> 0); }
export function rnd() { return stream(); }
export function rndRange(a, b) { return a + stream() * (b - a); }
export function rndInt(a, b) { return a + Math.floor(stream() * (b - a + 1)); }
export function pick(arr) { return arr[Math.floor(stream() * arr.length)]; }
