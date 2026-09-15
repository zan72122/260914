# Testing & local reproduction

Everything below runs headless with SwiftShader; no GPU required.

```bash
npm install
npm run build:test          # dist-test/  (testability layer ON)
npm test                    # the default scenario set  (~45 s)
npm test -- bell:2          # one scenario only         (~16 s)
npm test -- bell:2 reveal:3 --shots
npm run test:full           # the whole 5-house walkthrough in 3 viewports (~9 min)
npm run build               # dist/  (testability layer OFF - this is what ships)
```

`npm test` rebuilds `dist-test/` first, so it always tests the current source.

## Where the testability layer lives, and why you cannot reach it in production

`vite.config.js` replaces `__TESTABLE__` at build time:

| command | `__TESTABLE__` | output | `window.__game` |
|---|---|---|---|
| `npm run dev` | `true` | dev server | yes |
| `npm run build:test` | `true` | `dist-test/` | yes |
| `npm run build` | `false` | `dist/` | **no** (tree-shaken out) |

With `__TESTABLE__` false the whole API object, the `?scenario=` / `?seed=` /
`?speed=` / `?debug=` handling and the console logging are removed by the
bundler — `grep -c __game dist/assets/*.js` returns 0. There is no debug UI on
screen in any build; the game still shows zero text.

## Named scenarios

Open the state that sits **right before** a stage, with everything that stage
needs already true (progress, lit house, bucket contents, doors, resident):

```
dist-test/index.html?scenario=<stage>:<houseIndex>&seed=1
```

Stages: `find`, `walk`, `bell`, `open`, `reveal`, `bucket`, `candy`, `next`,
`ending` (`ending` always uses the last house).

Example: `?scenario=bell:2` = standing on the second house's porch, doorbell
glowing, houses 1 already visited (8 sweets in the bucket), door shut.

A scenario is built by the normal init path (`chain.start()`) plus the normal
state transitions; only the run-up is fast-forwarded. Nothing from a previous
run survives: girl, houses, residents, doors, bells, particles, camera and
event log are all reset first. `window.__game.loadScenario('bell:2')`
reinitialises in place, and `window.__game.ready` says when it is usable. A
page opened with `?scenario=` starts **paused**, so the first observation is
always the same.

## Observing

```js
window.__game.snapshot()   // small JSON, no side effects
window.__game.log(20)      // last 20 ring-buffer entries (cap 200)
window.__game.targetScreen()   // screen position of what the world invites now
```

`snapshot()` returns: `ready`, `stage`, `houseIndex`, `seed`, `frame`, `time`,
`target` (kind + world + screen position of the invited object), `girl`
(position, heading, anim, walking, speed, costume), `bucket` (fill/capacity),
`house` (lit / doorOpen / bellGlow / residentOut for the current house),
`litHouses`, `input.accepted`, `input.lastRejection` (`{reason, detail, frame}`),
`wait` (e.g. `"animating:doorOpen"`, `"walking"`, `"timers:3"`), `restartReady`,
`paused`, `render.calls`.

`log()` entries are `{i, frame, type, state, ...}` with `type` one of
`input` (a tap and what it hit), `state` (transition), `reject` (an input the
chain deliberately ignored, with the reason), `scenario`, `ready`. Nothing is
written per frame.

## Deterministic time

```js
window.__game.pause()
window.__game.step(1/60, 120)                    // 120 fixed steps
window.__game.stepUntil("(s) => s.stage === 'BELL'", 1200)
window.__game.resume()
```

`step()` drives exactly the same `frame(dt)` the real loop uses — chain,
character, world, particles, camera and audio ticks all run for every step.
Only the draw call is skipped for intermediate steps (the last step of a batch
is drawn), because rendering never feeds back into game state.

All gameplay randomness comes from a seeded generator (`src/rng.js`) selected
with `?seed=` (default `1`): street curve, house decoration layout, particle
motion and the procedural textures are identical for a given seed.

**Not deterministic, by design:**

* **Audio** — `src/audio.js` keeps `Math.random()` for cricket/owl timing and
  detune. It never feeds back into game state, and it is silent in tests
  (WebAudio is only unlocked by a real pointer event).
* **Wall-clock frame timing** — the live rAF loop uses real `dt`. Use
  `step()`/`stepUntil()` for reproducible runs; a `?speed=` multiplier
  (test builds only) is available for the slow full walkthrough.
* **`frame`/`time` in a snapshot** taken without pausing first, since a
  stray rAF frame may land before you look. Scenario pages start paused, so
  scenario-based comparisons are exact.
* **Bloom / tone mapping output pixels** — SwiftShader is not bit-identical to
  a GPU, so screenshots are for human review, never for pixel assertions.

Tolerance used by the automated checks: state, house index, girl position,
bucket fill and lit-house set must match **exactly** between two runs with the
same seed and the same number of fixed steps.

## How the checks drive the game

Every check taps the **real input path**: it asks for the screen position of
the invited object (`targetScreen()`), then calls `tapScreen(px, py)`, which
runs the same raycast and the same handlers as a finger on glass. No check
assigns a success state or calls a completion handler directly. `advance()`
exists only to fast-forward the *run-up* inside `loadScenario`, never to make
an assertion pass.

## Files

* `tests/harness.mjs` — static server for `dist-test/`, SwiftShader chromium,
  `openGame` / `snapshot` / `step` / `stepUntil` / `tapInvited` helpers.
* `tests/scenario.spec.mjs` — the cheap per-stage checks (default `npm test`),
  plus reload-isolation and determinism checks.
* `tests/walkthrough.spec.mjs` — the full five-house playthrough, ending and
  restart at 390×844, 844×390 and 820×1180, writing `shots/<viewport>/*.png`.

## Deploying to GitHub Pages

The workflow lives at `docs/deploy/pages.yml` because this checkout cannot push
files under `.github/workflows/`. To enable Pages, copy it into place from a
clone that has the `workflows` permission:

```bash
mkdir -p .github/workflows
cp docs/deploy/pages.yml .github/workflows/pages.yml
git add .github/workflows/pages.yml && git commit -m "Add Pages workflow" && git push
```

Then set **Settings → Pages → Source: GitHub Actions**. The workflow runs
`npm run build` (testability layer OFF) and publishes `dist/`.
