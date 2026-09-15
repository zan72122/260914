# すいすい！床のひみつ探検 — Design Brief (authoritative)

Target: a 4-year-old girl on iPhone / iPad (mobile Safari), portrait AND landscape.
Theme: ONLY "a vacuum cleaner sucks up debris on the floor". Go deep, not wide.

## The one rule that matters

**The moment BEFORE a piece of debris is sucked in is the game.**
Not "it disappears when touched". Every debris type must have a clearly different
pre-suction reaction (tremble, slide, roll, flutter, spin, stretch, collapse, flee,
sudden acceleration) that grows continuously as the nozzle approaches, and then
flows *continuously* into the nozzle, through a short transparent tube, into a
transparent dust cup. If you could replace the vacuum with a broom or a mop and the
game still worked, it is wrong. Only "things that happen because of suction" count.

## Player & input constraints (hard)

- One finger only: tap, press-and-hold, drag, swipe, rub, big circles. Nothing precise.
- No pinch, no two fingers, no game over, no timer, no text, no numbers, no counters.
- Wordless: never explain. The world itself invites the next action through
  perceived affordances, salient signifiers, familiar physical causality,
  natural mappings, perceptual incompleteness, and immediate visual feedback.
  Show, don't remind. No "next" buttons. Progression is a self-driving chain:
  visible incompleteness → one-finger action → immediate world change →
  completion → the completion itself exposes the next target (camera pans/lowers,
  a door opens, a rug corner flips, a toy rolls aside, the light reaches further).
- Rewards are physical/visual pleasure, never coins/score:
  the "spot" pop of a single suck; the "zazaa" of a mass suck; chasing the last one;
  finding dust in the dark under furniture; a pile collapsing; a hidden floor
  pattern appearing; debris racing through the transparent tube into the cup.
  The dust cup filling up IS the progress display.

## Vacuum

- The nozzle (head) is drawn a bit AHEAD of the finger so the finger never hides
  the moment of suction. Portrait: head above the finger. Landscape: head above/ahead
  of the finger. The body trails behind on a soft hose (spline), lagging.
- Part of the body is transparent: you see the tube and the dust cup. Notable
  debris is shown traveling nozzle → tube → cup. Cup contents accumulate visibly.
- Press-and-hold = stronger suction (motor pitch rises, nearby fibers lean harder).
  This must be discoverable by accident, never explained.
- The invisible airflow is visualized ONLY through what it does to the world:
  dust bunny fibers leaning, carpet pile bending, thread tips lifting, paper edges
  fluttering, sand grains trickling. Never draw a suction circle or arrows.

## Scenes (each changes several of: debris motion law, floor physics, spatial
## structure, vacuum posture, camera, movement path). Never "same scene, new colors".

Reference list (may be replaced by better suction-specific ideas):
1. **Intro / wood floor**: one dust bunny a little ahead of the nozzle; only its near
   edge sways toward the nozzle. Moving closer strengthens the sway → stretch → pop.
   Teaches everything with zero words.
2. **Slippery kitchen tile**: crumbs / rice grains on low-friction floor: they jitter,
   then slide and accelerate into the nozzle; overshoot and skate if you pass by.
3. **Paper scraps**: light paper lifts, flutters, flips, escapes on the gust from the
   sides of the nozzle; must be approached from the right side / with a hold.
4. **Thread & hair**: polylines sucked from one end, "shuru-shuru", visibly running
   through the transparent tube, coiling in the cup.
5. **Sand / grain pile**: sucking the center makes the surroundings collapse inward
   into a crater; grains trickle; the hidden floor pattern emerges underneath.
6. **Under the sofa (portrait: corridor going away from viewer; landscape: long
   floor with sofa)**: following a trail of debris leads under furniture; camera drops
   toward floor level; the vacuum headlight reveals dust in the dark.
7. **Carpet**: debris is buried in pile; the brush roll must comb it out first
   (rub back and forth), then it's sucked. Pile bends toward the nozzle.
8. **Big toy**: cannot be sucked; nudging it slides it aside and reveals fresh
   debris underneath (and maybe a hidden pattern).

Portrait and landscape are designed separately: portrait favors depth (near→far
exploration, corridors, entering under furniture); landscape favors width (long
floors, sofa, going around furniture legs).

## Tech (hard)

- Vanilla ES modules + Canvas 2D. No framework, no bundler, no build step.
  `index.html` at the repo root must run from any static server AND from
  GitHub Pages. No external network dependencies at runtime.
- Fake physics only: springs, splines, morph targets, particles, masks, height
  fields. Must run smoothly (60fps target, 30 acceptable) on mobile Safari.
  Cap DPR at 2. Avoid per-frame allocations in hot loops. No shadows blur abuse.
- Pointer Events, `touch-action: none`, prevent scrolling / double-tap zoom /
  long-press callout. Handle `resize` and orientation change without reload.
- Sound: optional WebAudio (motor hum whose pitch rises with suction/load,
  "spot" pops). Must start only after first user gesture and never block play.

## Developer harness (hard requirement; keep it minimal but real)

The goal: enter any moment directly, observe state, reproduce with normal input,
fix, and re-verify locally under identical conditions — without full playthroughs.

- URL params: `?scene=<id>` jump directly; `?seed=<n>` deterministic RNG;
  `?dev=1` overlay (debris states, nozzle pos, fps); `?pose=<portrait|landscape>`
  purely informational; `?speed=<x>` time scale.
- `window.game` exposes: `state()` (serializable snapshot of scene/debris/vacuum),
  `input.pointer(x,y,down)` synthetic pointer, `input.replay([...])` scripted
  gestures, `pause()/step(dt)/resume()`, `goto(sceneId)`.
- `dev/` folder: a tiny static server (`node dev/serve.mjs`), and Playwright scripts
  using the preinstalled Chromium (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`;
  never run `playwright install`): `node dev/shot.mjs --scene=X --device=iphone-portrait|iphone-landscape|ipad-portrait|ipad-landscape --gesture=<name> --frames=N`
  produces PNG frame sequences into `dev/out/` so a reviewer can see the
  pre-suction motion frame by frame. A `dev/gestures.mjs` library holds named
  one-finger gestures (approach-slow, approach-fast, hold, rub, circle, pass-by).
- Everything in `dev/` is excluded from the shipped page (nothing in index.html
  depends on it).

## Definition of done for any scene

- Watch the frame sequence at iPhone portrait, iPhone landscape, iPad portrait,
  iPad landscape. The pre-suction reaction must be readable at a glance:
  "the vacuum came closer, so THIS debris did THAT". If it's weak, improve the
  feel itself (timing, overshoot, anticipation, stretch, sound), do not add features.
- Zero text, zero buttons, zero HUD. The dust cup is the only "counter".
- The end of the scene exposes the next target without any UI.
