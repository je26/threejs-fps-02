// World building: three.js scene, lighting, procedural canvas textures,
// map meshes from mapdata, bot bodies and first-person viewmodels. One job:
// everything visible that is not a short-lived effect. All art is generated
// at runtime from a seed; no external assets.

import * as THREE from 'three';
import { COLLIDERS, SITES, MAP_BOUNDS } from './mapdata.js';
import { TEAMS } from './config.js';
import { makeRng, hashSeed } from './rng.js';

const PALETTE = {
  sky: 0xe8b07e, fog: 0xd9a678, sun: 0xffd9a0, hemiSky: 0xffd9b0,
  hemiGround: 0x5a4a38, ground: '#6f675c', concrete: '#9c9080',
  concreteDark: '#7d7264', rust: '#a85a2c', teal: '#2c8a7c',
};

// --- Procedural canvas textures (deterministic, seeded) --------------------
function canvasTex(size, painter, seedText, repeatX, repeatY) {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const g = cv.getContext('2d');
  painter(g, size, makeRng(hashSeed(seedText)));
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX || 1, repeatY || 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function speckle(g, size, rng, n, colors, maxR) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(rng() * colors.length)];
    g.globalAlpha = 0.12 + rng() * 0.2;
    const r = 1 + rng() * maxR;
    g.fillRect(rng() * size, rng() * size, r, r);
  }
  g.globalAlpha = 1;
}

function makeTextures() {
  const concrete = canvasTex(256, (g, s, rng) => {
    g.fillStyle = PALETTE.concrete; g.fillRect(0, 0, s, s);
    speckle(g, s, rng, 900, ['#8a7e6e', '#a89c8a', '#6f6558'], 3);
    g.strokeStyle = 'rgba(60,52,44,0.5)'; g.lineWidth = 3;
    g.strokeRect(2, 2, s - 4, s - 4);
    g.beginPath(); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
    for (let i = 0; i < 8; i++) {
      g.fillStyle = 'rgba(60,52,44,0.6)';
      g.beginPath(); g.arc(rng() * s, rng() * s, 2 + rng() * 2, 0, 7); g.fill();
    }
  }, 'concrete', 2, 1);
  const asphalt = canvasTex(256, (g, s, rng) => {
    g.fillStyle = PALETTE.ground; g.fillRect(0, 0, s, s);
    speckle(g, s, rng, 1400, ['#5d564c', '#7d7668', '#4c463e'], 2);
    g.strokeStyle = 'rgba(40,36,30,0.35)'; g.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      const y = rng() * s;
      g.moveTo(0, y); g.lineTo(s, y + rng() * 20 - 10); g.stroke();
    }
  }, 'asphalt', 10, 8);
  const wood = canvasTex(256, (g, s, rng) => {
    g.fillStyle = '#8a6a42'; g.fillRect(0, 0, s, s);
    for (let p = 0; p < 4; p++) {
      const y = p * 64;
      g.fillStyle = p % 2 ? '#7d5f3a' : '#96744a';
      g.fillRect(0, y, s, 64);
      g.strokeStyle = 'rgba(50,36,20,0.6)'; g.lineWidth = 3;
      g.strokeRect(-2, y, s + 4, 64);
      g.strokeStyle = 'rgba(60,44,24,0.35)'; g.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        const gy = y + 8 + rng() * 48;
        g.moveTo(0, gy);
        g.bezierCurveTo(s * 0.3, gy + rng() * 6 - 3, s * 0.6, gy + rng() * 6 - 3, s, gy);
        g.stroke();
      }
    }
  }, 'wood', 1, 1);
  const corrugated = canvasTex(256, (g, s, rng) => {
    g.fillStyle = PALETTE.rust; g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) {
      g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x, 0, 6, s);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 8, 0, 6, s);
    }
    speckle(g, s, rng, 300, ['#7d3f1e', '#c07a3e'], 4);
    g.fillStyle = 'rgba(240,230,210,0.75)';
    g.font = 'bold 34px sans-serif';
    g.fillText('QUAY-07', 18, 52);
  }, 'corrugated', 2, 1);
  const hazard = canvasTex(128, (g, s) => {
    g.fillStyle = '#c9a227'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#22201c';
    for (let x = -s; x < s * 2; x += 32) {
      g.beginPath();
      g.moveTo(x, s); g.lineTo(x + 16, 0); g.lineTo(x + 32, 0); g.lineTo(x + 16, s);
      g.fill();
    }
  }, 'hazard', 4, 1);
  const panel = canvasTex(256, (g, s, rng) => {
    g.fillStyle = PALETTE.concreteDark; g.fillRect(0, 0, s, s);
    speckle(g, s, rng, 500, ['#6b6055', '#8a7e6e'], 3);
    g.strokeStyle = 'rgba(40,34,28,0.6)'; g.lineWidth = 4;
    g.strokeRect(4, 4, s - 8, s - 8);
    g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.stroke();
    g.fillStyle = 'rgba(240,230,210,0.5)';
    g.font = 'bold 22px sans-serif';
    g.fillText('CQ', 14, s - 16);
  }, 'panel', 3, 1);
  return { concrete, asphalt, wood, corrugated, hazard, panel };
}

