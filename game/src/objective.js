// Objective and round state machine: planting, defusing, damage, deaths,
// economy and the match flow. One job: the rules of a round. It owns no
// rendering and no input; controllers (player input, bot AI) ask it to start
// channels and it decides what counts.

import { S, createActor, resetActorForRound, aliveCount, pushFeed, setBanner, addNoise } from './state.js';
import { TUNE, WEAPONS, GRENADES, TEAMS, BOT_NAMES, DEVICE_NAME } from './config.js';
import { SPAWNS, SPAWN_YAW, SITES, siteAt } from './mapdata.js';
import { segmentClear } from './movement.js';
import { spawnExplosion, spawnImpact } from './effects.js';
import { playExplosion, playStinger, playRoundStart, playHitmarker, playHurt, playBeep, playBuy, playDenied } from './audio.js';
import { rnd, rndInt, reseed } from './rng.js';

// Plain-data bot brain. bots.js interprets these fields; nothing here imports
// the AI, so there is no module cycle.
export function makeBrain(role) {
  return {
    role, // 'push' | 'hold' | 'mid' | 'lurk' | 'carrier'
    state: 'move', // 'move' | 'hold' | 'engage' | 'plant' | 'defuse' | 'rotate'
    path: [], pathIdx: 0,
    goalSite: null, holdSpot: null,
    target: null, seenTime: -99, lastKnownX: 0, lastKnownZ: 0, lastKnownT: -99,
    reaction: 0.35, aimErr: 0.05, burstLeft: 0, burstPause: 0, noLosT: 0,
    skill: 0.5, blind: 0, holdUntil: 0,
    strafeDir: 1, strafeTimer: 0, investigate: null, scanYaw: 0,
    perceiveTimer: 0, decisionTimer: 0,
    stuckT: 0, stuckX: 0, stuckZ: 0, sidestepUntil: 0, sidestepDir: 1,
  };
}

export function startMatch(side) {
  S.playerSide = side;
  S.actors.length = 0;
  S.wins.atk = 0; S.wins.def = 0;
  S.round = 0; S.matchWinner = null;
  S.feed.length = 0;
  reseed((Date.now() % 2000000000) + 7);
  S.matchSeed = rndInt(1, 999999);
  const player = createActor('You', side, true);
  player.bot = null;
  S.actors.push(player);
  S.player = player;
  const other = side === 'atk' ? 'def' : 'atk';
  const allyNames = BOT_NAMES[side], foeNames = BOT_NAMES[other];
  for (let i = 0; i < 4; i++) {
    const b = createActor(allyNames[i], side, false);
    b.bot = makeBrain(i === 0 ? 'carrier' : i === 1 ? 'push' : i === 2 ? 'mid' : 'lurk');
    S.actors.push(b);
  }
  for (let i = 0; i < 5; i++) {
    const b = createActor(foeNames[i], other, false);
    b.bot = makeBrain(i < 2 ? 'hold' : i === 2 ? 'mid' : 'hold');
    S.actors.push(b);
  }
  // Skill spread: one sharp bot per team, the rest middling.
  for (const a of S.actors) {
    if (a.bot) {
      a.bot.skill = 0.35 + rnd() * 0.45;
      a.bot.reaction = 0.55 - a.bot.skill * 0.35;
    }
  }
  startRound();
}

function botLoadout(a, round) {
  // Bots "buy" procedurally: pistols on round one, rifles once the economy
  // would allow them, one marksman per team from round four.
  a.primary = round >= 2 ? 'rifle' : 'sidearm';
  if (round >= 4 && a.bot && a.bot.role === 'mid') a.primary = 'marksman';
  if (round === 1 && a.bot && (a.bot.role === 'push' || a.bot.role === 'hold')) a.primary = 'smg';
  // current holds a SLOT ('primary'/'secondary'), never a weapon id:
  // currentWeapon() resolves the slot to the equipped weapon.
  a.current = a.primary === 'sidearm' ? 'secondary' : 'primary';
  a.grenades.frag = round >= 2 ? 1 : 0;
  a.grenades.smoke = round >= 3 && a.team === 'atk' ? 1 : 0;
  a.grenades.flash = round >= 3 ? 1 : 0;
  a.armor = round >= 2 ? 100 : 0;
  for (const id of Object.keys(WEAPONS)) {
    a.mag[id] = WEAPONS[id].mag;
    a.reserve[id] = WEAPONS[id].reserve;
  }
}

