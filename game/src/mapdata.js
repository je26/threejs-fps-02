// Cinder Quay: the original map. One job: layout data only — colliders,
// site zones, spawns and the waypoint graph the bots navigate. No rendering
// code lives here; world.js turns this data into meshes.
//
// Compass: -Z is north (defender side), +Z is south (attacker side).
// Three lanes: west lane to Site A, east lane to Site B, and a middle
// connector through the warehouse doors. Coordinates are metres.

function rect(cx, cz, w, d, h, kind, y0) {
  return { x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2, h, kind, y0: y0 || 0 };
}

// --- Verticality: the Quay Gantry -----------------------------------------
// A raised overlook deck spans mid, reached by a ramp on each side. The
// deck is open underneath: ground-level play passes below it, and fighters
// on top can shoot down the mid lanes or fall off the edges. DECKS are
// walkable slabs (not colliders: their top is a floor, see groundHeight);
// RAMPS are sloped floors rising from the ground to the deck top.
export const DECK_TOP = 2.6;
export const DECKS = [
  { x0: -4, z0: -7.2, x1: 4, z1: -4, top: DECK_TOP },
];
export const RAMPS = [
  // West ramp: rises from the ground at x=-8 to the deck at x=-4.
  { x0: -8, z0: -7.2, x1: -4, z1: -4, h0: 0, h1: DECK_TOP },
  // East ramp: deck height at x=4, ground at x=8.
  { x0: 4, z0: -7.2, x1: 8, z1: -4, h0: DECK_TOP, h1: 0 },
];

// Floor height under a point. Ramps always count (they are continuous with
// the ground); a deck only counts when the feet are already near its top,
// so an actor walking underneath never snaps up onto it.
export function groundHeight(x, z, feetY) {
  let g = 0;
  for (const r of RAMPS) {
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) {
      const t = (x - r.x0) / (r.x1 - r.x0);
      const h = r.h0 + (r.h1 - r.h0) * t;
      if (h > g) g = h;
    }
  }
  for (const d of DECKS) {
    if (feetY >= d.top - 0.7 && x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) {
      if (d.top > g) g = d.top;
    }
  }
  return g;
}

export const MAP_BOUNDS = { x0: -30.8, z0: -22.8, x1: 30.8, z1: 22.8 };

