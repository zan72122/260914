# Scene agent guide (Phase 2) — read BRIEF.md and ARCHITECTURE.md first

You are one of several agents building scenes CONCURRENTLY in the same working
directory. Rules that keep you from stepping on each other:

## File ownership
- You own ONLY: `src/scenes/<yourId>.js`, new files you create under
  `src/debris/`, `src/floors/`, `src/props/` whose names are specific to your
  scene, and `dev/out/` output. Name new files with your scene id as prefix or an
  unambiguous name (e.g. `src/debris/paperScrap.js`, `src/floors/carpet.js`).
- **The core is frozen**: `src/core/*`, `src/vacuum/*`, `src/debris/base.js`,
  `src/debris/dustBunny.js`, `src/debris/crumb.js`, `src/scenes/scene.js`,
  `src/main.js`, `src/props/prop.js`, `src/core/light.js`, `src/core/heightfield.js`,
  `dev/*.mjs`, `index.html`. Do NOT edit them. If something is genuinely missing,
  work around it inside your own files (subclass, wrap, duplicate a helper) and
  list the exact core change you wanted in your final report. Do not edit other
  agents' scene files.
- Registry: append exactly ONE line for your scene to `src/scenes/index.js`
  (import + registry entry), touching nothing else in that file. Another agent
  may have appended between your read and your edit; if the edit fails, re-read
  and retry. Never rewrite the file.
- Commit only your own files: `git add <your files> src/scenes/index.js` then
  `git commit`. Never `git add -A` / `git add .`. Never push. Never rebase/reset.
  If a commit fails because another agent is committing, retry after a moment.

## Scene chain (fixed order; use these ids in `exit().next`)
intro → kitchen → paper → toy → thread → sand → sofa → carpet → (end)
Your `entry()` must look right coming from the previous scene's exit direction,
and your `exit()` must move the camera toward where the next scene will be.
The integration pass will connect the chain; you only need `next:'<id>'` correct.

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
   design scaled. Portrait favours depth (away from the viewer); landscape favours
   width.
8. Completion is shown by the world (reveal, camera move, light) and exposes the
   next target.

## Verification you must do (and report)
```
node dev/shot.mjs --scene=<id> --device=iphone-portrait --gesture=approach-slow --frames=16 --every=100 --contact
node dev/shot.mjs --scene=<id> --device=iphone-landscape --gesture=<the gesture that matters for your scene> --frames=16 --every=100 --contact
node dev/shot.mjs --scene=<id> --device=ipad-portrait  ... and ipad-landscape ...
node dev/shot.mjs --scene=<id> --device=iphone-portrait --gesture=idle --frames=12 --every=300 --complete --contact
```
Use `--skip`, `--out`, target-resolving gestures (see dev/gestures.mjs and
dev/README.md) as needed. If you need a new gesture, add it to your scene report
as a snippet; you may pass custom gesture JSON if shot.mjs supports it, otherwise
drive `window.game.input.replay` from a small script in your own `dev/<id>-*.mjs`.
READ the contact sheets with the image reader and judge them honestly against
the feel standard. Iterate until the sheets prove it. Include the paths of the
final sheets in your report and the state.json numbers that show anticipation.
Also check `?dev=1` for page errors and that fps stays ≥ 50 on the frame grabber.