function letterTexture(letter, css) {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(20,16,12,0.55)';
  g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill();
  g.strokeStyle = css; g.lineWidth = 6;
  g.beginPath(); g.arc(64, 64, 54, 0, 7); g.stroke();
  g.fillStyle = css;
  g.font = 'bold 72px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(letter, 64, 68);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- Scene ------------------------------------------------------------------
export const worldHandles = {
  deviceMesh: null, deviceLight: null, siteGlows: {}, letters: {},
};

export function buildWorld(scene) {
  const tex = makeTextures();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 58, 150);

  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.1);
  sun.position.set(28, 42, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.002;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9fb8d8, 0.6);
  fill.position.set(-20, 25, -25);
  scene.add(fill);

  // Ground.
  const groundMat = new THREE.MeshStandardMaterial({ map: tex.asphalt, roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(72, 56), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // Apron ring beyond the walls, so the horizon is not void.
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({ color: 0x8a7a5e, roughness: 1 }),
  );
  apron.rotation.x = -Math.PI / 2; apron.position.y = -0.05;
  scene.add(apron);

  const mats = {
    wall: new THREE.MeshStandardMaterial({ map: tex.concrete, roughness: 0.9 }),
    block: new THREE.MeshStandardMaterial({ map: tex.panel, roughness: 0.9 }),
    crate: new THREE.MeshStandardMaterial({ map: tex.wood, roughness: 0.85 }),
    container: new THREE.MeshStandardMaterial({ map: tex.corrugated, roughness: 0.7, metalness: 0.35 }),
    lowwall: new THREE.MeshStandardMaterial({ map: tex.concrete, roughness: 0.9 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x3e5a66, roughness: 0.55, metalness: 0.5 }),
    hazard: new THREE.MeshStandardMaterial({ map: tex.hazard, roughness: 0.8 }),
  };
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.1, 12);

  for (const c of COLLIDERS) {
    const w = c.x1 - c.x0, d = c.z1 - c.z0;
    if (c.kind === 'barrel') {
      const m = new THREE.Mesh(cylGeo, mats.barrel);
      m.position.set((c.x0 + c.x1) / 2, 0.55, (c.z0 + c.z1) / 2);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      continue;
    }
    const m = new THREE.Mesh(boxGeo, mats[c.kind] || mats.wall);
    m.scale.set(w, c.h, d);
    m.position.set((c.x0 + c.x1) / 2, c.h / 2, (c.z0 + c.z1) / 2);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    if (c.kind === 'crate' && c.h > 1.5) {
      // Stacked-crate look: a seam band at the split.
      const band = new THREE.Mesh(boxGeo, mats.crate);
      band.scale.set(w * 1.02, 0.08, d * 1.02);
      band.position.set(m.position.x, 1.15, m.position.z);
      scene.add(band);
    }
    if (c.kind === 'container') {
      const trim = new THREE.Mesh(boxGeo, mats.hazard);
      trim.scale.set(w * 1.02, 0.22, d * 1.02);
      trim.position.set(m.position.x, c.h - 0.11, m.position.z);
      scene.add(trim);
    }
  }

  // Mid door lintel with hazard trim.
  const lintel = new THREE.Mesh(boxGeo, mats.hazard);
  lintel.scale.set(4.4, 0.5, 1);
  lintel.position.set(0, 4.25, -3.6);
  scene.add(lintel);

  // Site zones: translucent floor tint, corner posts, floating letter.
  for (const id of ['A', 'B']) {
    const s = SITES[id];
    const tint = new THREE.Mesh(
      new THREE.PlaneGeometry(s.x1 - s.x0, s.z1 - s.z0),
      new THREE.MeshBasicMaterial({ color: id === 'A' ? 0xf59a3e : 0x3ec9b4, transparent: true, opacity: 0.10, depthWrite: false }),
    );
    tint.rotation.x = -Math.PI / 2;
    tint.position.set(s.cx, 0.02, s.cz);
    scene.add(tint);
    worldHandles.siteGlows[id] = tint.material;
    const postGeo = new THREE.BoxGeometry(0.22, 2.6, 0.22);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 0.8 });
    for (const [px, pz] of [[s.x0 + 0.3, s.z0 + 0.3], [s.x1 - 0.3, s.z0 + 0.3], [s.x0 + 0.3, s.z1 - 0.3], [s.x1 - 0.3, s.z1 - 0.3]]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(px, 1.3, pz);
      post.castShadow = true;
      scene.add(post);
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 8, 6),
        new THREE.MeshBasicMaterial({ color: id === 'A' ? 0xf59a3e : 0x3ec9b4 }),
      );
      lamp.position.set(px, 2.7, pz);
      scene.add(lamp);
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: letterTexture(id, id === 'A' ? '#f5c86e' : '#7fe8d8'),
      transparent: true, depthWrite: false,
    }));
    sprite.scale.setScalar(3.2);
    sprite.position.set(s.cx, 4.6, s.cz);
    scene.add(sprite);
    worldHandles.letters[id] = sprite;
  }

  // Lamp posts along the lanes (visual only).
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5, 8);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 0.8 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe2a8 });
  for (const [px, pz] of [[-27, 8], [27, 8], [-20, -12], [20, -12], [-8, -12], [8, -12]]) {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(px, 2.5, pz);
    pole.castShadow = true;
    scene.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), bulbMat);
    bulb.position.set(px, 5.1, pz);
    scene.add(bulb);
  }

  // The Surge Charge prop: a dark case with a blinking core.
  const device = new THREE.Group();
  const caseMesh = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x23211e, roughness: 0.6, metalness: 0.3 }));
  caseMesh.scale.set(0.55, 0.3, 0.38);
  caseMesh.position.y = 0.15;
  device.add(caseMesh);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff4444 }),
  );
  core.position.set(0.14, 0.34, 0);
  device.add(core);
  const stripe = new THREE.Mesh(boxGeo, mats.hazard);
  stripe.scale.set(0.57, 0.08, 0.4);
  stripe.position.y = 0.3;
  device.add(stripe);
  device.visible = false;
  scene.add(device);
  worldHandles.deviceMesh = device;
  worldHandles.deviceLight = core.material;
}