export const COLLIDERS = [
  // Perimeter.
  rect(0, -23.4, 64, 1.2, 4.5, 'wall'),
  rect(0, 23.4, 64, 1.2, 4.5, 'wall'),
  rect(-31.4, 0, 1.2, 48, 4.5, 'wall'),
  rect(31.4, 0, 1.2, 48, 4.5, 'wall'),
  // Warehouses flanking mid.
  rect(-17, 3, 12, 10, 4.5, 'block'),
  rect(17, 3, 12, 10, 4.5, 'block'),
  // North centre block (forces mid traffic through the side connectors).
  rect(0, -10, 10, 6, 4.5, 'block'),
  // South kiosk in front of the attacker spawn.
  rect(0, 13, 6, 4, 3, 'block'),
  // Mid door pillars: the choke between the warehouses.
  rect(-1.6, -3.6, 0.8, 0.8, 4.5, 'wall'),
  rect(1.6, -3.6, 0.8, 0.8, 4.5, 'wall'),
  // Low cover walls inside the sites (waist height, can be shot over).
  rect(-28, -13.5, 4, 1, 1.25, 'lowwall'),
  rect(-20.5, -17.2, 3, 1, 1.25, 'lowwall'),
  rect(28, -13.5, 4, 1, 1.25, 'lowwall'),
  rect(20.5, -17.2, 3, 1, 1.25, 'lowwall'),
  // Shipping containers narrowing the outer lanes.
  rect(-28.5, -6, 3, 4, 2.6, 'container'),
  rect(28.5, -6, 3, 4, 2.6, 'container'),
  rect(-28, 18.5, 4, 2.5, 2.6, 'container'),
  rect(28, 18.5, 4, 2.5, 2.6, 'container'),
  // Crates: cover dotted through every lane.
  rect(-25.5, 2.5, 1.6, 1.6, 1.2, 'crate'),
  rect(25.5, 2.5, 1.6, 1.6, 1.2, 'crate'),
  rect(-7.5, -3.4, 1.6, 1.6, 2.2, 'crate'),
  rect(7.5, -3.4, 1.6, 1.6, 2.2, 'crate'),
  rect(-27, -18, 1.6, 1.6, 1.2, 'crate'),
  rect(27, -18, 1.6, 1.6, 1.2, 'crate'),
  rect(-21, -12.5, 1.6, 1.6, 2.2, 'crate'),
  rect(21, -12.5, 1.6, 1.6, 2.2, 'crate'),
  rect(-6, 17, 1.6, 1.6, 1.2, 'crate'),
  rect(6, 17, 1.6, 1.6, 1.2, 'crate'),
  rect(-10.5, -16.8, 1.6, 1.6, 2.2, 'crate'),
  rect(10.5, -16.8, 1.6, 1.6, 2.2, 'crate'),
  // Barrels (square colliders, round meshes).
  rect(-24, 10, 0.9, 0.9, 1.1, 'barrel'),
  rect(24, 10, 0.9, 0.9, 1.1, 'barrel'),
  rect(-13, -9, 0.9, 0.9, 1.1, 'barrel'),
  rect(13, -9, 0.9, 0.9, 1.1, 'barrel'),
  rect(2.5, -18, 0.9, 0.9, 1.1, 'barrel'),
  // Gantry support posts: ground-level obstacles that hold the deck up.
  // Their tops sit exactly at deck height, so actors standing on the deck
  // step over them (collideMove skips a collider at or below feet level).
  rect(-3.6, -6.8, 0.5, 0.5, DECK_TOP, 'post'),
  rect(3.6, -6.8, 0.5, 0.5, DECK_TOP, 'post'),
  rect(-3.6, -4.4, 0.5, 0.5, DECK_TOP, 'post'),
  rect(3.6, -4.4, 0.5, 0.5, DECK_TOP, 'post'),
  // Cover crate sitting ON the deck: y0 lifts it clear of ground play, so
  // only actors up on the gantry collide with it or are shielded by it.
  rect(-2.2, -6.3, 1.5, 1.5, DECK_TOP + 1.2, 'crate', DECK_TOP),
];

export const SITES = {
  A: { id: 'A', x0: -30.5, z0: -21.5, x1: -19.5, z1: -10.5, cx: -25, cz: -16 },
  B: { id: 'B', x0: 19.5, z0: -21.5, x1: 30.5, z1: -10.5, cx: 25, cz: -16 },
};

export function siteAt(x, z) {
  for (const id of ['A', 'B']) {
    const s = SITES[id];
    if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return id;
  }
  return null;
}

export const SPAWNS = {
  atk: [
    { x: 0, z: 20.5 }, { x: -4, z: 20 }, { x: 4, z: 20 },
    { x: -8, z: 19 }, { x: 8, z: 19 },
  ],
  def: [
    { x: 0, z: -20.5 }, { x: -4, z: -20 }, { x: 4, z: -20 },
    { x: -8, z: -19 }, { x: 8, z: -19 },
  ],
};

export const SPAWN_YAW = { atk: 0, def: Math.PI };

