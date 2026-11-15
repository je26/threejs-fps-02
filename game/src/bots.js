// Bot AI: waypoint navigation, roles, perception and combat. One job:
// deciding what each bot does every tick. Bots follow the waypoint graph,
// hold assigned angles, react to vision cones and gunshot noise, push sites
// with the device carrier, plant, rotate and defuse. Decisions are throttled;
// steering runs every tick.

import { S } from './state.js';
import { TUNE, WEAPONS } from './config.js';
import { WAYPOINTS, HOLD_SPOTS, SITES, nearestNode, findPath, siteAt } from './mapdata.js';
import { moveActor, segmentClear, eyeHeight } from './movement.js';
import { tryFire, currentWeapon, selectSlot, throwGrenade, smokeBlocks, startReload } from './weapons.js';
import { holdChannel, canPlant, canDefuse, deviceCarrier } from './objective.js';
import { rnd } from './rng.js';

const FOV_COS = 0.45; // ~63 degrees half-angle: generous but not all-seeing.
const EYE = 1.5;

function faceToward(a, tx, tz, dt, speed) {
  const want = Math.atan2(-(tx - a.x), -(tz - a.z));
  let d = want - a.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const maxTurn = speed * dt;
  a.yaw += Math.max(-maxTurn, Math.min(maxTurn, d));
  return Math.abs(d) < 0.1;
}

function setPath(a, goalNode) {
  const from = nearestNode(a.x, a.z);
  a.bot.path = findPath(from, goalNode);
  a.bot.pathIdx = 0;
  // Skip the node we are already standing on.
  if (a.bot.path.length > 1) a.bot.pathIdx = 1;
}

function steerAlongPath(a, dt, speedMult) {
  const b = a.bot;
  if (b.pathIdx >= b.path.length) return true;
  const node = WAYPOINTS[b.path[b.pathIdx]];
  const dx = node.x - a.x, dz = node.z - a.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 1.1) { b.pathIdx++; return b.pathIdx >= b.path.length; }
  // Unstuck: when pushing head-on into a wall face or corner makes no
  // progress, sidestep perpendicular for a moment to slide around it.
  b.stuckT += dt;
  if (b.stuckT > 0.9) {
    const movedX = a.x - b.stuckX, movedZ = a.z - b.stuckZ;
    b.stuckX = a.x; b.stuckZ = a.z; b.stuckT = 0;
    if (movedX * movedX + movedZ * movedZ < 0.25) {
      b.sidestepUntil = S.time + 0.8;
      b.sidestepDir *= -1;
    }
  }
  let wx = dx / dist, wz = dz / dist;
  if (S.time < b.sidestepUntil) {
    const px = -wz * b.sidestepDir, pz = wx * b.sidestepDir;
    wx += px * 1.4; wz += pz * 1.4;
    const l = Math.sqrt(wx * wx + wz * wz) || 1;
    wx /= l; wz /= l;
  }
  faceToward(a, a.x + wx, a.z + wz, dt, 6);
  const w = currentWeapon(a);
  const speed = TUNE.runSpeed * (w ? w.speedMult : 1) * (speedMult || 1);
  moveActor(a, wx, wz, speed, dt, false);
  return false;
}

function canSee(a, t) {
  const dx = t.x - a.x, dz = t.z - a.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist > 32) return false; // dusk haze caps sight well short of spawn-to-spawn
  // Vision cone, unless the target is very close (heard footsteps).
  if (dist > 6) {
    const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
    if ((fx * dx + fz * dz) / (dist || 1) < FOV_COS) return false;
  }
  const ay = a.y + eyeHeight(a), ty = t.y + eyeHeight(t);
  if (!segmentClear(a.x, ay, a.z, t.x, ty, t.z)) return false;
  if (smokeBlocks(a.x, ay, a.z, t.x, ty, t.z)) return false;
  return true;
}

