# Architecture

Vanilla ES modules + Canvas 2D. No build step, no runtime dependencies, no
framework. `index.html` at the repo root runs from any static server and from
GitHub Pages. Everything under `dev/` is for development only; nothing the page
loads depends on it.

```
index.html              full-screen canvas, viewport-fit=cover, touch-action:none
src/main.js             boot, DPR/resize, loop wiring, transitions, dev overlay, window.game
src/core/loop.js        fixed 60Hz sim + accumulator, render once per rAF
src/core/math.js        clamp/lerp/smoothstep, springs, catmull-rom, cheap noise
src/core/rng.js         seedable mulberry32
src/core/input.js       single-pointer gesture state (+ synthetic input & replay)
src/core/camera.js      world <-> screen, pan / zoom / tilt
src/core/audio.js       motor hum + pops, started on the first pointerdown
src/vacuum/vacuum.js    nozzle, hose, body, dust cup, field(), transit()
src/debris/base.js      Debris base class + state names
src/debris/dustBunny.js fluff: per-fiber lean -> stretch -> break loose -> pop
src/debris/crumb.js     stiction -> shiver -> skate -> tick
src/floors/floor.js     offscreen base layer + erasable grime layer
src/floors/wood.js      warm planks
src/floors/tile.js      glossy tile, hidden motif, pale spill dusting
src/props/prop.js       pushable / blocking rigid props + resolveProps()
src/props/room.js       furniture no one scene owns: lamp, cushion, rug edge, lamp pool
src/core/light.js       darkness overlay: cut-out lights + warm glow, one composite
src/core/heightfield.js grid of heights with angle-of-repose relaxation (sand, pile)
src/core/airborne.js    pooled specks with a HEIGHT: flour, leaf bits, boss fibres
src/core/powder.js      density film: streaks along the flow, clean tracks
src/core/cloth.js       spring grid that bulges toward the mouth (cushions, hems)
src/props/bin.js        the bin, and the shared cup pour
src/scenes/scene.js     Scene base (the contract below)
src/scenes/index.js     registry — the ONLY core file a new scene touches
src/scenes/hall.js      the hub: thirteen doors, door states, the house reset
src/scenes/stub.js      placeholder room for an id whose scene is not written yet
src/scenes/*.js         the rooms
manifest.webmanifest    name/colour/icon so it can be added to the home screen
```

## The hub

There is no chain any more. The game opens in `hall`, a hallway with thirteen
doors, and every room hands back to it.

```
hall ⇄ intro | kitchen | paper | toy | thread | sand | sofa | carpet
     ⇄ pantry | stairs | window | veranda | bedroom      (Phase B)
```

**The door handle is a dust bunny.** A room that is still dirty has its door
ajar with a real `DustBunny` sitting in the gap under it, swaying in the idle
airflow like any other invitation in the game. Driving the head at it is how you
go in: the room starts as the fluff reaches the mouth. A room that is done has
its door shut, its frame glowing and the floor in front of it polished.

The trigger is "the fluff **reached** the mouth", not "was swallowed" — because
a full dust cup swallows nothing, and a full cup must never be able to lock a
child out of a room.

**First launch** offers one door. Coming back out of it makes the other twelve
creak open one after another, staggered, in front of the child. After that the
order is theirs.

**The house** lives in `main.js`:

```js
game.house = {
  rooms: { intro: { clean: false, persist: {} }, ... },
  opened: false,          // has the hall thrown the other doors open yet
  returnedFrom: null,     // which door the hall should animate walking out of
};
```

It is in memory only — the owner chose a fresh house every time, so nothing is
stored between page loads. When the last room is finished the hall brightens the
whole house, pours the cup into the hall bin, and then puts the dust back and
opens all thirteen doors again.

`main.js` routes a finished room back to the hall **generically**: it marks the
room clean, stores its `persist`, and overrides `exit().next` with `'hall'`. A
room therefore never needs to know the house exists; `next: 'hall'` in a room's
`exit()` is documentation. `?chain=1` honours `exit().next` instead and plays
the historical linear ring (`CHAIN` in `src/scenes/index.js`), which is what
`dev/playthrough.mjs --chain` drives.

`main.js` also ticks and draws `scene.bin` (body behind the machine, pour and
lid in front), so a room only has to place the prop.

## The one coupling: `vacuum.field(x, y, out)`

```js
const f = vac.field(worldX, worldY, myScratchObject);
// f.strength   0 .. ~2.5   airflow at that point
// f.fx, f.fy   pull vector, already scaled by strength
// f.inCapture  true when the point is inside the mouth ellipse
// f.dist       distance to the mouth
```

