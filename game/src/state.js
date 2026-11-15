// The single home of all mutable game state. Every module reads and writes
// this one object; nothing else keeps authoritative game state. Rendering
// pools and DOM caches live in their own modules, never here.

import { TUNE, WEAPONS } from './config.js';

export const S = {
  // Match / round flow. phase: 'menu' | 'freeze' | 'live' | 'roundEnd' | 'matchEnd'
  phase: 'menu',
  phaseTime: 0,
  round: 0,
  wins: { atk: 0, def: 0 },
  roundTimer: TUNE.roundTime,
  roundReason: '',
  roundWinner: null,
  matchWinner: null,
  playerSide: 'atk',
  time: 0,
  tick: 0,
  matchSeed: 1,

  // Actors: index 0 is always the player. See createActor for the shape.
  actors: [],
  player: null,

  // The objective device.
  device: {
    state: 'carried', // 'carried' | 'planted' | 'dropped' | 'gone'
    carrierId: -1,
    site: null, // 'A' | 'B'
    x: 0, z: 0,
    fuse: 0,
    beepTimer: 0,
  },

  // Live grenades and smoke clouds (updated by weapons.js).
  grenades: [],
  smokes: [],

  // Noise events bots can hear: {x, z, radius, time}. Pruned each tick.
  noises: [],

  // Kill feed entries: {text, css, time}. Pruned by the HUD.
  feed: [],

  // Transient player feedback, consumed by the HUD.
  hitmark: 0, hitmarkKill: false,
  damageFlash: 0, damageFrom: 0,
  flashAmount: 0,
  banner: '', bannerTime: 0, bannerCss: '',
  message: '', messageTime: 0,

  // Buy menu / pause.
  buyOpen: false,
  paused: false,
  muted: false,
};

let nextActorId = 0;

export function createActor(name, team, isPlayer) {
  const a = {
    id: nextActorId++,
    name, team, isPlayer,
    alive: true, hp: TUNE.maxHealth, armor: 0, hasKit: false,
    // Kinematics (y is feet height; the map floor is y = 0).
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grounded: true,
    yaw: 0, pitch: 0,
    crouched: false, moving: false, walking: false,
    // Loadout.
    primary: 'rifle', secondary: 'sidearm', current: 'secondary',
    mag: {}, reserve: {},
    grenades: { frag: 0, smoke: 0, flash: 0 },
    money: TUNE.startMoney,
    // Weapon state.
    fireCooldown: 0, reloadTimer: 0, reloadWeapon: null,
    recoilPitch: 0, recoilYaw: 0, bloom: 0,
    triggerHeld: false, triggerEdge: false,
    // Channel: planting / defusing. {kind, site, t, total} or null.
    channel: null,
    // View / mesh handles, filled by world.js / main.js.
    mesh: null, viewmodel: null,
    // Bot brain, null for the player.
    bot: null,
    // Combat bookkeeping.
    lastAttacker: null, lastDamageTime: -99, stepTimer: 0,
    kills: 0, deaths: 0,
  };
  for (const id of Object.keys(WEAPONS)) {
    a.mag[id] = WEAPONS[id].mag;
    a.reserve[id] = WEAPONS[id].reserve;
  }
  return a;
}

export function resetActorForRound(a, spawn, yaw) {
  a.alive = true; a.hp = TUNE.maxHealth;
  a.x = spawn.x; a.y = 0; a.z = spawn.z; a.vx = 0; a.vy = 0; a.vz = 0;
  a.yaw = yaw; a.pitch = 0; a.crouched = false;
  a.fireCooldown = 0; a.reloadTimer = 0; a.reloadWeapon = null;
  a.recoilPitch = 0; a.recoilYaw = 0; a.bloom = 0;
  a.channel = null; a.lastAttacker = null;
  a.triggerHeld = false; a.triggerEdge = false;
  if (a.bot) {
    a.bot.path = []; a.bot.pathIdx = 0; a.bot.state = 'move';
    a.bot.target = null; a.bot.seenTime = -99; a.bot.blind = 0;
    a.bot.holdUntil = 0; a.bot.strafeDir = 1; a.bot.strafeTimer = 0;
    a.bot.goalSite = null; a.bot.investigate = null;
    a.bot.noLosT = 0; a.bot.lastKnownT = -99; a.bot.burstLeft = 0; a.bot.burstPause = 0;
    a.bot.stuckT = 0; a.bot.sidestepUntil = 0; a.bot.sidestepDir = 1;
  }
}

export function aliveCount(team) {
  let n = 0;
  for (const a of S.actors) if (a.alive && a.team === team) n++;
  return n;
}

export function pushFeed(text, css) {
  S.feed.push({ text, css: css || '#e8e4da', time: S.time });
  if (S.feed.length > 6) S.feed.shift();
}

export function setBanner(text, css, seconds) {
  S.banner = text; S.bannerCss = css || '#f5c86e'; S.bannerTime = seconds;
}

export function addNoise(x, z, radius) {
  S.noises.push({ x, z, radius, time: S.time });
  if (S.noises.length > 24) S.noises.shift();
}
