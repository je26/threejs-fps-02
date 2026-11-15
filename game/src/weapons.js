// Weapons: hitscan firing, spread, recoil, reload, and grenades. One job:
// turning a trigger pull into a ray, a tracer and damage. Hits are analytic
// ray-vs-sphere tests against head and body volumes — no scene raycasting,
// no allocation in the firing path.

import { S, addNoise } from './state.js';
import { WEAPONS, GRENADES, TUNE } from './config.js';
import { rayHitWall, raySphere, segmentClear, eyeHeight } from './movement.js';
import { COLLIDERS } from './mapdata.js';
import { spawnTracer, spawnMuzzleFlash, spawnSmokeCloud, spawnExplosion, spawnImpact } from './effects.js';
import { playShot, playDryFire, playReload, playExplosion, playGrenadeBounce, playFlashRing } from './audio.js';
import { applyDamage, impactSpark } from './objective.js';
import { rnd } from './rng.js';

export function currentWeapon(a) {
  if (a.current === 'primary') return WEAPONS[a.primary];
  if (a.current === 'secondary') return WEAPONS[a.secondary];
  return null;
}

export function isGrenadeSelected(a) {
  return a.current === 'frag' || a.current === 'smoke' || a.current === 'flash';
}

// Perturb a direction by a random cone of `spread` radians. Scratch-free:
// the basis is built from the direction itself.
function spreadDir(dx, dy, dz, spread, out) {
  if (spread <= 0) { out[0] = dx; out[1] = dy; out[2] = dz; return; }
  const r = Math.sqrt(rnd()) * spread, th = rnd() * Math.PI * 2;
  const ox = Math.cos(th) * r, oy = Math.sin(th) * r;
  // Basis: u = normalize(cross(dir, up)), v = cross(dir, u).
  let ux = -dz, uy = 0, uz = dx;
  const ul = Math.sqrt(ux * ux + uz * uz) || 1;
  ux /= ul; uz /= ul;
  const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
  let nx = dx + ux * ox + vx * oy;
  let ny = dy + uy * ox + vy * oy;
  let nz = dz + uz * ox + vz * oy;
  const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  out[0] = nx / nl; out[1] = ny / nl; out[2] = nz / nl;
}

const _dir = [0, 0, 0];

// Fire one hitscan shot. ox/oy/oz is the eye position; dx/dy/dz the aim
// direction before spread. isEdge matters only for semi-automatic weapons.
export function tryFire(a, ox, oy, oz, dx, dy, dz, isEdge) {
  const w = currentWeapon(a);
  if (!w || a.reloadTimer > 0 || a.fireCooldown > 0) return false;
  if (!w.auto && !isEdge) return false;
  if (a.mag[w.id] <= 0) {
    playDryFire();
    startReload(a);
    return false;
  }
  a.mag[w.id]--;
  a.fireCooldown = 60 / w.rpm;

  // Spread: base + bloom from recent shots + movement penalty; crouching
  // steadies the aim. Stopping to shoot is rewarded, spraying on the run is not.
  const speed = Math.sqrt(a.vx * a.vx + a.vz * a.vz);
  const moveK = Math.min(1, speed / TUNE.runSpeed);
  let spread = w.spread + a.bloom + w.moveSpread * moveK;
  if (a.crouched) spread *= 0.7;
  if (a.bot) spread += a.bot.aimErr;
  spreadDir(dx, dy, dz, spread, _dir);
  const fx = _dir[0], fy = _dir[1], fz = _dir[2];

  // Recoil: pitch kick that recovers, plus a small random yaw drift.
  a.recoilPitch = Math.min(0.14, a.recoilPitch + w.recoil);
  a.recoilYaw += (rnd() - 0.5) * w.recoil * 0.6;
  a.bloom = Math.min(0.05, a.bloom + w.recoil * 0.55);

  const wallT = rayHitWall(ox, oy, oz, fx, fy, fz, 120);
  let bestT = wallT, bestActor = null, bestHead = false;
  for (const t of S.actors) {
    if (t === a || !t.alive || t.team === a.team) continue;
    const crouchK = t.crouched ? 0.78 : 1;
    const headY = t.y + 1.58 * crouchK;
    const th = raySphere(ox, oy, oz, fx, fy, fz, t.x, headY, t.z, 0.24, bestT);
    if (th < bestT) { bestT = th; bestActor = t; bestHead = true; continue; }
    const bodyY = t.y + 0.95 * crouchK;
    const tb = raySphere(ox, oy, oz, fx, fy, fz, t.x, bodyY, t.z, 0.48, bestT);
    if (tb < bestT) { bestT = tb; bestActor = t; bestHead = false; }
  }

  const hx = ox + fx * bestT, hy = oy + fy * bestT, hz = oz + fz * bestT;
  const mx = ox + fx * 0.5, my = oy + fy * 0.5 - 0.08, mz = oz + fz * 0.5;
  spawnTracer(mx, my, mz, hx, hy, hz, w.tracer);
  spawnMuzzleFlash(null, mx, my, mz);
  playShot(w.id, a.x, a.z, a.isPlayer);
  addNoise(a.x, a.z, w.id === 'marksman' ? 34 : 26);

  if (bestActor) {
    const fall = falloffMult(w, bestT);
    let dmg = w.damage * fall;
    if (bestHead) dmg *= w.headMult;
    impactSpark(hx, hy, hz, true);
    applyDamage(bestActor, dmg, a, bestHead, w.id);
  } else if (bestT < 120) {
    impactSpark(hx, hy, hz, false);
  }
  return true;
}

