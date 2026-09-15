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
src/core/light.js       darkness overlay with cut-out lights (half-res offscreen)
src/core/heightfield.js grid of heights with angle-of-repose relaxation (sand, pile)
src/scenes/scene.js     Scene base (the contract below)
src/scenes/index.js     ordered registry — the ONLY core file a new scene touches
src/scenes/*.js         the eight scenes, in chain order
manifest.webmanifest    name/colour/icon so it can be added to the home screen
```

## The chain

```
intro → kitchen → paper → toy → thread → sand → sofa → carpet → intro
```

The order in `SCENES` (`src/scenes/index.js`) IS the chain, and every scene's
`exit().next` names the one after it. `carpet` closes the loop: its finale
empties the dust cup into a bin and hands back to `intro`. `dev/playthrough.mjs`
drives the whole ring with synthetic one-finger input on all four devices; if
you change the order, change both places and re-run it.

## The one coupling: `vacuum.field(x, y, out)`

```js
const f = vac.field(worldX, worldY, myScratchObject);
// f.strength   0 .. ~2.5   airflow at that point
// f.fx, f.fy   pull vector, already scaled by strength
// f.inCapture  true when the point is inside the mouth ellipse
// f.dist       distance to the mouth
```

* The flow is a **cone in front of the mouth**: `strength = power * flowScale *
  cone(align) / (1 + (d/r)^2)^2`, where `power` is 1.0 at idle and ramps to 2.2
  over ~0.3s while the finger is down **and not sweeping** (that is what "press
  and hold" means on a touch screen), and `r` is ~84 at idle, ~105 at full power.
  `flowScale` is `1 - 0.75 * vac.clog` — a blocked intake moves less air.
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
and the kitchen bowl work.

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
`softness` (0..1) turns a cone from a hard pie slice into a torch beam: the
wedge is drawn as three nested cones, each wider and weaker, plus a pool at the
origin, so it has no cut edge. `softness: 0` keeps the cheap single cone (and is
the default, so nothing pays for what it does not ask for).

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
