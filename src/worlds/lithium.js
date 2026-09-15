/**
 * lithium.js — リチウム / the world that STARTS MOVING (DESIGN §2.1).
 *
 * Unfinished world : a dusk-lit sand hill with one small rover stopped, head drooping,
 *                    lights dead. A capsule-shaped empty slot on its flank pulses red.
 * Invitation       : the かけら (an abstract ENERGY PELLET, capsule) floats just above the
 *                    slot, the slot rim pulses in the SAME shape and the SAME colour, the
 *                    pellet nudges down toward it every ~3s, and the rover's camera-head
 *                    turns to look at the slot. No text, no arrows, ever.
 * Action           : drag the pellet into the slot (magnetic snap 0.14*S, forgiving), or
 *                    just tap it (it flies in over 0.7s). Dropped anywhere else it simply
 *                    keeps floating there — it can never be lost.
 * World change     : slot closes -> red light runs along the wiring -> headlights come on
 *                    and the wheels take their first turn (= the climax, the name is
 *                    spoken here, once) -> the rover drives away, dust and pebbles flying,
 *                    a second stopped rover waiting far ahead.
 * Camera           : hard push-in on the slot (1.0 -> 1.55), then a side-follow pan that
 *                    widens with speed, then a long pull-back so the hill shrinks toward
 *                    the shelf.
 *
 * SCIENCE NOTE (§2.1, mandatory): lithium metal never "turns into" a battery here. The
 * かけら is an ABSTRACT energy pellet, the slot is a battery-CELL-SHAPED case, and the red
 * flame colour is carried over only as the red light that runs along the wiring. Real
 * lithium metal exists only in the hearth's dish, under its glass dome.
 */

import { ELEMENT_BY_ID } from '../core/palette.js';
import { makeHandoff } from '../core/scene.js';
import { clamp, lerp, easeOutCubic, easeInOutCubic, damp } from '../core/tween.js';
import {
  roundRect, fillRoundRect, glowCircle, radialFlood, withAlpha, lerpColor, shade,
  cachedLinear, vignette
} from '../core/draw.js';

const DEF = ELEMENT_BY_ID['lithium'];

/* ------------------------------------------------------------------ world-space constants
 * The camera frames a 600x600 core rect, so 1 world unit == S/600 css px in both
 * orientations. Everything below is in those world units. */
const GROUND_Y = 420;          // where the wheels touch
const HORIZON_Y = 292;
const ROVER_X0 = 346;          // start x (puts the slot dead centre of the core rect)
const BODY = { x: -95, y: -132, w: 190, h: 82, r: 26 };
const SLOT = { x: -46, y: -91, w: 50, h: 32 };        // capsule-shaped battery-cell case
const FRAG = { w: 46, h: 29 };                        // the energy pellet (capsule, ~0.06*S across)
const WHEELS = [-62, 2, 64];
const WHEEL_R = 31;
const LAMPS = [{ x: 90, y: -104, r: 14 }, { x: 90, y: -74, r: 12 }];
const MAST = { x: 48, y0: -130, y1: -186 };
const WIRE = [
  { x: -46, y: -91 }, { x: -14, y: -105 }, { x: 22, y: -97 },
  { x: 56, y: -106 }, { x: 84, y: -99 }, { x: 92, y: -87 }
];
const WIRE_BRANCH = [{ x: 56, y: -106 }, { x: 53, y: -124 }, { x: 48, y: -136 }];
const IDLE_LIFT = 150;         // the pellet floats this far above the slot (~0.25*S)
const SECOND_ROVER_AHEAD = 2750; // how far ahead the next stopped rover waits (never interactive)
const DRIVE_SPEED = 240;       // world units / s
const DRIVE_BASE = 9.5;        // §G: the drive lasts long enough to stay a game, not a cutscene
const DRIVE_PER_SURGE = 1.5;   //     every extra touch keeps the rover out a little longer
const DRIVE_MAX = 18;          //     ...but never past this
const RS = 1.28;               // rover scale (rover-local units -> world units)

const SAND = '#c79a68';
const SAND_DARK = '#8d6543';
const METAL_HI = '#d3d8e6';
const METAL_LO = '#767a8d';

/* deterministic scatter (no RNG state, identical every run) */
function hash(i) {
  const s = Math.sin(i * 12.9898 + 4.1414) * 43758.5453;
  return s - Math.floor(s);
}

/* capsule = rounded rect with fully round ends — the ONE shape that the pellet, the slot
 * recess and the slot rim all share. Shape-match is the strongest wordless hint we have. */