// Animate site glow pulse, floating letters and the device blink.
export function updateWorldVisuals(time, devicePlanted) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 2.2);
  for (const id of ['A', 'B']) {
    worldHandles.siteGlows[id].opacity = 0.07 + 0.06 * pulse;
    worldHandles.letters[id].position.y = 4.6 + Math.sin(time * 1.1 + (id === 'A' ? 0 : 2)) * 0.15;
  }
  if (worldHandles.deviceMesh.visible && devicePlanted) {
    const on = Math.sin(time * 10) > 0;
    worldHandles.deviceLight.color.setHex(on ? 0xff2222 : 0x551111);
  }
}

// --- Bot bodies ---------------------------------------------------------------
const botGeos = {
  torso: new THREE.BoxGeometry(0.52, 0.62, 0.3),
  vest: new THREE.BoxGeometry(0.56, 0.4, 0.34),
  head: new THREE.BoxGeometry(0.28, 0.3, 0.28),
  helmet: new THREE.BoxGeometry(0.32, 0.14, 0.32),
  visor: new THREE.BoxGeometry(0.24, 0.08, 0.02),
  leg: new THREE.BoxGeometry(0.17, 0.72, 0.19),
  arm: new THREE.BoxGeometry(0.13, 0.13, 0.52),
  gun: new THREE.BoxGeometry(0.09, 0.14, 0.62),
};

