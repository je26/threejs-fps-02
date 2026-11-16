# threejs-fps-02 — EMBERLINE

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/je26/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/je26/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

EMBERLINE is a complete round-based tactical first-person shooter that runs
entirely in the browser. Two teams of five fight over a dockside quay at
dusk: the Ember Vanguard attack with a Surge Charge to plant, the Quay
Wardens defend, and every round is decided by elimination, detonation,
defusal, or the clock. The game is fully self-contained — no network
requests, no external assets, no build step — with procedural art,
synthesized sound, and bots that play the objective.

## Run it

```sh
cd game && python3 -m http.server 8901
```

Then visit `http://127.0.0.1:8901/`. Click a side to start. Mouse look uses
pointer lock; if pointer lock is unavailable, hold and drag the mouse to
look around instead.

---

<sub>Entered on [make.fun](https://make.fun/?ref=vr3vbks4&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>

## Features

- **Round structure** — 7-second freeze/buy phase, 100-second live rounds,
  first team to 8 rounds wins the match, with a restart option.
- **Economy** — earn money for kills, round wins, plants, and defuses, and
  spend it in the buy menu on weapons, grenades, armor, and a defuse kit.
- **Bots** — nine bots on waypoint routes with vision cones, line-of-sight
  checks, hearing, held angles, rotations, site pushes, planting, and
  defusing. The device carrier leads the attack; defenders hold and rotate.
  Bots call out what they see and plan over the squad radio feed.
- **Weapons** — P9 Lark sidearm, K7 Hornet SMG, AR-4 Ember rifle, and MR-9
  Longshot marksman rifle, each with distinct damage, fire rate, magazine,
  reload, spread, recoil, range falloff, and movement penalty. Headshots
  deal bonus damage; stopping to aim pays off.
- **Grenades** — Frag Charge, Smog Canister (blocks sight), and Dazzler
  (flash). Smoke genuinely blocks bot vision.
- **Objective** — plant the Surge Charge at Site A or Site B, guard the
  35-second fuse, or defuse it before it blows. A planted device keeps the
  round alive past elimination.
- **Map** — Cinder Quay: three lanes, two sites, a middle connector,
  crates, containers, and sightlines worth holding, in one dusk palette
  with sun, fill light, and fog.

## Controls

W A S D move · Mouse looks and fires · R reloads · B opens the buy menu
during the freeze phase · E plants/defuses (hold) · 1–5 and Q switch
weapons and grenades · Ctrl or C crouches · Shift walks quietly · Space
jumps · P pauses · M mutes.

## Layout

- `main.ts` — entrypoint: copies the game and screenshots into the output
  directory and writes the dossier.
- `game/` — the whole playable game as static files; `game/index.html`
  holds the import map, HUD overlay, menus, and entry script.
- `game/src/main.js` — bootstrap, frame loop, and player control.
- `game/src/config.js` — tuning, weapons, grenades, economy. `rng.js` —
  seeded random numbers. `state.js` — the single central game state.
- `game/src/mapdata.js` — walls, crates, sites, spawns, waypoint graph.
  `world.js` — scene building, procedural textures, bot meshes.
- `game/src/movement.js` — physics, collision, ray queries. `input.js` —
  keyboard, mouse, pointer lock, drag fallback.
- `game/src/weapons.js` — firing, recoil, reload, grenades, smoke.
  `bots.js` — navigation, perception, roles, tactics.
- `game/src/objective.js` — rounds, economy, plant/defuse, channels.
  `effects.js` — pooled tracers, particles, smoke, muzzle flash.
- `game/src/audio.js` — WebAudio-synthesized sounds, no audio files.
  `hud.js` — HUD, buy menu, round panels. `minimap.js` — 2D minimap.
- `game/src/radio.js` — bot radio callouts from simulation events.
- `game/vendor/three/` — vendored three.js 0.187.0 (unmodified).
- `screenshots/` — four captured gameplay screenshots.
- `vendor/` — the dossier builder library (unmodified).

The entry is handed in through `main.ts`, which assembles the output
directory and writes `dossier.json` via the vendored dossier builder;
running it twice produces byte-identical output.

## License

MIT — see `LICENSE`.