export function startRound() {
  S.round++;
  S.phase = 'freeze';
  S.phaseTime = TUNE.freezeTime;
  S.roundTimer = TUNE.roundTime;
  S.roundReason = '';
  S.roundWinner = null;
  S.grenades.length = 0;
  S.smokes.length = 0;
  S.noises.length = 0;
  S.buyOpen = true;
  S.paused = false;
  S.device.state = 'carried';
  S.device.site = null;
  S.device.fuse = 0;
  const attackers = S.actors.filter((a) => a.team === 'atk');
  const carrier = attackers[rndInt(0, attackers.length - 1)];
  S.device.carrierId = carrier.id;
  const spawnIdx = { atk: 0, def: 0 };
  for (const a of S.actors) {
    const spawn = SPAWNS[a.team][spawnIdx[a.team]++];
    resetActorForRound(a, spawn, SPAWN_YAW[a.team]);
    if (!a.isPlayer) botLoadout(a, S.round);
    else {
      a.current = a.primary === 'sidearm' ? 'secondary' : 'primary';
      if (S.round === 1) { a.primary = 'sidearm'; a.current = 'secondary'; }
    }
    // Attackers pick a site to push; defenders pick holds.
    if (a.bot) {
      a.bot.goalSite = a.team === 'atk' ? (rnd() < 0.5 ? 'A' : 'B') : null;
      if (a.team === 'atk' && a.id === carrier.id) a.bot.role = 'carrier';
      a.bot.path = [];
      a.bot.holdSpot = null;
    }
  }
  setBanner('Round ' + S.round, '#f5c86e', 2.5);
  S.message = carrier.isPlayer
    ? 'You carry the ' + DEVICE_NAME + ' — plant it at Site A or Site B'
    : carrier.name + ' carries the ' + DEVICE_NAME;
  S.messageTime = 4;
  playRoundStart();
}

export function endRound(winner, reason) {
  if (S.phase === 'roundEnd' || S.phase === 'matchEnd') return;
  S.phase = 'roundEnd';
  S.phaseTime = TUNE.roundEndTime;
  S.roundWinner = winner;
  S.roundReason = reason;
  S.wins[winner]++;
  S.buyOpen = false;
  for (const a of S.actors) {
    if (a.channel) a.channel = null;
  }
  // Economy: winners and losers both get paid; the player sees the numbers.
  const p = S.player;
  if (p) {
    p.money = Math.min(TUNE.maxMoney, p.money + (p.team === winner ? TUNE.winReward : TUNE.lossReward));
  }
  const won = S.player && S.player.team === winner;
  setBanner(
    (winner === 'atk' ? TEAMS.atk.name : TEAMS.def.name) + ' win the round',
    won ? '#7fe8a8' : '#f08a7a',
    TUNE.roundEndTime,
  );
  S.message = reason;
  S.messageTime = TUNE.roundEndTime;
  pushFeed(reason, won ? '#7fe8a8' : '#f08a7a');
  playStinger(won);
  if (S.wins[winner] >= TUNE.winRounds) {
    S.matchWinner = winner;
  }
}

// --- Damage -------------------------------------------------------------------
export function applyDamage(target, rawAmount, attacker, isHead, weaponId) {
  if (!target.alive || S.phase !== 'live') return;
  let amount = rawAmount;
  if (target.armor > 0) {
    const absorbed = amount * TUNE.armorAbsorb;
    target.armor = Math.max(0, target.armor - absorbed);
    amount -= absorbed;
  }
  amount = Math.max(1, Math.round(amount));
  target.hp -= amount;
  target.lastAttacker = attacker;
  target.lastDamageTime = S.time;
  if (target.channel) target.channel = null; // damage breaks a channel
  if (attacker && attacker.isPlayer) {
    S.hitmark = 0.18;
    S.hitmarkKill = target.hp <= 0;
    playHitmarker(target.hp <= 0);
  }
  if (target.isPlayer) {
    S.damageFlash = 0.5;
    if (attacker) S.damageFrom = Math.atan2(attacker.x - target.x, attacker.z - target.z);
    playHurt();
  }
  if (target.hp <= 0) killActor(target, attacker, isHead, weaponId);
}

