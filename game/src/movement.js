// Movement physics and geometric queries. One job: how bodies move through
// the map and what rays hit. Closest-point circle-vs-AABB collision, gravity,
// jumping and crouching; analytic ray-vs-AABB tests reused by shooting,
// line-of-sight and grenades. All hot paths reuse module scratch values.

import { TUNE } from './config.js';
import { COLLIDERS, DECKS, MAP_BOUNDS, groundHeight } from './mapdata.js';

const R = TUNE.bodyRadius;

// Circle-vs-AABB collision by closest-point push-out. Axis-separated
// resolution traps a body in a box corner when it approaches diagonally (the
// two axes undo each other every tick); pushing out along the vector from the
// closest point on the box lets the body slide around corners. Two passes
// settle bodies wedged between neighbours. A collider only blocks while the
// actor's feet are below its top.
export function collideMove(a, dx, dz) {
  a.x += dx;
  a.z += dz;
  for (let pass = 0; pass < 2; pass++) {
    for (const c of COLLIDERS) {
      // A collider only blocks while the actor's body overlaps its height
      // span: standing on top of it (feet at its top) or walking under a
      // raised one (head below its base) both pass through freely. The
      // 0.05 tolerance covers the gravity dip between ticks, so an actor
      // standing on the gantry deck is never caught by its support posts.
      if (a.y >= c.h - 0.05 || a.y + TUNE.bodyHeight <= (c.y0 || 0)) continue;
      const cx = Math.max(c.x0, Math.min(a.x, c.x1));
      const cz = Math.max(c.z0, Math.min(a.z, c.z1));
      const ox = a.x - cx, oz = a.z - cz;
      const d2 = ox * ox + oz * oz;
      if (d2 >= R * R) continue;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        const push = (R - d) / d;
        a.x += ox * push;
        a.z += oz * push;
      } else {
        // Centre inside the footprint: leave through the nearest face.
        const exitX = Math.min(a.x - (c.x0 - R), (c.x1 + R) - a.x);
        const exitZ = Math.min(a.z - (c.z0 - R), (c.z1 + R) - a.z);
        if (exitX < exitZ) a.x = a.x - c.x0 < c.x1 - a.x ? c.x0 - R : c.x1 + R;
        else a.z = a.z - c.z0 < c.z1 - a.z ? c.z0 - R : c.z1 + R;
      }
    }
  }
  if (a.x < MAP_BOUNDS.x0 + R) a.x = MAP_BOUNDS.x0 + R;
  if (a.x > MAP_BOUNDS.x1 - R) a.x = MAP_BOUNDS.x1 - R;
  if (a.z < MAP_BOUNDS.z0 + R) a.z = MAP_BOUNDS.z0 + R;
  if (a.z > MAP_BOUNDS.z1 - R) a.z = MAP_BOUNDS.z1 - R;
}

// Full player-style movement: acceleration toward a wish velocity, friction
// when idle, gravity and jumping, with closest-point collision (see
// collideMove). wishX/wishZ is the desired direction in world space (already
// rotated by yaw), speed is the target speed.
export function moveActor(a, wishX, wishZ, speed, dt, wantJump) {
  const grounded = a.grounded;
  const accel = grounded ? TUNE.accel : TUNE.accel * TUNE.airControl;
  const tx = wishX * speed, tz = wishZ * speed;
  const k = Math.min(1, accel * dt);
  a.vx += (tx - a.vx) * k;
  a.vz += (tz - a.vz) * k;
  if (wishX === 0 && wishZ === 0 && grounded) {
    const f = Math.max(0, 1 - TUNE.friction * dt);
    a.vx *= f; a.vz *= f;
  }
  if (wantJump && grounded) { a.vy = TUNE.jumpSpeed; a.grounded = false; }
  a.vy -= TUNE.gravity * dt;
  a.y += a.vy * dt;
  collideMove(a, a.vx * dt, a.vz * dt);
  // Floor height: the ground, a ramp slope, or the gantry deck. A grounded
  // actor snaps to the floor underfoot (climbing a ramp, stepping onto the
  // deck, walking down again); walking off an edge leaves the actor
  // airborne to fall, and a falling actor lands on the floor below.
  const floor = groundHeight(a.x, a.z, a.y);
  if (a.grounded) {
    if (floor >= a.y - 0.6) { a.y = floor; a.vy = 0; }
    else a.grounded = false;
  }
  if (!a.grounded && a.vy <= 0 && a.y <= floor) {
    a.y = floor; a.vy = 0; a.grounded = true;
  }
  if (a.y < 0) { a.y = 0; a.vy = 0; a.grounded = true; }
  a.moving = (a.vx * a.vx + a.vz * a.vz) > 0.25;
}

export function eyeHeight(a) {
  return a.crouched ? TUNE.eyeCrouch : TUNE.eyeStand;
}

// --- Ray queries -----------------------------------------------------------
// Ray vs one axis-aligned box given explicitly. Returns entry distance or
// Infinity. rayBox is this test over a collider's footprint and height span.
function slabBox(ox, oy, oz, dx, dy, dz, x0, z0, x1, z1, y0, y1, maxDist) {
  let tmin = 0, tmax = maxDist;
  // X slab.
  if (Math.abs(dx) < 1e-9) {
    if (ox < x0 || ox > x1) return Infinity;
  } else {
    let t1 = (x0 - ox) / dx, t2 = (x1 - ox) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  // Z slab.
  if (Math.abs(dz) < 1e-9) {
    if (oz < z0 || oz > z1) return Infinity;
  } else {
    let t1 = (z0 - oz) / dz, t2 = (z1 - oz) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  // Y slab: the box spans y0..y1 (raised boxes, like the deck crate, leave
  // the space below them open).
  if (Math.abs(dy) < 1e-9) {
    if (oy < y0 || oy > y1) return Infinity;
  } else {
    let t1 = (y0 - oy) / dy, t2 = (y1 - oy) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

export function rayBox(ox, oy, oz, dx, dy, dz, c, maxDist) {
  return slabBox(ox, oy, oz, dx, dy, dz, c.x0, c.z0, c.x1, c.z1, c.y0 || 0, c.h, maxDist);
}

// Nearest wall distance along a ray, or Infinity. Ground plane included,
// and the gantry deck slab blocks shots and sight between its two levels.
export function rayHitWall(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = maxDist;
  for (const c of COLLIDERS) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, c, best);
    if (t < best) best = t;
  }
  for (const d of DECKS) {
    const t = slabBox(ox, oy, oz, dx, dy, dz, d.x0, d.z0, d.x1, d.z1, d.top - 0.25, d.top, best);
    if (t < best) best = t;
  }
  if (dy < -1e-9) {
    const tg = -oy / dy;
    if (tg > 0 && tg < best) best = tg;
  }
  return best;
}

// True when the segment between two points is not blocked by any collider.
export function segmentClear(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-6) return true;
  const t = rayHitWall(ax, ay, az, dx / len, dy / len, dz / len, len);
  return t >= len - 0.01;
}

// Ray vs sphere (bot hit volumes). Returns entry distance or Infinity.
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxDist) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return Infinity;
  const t = tca - Math.sqrt(r2 - d2);
  return t > 0 && t < maxDist ? t : Infinity;
}
