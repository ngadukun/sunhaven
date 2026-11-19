# Sunhaven

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ngadukun/sunhaven/rank.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ngadukun/sunhaven/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime caper that plays in a desktop browser from static files —
no build step, no assets, no network requests. You are **Leo Santos**, a driver with a
borrowed name, newly arrived in the sun-soaked coastal city of Sunhaven and working for
fixer **Marisol Vega** of Vega Auto Works.

## The city

Nine blocks by seven across four districts — the suburbs of **Palma Heights**, the
towers of **Downtown Sunhaven**, the hotels of the **Coral Beachfront** and the
warehouses of **the Docks** — with the beach and the sea to the east. Eight named
places anchor the map: Vega Auto Works, Leo's Hideout, Sunhaven Trust Bank, the police
station, Sunhaven General Hospital, the Coral Court Hotel, Palma Marina and the
Sunhaven Docks. Ambient traffic drives the road network, pedestrians stroll the
sidewalks (and flee, when they should), and the whole city is generated from a seed, so
a given seed always builds the same Sunhaven.

## The game

- **On foot and behind the wheel.** Eight stealable car types — compact, sedan, premium
  sedan, pickup, wagon, sports coupe, muscle car and an armored van — each with its own
  acceleration, top speed, grip and value, plus the Sunhaven PD's Interceptors. Arcade
  physics with drifting, tyre smoke, damage smoke and mass-weighted collisions.
- **A wanted system with witnesses.** Crimes only heat you up when somebody sees them.
  A hundred heat is a star, five stars is six Interceptors who navigate the road network
  when far, hunt you directly when close, and pace-match to pin you. Get pinned and you
  are **busted** (−$150); get flattened and you are **wasted** (−$200).
- **A pistol, carried everywhere.** Twelve in the magazine, a reserve in your pocket,
  reload with R, ammo pickups (+36) on three porches — and yes, you can shoot from the
  driver's seat.
- **A five-job story.** *First Wheels* ($300), *Hot Property* ($600), *The Courier*
  ($900), *Dockside Distraction* ($1,400) and *The Sunhaven Score* ($3,000) — then
  endless rotating side work: Chop Runs, Fare Jobs and Delivery Runs.
- **The full dressing.** A HUD with cash, health, wanted stars and a bust meter, an
  objective line with distance and timer, a live minimap, dialogue, banners, a title
  screen with Continue, pause, busted/wasted/story-complete screens, a localStorage
  save — and a fully synthesized soundtrack and effects (engine, siren, gunshots, a
  synthwave pulse) generated with WebAudio. There are no audio files either.

## Controls

| Keys | Action |
| --- | --- |
| WASD / arrows | Walk, drive, steer |
| Shift | Sprint |
| F or E | Enter / exit a car, advance dialogue |
| Mouse + click/hold | Aim and shoot (on foot and drive-by) |
| R | Reload |
| Space | Handbrake |
| P / Esc | Pause |
| M | Mute |

## Run it

```sh
node serve.ts            # serves game/ on http://localhost:8080
```

Then open <http://localhost:8080>. To hand the entry in the way the scorer does:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` validates the screenshots against the bounty's rules (3–4 images, each
≤ 256 KiB, long side ≤ 1280 px, short side ≥ 480 px), copies `game/` and
`screenshots/` to the output directory and writes `dossier.json` there with the
vendored make.fun library.

The screenshot scenes are deterministic: `?shot=chase&seed=7`, `?shot=city&seed=7`,
`?shot=mission&seed=7` and `?shot=title&seed=7` (see `shots.json`).

## Layout

- `game/` — the game itself: `index.html` and ES modules under `src/` (city generation,
  world simulation, missions, rendering, synthesized audio, input, saves, shot staging).
- `vendor/makefun-game.ts` — the competition's vendored library, used by `main.ts`.
- `main.ts` — the hand-in program. `serve.ts` — the local dev server.
- `screenshots/` — the four entry screenshots, named in `shots.json`.

MIT licensed.
