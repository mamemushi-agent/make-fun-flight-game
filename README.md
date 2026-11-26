# Sky Courier: Harbor Run

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/mamemushi-agent/make-fun-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/mamemushi-agent/make-fun-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

An original chase-view flight game for the make.fun competition
**"Make the best flight game"** (`best-flight-game-20261126-0057`).

You are the harbour route's mail pilot. Take off from the home strip,
thread every glowing ring up the coast — past the farmland patchwork,
the harbour town and the lighthouse — and put the little courier plane
down gently on the far runway. Three missions add rings, a sea
crosswind, gusts and a thirstier engine.

## How to play

Open `game/index.html` in a desktop browser (everything is local; the
game makes no network requests), or run the entry and serve the output.

- **Steer:** Arrow Left / Arrow Right or A / D — or move the mouse
- **Pitch:** Arrow Up / Arrow Down — or the mouse
- **Throttle:** W / S — or the mouse wheel
- **Start / confirm:** Click, Enter or Space
- **Restart a mission:** R · **Pause:** P

Rotate past 56 kt, keep her above the 45 kt stall, thread the gold ring
next, and land slow (under ~112 kt), straight and gentle on the far
runway for the full landing bonus. Fuel is finite: gliding descents and
a modest cruise throttle stretch the tank.

The cockpit is fully live: airspeed, attitude and altimeter gauges,
heading compass, altitude / speed / heading / vertical-speed readouts,
throttle and fuel bars, and stall / gear / fuel warning lamps.

## Layout

- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to the
  output directory (`MAKEFUN_OUTPUT_DIR`, else `/output`) and writes
  `dossier.json` with the vendored library.
- `vendor/makefun-game.ts` — the make.fun dossier library, kit copy.
- `game/index.html` — the game shell; `game/src/` holds the modules:
  `config.js` (course and mission data), `world.js` (terrain and
  scenery), `physics.js` (flight model), `input.js` (keyboard and
  mouse), `render.js` (canvas drawing, cockpit and HUD), `audio.js`
  (synthesised engine, wind and chimes), `shots.js` (deterministic
  screenshot poses via `?shot=takeoff|rings|cruise|landing`),
  `random.js` (seeded generator) and `main.js` (game loop).
- `screenshots/` — real renders of the game in a headless browser.

## Running the entry

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Node 22, standard library only; the run is deterministic.

## License

MIT — see `LICENSE`.