function perceive(a, dt) {
  const b = a.bot;
  b.perceiveTimer -= dt;
  if (b.perceiveTimer > 0) return;
  b.perceiveTimer = 0.12;
  if (b.blind > 0) { b.target = null; return; }
  let best = null, bestD = Infinity, curSeen = false;
  for (const t of S.actors) {
    if (t === a || !t.alive || t.team === a.team) continue;
    if (!canSee(a, t)) continue;
    if (t === b.target) curSeen = true;
    const dx = t.x - a.x, dz = t.z - a.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = t; }
  }
  // Target hysteresis: stick with a visible current target unless the new
  // one is much closer, so the bot does not flap between enemies and reset
  // its reaction time forever.
  if (best && b.target && best !== b.target && curSeen && b.target.alive) {
    const cdx = b.target.x - a.x, cdz = b.target.z - a.z;
    if (bestD > (cdx * cdx + cdz * cdz) * 0.7) best = b.target;
  }
  if (best) {
    if (!b.target) {
      // Fresh acquisition: reaction time before the bot can shoot. Switching
      // between visible enemies does not re-impose it — the bot is alert.
      b.seenTime = S.time + b.reaction;
      b.aimErr = 0.09;
    } else if (b.target !== best) {
      b.aimErr = Math.max(b.aimErr, 0.05);
    }
    b.target = best;
    b.lastKnownX = best.x; b.lastKnownZ = best.z;
    b.lastKnownT = S.time;
    b.noLosT = 0;
    b.investigate = null;
  } else if (b.target) {
    // Lost sight: keep the last known position briefly, then give up and
    // go look there instead of standing still staring at a wall.
    if (S.time - b.seenTime > 1.4) {
      b.investigate = { x: b.lastKnownX, z: b.lastKnownZ, until: S.time + 3 };
      b.target = null;
    }
  }
  // Hearing: fresh noises inside their radius draw attention. A noise at the
  // bot's own feet is its own footstep or gunshot and is ignored.
  if (!b.target) {
    for (const n of S.noises) {
      if (S.time - n.time > 1.2) continue;
      const dx = n.x - a.x, dz = n.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 4) continue;
      if (d2 < n.radius * n.radius) {
        b.investigate = { x: n.x, z: n.z, until: S.time + 4 };
        break;
      }
    }
  }
  // Being shot reveals the shooter.
  if (a.lastAttacker && a.lastAttacker.alive && S.time - a.lastDamageTime < 1.5) {
    b.target = a.lastAttacker;
    b.lastKnownX = a.lastAttacker.x; b.lastKnownZ = a.lastAttacker.z;
    b.seenTime = Math.min(b.seenTime, S.time);
  }
}

