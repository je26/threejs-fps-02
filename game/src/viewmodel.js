// First-person weapon viewmodels: one procedural gun per weapon, built
// from three.js primitives in the game's own palette, attached to the
// player camera. One job: what the player's own weapon looks like and how
// it moves — idle breathing sway, walk bob, recoil kick, the reload dip
// with a dropping magazine, and a muzzle flash with a brief light. No
// external assets; nothing here affects the simulation.

import * as THREE from 'three';
import { WEAPONS } from './config.js';

// Per-weapon silhouettes. Lengths are metres in viewmodel space, with the
// barrel pointing down -Z. Each gun reads differently at a glance: the
// sidearm is a short pistol, the SMG a stubby stocked gun, the rifle a
// full handguard-and-stock gun, the marksman a long scoped gun.
const SPECS = {
  sidearm: { len: 0.24, barrel: 0.10, mag: 0.11, stock: 0, fore: 0, scope: false },
  smg: { len: 0.42, barrel: 0.15, mag: 0.17, stock: 0.13, fore: 0.16, scope: false },
  rifle: { len: 0.56, barrel: 0.19, mag: 0.19, stock: 0.17, fore: 0.25, scope: false },
  marksman: { len: 0.74, barrel: 0.28, mag: 0.13, stock: 0.19, fore: 0.31, scope: true },
};

const GRENADE_COLORS = { frag: 0x4a5a3a, smoke: 0x8a8f96, flash: 0xe8e8d8 };

