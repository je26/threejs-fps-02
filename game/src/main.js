// Bootstrap and frame loop. One job: own the browser, the renderer and the
// fixed-step simulation. Simulation runs at a fixed 60 Hz in discrete steps,
// kept apart from rendering: the renderer only ever draws the latest state.
// Player control lives here too — the one controller that reads raw input.

import * as THREE from 'three';
import { S, aliveCount } from './state.js';
import { TUNE, WEAPONS, GRENADES, DEVICE_NAME } from './config.js';
import { buildWorld, worldHandles, makeBotMesh, updateBotVisual, updateWorldVisuals } from './world.js';
import { createViewmodel } from './viewmodel.js';
import { Input, initInput, requestLock, releaseLock, consumeLook, consumeFireEdge, down } from './input.js';
import { moveActor, eyeHeight } from './movement.js';
import { tryFire, startReload, updateWeaponTimers, selectSlot, throwGrenade, updateGrenades, currentWeapon, isGrenadeSelected } from './weapons.js';
import { updateBots } from './bots.js';
import { startMatch, startRound, updateObjective, holdChannel, buyItem, canPlant, canDefuse } from './objective.js';
import { initEffects, updateEffects } from './effects.js';
import { initAudio, resumeAudio, setMuted, playStep } from './audio.js';
import { initHud, updateHud } from './hud.js';
import { initMinimap, drawMinimap } from './minimap.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 300);
scene.add(camera);
buildWorld(scene);
initEffects(scene);
initAudio();
const viewmodel = createViewmodel(camera);
initInput(canvas);
initMinimap(document.getElementById('minimap'));

// Pooled meshes for live grenades (sync only; physics lives in weapons.js).
const grenadeMeshes = [];
{
  const geo = new THREE.SphereGeometry(0.11, 10, 8);
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.6 }));
    m.visible = false;
    scene.add(m);
    grenadeMeshes.push(m);
  }
}

let vmBob = 0, wasLocked = false, lastWeapon = 'secondary';
let menuOrbit = 0;

function ensureMeshes() {
  for (const a of S.actors) {
    if (a.isPlayer) continue;
    if (!a.mesh) {
      a.mesh = makeBotMesh(a.team);
      scene.add(a.mesh);
    }
  }
}

function clearMeshes() {
  for (const a of S.actors) {
    if (a.mesh) { scene.remove(a.mesh); a.mesh = null; }
  }
}

function beginMatch(side) {
  clearMeshes();
  resumeAudio();
  startMatch(side);
  ensureMeshes();
  requestLock(canvas);
}

initHud({
  onStart: (side) => beginMatch(side),
  onRestart: () => beginMatch(S.playerSide),
  onResume: () => { S.paused = false; requestLock(canvas); },
  onCloseBuy: () => { S.buyOpen = false; requestLock(canvas); },
  onBuy: (item) => { if (S.player) buyItem(S.player, item); },
});

// Edge-triggered keys. Held keys are polled in playerControl.
Input.onKey = (code, isDown) => {
  if (!isDown || !S.player) return;
  const p = S.player;
  if (code === 'KeyM') { S.muted = !S.muted; setMuted(S.muted); return; }
  if (S.phase === 'menu' || S.phase === 'matchEnd') return;
  if (code === 'KeyP') {
    if (S.phase === 'live' || S.phase === 'freeze') {
      S.paused = !S.paused;
      if (S.paused) releaseLock(); else requestLock(canvas);
    }
    return;
  }
  if (S.paused) return;
  if (code === 'KeyB' && S.phase === 'freeze') {
    S.buyOpen = !S.buyOpen;
    if (S.buyOpen) releaseLock(); else requestLock(canvas);
    return;
  }
  if (code === 'KeyR') startReload(p);
  if (code === 'Digit1') { lastWeapon = p.current; selectSlot(p, 'primary'); }
  if (code === 'Digit2') { lastWeapon = p.current; selectSlot(p, 'secondary'); }
  if (code === 'Digit3' && p.grenades.frag > 0) selectSlot(p, 'frag');
  if (code === 'Digit4' && p.grenades.smoke > 0) selectSlot(p, 'smoke');
  if (code === 'Digit5' && p.grenades.flash > 0) selectSlot(p, 'flash');
  if (code === 'KeyQ') {
    const prev = lastWeapon;
    lastWeapon = p.current;
    selectSlot(p, prev);
  }
};

