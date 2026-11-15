// HUD: every DOM overlay the player reads — health, ammo, timer, score,
// kill feed, banners, channel progress, buy menu and end panels. One job:
// presenting state. It never changes game rules; clicks call back into
// main.js, which owns the actions.

import { S, aliveCount } from './state.js';
import { TUNE, WEAPONS, GRENADES, BUY_ITEMS, TEAMS, GAME_TITLE, MAP_NAME, DEVICE_NAME } from './config.js';
import { currentWeapon, isGrenadeSelected } from './weapons.js';

const $ = (id) => document.getElementById(id);
let el = {};
let lastFeedLen = -1;
let lastBuySig = '';
let callbacks = null;

function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

export function initHud(cb) {
  callbacks = cb;
  el = {
    hud: $('hud'), healthNum: $('healthNum'), healthFill: $('healthFill'),
    armorRow: $('armorRow'), armorNum: $('armorNum'),
    ammoMag: $('ammoMag'), ammoReserve: $('ammoReserve'), weaponName: $('weaponName'),
    reloadHint: $('reloadHint'), money: $('money'), timer: $('timer'),
    timerLabel: $('timerLabel'), scoreAtk: $('scoreAtk'), scoreDef: $('scoreDef'),
    aliveAtk: $('aliveAtk'), aliveDef: $('aliveDef'), roundNum: $('roundNum'),
    crosshair: $('crosshair'), hitmarker: $('hitmarker'), killfeed: $('killfeed'),
    banner: $('banner'), message: $('message'), channel: $('channel'),
    channelFill: $('channelFill'), channelLabel: $('channelLabel'),
    grenades: $('grenades'), deviceTag: $('deviceTag'),
    vignette: $('vignette'), flash: $('flashOverlay'),
    buyMenu: $('buyMenu'), buyGrid: $('buyGrid'), buyMoney: $('buyMoney'),
    menu: $('menu'), roundPanel: $('roundPanel'), matchPanel: $('matchPanel'),
    pausePanel: $('pausePanel'), roundTitle: $('roundTitle'), roundDetail: $('roundDetail'),
    matchTitle: $('matchTitle'), matchDetail: $('matchDetail'),
    sideTag: $('sideTag'), spectate: $('spectate'),
  };
  $('titleText').textContent = GAME_TITLE;
  $('mapText').textContent = MAP_NAME + ' — first to ' + TUNE.winRounds + ' rounds';
  $('startAtk').addEventListener('click', () => callbacks.onStart('atk'));
  $('startDef').addEventListener('click', () => callbacks.onStart('def'));
  $('restartBtn').addEventListener('click', () => callbacks.onRestart());
  $('resumeBtn').addEventListener('click', () => callbacks.onResume());
  $('buyClose').addEventListener('click', () => callbacks.onCloseBuy());
  buildBuyMenu();
}

function buildBuyMenu() {
  el.buyGrid.innerHTML = '';
  for (const item of BUY_ITEMS) {
    let name = item.name, price = item.price, desc = '';
    if (item.kind === 'weapon') {
      const w = WEAPONS[item.id];
      name = w.name; price = w.price;
      desc = 'DMG ' + w.damage + ' · ' + w.rpm + ' RPM · ' + w.mag + ' rounds';
    } else if (item.kind === 'grenade') {
      name = GRENADES[item.id].name; price = GRENADES[item.id].price;
      desc = item.id === 'frag' ? 'Blast damage in a radius' : item.id === 'smoke' ? 'Blocks sight for 18 seconds' : 'Blinds anyone facing it';
    } else if (item.kind === 'armor') {
      desc = 'Halves damage taken';
    } else {
      desc = 'Defuse in half the time';
    }
    const b = document.createElement('button');
    b.className = 'buyItem';
    b.innerHTML = '<span class="buyName"></span><span class="buyDesc"></span><span class="buyPrice"></span>';
    b.querySelector('.buyName').textContent = name;
    b.querySelector('.buyDesc').textContent = desc;
    b.querySelector('.buyPrice').textContent = '$' + price;
    b.addEventListener('click', () => callbacks.onBuy(item));
    el.buyGrid.appendChild(b);
  }
}

