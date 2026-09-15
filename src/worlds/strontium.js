/**
 * strontium.js — ストロンチウム（Sr）: 紅の炎 / 打ち上がる世界 (DESIGN §2.4).
 *
 * The world: a night riverbank. One launch tube leans in the near bank, its mouth an EMPTY
 * star-shaped hole with a pulsing red rim. The sky is pitch black and completely empty — that
 * emptiness is the invitation. Only the moon is reflected in the river. Far away, small
 * silhouettes wait, looking up, and every few seconds one of them glances back at the player.
 *
 * The child: (1) drags — or just taps — the red star seed into the tube (magnetic, generous);
 * (2) the loaded tube starts to tremble, "wanting to be pressed"; (3) LONG-PRESSES it: red light
 * fills the tube from the bottom like a rising water level, a low tone climbs, the tube flexes,
 * the screen trembles; (4) lets go -> launch, a 0.25s hush, then a huge crimson chrysanthemum
 * that fills the screen, droops, and is mirrored in the river while the silhouettes raise
 * their arms. 2-3 shots are allowed, then the camera pulls back to the whole riverbank.
 *
 * Science (§2.4 note): strontium compounds really do make fireworks red — that part is direct.
 * But NO gunpowder, no fuse, no match, no mixing of chemicals is ever depicted: the seed is an
 * abstract "star seed" and firing is "light filling up" and being let go. Nothing here is a
 * procedure a child could imitate.
 *
 * NO TEXT IS EVER DRAWN (no fillText/strokeText anywhere).
 */

import { ELEMENT_BY_ID } from '../core/palette.js';
import { makeHandoff } from '../core/scene.js';
import { clamp, lerp, easeOutCubic, easeInOutCubic, easeOutQuad, damp } from '../core/tween.js';
import {
  glowCircle, radialFlood, withAlpha, lerpColor, star,
  roundRect, cachedLinear, sparkTrail, vignette
} from '../core/draw.js';

const DEF = ELEMENT_BY_ID['strontium'];

/* ------------------------------------------------------------------ world design space
 * Everything below is in the 600x600 core rect (camera 'contain'), y down.
 * 0..HORIZON    : sky (pitch black, empty)
 * HORIZON..WT   : far bank + the waiting silhouettes
 * WT..WB        : the river
 * WB..600       : the near bank, where the tube stands
 */
const HORIZON = 356;
const WT = 380;          // waterline (top of the river)
const WB = 486;          // near shore
const TUBE = {
  bx: 268, by: 572,      // base of the tube
  len: 172,              // length along its axis
  rad: 34,               // half width at the base
  tilt: 0.16             // radians off vertical, leaning right
};
const MOUTH = {
  x: TUBE.bx + Math.sin(TUBE.tilt) * TUBE.len,
  y: TUBE.by - Math.cos(TUBE.tilt) * TUBE.len
};
const SEED_HOME = { x: MOUTH.x + 2, y: MOUTH.y - 62 };
const MOON = { x: 452, y: 424 };

const SHOTS_MAX = 3;          // a 3rd shot is allowed if the child is quick
const SHOTS_ENOUGH = 2;      // ...but after the 2nd flower's embers the world goes home
const QUIET_AFTER_SHOT = 7;  // or this long after the last shot, if the child stops
const HARD_CAP = 30;         // and never longer than this in the world
const HUSH = 0.25;         // §2.4 the held breath before the flower opens
const MIN_MS = 300;
const MAX_MS = 2000;

const RAYS = 56;

/** foreground reeds on the near bank (fixed world positions, portrait mostly) */
const REEDS = [];
for (let i = 0; i < 26; i++) {
  const x = -260 + i * 46 + ((i * 97) % 31);
  REEDS.push({
    x,
    y: 596 + ((i * 53) % 190),
    h: 46 + ((i * 37) % 54),
    lean: (((i * 29) % 11) - 5) * 0.035,
    ph: (i * 1.7) % 6.28
  });
}

/** deterministic-ish per-burst ray spread */
function makeRays(rng, power) {
  const out = [];
  for (let i = 0; i < RAYS; i++) {
    const a = (i / RAYS) * Math.PI * 2 + (rng() - 0.5) * 0.06;
    out.push({
      a,
      v: (820 + rng() * 260) * (0.55 + power * 0.55),
      tail: 0.42 + rng() * 0.14,
      w: 0.7 + rng() * 0.6
    });
  }
  return out;
}