canvas.addEventListener('click', () => {
  resumeAudio();
  if (S.phase !== 'menu' && !S.paused && !S.buyOpen) requestLock(canvas);
});

function aimDir(a) {
  const cp = Math.cos(a.pitch + a.recoilPitch);
  return [
    -Math.sin(a.yaw + a.recoilYaw) * cp,
    Math.sin(a.pitch + a.recoilPitch),
    -Math.cos(a.yaw + a.recoilYaw) * cp,
  ];
}

function playerControl(dt) {
  const p = S.player;
  if (!p || !p.alive) return;
  p.channelHeld = false;
  // Look.
  const look = consumeLook();
  p.yaw -= look.dx;
  p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - look.dy));
  if (S.phase === 'freeze') {
    // Frozen: look around and shop, but no moving or firing.
    moveActor(p, 0, 0, 0, dt, false);
    consumeFireEdge();
    return;
  }
  if (S.phase !== 'live' || S.paused || S.buyOpen) {
    consumeFireEdge();
    moveActor(p, 0, 0, 0, dt, false);
    return;
  }
  // Movement: WASD relative to facing, Shift to walk quietly, Ctrl/C crouch.
  p.crouched = down('ControlLeft') || down('ControlRight') || down('KeyC');
  p.walking = down('ShiftLeft') || down('ShiftRight');
  const f = (down('KeyW') ? 1 : 0) - (down('KeyS') ? 1 : 0);
  const s = (down('KeyD') ? 1 : 0) - (down('KeyA') ? 1 : 0);
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  let wx = -sy * f + cy * s, wz = -cy * f - sy * s;
  const wl = Math.sqrt(wx * wx + wz * wz);
  if (wl > 0) { wx /= wl; wz /= wl; }
  const w = currentWeapon(p);
  let speed = p.crouched ? TUNE.crouchSpeed : p.walking ? TUNE.walkSpeed : TUNE.runSpeed;
  if (w) speed *= w.speedMult;
  moveActor(p, wx, wz, speed, dt, down('Space'));
  // Footsteps: audible when running, near-silent when walking.
  if (p.moving && p.grounded) {
    p.stepTimer -= dt;
    if (p.stepTimer <= 0) {
      p.stepTimer = p.walking ? 0.5 : 0.36;
      playStep(p.x, p.z, true);
      if (!p.walking) S.noises.push({ x: p.x, z: p.z, radius: 7, time: S.time });
    }
  }
  // Plant / defuse channel while E is held.
  if (down('KeyE') && (canPlant(p) || canDefuse(p) || p.channel)) {
    p.channelHeld = true;
    holdChannel(p);
  }
  // Fire / throw.
  const edge = consumeFireEdge();
  const oy = p.y + eyeHeight(p);
  const dir = aimDir(p);
  if (isGrenadeSelected(p)) {
    if (edge) throwGrenade(p, p.x, oy, p.z, dir[0], dir[1], dir[2]);
  } else if (Input.fireHeld) {
    if (tryFire(p, p.x, oy, p.z, dir[0], dir[1], dir[2], edge)) {
      const cw = currentWeapon(p);
      if (cw) viewmodel.onShot(cw.kick);
    }
  }
}

// One fixed simulation step.
function step(dt) {
  S.time += dt;
  S.tick++;
  for (const a of S.actors) a.channelHeld = false;
  if (!S.paused && S.phase !== 'menu' && S.phase !== 'matchEnd') {
    playerControl(dt);
    updateBots(dt);
    for (const a of S.actors) updateWeaponTimers(a, dt);
    updateGrenades(dt);
    updateObjective(dt);
  }
  // Feedback timers decay in real time, even while paused.
  S.hitmark = Math.max(0, S.hitmark - dt);
  S.damageFlash = Math.max(0, S.damageFlash - dt * 1.6);
  S.flashAmount = Math.max(0, S.flashAmount - dt * 0.45);
  S.bannerTime = Math.max(0, S.bannerTime - dt);
  S.messageTime = Math.max(0, S.messageTime - dt);
}

