# Dev harness

Nothing here ships. `index.html` does not reference anything in `dev/`.

## Run the game

```sh
node dev/serve.mjs          # or: npm run serve   -> http://localhost:8080
```

Open `http://localhost:8080/index.html`.

### URL params

| param    | meaning |
|----------|---------|
| `scene`  | jump straight to a scene id (`intro`, `kitchen`) |
| `seed`   | deterministic RNG (default 1337) |
| `dev=1`  | overlay: debris id + state + sampled field strength, nozzle cross-hair, fps, pointer/gesture state, cup count. Invisible without the param. |
| `speed`  | time scale (`0.25` for slow motion) |
| `pose`   | informational only; the real pose comes from the viewport |
| `mute=1` | never start WebAudio (used by the screenshot harness) |

## `window.game`

```js
game.state()                  // serializable snapshot: camera, vacuum, input, scene + every debris
game.input.pointer(nx, ny, d) // synthetic pointer, NORMALIZED 0..1 screen coords
game.input.replay(frames)     // [{t(ms), x, y, down}], consumed by the simulation clock
game.pause(); game.step(0.1); game.resume()
game.goto('kitchen')
game.setSpeed(0.25); game.dev(true)
```

`state().scene.debris[i]` carries `id, type, state, x, y, s` (the field strength
that debris last sampled) plus `nx, ny`, its position in normalized screen
coords — that is what lets a gesture aim at a debris by id.

Because `step()` advances both the simulation and the replay clock, a scripted
run is bit-identical between machines for a given seed.

## Frame sequences and contact sheets

```sh
node dev/shot.mjs --scene=intro --device=iphone-portrait \
     --gesture=approach-slow --frames=24 --every=100 --contact
```

| flag | default | meaning |
|------|---------|---------|
| `--scene` | `intro` | scene id |
| `--device` | `iphone-portrait` | `iphone-portrait` 390x844, `iphone-landscape` 844x390, `ipad-portrait` 820x1180, `ipad-landscape` 1180x820 (DPR capped at 2, as in the game) |
| `--gesture` | `approach-slow` | `approach-slow`, `approach-fast`, `hold`, `rub`, `circle`, `pass-by`, `idle` |
| `--frames` | 24 | number of PNGs |
| `--every` | 100 | milliseconds of **simulated** time between frames |
| `--skip` | 0 | simulated ms to run before the first frame (to land on the interesting window) |
| `--target` | `auto` | `auto`, an exact debris id (`bunny#1`), or a type (`crumb`). Resolved at runtime from `game.state()`; the finger destination is offset by the nozzle lead so the head lands on the target. |
| `--seed` | 1337 | |
| `--out` | `<scene>-<device>-<gesture>` | output folder name under `dev/out/` |
| `--contact` | off | also write `contact.png`, the whole sequence as one grid |
| `--devoverlay` | off | render with `?dev=1` |

Output: `dev/out/<name>/000.png …`, `state.json` (the gesture plus a full
`game.state()` dump per frame — this is how you check "did it accelerate?"
without squinting at pixels), and optionally `contact.png` / `contact.html`.

Run the standard review matrix (both scenes x 4 devices x 3 gestures):

```sh
node dev/sheets.mjs          # or: npm run sheets ; --quick for iphone-portrait only
```

## Chromium

Uses the preinstalled browser at `PLAYWRIGHT_BROWSERS_PATH` (default
`/opt/pw-browsers`); `dev/shot.mjs` picks the newest `chromium-*/chrome-linux/chrome`
it finds, because the revision bundled with the npm package does not match.
**Never run `playwright install`.**

## Gestures

`dev/gestures.mjs` builds each named gesture from a `from` point (by default
wherever the scene parks the vacuum) and a `to` point (the finger destination).
Frames are 25ms apart in normalized coords, so the same gesture is meaningful on
every device. Add a new one by adding a key to `GESTURES`.