function updateBuyMenu() {
  const p = S.player;
  if (!p) return;
  const sig = p.money + '|' + p.primary + '|' + p.armor + '|' + p.hasKit + '|'
    + p.grenades.frag + p.grenades.smoke + p.grenades.flash;
  el.buyMoney.textContent = '$' + p.money;
  if (sig === lastBuySig) return;
  lastBuySig = sig;
  const kids = el.buyGrid.children;
  for (let i = 0; i < kids.length; i++) {
    const item = BUY_ITEMS[i];
    let price = item.price;
    if (item.kind === 'weapon') price = WEAPONS[item.id].price;
    if (item.kind === 'grenade') price = GRENADES[item.id].price;
    kids[i].classList.toggle('cant', p.money < price);
  }
}

function updateFeed() {
  if (S.feed.length === lastFeedLen) return;
  lastFeedLen = S.feed.length;
  el.killfeed.innerHTML = '';
  for (const f of S.feed) {
    const d = document.createElement('div');
    d.className = 'feedLine';
    d.style.color = f.css;
    d.textContent = f.text;
    el.killfeed.appendChild(d);
  }
}

export function updateHud(dt) {
  const p = S.player;
  const inGame = S.phase !== 'menu';
  el.hud.style.display = inGame ? 'block' : 'none';
  el.menu.style.display = S.phase === 'menu' ? 'flex' : 'none';
  el.roundPanel.style.display = S.phase === 'roundEnd' ? 'flex' : 'none';
  el.matchPanel.style.display = S.phase === 'matchEnd' ? 'flex' : 'none';
  el.pausePanel.style.display = S.paused && inGame ? 'flex' : 'none';
  el.buyMenu.style.display = S.buyOpen && S.phase === 'freeze' ? 'block' : 'none';
  if (!p) return;

  // Vital signs.
  el.healthNum.textContent = Math.max(0, p.hp);
  el.healthFill.style.width = Math.max(0, p.hp) + '%';
  el.healthFill.style.background = p.hp > 50 ? '#7fe8a8' : p.hp > 25 ? '#f5c86e' : '#f08a7a';
  el.armorRow.style.display = p.armor > 0 ? 'flex' : 'none';
  el.armorNum.textContent = Math.round(p.armor);
  el.money.textContent = '$' + p.money;
  el.sideTag.textContent = TEAMS[p.team].name;
  el.sideTag.style.color = TEAMS[p.team].css;

  // Weapon and ammo.
  const w = currentWeapon(p);
  if (isGrenadeSelected(p)) {
    el.weaponName.textContent = GRENADES[p.current].name;
    el.ammoMag.textContent = p.grenades[p.current];
    el.ammoReserve.textContent = '';
    el.reloadHint.textContent = 'Click to throw';
  } else if (w) {
    el.weaponName.textContent = w.name;
    el.ammoMag.textContent = p.mag[w.id];
    el.ammoReserve.textContent = '/ ' + p.reserve[w.id];
    el.reloadHint.textContent = p.reloadTimer > 0 ? 'Reloading…' : p.mag[w.id] === 0 ? 'Press R to reload' : '';
  }
  el.ammoMag.style.color = w && p.mag[w.id] === 0 ? '#f08a7a' : '#f5f2ea';

  // Grenade slots.
  el.grenades.textContent = 'Frag ' + p.grenades.frag + ' · Smog ' + p.grenades.smoke + ' · Dazzler ' + p.grenades.flash;

  // Device carrier tag.
  const carrier = S.device.state === 'carried' && S.device.carrierId === p.id;
  el.deviceTag.style.display = carrier || S.device.state === 'planted' ? 'block' : 'none';
  el.deviceTag.textContent = carrier ? '◆ Carrying the ' + DEVICE_NAME : '◆ ' + DEVICE_NAME + ' planted at Site ' + S.device.site;

  // Timer and score.
  el.scoreAtk.textContent = S.wins.atk;
  el.scoreDef.textContent = S.wins.def;
  el.aliveAtk.textContent = aliveCount('atk') + ' alive';
  el.aliveDef.textContent = aliveCount('def') + ' alive';
  el.roundNum.textContent = 'Round ' + Math.max(1, S.round);
  if (S.phase === 'freeze') {
    el.timerLabel.textContent = 'BUY PHASE';
    el.timer.textContent = fmtTime(S.phaseTime);
    el.timer.style.color = '#f5c86e';
  } else if (S.device.state === 'planted') {
    el.timerLabel.textContent = 'CHARGE FUSE';
    el.timer.textContent = fmtTime(S.device.fuse);
    el.timer.style.color = '#ff6a4e';
  } else {
    el.timerLabel.textContent = 'ROUND';
    el.timer.textContent = fmtTime(S.roundTimer);
    el.timer.style.color = S.roundTimer < 15 ? '#ff6a4e' : '#f5f2ea';
  }

  // Crosshair: gap grows with spread, bloom and movement.
  const speed = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
  const gap = w ? 6 + (w.spread + p.bloom + w.moveSpread * Math.min(1, speed / TUNE.runSpeed)) * 260 : 8;
  el.crosshair.style.setProperty('--gap', Math.round(gap) + 'px');
  el.crosshair.style.display = p.alive && !S.buyOpen && !S.paused ? 'block' : 'none';

  // Hitmarker, damage vignette, flash.
  el.hitmarker.style.opacity = S.hitmark > 0 ? 1 : 0;
  el.hitmarker.classList.toggle('kill', S.hitmarkKill);
  el.vignette.style.opacity = Math.min(0.75, S.damageFlash);
  el.flash.style.opacity = S.flashAmount;

  // Banner and message lines. The round/match panels carry the result, so
  // the banner stays hidden while they are up (no doubled message).
  const showBanner = S.bannerTime > 0 && S.phase !== 'roundEnd' && S.phase !== 'matchEnd';
  el.banner.style.opacity = showBanner ? 1 : 0;
  if (showBanner) {
    el.banner.textContent = S.banner;
    el.banner.style.color = S.bannerCss;
  }
  el.message.style.opacity = S.messageTime > 0 ? 1 : 0;
  if (S.messageTime > 0) el.message.textContent = S.message;

  // Plant / defuse progress.
  if (p.channel) {
    el.channel.style.display = 'block';
    el.channelFill.style.width = (p.channel.t / p.channel.total * 100) + '%';
    el.channelLabel.textContent = p.channel.kind === 'plant'
      ? 'Planting ' + DEVICE_NAME + ' at Site ' + p.channel.site + '…'
      : 'Defusing ' + DEVICE_NAME + '…';
  } else {
    el.channel.style.display = 'none';
  }

  el.spectate.style.display = !p.alive && S.phase === 'live' ? 'block' : 'none';

  if (S.phase === 'roundEnd') {
    el.roundTitle.textContent = (S.roundWinner === 'atk' ? TEAMS.atk.name : TEAMS.def.name) + ' take the round';
    el.roundDetail.textContent = S.roundReason + '  ·  ' + S.wins.atk + ' – ' + S.wins.def;
  }
  if (S.phase === 'matchEnd') {
    const won = S.matchWinner === p.team;
    el.matchTitle.textContent = won ? 'Victory — ' + TEAMS[S.matchWinner].name + ' win the match' : 'Defeat — ' + TEAMS[S.matchWinner].name + ' win the match';
    el.matchDetail.textContent = 'Final score ' + S.wins.atk + ' – ' + S.wins.def + ' across ' + S.round + ' rounds.';
  }

  updateFeed();
  updateBuyMenu();
  void dt;
}