function engage(a, dt) {
  const b = a.bot;
  const t = b.target;
  if (!t || !t.alive) { b.target = null; return; }
  const dx = t.x - a.x, dz = t.z - a.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  faceToward(a, t.x, t.z, dt, 4 + b.skill * 4);
  // Fire discipline: hold fire without a clear line of sight. A bot whose
  // target ducked behind cover or smoke does not spray the wall — it
  // repositions toward the last known position to re-acquire the angle.
  const oy = a.y + eyeHeight(a);
  const chestY = t.y + (t.crouched ? 1.15 : 1.45);
  const losClear = segmentClear(a.x, oy, a.z, t.x, chestY, t.z)
    && !smokeBlocks(a.x, oy, a.z, t.x, chestY, t.z);
  if (!losClear) {
    b.noLosT += dt;
    const hx = b.lastKnownX - a.x, hz = b.lastKnownZ - a.z;
    const hl = Math.sqrt(hx * hx + hz * hz) || 1;
    if (hl > 2) moveActor(a, hx / hl, hz / hl, TUNE.walkSpeed, dt, false);
    else moveActor(a, 0, 0, 0, dt, false);
    if (b.noLosT > 1.2) {
      b.investigate = { x: b.lastKnownX, z: b.lastKnownZ, until: S.time + 3 };
      b.target = null; b.noLosT = 0;
    }
    return;
  }
  b.noLosT = 0;
  b.lastKnownX = t.x; b.lastKnownZ = t.z; b.lastKnownT = S.time;
  // Aim error shrinks while the target stays visible and the bot stands
  // still; moving or being blinded opens it back up.
  const settled = 0.012 + (1 - b.skill) * 0.02;
  b.aimErr += (settled - b.aimErr) * Math.min(1, dt * (a.moving ? 1 : 3.5));
  // Strafe to be a harder target; flip direction on a timer.
  b.strafeTimer -= dt;
  if (b.strafeTimer <= 0) {
    b.strafeDir *= -1;
    b.strafeTimer = 0.7 + rnd() * 0.9;
  }
  const w = currentWeapon(a);
  const wantCrouch = dist > 18 && w && w.id !== 'smg' && rnd() < 0.02;
  if (wantCrouch) a.crouched = true;
  // Strafe to be a harder target, closing the distance when far away and
  // giving ground when the enemy is on top of the bot. A badly hurt bot
  // falls back toward cover instead of standing in the open trading shots.
  const px = -dz / (dist || 1), pz = dx / (dist || 1);
  let mx = px * b.strafeDir * 0.8, mz = pz * b.strafeDir * 0.8;
  if (dist > 14) { mx += (dx / dist) * 0.6; mz += (dz / dist) * 0.6; }
  else if (dist < 5) { mx -= (dx / dist) * 0.5; mz -= (dz / dist) * 0.5; }
  if (a.hp < 30) { mx -= (dx / (dist || 1)) * 0.5; mz -= (dz / (dist || 1)) * 0.5; }
  const ml = Math.sqrt(mx * mx + mz * mz) || 1;
  moveActor(a, mx / ml, mz / ml, TUNE.walkSpeed * 0.6, dt, false);
  // Fire in bursts once the reaction time has passed. Burst length and
  // pause scale with range: short taps at long range, longer bursts close
  // in, and the marksman fires single aimed shots with a long reset.
  if (S.time < b.seenTime) return;
  if (b.burstLeft <= 0) {
    if (b.burstPause > 0) { b.burstPause -= dt; return; }
    if (w && w.id === 'marksman') {
      b.burstLeft = 1;
      b.burstPause = 0.7 + rnd() * 0.5;
    } else if (dist > 18) {
      b.burstLeft = 2;
      b.burstPause = 0.45 + rnd() * 0.5;
    } else if (dist > 8) {
      b.burstLeft = 2 + Math.floor(rnd() * 3);
      b.burstPause = 0.3 + rnd() * 0.35;
    } else {
      b.burstLeft = 3 + Math.floor(rnd() * 3);
      b.burstPause = 0.2 + rnd() * 0.25;
    }
  }
  const ty = chestY + (rnd() - 0.5) * 0.2;
  const ddx = t.x - a.x, ddy = ty - oy, ddz = t.z - a.z;
  const len = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) || 1;
  if (tryFire(a, a.x, oy, a.z, ddx / len, ddy / len, ddz / len, true)) b.burstLeft--;
}

function siteGoalNode(site) {
  return site === 'A' ? 17 : 18;
}

function teamPushSite() {
  const carrier = deviceCarrier();
  if (carrier && carrier.bot) return carrier.bot.goalSite || 'A';
  for (const a of S.actors) {
    if (a.team === 'atk' && a.bot && a.bot.goalSite) return a.bot.goalSite;
  }
  return 'A';
}

function assignHold(a) {
  const b = a.bot;
  const defs = S.actors.filter((x) => x.team === 'def' && x.bot);
  const idx = defs.indexOf(a);
  let spot;
  if (idx === 0) spot = HOLD_SPOTS.A[0];
  else if (idx === 1) spot = HOLD_SPOTS.B[0];
  else if (idx === 2) spot = HOLD_SPOTS.mid[0];
  else if (idx === 3) spot = HOLD_SPOTS.A[1];
  else spot = HOLD_SPOTS.B[1];
  b.holdSpot = spot;
  b.goalSite = idx === 0 || idx === 3 ? 'A' : idx === 1 || idx === 4 ? 'B' : null;
}

