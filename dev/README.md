# Dev harness

Nothing here ships. `index.html` loads `src/` only; it never references `dev/`.

The point of all of it: **enter any moment directly, watch it frame by frame,
reproduce it with normal input, fix it, and re-verify under identical
conditions** — without playing the game from the start.

```sh
node dev/serve.mjs       # http://localhost:8080  (npm run serve)
```

Everything that drives a browser uses the preinstalled Chromium at
`PLAYWRIGHT_BROWSERS_PATH` (default `/opt/pw-browsers`); `dev/shot.mjs` picks the
newest `chromium-*/chrome-linux/chrome` it finds, because the revision bundled
with the npm package does not match. **Never run `playwright install`.**

---

## URL params

| param    | meaning |
|----------|---------|
| `scene`  | jump straight to a scene id: `hall intro kitchen paper toy thread sand sofa carpet pantry stairs window veranda bedroom`. Omitted, the game opens in the `hall` hub. |
| `clean`  | `?scene=hall&clean=intro,kitchen` — which doors are already done, so a hall moment can be reproduced without playing the rooms in front of it |
| `chain`  | `?chain=1` plays the historical linear ring instead of the hub |
| `seed`   | deterministic RNG (default 1337) |
| `dev=1`  | overlay: per-debris id + state + sampled field strength, nozzle cross-hair, fps, pointer/gesture state, cup + transit counts |
| `speed`  | time scale (`0.25` for slow motion) |
| `pose`   | informational only; the real pose comes from the viewport |
| `mute=1` | never start WebAudio (the screenshot harness always passes this) |

## `window.game`

```js
game.state()                  // serializable snapshot: camera, vacuum, input, scene + every debris
game.input.pointer(nx, ny, d) // synthetic pointer, NORMALIZED 0..1 screen coords
game.input.replay(frames)     // [{t(ms), x, y, down}], consumed by the simulation clock
game.pause(); game.step(0.1); game.resume()
game.goto('kitchen'); game.goto('kitchen', true)   // true keeps the dust cup
game.house()                  // { rooms: {id: {clean, persist}}, opened, returnedFrom }
game.setClean(['intro','kitchen'])   // set the door states live
game.setSpeed(0.25); game.dev(true)
game._g                       // the Game itself: .scene .vacuum .camera .loop  (dev only)
```

`state().scene.debris[i]` carries:

| field | meaning |
|-------|---------|
| `id` `type` `state` | `bunny#3`, `bunny`, `idle/reacting/pulled/captured/transit/in-cup` |
| `x, y` | world position of the centre |
| `ax, ay` | the piece's own **aim point** — the part of it the mouth has to reach (a strand's tip, a grit trail's nearest live grain, a sand pile's tallest cell). Defaults to the centre. |
| `nx, ny` | the AIM point in normalized screen coords — this is what lets a gesture aim at a debris by id |
| `s` | the field strength that debris last sampled |
| `decor` `dormant` | excluded from completion / currently hidden under something |

Plus whatever the type adds (`lift`, `flee`, `reel`, `clog`, `dig`, `frac`, …).

Because `step()` advances both the simulation and the replay clock, a scripted
run is bit-identical between machines for a given seed.

---

## `dev/shot.mjs` — frame sequences and contact sheets

```sh
node dev/shot.mjs --scene=intro --device=iphone-portrait \
     --gesture=approach-slow --frames=24 --every=100 --contact
```

