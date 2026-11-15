// EMBERLINE — tuning constants, weapon definitions and economy.
// One job: every number the rest of the game balances against lives here.

export const TUNE = {
  gravity: 18, jumpSpeed: 6.2, walkSpeed: 4.4, runSpeed: 5.6, crouchSpeed: 2.4,
  accel: 42, friction: 11, airControl: 0.35,
  eyeStand: 1.62, eyeCrouch: 1.12, bodyRadius: 0.36, bodyHeight: 1.75,
  freezeTime: 7, roundTime: 100, fuseTime: 35, plantTime: 3.5,
  defuseTime: 6, defuseKitTime: 3, roundEndTime: 4.5, winRounds: 8,
  startMoney: 800, maxMoney: 16000, killReward: 300, winReward: 3250,
  lossReward: 1900, plantBonus: 300, defuseBonus: 300,
  fixedStep: 1 / 60, maxHealth: 100, armorAbsorb: 0.5,
};

// Every weapon: distinct damage, rate, magazine, reload, spread, recoil,
// falloff, movement penalty and price. Spread is radians; recoil is radians
// of pitch kick per shot. Falloff: full damage to nearM, then linear down to
// minMult at farM.
export const WEAPONS = {
  sidearm: {
    id: 'sidearm', name: 'P9 Lark', slot: 'secondary', price: 0,
    damage: 26, headMult: 2.2, rpm: 320, mag: 12, reserve: 48, reload: 1.4,
    spread: 0.012, moveSpread: 0.035, recoil: 0.011, nearM: 12, farM: 32,
    minMult: 0.55, auto: false, speedMult: 1.0, tracer: 0xffd27a, kick: 0.012,
  },
  smg: {
    id: 'smg', name: 'K7 Hornet', slot: 'primary', price: 1500,
    damage: 22, headMult: 2.0, rpm: 750, mag: 30, reserve: 90, reload: 2.1,
    spread: 0.02, moveSpread: 0.05, recoil: 0.009, nearM: 10, farM: 26,
    minMult: 0.5, auto: true, speedMult: 0.97, tracer: 0xffe9a8, kick: 0.009,
  },
  rifle: {
    id: 'rifle', name: 'AR-4 Ember', slot: 'primary', price: 2700,
    damage: 33, headMult: 2.4, rpm: 600, mag: 30, reserve: 90, reload: 2.4,
    spread: 0.008, moveSpread: 0.045, recoil: 0.014, nearM: 18, farM: 45,
    minMult: 0.65, auto: true, speedMult: 0.93, tracer: 0xffb35c, kick: 0.014,
  },
  marksman: {
    id: 'marksman', name: 'MR-9 Longshot', slot: 'primary', price: 4750,
    damage: 95, headMult: 2.0, rpm: 55, mag: 5, reserve: 15, reload: 3.2,
    spread: 0.001, moveSpread: 0.09, recoil: 0.05, nearM: 30, farM: 80,
    minMult: 0.8, auto: false, speedMult: 0.88, tracer: 0x9fd8ff, kick: 0.04,
  },
};

export const GRENADES = {
  frag: { id: 'frag', name: 'Frag Charge', price: 300, fuse: 2.0, radius: 6.5, damage: 110, color: 0x4a5a3a },
  smoke: { id: 'smoke', name: 'Smog Canister', price: 300, fuse: 1.4, radius: 3.2, life: 18, color: 0x8a8f96 },
  flash: { id: 'flash', name: 'Dazzler', price: 200, fuse: 1.6, radius: 14, color: 0xe8e8d8 },
};

export const BUY_ITEMS = [
  { kind: 'weapon', id: 'smg' }, { kind: 'weapon', id: 'rifle' },
  { kind: 'weapon', id: 'marksman' }, { kind: 'grenade', id: 'frag' },
  { kind: 'grenade', id: 'smoke' }, { kind: 'grenade', id: 'flash' },
  { kind: 'armor', id: 'armor', name: 'Combat Vest', price: 650 },
  { kind: 'kit', id: 'kit', name: 'Defuse Kit', price: 400 },
];

export const TEAMS = {
  atk: { id: 'atk', name: 'Ember Vanguard', short: 'Vanguard', color: 0xe8842c, css: '#f59a3e', role: 'attack' },
  def: { id: 'def', name: 'Quay Wardens', short: 'Wardens', color: 0x2c9e8e, css: '#3ec9b4', role: 'defend' },
};

export const BOT_NAMES = {
  atk: ['Rook', 'Sable', 'Juniper', 'Flint'],
  def: ['Harbor', 'Moss', 'Tarn', 'Wren', 'Pike'],
};

export const GAME_TITLE = 'EMBERLINE';
export const MAP_NAME = 'Cinder Quay';
export const DEVICE_NAME = 'Surge Charge';