export default {
  id: DEF.id,
  labelJa: DEF.labelJa,
  flameColor: DEF.flameColor,
  glowColor: DEF.glowColor,
  ambient: DEF.ambient,
  sampleShape: DEF.sampleShape,
  spectrum: DEF.spectrum,
  coreFrame: { w: 600, h: 600 },

  createWorld(engine, handoff, finish) {
    const rec = engine.gestures();
    const cam = engine.camera;
    const rng = () => engine.rng.next();

    // ------------------------------------------------------------ state
    let t = 0;
    let phase = 'intro';                // intro | invite | acting | change | complete
    // The pull-back home is a SUB-stage of 'complete', not a phase of its own: once the first
    // flower has opened this world is complete and stays complete until the hearth takes over
    // (a scene that flipped its phase again mid-hand-off would look "unfinished" to QA).
    let leaving = false;
    let W = 0, H = 0, S = 1;
    let X0 = -600, X1 = 1200;          // visible world x-range, refreshed every frame

    let seed = { x: SEED_HOME.x, y: SEED_HOME.y, vx: 0, vy: 0, spin: 0, held: false, fly: null, scale: 0 };
    let loaded = false;
    let loadGlow = 0;                   // 0..1 how lit the loaded tube is
    let idleT = 0;                      // seconds since the last touch
    let nudge = 0;                      // seed "this way" nudge animation

    let charging = false;
    let chargeStart = 0;                // performance.now() of the press
    let fill = 0;                       // 0..1 light level in the tube
    let chargeHandle = null;
    let puff = 0;                       // the tiny "shh" dud puff
    let lastPressMs = 0;                // QA: how long the last press really lasted
    let tremble = 0;                    // tube tremble amplitude 0..1
    let demo = 0;                       // one wordless demonstration of the charge (0..1 clock)

    let shots = 0;
    let spoken = false;
    const flights = [];                 // rising shells
    const bursts = [];                  // open flowers
    let flash = 0;                      // white flash, capped at 0.15 exposure
    let firstShotAt = -1;
    let lastShotAt = -1;
    let lastBurstAt = -1;
    let leaveT = 0;
    let sent = false;
    let camBackAt = -1;                 // when to come back down from the sky

    // silhouettes on the far bank
    const folk = [];

    // camera framing targets
    const FRAME = {
      wide: { x: 300, y: 300, zoom: 1.0, tilt: 0 },
      mid: { x: 300, y: 350, zoom: 1.06, tilt: 5 },
      tube: { x: 300, y: 408, zoom: 1.26, tilt: 13 },   // low, close, looking up at the tube
      sky: { x: 300, y: 196, zoom: 0.95, tilt: 0 },     // tilted up after the shell
      out: { x: 300, y: 300, zoom: 0.46, tilt: 0 }
    };

    /** the two "looking up" frames have to keep the tube thumb-reachable in landscape too */
    function reframe() {
      const portrait = engine.isPortrait;
      FRAME.tube.y = portrait ? 408 : 384;
      FRAME.tube.zoom = portrait ? 1.26 : 1.12;
      FRAME.sky.y = portrait ? 190 : 252;
      FRAME.sky.zoom = portrait ? 0.95 : 0.82;
      FRAME.mid.y = portrait ? 350 : 336;
      FRAME.mid.zoom = portrait ? 1.06 : 1.0;
    }

    // ------------------------------------------------------------ helpers
    const w2s = (x, y) => cam.worldToScreen(x, y);
    const s2w = (x, y) => cam.screenToWorld(x, y);

    function tubeAxis() {
      const tilt = TUBE.tilt + trembleAngle();
      const len = TUBE.len * (1 - fill * 0.045);
      const bx = TUBE.bx, by = TUBE.by;
      return {
        bx, by, tilt, len,
        mx: bx + Math.sin(tilt) * len,
        my: by - Math.cos(tilt) * len
      };
    }

    function trembleAngle() {
      if (tremble <= 0) return 0;
      return Math.sin(t * 34) * 0.012 * tremble + Math.sin(t * 19.3) * 0.006 * tremble;
    }

    /** distance (screen px) from p to the tube's axis segment */
    function tubeDist(p) {
      const ax = tubeAxis();
      const a = w2s(ax.bx, ax.by), b = w2s(ax.mx, ax.my);
      const vx = b.x - a.x, vy = b.y - a.y;
      const L2 = vx * vx + vy * vy || 1;
      let k = ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2;
      k = clamp(k, 0, 1);
      return Math.hypot(p.x - (a.x + vx * k), p.y - (a.y + vy * k));
    }

    const hitTube = (p) => tubeDist(p) < S * 0.19;
    const hitSeed = (p) => {
      const s = w2s(seed.x, seed.y);
      return Math.hypot(p.x - s.x, p.y - s.y) < S * 0.17;
    };

    function frameTo(f, dur) {
      cam.panTo(f.x, f.y, dur, 'easeInOutCubic');
      cam.zoomTo(f.zoom, dur, 'easeOutCubic');
      cam.tiltTo(f.tilt, dur, 'easeInOutCubic');
    }

    // ------------------------------------------------------------ actions

    function loadSeed(instant) {
      if (loaded) return;
      loaded = true;
      phase = 'acting';
      seed.held = false;
      seed.fly = instant ? null : { t: 0, dur: 0.42, fx: seed.x, fy: seed.y };
      if (instant) { seed.x = MOUTH.x; seed.y = MOUTH.y; }
      idleT = 0;
      engine.audio.play('snap');
      demo = 0.001;                       // show the light rising once: "this is what pressing does"
      dragH.enabled = false;
      tapH.enabled = false;
      pressH.enabled = true;
      frameTo(FRAME.tube, 1.0);
    }

    function startCharge() {
      if (!loaded || leaving || charging) return;
      charging = true;
      chargeStart = performance.now();
      fill = 0;
      idleT = 0;
      if (!chargeHandle) chargeHandle = engine.audio.play('charge', { f0: 84, f1: 520 });
    }

    function stopCharge() {
      charging = false;
      if (chargeHandle) { chargeHandle.stop(); chargeHandle = null; }
    }

    /** a press shorter than 300ms: a tiny "shh" — an invitation, never a failure */
    function dud() {
      stopCharge();
      fill = 0;
      puff = 1;
      engine.audio.play('whoosh');
      const m = w2s(MOUTH.x, MOUTH.y);
      engine.particles.burst(m.x, m.y, 8, {
        speed: [20, 70], life: [0.25, 0.5], r: [1.2, 2.4], spread: 1.1, angle: -Math.PI / 2 + TUBE.tilt,
        color: [withAlpha('#ffffff', 0.9), DEF.glowColor], drag: 0.88, gravity: 40
      });
    }

    /** RELEASE -> launch. power 0..1 drives the size of the flower. */
    function launch(power) {
      stopCharge();
      if (leaving || shots >= SHOTS_MAX) { fill = 0; return; }
      const p = clamp(power, 0, 1);
      const ax = tubeAxis();
      flights.push({
        t: 0,
        dur: 0.62 + p * 0.16,
        power: p,
        x: ax.mx, y: ax.my,
        x0: ax.mx, y0: ax.my,
        apexX: 300 + (rng() - 0.5) * 34,
        apexY: 150 - p * 42,
        trail: [],
        hush: false
      });
      shots++;
      if (firstShotAt < 0) firstShotAt = t;
      lastShotAt = t;
      fill = 0;
      phase = phase === 'complete' ? 'complete' : 'change';
      engine.audio.play('launch');
      frameTo(FRAME.sky, 0.5);
    }

    function bloom(fl) {
      const b = {
        x: fl.apexX, y: fl.apexY, t: 0, power: fl.power,
        rays: makeRays(rng, fl.power),
        R: 150 + fl.power * 135
      };
      bursts.push(b);
      lastBurstAt = t;
      flash = 1;
      cam.shake(0.012, 0.5);
      engine.audio.play('burst');
      if (!spoken) {
        spoken = true;
        engine.audio.speakElement(DEF.id);       // §2.4 the name, once, as the flower opens
      }
      phase = 'complete';
      for (const f of folk) f.cheer = 1;
      camBackAt = t + 1.9;                         // stay looking up while the flower is open

      // falling embers live in screen space so they survive the return handoff
      const c = w2s(b.x, b.y);
      engine.particles.burst(c.x, c.y, 26, {
        speed: [80, 320 * (0.6 + b.power * 0.6)], life: [1.1, 2.0], r: [1, 2.1],
        color: [DEF.flameColor, DEF.glowColor, '#ffd9dd'], drag: 0.9, gravity: 130,
        shape: 'dot', glow: false
      });
    }

    // ------------------------------------------------------------ gestures
    // r is an S-ratio: the seed only floats ~0.13*S above the mouth, so this snaps after a
    // short, deliberate pull — generous, but the child still feels they carried it there.
    const snapT = { x: 0, y: 0, r: 0.13 };

    const dragH = rec.onDrag(hitSeed, {
      onStart: () => { seed.held = true; seed.fly = null; idleT = 0; engine.audio.play('pick'); },
      onMove: (p) => {
        const wp = s2w(p.x, p.y);
        seed.x = wp.x; seed.y = wp.y;
        idleT = 0;
      },
      onEnd: (p, info) => {
        seed.held = false;
        if (info && info.snapped) { loadSeed(false); return; }
        const m = w2s(MOUTH.x, MOUTH.y);
        if (Math.hypot(p.x - m.x, p.y - m.y) < S * 0.30) loadSeed(false);
        // otherwise the seed simply stays where it was let go and drifts home. Never lost.
      }
    }, { snapTargets: [snapT], snapOnEnter: true, hitPaddingRatio: 0.8, returnOnRelease: false });

    // a 4-year-old taps before they drag: tapping the seed OR the empty tube calls it in
    const tapH = rec.onTap((p) => hitSeed(p) || hitTube(p), () => {
      if (loaded) return;
      seed.held = false;
      seed.fly = { t: 0, dur: 0.7, fx: seed.x, fy: seed.y };
      engine.audio.play('pick');
      idleT = 0;
    }, { maxMoveRatio: 0.09, maxDurationMs: 700 });

    const pressH = rec.onLongPress(hitTube, {
      onStart: () => startCharge(),
      onHold: () => { /* fill is integrated in update() from the real clock */ },
      onRelease: (t01, p, auto) => {
        const held = performance.now() - chargeStart;
        lastPressMs = Math.round(held);
        launch(clamp(held / MAX_MS, 0.12, 1));
      },
      onCancel: () => {
        const held = performance.now() - chargeStart;
        if (charging) lastPressMs = Math.round(held);
        // generous: a finger that wandered off after a real hold still fires (§0.4)
        if (charging && held >= MIN_MS) launch(clamp(held / MAX_MS, 0.12, 1));
        else if (charging) dud();
        else stopCharge();
      }
    }, { minMs: MIN_MS, maxMs: MAX_MS, moveToleranceRatio: 0.25 });
    pressH.enabled = false;

    // ------------------------------------------------------------ scene

    const scene = {
      id: DEF.id,

      layout(w, h) {
        W = w; H = h; S = Math.min(w, h);
        reframe();
        cam.setFrame({ coreW: 600, coreH: 600, mode: 'contain' });
        const f = phase === 'intro' || phase === 'invite' ? FRAME.wide
          : leaving ? FRAME.out
            : loaded && shots === 0 ? FRAME.tube : FRAME.wide;
        cam.x = f.x; cam.y = f.y; cam.zoom = f.zoom;
        cam.recompute();

        if (!folk.length) {
          const spots = [0.13, 0.22, 0.30, 0.71, 0.80, 0.88];
          for (let i = 0; i < spots.length; i++) {
            folk.push({
              x: 40 + spots[i] * 520,
              h: 30 + (i % 3) * 5,
              t: i * 1.7,
              glance: 0,
              nextGlance: 2.2 + i * 1.3,
              cheer: 0
            });
          }
        }
      },

      enter() {
        if (handoff && handoff.particles) engine.particles.inject(handoff.particles);
        const o = (handoff && handoff.origin) || { x: engine.width / 2, y: engine.height * 0.4 };
        const wp = s2w(o.x, o.y);
        seed.x = wp.x; seed.y = wp.y;
        seed.scale = 0;
        seed.fly = { t: 0, dur: 1.0, fx: wp.x, fy: wp.y, home: true };
        cam.x = FRAME.wide.x; cam.y = FRAME.wide.y;
        cam.zoom = 1.14; cam.tiltTo(0, 0);
        cam.zoomTo(FRAME.wide.zoom, 1.6, 'easeOutCubic');
        phase = 'intro';
      },

      exit() {
        stopCharge();
        rec.destroy();
        cam.shakeX = cam.shakeY = 0;
      },

      // ---------------------------------------------------------- update
      update(dt) {
        t += dt;
        idleT += dt;

        if (phase === 'intro' && t > 1.1) phase = 'invite';

        // ---- the seed
        seed.spin += dt * (seed.held ? 1.6 : 0.9);
        seed.scale = lerp(seed.scale, 1, damp(0.86, dt));
        if (seed.fly) {
          const f = seed.fly;
          f.t += dt;
          const k = easeInOutCubic(clamp(f.t / f.dur));
          const tx = f.home ? SEED_HOME.x : MOUTH.x;
          const ty = f.home ? SEED_HOME.y : MOUTH.y;
          seed.x = lerp(f.fx, tx, k);
          seed.y = lerp(f.fy, ty, k);
          if (f.t >= f.dur) {
            seed.fly = null;
            if (!f.home && !loaded) loadSeed(true);
          }
        } else if (!loaded && !seed.held) {
          // always drifts back home, and leans toward the mouth every couple of seconds
          const k = damp(0.94, dt);
          seed.x = lerp(seed.x, SEED_HOME.x, k);
          seed.y = lerp(seed.y, SEED_HOME.y + Math.sin(t * 1.5) * 5, k);
        }

        // wordless "this way": a small nudge toward the hole, again and again
        if (phase === 'invite' && !loaded && !seed.held && !seed.fly) {
          nudge = Math.max(0, Math.sin((idleT % 2.6) / 2.6 * Math.PI * 2)) * clamp((idleT - 1.4) / 1.2);
          if (idleT > 14) { seed.fly = { t: 0, dur: 1.1, fx: seed.x, fy: seed.y }; }
        } else nudge = 0;

        // ---- magnetic snap target follows the mouth on screen
        const ms = w2s(MOUTH.x, MOUTH.y);
        snapT.x = ms.x; snapT.y = ms.y;

        // ---- the loaded tube wants to be pressed
        const wantPress = loaded && !leaving && !charging;
        tremble = lerp(tremble, wantPress ? 0.55 + 0.45 * clamp(idleT / 3) : (charging ? 0.35 + fill * 0.9 : 0), damp(0.9, dt));
        loadGlow = lerp(loadGlow, loaded ? 1 : 0, damp(0.9, dt));

        // ---- one silent demonstration right after loading: the light rises to ~30% and sinks
        if (demo > 0 && !charging) {
          demo += dt / 0.6;
          if (demo >= 1) { demo = 0; fill = 0; }
          else fill = 0.3 * Math.sin(clamp(demo) * Math.PI);
        }

        // ---- charging: the light rises like a water level
        if (charging) {
          idleT = 0;
          const held = performance.now() - chargeStart;
          fill = clamp(held / MAX_MS);
          demo = 0;
          if (chargeHandle) chargeHandle.setLevel(0.1 + fill * 0.9);
          // the screen itself starts to tremble, faintly
          const a = S * 0.0022 * fill * fill;
          cam.shakeX = (rng() - 0.5) * 2 * a;
          cam.shakeY = (rng() - 0.5) * 2 * a;
          if (rng() < 0.5) {
            const b = w2s(TUBE.bx, TUBE.by - 10);
            engine.particles.emit({
              x: b.x + (rng() - 0.5) * S * 0.05, y: b.y,
              vx: (rng() - 0.5) * 20, vy: -30 - rng() * 60 * fill,
              r: 1 + rng() * 1.6, life: 0.4 + rng() * 0.5,
              color: DEF.glowColor, drag: 0.92, gravity: -10
            });
          }
        } else if (!cam._shake) { cam.shakeX = 0; cam.shakeY = 0; }

        if (puff > 0) puff = Math.max(0, puff - dt * 2.4);
        if (flash > 0) flash = Math.max(0, flash - dt * 2.6);

        // ---- shells in flight
        for (let i = flights.length - 1; i >= 0; i--) {
          const f = flights[i];
          f.t += dt;
          const k = clamp(f.t / f.dur);
          const e = easeOutQuad(k);
          f.x = lerp(f.x0, f.apexX, e);
          f.y = lerp(f.y0, f.apexY, e);
          if (k < 1) {
            f.trail.unshift({ x: f.x, y: f.y });
            if (f.trail.length > 16) f.trail.pop();
          } else {
            f.trail.pop();                                  // the 0.25s hush: silence + hold
            if (f.t >= f.dur + HUSH) { bloom(f); flights.splice(i, 1); }
          }
        }

        // ---- open flowers
        for (let i = bursts.length - 1; i >= 0; i--) {
          const b = bursts[i];
          b.t += dt;
          if (b.t > 3.6) bursts.splice(i, 1);
        }

        // ---- the people on the far bank
        for (const p of folk) {
          p.t += dt;
          if (p.cheer > 0) p.cheer = Math.max(0, p.cheer - dt * 0.42);
          else {
            p.nextGlance -= dt;
            if (p.nextGlance <= 0 && p.glance <= 0) { p.glance = 1.2; p.nextGlance = 4 + rng() * 5; }
          }
          if (p.glance > 0) p.glance = Math.max(0, p.glance - dt);
        }

        // ---- after the flower has hung in the sky for a moment, look back down at the tube
        if (camBackAt > 0 && t >= camBackAt) {
          camBackAt = -1;
          if (!leaving) frameTo(shots >= SHOTS_ENOUGH ? FRAME.wide : FRAME.mid, 1.2);
        }

        // ---- when to go home (§1.7)
        // never take the world away while the child is still touching it (idleT guard)
        if (phase === 'complete' && !leaving && idleT > 2.5) {
          const doneShots = shots >= SHOTS_ENOUGH && lastBurstAt > 0 && t - lastBurstAt > 2.6
            && bursts.length === 0;
          const tired = shots > 0 && t - lastShotAt > QUIET_AFTER_SHOT && !charging;
          const capped = shots > 0 && t > HARD_CAP && !charging;
          if (doneShots || tired || capped) {
            leaving = true;
            leaveT = 0;
            pressH.enabled = false;
            stopCharge();
            cam.stopTweens();
            frameTo(FRAME.out, 1.5);
          }
        }

        if (leaving) {
          leaveT += dt;
          if (leaveT > 1.45 && !sent) {
            sent = true;
            const c = w2s(300, 320);
            const anchor = engine.isPortrait
              ? { x: W * 0.5, y: H * 0.635 }
              : { x: W * 0.085, y: H * 0.5 };
            finish({
              worldId: DEF.id,
              completed: true,
              shelfAnchorHint: anchor,
              returnHandoff: makeHandoff({
                elementId: DEF.id,
                flameColor: DEF.flameColor,
                glowColor: DEF.glowColor,
                ambient: DEF.ambient,
                origin: { x: c.x, y: c.y },
                particles: engine.particles.snapshot(),
                cameraZoom: cam.zoom
              })
            });
          }
        }

        // ---- nobody pressed for a long time: the tube can't hold it in any more
        if (loaded && !charging && phase === 'acting' && idleT > 18) {
          launch(0.62);
        }
      },

      // ---------------------------------------------------------- draw
      draw(g) {
        const w = engine.width, h = engine.height;
        // fade in across the 1.2s handoff overlap (scene.js sets progress=1 for a direct jump)
        const p = handoff ? clamp(handoff.progress) : 1;
        const amb = lerpColor(handoff ? handoff.flameColor : DEF.ambient, DEF.ambient, clamp(t / 1.5));

        g.save();
        g.globalAlpha = p;

        // the night itself
        g.fillStyle = '#080b1c';
        g.fillRect(0, 0, w, h);

        const vr = cam.viewRect;
        X0 = vr.x - 60; X1 = vr.x + vr.w + 60;

        cam.apply(g);
        drawSky(g);
        // the flowers hang in the SKY: the bank and the river occlude anything that droops
        // below the horizon, and the water shows it again as a reflection
        for (const b of bursts) drawBurst(g, b, false);
        drawFarBank(g);
        drawRiver(g);
        drawNearBank(g);
        for (const f of folk) drawPerson(g, f);
        drawTube(g);
        if (!loaded) drawSeed(g);
        for (const f of flights) drawFlight(g, f);
        cam.restore(g);

        // the flood of flame colour we arrived in, settling into this world's light
        if (t < 2.2) {
          const o = (handoff && handoff.origin) || { x: w * 0.5, y: h * 0.4 };
          const k = clamp(1 - t / 2.2);
          radialFlood(g, o.x, o.y, Math.max(w, h) * (0.35 + k * 0.85), amb, 0.5 * k * k * p);
        }

        // soft white flash — capped at 15% exposure, never a hard strobe (§2.4)
        if (flash > 0) {
          g.globalAlpha = p * 0.15 * easeOutCubic(flash);
          g.fillStyle = '#fff4f4';
          g.fillRect(0, 0, w, h);
          g.globalAlpha = p;
        }

        vignette(g, w, h, 0.20, '#01030c');
        g.restore();
      },

      // ---------------------------------------------------------- QA hooks
      debugState() {
        return {
          phase,
          leaving,
          shots,
          loaded,
          charging,
          fill: Math.round(fill * 100) / 100,
          lastPressMs,
          bursts: bursts.length,
          elementId: DEF.id
        };
      },

      hitPoints() {
        const out = [];
        // the star seed: floating and grabbable until it is loaded; once loaded it sits in
        // the mouth of the tube, where touching it charges the tube.
        const sp = loaded ? w2s(MOUTH.x, MOUTH.y) : w2s(seed.x, seed.y);
        const sc = engine.clampSafe(sp.x, sp.y, 0);
        out.push({ id: 'seed', x: sc.x, y: sc.y, r: S * 0.17 });
        if (!leaving) {
          const ax = tubeAxis();
          const tp = w2s((ax.bx + ax.mx) / 2, (ax.by + ax.my) / 2);
          const tc = engine.clampSafe(tp.x, tp.y, 0);
          out.push({ id: 'tube', x: tc.x, y: tc.y, r: S * 0.19 });
        }
        return out;
      },

      complete() {
        if (!loaded) loadSeed(true);
        if (shots === 0) launch(0.9);
        firstShotAt = t - 60;                      // go home as soon as the flower has opened
        lastShotAt = t - 60;
      },

      onPointerDown(p) { idleT = 0; rec.down(p); },
      onPointerMove(p) { idleT = 0; rec.move(p); },
      onPointerUp(p) { rec.up(p); }
    };

    /* ================================================================ drawing */

    function drawSky(g) {
      // pitch black, and completely empty: the emptiness is the invitation
      const grad = cachedLinear(g, 'sr-sky', 0, -300, 0, HORIZON, [
        [0, '#01020a'], [0.55, '#070c22'], [0.86, '#141b40'], [1, '#2a3566']
      ]);
      g.fillStyle = grad;
      g.fillRect(X0, -2200, X1 - X0, HORIZON + 2200);
      // moonlight haze sitting on the horizon — the sky above it stays empty
      glowCircle(g, MOON.x, HORIZON + 8, 400, '#9fb6ee', 0.16);
      glowCircle(g, MOON.x, HORIZON + 3, 170, '#cfdcff', 0.13);
    }

    function drawFarBank(g) {
      g.save();
      g.beginPath();
      g.moveTo(X0, WT);
      g.lineTo(X0, HORIZON + 8);
      for (let x = X0; x <= X1; x += 80) {
        const y = HORIZON + 6 + Math.sin(x * 0.011) * 5 + Math.cos(x * 0.023) * 3;
        g.lineTo(x, y);
      }
      g.lineTo(X1, WT);
      g.closePath();
      g.fillStyle = '#141b3c';
      g.fill();
      // a moon-rim on the far shore so the little people read as shapes
      g.strokeStyle = withAlpha('#c3d3f6', 0.55);
      g.lineWidth = 2.6;
      g.stroke();
      g.restore();
    }

    function drawRiver(g) {
      const grad = cachedLinear(g, 'sr-river', 0, WT, 0, WB + 30, [
        [0, '#43538f'], [0.35, '#2f3d72'], [0.8, '#222c56'], [1, '#182043']
      ]);
      g.fillStyle = grad;
      g.fillRect(X0, WT, X1 - X0, 2200);

      // slow sheen lines, so the water reads as water
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.lineWidth = 2.8;
      for (let i = 0; i < 5; i++) {
        const yy0 = WT + 12 + i * 21;
        g.strokeStyle = withAlpha('#b3c4f2', 0.20 - i * 0.025);
        g.beginPath();
        for (let x = X0; x <= X1; x += 26) {
          const yy = yy0 + Math.sin(x * 0.02 + t * (0.5 + i * 0.16) + i) * (2 + i);
          if (x === X0) g.moveTo(x, yy); else g.lineTo(x, yy);
        }
        g.stroke();
      }
      g.restore();

      // the moon, reflected — the only thing in the water before the first firework
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const k = i / 6;
        const y = MOON.y + k * 52;
        const wob = Math.sin(t * 1.1 + i * 1.7) * (5 + k * 12);
        const a = (1 - k * 0.72) * 0.75;
        g.fillStyle = withAlpha('#eef3ff', a);
        g.beginPath();
        g.ellipse(MOON.x + wob, y, 19 - k * 5 + Math.sin(t * 0.8 + i) * 2, 2.6 - k * 0.8, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();

      // reflections of whatever is burning in the sky
      g.save();
      g.beginPath();
      g.rect(X0, WT, X1 - X0, WB - WT + 20);
      g.clip();
      g.globalAlpha *= 0.34;
      for (const b of bursts) drawBurst(g, b, true);
      for (const f of flights) {
        const y = WT + (WT - f.y) * 0.34;
        glowCircle(g, f.x, y, 22, DEF.glowColor, 0.5);
      }
      g.restore();
    }

    function drawNearBank(g) {
      g.save();
      g.beginPath();
      g.moveTo(X0, 2200);
      g.lineTo(X0, WB + 10);
      for (let x = X0; x <= X1; x += 60) {
        g.lineTo(x, WB + Math.sin(x * 0.016 + 1.2) * 6 + Math.cos(x * 0.031) * 3);
      }
      g.lineTo(X1, 2200);
      g.closePath();
      g.fillStyle = '#2d2338';
      g.fill();
      g.strokeStyle = withAlpha(DEF.glowColor, 0.20 + loadGlow * 0.16);
      g.lineWidth = 3;
      g.stroke();
      g.restore();
      // the tube's own light pooling on the ground
      const pool = 0.22 + loadGlow * 0.26 + fill * 0.5;
      glowCircle(g, TUBE.bx, TUBE.by + 8, 150 + fill * 80, DEF.flameColor, pool * 0.6);

      // reeds in the near foreground, rimmed by the tube's red light
      g.save();
      g.lineCap = 'round';
      for (const r of REEDS) {
        if (r.x < X0 - 60 || r.x > X1 + 60) continue;
        const sway = Math.sin(t * 0.9 + r.ph) * 0.05 + r.lean;
        for (let k = -1; k <= 1; k++) {
          const bx = r.x + k * 7;
          const h = r.h * (1 - Math.abs(k) * 0.26);
          const a = sway + k * 0.22;
          const tipX = bx + Math.sin(a) * h;
          const tipY = r.y - Math.cos(a) * h;
          g.beginPath();
          g.moveTo(bx, r.y);
          g.quadraticCurveTo(bx + (tipX - bx) * 0.25, r.y - h * 0.62, tipX, tipY);
          g.lineWidth = 8;
          g.strokeStyle = '#1a1329';
          g.stroke();
          g.lineWidth = 2.2;
          g.strokeStyle = withAlpha(DEF.glowColor, 0.16 + fill * 0.14);
          g.stroke();
        }
      }
      g.restore();
    }

    function drawPerson(g, pr) {
      const bob = Math.sin(pr.t * 1.4) * 1.2;
      const cheer = pr.cheer > 0 ? easeOutCubic(clamp(pr.cheer / 0.4)) : 0;
      const hop = cheer * Math.abs(Math.sin(pr.t * 7)) * 5;
      const x = pr.x, y = WT - 1 - hop + bob * 0.4;
      const hh = pr.h;
      const glance = pr.glance > 0 ? clamp(pr.glance / 0.6) : 0;

      g.save();
      // body: a soft rounded silhouette
      g.fillStyle = '#0a0f22';
      g.beginPath();
      g.moveTo(x - hh * 0.22, y);
      g.quadraticCurveTo(x - hh * 0.26, y - hh * 0.56, x, y - hh * 0.6);
      g.quadraticCurveTo(x + hh * 0.26, y - hh * 0.56, x + hh * 0.22, y);
      g.closePath();
      g.fill();
      // head, tipped back to look up (or turned to us when glancing)
      const tip = lerp(-0.16, 0.02, glance);
      const hx = x + Math.sin(tip) * hh * 0.1;
      const hy = y - hh * 0.72;
      g.beginPath();
      g.arc(hx, hy, hh * 0.19, 0, Math.PI * 2);
      g.fill();
      // arms: down while waiting, straight up when the flower opens
      g.strokeStyle = '#0a0f22';
      g.lineWidth = hh * 0.11;
      g.lineCap = 'round';
      for (const s of [-1, 1]) {
        const ax = x + s * hh * 0.2;
        const ay = y - hh * 0.46;
        g.beginPath();
        g.moveTo(ax, ay);
        if (cheer > 0) g.lineTo(ax + s * hh * 0.22 * cheer, ay - hh * (0.2 + 0.38 * cheer));
        else g.lineTo(ax + s * hh * 0.1, ay + hh * 0.3);
        g.stroke();
      }
      // rim light + two pale eyes only when they glance back at us (gaze guidance)
      if (glance > 0) {
        g.fillStyle = withAlpha('#d8e4ff', 0.55 * glance);
        for (const s of [-1, 1]) {
          g.beginPath();
          g.arc(hx + s * hh * 0.075, hy - hh * 0.02, hh * 0.035, 0, Math.PI * 2);
          g.fill();
        }
      }
      // a soft reflection of each figure in the water
      g.globalAlpha = 0.22;
      g.fillStyle = '#16204a';
      g.beginPath();
      g.ellipse(x, WT + hh * 0.34, hh * 0.2, hh * 0.32, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    /**
     * A firework MORTAR, not a battery (review round 1, problem T): a paper/bamboo tube,
     * warm red-brown, visibly tapered (wide at the foot, narrower at the mouth), half sunk
     * into the bank with a wooden wedge, wrapped with twine instead of metal bands.
     */
    function drawTube(g) {
      const ax = tubeAxis();
      const flex = fill * 0.05;
      g.save();
      g.translate(ax.bx, ax.by);
      g.rotate(ax.tilt);

      const rBase = TUBE.rad * 1.13 * (1 + flex * 0.5);   // wide foot
      const rTop = TUBE.rad * 0.88;                       // narrower mouth
      const len = ax.len;

      // the earth it is planted in, plus a wooden wedge on the low side
      g.fillStyle = '#2b2030';
      g.beginPath();
      g.ellipse(0, 6, rBase * 2.3, rBase * 0.86, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#4a3222';
      g.beginPath();
      g.moveTo(-rBase * 1.9, 4);
      g.lineTo(-rBase * 0.75, -len * 0.30);
      g.lineTo(-rBase * 0.3, -len * 0.26);
      g.lineTo(-rBase * 1.15, 6);
      g.closePath();
      g.fill();

      // ---- body: a tapered paper tube
      const body = () => {
        g.beginPath();
        g.moveTo(-rBase, 12);
        g.lineTo(-rTop, -len + rTop * 0.5);
        g.quadraticCurveTo(-rTop, -len, 0, -len);
        g.quadraticCurveTo(rTop, -len, rTop, -len + rTop * 0.5);
        g.lineTo(rBase, 12);
        g.quadraticCurveTo(0, 20, -rBase, 12);
        g.closePath();
      };
      body();
      g.fillStyle = '#8a4a2e';
      g.fill();

      // the red light filling it from the bottom, like a rising water level (no marks)
      if (fill > 0.001 || loadGlow > 0.01) {
        g.save();
        body();
        g.clip();
        const level = -len * (0.06 + fill * 0.94);
        const gr = cachedLinear(g, 'sr-fill', 0, 10, 0, -TUBE.len, [
          [0, withAlpha('#fff0f2', 0.95)],
          [0.25, DEF.glowColor],
          [1, DEF.flameColor]
        ]);
        g.globalAlpha = (0.30 + fill * 0.70) * Math.min(1, 0.25 + fill * 3);
        g.fillStyle = gr;
        g.fillRect(-rBase, level, rBase * 2, 20 - level);
        if (fill > 0.02) {
          // the meniscus — the top of the rising light (no marks, no gauge)
          g.globalAlpha = 0.9;
          g.fillStyle = withAlpha('#ffe9ec', 0.9);
          g.beginPath();
          g.ellipse(0, level, rBase * 0.9, rBase * 0.28, 0, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();
        glowCircle(g, 0, level, rBase * (2.0 + fill * 2.4), DEF.flameColor, 0.35 + fill * 0.5);
      }

      // paper grain + rounding, clipped to the body
      g.save();
      body();
      g.clip();
      g.fillStyle = withAlpha('#d98a5c', 0.34);           // moonlit side
      g.fillRect(-rBase, -len - 4, rBase * 0.44, len + 30);
      g.fillStyle = withAlpha('#2a0f08', 0.40);           // shadow side
      g.fillRect(rTop * 0.55, -len - 4, rBase, len + 30);
      g.strokeStyle = withAlpha('#5c2a15', 0.45);         // rolled-paper seams
      g.lineWidth = 2;
      for (let i = -2; i <= 2; i++) {
        const x0 = i * rBase * 0.36;
        g.beginPath();
        g.moveTo(x0 * 1.12, 16);
        g.lineTo(x0 * 0.82, -len);
        g.stroke();
      }
      g.restore();

      // twine wrapped twice around it (a made, tied object — not machinery)
      for (const [yy, wob] of [[-len * 0.26, 1], [-len * 0.60, -1]]) {
        const rr = lerp(rBase, rTop, clamp(-yy / len));
        g.strokeStyle = '#c9a26a';
        g.lineWidth = 6;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(-rr * 1.06, yy);
        g.quadraticCurveTo(0, yy + 5 * wob, rr * 1.06, yy - 2);
        g.stroke();
        g.strokeStyle = withAlpha('#6b4a22', 0.55);
        g.lineWidth = 2;
        g.stroke();
      }

      // ---- the mouth: an EMPTY star-shaped hole with a pulsing red rim
      const mouthR = rTop * 0.98;
      g.save();
      g.translate(0, -len);
      g.scale(1, 0.52);                       // looking at it from below -> an ellipse
      g.fillStyle = '#e0a074';                // the cut paper rim of the mouth
      g.beginPath();
      g.arc(0, 0, mouthR * 1.1, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3a1b12';
      g.beginPath();
      g.arc(0, 0, mouthR, 0, Math.PI * 2);
      g.fill();

      const pulse = 0.5 + 0.5 * Math.sin(t * 3.1);
      const rot = -Math.PI / 2 + (loaded ? 0 : t * 0.5);
      if (!loaded) {
        // the hole itself, exactly the shape of the seed
        g.fillStyle = '#0a0406';
        star(g, 0, 0, mouthR * 0.84, mouthR * 0.37, 5, rot);
        g.fill();
        g.lineJoin = 'round';
        g.lineWidth = mouthR * 0.17;
        g.strokeStyle = withAlpha(DEF.flameColor, 0.6 + pulse * 0.4 + nudge * 0.3);
        star(g, 0, 0, mouthR * 0.84, mouthR * 0.37, 5, rot);
        g.stroke();
      } else {
        // the seed is inside: the star now glows
        g.fillStyle = withAlpha(lerpColor(DEF.flameColor, '#fff0f0', 0.25 + fill * 0.6), 0.95);
        star(g, 0, 0, mouthR * (0.84 + fill * 0.12), mouthR * 0.37, 5, rot);
        g.fill();
      }
      g.restore();

      // the glow that lives in the mouth
      const mg = (loaded ? 0.5 + fill * 0.9 : 0.35 + pulse * 0.35);
      glowCircle(g, 0, -len, mouthR * (1.9 + fill * 2.4), loaded ? DEF.flameColor : DEF.glowColor, mg);

      // the little "shh" puff of a too-short press: no failure, just an invitation
      if (puff > 0) {
        const k = 1 - puff;
        g.save();
        g.globalAlpha *= puff * 0.5;
        g.fillStyle = withAlpha('#ffffff', 0.5);
        g.beginPath();
        g.ellipse(0, -len - 18 - k * 34, 10 + k * 26, 7 + k * 18, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }

      g.restore();
    }

    function drawSeed(g) {
      const nx = nudge * (MOUTH.x - seed.x) * 0.16;
      const ny = nudge * (MOUTH.y - seed.y) * 0.16;
      const x = seed.x + nx, y = seed.y + ny;
      const r = 34 * seed.scale * (seed.held ? 1.12 : 1) * (1 + Math.sin(t * 2.4) * 0.04);
      if (r <= 0.2) return;

      glowCircle(g, x, y, r * 2.8, DEF.flameColor, 0.5);
      // body of the star seed
      g.save();
      g.translate(x, y);
      g.rotate(seed.spin);
      g.fillStyle = withAlpha(DEF.flameColor, 0.98);
      star(g, 0, 0, r, r * 0.44, 5, -Math.PI / 2);
      g.fill();
      // red swirling inside
      g.save();
      star(g, 0, 0, r * 0.95, r * 0.42, 5, -Math.PI / 2);
      g.clip();
      for (let i = 0; i < 3; i++) {
        const a = t * (1.5 + i * 0.5) + i * 2.1;
        const rr = r * (0.26 + i * 0.16);
        g.fillStyle = withAlpha(i === 0 ? '#fff0f0' : DEF.glowColor, 0.5 - i * 0.12);
        g.beginPath();
        g.ellipse(Math.cos(a) * rr * 0.5, Math.sin(a) * rr * 0.5, rr, rr * 0.62, a, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      // a crisp rim so the star shape reads against the black sky
      g.lineJoin = 'round';
      g.lineWidth = r * 0.11;
      g.strokeStyle = withAlpha('#ff97a6', 0.95);
      star(g, 0, 0, r, r * 0.44, 5, -Math.PI / 2);
      g.stroke();
      // one clean highlight
      g.fillStyle = withAlpha('#ffffff', 0.8);
      g.beginPath();
      g.arc(-r * 0.2, -r * 0.26, r * 0.12, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    function drawFlight(g, f) {
      const hush = f.t >= f.dur;
      if (f.trail.length > 1) sparkTrail(g, f.trail, 5.5, DEF.flameColor, hush ? 0.35 : 0.9);
      const r = hush ? 5 : 7;
      glowCircle(g, f.x, f.y, r * (hush ? 3.4 : 5), hush ? '#ffe2e6' : DEF.glowColor, hush ? 0.7 : 0.95);
      g.fillStyle = '#fff2f4';
      g.beginPath();
      g.arc(f.x, f.y, r * 0.55, 0, Math.PI * 2);
      g.fill();
    }

    /** the chrysanthemum: one point -> a sphere of rays that droop as they fall */
    function drawBurst(g, b, mirror) {
      const bt = b.t;
      const open = clamp(bt / 0.32);
      // while the world shrinks into the shelf the flowers bow out fast (only embers remain)
      const fade = clamp(1 - (bt - 1.5) / 2.0) * (leaving ? clamp(1 - leaveT / 0.35) : 1);
      if (fade <= 0) return;

      g.save();
      if (mirror) {
        g.translate(0, WT);
        g.scale(1, -0.55);
        g.translate(0, -WT);
      }
      g.globalCompositeOperation = 'lighter';

      const drag = 2.4;
      const grav = 105;
      const headOf = (ray, time) => {
        const tt = Math.max(0, time);
        const rr = (ray.v * (1 - Math.exp(-drag * tt))) / drag;
        const fall = Math.max(0, tt - 0.32);        // the sphere opens first, THEN it droops
        return {
          x: b.x + Math.cos(ray.a) * rr,
          y: b.y + Math.sin(ray.a) * rr + 0.5 * grav * fall * fall
        };
      };

      // every arm is a trail that still reaches back toward the single point it came from
      const SAMPLES = 6;
      const path = () => {
        g.beginPath();
        for (const ray of b.rays) {
          const tail = ray.tail;
          for (let i = 0; i < SAMPLES; i++) {
            const pt = headOf(ray, bt - (tail * i) / (SAMPLES - 1));
            if (i === 0) g.moveTo(pt.x, pt.y); else g.lineTo(pt.x, pt.y);
          }
        }
      };
      // Two batched passes: a wide soft one, then a bright core.
      // The widths are SCREEN-space (divided by the camera scale) so that a pulled-back or
      // pushed-in camera never turns the thin sparks into fat bars (review round 1, problem M).
      const px = 1 / Math.max(0.0001, cam.scale);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      path();
      g.lineWidth = clamp(b.R * 0.05 * (cam.scale || 1), 2, 16) * px;
      g.strokeStyle = withAlpha(DEF.flameColor, 0.17 * fade);
      g.stroke();
      g.lineWidth = clamp(b.R * 0.016 * (cam.scale || 1), 1, 5) * px;
      g.strokeStyle = withAlpha('#ff8fa2', 0.5 * fade);
      g.stroke();

      // burning tips (also screen-space sized)
      const tipR = clamp(3.2 * (cam.scale || 1), 1.2, 6) * px;
      g.beginPath();
      for (const ray of b.rays) {
        const head = headOf(ray, bt);
        g.moveTo(head.x + tipR, head.y);
        g.arc(head.x, head.y, tipR * ray.w, 0, Math.PI * 2);
      }
      g.fillStyle = withAlpha('#fff0f2', 0.85 * fade * clamp(1.4 - bt * 0.5));
      g.fill();

      // the heart of the flower
      glowCircle(g, b.x, b.y, b.R * (0.28 + open * 0.9), DEF.flameColor, 0.9 * fade * (1 - bt * 0.22));
      if (bt < 0.3) glowCircle(g, b.x, b.y, b.R * 0.4 * (1 - bt / 0.3), '#fff2f4', 0.9);
      g.restore();
    }

    return scene;
  }
};
