# Scene agent guide (Phase B) — read docs/BRIEF.md and docs/ARCHITECTURE.md first

You are one of **five** agents building a room CONCURRENTLY in the same working
directory. Phase A built the hub, the cup/bin mechanic and the core services
your room needs; they are done and they are **not yours to change**.

Your room is one of:

| id | what it is (docs/PLAN_V2.md has the full brief) |
|----|--------------------------------------------------|
| `pantry`  | a flour cloud: powder streaming and swirling into the mouth, clean tracks, a tipped bag |
| `stairs`  | debris tumbling down step edges, a lip that needs a hold, a bunny bouncing down |
| `window`  | curtain hem sucked in and flapping, motes in the light shafts, a crevice-tool gap |
| `veranda` | dry leaves crumbling at the mouth, a pile scattering on the side gust, wet leaves that need a hold |
| `bedroom` | cushion fabric bulging, pet hair lifting out of the weave, then the giant dust bunny boss under the bed. The grand finale room. |

---

## File ownership

- You own ONLY: `src/scenes/<yourId>.js`, new files you create under
  `src/debris/`, `src/floors/`, `src/props/` whose names are unambiguously
  yours (`src/debris/flourBag.js`, `src/floors/veranda.js`), your own
  `dev/<yourId>-*.mjs`, and `dev/out/` output.
- **The core is frozen for Phase B.** Do not edit: `src/main.js`,
  `src/scenes/scene.js`, `src/scenes/hall.js`, `src/scenes/stub.js`,
  `src/vacuum/*`, `src/core/*`, `src/props/prop.js`, `src/props/bin.js`,
  `src/debris/base.js`, `src/debris/dustBunny.js`, `src/debris/crumb.js`,
  `dev/shot.mjs`, `dev/playthrough.mjs`, `dev/gestures.mjs`, `dev/core-tests.mjs`,
  `index.html`, and any other agent's scene. If something is genuinely missing,
  work around it inside your own files (subclass, wrap, duplicate a helper) and
  list the exact core change you wanted in your final report.
- Registry: `src/scenes/index.js` already has a line for your id. Change
  **that one line and its import** from `StubScene` to your class, touching
  nothing else in the file. Another agent may have edited between your read and
  your write; if the edit fails, re-read and retry. Never rewrite the file.
- Commit only your own files: `git add <your files> src/scenes/index.js` then
  `git commit`. Never `git add -A` / `git add .`. Never push. Never
  rebase/reset. If a commit fails because another agent is committing, retry.

---

## The door contract

There is no chain any more. Every room is entered from the hall and hands back
to it.

```js
exit()  { return { to: <camera move that shows the way out>, dur: 1.5, next: 'hall' }; }
entry() { return { x, y, zoom, tilt }; }   // where the camera starts, coming IN
```

* `main.js` routes a finished room back to the hall **generically** — it
  overrides `next` — so `next: 'hall'` is documentation, not plumbing. Do not
  try to name another room.
* `entry()` is played straight after the warm light wash, as if the child had
  just walked in through the door. Compose it as an arrival: slightly wider or
  lower than `rest`, looking at the first thing you want them to notice.
* `exit()` is the room being finished. Show the world change (the pattern that
  came up, the light that reached further), then let it fade. The hall takes
  over: the door closes behind the head and its frame lights up.
* Your room is marked clean the moment `isComplete()` sticks for 0.75s. Your
  `this.persist` is stored in the house and handed back if the room is ever
  rebuilt, so keep using it exactly as before for orientation changes.
* `?scene=<yourId>` still boots straight into your room, which is how you will
  work. `?scene=hall&clean=intro,kitchen` boots the hall with those doors done.

---

## The bin rule (not optional)

**Every room places a bin.** The cup now fills up: above 80% the airflow fades,
at 100% nothing goes in at all and things are puffed back out of the mouth. The
bin is the only answer, and it only teaches itself if it is already in the room
when the child needs it.

```js
layout(pose, w, h) {
  ...
  this.placeBin();                  // at the END of layout(), after rest/startPointer
}
```

`Scene.placeBin()` puts it in the corner the child came in at, inside
`reachRect()` so the mouth can always get to it. Override the spot only if that
default lands on your set, and keep the replacement **near the entrance, out of
the debris, and inside `reachRect`**:

```js
this.placeBin({ x: someWorldX, y: someWorldY });
this.placeBin({ side: 'left' });   // same rule, other corner
```

`main.js` ticks and draws it (body behind the machine, pour arcs and lid in
front). You do not update it, draw it, or trigger it. Do not set `ownsBin`
unless you are writing a finale that drives the pour itself.

Both poses need one. A room with no bin is a room a child can get stuck in.

---

## New core APIs

All of them are exercised by `node dev/core-tests.mjs`; read that file for a
worked example of each.

```js
import { Airborne } from '../core/airborne.js';
const air = new Airborne(400);                     // pooled, no per-frame alloc
air.spawn(x, y, z, vx, vy, vz, 'flour');           // z = height in design px
air.update(dt, vac);                               // pull, lift, gravity, capture
air.draw(ctx, cam);                                // inside cam.apply()
air.kinds.myKind = { color, drag, gravity, r, life, lift };
```
Low specks are deep in the flow and go straight in; high ones only drift and
settle. `air.captured` counts what has gone up the tube.

```js
import { Powder } from '../core/powder.js';
const pw = new Powder({x0,y0,x1,y1}, 64, 64);
pw.blob(x, y, 90, 1);  pw.markDirty();             // lay it down, then freeze
                                                   // "what has to be cleaned"
const mass = pw.suck(vac.mouthX, vac.mouthY, 30, rate * dt * f.strength);
pw.advect(vac, dt);                                // streaks converging on the mouth
const lifted = pw.puff(x, y, 60);                  // -> spawn that as Airborne
pw.drawSoft(ctx, '#fdfaf3');
pw.cleanFrac();                                    // 0..1 progress, no counter
```