function killActor(target, attacker, isHead, weaponId) {
  target.hp = 0;
  target.alive = false;
  target.deaths++;
  target.channel = null;
  if (attacker && attacker !== target) {
    attacker.kills++;
    if (attacker.isPlayer) {
      attacker.money = Math.min(TUNE.maxMoney, attacker.money + TUNE.killReward);
    }
  }
  const wname = weaponId && WEAPONS[weaponId] ? WEAPONS[weaponId].name : 'explosion';
  const killer = attacker ? attacker.name : 'The blast';
  pushFeed(killer + (isHead ? ' ▸ headshot ▸ ' : ' ▸ ') + target.name + '  [' + wname + ']',
    attacker && attacker.team === 'atk' ? TEAMS.atk.css : TEAMS.def.css);
  // The device drops where its carrier falls.
  if (S.device.state === 'carried' && S.device.carrierId === target.id) {
    S.device.state = 'dropped';
    S.device.x = target.x; S.device.z = target.z;
    S.message = DEVICE_NAME + ' dropped';
    S.messageTime = 3;
  }
}

// --- Channels: plant / defuse -------------------------------------------------
export function canPlant(a) {
  return a.alive && a.team === 'atk' && S.phase === 'live'
    && S.device.state === 'carried' && S.device.carrierId === a.id
    && siteAt(a.x, a.z) !== null;
}

export function canDefuse(a) {
  if (!a.alive || a.team !== 'def' || S.phase !== 'live') return false;
  if (S.device.state !== 'planted') return false;
  const dx = a.x - S.device.x, dz = a.z - S.device.z;
  return dx * dx + dz * dz < 2.5 * 2.5;
}

// Called every tick by the actor's controller while the channel key is held.
// Returns the channel or null.
export function holdChannel(a) {
  if (a.channel) return a.channel;
  if (canPlant(a)) {
    a.channel = { kind: 'plant', site: siteAt(a.x, a.z), t: 0, total: TUNE.plantTime };
    return a.channel;
  }
  if (canDefuse(a)) {
    a.channel = { kind: 'defuse', site: S.device.site, t: 0, total: a.hasKit ? TUNE.defuseKitTime : TUNE.defuseTime };
    return a.channel;
  }
  return null;
}

function completeChannel(a, ch) {
  a.channel = null;
  if (ch.kind === 'plant') {
    S.device.state = 'planted';
    S.device.site = ch.site;
    S.device.x = a.x; S.device.z = a.z;
    S.device.fuse = TUNE.fuseTime;
    S.device.beepTimer = 0;
    if (a.isPlayer) a.money = Math.min(TUNE.maxMoney, a.money + TUNE.plantBonus);
    setBanner(DEVICE_NAME + ' planted at Site ' + ch.site + '!', '#ff9a4e', 3);
    pushFeed(a.name + ' planted the ' + DEVICE_NAME + ' at Site ' + ch.site, '#ff9a4e');
    addNoise(a.x, a.z, 30);
  } else {
    S.device.state = 'gone';
    if (a.isPlayer) a.money = Math.min(TUNE.maxMoney, a.money + TUNE.defuseBonus);
    endRound('def', a.name + ' defused the ' + DEVICE_NAME);
  }
}

function detonate() {
  const dx = S.device.x, dz = S.device.z;
  spawnExplosion(dx, 0.6, dz);
  playExplosion(dx, dz);
  addNoise(dx, dz, 60);
  // Blast damage with line-of-sight: cover saves lives.
  for (const a of S.actors) {
    if (!a.alive) continue;
    const ddx = a.x - dx, ddz = a.z - dz;
    const d = Math.sqrt(ddx * ddx + ddz * ddz);
    if (d < 11 && segmentClear(dx, 0.6, dz, a.x, 1.2, a.z)) {
      const dmg = Math.round(140 * (1 - d / 12));
      a.hp -= Math.max(1, dmg);
      if (a.hp <= 0) killActor(a, null, false, null);
      else if (a.isPlayer) { S.damageFlash = 0.7; playHurt(); }
    }
  }
  S.device.state = 'gone';
  endRound('atk', 'The ' + DEVICE_NAME + ' detonated');
}