| flag | default | meaning |
|------|---------|---------|
| `--scene` | `intro` | scene id |
| `--device` | `iphone-portrait` | `iphone-portrait` 390x844, `iphone-landscape` 844x390, `ipad-portrait` 820x1180, `ipad-landscape` 1180x820 (DPR capped at 2, as in the game) |
| `--gesture` | `approach-slow` | `approach-slow`, `approach-fast`, `hold`, `rub`, `circle`, `pass-by`, `idle` |
| `--path` | — | waypoint gesture; overrides `--gesture` (see below) |
| `--seg` | 700 | ms of travel between `--path` waypoints |
| `--hold` | 0 | ms the finger dwells at each `--path` waypoint |
| `--release` | off | lift the finger at the end of a `--path` |
| `--frames` | 24 | number of PNGs |
| `--every` | 100 | milliseconds of **simulated** time between frames |
| `--skip` | 0 | simulated ms to run before the first frame |
| `--target` | `auto` | `auto`, an exact debris id (`bunny#1`), or a type (`crumb`). Resolved at runtime from `game.state()`; the finger destination is offset so the **mouth** lands on the target's aim point. |
| `--exec` | — | JavaScript run in the page before the first frame, with `game`, `scene` and `vac` in scope |
| `--complete` | off | finish the scene instantly: calls `scene.devFinish()` if the scene has one, otherwise marks every debris collected. Use it to review the completion camera move and the hand-off to the next scene. |
| `--seed` | 1337 | |
| `--clean` | — | `?clean=` door states, for `--scene=hall` |
| `--chain` | off | play the historical linear ring |
| `--out` | `<scene>-<device>-<gesture>` | output folder name under `dev/out/` |
| `--contact` | off | also write `contact.png`, the whole sequence as one grid |
| `--devoverlay` | off | render with `?dev=1` |

Output: `dev/out/<name>/000.png …`, `state.json` (the gesture, the resolved
target, the `--exec` source, and a full `game.state()` dump per frame — this is
how you check "did it accelerate?" without squinting at pixels), and optionally
`contact.png` / `contact.html`.

### `--path`: waypoint gestures

```
--path=x,y;x,y,holdMs;x,y,holdMs,segMs;@<selector>
```

Coordinates are normalized screen coords (0..1) so the same path means the same
thing on every device. The finger goes down on the first waypoint and stays
down. Per-waypoint `holdMs` (dwell there) and `segMs` (time to travel to it)
override `--hold` / `--seg`.

A waypoint written `@<selector>` (`@auto`, `@crumb`, `@bunny#3`) resolves to
wherever the finger has to be for the **mouth** to land on that debris, using the
same resolution as `--target`; `@crumb,1500` dwells there for 1.5 s.

```sh
# go under the sofa, sweep the cavity, and hold in the deep corner
node dev/shot.mjs --scene=sofa --device=iphone-portrait --frames=16 --every=200 --contact \
  --path="0.50,0.84;0.50,0.62;0.50,0.46;0.50,0.36,1800;0.44,0.32;0.58,0.32,1600" --seg=1100
```

### Gestures

`dev/gestures.mjs` builds each named gesture from a `from` point (by default
wherever the scene parks the vacuum) and a `to` point (the finger destination).
Frames are 25 ms apart in normalized coords. Add a new one by adding a key to
`GESTURES`, or build one inline with `makePath()`.

The lead offsets come **from the vacuum itself** (`LEAD` and `MOUTH_OFFSET` are
exported from `src/vacuum/vacuum.js`), so target-resolving gestures put the
MOUTH — not the middle of the head — on the target:

```
fingerY = targetY + LEAD[pose].up + MOUTH_OFFSET * camera.zoom
```

`mouthLeadPx(state)` returns that offset in screen px for a given state dump.

---

## `dev/playthrough.mjs` — the whole game, end to end

```sh
node dev/playthrough.mjs                                  # all four devices
node dev/playthrough.mjs --device=ipad-portrait
node dev/playthrough.mjs --devices=iphone-portrait,ipad-landscape --seed=7
node dev/playthrough.mjs --from=sand --budget=100         # start mid-run while debugging
node dev/playthrough.mjs --clean=intro,kitchen,paper      # skip rooms already trusted
node dev/playthrough.mjs --chain                          # the historical linear ring
```

Injects an autopilot that drives `window.game.input.pointer` — one finger,
nothing else — round the HUB: from the hall it hunts the nearest door's dust
bunny, which is what opens that door, plays the room, comes back out, and goes
round again until all thirteen are clean, then waits for the hall's celebration
and its reset. It runs in real time and records per scene:

* wall-clock completion time
* min / median fps, measured on the real rAF clock (not simulated)
* every page error and console error
* how much that room deposited in the cup (`cupVol`) and how many times the cup
  had to be emptied there (`pours`) — this is what `CUP_CAPACITY` is calibrated
  against
* `dev/out/playthrough-<device>/000.png …` at every hand-over, plus `contact.png`
* `result.json` per device, `dev/out/playthrough.json` for all of them