function decide(a, dt) {
  const b = a.bot;
  b.decisionTimer -= dt;
  if (b.decisionTimer > 0) return;
  b.decisionTimer = 0.25;
  if (b.target) { b.state = 'engage'; return; }

  const planted = S.device.state === 'planted';

  if (a.team === 'def') {
    if (planted) {
      // Rotate to the planted site and defuse. Re-path whenever the goal
      // changed, so a stale investigate path never leads the retake astray.
      if (canDefuse(a)) { b.state = 'defuse'; return; }
      // Cutoff rotation: with time on the fuse and three or more defenders
      // up, the defender farthest from the site holds the mid connector
      // instead of stacking the defuse — cutting off the retake lane and
      // keeping a second defuse attempt alive if the first fails.
      const defsAlive = S.actors.filter((x) => x.team === 'def' && x.alive);
      if (defsAlive.length >= 3 && S.device.fuse > 12) {
        const ddx = a.x - S.device.x, ddz = a.z - S.device.z;
        const myD = ddx * ddx + ddz * ddz;
        let farthest = true;
        for (const mate of defsAlive) {
          if (mate === a) continue;
          const mdx = mate.x - S.device.x, mdz = mate.z - S.device.z;
          if (mdx * mdx + mdz * mdz > myD) { farthest = false; break; }
        }
        if (farthest) {
          const cut = WAYPOINTS[24];
          const cdx = cut.x - a.x, cdz = cut.z - a.z;
          if (cdx * cdx + cdz * cdz > 2.25) {
            b.state = 'move';
            if (b.path.length === 0 || b.pathIdx >= b.path.length) setPath(a, 24);
          } else {
            b.state = 'hold';
            b.holdSpot = { node: 24, yaw: S.device.site === 'A' ? 2.6 : -2.6 };
          }
          return;
        }
      }
      b.state = 'rotate';
      const goal = nearestNode(S.device.x, S.device.z);
      if (b.path.length === 0 || b.pathIdx >= b.path.length || b.path[b.path.length - 1] !== goal) {
        setPath(a, goal);
      }
      return;
    }
    if (!b.holdSpot) assignHold(a);
    if (b.investigate && S.time < b.investigate.until) {
      b.state = 'move';
      if (b.path.length === 0 || b.pathIdx >= b.path.length) {
        setPath(a, nearestNode(b.investigate.x, b.investigate.z));
      }
      return;
    }
    // Walk to the assigned hold spot first; only hold once there.
    const hn = WAYPOINTS[b.holdSpot.node];
    const hdx = hn.x - a.x, hdz = hn.z - a.z;
    if (hdx * hdx + hdz * hdz > 2.25) {
      b.state = 'move';
      if (b.path.length === 0 || b.pathIdx >= b.path.length) setPath(a, b.holdSpot.node);
      return;
    }
    b.state = 'hold';
    return;
  }

  // Attackers.
  if (planted) {
    // After the plant, hold the site: take a defensive angle near it.
    const site = SITES[S.device.site];
    if (siteAt(a.x, a.z) !== S.device.site) {
      b.state = 'move';
      if (b.path.length === 0 || b.pathIdx >= b.path.length) setPath(a, siteGoalNode(S.device.site));
    } else {
      b.state = 'hold';
    }
    return;
  }
  const pushSite = teamPushSite();
  // Hunt: a non-carrier that lost sight of an enemy (or heard one) checks
  // the last known position before resuming the push. The carrier never
  // wanders — the plant comes first.
  if (b.investigate && S.time < b.investigate.until && S.device.carrierId !== a.id) {
    const idx = b.investigate.x, idz = b.investigate.z;
    const qdx = idx - a.x, qdz = idz - a.z;
    if (qdx * qdx + qdz * qdz > 4) {
      b.state = 'move';
      if (b.path.length === 0 || b.pathIdx >= b.path.length) {
        setPath(a, nearestNode(idx, idz));
      }
      return;
    }
    b.investigate = null;
  }
  if (b.role === 'lurk') {
    const other = pushSite === 'A' ? 'B' : 'A';
    if (siteAt(a.x, a.z) !== other) {
      b.state = 'move';
      if (b.path.length === 0 || b.pathIdx >= b.path.length) setPath(a, siteGoalNode(other));
    } else b.state = 'hold';
    return;
  }
  if (b.role === 'mid') {
    // Mid player takes the gantry deck, watching both lanes from above,
    // then joins the push in the second half of the round.
    if (S.roundTimer < 55) {
      b.state = 'move';
      if (b.path.length === 0 || b.pathIdx >= b.path.length) setPath(a, siteGoalNode(pushSite));
    } else if (nearestNode(a.x, a.z) !== 31) {
      b.state = 'move';
      if (b.path.length === 0 || b.pathIdx >= b.path.length) setPath(a, 31);
    } else {
      b.state = 'hold';
    }
    return;
  }
  // Carrier and pushers: get to the site, then plant.
  if (canPlant(a)) { b.state = 'plant'; return; }
  if (siteAt(a.x, a.z) === pushSite) {
    if (S.device.carrierId === a.id) { b.state = 'plant'; return; }
    b.state = 'hold';
    return;
  }
  b.state = 'move';
  if (b.path.length === 0 || b.pathIdx >= b.path.length) setPath(a, siteGoalNode(pushSite));
}