function capsulePath(g, cx, cy, w, h) {
  g.beginPath();
  roundRect(g, cx - w / 2, cy - h / 2, w, h, h / 2);
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

    // ------------------------------------------------------------------ state
    let t = 0;
    let phase = 'intro';          // intro|invite|acting|change|complete|leaving
    let W = 0, H = 0, S = 1;

    const rover = { x: ROVER_X0, tilt: 0.13, wheel: 0, speed: 0, head: -0.5, gaze: 0 };
    const frag = { x: 0, y: 0, rot: 0, scale: 0, grabbed: false, fly: null };
    let fragHome = { x: 0, y: 0 };
    let slotW = { x: 0, y: 0 };   // slot in world space (recomputed while the rover moves)

    let inserted = false;
    let insertT = 0;              // seconds since the pellet went in
    let wirePower = 0;            // 0..1 red light running along the wiring
    let lampsOn = 0;              // 0..1
    let spoken = false;
    let sent = false;
    let doneT = 0;                // seconds spent in 'complete'
    let leaveT = 0;
    let nudge = 0;                // 0..1 one-shot "here I am" lunge toward the slot
    let nudgeTimer = 3.0;
    let idleT = 0;
    let motor = null;
    let dustT = 0;
    let flash = 0;            // the moment the lights come on
    let driveLimit = DRIVE_BASE;
    let surge = 0;            // 0..1 extra speed from a tap while driving
    let surges = 0;
    let hop = 0;              // 0..1 arc over a pebble
    let hopRock = null;       // the pebble being jumped, in world space
    let bounce = 0;           // suspension kick on the first turn of the wheels
    let dragHandle = null;
    let camIntro = { x: 352, y: 300 };
    let hillBands = [];
    let fgSpan = 200;
    let fgBottom = GROUND_Y + 200;
    let secondX = ROVER_X0 + SECOND_ROVER_AHEAD;
    let secondVisible = false;

    const fadeIn = () => Math.max(handoff ? clamp(handoff.progress) : 1, clamp(t / 1.2));

    // ------------------------------------------------------------------ geometry helpers

    /** rover-local -> world (honours the body tilt) */
    function toWorld(lx, ly) {
      const c = Math.cos(rover.tilt), s = Math.sin(rover.tilt);
      return { x: rover.x + (lx * c - ly * s) * RS, y: GROUND_Y + (lx * s + ly * c) * RS };
    }

    function updateSlotWorld() {
      slotW = toWorld(SLOT.x, SLOT.y);
      fragHome = { x: slotW.x, y: slotW.y - IDLE_LIFT };
    }

    const fragScreen = () => cam.worldToScreen(frag.x, frag.y);
    const slotScreen = () => cam.worldToScreen(slotW.x, slotW.y);

    function fragHitR() {
      const rPx = (FRAG.w * 0.5) * RS * cam.scale;
      return Math.max(rPx * 2.1, S * 0.11);     // §2.1: everything tolerant
    }

    // ------------------------------------------------------------------ layout

    function layout(w, h) {
      W = w; H = h; S = Math.min(w, h);
      cam.setFrame({ coreW: 600, coreH: 600, mode: 'contain' });
      updateSlotWorld();

      // Park the camera so that BOTH the pellet and the slot sit inside the thumb zone,
      // in portrait and in landscape (§5.3).
      const zone = engine.thumbZone();
      const wantSlotY = clamp(
        zone.y + zone.h * 0.44,
        zone.y + IDLE_LIFT * cam.baseScale + engine.insets.top * 0 + S * 0.04,
        zone.y + zone.h - S * 0.04
      );
      camIntro = {
        x: 352,
        y: slotW.y - (wantSlotY - h / 2) / (cam.baseScale || 1)
      };
      if (phase === 'intro' || phase === 'invite' || phase === 'acting') {
        cam.x = camIntro.x; cam.y = camIntro.y;
      }
      if (phase === 'intro' && frag.scale <= 0.001) {
        frag.x = fragHome.x; frag.y = fragHome.y;
      }

      // Spread the dune ridges between the top of the framed view and the horizon, so the
      // sky is never a big empty slab in either orientation. Frozen here so that the
      // later pan / pull-back moves past them instead of dragging them along.
      const topY = camIntro.y - (h / 2) / (cam.baseScale || 1);
      const span = Math.max(180, HORIZON_Y - topY);
      hillBands = [
        { y: topY + span * 0.50, amp: span * 0.115, f: 0.0026, ph: 0.0, tone: 0.10, col: '#2a1830' },
        { y: topY + span * 0.72, amp: span * 0.090, f: 0.0041, ph: 2.1, tone: 0.16, col: '#4a2331' },
        { y: topY + span * 0.88, amp: span * 0.062, f: 0.0063, ph: 4.4, tone: 0.22, col: '#6e3630' },
        { y: topY + span * 0.99, amp: span * 0.040, f: 0.0098, ph: 1.2, tone: 0.28, col: SAND_DARK }
      ];

      // ...and the same treatment for the near side: foreground dune ridges, wheel ruts and
      // boulders fill the sand in front of the rover (portrait used to be 40% empty).
      fgBottom = camIntro.y + (h / 2) / (cam.baseScale || 1);
      fgSpan = Math.max(70, fgBottom - GROUND_Y);
      syncSnap();
    }

    function syncSnap() {
      if (!dragHandle) return;
      const s = slotScreen();
      dragHandle.update({ snapTargets: [{ x: s.x, y: s.y, r: 0.14 }] });
    }

    // ------------------------------------------------------------------ the world change

    function insert(fromTap) {
      if (inserted) return;
      inserted = true;
      frag.grabbed = false;
      frag.fly = null;
      phase = 'change';
      insertT = 0;
      engine.audio.play('snap');
      // hard push-in onto the slot (§2.1 camera: zoom 1.0 -> 1.55 in 0.4s)
      cam.panTo(slotW.x + 6, slotW.y - 6, 0.42, easeOutCubic);
      cam.zoomTo(1.55, 0.42, easeOutCubic);
      const sc = slotScreen();
      engine.particles.burst(sc.x, sc.y, 22, {
        speed: [40, 180], life: [0.3, 0.8], r: [1.5, 3.5],
        color: [DEF.flameColor, DEF.glowColor], drag: 0.88
      });
      void fromTap;
    }

    /** §G: while the rover is out, a touch anywhere gives it a shove — more speed, a
     *  bigger dust plume, a headlight flare and a hop over a pebble — and buys it more
     *  time before the pull-back. The name is NOT spoken again; this is play, not a climax. */
    function boost() {
      if (phase !== 'complete') return;
      surges++;
      driveLimit = Math.min(DRIVE_MAX, driveLimit + DRIVE_PER_SURGE);
      surge = 1;
      flash = Math.max(flash, 0.55);
      bounce = 1;
      hop = 1;
      hopRock = { x: rover.x + 108 * RS, r: 15 + hash(surges * 3) * 12 };
      // keep the sleeping rover over the next ridge — but only ever move it out of sight
      if (!secondVisible) secondX = Math.max(secondX, rover.x + SECOND_ROVER_AHEAD * 0.8);
      rover.speed = Math.max(rover.speed, DRIVE_SPEED * 1.5);
      engine.audio.play('whoosh');
      engine.audio.play('power_on');
      if (motor && motor.setLevel) motor.setLevel(1);
      const back = cam.worldToScreen(rover.x - 80 * RS, GROUND_Y - 8);
      engine.particles.burst(back.x, back.y, 26, {
        speed: [90, 330], life: [0.45, 1.1], r: [2, 6],
        color: ['#d9b184', '#f0cfa6', DEF.glowColor], drag: 0.9, gravity: 150,
        angle: Math.PI, spread: Math.PI * 0.9, glow: false
      });
      const nose = cam.worldToScreen(rover.x + 95 * RS, GROUND_Y - 95 * RS);
      engine.particles.burst(nose.x, nose.y, 14, {
        speed: [60, 220], life: [0.3, 0.7], r: [1.5, 4],
        color: ['#ffe6b8', DEF.glowColor], drag: 0.9
      });
    }

    /** the climax: lights on + the wheels' first turn, name spoken once */
    function climax() {
      if (phase !== 'change') return;
      phase = 'complete';
      doneT = 0;
      secondX = rover.x + SECOND_ROVER_AHEAD;
      rover.speed = 60;
      lampsOn = 0.001;
      flash = 1;
      bounce = 1;
      if (!spoken) { spoken = true; engine.audio.speakElement(DEF.id); }
      engine.audio.play('power_on');
      motor = engine.audio.play('spin', { f0: 110 });
      if (motor && motor.setLevel) motor.setLevel(0.25);
      cam.follow(() => ({ x: rover.x + 30, y: GROUND_Y - 108 * RS }), {
        screenAnchor: { x: 0.34, y: 0.54 }, damping: 0.10, lead: 0.06
      });
      cam.zoomTo(0.95, 1.4, easeInOutCubic);
      const sc = cam.worldToScreen(rover.x + 80 * RS, GROUND_Y - 90 * RS);
      engine.particles.burst(sc.x, sc.y, 30, {
        speed: [60, 260], life: [0.4, 1.0], r: [1.5, 4],
        color: [DEF.glowColor, '#ffe6b8'], drag: 0.9
      });
    }

    // ------------------------------------------------------------------ scene

    const scene = {
      id: DEF.id,

      layout,

      enter() {
        // §5.5.4 continuity: keep the hearth's sparks alive, don't restart them
        if (handoff && handoff.particles) engine.particles.inject(handoff.particles);
        layout(engine.width, engine.height);

        // the pellet condenses out of the flood of colour, at the flame's position
        const o = (handoff && handoff.origin) || { x: engine.width / 2, y: engine.height * 0.4 };
        const ow = cam.screenToWorld(o.x, o.y);
        frag.x = ow.x; frag.y = ow.y; frag.scale = 0;

        // drag FIRST so that a near-still finger still reaches the tap recogniser after it
        dragHandle = rec.onDrag(
          (p) => !inserted && Math.hypot(p.x - fragScreen().x, p.y - fragScreen().y) <= fragHitR() * (1 + (p.pad || 0)),
          {
            onStart: () => {
              if (inserted) return;
              frag.grabbed = true; frag.fly = null; nudge = 0; idleT = 0;
              phase = 'acting';
              engine.audio.play('pick');
            },
            onMove: (p) => {
              if (inserted || !frag.grabbed) return;
              const w = cam.screenToWorld(p.x, p.y);
              frag.x = w.x; frag.y = w.y;
            },
            onEnd: (p, info) => {
              frag.grabbed = false;
              if (inserted) return;
              if (info && info.snapped) { insert(false); return; }
              // §2.1: dropped anywhere else it simply keeps floating. Never lost.
              const w = cam.screenToWorld(p.x, p.y);
              frag.x = w.x; frag.y = w.y;
              phase = 'invite';
              idleT = 0; nudgeTimer = 1.6;
              engine.audio.play('drop_back');
            }
          },
          { snapTargets: [{ x: 0, y: 0, r: 0.14 }], returnOnRelease: false, hitPaddingRatio: 0.6, snapOnEnter: true }
        );
        syncSnap();

        // §2.1 alternative: a plain tap on the pellet (or on the slot) flies it in over 0.7s
        rec.onTap(
          (p) => {
            if (inserted) return false;
            const f = fragScreen(), s = slotScreen();
            return Math.hypot(p.x - f.x, p.y - f.y) <= fragHitR() * 1.6 ||
                   Math.hypot(p.x - s.x, p.y - s.y) <= S * 0.14;
          },
          () => {
            if (inserted || frag.fly) return;
            phase = 'acting';
            frag.grabbed = false;
            frag.fly = { t: 0, dur: 0.7, x0: frag.x, y0: frag.y };
            engine.audio.play('pick');
          },
          { maxMoveRatio: 0.06, maxDurationMs: 700 }
        );

        // §G: once the rover is running, ANY tap shoves it along (tapping the rover itself
        // is the obvious one, but a 4-year-old's finger lands anywhere, so anywhere works).
        rec.onTap(() => phase === 'complete', () => boost(), { maxMoveRatio: 0.09, maxDurationMs: 800 });
      },

      update(dt) {
        t += dt;
        updateSlotWorld();

        // ---- intro: the pellet condenses and drifts to its waiting place
        if (phase === 'intro') {
          const k = clamp(t / 1.15);
          frag.scale = clamp(t / 0.55);
          frag.x = lerp(frag.x, fragHome.x, damp(0.86, dt));
          frag.y = lerp(frag.y, fragHome.y, damp(0.86, dt));
          const fs = fragScreen();
          engine.particles.attract(fs.x, fs.y, 520, dt);
          if (k >= 1) { phase = 'invite'; idleT = 0; nudgeTimer = 2.2; }
        }

        // ---- the pellet's own life
        if (!inserted) {
          frag.scale = Math.min(1, frag.scale + dt * 2);
          if (frag.fly) {
            const f = frag.fly;
            f.t += dt;
            const k = clamp(f.t / f.dur);
            const e = easeInOutCubic(k);
            frag.x = lerp(f.x0, slotW.x, e);
            frag.y = lerp(f.y0, slotW.y, e);
            if (k >= 1) { frag.fly = null; insert(true); }
          } else if (!frag.grabbed && phase !== 'intro') {
            idleT += dt;
            nudgeTimer -= dt;
            if (nudgeTimer <= 0 && nudge <= 0) { nudge = 1; nudgeTimer = 3.0; }
            // very slow drift home so the invitation always re-forms near the slot
            frag.x = lerp(frag.x, fragHome.x, damp(0.985, dt));
            frag.y = lerp(frag.y, fragHome.y, damp(0.985, dt));
          }
          if (nudge > 0) nudge = Math.max(0, nudge - dt / 0.9);
          frag.rot = Math.sin(t * 0.9) * 0.22 + Math.sin(t * 2.3) * 0.04;
        }

        // ---- the rover looks at the slot while it waits (gaze guidance, §2.1)
        const wantHead = inserted ? 0 : -0.52;
        rover.head = lerp(rover.head, wantHead, damp(0.92, dt));
        rover.gaze = lerp(rover.gaze, inserted ? 0 : 1, damp(0.93, dt));

        // ---- after the insert
        if (inserted) {
          insertT += dt;
          wirePower = clamp((insertT - 0.06) / 0.62);           // red light runs, 0.6s
          if (phase === 'change' && insertT >= 0.70) climax();
        }

        if (flash > 0) flash = Math.max(0, flash - dt / 0.75);
        if (bounce > 0) bounce = Math.max(0, bounce - dt / 0.9);
        if (surge > 0) surge = Math.max(0, surge - dt / 1.6);
        if (hop > 0) {
          hop = Math.max(0, hop - dt / 0.85);
          if (hop <= 0) hopRock = null;
        }

        if (phase === 'complete' || phase === 'leaving') {
          lampsOn = Math.min(1, lampsOn + dt * 6);
          rover.tilt = lerp(rover.tilt, 0, damp(0.90, dt));
          const want = phase === 'leaving' ? 85 : DRIVE_SPEED * (1 + surge * 0.85);
          rover.speed = lerp(rover.speed, want, damp(0.94, dt));
          rover.x += rover.speed * dt;
          rover.wheel += (rover.speed / (WHEEL_R * RS)) * dt;
          if (motor && motor.setLevel) motor.setLevel(clamp(0.25 + 0.5 * (rover.speed / DRIVE_SPEED)));

          // dust + kicked pebbles (screen-space particles, drawn by the engine)
          dustT += dt;
          if (dustT > (surge > 0.1 ? 0.018 : 0.045)) {
            dustT = 0;
            const back = cam.worldToScreen(rover.x - 78 * RS, GROUND_Y - 6);
            engine.particles.emit({
              x: back.x, y: back.y,
              vx: -(130 + hash(engine.frameCount) * 140), vy: -(20 + hash(engine.frameCount + 3) * 110),
              r: (2 + hash(engine.frameCount + 5) * 4) * (1 + surge * 0.7) * clamp(cam.scale, 0.4, 2),
              life: 0.5 + hash(engine.frameCount + 7) * 0.7,
              color: hash(engine.frameCount + 9) > 0.75 ? DEF.glowColor : '#d9b184',
              drag: 0.93, gravity: 120, glow: false
            });
          }
        }

        if (phase === 'complete') {
          doneT += dt;
          if (doneT >= driveLimit) {
            // §2.1 return: keep pulling back until the whole hill is small
            phase = 'leaving';
            leaveT = 0;
            cam.follow(null);
            cam.panTo(rover.x + 60, GROUND_Y - 150 * RS, 1.5, easeInOutCubic);
            cam.zoomTo(0.36, 1.5, easeInOutCubic);
            if (motor && motor.stop) motor.stop();
            motor = null;
            engine.audio.play('whoosh');
          }
        } else if (phase === 'leaving' && !sent) {
          leaveT += dt;
          if (leaveT >= 1.45) {
            sent = true;
            finish({
              worldId: DEF.id,
              completed: true,
              shelfAnchorHint: { x: W * 0.5, y: H * 0.5 },
              returnHandoff: makeHandoff({
                elementId: DEF.id,
                flameColor: DEF.flameColor,
                glowColor: DEF.glowColor,
                ambient: DEF.ambient,
                origin: { x: W * 0.5, y: H * 0.48 },
                particles: engine.particles.snapshot(),
                cameraZoom: cam.zoom
              })
            });
          }
        }

        syncSnap();
      },

      // ================================================================= drawing

      draw(g) {
        if (sent) return;
        const a = fadeIn();
        const amb = lerpColor(handoff ? handoff.flameColor : DEF.flameColor, DEF.ambient, clamp(t / 1.5));
        const ambQ = lerpColor(DEF.flameColor, DEF.ambient, Math.round(clamp(t / 1.5) * 10) / 10);

        g.save();
        g.globalAlpha = 1;
        drawSky(g, ambQ);
        g.restore();

        g.save();
        g.globalAlpha = a;

        cam.apply(g);
        const vr = cam.viewRect;
        drawHills(g, vr, ambQ);
        drawGround(g, vr);
        drawSecondRover(g, vr);
        drawRover(g);
        if (!inserted) drawPellet(g);
        cam.restore(g);

        // the flame colour never dies: it settles as this world's light (§1.5)
        const flood = 0.30 * (1 - clamp(t / 2.4) * 0.55) + lampsOn * 0.05;
        radialFlood(g, W * 0.5, H * 0.62, Math.hypot(W, H) * 0.75, ambQ, flood);
        if (flash > 0) {
          const fk = flash * flash;
          const ls = cam.worldToScreen(rover.x + 90 * RS, GROUND_Y - 90 * RS);
          radialFlood(g, ls.x, ls.y, Math.hypot(W, H) * (0.35 + 0.5 * (1 - flash)), '#ffe9bd', 0.72 * fk);
        }
        vignette(g, W, H, 0.42, '#100509');
        g.restore();
        void amb;
      },

      exit() {
        if (motor && motor.stop) motor.stop();
        motor = null;
        rec.destroy();
      },

      debugState() {
        const fs = fragScreen(), ss = slotScreen();
        return {
          phase,
          elementId: DEF.id,
          t: Math.round(t * 100) / 100,
          inserted,
          driving: phase === 'complete' || phase === 'leaving',
          surges,
          driveLimit: Math.round(driveLimit * 10) / 10,
          spoken,
          lampsOn: Math.round(lampsOn * 100) / 100,
          wirePower: Math.round(wirePower * 100) / 100,
          fragment: { x: Math.round(fs.x), y: Math.round(fs.y) },
          slot: { x: Math.round(ss.x), y: Math.round(ss.y) }
        };
      },

      /** §5.10 — ids the QA harness pokes. Both stay published after the insert so a
       *  stray extra "4-year-old" gesture never lands on nothing. */
      hitPoints() {
        const ss = slotScreen();
        const fs = inserted ? ss : fragScreen();
        const rs = cam.worldToScreen(rover.x, GROUND_Y - 90 * RS);
        const out = [
          { id: 'fragment', x: fs.x, y: fs.y, r: inserted ? S * 0.10 : fragHitR() },
          { id: 'slot', x: ss.x, y: ss.y, r: S * 0.14 }
        ];
        // §G: while it is running, the rover itself is touchable (a tap shoves it along)
        if (phase === 'complete') out.push({ id: 'rover', x: rs.x, y: rs.y, r: S * 0.18 });
        return out;
      },

      complete() {
        if (!inserted) { frag.x = slotW.x; frag.y = slotW.y; insert(true); }
        if (phase === 'change') { insertT = 0.70; climax(); }
      },

      onPointerDown(p) { rec.down(p); },
      onPointerMove(p) { rec.move(p); },
      onPointerUp(p) { rec.up(p); }
    };

    /* ---------------------------------------------------------------- sky (screen space) */
    function drawSky(g, ambQ) {
      const grad = cachedLinear(g, 'li-sky', 0, 0, 0, H, [
        [0, '#150d22'],
        [0.42, '#2a1430'],
        [0.72, '#542030'],
        [1, '#7a2c2e']
      ]);
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      // a few quiet stars high up
      const n = 26;
      for (let i = 0; i < n; i++) {
        const sx = hash(i) * W;
        const sy = hash(i + 41) * H * 0.42;
        const tw = 0.35 + 0.35 * Math.sin(t * 1.4 + i);
        g.fillStyle = withAlpha('#ffe9d2', 0.5 * tw);
        g.beginPath();
        g.arc(sx, sy, S * 0.0045 * (0.7 + hash(i + 11) * 0.8), 0, Math.PI * 2);
        g.fill();
      }
      radialFlood(g, W * 0.5, H * 0.70, Math.max(W, H) * 0.85, ambQ, 0.20);
    }

    /* ---------------------------------------------------------------- hills (world space) */
    function drawHills(g, vr, ambQ) {
      const x0 = vr.x - 40, x1 = vr.x + vr.w + 40;
      const bottom = vr.y + vr.h + 40;
      // the low dusk light sitting on the horizon — the sky has a warm heart, not a void
      glowCircle(g, camIntro.x + 210, HORIZON_Y + 26, Math.max(320, (x1 - x0) * 0.42),
        lerpColor('#ff7a4a', ambQ, 0.45), 0.34);
      const step = Math.max(10, vr.w / 60);
      for (const L of hillBands) {
        g.beginPath();
        g.moveTo(x0, bottom);
        for (let x = x0; x <= x1; x += step) {
          const y = L.y - Math.sin(x * L.f + L.ph) * L.amp - Math.sin(x * L.f * 2.7 + L.ph) * L.amp * 0.3;
          g.lineTo(x, y);
        }
        g.lineTo(x1, bottom);
        g.closePath();
        g.fillStyle = lerpColor(L.col, ambQ, L.tone);
        g.fill();
      }
    }

    /* ---------------------------------------------------------------- ground */
    function drawGround(g, vr) {
      const x0 = vr.x - 40, x1 = vr.x + vr.w + 40;
      const bottom = vr.y + vr.h + 40;
      g.fillStyle = SAND_DARK;
      g.fillRect(x0, GROUND_Y - 2, x1 - x0, bottom - GROUND_Y + 2);
      const grad = cachedLinear(g, 'li-ground', 0, GROUND_Y, 0, GROUND_Y + 260, [
        [0, SAND],
        [0.45, shade(SAND, 0.82)],
        [1, shade(SAND_DARK, 0.7)]
      ]);
      g.fillStyle = grad;
      g.fillRect(x0, GROUND_Y, x1 - x0, bottom - GROUND_Y);
      // warm rim of light along the crest
      g.fillStyle = withAlpha('#ffcf9a', 0.30);
      g.fillRect(x0, GROUND_Y - 4, x1 - x0, 7);

      // wheel ruts already ploughed through the sand (texture, never a sign or an arrow)
      const rutY = GROUND_Y + fgSpan * 0.20;
      const wavy = (x, f, ph, amp) => Math.sin(x * f + ph) * amp + Math.sin(x * f * 2.6 + ph) * amp * 0.3;
      for (let k = 0; k < 2; k++) {
        const ry = rutY + k * fgSpan * 0.085;
        const th = fgSpan * 0.026 + 3;
        g.fillStyle = withAlpha(shade(SAND_DARK, 0.88), 0.30 - k * 0.08);
        g.beginPath();
        for (let x = x0; x <= x1; x += 26) g.lineTo(x, ry + wavy(x, 0.0037, k * 2.2, th * 0.8) - th);
        for (let x = x1; x >= x0; x -= 26) g.lineTo(x, ry + wavy(x, 0.0037, k * 2.2, th * 0.8) + th);
        g.closePath();
        g.fill();
      }

      // two near dune ridges rolling across the foreground
      const ridges = [
        { y: GROUND_Y + fgSpan * 0.44, amp: fgSpan * 0.060, f: 0.0040, ph: 1.7, col: shade(SAND, 0.93) },
        { y: GROUND_Y + fgSpan * 0.82, amp: fgSpan * 0.048, f: 0.0066, ph: 4.9, col: shade(SAND_DARK, 1.16) }
      ];
      const rstep = Math.max(10, (x1 - x0) / 56);
      for (const R of ridges) {
        g.beginPath();
        g.moveTo(x0, bottom);
        for (let x = x0; x <= x1; x += rstep) g.lineTo(x, R.y - wavy(x, R.f, R.ph, R.amp));
        g.lineTo(x1, bottom);
        g.closePath();
        g.fillStyle = R.col;
        g.fill();
        g.fillStyle = withAlpha('#ffd7a4', 0.15);
        g.beginPath();
        g.moveTo(x0, R.y + fgSpan * 0.028);
        for (let x = x0; x <= x1; x += rstep) g.lineTo(x, R.y - wavy(x, R.f, R.ph, R.amp));
        g.lineTo(x1, R.y + fgSpan * 0.028);
        g.closePath();
        g.fill();
      }

      // pebbles near the rover, a few bigger stones in the very front — soft and rounded,
      // sparse enough that the sand still reads as sand
      const rockK = clamp(fgSpan / 260, 0.7, 1.2);
      const i0 = Math.floor(x0 / 64), i1 = Math.ceil(x1 / 64);
      for (let i = i0; i <= i1; i++) {
        const near = (i & 1) === 0;
        if (near && hash(i + 47) > 0.80) continue;                // leave a few gaps
        const px = i * 64 + hash(i + (near ? 31 : 0)) * 54;
        const py = GROUND_Y + fgSpan * (near ? 0.58 + hash(i + 17) * 0.40 : 0.04 + hash(i + 7) * 0.30);
        const r = (near ? (17 + hash(i + 23) * 21) * rockK : 5 + hash(i + 3) * 8);
        g.fillStyle = withAlpha(shade(SAND_DARK, near ? 0.72 : 0.85), near ? 0.55 : 0.7);
        g.beginPath();
        g.ellipse(px, py + r * 0.32, r * 1.04, r * 0.46, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = near ? shade(SAND_DARK, 1.2) : withAlpha(shade(SAND, 1.05), 0.8);
        g.beginPath();
        g.ellipse(px, py, r * 0.9, r * 0.6, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = withAlpha('#ffe0b4', near ? 0.3 : 0.2);
        g.beginPath();
        g.ellipse(px - r * 0.22, py - r * 0.24, r * 0.48, r * 0.24, 0, 0, Math.PI * 2);
        g.fill();
      }
    }

    /* ---------------------------------------------------------------- the next rover ahead */
    function drawSecondRover(g, vr) {
      secondVisible = !(secondX < vr.x - 120 || secondX > vr.x + vr.w + 120);
      const near = clamp((secondX - rover.x - 130) / 320);
      if (near <= 0.01 || !secondVisible) return;
      const k = 0.5 * RS;                              // smaller + higher = further away
      g.save();
      g.globalAlpha = near;
      g.translate(secondX, GROUND_Y - 44);
      g.scale(k, k);
      g.rotate(0.14);
      g.fillStyle = withAlpha('#2a1a24', 0.85);
      for (const wx of WHEELS) {
        g.beginPath(); g.arc(wx, -WHEEL_R, WHEEL_R, 0, Math.PI * 2); g.fill();
      }
      fillRoundRect(g, BODY.x, BODY.y, BODY.w, BODY.h, BODY.r, withAlpha('#2a1a24', 0.9));
      g.strokeStyle = withAlpha('#2a1a24', 0.9);
      g.lineWidth = 11; g.lineCap = 'round';
      g.beginPath(); g.moveTo(MAST.x, MAST.y0); g.lineTo(MAST.x, MAST.y1); g.stroke();
      fillRoundRect(g, MAST.x - 20, MAST.y1 - 28, 46, 30, 12, withAlpha('#2a1a24', 0.9));
      g.restore();
      // it is dark and asleep: one faint red heartbeat on its flank (a promise, not a task)
      const hb = (0.20 + 0.16 * Math.sin(t * 1.7)) * near;
      glowCircle(g, secondX - 46 * k, GROUND_Y - 44 - 91 * k, 24, DEF.flameColor, hb);
    }

    /* ---------------------------------------------------------------- the rover */
    function drawRover(g) {
      // the pebble the rover is jumping right now
      if (hopRock) {
        const r = hopRock.r;
        g.fillStyle = withAlpha(shade(SAND_DARK, 0.7), 0.6);
        g.beginPath(); g.ellipse(hopRock.x, GROUND_Y + r * 0.3, r * 1.1, r * 0.5, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = shade(SAND_DARK, 1.25);
        g.beginPath(); g.ellipse(hopRock.x, GROUND_Y - r * 0.2, r, r * 0.72, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = withAlpha('#ffe0b4', 0.34);
        g.beginPath(); g.ellipse(hopRock.x - r * 0.2, GROUND_Y - r * 0.45, r * 0.5, r * 0.26, 0, 0, Math.PI * 2); g.fill();
      }
      g.save();
      g.translate(rover.x, GROUND_Y);

      g.scale(RS, RS);
      const kick = bounce > 0 ? Math.sin(bounce * Math.PI * 3) * bounce * 9 : 0;
      const air = hop > 0 ? Math.sin((1 - hop) * Math.PI) * 34 : 0;

      // contact shadow stays on the ground and shrinks while the rover is in the air
      g.fillStyle = withAlpha('#3a2216', 0.45 - air * 0.0075);
      g.beginPath();
      g.ellipse(0, 4, 122 - air * 0.55, 18 - air * 0.1, 0, 0, Math.PI * 2);
      g.fill();

      // headlight beams sweep the sand ahead
      if (lampsOn > 0.02) drawBeams(g);

      g.translate(0, -air);
      g.rotate(rover.tilt - air * 0.0022);

      drawWheels(g);
      g.translate(0, -kick);
      drawBody(g);
      drawWiring(g);
      drawSlot(g);
      drawMastHead(g);
      drawLamps(g);

      g.restore();
    }

    function drawWheels(g) {
      for (const wx of WHEELS) {
        const y = -WHEEL_R;
        g.fillStyle = '#2b2733';
        g.beginPath(); g.arc(wx, y, WHEEL_R, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#3d3849';
        g.beginPath(); g.arc(wx, y, WHEEL_R * 0.86, 0, Math.PI * 2); g.fill();
        // fat treads so the very first turn is unmistakable
        g.save();
        g.translate(wx, y);
        g.rotate(rover.wheel);
        g.fillStyle = withAlpha('#17141d', 0.9);
        for (let i = 0; i < 6; i++) {
          g.save();
          g.rotate((i / 6) * Math.PI * 2);
          fillRoundRect(g, -5, -WHEEL_R * 0.99, 10, 13, 4.5);
          g.restore();
        }
        // hub + one bright spoke: rotation reads even at a glance
        g.fillStyle = lampsOn > 0.2 ? lerpColor('#8f8ba0', '#ffdca8', lampsOn) : '#8f8ba0';
        g.beginPath(); g.arc(0, 0, WHEEL_R * 0.34, 0, Math.PI * 2); g.fill();
        g.fillStyle = withAlpha('#cfc9dd', 0.9);
        fillRoundRect(g, -4, -WHEEL_R * 0.7, 8, WHEEL_R * 1.4, 4);
        g.restore();
      }
    }

    function drawBody(g) {
      const grad = cachedLinear(g, 'li-body', 0, BODY.y, 0, BODY.y + BODY.h, [
        [0, METAL_HI], [0.55, '#9aa0b3'], [1, METAL_LO]
      ]);
      fillRoundRect(g, BODY.x, BODY.y, BODY.w, BODY.h, BODY.r, grad);
      // darker belly + soft top highlight (rounded, high contrast, no thin lines)
      fillRoundRect(g, BODY.x + 8, BODY.y + BODY.h * 0.56, BODY.w - 16, BODY.h * 0.40, 16, withAlpha('#4d4f60', 0.55));
      fillRoundRect(g, BODY.x + 16, BODY.y + 9, BODY.w - 32, 15, 7, withAlpha('#ffffff', 0.35));
      // roof plate
      fillRoundRect(g, BODY.x + 22, BODY.y - 17, BODY.w - 60, 20, 9, '#3b4160');
      fillRoundRect(g, BODY.x + 28, BODY.y - 13, BODY.w - 74, 7, 3.5, withAlpha('#7f93d0', 0.7));
    }

    function drawWiring(g) {
      // the dormant harness
      g.save();
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = withAlpha('#3a2b34', 0.95);
      g.lineWidth = 9;
      strokePts(g, WIRE);
      strokePts(g, WIRE_BRANCH);
      g.restore();

      if (wirePower <= 0) return;
      // §2.1 the red light runs along the wiring — the flame colour, carried as light
      const lit = litPortion(WIRE, wirePower);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round'; g.lineJoin = 'round';
      const PASSES = [[2.4, 0.16], [1.35, 0.30], [0.62, 0.95]];
      for (const [wk, ak] of PASSES) {
        g.strokeStyle = withAlpha(wk < 1 ? DEF.glowColor : DEF.flameColor, ak);
        g.lineWidth = 9 * wk;
        strokePts(g, lit);
      }
      if (wirePower > 0.55) {
        const b = litPortion(WIRE_BRANCH, clamp((wirePower - 0.55) / 0.45));
        for (const [wk, ak] of PASSES) {
          g.strokeStyle = withAlpha(wk < 1 ? DEF.glowColor : DEF.flameColor, ak);
          g.lineWidth = 9 * wk;
          strokePts(g, b);
        }
      }
      g.restore();
      const head = lit[lit.length - 1];
      if (head && wirePower < 1) glowCircle(g, head.x, head.y, 34, DEF.glowColor, 0.95);
      if (lampsOn > 0) {
        for (const p of WIRE) glowCircle(g, p.x, p.y, 16, DEF.flameColor, 0.35 * lampsOn);
      }
    }

    function strokePts(g, pts) {
      if (!pts || pts.length < 2) return;
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.stroke();
    }

    /** the first `k` of a polyline, by length */
    function litPortion(pts, k) {
      const segs = [];
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        segs.push(d); total += d;
      }
      let want = total * clamp(k);
      const out = [{ x: pts[0].x, y: pts[0].y }];
      for (let i = 0; i < segs.length; i++) {
        if (want >= segs[i]) {
          out.push({ x: pts[i + 1].x, y: pts[i + 1].y });
          want -= segs[i];
        } else {
          const f = segs[i] ? want / segs[i] : 0;
          out.push({
            x: pts[i].x + (pts[i + 1].x - pts[i].x) * f,
            y: pts[i].y + (pts[i + 1].y - pts[i].y) * f
          });
          break;
        }
      }
      return out;
    }

    /** the battery-CELL-shaped case: same capsule, same colour as the pellet (§2.1) */
    function drawSlot(g) {
      const pulse = 0.5 - 0.5 * Math.cos(t * 2.6);
      const open = inserted ? clamp(1 - insertT / 0.28) : 1;

      if (open > 0.02) glowCircle(g, SLOT.x, SLOT.y, 54 + pulse * 18, DEF.flameColor, (0.45 + pulse * 0.4) * open);

      // recess: a deep, dark, capsule-shaped battery-cell case
      g.save();
      capsulePath(g, SLOT.x, SLOT.y, SLOT.w + 14, SLOT.h + 14);
      g.fillStyle = withAlpha('#4a3944', 0.95);
      g.fill();
      capsulePath(g, SLOT.x, SLOT.y, SLOT.w, SLOT.h);
      g.fillStyle = lerpColor('#1a0b11', DEF.flameColor, 0.08 + pulse * 0.07 * open);
      g.fill();
      capsulePath(g, SLOT.x, SLOT.y - SLOT.h * 0.20, SLOT.w - 12, SLOT.h * 0.34);
      g.fillStyle = withAlpha('#000000', 0.30);
      g.fill();
      g.restore();

      if (open > 0.02) {
        // attention ripple: the SAME capsule, growing and fading outward
        const rip = (t * 0.55) % 1;
        g.save();
        g.globalCompositeOperation = 'lighter';
        capsulePath(g, SLOT.x, SLOT.y, SLOT.w + 18 + rip * 46, SLOT.h + 18 + rip * 46);
        g.strokeStyle = withAlpha(DEF.flameColor, (1 - rip) * 0.5 * open);
        g.lineWidth = 7;
        g.stroke();
        g.restore();

        // the pulsing rim — the SAME capsule outline, the SAME red as the pellet
        capsulePath(g, SLOT.x, SLOT.y, SLOT.w + 9, SLOT.h + 9);
        g.strokeStyle = withAlpha(DEF.flameColor, (0.62 + pulse * 0.38) * open);
        g.lineWidth = 8;
        g.stroke();
      }

      if (inserted) {
        // the pellet seated flush, then the cover closes over it for good
        drawCapsuleBody(g, SLOT.x, SLOT.y, 0, 1, 0.55 + 0.45 * (1 - clamp(insertT / 0.5)));
        const cover = easeOutCubic(clamp(insertT / 0.34));
        g.save();
        capsulePath(g, SLOT.x, SLOT.y, SLOT.w + 12, SLOT.h + 12);
        g.clip();
        const cx = SLOT.x - (SLOT.w + 16) * (1 - cover);
        fillRoundRect(g, cx - (SLOT.w + 16) / 2, SLOT.y - (SLOT.h + 12) / 2, SLOT.w + 16, SLOT.h + 12, 13, '#7f8698');
        fillRoundRect(g, cx - (SLOT.w + 2) / 2, SLOT.y - (SLOT.h - 2) / 2, SLOT.w + 2, 7, 3.5, withAlpha('#ffffff', 0.32));
        // the charged cell breathes red behind its lid: the energy is in there for good
        capsulePath(g, cx, SLOT.y + SLOT.h * 0.16, SLOT.w * 0.52, SLOT.h * 0.26);
        g.fillStyle = withAlpha(lerpColor(DEF.flameColor, '#ffd0b8', 0.2 + 0.25 * Math.sin(t * 3)), 0.95);
        g.fill();
        g.restore();
        glowCircle(g, SLOT.x, SLOT.y + SLOT.h * 0.16, 30, DEF.flameColor, 0.45 + 0.2 * Math.sin(t * 3));
      }
    }

    function drawMastHead(g) {
      g.save();
      g.strokeStyle = '#8b90a3';
      g.lineWidth = 12;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(MAST.x, MAST.y0); g.lineTo(MAST.x, MAST.y1); g.stroke();
      g.restore();

      g.save();
      g.translate(MAST.x, MAST.y1);
      g.rotate(rover.head * 0.55);
      // head box
      fillRoundRect(g, -24, -30, 52, 34, 13, '#aab0c4');
      fillRoundRect(g, -18, -25, 40, 11, 5, withAlpha('#ffffff', 0.4));
      // the big lens "eye"
      const lx = 10, ly = -13;
      g.fillStyle = '#1d1b26';
      g.beginPath(); g.arc(lx, ly, 13, 0, Math.PI * 2); g.fill();
      // pupil looks at the slot while the slot is empty (gaze guidance, never an arrow)
      const gx = -0.92 * rover.gaze, gy = 0.34 * rover.gaze;
      g.fillStyle = lampsOn > 0.1 ? lerpColor('#6fd8ff', '#ffe8bd', lampsOn) : lerpColor('#5a6b8c', DEF.flameColor, 0.35 + 0.25 * Math.sin(t * 3));
      g.beginPath(); g.arc(lx + gx * 5, ly + gy * 5, 7, 0, Math.PI * 2); g.fill();
      g.fillStyle = withAlpha('#ffffff', 0.75);
      g.beginPath(); g.arc(lx - 4, ly - 5, 3.2, 0, Math.PI * 2); g.fill();
      if (lampsOn > 0.1) glowCircle(g, lx, ly, 36, '#bfe6ff', 0.55 * lampsOn);
      g.restore();
    }

    function drawLamps(g) {
      // nose housing so the lamps belong to the body
      fillRoundRect(g, 62, -122, 44, 66, 20, lampsOn > 0.02 ? lerpColor('#6f748a', '#cdd2e2', lampsOn * 0.5) : '#6f748a');
      fillRoundRect(g, 66, -117, 34, 14, 7, withAlpha('#ffffff', 0.25));
      for (const L of LAMPS) {
        g.fillStyle = '#4a4756';
        g.beginPath(); g.arc(L.x, L.y, L.r + 4, 0, Math.PI * 2); g.fill();
        g.fillStyle = lampsOn > 0.02 ? lerpColor('#6b6878', '#fff6dd', lampsOn) : '#6b6878';
        g.beginPath(); g.arc(L.x, L.y, L.r, 0, Math.PI * 2); g.fill();
        if (lampsOn > 0.02) {
          glowCircle(g, L.x + L.r * 0.8, L.y, L.r * 2.8, '#ffe6b0', 0.85 * lampsOn);
          g.fillStyle = withAlpha('#ffffff', 0.9 * lampsOn);
          g.beginPath(); g.arc(L.x - 3, L.y - 3, L.r * 0.42, 0, Math.PI * 2); g.fill();
        }
      }
    }

    function drawBeams(g) {
      const k = lampsOn;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.62 * k;
      const grad = cachedLinear(g, 'li-beam', 100, 0, 760, 0, [
        [0, withAlpha('#fff0c8', 0.95)],
        [0.45, withAlpha('#ffd79a', 0.34)],
        [1, withAlpha('#ffc98a', 0)]
      ]);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(100, -116);
      g.lineTo(760, -58);
      g.lineTo(760, 40);
      g.lineTo(100, -54);
      g.closePath();
      g.fill();
      // the pool of light the headlights lay on the sand
      g.globalAlpha = 0.42 * k;
      g.fillStyle = withAlpha('#ffd79a', 0.9);
      g.beginPath(); g.ellipse(330, 2, 250, 26, 0, 0, Math.PI * 2); g.fill();
      g.restore();
      glowCircle(g, 300, -30, 210, '#ffd79a', 0.34 * k);
    }

    /* ---------------------------------------------------------------- the energy pellet */
    function drawCapsuleBody(g, x, y, rot, sc, bright) {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.scale(sc, sc);
      capsulePath(g, 0, 0, FRAG.w, FRAG.h);
      g.fillStyle = lerpColor(DEF.flameColor, '#ff8e74', 0.10 + bright * 0.18);
      g.fill();
      capsulePath(g, 0, 0, FRAG.w - 13, FRAG.h - 13);
      g.fillStyle = withAlpha(lerpColor(DEF.glowColor, '#fff1d8', 0.30 + bright * 0.45), 0.95);
      g.fill();
      g.fillStyle = withAlpha('#ffffff', 0.55);
      capsulePath(g, -FRAG.w * 0.14, -FRAG.h * 0.24, FRAG.w * 0.38, FRAG.h * 0.18);
      g.fill();
      g.restore();
    }

    function drawPellet(g) {
      const beat = 0.5 - 0.5 * Math.cos(t * 2.6);       // the same 2.6 rad/s heartbeat as the slot
      const sc = RS * frag.scale * (1 + beat * 0.07 + (frag.grabbed ? 0.12 : 0));
      if (sc <= 0.01) return;
      // §2.1 "here I am": a small lunge toward the slot every ~3s
      const dx = slotW.x - frag.x, dy = slotW.y - frag.y;
      const d = Math.hypot(dx, dy) || 1;
      const lunge = Math.sin(nudge * Math.PI) * Math.min(40, d * 0.32);
      const bob = frag.grabbed ? 0 : Math.sin(t * 1.5) * 6;
      const x = frag.x + (dx / d) * lunge;
      const y = frag.y + (dy / d) * lunge + bob;

      glowCircle(g, x, y, FRAG.w * RS * (1.4 + beat * 0.45), DEF.flameColor, 0.85 + beat * 0.3);
      glowCircle(g, x, y, FRAG.w * RS * 0.72, DEF.glowColor, 0.8);
      drawCapsuleBody(g, x, y, frag.rot, sc, beat);

      // a soft tether of sparks toward the slot while it waits (light, not an arrow)
      if (!frag.grabbed && !inserted && engine.frameCount % 7 === 0) {
        const s = cam.worldToScreen(x, y);
        engine.particles.emit({
          x: s.x, y: s.y,
          vx: (hash(engine.frameCount) - 0.5) * 20,
          vy: 18 + hash(engine.frameCount + 2) * 26,
          r: (1.2 + hash(engine.frameCount + 4) * 1.6) * clamp(cam.scale, 0.5, 2),
          life: 0.5 + hash(engine.frameCount + 6) * 0.4,
          color: DEF.glowColor, drag: 0.94
        });
      }
    }

    return scene;
  }
};