function falloffMult(w, dist) {
  if (dist <= w.nearM) return 1;
  if (dist >= w.farM) return w.minMult;
  const k = (dist - w.nearM) / (w.farM - w.nearM);
  return 1 - (1 - w.minMult) * k;
}

export function startReload(a) {
  const w = currentWeapon(a);
  if (!w || a.reloadTimer > 0) return;
  if (a.mag[w.id] >= w.mag || a.reserve[w.id] <= 0) return;
  a.reloadTimer = w.reload;
  a.reloadWeapon = w.id;
  if (a.isPlayer) playReload();
}

export function updateWeaponTimers(a, dt) {
  if (a.fireCooldown > 0) a.fireCooldown -= dt;
  if (a.reloadTimer > 0) {
    a.reloadTimer -= dt;
    if (a.reloadTimer <= 0) {
      const w = WEAPONS[a.reloadWeapon];
      const need = w.mag - a.mag[w.id];
      const take = Math.min(need, a.reserve[w.id]);
      a.mag[w.id] += take;
      a.reserve[w.id] -= take;
      a.reloadWeapon = null;
    }
  }
  // Bloom and recoil recover; recoil recovery is slower than bloom so a
  // burst leaves a lasting wobble the shooter must ride out.
  a.bloom = Math.max(0, a.bloom - dt * 0.06);
  a.recoilPitch *= Math.max(0, 1 - dt * 5);
  a.recoilYaw *= Math.max(0, 1 - dt * 5);
  if (Math.abs(a.recoilPitch) < 0.0005) a.recoilPitch = 0;
  if (Math.abs(a.recoilYaw) < 0.0005) a.recoilYaw = 0;
}

export function selectSlot(a, slot) {
  if (slot === 'primary' && a.primary === 'sidearm') slot = 'secondary';
  if (a.current === slot) return;
  a.current = slot;
  a.reloadTimer = 0;
  a.reloadWeapon = null;
  a.fireCooldown = Math.max(a.fireCooldown, 0.15);
}

// --- Grenades -----------------------------------------------------------------
export function throwGrenade(a, ox, oy, oz, dx, dy, dz) {
  const kind = a.current;
  const g = GRENADES[kind];
  if (!g || a.grenades[kind] <= 0) return false;
  a.grenades[kind]--;
  S.grenades.push({
    kind, owner: a, x: ox, y: oy, z: oz,
    vx: dx * 13 + a.vx * 0.5, vy: dy * 13 + 2.2, vz: dz * 13 + a.vz * 0.5,
    fuse: g.fuse, bounced: false,
  });
  // Fall back to the primary gun after the throw.
  a.current = a.primary === 'sidearm' ? 'secondary' : 'primary';
  a.fireCooldown = Math.max(a.fireCooldown, 0.4);
  return true;
}

