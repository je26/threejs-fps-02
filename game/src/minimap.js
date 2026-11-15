// Top-down minimap on a 2D canvas. One job: a readable tactical picture —
// walls, sites, the player arrow, allies, spotted enemies and the device.

import { S } from './state.js';
import { COLLIDERS, SITES, DECKS, RAMPS } from './mapdata.js';
import { TEAMS } from './config.js';

let cv = null, g = null;
const SIZE = 176;
const WORLD = 66; // world units across the canvas

function toMap(x, z) {
  return [(x + WORLD / 2) / WORLD * SIZE, (z + WORLD / 2) / WORLD * SIZE];
}

export function initMinimap(canvas) {
  cv = canvas;
  g = canvas.getContext('2d');
}

export function drawMinimap() {
  if (!g || !S.player) return;
  g.clearRect(0, 0, SIZE, SIZE);
  g.fillStyle = 'rgba(24,20,16,0.72)';
  g.fillRect(0, 0, SIZE, SIZE);
  // Site zones.
  for (const id of ['A', 'B']) {
    const s = SITES[id];
    const [x0, z0] = toMap(s.x0, s.z0);
    const [x1, z1] = toMap(s.x1, s.z1);
    g.fillStyle = id === 'A' ? 'rgba(245,154,62,0.25)' : 'rgba(62,201,180,0.25)';
    g.fillRect(x0, z0, x1 - x0, z1 - z0);
    g.fillStyle = id === 'A' ? '#f5c86e' : '#7fe8d8';
    g.font = 'bold 13px sans-serif';
    g.textAlign = 'center';
    g.fillText(id, (x0 + x1) / 2, (z0 + z1) / 2 + 4);
  }
  // The gantry: ramps as hatched climbs, the deck as a raised outline with
  // a label, so the second floor reads on the map as it does in the world.
  for (const r of RAMPS) {
    const [x0, z0] = toMap(r.x0, r.z0);
    const [x1, z1] = toMap(r.x1, r.z1);
    g.fillStyle = 'rgba(245,200,110,0.28)';
    g.fillRect(x0, z0, x1 - x0, z1 - z0);
    g.strokeStyle = 'rgba(245,200,110,0.7)';
    g.beginPath();
    for (let i = 1; i < 4; i++) {
      const x = x0 + (x1 - x0) * i / 4;
      g.moveTo(x, z0); g.lineTo(x, z1);
    }
    g.stroke();
  }
  for (const d of DECKS) {
    const [x0, z0] = toMap(d.x0, d.z0);
    const [x1, z1] = toMap(d.x1, d.z1);
    g.fillStyle = 'rgba(245,200,110,0.16)';
    g.fillRect(x0, z0, x1 - x0, z1 - z0);
    g.strokeStyle = '#f5c86e';
    g.strokeRect(x0, z0, x1 - x0, z1 - z0);
    g.fillStyle = '#f5c86e';
    g.font = 'bold 8px sans-serif';
    g.textAlign = 'center';
    g.fillText('UP', (x0 + x1) / 2, (z0 + z1) / 2 + 3);
  }
  // Colliders.
  g.fillStyle = '#8a7e6c';
  for (const c of COLLIDERS) {
    const [x0, z0] = toMap(c.x0, c.z0);
    const [x1, z1] = toMap(c.x1, c.z1);
    g.fillRect(x0, z0, Math.max(1, x1 - x0), Math.max(1, z1 - z0));
  }
  // The device: planted (blinking) or dropped.
  if (S.device.state === 'planted' || S.device.state === 'dropped') {
    const [x, z] = toMap(S.device.x, S.device.z);
    g.fillStyle = Math.sin(S.time * 8) > 0 ? '#ff5040' : '#801810';
    g.beginPath(); g.arc(x, z, 4, 0, 7); g.fill();
  }
  // Actors: allies always, enemies only while a teammate can see them.
  // An actor standing on the gantry gets a white ring: height is shown,
  // not hidden, on a flat map.
  for (const a of S.actors) {
    if (!a.alive) continue;
    const [x, z] = toMap(a.x, a.z);
    if (a.isPlayer) {
      g.save();
      g.translate(x, z);
      g.rotate(Math.atan2(-Math.sin(a.yaw), -Math.cos(a.yaw)) + Math.PI / 2);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(0, -6); g.lineTo(4, 4); g.lineTo(-4, 4);
      g.closePath(); g.fill();
      g.restore();
      if (a.y > 0.5) {
        g.strokeStyle = '#ffffff';
        g.beginPath(); g.arc(x, z, 7, 0, 7); g.stroke();
      }
      continue;
    }
    const ally = a.team === S.player.team;
    let spotted = ally;
    if (!ally) {
      for (const mate of S.actors) {
        if (mate.team === S.player.team && mate.bot && mate.bot.target === a) { spotted = true; break; }
      }
    }
    if (!spotted) continue;
    g.fillStyle = TEAMS[a.team].css;
    g.beginPath(); g.arc(x, z, 3.5, 0, 7); g.fill();
    if (a.y > 0.5) {
      g.strokeStyle = '#ffffff';
      g.beginPath(); g.arc(x, z, 6, 0, 7); g.stroke();
    }
  }
}