It knows exactly one thing about the machine: when the cup is over 85% full the
airflow has started to fade, so it drives the head to the room's bin and lets it
pour. That is the same causal chain the child has to find on their own, so a run
that gets stuck on a full cup is telling you the teaching does not work.

The autopilot is a **closed loop on the mouth**: it reads where the mouth
actually is on screen, compares that with the aim point of the nearest live
debris, and moves the finger by the error — so it never needs to know about lead
offsets, hose lag or camera moves. When the error stops shrinking it stops dead
and holds (which is what winds the motor up, and the only way to reach the deep
nook under the sofa). It rubs in `carpet` (the brush roll) and rasters the rug if
the room is clear but the pile is not combed.

Exit code is non-zero if any device fails to finish or hits a page error, so it
doubles as the integration test. `--budget=<s>` is the per-scene give-up time;
on a give-up the report lists the ids, positions and states of what is left.

| flag | default | meaning |
|------|---------|---------|
| `--device` / `--devices` | all four | |
| `--seed` | 1337 | |
| `--budget` | 150 | seconds per scene before giving up |
| `--from` | `hall` | start at this scene |
| `--clean` | — | mark these rooms done before the run starts |
| `--chain` | off | play the historical linear ring instead of the hub |
| `--shots` | 30 | maximum screenshots per device |
| `--trace` | off | log every target change, give-up and bin trip into `result.json` |

---

## `dev/fps.mjs` — how fast is it, and where does the frame go

```sh
node dev/fps.mjs --scene=sofa --device=iphone-portrait --seconds=6
node dev/fps.mjs --scene=sofa --hold=@mother#1 --profile
node dev/fps.mjs --all --seconds=5          # every scene x every device
```

`dev/shot.mjs` steps the clock by hand, so the `fps` in its state dumps means
nothing. This runs the page FREE-RUNNING with a synthetic finger and samples the
real rAF clock — the same number `playthrough.mjs` reports per scene, but for
one scene at a time and in twenty seconds instead of ten minutes.

The finger is the playthrough autopilot cut down to what a probe needs: hunt the
nearest live piece, and stop dead when it stops getting closer, which is what
winds the motor to full power — the most expensive state the renderer ever sees.
`--hold=@<id|type>` pins it on one piece so the same moment can be measured
before and after a change.

| flag | default | meaning |
|------|---------|---------|
| `--scene` | `sofa` | scene id |
| `--device` / `--devices` / `--all` | `iphone-portrait` | |
| `--seconds` | 6 | sampling window; the first second is thrown away |
| `--hold` | — | `@bunny#3`, `@sock`, `@auto`: park the mouth on it and hold |
| `--profile` | off | ms/frame in sim, scene.draw, vacuum.draw, drawOver and the light layer |
| `--init` | — | JavaScript run in the page before the module loads (flags) |
| `--seed` `--json` | | |

It exits after printing which runs came in under 50 fps median.

**Reading the numbers.** The JS is not usually the problem: on the sofa, the
whole of `sim` + every `draw` measured under 1.5ms while the frame itself took
34. What costs is full-screen compositing in the rasteriser, and `--init` is how
you prove it — flag out one layer at a time and watch the frame time, which is
how the sofa's beam, dust film, ghost sofa and floor filter were each costed.

## Reproduce one moment

The recipe, in order. Say a tester reports "on iPad landscape the yarn round the
chair leg never lets go".

1. **Enter the moment directly.** Scene + seed pins the world:
   `?scene=thread&seed=1337&dev=1`.
2. **Get there with real input.** Either aim at the piece by id, or walk a path:

   ```sh
   node dev/shot.mjs --scene=thread --device=ipad-landscape --seed=1337 \
        --target=yarn --gesture=approach-slow --frames=20 --every=120 --contact --devoverlay
   ```

   ```sh
   node dev/shot.mjs --scene=thread --device=ipad-landscape --seed=1337 \
        --path="0.14,0.80;@yarn,2500" --seg=1600 --frames=20 --every=120 --contact
   ```
3. **Skip the boring part.** `--skip=1800` runs 1.8 s of simulated time before
   the first frame, so frame 0 is the instant you care about.
4. **Force the awkward setup** with `--exec`, which runs in the page with
   `game`, `scene` and `vac` in scope:

   ```sh
   # the same snag, but with the strand already half reeled in
   --exec="scene.debris[2].c = scene.debris[2].len * 0.5"

   # what does it look like when the intake is plugged?
   --exec="vac.clog = 1"

   # the finale, without playing the rug
   node dev/shot.mjs --scene=carpet --complete --frames=14 --every=200 --contact
   ```