function grenadeCollide(gr, dt) {
  // Axis-separated bounce against colliders and the floor.
  gr.x += gr.vx * dt;
  for (const c of COLLIDERS) {
    if (gr.y < c.h && gr.x > c.x0 - 0.12 && gr.x < c.x1 + 0.12 && gr.z > c.z0 - 0.12 && gr.z < c.z1 + 0.12) {
      gr.x = gr.vx > 0 ? c.x0 - 0.12 : c.x1 + 0.12;
      gr.vx *= -0.45;
      gr.bounced = true;
    }
  }
  gr.z += gr.vz * dt;
  for (const c of COLLIDERS) {
    if (gr.y < c.h && gr.x > c.x0 - 0.12 && gr.x < c.x1 + 0.12 && gr.z > c.z0 - 0.12 && gr.z < c.z1 + 0.12) {
      gr.z = gr.vz > 0 ? c.z0 - 0.12 : c.z1 + 0.12;
      gr.vz *= -0.45;
      gr.bounced = true;
    }
  }
  gr.y += gr.vy * dt;
  if (gr.y < 0.12) {
    gr.y = 0.12;
    if (Math.abs(gr.vy) > 1.5) { playGrenadeBounce(gr.x, gr.z); gr.bounced = true; }
    gr.vy *= -0.42;
    gr.vx *= 0.7; gr.vz *= 0.7;
  }
  // Lids: a grenade landing on a crate rests on it.
  for (const c of COLLIDERS) {
    if (gr.vy <= 0 && gr.y >= c.h - 0.15 && gr.y < c.h + 0.3
      && gr.x > c.x0 && gr.x < c.x1 && gr.z > c.z0 && gr.z < c.z1) {
      gr.y = c.h + 0.12; gr.vy = 0; gr.vx *= 0.8; gr.vz *= 0.8;
    }
  }
}

function detonateGrenade(gr) {
  const g = GRENADES[gr.kind];
  if (gr.kind === 'frag') {
    spawnExplosion(gr.x, gr.y + 0.3, gr.z);
    playExplosion(gr.x, gr.z);
    addNoise(gr.x, gr.z, 50);
    for (const a of S.actors) {
      if (!a.alive || a.team === gr.owner.team) continue;
      const dx = a.x - gr.x, dz = a.z - gr.z;
      const d = Math.sqrt(dx * dx + dz * dz + (a.y + 1 - gr.y) * (a.y + 1 - gr.y));
      if (d < g.radius && segmentClear(gr.x, gr.y, gr.z, a.x, a.y + 1.1, a.z)) {
        applyDamage(a, g.damage * (1 - d / (g.radius + 2)), gr.owner, false, null);
      }
    }
  } else if (gr.kind === 'smoke') {
    S.smokes.push({ x: gr.x, y: Math.max(0.6, gr.y), z: gr.z, radius: g.radius, life: g.life });
    spawnSmokeCloud(gr.x, Math.max(0.6, gr.y), gr.z, g.radius, g.life);
    addNoise(gr.x, gr.z, 10);
  } else if (gr.kind === 'flash') {
    spawnImpact(gr.x, gr.y, gr.z, 0xffffff, 12, 2);
    for (const a of S.actors) {
      if (!a.alive) continue;
      const dx = a.x - gr.x, dy = (a.y + eyeHeight(a)) - gr.y, dz = a.z - gr.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > g.radius) continue;
      if (!segmentClear(gr.x, gr.y, gr.z, a.x, a.y + eyeHeight(a), a.z)) continue;
      // Facing the flash blinds fully; looking away only dazzles at close range.
      const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
      const facing = (fx * dx + fz * dz) / (d || 1);
      const strength = (1 - d / g.radius) * (facing > -0.3 ? 1 : 0.35);
      if (strength < 0.12) continue;
      if (a.isPlayer) {
        S.flashAmount = Math.max(S.flashAmount, Math.min(1, strength));
        playFlashRing();
      } else if (a.bot) {
        a.bot.blind = Math.max(a.bot.blind, strength * 2.6);
      }
    }
  }
}

export function updateGrenades(dt) {
  for (let i = S.grenades.length - 1; i >= 0; i--) {
    const gr = S.grenades[i];
    gr.vy -= TUNE.gravity * dt;
    grenadeCollide(gr, dt);
    gr.fuse -= dt;
    if (gr.fuse <= 0) {
      detonateGrenade(gr);
      S.grenades.splice(i, 1);
    }
  }
  for (let i = S.smokes.length - 1; i >= 0; i--) {
    S.smokes[i].life -= dt;
    if (S.smokes[i].life <= 0) S.smokes.splice(i, 1);
  }
}

// True when the segment passes through any live smoke cloud: smoke blocks
// both sight and flash exposure.
export function smokeBlocks(ax, ay, az, bx, by, bz) {
  for (const s of S.smokes) {
    // Distance from the smoke centre to the segment.
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz || 1;
    let t = ((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t - s.x, py = ay + dy * t - s.y, pz = az + dz * t - s.z;
    if (px * px + py * py + pz * pz < s.radius * s.radius) return true;
  }
  return false;
}