function syncRender(dt) {
  const p = S.player;
  if (S.phase === 'menu' || !p) {
    // Slow orbit over the map behind the start menu.
    menuOrbit += dt * 0.05;
    camera.position.set(Math.sin(menuOrbit) * 26, 20, Math.cos(menuOrbit) * 26);
    camera.lookAt(0, 0, -2);
    camera.rotation.z = 0;
    return;
  }
  // Camera follows the player (or stays at the death spot while spectating).
  const ey = p.y + eyeHeight(p);
  if (p.moving && p.grounded) vmBob += dt * (p.crouched ? 6 : 9);
  const bobY = p.moving && p.grounded ? Math.sin(vmBob) * 0.025 : 0;
  camera.position.set(p.x, ey + bobY, p.z);
  camera.rotation.set(0, 0, 0);
  camera.rotateY(p.yaw + p.recoilYaw);
  camera.rotateX(p.pitch + p.recoilPitch);
  // Viewmodel: the active weapon, its recoil kick, reload dip and walk
  // sway are all driven by viewmodel.js from the player's weapon state.
  const cw = currentWeapon(p);
  viewmodel.update(dt, p, cw ? cw.id : null, isGrenadeSelected(p) ? p.current : null);
  // Bots and the device.
  for (const a of S.actors) {
    if (!a.isPlayer) updateBotVisual(a, dt, S.time);
  }
  const dev = worldHandles.deviceMesh;
  if (S.device.state === 'dropped' || S.device.state === 'planted') {
    dev.visible = true;
    dev.position.set(S.device.x, 0, S.device.z);
  } else {
    dev.visible = false;
  }
  // Grenade meshes follow live grenades.
  for (let i = 0; i < grenadeMeshes.length; i++) {
    const gr = S.grenades[i];
    const m = grenadeMeshes[i];
    if (gr) {
      m.visible = true;
      m.position.set(gr.x, gr.y, gr.z);
      m.material.color.setHex(GRENADES[gr.kind].color);
    } else {
      m.visible = false;
    }
  }
  updateWorldVisuals(S.time, S.device.state === 'planted');
}

let last = performance.now();
let acc = 0;
let mapTimer = 0;
let qualityTier = 0;
let frameEma = 16;
let qualityTime = 0;
// ?quality=high locks full quality (no adaptive shedding): for screenshots
// and for players who prefer looks over frame rate.
const lockQuality = new URLSearchParams(window.location.search).get('quality') === 'high';

// Adaptive quality: if the device cannot hold a smooth frame rate, shed
// shadows first, then render resolution. The simulation never depends on it.
function applyQuality(tier) {
  if (tier >= 1) {
    renderer.shadowMap.enabled = false;
    scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }
  if (tier >= 2) renderer.setPixelRatio(0.75);
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000;
  const dtReal = Math.min(0.1, rawDt);
  last = now;
  frameEma = frameEma * 0.95 + rawDt * 1000 * 0.05;
  qualityTime += rawDt;
  if (!lockQuality && qualityTime > 3 && frameEma > 45 && qualityTier < 2) {
    qualityTier++;
    qualityTime = 0;
    frameEma = 16;
    applyQuality(qualityTier);
  }
  acc += dtReal;
  let steps = 0;
  while (acc >= TUNE.fixedStep && steps < 8) {
    step(TUNE.fixedStep);
    acc -= TUNE.fixedStep;
    steps++;
  }
  if (steps === 8) acc = 0;
  // Losing pointer lock mid-round pauses the game (Esc does this).
  if (wasLocked && !Input.locked && S.phase === 'live' && !S.buyOpen && !S.paused) {
    S.paused = true;
  }
  wasLocked = Input.locked;
  syncRender(dtReal);
  updateEffects(dtReal, camera);
  updateHud(dtReal);
  mapTimer += dtReal;
  if (mapTimer > 0.066) { mapTimer = 0; drawMinimap(); }
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Read-only debug handle for scripted playtests: state inspection plus a few
// staging helpers. It cannot change the rules, only observe and stage.
window.__ember = {
  state: S,
  start: (side) => beginMatch(side || 'atk'),
  teleport: (x, z, y) => { if (S.player) { S.player.x = x; S.player.z = z; if (y !== undefined) S.player.y = y; } },
  face: (yaw, pitch) => { if (S.player) { S.player.yaw = yaw; S.player.pitch = pitch || 0; } },
  holdFire: (on) => { Input.fireHeld = !!on; if (on) Input.fireEdge = true; },
  giveMoney: (n) => { if (S.player) S.player.money = n; },
  skipFreeze: () => { if (S.phase === 'freeze') { S.phaseTime = 0.01; } },
  qualityTier: () => qualityTier,
  _three: { renderer, scene, camera },
  version: '2.0.0',
};

requestAnimationFrame(frame);
