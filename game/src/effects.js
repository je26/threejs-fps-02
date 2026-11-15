// Visual effects: pooled tracers, impact particles, muzzle flashes, smoke
// clouds and explosion bursts. One job: short-lived feedback. Every pool is
// preallocated; the hot loop never creates objects.

import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_PARTICLES = 240;
const MAX_SMOKE_PUFFS = 90;
const MAX_FLASHES = 8;

let scene = null;
const tracers = [];
const particles = [];
const smokePuffs = [];
const flashes = [];
const tmpColor = new THREE.Color();

const tracerGeo = new THREE.BufferGeometry();
tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));

export function initEffects(s) {
  scene = s;
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
  for (let i = 0; i < MAX_TRACERS; i++) {
    const line = new THREE.Line(tracerGeo.clone(), tracerMat.clone());
    line.visible = false; line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  const pGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const m = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: 0xccaa88, transparent: true }));
    m.visible = false;
    scene.add(m);
    particles.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0, grav: 1 });
  }
  const sGeo = new THREE.SphereGeometry(1, 8, 6);
  for (let i = 0; i < MAX_SMOKE_PUFFS; i++) {
    const m = new THREE.Mesh(sGeo, new THREE.MeshBasicMaterial({
      color: 0xd8d8d2, transparent: true, opacity: 0, depthWrite: false,
    }));
    m.visible = false;
    scene.add(m);
    smokePuffs.push({ mesh: m, life: 0, maxLife: 1, grow: 0 });
  }
  const fGeo = new THREE.PlaneGeometry(0.5, 0.5);
  for (let i = 0; i < MAX_FLASHES; i++) {
    const m = new THREE.Mesh(fGeo, new THREE.MeshBasicMaterial({
      color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    m.visible = false;
    scene.add(m);
    flashes.push({ mesh: m, life: 0 });
  }
}

function nextFree(pool) {
  for (const p of pool) if (p.life <= 0) return p;
  return pool[0];
}

export function spawnTracer(x1, y1, z1, x2, y2, z2, color) {
  const t = nextFree(tracers);
  const pos = t.line.geometry.getAttribute('position');
  pos.setXYZ(0, x1, y1, z1);
  pos.setXYZ(1, x2, y2, z2);
  pos.needsUpdate = true;
  t.line.material.color.setHex(color);
  t.line.material.opacity = 0.9;
  t.line.visible = true;
  t.life = 0.07;
}

export function spawnImpact(x, y, z, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const p = nextFree(particles);
    p.mesh.position.set(x, y, z);
    const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2;
    const s = speed * (0.4 + Math.random() * 0.8);
    p.vx = Math.cos(a) * Math.cos(b) * s;
    p.vy = Math.abs(Math.sin(b)) * s + 1;
    p.vz = Math.sin(a) * Math.cos(b) * s;
    p.mesh.material.color.setHex(color);
    p.mesh.material.opacity = 1;
    p.mesh.visible = true;
    p.life = 0.35 + Math.random() * 0.3;
    p.grav = 1;
  }
}

export function spawnMuzzleFlash(mesh, x, y, z) {
  const f = nextFree(flashes);
  f.mesh.position.set(x, y, z);
  f.mesh.rotation.set(0, mesh ? mesh.rotation.y : 0, Math.random() * Math.PI);
  f.mesh.scale.setScalar(0.7 + Math.random() * 0.5);
  f.mesh.material.opacity = 0.95;
  f.mesh.visible = true;
  f.life = 0.05;
}

export function spawnSmokeCloud(x, y, z, radius, life) {
  for (let i = 0; i < 10; i++) {
    const p = nextFree(smokePuffs);
    const a = Math.random() * Math.PI * 2, r = Math.random() * radius * 0.6;
    p.mesh.position.set(x + Math.cos(a) * r, y + Math.random() * 1.2, z + Math.sin(a) * r);
    p.mesh.scale.setScalar(0.6 + Math.random() * 0.8);
    p.mesh.material.opacity = 0.55;
    p.mesh.visible = true;
    p.life = life; p.maxLife = life;
    p.grow = radius / life;
  }
}

export function spawnExplosion(x, y, z) {
  spawnImpact(x, y, z, 0xff8830, 26, 7);
  spawnImpact(x, y, z, 0x554433, 18, 4);
  spawnImpact(x, y, z, 0xffe9a8, 10, 9);
  const f = nextFree(flashes);
  f.mesh.position.set(x, y + 0.5, z);
  f.mesh.scale.setScalar(4);
  f.mesh.material.opacity = 1;
  f.mesh.visible = true;
  f.life = 0.18;
}

export function updateEffects(dt, camera) {
  for (const t of tracers) {
    if (t.life <= 0) continue;
    t.life -= dt;
    if (t.life <= 0) t.line.visible = false;
    else t.line.material.opacity = t.life / 0.07 * 0.9;
  }
  for (const p of particles) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.vy -= 9 * p.grav * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    if (p.mesh.position.y < 0.03) { p.mesh.position.y = 0.03; p.vy = 0; }
    p.mesh.material.opacity = Math.min(1, p.life * 3);
  }
  for (const p of smokePuffs) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.mesh.scale.addScalar(p.grow * dt);
    const fade = Math.min(1, p.life / 3);
    p.mesh.material.opacity = 0.55 * fade;
  }
  for (const f of flashes) {
    if (f.life <= 0) continue;
    f.life -= dt;
    if (f.life <= 0) { f.mesh.visible = false; continue; }
    if (camera) f.mesh.quaternion.copy(camera.quaternion);
    f.mesh.material.opacity = f.life * 12;
  }
  void tmpColor;
}