function act(a, dt) {
  const b = a.bot;
  a.channelHeld = false;
  if (b.state === 'engage') { engage(a, dt); return; }
  if (b.state === 'plant') {
    if (canPlant(a)) {
      a.channelHeld = true;
      holdChannel(a);
      moveActor(a, 0, 0, 0, dt, false);
      return;
    }
    b.state = 'move';
  }
  if (b.state === 'defuse') {
    if (canDefuse(a)) {
      a.channelHeld = true;
      holdChannel(a);
      moveActor(a, 0, 0, 0, dt, false);
      return;
    }
    b.state = 'rotate';
  }
  if (b.state === 'hold') {
    moveActor(a, 0, 0, 0, dt, false);
    a.crouched = false;
    // Reload discipline: top the magazine off while holding an angle with
    // no enemy in sight, never in the middle of a fight.
    const hw = currentWeapon(a);
    if (hw && a.reloadTimer <= 0 && a.mag[hw.id] < hw.mag * 0.4) startReload(a);
    // Hold an angle, scanning slowly left and right.
    let wantYaw = b.holdSpot ? b.holdSpot.yaw : a.yaw;
    if (a.team === 'atk') {
      // Post-plant: face the likeliest retake lane.
      wantYaw = S.device.site === 'A' ? 0.8 : -0.8;
    }
    b.scanYaw = wantYaw + Math.sin(S.time * 0.5 + a.id) * 0.5;
    faceToward(a, a.x - Math.sin(b.scanYaw), a.z - Math.cos(b.scanYaw), dt, 2);
    // Attackers holding a site stay ready; defenders hold still and quiet.
    return;
  }
  // 'move' and 'rotate': follow the path. Toss a smoke at the site approach.
  if (a.team === 'atk' && a.grenades.smoke > 0 && !b.usedNade && b.state === 'move') {
    const site = SITES[teamPushSite()];
    const dx = site.cx - a.x, dz = site.cz - a.z;
    if (dx * dx + dz * dz < 14 * 14) {
      b.usedNade = true;
      const oy = a.y + eyeHeight(a);
      const ddx = site.cx - a.x, ddz = site.cz - a.z;
      const len = Math.sqrt(ddx * ddx + ddz * ddz) || 1;
      const keep = a.current;
      a.current = 'smoke';
      throwGrenade(a, a.x, oy, a.z, ddx / len, 0.35, ddz / len);
      a.current = keep;
    }
  }
  const arrived = steerAlongPath(a, dt, 1);
  if (arrived) {
    b.path = [];
    if (b.state === 'rotate' && canDefuse(a)) b.state = 'defuse';
    else if (b.state === 'move') b.state = 'hold';
  }
}

export function updateBots(dt) {
  for (const a of S.actors) {
    if (a.isPlayer || !a.bot || !a.alive) continue;
    if (S.phase !== 'live') {
      moveActor(a, 0, 0, 0, dt, false);
      continue;
    }
    const b = a.bot;
    if (b.blind > 0) b.blind -= dt;
    perceive(a, dt);
    decide(a, dt);
    act(a, dt);
    // Footstep noise while running.
    if (a.moving && !a.walking) {
      a.stepTimer -= dt;
      if (a.stepTimer <= 0) {
        a.stepTimer = 0.38;
        // Bots are audible: a small noise event at their feet.
        S.noises.push({ x: a.x, z: a.z, radius: 7, time: S.time });
      }
    }
  }
  // Prune stale noises.
  for (let i = S.noises.length - 1; i >= 0; i--) {
    if (S.time - S.noises[i].time > 2) S.noises.splice(i, 1);
  }
}
