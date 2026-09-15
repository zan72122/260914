# Halloween Night — ひかっているおうちへ

A wordless 3D trick-or-treat game for a four-year-old, played with one finger.
Everything on screen is generated in code: geometry from three.js primitives,
textures from `<canvas>`, sound from WebAudio. No assets, no network, no text.

```bash
npm install
npm run dev        # play it locally
npm run build      # dist/ - what ships
npm test           # fast per-scenario checks
npm run test:full  # the whole playthrough in three viewports (slow)
```

* `docs/DESIGN.md` — the brief this was built to.
* `docs/TESTABILITY.md` — the reproduction/observation requirements.
* `docs/TESTING.md` — how to launch a single scene, read its state, and run the
  checks; also how to install the GitHub Pages workflow from
  `docs/deploy/pages.yml` (it cannot live in `.github/workflows/` in this
  checkout).

## Source map

| file | what it holds |
|---|---|
| `src/main.js` | bootstrap, lights, resize, tap routing, post-processing, test API |
| `src/world.js` | street, sky, moon, fog, lamps, trees, houses, decorations |
| `src/house.js` | house factory: door, doorbell, porch light, lanterns, resident |
| `src/girl.js` | character rig, four costumes, walk/idle/reveal/sit animation |
| `src/chain.js` | FIND→WALK→BELL→OPEN→REVEAL→BUCKET→CANDY→NEXT, ending, attractor |
| `src/toys.js` | thirteen kinds of side interaction |
| `src/camera.js` | orientation-aware follow camera |
| `src/particles.js` | fireflies, leaves, sweets, sparkles, bats, fireworks |
| `src/audio.js` | synthesised ambience, music box and effects |
| `src/textures.js` | every CanvasTexture |
| `src/rng.js` | seeded randomness, so a seed reproduces the world exactly |