5. **Read the numbers, not the pixels.** `dev/out/<name>/state.json` has a full
   `game.state()` per frame. The per-frame `scene.debris[i]` entries are what
   prove anticipation: `s` should climb monotonically on an approach, `lift` /
   `flee` / `reel` / `dig` should move before the state changes to `pulled`.

   ```sh
   node -e "const s=require('./dev/out/thread-ipad-landscape-path/state.json');
     console.table(s.states.map(f=>({t:f.t, ...f.scene.debris.find(d=>d.type==='yarn')})))"
   ```
6. **Fix, re-run the identical command, diff the contact sheets.** Same seed,
   same device, same path ⇒ same run.
7. **Then re-run the game**: `node dev/playthrough.mjs --from=thread`, and
   `node dev/core-tests.mjs` if you touched anything in `src/core/`.

### Reproducing a hub moment

```sh
# the hall with some doors already done: glow, shine, and the rest still ajar
node dev/shot.mjs --scene=hall --clean=intro,kitchen,paper --device=iphone-portrait \
     --gesture=idle --frames=8 --every=400 --contact

# going in through a door, the way the child does it
node dev/shot.mjs --scene=hall --device=iphone-portrait \
     --path="0.5,0.78;@bunny,5000" --seg=1600 --frames=16 --every=250 --contact

# coming back out of one: finish the room and watch the hall entry
node dev/shot.mjs --scene=intro --device=iphone-portrait --complete \
     --gesture=idle --frames=16 --every=250 --contact

# the celebration and the reset
node dev/shot.mjs --scene=hall --clean=intro,kitchen,paper,toy,thread,sand,sofa,carpet,pantry,stairs,window,veranda,bedroom \
     --device=iphone-portrait --gesture=idle --frames=20 --every=400 --contact

# what a room feels like with the cup nearly full, and completely full
node dev/shot.mjs --scene=kitchen --exec="vac.cupVol=1820; vac.cupFill=0.91" ...
node dev/shot.mjs --scene=kitchen --exec="for(let i=0;i<46;i++)vac.addToCup({kind:'fluff',color:'#cfc6b8',size:20})" \
     --path="@auto,2600" --frames=18 --every=200 --contact
```

---

## `dev/core-tests.mjs` — the core services, in the real page

```sh
node dev/core-tests.mjs
node dev/core-tests.mjs --only=powder
```

Fourteen assertions against the real `Vacuum` in a real page: the airborne
layer, the powder film, the cloth grid, the crevice morph, the cup's fade and
refusal, the bin's pour and its arm threshold, and the stepped camera. A mock
vacuum would only be testing the mock, so there isn't one. Exits non-zero on any
failure or page error; run it with the playthrough whenever `src/core/`,
`src/vacuum/` or `src/props/bin.js` changes.

## Other scripts

`dev/sheets.mjs` runs the standard review matrix — every scene x 4 devices, with
the gestures that matter for each — and writes one contact sheet per
combination. `--quick` restricts it to iphone-portrait, `--scene=<id>` to one
scene.

The per-scene scripts below predate `--path` / `--exec` and are kept because
their canned paths and probes are still the fastest way into their scene. They
all share `launch()` and `DEVICES` with `shot.mjs`, so they pick up the same
Chromium.

| script | what it does |
|--------|--------------|
| `dev/sofa-shot.mjs` | named travel paths under the sofa (`enter deep sock mother leave passby`) |
| `dev/sofa-fps.mjs` | frame-time histogram for the dark scene |
| `dev/toy-shots.mjs` | shove-a-toy sequences and nest reveals |
| `dev/carpet-run.mjs` | combing runs and the finale (`--finale`) |
| `dev/carpet-perf.mjs` | pile render cost |
| `dev/sand-play.mjs`, `dev/sand-buried.mjs`, `dev/sand-rotate.mjs`, `dev/sand-bench.mjs` | crater digging, surfacing the buried three, orientation change, pile perf |
| `dev/thread-perf.mjs` | strand reel cost |
| `dev/paper-probe.mjs` | per-corner lift/flee numbers for one scrap |