export function makeBotMesh(team) {
  const t = TEAMS[team];
  const jacket = new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c2824, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a17e, roughness: 0.8 });
  const group = new THREE.Group();
  const torso = new THREE.Mesh(botGeos.torso, jacket);
  torso.position.y = 1.12; torso.castShadow = true;
  group.add(torso);
  const vest = new THREE.Mesh(botGeos.vest, dark);
  vest.position.set(0, 1.14, 0);
  group.add(vest);
  const head = new THREE.Mesh(botGeos.head, skin);
  head.position.y = 1.6; head.castShadow = true;
  group.add(head);
  const helmet = new THREE.Mesh(botGeos.helmet, dark);
  helmet.position.y = 1.76;
  group.add(helmet);
  const visor = new THREE.Mesh(botGeos.visor, new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.3, metalness: 0.6 }));
  visor.position.set(0, 1.62, -0.15);
  group.add(visor);
  const legL = new THREE.Mesh(botGeos.leg, dark);
  legL.position.set(-0.14, 0.36, 0); legL.castShadow = true;
  group.add(legL);
  const legR = new THREE.Mesh(botGeos.leg, dark);
  legR.position.set(0.14, 0.36, 0); legR.castShadow = true;
  group.add(legR);
  const armL = new THREE.Mesh(botGeos.arm, jacket);
  armL.position.set(-0.22, 1.28, -0.22);
  group.add(armL);
  const armR = new THREE.Mesh(botGeos.arm, jacket);
  armR.position.set(0.22, 1.28, -0.22);
  group.add(armR);
  const gun = new THREE.Mesh(botGeos.gun, dark);
  gun.position.set(0.12, 1.32, -0.5);
  group.add(gun);
  group.userData = { legL, legR, armL, armR, torso, head, walkPhase: 0, deathT: -1 };
  return group;
}

// Drive a bot mesh from its actor: position, facing, walk cycle, crouch and
// the fall-over death animation. No allocation.
export function updateBotVisual(a, dt, time) {
  const g = a.mesh;
  if (!g) return;
  const u = g.userData;
  g.position.set(a.x, a.y, a.z);
  if (!a.alive) {
    if (u.deathT < 0) u.deathT = 0;
    u.deathT = Math.min(1, u.deathT + dt * 3.5);
    g.rotation.set(-Math.PI / 2 * u.deathT, a.yaw, 0);
    g.position.y = a.y + 0.15 * u.deathT;
    return;
  }
  u.deathT = -1;
  g.rotation.set(0, a.yaw, 0);
  const crouchK = a.crouched ? 0.78 : 1;
  g.scale.y = crouchK;
  if (a.moving) {
    u.walkPhase += dt * 9;
    const s = Math.sin(u.walkPhase) * 0.55;
    u.legL.rotation.x = s;
    u.legR.rotation.x = -s;
    u.torso.position.y = 1.12 + Math.abs(Math.cos(u.walkPhase)) * 0.03;
  } else {
    u.legL.rotation.x *= 0.8;
    u.legR.rotation.x *= 0.8;
    u.torso.position.y = 1.12 + Math.sin(time * 1.6 + a.id) * 0.008;
  }
}

// --- First-person viewmodels ---------------------------------------------------
// One group per weapon, built from boxes; the active one is shown. The muzzle
// Object3D marks the barrel tip for tracers and flash placement.
export function makeViewmodels(camera) {
  const root = new THREE.Group();
  root.position.set(0.26, -0.22, -0.6);
  root.scale.setScalar(0.8);
  const metal = new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.55, metalness: 0.35 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x5a4530, roughness: 0.9 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xd88a3a, roughness: 0.6, metalness: 0.3 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cyl = new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8);

  function part(parent, mat, sx, sy, sz, x, y, z) {
    const m = new THREE.Mesh(box, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  const models = {};
  const defs = {
    sidearm: { len: 0.22, mag: 0.1 },
    smg: { len: 0.4, mag: 0.16 },
    rifle: { len: 0.55, mag: 0.18 },
    marksman: { len: 0.72, mag: 0.12 },
  };
  for (const id of Object.keys(defs)) {
    const d = defs[id];
    const grp = new THREE.Group();
    part(grp, metal, 0.07, 0.09, d.len, 0, 0, -d.len / 2);
    const barrel = new THREE.Mesh(cyl, metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.01, -d.len - 0.08);
    grp.add(barrel);
    part(grp, gripMat, 0.06, d.mag, 0.08, 0, -0.09, -0.08);
    part(grp, gripMat, 0.06, 0.1, 0.07, 0, -0.07, 0.1);
    part(grp, accent, 0.03, 0.03, 0.1, 0, 0.06, -d.len * 0.5);
    if (id === 'marksman') {
      part(grp, metal, 0.05, 0.05, 0.22, 0, 0.08, -0.25);
    }
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.01, -d.len - 0.24);
    grp.add(muzzle);
    grp.userData.muzzle = muzzle;
    grp.visible = false;
    root.add(grp);
    models[id] = grp;
  }
  camera.add(root);
  return { root, models };
}