```js
import { Cloth } from '../core/cloth.js';
const cl = new Cloth({x0,y0,x1,y1}, 9, 7, { gain: 30, pinned: 'edges' });
cl.update(dt, vac);
cl.draw(ctx, { fill: '#c9a98b' });   // or cl.drawImage(ctx, offscreenCanvas)
cl.bulge;                            // 0..1 peak lift, for spawning hair out of it
cl.bulgeAt(x, y);  cl.pointAt(u, v, out);
```

```js
vac.setTool('crevice', smoothstep(70, 12, distanceIntoTheGap));   // in update()
vac.setTool('wide', 0);                                            // back to normal
vac.crevice;    // 0..1, if you want to draw something that follows the morph
```
The head, the capture ellipse and the cone morph together: much narrower off
axis, much stronger and longer along it. Drive `t` from world geometry so the
change is something the child watches happen as they enter the gap.

```js
cam.stepTo(dt, anchor, vac.nozzle, { axis: 'y', step: 128, rate: 7, kick: 3.5 });
cam.resetSteps();    // in layout()
```

```js
vac.cupFill;      // 0..1
vac.cupFull;      // nothing more fits
vac.pourInto(bin, ctx);   // only if you are writing your own finale
```

Everything from Phase 2 is unchanged and still the bar: `vac.field(x, y, out)`
is the ONLY coupling, `LightLayer`, `HeightField`, `Prop`/`resolveProps`,
`audio.setSpace`/`setStream`, `clearStartZone`, `reachRect`, `translate`/`aim`.

---

## Feel standard (non-negotiable)

The pre-suction reaction IS the deliverable. For your debris:

1. A continuous, monotonically growing reaction as the nozzle approaches
   (sample `vac.field` on your own body; nothing is distance-to-nozzle based).
2. At least ~0.6–0.9 s of readable anticipation on a slow approach before capture.
3. An anticipation beat right before it lets go, then a fast, stretched pull,
   the head "gulp", a visible tube ride, and a persistent addition to the cup.
4. Never a static deformed pose: anything caught in the flow but not yet captured
   pulses, trembles, sheds, trickles, flutters — it is alive.
5. Legible at 4-year-old scale: the smallest interesting debris ≥ 9 design px,
   the main one 50–80 design px. High contrast with the floor.
6. Zero text/HUD/buttons/arrows/radius. The world itself invites the action.
7. Portrait and landscape are separately composed (`layout()` branches), not one
   design scaled. Portrait favours depth; landscape favours width.
8. Completion is shown by the world and leads back out of the door.

Your room must also be finishable **with a weakened vacuum**: a child may walk
in with the cup at 90%. Never require full power to clear the last piece
without also putting a bin within reach of it — which `placeBin` already does.

---

## Verification you must do (and report)

```sh
node dev/shot.mjs --scene=<id> --device=iphone-portrait --gesture=approach-slow --frames=16 --every=100 --contact
node dev/shot.mjs --scene=<id> --device=iphone-landscape --gesture=<the gesture that matters> --frames=16 --every=100 --contact
node dev/shot.mjs --scene=<id> --device=ipad-portrait  ... and ipad-landscape ...
node dev/shot.mjs --scene=<id> --device=iphone-portrait --gesture=idle --frames=12 --every=300 --complete --contact
node dev/fps.mjs  --scene=<id> --all --seconds=5
node dev/core-tests.mjs                     # must stay green
node dev/playthrough.mjs --device=iphone-portrait
```

READ the contact sheets with the image reader and judge them honestly against
the feel standard. Iterate until the sheets prove it. Include the paths of the
final sheets in your report and the `state.json` numbers that show anticipation.
Check `?dev=1` for page errors and that fps stays ≥ 50 on the frame grabber.

### Reproduction recipes

```sh
# your room, straight in, with the dev overlay
?scene=<id>&seed=1337&dev=1

# the hall with some doors already done, to see your door's invitation
node dev/shot.mjs --scene=hall --clean=intro,kitchen,paper --device=iphone-portrait \
     --gesture=idle --frames=8 --every=400 --contact

# your room entered the way the child enters it: through its door in the hall
node dev/shot.mjs --scene=hall --clean=intro --device=iphone-portrait \
     --path="0.5,0.78;@bunny,5000" --seg=1600 --frames=16 --every=250 --contact

# what your room feels like with the cup nearly full (the weakened vacuum)
node dev/shot.mjs --scene=<id> --exec="vac.cupVol = 2100; vac.cupFill = 0.91" \
     --gesture=approach-slow --frames=16 --every=120 --contact

# ...and completely full: things must visibly bounce off the mouth
node dev/shot.mjs --scene=<id> --exec="vac.cupVol = 2300; vac.cupFill = 1" \
     --path="@auto,3000" --frames=14 --every=150 --contact

# the pour, without playing the room
node dev/shot.mjs --scene=<id> --exec="for(let i=0;i<40;i++)vac.addToCup({kind:'fluff',color:'#ccc',size:20});
     scene.bin.x = vac.mouthX + 40; scene.bin.y = vac.mouthY" --frames=14 --every=100 --contact

# your room in the middle of a real run
node dev/playthrough.mjs --device=iphone-portrait --clean=intro,kitchen,paper,toy,thread,sand,sofa,carpet
```

`dev/README.md` has the rest (`--path`, `--target`, `--exec`, `--skip`,
`--complete`, the fps probe, and how to read `state.json`).