export function createViewmodel(camera) {
  const root = new THREE.Group();
  root.position.set(0.28, -0.245, -0.62);
  root.scale.setScalar(0.82);
  camera.add(root);

  // Viewmodel materials ignore the depth buffer so the gun never clips
  // into a wall the player stands against; renderOrder draws it last.
  function vmMat(opts) {
    const m = new THREE.MeshStandardMaterial(opts);
    m.depthTest = false;
    return m;
  }
  const metal = vmMat({ color: 0x767069, roughness: 0.5, metalness: 0.45 });
  const darkMetal = vmMat({ color: 0x514b44, roughness: 0.55, metalness: 0.4 });
  const polymer = vmMat({ color: 0x5c554b, roughness: 0.85, metalness: 0.05 });
  const gripMat = vmMat({ color: 0x7d5f3e, roughness: 0.9 });
  const accent = vmMat({ color: 0xd88a3a, roughness: 0.6, metalness: 0.3 });
  const glove = vmMat({ color: 0x5c6b58, roughness: 0.95 });
  const glass = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, depthTest: false });

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(0.022, 0.022, 1, 10);

  function part(parent, mat, sx, sy, sz, x, y, z, rx) {
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    m.renderOrder = 20;
    m.frustumCulled = false;
    parent.add(m);
    return m;
  }

  function barrel(parent, len, z) {
    const b = new THREE.Mesh(cylGeo, metal);
    b.scale.y = len;
    b.rotation.x = Math.PI / 2;
    b.position.set(0, 0.012, z);
    b.renderOrder = 20;
    b.frustumCulled = false;
    parent.add(b);
    return b;
  }

  const models = {};
  for (const id of Object.keys(SPECS)) {
    const sp = SPECS[id];
    const g = new THREE.Group();
    // Receiver, barrel and muzzle brake.
    part(g, metal, 0.075, 0.095, sp.len, 0, 0, -sp.len / 2);
    barrel(g, sp.barrel, -sp.len - sp.barrel / 2 + 0.03);
    part(g, darkMetal, 0.05, 0.05, 0.06, 0, 0.012, -sp.len - sp.barrel + 0.02);
    // Handguard under the front half, with an amber heat band.
    if (sp.fore > 0) {
      part(g, polymer, 0.07, 0.06, sp.fore, 0, -0.07, -sp.len + sp.fore / 2 + 0.04);
      part(g, accent, 0.074, 0.02, 0.03, 0, -0.045, -sp.len + sp.fore * 0.5);
    }
    // Magazine (drops during the reload motion) and pistol grip.
    const mag = part(g, darkMetal, 0.055, sp.mag, 0.085, 0, -0.085 - sp.mag / 2 + 0.05, -0.07, 0.1);
    part(g, gripMat, 0.055, 0.11, 0.075, 0, -0.085, 0.09, 0.28);
    // Stock for the long guns; the sidearm gets a slide and hammer instead.
    if (sp.stock > 0) {
      part(g, polymer, 0.06, 0.075, sp.stock, 0, -0.01, sp.stock / 2 + 0.02);
      part(g, gripMat, 0.062, 0.1, 0.04, 0, -0.015, sp.stock + 0.02);
    } else {
      part(g, darkMetal, 0.07, 0.03, sp.len * 0.8, 0, 0.055, -sp.len / 2);
      part(g, accent, 0.02, 0.02, 0.03, 0, 0.05, 0.02);
    }
    // Iron sights; the marksman trades them for a scope.
    if (sp.scope) {
      const tube = new THREE.Mesh(cylGeo, darkMetal);
      tube.scale.set(1.6, 0.24, 1.6);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(0, 0.085, -0.22);
      tube.renderOrder = 20;
      tube.frustumCulled = false;
      g.add(tube);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.032, 12), glass);
      lens.position.set(0, 0.085, -0.095);
      lens.renderOrder = 21;
      lens.frustumCulled = false;
      g.add(lens);
      part(g, darkMetal, 0.03, 0.03, 0.05, 0, 0.055, -0.14);
      part(g, darkMetal, 0.03, 0.03, 0.05, 0, 0.055, -0.3);
    } else {
      part(g, darkMetal, 0.012, 0.035, 0.02, 0, 0.06, -sp.len + 0.03);
      part(g, darkMetal, 0.03, 0.025, 0.02, 0, 0.055, -0.02);
    }
    // Gloved hands: one on the grip, one forward on the handguard.
    part(g, glove, 0.075, 0.07, 0.09, 0, -0.085, 0.09, 0.28);
    if (sp.fore > 0) part(g, glove, 0.07, 0.06, 0.1, 0, -0.105, -sp.len + sp.fore * 0.6);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.012, -sp.len - sp.barrel);
    g.add(muzzle);
    g.visible = false;
    root.add(g);
    models[id] = { group: g, muzzle, mag, magY: mag.position.y };
  }

  // Grenade in hand: a small sphere with a lever, tinted per grenade kind.
  const nadeBodyMat = vmMat({ color: 0x4a5a3a, roughness: 0.6, metalness: 0.3 });
  const nade = new THREE.Group();
  const nadeBody = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), nadeBodyMat);
  nadeBody.renderOrder = 20;
  nadeBody.frustumCulled = false;
  nade.add(nadeBody);
  part(nade, darkMetal, 0.02, 0.03, 0.07, 0.02, 0.06, 0);
  part(nade, glove, 0.08, 0.07, 0.09, 0, -0.07, 0.02);
  nade.position.set(0, -0.02, -0.15);
  nade.visible = false;
  root.add(nade);
  models.grenade = { group: nade, muzzle: nade, mag: null, magY: 0 };

  // Muzzle flash: a star quad at the barrel tip plus one reusable light.
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false,
    depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), flashMat);
  flash.renderOrder = 22;
  flash.frustumCulled = false;
  flash.visible = false;
  root.add(flash);
  const flashLight = new THREE.PointLight(0xffb35c, 0, 9, 1.6);
  flashLight.position.set(0.1, 0, -0.8);
  root.add(flashLight);

  let activeKey = null;
  let kick = 0;
  let bobPhase = 0;
  let flashLife = 0;

  function setActive(key, grenadeKind) {
    if (key === activeKey) return;
    activeKey = key;
    for (const k of Object.keys(models)) models[k].group.visible = (k === key);
    if (key === 'grenade' && grenadeKind) nadeBodyMat.color.setHex(GRENADE_COLORS[grenadeKind] || 0x4a5a3a);
    if (key && models[key]) flash.position.copy(models[key].muzzle.position);
  }

  return {
    onShot(kickAmount) {
      kick = Math.min(0.085, kick + (kickAmount || 0.012));
      flashLife = 0.06;
      flash.rotation.z = Math.random() * Math.PI;
      flash.visible = true;
    },
    update(dt, actor, weaponId, grenadeKind) {
      const key = grenadeKind ? 'grenade' : weaponId;
      setActive(key, grenadeKind);
      root.visible = !!(actor && actor.alive && key);
      if (!root.visible) { flash.visible = false; flashLight.intensity = 0; return; }
      // Bob: a slow breathing sway at rest, a walk cycle on the move.
      const moving = actor.moving && actor.grounded;
      bobPhase += dt * (moving ? (actor.crouched ? 6 : 9) : 1.4);
      const swayX = moving ? Math.sin(bobPhase * 0.5) * 0.008 : Math.sin(bobPhase * 0.5) * 0.002;
      const swayY = moving ? Math.sin(bobPhase) * 0.01 : Math.sin(bobPhase) * 0.0035;
      // Recoil kick decays; the reload dip follows the reload timer.
      kick *= Math.max(0, 1 - dt * 10);
      let dip = 0;
      const w = weaponId ? WEAPONS[weaponId] : null;
      if (w && actor.reloadTimer > 0) {
        const p = 1 - actor.reloadTimer / w.reload;
        dip = Math.sin(Math.max(0, Math.min(1, p)) * Math.PI);
      }
      const model = models[activeKey];
      if (model && model.mag) model.mag.position.y = model.magY - dip * 0.09;
      root.position.set(0.28 + swayX, -0.245 + swayY - dip * 0.07, -0.62 + kick);
      root.rotation.set(kick * 2.4 - dip * 0.45, swayX * 0.6, dip * 0.22);
      // Muzzle flash fades within a few frames.
      if (flashLife > 0) {
        flashLife -= dt;
        flashMat.opacity = Math.max(0, flashLife / 0.06) * 0.95;
        flashLight.intensity = Math.max(0, flashLife / 0.06) * 5;
        if (flashLife <= 0) { flash.visible = false; flashLight.intensity = 0; }
      }
    },
  };
}