* The flow is a **cone in front of the mouth**: `strength = power * flowScale *
  fillPower * cone(align) / (1 + (d/r)^2)^2`, where `power` is 1.0 at idle and ramps to 2.2
  over ~0.3s while the finger is down **and not sweeping** (that is what "press
  and hold" means on a touch screen), and `r` is ~84 at idle, ~105 at full power.
  `flowScale` is `1 - 0.75 * vac.clog` — a blocked intake moves less air — and
  `fillPower` is `1 - 0.55 * smoothstep(0.8, 1, cupFill)`: a **full cup is a weak
  vacuum**, and every debris type in the game leans less without knowing it.
  At `cupFill >= 1` the mouth stops capturing entirely and the flow REVERSES
  within 46px, so whatever the air dragged up is blown back out.
* The squared falloff is deliberate: the world only changes when the player
  brings the nozzle **closer**, which is the whole game.
* Debris must derive *everything* — trembling, leaning, friction break-away,
  capture — from this sample. Never test distance to the nozzle, never draw a
  suction radius, never draw arrows. The airflow is visible only through what it
  does to the world.
* Sample the field at **several points on your own body** if you want the near
  edge to react before the far edge. `DustBunny` samples once per fiber.
* Pass a reusable `out` object; debris loops must not allocate per frame.

Calibration in DESIGN px (r = 110 idle, 138 at full power):

| strength | idle (power 1.0) | full (power 2.2) | what happens there |
|---------:|-----------------:|-----------------:|--------------------|
| 1.20 | — | 100px | a full dust bunny lets go (threshold drops as it sheds fibers) |
| 0.50 | — | 175px | a dust bunny starts shedding single fibers |
| 0.34 | 65px | 205px | a crumb breaks stiction and skates |
| 0.10 | 150px | 320px | fibers lean, nothing moves |

A bunny is ~80 design px across and the head ~68, so "one head away" is roughly
the break-loose distance — that is the scale everything is tuned against.

## Adding a debris type

```js
import { Debris, State } from '../debris/base.js';

export class Thread extends Debris {
  get type() { return 'thread'; }
  update(dt, vac, world) {
    if (this.state === State.DONE) return;     // always guard this
    const f = vac.field(this.x, this.y, this._f);
    /* ... your own motion law ... */
    if (f.inCapture) {
      this._handOff(vac, { kind: 'thread', color: '#ddd', size: 8 });
      world.onCaptured && world.onCaptured(this);
    }
  }
  draw(ctx, cam) { /* world coordinates; the camera transform is applied */ }
}
```

`_handOff` calls `vacuum.transit(item)`, which flies the item along the hose
spline into the dust cup (with a squash), plays the pop/tick, and leaves a
permanent blob in the cup. The cup is the only progress display in the game.

States are `idle → reacting → pulled → captured → transit → in-cup`. Use the
names for the dev overlay; the engine only cares about `DONE`.

Two hooks on `Debris` that anything built out of node arrays should override:

```js
translate(dx, dy)   // move the WHOLE piece, nodes and home positions included.
                    // clearStartZone() and relayout use it; the default moves
                    // x/y and hx/hy only.
aim(out)            // the part of the body the mouth has to reach. The default
                    // is the centre; a strand returns its tip, a grit trail its
                    // nearest live grain, a sand pile its tallest cell. This is
                    // what the dev harness aims at (`state().scene.debris[i].nx`).
```

## Adding a scene

1. Write `src/scenes/<id>.js` exporting a `Scene` subclass.
2. Add one line to `SCENES` in `src/scenes/index.js`. Nothing else in the core
   changes.

```js
export class MyScene extends Scene {
  constructor(rng) { super('myid', rng); }

  layout(pose, w, h) {
    super.layout(pose, w, h);
    const vw = this.vw, vh = this.vh;          // DESIGN units, see below
    this.rest = { x: 0, y: 0, zoom: this.scale, tilt: 0 };
    this.startPointer = { x: 0.5, y: 0.78 };   // where the vacuum is parked
    this.floor = makeWoodFloor({ x0: -vw, y0: -vh, x1: vw, y1: vh }, this.rng);
    if (pose === 'portrait') { /* depth: corridors, going away */ }
    else { /* width: long floors, going around furniture */ }
    this.debris.push(/* ... */);
  }

  update(dt, ctx) { /* ctx = {vacuum, camera, input, rng, audio, world} */ }
  draw(ctx2d, cam) { this.drawFloor(ctx2d, cam); /* props */ this.drawDebris(ctx2d, cam); }
  drawOver(ctx2d, cam) { /* drawn AFTER vacuum.draw(): in front of the machine */ }
  onCaptured(d) { /* reveal grime, spawn the next hint, ... */ }
  isComplete() { return this.remaining() === 0; }
  exit() { return { to: { x, y, zoom, tilt }, dur: 1.4, next: 'nextId' }; }
  entry() { return { x, y, zoom, tilt }; }     // where the camera starts
  saveProgress() / restoreProgress(p)          // orientation change, see below
  devFinish() { /* optional: finish instantly, for dev/shot.mjs --complete */ }
}
```

* **`drawOver(ctx, cam)`** runs after `vacuum.draw()`, so a scene can put
  something in front of the machine: `carpet` pours the dust cup into the bin
  there, `thread` draws a strand while it is being reeled in through the mouth
  (otherwise the last half metre vanishes behind the head).

* **Design units.** `layout()` receives device pixels but you build the world in
  `vw`/`vh`, which are the viewport divided by `this.scale`
  (`clamp(min(w,h)/390, 1, 2)`), and you set `rest.zoom = this.scale`. That is
  why a dust bunny covers the same fraction of an iPhone and of an iPad.
  Helper: `this._p(nx, ny)` maps normalized screen coords to world coords.
* **Two poses, two designs.** `layout()` must branch on `pose`. Portrait favours
  depth (travel up/away, doorways, under furniture); landscape favours width
  (long floors, go around the legs). Do not scale one design into the other.
* **Debris that only decorates** (a trail leading off-screen for the next scene)
  gets `d.decor = true`; `remaining()` ignores it.
* **Never** place debris inside the parked nozzle's idle airflow. Call
  `this.clearStartZone(minDist)` at the end of `layout()`: ~150 for fluff (it
  should already be swaying when the game opens), ~245 for anything with a low
  threshold such as crumbs. `this.parkPoint()` gives you that mouth position.
  It measures from each piece's `aim()` point, moves it with `translate()` (so
  ropes, strands and patches come along in one piece), and skips anything
  `dormant` (hidden under a prop) or `anchored` (tied down).