// Waypoint graph. Nodes sit in open ground; edges never cross a collider.
export const WAYPOINTS = [
  { x: 0, z: 19.5 }, { x: -14, z: 18 }, { x: 14, z: 18 }, { x: 0, z: 9 },
  { x: -27, z: 12 }, { x: 27, z: 12 }, { x: -27, z: 0 }, { x: 27, z: 0 },
  { x: -26, z: -10 }, { x: 26, z: -10 }, { x: 0, z: 4 }, { x: 0, z: -1 },
  { x: 0, z: -5.5 }, { x: -9.5, z: -5 }, { x: 9.5, z: -5 },
  { x: -16, z: -9.5 }, { x: 16, z: -9.5 }, { x: -25, z: -16 }, { x: 25, z: -16 },
  { x: -13, z: -16 }, { x: 13, z: -16 }, { x: 0, z: -19.5 },
  { x: -14, z: -19.5 }, { x: 14, z: -19.5 }, { x: 0, z: -15.5 },
  { x: -8.5, z: -15 }, { x: 8.5, z: -15 }, { x: -20, z: -6 }, { x: 20, z: -6 },
  // Gantry nodes (29-33): ramp feet, deck ends and the deck centre. Bots
  // walk the ramps in plain XZ steering; the floor-height rule in
  // movement.js carries them up the slope and onto the deck. The line runs
  // at z=-5.0, clear of the deck crate's south face, so bots crossing the
  // deck are never wedged against it.
  { x: -9, z: -5 }, { x: -3.4, z: -5 }, { x: 0, z: -5 },
  { x: 3.4, z: -5 }, { x: 9, z: -5 },
];

export const EDGES = [
  [0, 1], [0, 2], [0, 3], [1, 4], [2, 5], [1, 3], [2, 3], [3, 10],
  [4, 6], [5, 7], [6, 8], [7, 9], [6, 27], [7, 28], [8, 17], [9, 18],
  [8, 27], [9, 28], [27, 15], [28, 16], [15, 17], [16, 18], [15, 19],
  [16, 20], [10, 11], [11, 12], [12, 13], [12, 14], [13, 15], [14, 16],
  [13, 27], [14, 28], [13, 25], [14, 26], [25, 19], [26, 20], [25, 24],
  [26, 24], [24, 21], [22, 21], [23, 21], [22, 19], [23, 20], [19, 17],
  [20, 18], [22, 24], [23, 24],
  // Gantry: ground node 12 links to both ramp feet, ramps climb to the
  // deck ends, and the deck centre links both ends.
  [12, 29], [12, 33], [29, 30], [30, 31], [31, 32], [32, 33],
  [29, 13], [33, 14],
];

// Defender hold spots: waypoint index + the yaw to watch while holding.
// The first mid spot is the gantry deck, watching south down the mid doors.
export const HOLD_SPOTS = {
  A: [{ node: 17, yaw: 0.6 }, { node: 19, yaw: -0.4 }, { node: 25, yaw: 2.6 }],
  B: [{ node: 18, yaw: -0.6 }, { node: 20, yaw: 0.4 }, { node: 26, yaw: -2.6 }],
  mid: [{ node: 31, yaw: Math.PI }, { node: 24, yaw: 0 }, { node: 12, yaw: Math.PI }],
};

export function nearestNode(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const dx = WAYPOINTS[i].x - x, dz = WAYPOINTS[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// Breadth-first shortest path over the waypoint graph. Returns node indices
// from start to goal inclusive. Scratch arrays are module-level: no per-call
// allocation beyond the returned path.
const bfsPrev = new Int16Array(64);
const bfsQueue = new Int16Array(64);
const ADJ = WAYPOINTS.map(() => []);
for (const [a, b] of EDGES) { ADJ[a].push(b); ADJ[b].push(a); }

export function findPath(fromNode, toNode) {
  if (fromNode === toNode) return [toNode];
  bfsPrev.fill(-1);
  let qh = 0, qt = 0;
  bfsQueue[qt++] = fromNode;
  bfsPrev[fromNode] = fromNode;
  while (qh < qt) {
    const n = bfsQueue[qh++];
    for (const m of ADJ[n]) {
      if (bfsPrev[m] !== -1) continue;
      bfsPrev[m] = n;
      if (m === toNode) {
        const path = [m];
        let cur = m;
        while (cur !== fromNode) { cur = bfsPrev[cur]; path.push(cur); }
        path.reverse();
        return path;
      }
      bfsQueue[qt++] = m;
    }
  }
  return [toNode];
}
