// Synthesized audio: every sound is built with WebAudio oscillators and
// filtered noise. No audio files, no network. One job: named sound effects
// with distance attenuation for world sounds.

import { S } from './state.js';

let ctx = null, master = null, noiseBuf = null;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (_) { ctx = null; return; }
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  const len = ctx.sampleRate;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function setMuted(m) {
  if (master) master.gain.value = m ? 0 : 0.5;
}

function noise(dur, filterFreq, filterType, gain, when) {
  if (!ctx) return;
  const t = ctx.currentTime + (when || 0);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filterType || 'lowpass';
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.02);
}

function tone(freq, dur, type, gain, slideTo, when) {
  if (!ctx) return;
  const t = ctx.currentTime + (when || 0);
  const o = ctx.createOscillator();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

// Distance attenuation for a world position, relative to the player.
function atten(x, z) {
  const p = S.player;
  if (!p) return 1;
  const dx = x - p.x, dz = z - p.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  return Math.max(0.05, 1 / (1 + d * 0.09));
}

export function playShot(weaponId, x, z, isPlayer) {
  const v = isPlayer ? 1 : atten(x, z);
  const heavy = weaponId === 'marksman';
  noise(heavy ? 0.28 : 0.14, heavy ? 900 : 1600, 'lowpass', 0.55 * v);
  noise(0.05, 5000, 'highpass', 0.25 * v);
  tone(heavy ? 90 : 130, 0.1, 'triangle', 0.3 * v, 45);
}

export function playDryFire() { tone(1400, 0.04, 'square', 0.08); }

export function playReload() {
  tone(700, 0.05, 'square', 0.1);
  tone(500, 0.05, 'square', 0.1, 0, 0.25);
  tone(900, 0.06, 'square', 0.12, 0, 0.55);
}

export function playStep(x, z, isPlayer) {
  noise(0.07, 500, 'lowpass', 0.12 * (isPlayer ? 0.7 : atten(x, z)));
}

export function playExplosion(x, z) {
  const v = atten(x, z);
  noise(1.1, 220, 'lowpass', 0.9 * v);
  tone(55, 0.9, 'sine', 0.7 * v, 28);
  noise(0.3, 3000, 'bandpass', 0.2 * v);
}

export function playBeep(rate) {
  tone(1150, 0.07, 'square', 0.16);
  if (rate > 1.6) tone(1150, 0.07, 'square', 0.12, 0, 0.12);
}

export function playHitmarker(kill) {
  tone(kill ? 1500 : 1900, 0.05, 'sine', 0.14);
  if (kill) tone(1100, 0.08, 'sine', 0.14, 0, 0.06);
}

export function playHurt() { tone(180, 0.12, 'sawtooth', 0.16, 90); }

export function playPlantTick() { tone(880, 0.05, 'sine', 0.1); }

export function playBuy() { tone(660, 0.07, 'sine', 0.14); tone(990, 0.09, 'sine', 0.14, 0, 0.07); }

export function playDenied() { tone(220, 0.12, 'square', 0.1); }

export function playGrenadeBounce(x, z) {
  noise(0.05, 900, 'bandpass', 0.2 * atten(x, z));
  tone(320, 0.05, 'triangle', 0.1 * atten(x, z));
}

export function playFlashRing() {
  tone(3200, 0.7, 'sine', 0.1, 2800);
}

export function playStinger(win) {
  if (win) {
    tone(392, 0.16, 'triangle', 0.2);
    tone(523, 0.16, 'triangle', 0.2, 0, 0.14);
    tone(659, 0.3, 'triangle', 0.22, 0, 0.28);
  } else {
    tone(330, 0.18, 'triangle', 0.2);
    tone(262, 0.18, 'triangle', 0.2, 0, 0.16);
    tone(196, 0.34, 'triangle', 0.2, 0, 0.32);
  }
}

export function playRoundStart() {
  tone(523, 0.1, 'triangle', 0.16);
  tone(784, 0.14, 'triangle', 0.16, 0, 0.1);
}
