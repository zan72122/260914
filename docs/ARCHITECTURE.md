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
src/scenes/intro.js     scene 1
src/scenes/kitchen.js   scene 2
```

## The one coupling: `vacuum.field(x, y, out)`

```js
const f = vac.field(worldX, worldY, myScratchObject);
// f.strength   0 .. ~2.5   airflow at that point
// f.fx, f.fy   pull vector, already scaled by strength
// f.inCapture  true when the point is inside the mouth ellipse
// f.dist       distance to the mouth
```

* The flow is a **cone in front of the mouth**: `strength = power * cone(align) /
  (1 + (d/r)^2)^2`, where `power` is 1.0 at idle and ramps to 2.2 over ~0.3s
  while the finger is down **and not sweeping** (that is what "press and hold"
  means on a touch screen), and `r` is ~84 at idle, ~105 at full power.
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
  onCaptured(d) { /* reveal grime, spawn the next hint, ... */ }
  isComplete() { return this.remaining() === 0; }
  exit() { return { to: { x, y, zoom, tilt }, dur: 1.4, next: 'nextId' }; }
  entry() { return { x, y, zoom, tilt }; }     // where the camera starts
}
```

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
* **`this.persist`** is a plain object that survives `relayout()` (orientation
  change). Put anything you want kept there — kitchen stores the list of wiped
  spots, normalized to the spill, and replays them into the new floor.
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

## Vacuum, hose and cup

The nozzle springs toward the finger with a **lead offset in screen pixels**
(portrait: 70px above; landscape: 60px above plus up to 30px ahead along the
drag), so a real finger never covers the moment of suction. The body trails on a
softer spring; the hose is a catmull-rom through two sagging spring points, and
`transit()` animates items along that same spline into the cup, so what you see
travelling through the tube is literally on the tube path.

## Harness

`window.game`: `state()`, `input.pointer(nx, ny, down)` (normalized 0..1),
`input.replay(frames)`, `pause()`, `step(dt)`, `resume()`, `goto(sceneId)`,
`setSpeed(x)`, `dev(on)`.
URL params: `?scene=`, `?seed=`, `?dev=1`, `?speed=`, `?pose=` (informational),
`?mute=1`. See `dev/README.md`.


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
resolveProps(ctx.vacuum, this.props, dt);
```
Pushable props are shoved by the nozzle head (not by the airflow), slide, and
grind to a halt; `prop.nudge` (0..1, decaying) is set on contact so you can rock
or squash them. Non-pushable props push the head back out and cancel its inward
velocity, so the head slides along the edge — that is how the intro table leg
and the kitchen bowl work.

### Lighting (`src/core/light.js`)

```js
import { LightLayer } from '../core/light.js';
this.light = new LightLayer();      // in the constructor
this.light.setDark(0.88);           // in layout()
lights(L, cam, vac) {               // optional Scene hook, SCREEN coords
  const p = {x:0,y:0}; cam.toScreen(lampX, lampY, p);
  L.addLight(p.x, p.y, 150, 0.8);
}
vac.headlight.on = true;            // cone thrown forward from the mouth
vac.headlight.r / .intensity / .cone;
```
`main.js` runs `begin()` → `addHeadlight()` → `scene.lights()` → `composite()`
every frame when `scene.light` is set. One half-resolution offscreen canvas,
`destination-out` cut-outs, no per-frame allocation.

### Height field (`src/core/heightfield.js`)

```js
import { HeightField } from '../core/heightfield.js';
const hf = new HeightField({x0,y0,x1,y1}, 48, 48);
hf.addRadial(x, y, 60, 18);                 // heap it up
const taken = -hf.addRadial(m.x, m.y, 26, -rate * dt * f.strength);
hf.relax(dt, 0.55);                         // sides collapse into the crater
hf.drawShaded(ctx, '#e9d8ad', '#c2a066', 20);
```
`relax()` conserves mass and only moves it where the slope exceeds the angle of
repose, which is what makes a sucked crater cave in. `get/set/add` take world
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