// --- Economy ------------------------------------------------------------------
export function buyItem(a, item) {
  if (S.phase !== 'freeze' || !a.alive) { playDenied(); return false; }
  let price = item.price;
  if (item.kind === 'weapon') price = WEAPONS[item.id].price;
  if (item.kind === 'grenade') price = GRENADES[item.id].price;
  if (a.money < price) { playDenied(); S.message = 'Not enough money'; S.messageTime = 1.5; return false; }
  if (item.kind === 'weapon') {
    const w = WEAPONS[item.id];
    a[w.slot] = item.id;
    a.mag[item.id] = w.mag;
    a.reserve[item.id] = w.reserve;
    a.current = w.slot;
    S.message = 'Bought ' + w.name;
  } else if (item.kind === 'grenade') {
    const cap = item.id === 'flash' ? 2 : 1;
    if (a.grenades[item.id] >= cap) { playDenied(); return false; }
    a.grenades[item.id]++;
    S.message = 'Bought ' + GRENADES[item.id].name;
  } else if (item.kind === 'armor') {
    if (a.armor >= 100) { playDenied(); return false; }
    a.armor = 100;
    S.message = 'Bought Combat Vest';
  } else if (item.kind === 'kit') {
    if (a.hasKit) { playDenied(); return false; }
    a.hasKit = true;
    S.message = 'Bought Defuse Kit — defuses take half as long';
  }
  a.money -= price;
  S.messageTime = 2;
  playBuy();
  return true;
}

// --- Per-tick rules -------------------------------------------------------------
export function updateObjective(dt) {
  if (S.phase === 'freeze') {
    S.phaseTime -= dt;
    if (S.phaseTime <= 0) {
      S.phase = 'live';
      S.buyOpen = false;
      setBanner('Go! Plant or defend the sites', '#f5c86e', 2);
    }
    return;
  }
  if (S.phase === 'roundEnd') {
    S.phaseTime -= dt;
    if (S.phaseTime <= 0) {
      if (S.matchWinner) {
        S.phase = 'matchEnd';
      } else {
        startRound();
      }
    }
    return;
  }
  if (S.phase !== 'live') return;

  // Channels progress only while the controller keeps holding (it re-asserts
  // channelHeld each tick; a missing assertion cancels the channel).
  for (const a of S.actors) {
    if (!a.channel) continue;
    if (!a.channelHeld || !a.alive) { a.channel = null; continue; }
    const ch = a.channel;
    if (ch.kind === 'plant' && siteAt(a.x, a.z) !== ch.site) { a.channel = null; continue; }
    if (ch.kind === 'defuse' && !canDefuse(a)) { a.channel = null; continue; }
    ch.t += dt;
    if (ch.t >= ch.total) completeChannel(a, ch);
  }

  // Dropped device pickup: any living attacker walking over it takes it.
  if (S.device.state === 'dropped') {
    for (const a of S.actors) {
      if (!a.alive || a.team !== 'atk') continue;
      const dx = a.x - S.device.x, dz = a.z - S.device.z;
      if (dx * dx + dz * dz < 1.1 * 1.1) {
        S.device.state = 'carried';
        S.device.carrierId = a.id;
        if (a.isPlayer) { S.message = 'Picked up the ' + DEVICE_NAME; S.messageTime = 2.5; }
        break;
      }
    }
  }

  // Fuse and beeps: the beep rate rises as detonation nears.
  if (S.device.state === 'planted') {
    S.device.fuse -= dt;
    S.device.beepTimer -= dt;
    if (S.device.beepTimer <= 0) {
      const urgency = 1 - S.device.fuse / TUNE.fuseTime;
      S.device.beepTimer = 1.0 - urgency * 0.75;
      playBeep(1 + urgency * 2);
    }
    if (S.device.fuse <= 0) { detonate(); return; }
  } else {
    S.roundTimer -= dt;
    if (S.roundTimer <= 0) {
      S.roundTimer = 0;
      endRound('def', 'Time expired — the sites held');
      return;
    }
  }

  // Elimination. A planted device suspends elimination endings: the round is
  // decided by detonation or defusal alone.
  if (S.device.state !== 'planted') {
    if (aliveCount('atk') === 0) { endRound('def', 'Vanguard eliminated'); return; }
    if (aliveCount('def') === 0) { endRound('atk', 'Wardens eliminated'); return; }
  }
}

export function deviceCarrier() {
  if (S.device.state !== 'carried') return null;
  return S.actors.find((a) => a.id === S.device.carrierId) || null;
}

export function impactSpark(x, y, z, hitFlesh) {
  spawnImpact(x, y, z, hitFlesh ? 0xa83232 : 0xc9b896, hitFlesh ? 8 : 5, 3);
}