* **Never place debris where the head cannot go.** `this.reachRect(out, margin)`
  is the world rectangle the nozzle can reach at the scene's rest camera. The
  finger is clamped to the glass and the head is drawn a whole lead offset
  AHEAD of it, so there is a dead band at every edge — ~100px along the bottom —
  and, worse, anything *behind* the head only ever sees 10% of the flow (the
  cone), so it cannot be won by holding either. A single grain of sand down
  there makes the room unfinishable; that is exactly how the entrance hall used
  to hang. Debris a little outside the rectangle is still fine — the airflow
  reaches ~200px at full power — but a scene scattering things near an edge
  should filter against it, as the entrance hall does for its grit.
* **Progress across an orientation change.** `layout()` rebuilds the world from
  nothing, so the player's progress has to be put back:
  * **`this.persist`** is a plain object that survives `relayout()`. Put
    anything you want kept there — kitchen stores the list of wiped spots,
    normalized to the spill, and replays them into the new floor; sofa does the
    same for the patches it cleaned in the dust film under the furniture.
  * **`saveProgress()` / `restoreProgress(p)`** carry the *debris*. The default
    saves the INDICES of the pieces already collected (layout is deterministic
    for a given seed, so index i is the same piece in both poses) and puts them
    back, falling back to a count if the list changed length — so identities are
    preserved, not just a number. A scene that already rebuilds everything from
    `persist` (sand, toy) overrides both with no-ops; a scene with extra
    erasures to replay (thread's clean lines) extends `restoreProgress`.
* **No UI.** Completion must be shown by the world: the camera moves, light
  spills through a door, grime is wiped away. `exit()` returns that camera move;
  `main.js` plays it, swaps the scene, then plays the next scene's `entry()`
  move, with a warm light wash in between so it reads as walking through the
  doorway.

## Camera

`x, y` is the world point at the centre of the screen; `zoom` is a uniform
scale; `tilt` (0..1) squashes Y and pushes the view down the screen, faking a
camera dropped toward floor level (for travelling away in portrait or going
under furniture). `cam.apply(ctx)` sets the transform for world-space drawing;
`toScreen`/`toWorld` convert points. `cam.kick(px)` is a tiny impact shake.

```js
cam.followTo(dt, anchor, subject, limit, gain, rate, snap);
```
Bounded-gain follow, for when the camera must keep the nozzle in frame without
running away from the set it is framing. `anchor` is the composition the scene
wants (`{x, y, zoom, tilt}`); the offset toward `subject` is `gain * (subject -
anchor)` **clamped** to `limit`, so it always settles. `snap` skips the easing
(use it on the first frame). The sofa cavity is framed with it.

## Vacuum, hose and cup

The nozzle springs toward the finger with a **lead offset in screen pixels**
(portrait: 92px above; landscape: 78px above plus up to 36px ahead along the
drag), so a real finger never covers the moment of suction. The mouth is a
further `MOUTH_OFFSET` (22 DESIGN px, so it scales with zoom) in front of the
head. Both are exported —

```js
import { LEAD, MOUTH_OFFSET } from './vacuum/vacuum.js';
```

— because anything aiming at a target has to add both or it puts the middle of
the head on it instead of the mouth. `dev/gestures.mjs` imports them, so the
harness and the game can never drift apart.

The body trails on a softer spring; the hose is a catmull-rom through two
sagging spring points, and `transit()` animates items along that same spline
into the cup, so what you see travelling through the tube is literally on the
tube path.

```js
vac.gulp(amount)        // squash the mouth, as if something just went in
vac.transit(item, dur)  // send it up the tube; returns the transit record, so
                        // a scene can keep animating it (toy makes it bounce)
vac.addToCup(item)      // straight into the cup, no tube ride
vac.emptyCup()          // tip it out: the contents, with world coords in wx/wy
vac.cupToWorld(lx, ly, out)   // a cup-local point in world space
vac.clog = 0..1         // the intake is blocked
```

**`vac.clog`** is understood by the vacuum itself: the motor pitch drops and
goes boomy, `flowScale` weakens the airflow, and the head judders. Whatever is
plugging the mouth sets it every frame (the sofa's sock while it is sucked flat
across the intake, the mother bunny while she is jammed on the nozzle); left
alone it clears itself in ~0.1s, so nothing can forget to switch it off.

## Floors

`Floor` is an offscreen base canvas plus an optional grime layer that captures
erase holes in (`floor.reveal(wx, wy, r)`). `floor.clearGrime()` erases the lot
and sets `grimeCleared`, after which `draw()` **skips** the grime composite
entirely — a fully-erased full-screen layer is otherwise blended every frame for
nothing.

```js
const g = floor.growBase(rect);   // save()d, and in WORLD coordinates
drawTheWholeSet(g); g.restore();  // walls, skirting, a mat, a chair, a rug
floor.smoothGrime = false;        // soft dust does not need the bilinear filter
```

`growBase(rect)` enlarges the BASE canvas, keeping what is on it, so a scene can
bake its static set into the opaque blit that has to happen anyway instead of
rasterising a screenful of gradients every frame (`thread` does exactly this
with its corridor). The grime layer is deliberately not grown: it is the
expensive one, because it is the one with alpha. `smoothBase` / `smoothGrime`
turn off the upscale filter on either composite — see **Performance** below for
why that is worth several frames a second.

## Harness

`window.game`: `state()`, `input.pointer(nx, ny, down)` (normalized 0..1),
`input.replay(frames)`, `pause()`, `step(dt)`, `resume()`, `goto(sceneId)`,
`setSpeed(x)`, `dev(on)`.
URL params: `?scene=`, `?seed=`, `?dev=1`, `?speed=`, `?pose=` (informational),
`?mute=1`. See `dev/README.md`.

`dev/shot.mjs` grabs deterministic frame sequences (`--gesture`, `--path`,
`--target`, `--exec`, `--complete`, `--contact`); `dev/playthrough.mjs` drives
the entire chain on all four devices with synthetic one-finger input and reports
per-scene time, real-time fps and page errors. Both are documented in
`dev/README.md`, including a "reproduce one moment" recipe.

## Performance: the frame is pixels, not JavaScript

Measure before cutting anything. `node dev/fps.mjs --scene=X --device=Y
--profile` runs the page free-running with a synthetic finger and reports
min/p10/median off the real rAF clock, plus a breakdown of the frame.

The breakdown is the point. On the sofa — the heaviest scene in the game —
`sim` plus every `draw` callback measured **under 1.5ms** on an iPhone-sized
canvas while the frame itself took **34ms**. None of the missing 32ms is ours
to speed up by writing better loops: it is Canvas2D compositing in the
rasteriser, and the only lever is asking for fewer, cheaper pixels.

Costed one layer at a time, with `dev/fps.mjs --init` switching each off
(iPhone portrait, 390x844 at DPR 2 = **1.32 Mpx a frame**):

| what | ms/frame |
|------|---------:|
| a full-screen opaque `fillRect` (the background clear) | ~0 |
| the wood floor: one opaque `drawImage`, camera-scaled | 5.0 |
| the dust film: half-res, alpha, camera-scaled | 2.4 |
| the ghost sofa at **alpha 0.06**: one big `drawImage` | 5.5 |
| the thread scene's grime layer: full-screen, alpha | 6.4 |
| the thread scene's corridor: gradient fills | 7.1 |
| a second full-screen light layer blended with `lighter` | 8.0 |
| the **bilinear filter** on one full-screen composite | 5.8 |

Four rules follow, and every optimisation in these scenes is one of them:

1. **Count the full-screen passes.** Roughly 2.5 of them fit in a 60fps frame
   at iPhone size. An opaque flat fill is free; an image with alpha is not, and
   it costs the same at alpha 0.06 as at alpha 1.
2. **The filter is often dearer than the thing being filtered.** Soft dust, a
   darkness overlay, a blurred beam: none of them need bilinear.
   `imageSmoothingEnabled = false` on those blits, and keep the filter for
   surfaces with edges in them — floorboards you are actually looking at.
3. **Static scenery is a texture, not a draw list.** Anything that does not
   move belongs in an offscreen canvas painted once: `Floor.growBase()` folds a
   scene's whole set into the opaque blit that has to happen anyway.
4. **Never build a gradient in a draw loop.** `createRadialGradient` /
   `createLinearGradient` per frame is a new object and a fresh raster. Build
   one at the origin at full alpha, cache it by radius, and carry the strength
   in `globalAlpha`.

### Why iPad is slower here, and what that does and does not mean

| device | canvas at DPR 2 | pixels a frame |
|--------|-----------------|---------------:|
| iPhone portrait / landscape | 780x1688 | 1.32 Mpx |
| iPad portrait / landscape | 1640x2360 | 3.87 Mpx |

The iPad viewport is **2.93x the pixels**, and in this container the frame time
scales with almost exactly that factor for the same scene — carpet is 60fps on
the phone and 26 on the pad, 16.7ms against 38ms. That is the whole
explanation: there is no iPad-specific code path and no per-device content.

It is worth being blunt about what the container measures. Chromium here has no
GPU: everything is rasterised on the CPU by SwiftShader, at something like
100-130 Mpx/s of blended fill. A real iPad composites on a GPU orders of
magnitude faster at exactly this work, and so does a real iPhone — the phone
numbers are only "fast" here because the phone viewport is small enough that a
CPU rasteriser can keep up with it.

So: **the iPad column is a fill-rate stress test, not a prediction.** It is
still worth optimising against, because it ranks changes correctly — anything
that removes a full-screen pass shows up there first and largest. What it
cannot do is be pushed to 50fps by better drawing: at 3.87 Mpx, 20ms a frame
buys about one and a half blended full-screen passes, and a floor, a grime
layer, the debris and a darkness overlay are already more than that. The lever
that WOULD fix it is rendering fewer pixels — dropping the device pixel ratio
toward 1.5 when a sustained frame rate says the machine cannot afford 2. That
is deliberately not wired up: it is a real-device mitigation, and turning it on
here would improve the measurement rather than the game.

## iOS Safari

None of this can be verified in the container, so it is done by the book:

* `viewport-fit=cover` + `env(safe-area-inset-*)` exposed as CSS variables. The
  canvas is deliberately full-bleed (the game keeps its action away from the
  edges instead of letting the browser letterbox it).
* No rubber-band scrolling: `overscroll-behavior: none`, `position: fixed` body,
  `touch-action: none`, and a document-level `touchmove` handler registered
  `{passive: false}` that calls `preventDefault()`.
* No zoom or callout: `maximum-scale=1, user-scalable=no`,
  `-webkit-touch-callout: none`, `-webkit-user-select: none`, `gesturestart`/
  `gesturechange`/`gestureend`/`contextmenu`/`selectstart` all prevented, and a
  double-tap guard that swallows the second `touchend` inside 350ms.
* **WebAudio** is unlocked on BOTH `pointerdown` and `touchend` (Safari has
  honoured one and not the other across versions) via `audio.unlock()`, which is
  idempotent, and resumed on `visibilitychange`/`focus`.
* The loop is **paused while the page is hidden** and the audio context
  suspended — a backgrounded rAF loop on iOS is either throttled to a crawl or
  replayed in one lump when you come back.
* DPR capped at 2.
* Resize is **debounced** (90ms, 220ms after `orientationchange`, which reports
  the old size for a moment) and driven by `visualViewport` when it exists,
  because that is the box actually being painted while the URL bar animates.
  `resize`, `orientationchange`, `visualViewport` resize/scroll and `pageshow`
  all feed the same debounce, and a resize to the same size is a no-op.
* `manifest.webmanifest` + `apple-mobile-web-app-capable` so it can be added to
  the home screen. The manifest is the only place in the product with words in
  it; there is still no text in the game.


## The dust cup, capacity and the bin

The cup was a pure reward; it is now also a limit, and the limit teaches its own
answer with nothing written down.

```js
vac.cupVol      // summed volume of everything in the cup (blob area)
vac.cupFill     // 0..1 over CUP_CAPACITY
vac.cupFull     // cupFill >= 1
vac.cupVolTotal // everything ever collected, across pours (calibration only)
vac.pourInto(bin, ctx)        // only for a scene writing its own finale
```

`CUP_CAPACITY` is 2000, in the units `_land()` measures blobs in (r²), and it is
calibrated against `dev/playthrough.mjs`, which reports what each room actually
deposits:

| room | deposited | | room | deposited |
|------|----------:|-|------|----------:|
| intro | 488 | | sand | 1028 |
| kitchen | 1018 | | sofa | 847 |
| paper | 835 | | carpet | 973 |
| toy | 2072 | | one trip down the hallway | ~110 |
| thread | 127 | | | |

A typical room is ~950, so the cup holds **two rooms' worth**: intro plus
kitchen leaves it at 0.75, and the weakening starts early in the third room.

The chain the child follows, in order, with no words at any step:

1. **The cup is visibly full.** Contents jiggle harder the fuller it is, press
   up against the lid, the lid bows, and tufts of fluff squeeze out of the seam.
   The motor sags: `setMotor` is handed the fill as extra load and clog, so the
   pitch drops and it labours.
2. **Above 0.8 the world stops responding as much.** `fillPower` scales the
   whole field down to 45% at 1.0, so every debris type leans less. The fade is
   `smoothstep(0.8, 1, fill)`: x0.91 of the airflow at **0.85** (first visible),
   x0.72 at **0.90** (unmistakable — a dust bunny that let go a moment ago now
   only strains), x0.45 at 1.0.
3. **At 1.0 nothing goes in.** `field()` reports `inCapture: false` and reverses
   the pull within 46px of the mouth, so the air drags a crumb up to the intake
   and spits it back out with a puff. The thing visibly does not fit.
4. **The bin is the only open thing in the room**, and its rim brightens and
   pulses as the cup fills (`bin.invite`).
5. **Bringing the head to it pours.** The cup's bottom flap swings open, the
   whole contents arc across in one rush with the "zazaa" of `setStream`, the
   lid claps, the cup is empty and the power is back.

```js
import { Bin } from '../props/bin.js';
this.placeBin();                    // at the END of layout()
this.placeBin({ x, y });            // or an explicit spot
this.placeBin({ side: 'left' });
```

`Scene.placeBin()` scores the four corners the nozzle can reach against three
soft rules — never under the parked machine (weight 0.30 inside 110px), not
standing on the debris (0.008 inside 110px), and prefer the end of the room the
child comes in at (0.004/px) — so no scene has to think about it and none of
them can get it badly wrong. `main.js` ticks and draws `this.bin`; a scene sets
`this.ownsBin = true` only if it drives the pour itself.

The bin stays shut below `armFill` (0.5) so it never swallows the child's first
three crumbs as they walk past the door. `bin.beginPour(vac, ctx, {pad: n})`
invents `n` extra blobs, so a finale pour is a rush even from a half-empty cup —
that is how the carpet finale works, and it is the same prop, walked over to the
machine, not a second one.

## Core services for later scenes

### Strand transit (thread, hair, noodles)

```js
vac.transit({
  kind: 'strand',
  points: [{x,y}, ...],   // world coords, points[0] goes in FIRST
  color: '#e7e2d8',
  width: 2.4,
  size: 12,               // how big the coil in the cup ends up
});
```
The tube knows its own arc length, so the strand runs in head-first: each vertex
is on the tube once the head has travelled past its distance along the strand,
and still sitting on the floor before that. It lands in the cup as a small
tangle (`kind: 'coil'`). `vac.mouth()` → `{x, y, dirX, dirY}` is there so a
strand can feed itself in from wherever the mouth currently is.

### Audio (`src/core/audio.js`)

```js
audio.setSpace({ muffle: 0..1, pitchBias: semitones });  // where the machine IS
audio.setStream(0..1);   // the "zazaa": a mass draining, not a pop per piece
audio.setMotor(power, load, clog);   // called by the vacuum, not by scenes
```

`setSpace` closes the room down around the motor (sofa uses it for "under the
furniture": lowpass, quieter air, lower note). `setStream` opens a wide filtered
noise bed for a MASS going in — sand collapsing into the crater, a whole spill
of crumbs skating in at once, the pile being combed out and then the dust cup
draining into the bin. Scenes never touch the audio graph; if you find yourself
reaching for `audio.o1`, the parameter is missing from these three.

### Props (`src/props/prop.js`)

```js
import { Prop, resolveProps } from '../props/prop.js';

this.props.push(new Prop({
  x, y,
  shape: 'circle' | 'rect', r, w, h, angle,
  mass: 1, friction: 6,
  pushable: true,          // false = solid, the head slides along it
  color, shadow: true,
  draw: (ctx) => { ... },  // optional override, world coords
  data: { ... },           // your payload
}));

// once per step, after vac.update():
resolveProps(ctx.vacuum, this.props, dt, {
  separate: true,                     // props shoulder each other aside, and
                                      // pushable ones are pushed out of solids
  bounds: { x0, y0, x1, y1, inset },  // pushable props stay in this rectangle
});
```
Pushable props are shoved by the nozzle head (not by the airflow), slide, and
grind to a halt; `prop.nudge` (0..1, decaying) is set on contact so you can rock
or squash them. Non-pushable props push the head back out and cancel its inward
velocity, so the head slides along the edge — that is how the intro table leg
and the kitchen bowl work. **They block the BODY too**, and that is not
cosmetic: the head points away from the body, so a body driven through a wall
while the head is held against it flips the head round to face backwards, taking
the whole airflow cone with it.

The overlap with the head is **always fully resolved**, split by mass: a light
prop gets out of the way, a heavy one pushes the head back instead of letting it
sink in (before, displacement was scaled by `1/mass` and the remainder was
simply left as penetration, so the head visibly buried itself in the block
train). `separateProps(props)` and `keepInside(prop, bounds)` are exported
separately if a scene wants only one of them.

### Lighting (`src/core/light.js`)

```js
import { LightLayer } from '../core/light.js';
this.light = new LightLayer();      // in the constructor
this.light.setDark(0.88);           // in layout()
lights(L, cam, vac) {               // optional Scene hook, SCREEN coords
  const p = {x:0,y:0}; cam.toScreen(lampX, lampY, p);
  L.addLight(p.x, p.y, 150, 0.8);
  // addLight(sx, sy, r, intensity, dirX, dirY, cone, softness)
}
vac.headlight.on = true;            // cone thrown forward from the mouth
vac.headlight.r / .intensity / .cone / .softness;
```
`softness` (0..1) turns a cone from a hard pie slice into a torch beam: blobs
threaded along the axis, each wider and weaker, so it has no cut edge anywhere
(three nested CLIPPED wedges gave the beam three visible straight edges, and a
clip is one of the dearest things you can ask a software rasteriser for).
`softness: 0` keeps the cheap single cone, and is the default.

A cut-out can only reveal the scene as it was already painted, so on its own a
beam is not light — it is merely less dark, which reads as grey. Warm light is
ADDED back inside the cone:

```js
vac.headlight.warm = 0.3;        // addHeadlight() then lights the beam as well
L.addGlow(sx, sy, r, i, dx, dy, cone, softness);   // same geometry as addLight
L.addSpark(sx, sy, r, i);        // one lit speck: a dust mote in the beam
```

Those calls are QUEUED and replayed onto the SAME layer at `composite()` time
(a `destination-out` cut issued after them would erase them), so the darkness
and the light it leaves behind still reach the screen as one composite. A scene
that never asks for warm light pays nothing, and a frame with no darkness and
nothing warm skips the composite altogether.

`main.js` runs `begin()` → `addHeadlight()` → `scene.lights()` → `composite()`
every frame when `scene.light` is set. One half-resolution offscreen canvas,
`destination-out` cut-outs, no per-frame allocation.

### Height field (`src/core/heightfield.js`)

```js
import { HeightField } from '../core/heightfield.js';
const hf = new HeightField({x0,y0,x1,y1}, 48, 48);
hf.addRadial(x, y, 60, 18);                 // heap it up
const taken = -hf.addRadial(m.x, m.y, 26, -rate * dt * f.strength);
hf.relax(dt, 0.55, 9);                      // sides collapse into the crater
hf.smooth(2, 0.4);                          // blur stacked blobs into one heap
hf.drawShaded(ctx, '#e9d8ad', '#c2a066', 20);
```
`relax(dt, repose, rate)` conserves mass and only moves it where the slope
exceeds the angle of repose, which is what makes a sucked crater cave in;
`rate` is how fast it flows (9 is the default collapse, lower is treacly).
`smooth(iters, amount)` is a mass-conserving blur — how you turn a pile of
stacked blobs into one soft heap. `get/set/add` take world
coordinates. Scenes are free to draw the grid themselves.

### Gesture signals

`input.rub` / `input.rubIntensity`, `input.circle` / `input.circleIntensity`
(0..1, decaying) and, mirrored on the vacuum so debris never needs the Input
object: `vac.rub`, `vac.circle`, and `vac.scrub` — the latter counts reversals
of the HEAD's own motion, which is the right signal for a brush-roll / combing
mechanic.

### Dust bunny behaviour worth copying

`DustBunny` is the reference implementation of "never static": in the flow but
not yet free, it strains rhythmically (2-3 Hz elastic stretch and relax), sheds
single fibers into the mouth as little wisps (each one a `kind:'wisp'` transit
and a tick), thins as it loses them — which lowers its own break-loose
threshold — then cocks ~80ms AWAY from the nozzle before snapping in. Any new
debris type should have an equivalent "it is straining, and holding still will
eventually win" loop rather than a static deformed pose.

### Air-borne specks (`src/core/airborne.js`)

```js
const air = new Airborne(400, { kinds: { ash: { color, drag, gravity, r, life, lift } } });
air.spawn(x, y, z, vx, vy, vz, 'flour');   // z = height above the floor, design px
air.update(dt, vac);                       // pull, lift, gravity, settle, capture
air.draw(ctx, cam);                        // inside cam.apply()
air.captured;                              // how many have gone up the tube
```

Everything that is not ON the floor any more. The airflow a speck feels is
scaled by `1 / (1 + (z/46)^2)` and it **lifts** as well as pulls, so a cloud is
dragged down and in rather than merely translated, and a speck thrown too high
sails over the head and settles. Pooled: `spawn` never allocates after
construction. Height reads as a shadow that separates from the speck and a size
that grows. Used by flour, leaf fragments and the boss's fibres.

### Powder film (`src/core/powder.js`)

```js
const pw = new Powder({x0,y0,x1,y1}, 64, 64);
pw.blob(x, y, 90, 1);  pw.markDirty();     // lay it down, freeze what must be cleaned
const got = pw.suck(vac.mouthX, vac.mouthY, 30, rate * dt * f.strength);
pw.advect(vac, dt);                        // the film streaks toward the mouth
const lifted = pw.puff(x, y, 60);          // -> spawn that as Airborne particles
pw.drawSoft(ctx, '#fdfaf3');
pw.cleanFrac();                            // 0..1, the progress with no counter
```

`HeightField` is a pile you dig a crater in; this is a *film* you drag around.
`advect` samples each cell one flow-step upwind, so the whole film draws itself
into streaks converging on the mouth — airflow made visible without drawing a
single arrow. Where the density is gone the floor shows through, so the clean
track is not a separate mask. Two flat fills per cell, no gradients, no filter.

### Fabric (`src/core/cloth.js`)

```js
const cl = new Cloth({x0,y0,x1,y1}, 9, 7, { gain: 30, pinned: 'edges' });
cl.update(dt, vac);
cl.draw(ctx, { fill: '#c9a98b' });   // or cl.drawImage(ctx, offscreenCanvas)
cl.bulge;                            // 0..1 peak lift
cl.bulgeAt(x, y);  cl.pointAt(u, v, out);
```

A grid of springs. Each node samples the field at its **own** position, so the
near corner lifts first exactly as a dust bunny's near fibres lean first; the
neighbour links keep it a sheet; the seam is pinned. `damp` is a damping
**ratio** derived from both spring constants — a fixed rate leaves a 9x7 grid
ringing forever, which is the one thing a cushion must never do. `drawImage`
deforms a bitmap one quad at a time with a transform, not per pixel.

### Nozzle morph

```js
vac.setTool('crevice', smoothstep(70, 12, distanceIntoTheGap));   // from update()
vac.setTool('wide', 0);
vac.crevice;    // 0..1, if you want to draw something that follows the morph
```

The head, the capture ellipse (22x30 → 34x11) and the cone all morph together:
much narrower off axis, much stronger and about 28% longer along it. Scenes
drive `t` from world geometry, so entering a gap is something the child watches
happen rather than a mode they switch.

### Stepped camera (stairs)

```js
cam.stepTo(dt, anchor, vac.nozzle, { axis: 'y', step: 128, rate: 7, kick: 3.5 });
cam.resetSteps();    // from layout()
```

A smooth follow up a flight of stairs reads as a ramp. This quantises the travel
axis to whole treads with a hysteresis band, settles on each one, and kicks as
the head crosses a nosing. The other axis follows normally, bounded like
`followTo`.

### Testing all of it

`node dev/core-tests.mjs` runs each of these in the real page against the real
`Vacuum` — a mock would only be testing the mock — and asserts the behaviour a
room depends on: low specks go in and high ones do not, `suck` conserves mass,
`advect` moves the centroid toward the mouth, the cloth bulges and then relaxes,
the crevice tool trades width for reach, the field fades and then reverses as
the cup fills, the bin pours a full cup and ignores a nearly empty one, and
`stepTo` only ever settles on whole steps. It exits non-zero on any failure.
