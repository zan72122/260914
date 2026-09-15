/**
 * hearth.js — 炉 / the one and only hub (DESIGN §1).
 *
 * Owns: the breathing flame, the platinum wire loop, the five sample dishes (distinct shapes
 * and idle motions), ヒノコ (eyes + hands, no mouth, never speaks), the shelf of returned
 * worlds, the brass spectroscope, the mute glyph, the unified flame-colour reveal timeline
 * (§1.5) and the continuous handoff into a world (§5.5.3/§5.5.4).
 *
 * NO TEXT IS EVER DRAWN. Guidance = motion, gaze, light, shape-fit and magnetic snap only.
 */

import { ELEMENTS, ELEMENT_BY_ID, HEARTH } from '../core/palette.js';
import { makeHandoff } from '../core/scene.js';
import { drawDiorama } from '../core/diorama.js';

// §新-4 the diorama art lives in core now; re-exported so importers keep working unchanged.
export { drawDiorama } from '../core/diorama.js';
import {
  clamp, lerp, t01 as norm, easeOutCubic, easeInOutCubic, easeOutBack, damp
} from '../core/tween.js';
import {
  fillRoundRect, polygon, glowCircle, radialFlood, withAlpha,
  lerpColor, shade, flameShape, vignette, softDisc
} from '../core/draw.js';

const REVEAL = {
  LAND: 0.0,
  SINK: 0.25,
  FULL: 0.75,
  FLOOD: 1.0,
  FRAGMENT: 1.30,
  DEPART: 1.60
};
const HOLD_FREE = 1.2;         // §S coloured-flame wait when nobody is touching the screen
const HOLD_BUSY = 3.0;         // §S ...extended while a finger is down (the child is reaching)
const SNAP_RATIO = 0.18;       // §1.4 magnetic snap radius
const SPECTRO_SNAP = 0.20;     // §3 spectroscope snap radius
const IDLE_WIRE_AFTER = 4.0;   // §C wire loop descends after 4s (8s was far too long)
const TAP_MOVE_RATIO = 0.09;   // §1.4 a press that strays less than this (of S) counts as a tap
const WOBBLE_BOOST_SEC = 3.2;  // §1.7 how long the "play me next" dish jumps after a return
const HOP_SEC = 1.8;           // §1.7 how long ヒノコ hops after a world comes home

/**
 * @param {Object} engine
 * @param {Object|null} handoff  return handoff from a world / the spectroscope (may be null)
 * @param {(r:Object)=>void} finish
 */
export function createHearth(engine, handoff, finish) {
  const rec = engine.gestures();
  const rng = engine.rng;

  // ---------------------------------------------------------------- state
  let t = 0;                       // scene clock
  let phase = 'idle';              // idle | carry | reveal | hold | outbound | returning
  let idleT = 0;                   // seconds since the last touch
  let element = null;              // ElementDef being burned
  let revealT = 0;
  let holdT = 0;
  let holdUsed = false;
  let outHandoff = null;
  let flameBreath = 0;
  let wire = { x: 0, y: 0, tx: 0, ty: 0, hot: 0, sunk: 0 };
  let carry = null;                // {def, x, y, fromX, fromY, auto, autoT, dishIndex}
  let spectro = { x: 0, y: 0, hx: 0, hy: 0, roll: 0, held: false, shown: false, intro: 0, demo: 0 };
  let hinoko = { x: 0, y: 0, gx: 0, gy: 0, hop: 0, cheer: 0, blink: 0, nextBlink: 2 };
  let gazeStage = 0;
  let gazeRounds = 2;
  let targetDish = 0;              // index of the dish that wobbles
  let dishAnim = [];               // per-dish {wob, lift, phase}
  let returning = null;            // {t, dur, elementId, slot, from}
  let ambientFade = 0;             // leftover colour when returning from the spectroscope
  let ambientColor = HEARTH.flameColor;
  let flameLoop = null;
  let pressPt = null;
  let pressMax = 0;               // furthest the finger strayed from the press point (css px)
  let pendingCameraReset = false;  // see enter(): the outgoing world still owns the camera
  let bgLayer = null;              // offscreen: static background (rebuilt on layout)
  let L = null;                    // layout
  let ctxRef = null;
  let started = false;

  const progress = () => engine.progress;

  // ---------------------------------------------------------------- layout

  function layout(w, h) {
    const S = Math.min(w, h);
    const portrait = h >= w;
    const ins = engine.insets;
    const lay = { w, h, S, portrait };

    if (portrait) {
      lay.flame = { x: w * 0.5, y: h * 0.415, hw: S * 0.125, hh: S * 0.325 };
      lay.shelf = { x: w * 0.5, y: h * 0.630, w: Math.min(w * 0.96, S * 2.0), h: S * 0.125, vertical: false };
      lay.dishArcX = w * 0.372;
      lay.dishBaseY = h * 0.80;
      lay.dishLift = h * 0.040;
      lay.dishR = S * 0.0965;          // §D ~1.15x bigger than round 1
      lay.hinoko = { x: w * 0.5 + S * 0.255, y: h * 0.405 - S * 0.025, r: S * 0.058 };
      lay.spectro = { x: w * 0.845, y: h * 0.485, r: S * 0.062 };   // §O right side = thumb reach
    } else {
      lay.flame = { x: w * 0.36, y: h * 0.60, hw: S * 0.125, hh: S * 0.32 };
      lay.shelf = { x: w * 0.105, y: h * 0.50, w: S * 0.21, h: Math.min(h * 0.80, S * 1.1), vertical: true };
      // the arc starts clear of the hearth bowl's right edge (flame.x + 0.25*S)
      lay.dishArcX = w * 0.190;
      lay.dishCenterX = w * 0.745;
      lay.dishBaseY = h * 0.79;
      lay.dishLift = h * 0.045;
      lay.dishR = S * 0.078;           // §D ~1.15x bigger than round 1
      lay.hinoko = { x: w * 0.36 - S * 0.24, y: h * 0.58, r: S * 0.055 };
      lay.spectro = { x: w * 0.30, y: h * 0.845, r: S * 0.062 };
    }

    // five dishes on a dome-shaped arc, ordered like ELEMENTS
    lay.dishes = [];
    const cx = portrait ? w * 0.5 : lay.dishCenterX;
    for (let i = 0; i < ELEMENTS.length; i++) {
      const tt = (i / (ELEMENTS.length - 1)) * 2 - 1;           // -1..1
      const x = cx + tt * lay.dishArcX;
      const y = lay.dishBaseY - (1 - tt * tt) * lay.dishLift;
      const p = engine.clampSafe(x, y, lay.dishR * 1.1);
      lay.dishes.push({ id: ELEMENTS[i].id, def: ELEMENTS[i], x: p.x, y: p.y, r: lay.dishR });
    }

    // shelf slots
    // Shelf slots. The mini-dioramas sit ON the ledge and are deliberately large (§1.7: the
    // shelf has to make a child want the next one), so their radius comes from the slot PITCH,
    // not from the thin board.
    lay.slots = [];
    const n = ELEMENTS.length;
    const pitch = (lay.shelf.vertical ? lay.shelf.h : lay.shelf.w) / n;
    const slotR = Math.min(pitch * 0.47, S * 0.085);
    for (let i = 0; i < n; i++) {
      if (lay.shelf.vertical) {
        const y = lay.shelf.y - lay.shelf.h / 2 + pitch * (i + 0.5);
        const q = engine.clampSafe(lay.shelf.x, y, slotR * 1.15);
        lay.slots.push({ x: q.x, y: q.y, r: slotR });
      } else {
        const x = lay.shelf.x - lay.shelf.w / 2 + pitch * (i + 0.5);
        const q = engine.clampSafe(x, lay.shelf.y - slotR * 0.22, slotR * 1.15);
        lay.slots.push({ x: q.x, y: q.y, r: slotR });
      }
    }

    const mp = engine.clampSafe(w - ins.right - S * 0.075, ins.top + S * 0.075, S * 0.05);
    lay.mute = { x: mp.x, y: mp.y, r: S * 0.048 };

    const sp = engine.clampSafe(lay.spectro.x, lay.spectro.y, lay.spectro.r * 1.2);
    lay.spectro.x = sp.x; lay.spectro.y = sp.y;

    const hp = engine.clampSafe(lay.hinoko.x, lay.hinoko.y, lay.hinoko.r * 1.4);
    lay.hinoko.x = hp.x; lay.hinoko.y = hp.y;

    L = lay;

    // keep live objects glued to the new layout
    if (!started || phase === 'idle') {
      wire.x = wire.tx = L.flame.x;
      wire.y = wire.ty = L.flame.y - L.flame.hh * 1.12;
    }
    if (!spectro.held) { spectro.x = L.spectro.x; spectro.y = L.spectro.y; }
    spectro.hx = L.spectro.x; spectro.hy = L.spectro.y;
    hinoko.x = L.hinoko.x; hinoko.y = L.hinoko.y;
    if (dishAnim.length !== L.dishes.length) {
      dishAnim = L.dishes.map((d, i) => ({ wob: 0, lift: 0, boost: 0, ph: i * 1.37 }));
    }
    if (carry && carry.dishIndex != null && !carry.auto && phase !== 'carry') {
      const d = L.dishes[carry.dishIndex];
      carry.x = d.x; carry.y = d.y;
    }
    buildBackgroundLayer(w, h);
  }

  // ---------------------------------------------------------------- helpers

  function totalPlays() {
    const p = progress().plays;
    return ELEMENTS.reduce((a, e) => a + (p[e.id] || 0), 0);
  }

  function pickTargetDish() {
    const p = progress().plays;
    let best = 0, bestN = Infinity;
    for (let i = 0; i < ELEMENTS.length; i++) {
      const n = p[ELEMENTS[i].id] || 0;
      if (n < bestN) { bestN = n; best = i; }
    }
    // §3: after the spectroscope appears, steer toward the OTHER red
    if (progress().spectroscopeUnlocked && element) {
      const otherRed = element.id === 'lithium' ? 'strontium' : element.id === 'strontium' ? 'lithium' : null;
      if (otherRed) {
        const i = ELEMENTS.findIndex((e) => e.id === otherRed);
        if (i >= 0) return i;
      }
    }
    return best;
  }

  function spectroActive() {
    return !!progress().spectroscopeUnlocked;
  }

  /** Nearest dish whose padded hit circle contains the point (the circles now overlap a little,
   *  so "nearest" rather than "first" keeps a finger between two dishes picking the right one). */
  function dishAt(x, y, padRatio) {
    const pad = 1 + (padRatio == null ? 0.6 : padRatio);
    let best = -1, bestD = Infinity;
    for (let i = 0; i < L.dishes.length; i++) {
      const d = L.dishes[i];
      const dist = Math.hypot(x - d.x, y - d.y);
      if (dist <= d.r * pad && dist < bestD) { best = i; bestD = dist; }
    }
    return best;
  }

  function flameDist(x, y) {
    return Math.hypot(x - L.flame.x, y - (L.flame.y - L.flame.hh * 0.45));
  }

  function currentFlameColor() {
    if (!element) return lerpColor(HEARTH.flameColor, ambientColor, ambientFade);
    const creep = norm(revealT, REVEAL.SINK, REVEAL.FULL);
    return lerpColor(HEARTH.flameColor, element.flameColor, creep);
  }

  // ---------------------------------------------------------------- actions

  function touched() { idleT = 0; }

  function pickUp(i) {
    const d = L.dishes[i];
    carry = { def: d.def, x: d.x, y: d.y, fromX: d.x, fromY: d.y, dishIndex: i, auto: false, autoT: 0 };
    phase = 'carry';
    engine.audio.play('pick');
    dishAnim[i].lift = 1;
  }

  function autoFly(i) {
    if (!carry) pickUp(i);
    carry.auto = true;
    carry.autoT = 0;
    carry.fromX = carry.x; carry.fromY = carry.y;
    engine.audio.play('whoosh');
  }

  function dropBack() {
    if (!carry) return;
    carry.auto = 'back';
    carry.autoT = 0;
    carry.fromX = carry.x; carry.fromY = carry.y;
    engine.audio.play('drop_back');
  }

  function ignite(def) {
    element = def;
    phase = 'reveal';
    revealT = 0;
    holdT = 0;
    holdUsed = false;
    carry = null;
    wire.sunk = 0;
    wire.hot = 0;
    engine.audio.play('snap');
    engine.audio.play('ignite');
  }

  function beginDeparture() {
    if (phase === 'outbound') return;
    phase = 'outbound';
    const origin = { x: L.flame.x, y: L.flame.y - L.flame.hh * 0.5 };
    // eject the "fragment" particles that the world will continue
    for (let i = 0; i < 46; i++) {
      const a = rng.range(0, Math.PI * 2);
      const s = rng.range(30, 260);
      engine.particles.emit({
        x: origin.x + Math.cos(a) * L.S * 0.04,
        y: origin.y + Math.sin(a) * L.S * 0.04,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
        r: rng.range(1.5, 4.5), life: rng.range(0.6, 1.6),
        color: rng.next() < 0.5 ? element.flameColor : element.glowColor,
        drag: 0.92, shape: rng.next() < 0.3 ? 'spark' : 'dot'
      });
    }
    outHandoff = makeHandoff({
      elementId: element.id,
      flameColor: element.flameColor,
      glowColor: element.glowColor,
      ambient: element.ambient,
      origin,
      particles: engine.particles.snapshot(),
      cameraZoom: revealZoom()
    });
    finish({ goto: element.id, handoff: outHandoff, worldId: element.id, completed: false });
  }

  function gotoSpectroscope() {
    if (!element) return;
    phase = 'outbound';
    const origin = { x: spectro.x, y: spectro.y };
    const h = makeHandoff({
      elementId: element.id,
      flameColor: element.flameColor,
      glowColor: element.glowColor,
      origin,
      particles: engine.particles.snapshot(),
      cameraZoom: 1
    });
    engine.audio.play('power_on');
    finish({ goto: 'spectroscope', handoff: h, worldId: 'spectroscope', completed: false });
  }

  function revealZoom() {
    if (phase !== 'reveal' && phase !== 'outbound') return 1;
    return 1 + easeInOutCubic(norm(revealT, REVEAL.FLOOD, REVEAL.DEPART + 0.6)) * 0.42;
  }

  // ---------------------------------------------------------------- gestures

  /**
   * §A The first finger of a 4-year-old goes to the biggest, brightest, moving thing: the flame.
   * Touching it (or ヒノコ) must never be a dead end — the flame throws sparks at the dish it
   * wants, kicks that dish into a big wobble and drops the wire loop over it right away.
   */
  function pointAtDish() {
    touched();
    const d = L.dishes[targetDish];
    if (!d) return;
    if (dishAnim[targetDish]) { dishAnim[targetDish].wob = 1; dishAnim[targetDish].boost = 1; }
    idleT = IDLE_WIRE_AFTER + 0.001;              // the loop comes down immediately
    hinoko.gx = d.x; hinoko.gy = d.y;
    engine.audio.play('whoosh');
    const fx = L.flame.x, fy = L.flame.y - L.flame.hh * 0.35;
    const ang = Math.atan2(d.y - fy, d.x - fx);
    for (let i = 0; i < 26; i++) {
      const a = ang + rng.sym(0.55);
      const sp = rng.range(0.55, 1.15) * Math.hypot(d.x - fx, d.y - fy);
      engine.particles.emit({
        x: fx + rng.sym(L.S * 0.03), y: fy + rng.sym(L.S * 0.03),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - L.S * 0.15,
        r: rng.range(1.4, 3.6), life: rng.range(0.5, 1.0),
        color: rng.next() < 0.5 ? d.def.glowColor : HEARTH.glowColor,
        gravity: L.S * 0.5, drag: 0.94, shape: rng.next() < 0.4 ? 'spark' : 'dot'
      });
    }
  }

  function installGestures() {
    // flame: always answers
    rec.onTap(
      (p) => (phase === 'idle' || phase === 'carry') && flameDist(p.x, p.y) <= L.S * 0.21,
      () => pointAtDish()
    );
    // ヒノコ: same answer, plus a hop, so poking the character is rewarding too
    rec.onTap(
      (p) => phase === 'idle' && Math.hypot(p.x - hinoko.x, p.y - hinoko.y) <= L.hinoko.r * 2.1,
      () => { hinoko.hop = HOP_SEC * 0.55; engine.audio.play('hop'); pointAtDish(); }
    );

    rec.onTap((p) => Math.hypot(p.x - L.mute.x, p.y - L.mute.y) <= L.mute.r * 1.8, () => {
      touched();
      const m = engine.audio.toggleMuted();
      if (!m) engine.audio.play('pick');
    });

    rec.onDrag(
      (p) => {
        if (phase === 'outbound' || phase === 'returning') return false;
        if (spectroGrabbable() && Math.hypot(p.x - spectro.x, p.y - spectro.y) <= L.spectro.r * 1.9) return true;
        return dishAt(p.x, p.y, 0.6) >= 0;
      },
      {
        onStart: (p) => {
          touched();
          pressPt = { x: p.x, y: p.y }; pressMax = 0;
          if (spectroGrabbable() && Math.hypot(p.x - spectro.x, p.y - spectro.y) <= L.spectro.r * 1.9) {
            spectro.held = true;
            holdFlameForScope();
            engine.audio.play('pick');
            return;
          }
          const i = dishAt(p.x, p.y, 0.6);
          if (i >= 0 && (phase === 'idle' || phase === 'carry')) pickUp(i);
        },
        onMove: (p) => {
          touched();
          if (pressPt) pressMax = Math.max(pressMax, Math.hypot(p.x - pressPt.x, p.y - pressPt.y));
          if (spectro.held) {
            spectro.x = p.x; spectro.y = p.y;
            if (scopeCanEnterFlame() && flameDist(p.x, p.y) <= L.S * SPECTRO_SNAP) {
              spectro.held = false;
              gotoSpectroscope();
            }
            return;
          }
          if (carry && !carry.auto) {
            carry.x = p.x; carry.y = p.y;
            if (flameDist(p.x, p.y) <= L.S * SNAP_RATIO) {
              const def = carry.def;
              carry.auto = true; carry.autoT = 0.45;   // already most of the way: snap fast
              carry.fromX = carry.x; carry.fromY = carry.y;
              carry.snap = true;
              void def;
            }
          }
        },
        onEnd: (p) => {
          const moved = Math.max(pressMax, pressPt ? Math.hypot(p.x - pressPt.x, p.y - pressPt.y) : 0);
          if (spectro.held) {
            spectro.held = false;
            if (scopeCanEnterFlame() && flameDist(p.x, p.y) <= L.S * SPECTRO_SNAP) { gotoSpectroscope(); return; }
            holdT = 0;                 // §R released without looking: the hold restarts, no punishment
            spectro.returning = true;
            return;
          }
          if (!carry) return;
          if (carry.auto) return;                     // already flying
          if (flameDist(p.x, p.y) <= L.S * SNAP_RATIO) {
            carry.auto = true; carry.autoT = 0.45; carry.snap = true;
            carry.fromX = carry.x; carry.fromY = carry.y;
            return;
          }
          // §1.4 tap alternative: a barely-moved press flies the sample anyway.
          // Deliberately DURATION-INDEPENDENT: a 4-year-old (or a slow event pipeline) can rest a
          // finger on a dish for seconds; only how far the finger strayed decides tap vs drag.
          if (moved <= L.S * TAP_MOVE_RATIO) { autoFly(carry.dishIndex); return; }
          dropBack();
        }
      },
      { snapTargets: [], returnOnRelease: true, hitPaddingRatio: 0.6 }
    );
  }

  /** §R "picked it up" must always mean "gets to look": reveal counts too. */
  function spectroGrabbable() {
    return spectroActive() && spectro.shown &&
      (phase === 'idle' || phase === 'hold' || phase === 'carry' || phase === 'reveal');
  }

  /** §R the flame accepts the spectroscope through the whole coloured-flame stretch */
  function scopeCanEnterFlame() {
    return !!element && (phase === 'hold' || phase === 'reveal');
  }

  /** §R grabbing the scope pins the flame at "fully coloured" until it is let go */
  function holdFlameForScope() {
    if (!element) return;
    if (phase === 'reveal') {
      revealT = Math.min(revealT, REVEAL.FULL);
      phase = 'hold';
      holdT = 0;
    }
  }

  // ---------------------------------------------------------------- lifecycle

  function enter(ctx) {
    ctxRef = ctx;
    started = true;
    layout(engine.width, engine.height);
    // The hearth draws entirely in screen space, so it never needs the shared camera. During a
    // continuous return the OUTGOING world is still drawing with that camera — resetting it here
    // would snap the world mid-pull-back. Defer the reset until the overlap has finished.
    if (handoff && handoff.progress < 1) pendingCameraReset = true;
    else engine.camera.resetToScreen();
    installGestures();

    gazeRounds = totalPlays() === 0 ? 2 : 1;   // §1.3 weaken guidance on revisits
    gazeStage = 0;
    targetDish = pickTargetDish();
    spectro.shown = spectroActive();
    spectro.intro = spectro.shown && !spectro.introDone ? 0 : 1;

    if (handoff && handoff.fromSpectroscope) {
      // resume the hub; the flame settles back to normal
      element = null;
      phase = 'idle';
      ambientColor = handoff.flameColor || HEARTH.flameColor;
      ambientFade = 0.85;
      idleT = 0;
    } else if (handoff && handoff.elementId) {
      // §1.7 a world is coming home: it shrinks into its shelf slot
      const idx = Math.max(0, ELEMENTS.findIndex((e) => e.id === handoff.elementId));
      phase = 'returning';
      returning = {
        t: 0, dur: 1.5, elementId: handoff.elementId, idx,
        from: handoff.origin || { x: engine.width / 2, y: engine.height / 2 },
        placed: false
      };
      ambientColor = handoff.flameColor || HEARTH.flameColor;
      ambientFade = 0.7;
      targetDish = pickTargetDish();
      if (handoff.particles) engine.particles.inject(handoff.particles);
    }

    flameLoop = engine.audio.play('flame_loop', { level: 0.5 });
  }

  function exit() {
    rec.destroy();
    if (flameLoop) { flameLoop.stop(); flameLoop = null; }
  }

  // ---------------------------------------------------------------- update

  function update(dt) {
    t += dt;
    if (pendingCameraReset && (!handoff || handoff.progress >= 1)) {
      pendingCameraReset = false;
      engine.camera.resetToScreen();
    }
    flameBreath = 0.5 - 0.5 * Math.cos((t / 2.8) * Math.PI * 2);   // §1.3 2.8s breathing
    if (ambientFade > 0) ambientFade = Math.max(0, ambientFade - dt * 0.9);   // §L shorter wash

    if (phase === 'idle') idleT += dt;
    else idleT = 0;

    // ---- idle dish motions
    for (let i = 0; i < dishAnim.length; i++) {
      const a = dishAnim[i];
      if (a.boost > 0) a.boost = Math.max(0, a.boost - dt / WOBBLE_BOOST_SEC);
      a.lift = lerp(a.lift, i === targetDish && phase === 'idle' ? 1 : 0, damp(0.9, dt));
      const want = (i === targetDish && phase === 'idle') ? (gazeStage < gazeRounds * 2 + 1 ? 1 : 0.45) : 0;
      a.wob = lerp(a.wob, want, damp(0.92, dt));
    }

    // ---- ヒノコ gaze choreography (§1.3)
    if (phase === 'idle') {
      const stages = gazeRounds * 2 + 1;
      const stage = Math.min(stages, Math.floor(Math.max(0, idleT - 0.6) / 0.8));
      gazeStage = stage;
      const d = L.dishes[targetDish];
      const lookFlame = stage > 0 && stage % 2 === 1;
      const gx = lookFlame ? L.flame.x : d.x;
      const gy = lookFlame ? L.flame.y - L.flame.hh * 0.55 : d.y;
      hinoko.gx = lerp(hinoko.gx || gx, gx, damp(0.86, dt));
      hinoko.gy = lerp(hinoko.gy || gy, gy, damp(0.86, dt));
    } else if (carry) {
      hinoko.gx = lerp(hinoko.gx, carry.x, damp(0.8, dt));
      hinoko.gy = lerp(hinoko.gy, carry.y, damp(0.8, dt));
    } else {
      hinoko.gx = lerp(hinoko.gx, L.flame.x, damp(0.88, dt));
      hinoko.gy = lerp(hinoko.gy, L.flame.y - L.flame.hh * 0.5, damp(0.88, dt));
    }
    hinoko.nextBlink -= dt;
    if (hinoko.nextBlink <= 0) { hinoko.blink = 0.16; hinoko.nextBlink = 2.2 + rng.next() * 3.4; }
    if (hinoko.blink > 0) hinoko.blink -= dt;
    if (hinoko.hop > 0) hinoko.hop = Math.max(0, hinoko.hop - dt);
    if (hinoko.cheer > 0) hinoko.cheer = Math.max(0, hinoko.cheer - dt);

    // ---- wire loop (§1.3 step 4)
    let wx = L.flame.x, wy = L.flame.y - L.flame.hh * 1.12;
    if (phase === 'idle' && idleT > IDLE_WIRE_AFTER) {
      const d = L.dishes[targetDish];
      wx = d.x; wy = d.y - L.S * 0.13 + Math.sin(t * 2) * L.S * 0.008;
    } else if (phase === 'carry' && carry) {
      wx = L.flame.x; wy = L.flame.y - L.flame.hh * 1.0;
    } else if (phase === 'reveal' || phase === 'hold' || phase === 'outbound') {
      const sink = norm(revealT, REVEAL.SINK, REVEAL.SINK + 0.35);
      wire.sunk = sink;
      wy = lerp(L.flame.y - L.flame.hh * 1.0, L.flame.y - L.flame.hh * 0.42, sink);
      wire.hot = clamp(norm(revealT, 0, 0.3) - sink * 0.6);
    }
    wire.tx = wx; wire.ty = wy;
    wire.x = lerp(wire.x, wire.tx, damp(0.86, dt));
    wire.y = lerp(wire.y, wire.ty, damp(0.86, dt));

    // ---- spectroscope
    if (spectroActive()) {
      spectro.shown = true;
      spectro.intro = Math.min(1, spectro.intro + dt * 0.8);
      if (spectro.intro >= 1) spectro.introDone = true;
      if (spectro.demo < 1 && spectro.intro >= 1 && totalPlays() > 0) spectro.demo = Math.min(1, spectro.demo + dt * 0.5);
      if (!spectro.held) {
        const k = damp(0.86, dt);
        spectro.x = lerp(spectro.x, spectro.hx, k);
        spectro.y = lerp(spectro.y, spectro.hy, k);
        spectro.roll = Math.sin(t * 2.1) * (scopeCanEnterFlame() ? 0.22 : 0.09);
      }
    }

    // ---- carried sample
    if (carry) {
      if (carry.auto === 'back') {
        carry.autoT += dt / 0.45;
        const k = easeOutCubic(clamp(carry.autoT));
        const d = L.dishes[carry.dishIndex];
        carry.x = lerp(carry.fromX, d.x, k);
        carry.y = lerp(carry.fromY, d.y, k);
        if (carry.autoT >= 1) { carry = null; phase = 'idle'; }
      } else if (carry.auto) {
        carry.autoT += dt / 0.8;                      // §1.4 tap alternative: 0.8s flight
        const k = easeInOutCubic(clamp(carry.autoT));
        const tx = L.flame.x, ty = L.flame.y - L.flame.hh * 0.62;
        carry.x = lerp(carry.fromX, tx, k);
        carry.y = lerp(carry.fromY, ty, k);
        if (carry.autoT >= 1) ignite(carry.def);
      }
    }

    // ---- reveal timeline (§1.5)
    if (phase === 'reveal') {
      revealT += dt;
      if (!holdUsed && spectroActive() && revealT >= REVEAL.FULL) {
        revealT = REVEAL.FULL;
        phase = 'hold';
        holdT = 0;
      }
      if (revealT >= REVEAL.DEPART) beginDeparture();
    } else if (phase === 'hold') {
      // §R while the scope is in a hand the flame simply waits — holding it always earns a look.
      // §S otherwise: 1.2s if nobody is touching, stretched to 3.0s while a finger is down.
      if (revealT < REVEAL.FULL) revealT = Math.min(REVEAL.FULL, revealT + dt);
      if (spectro.held) holdT = 0;
      else holdT += dt;
      const limit = engine.input.down ? HOLD_BUSY : HOLD_FREE;
      if (!spectro.held && holdT >= limit) { holdUsed = true; phase = 'reveal'; }
    } else if (phase === 'outbound') {
      revealT += dt;
    }

    // ---- returning world -> shelf (§1.7)
    if (phase === 'returning' && returning) {
      returning.t += dt;
      if (!returning.placed && returning.t >= returning.dur * 0.78) {
        returning.placed = true;
        engine.audio.play('shelf_place');
        engine.audio.play('hop');
        hinoko.hop = HOP_SEC; hinoko.cheer = HOP_SEC + 0.8;
        targetDish = pickTargetDish();
        if (dishAnim[targetDish]) { dishAnim[targetDish].wob = 1; dishAnim[targetDish].boost = 1; }
      }
      if (returning.t >= returning.dur) { phase = 'idle'; returning = null; idleT = 0; element = null; }
    }

    if (flameLoop) flameLoop.setLevel(0.35 + flameBreath * 0.2 + (element ? 0.3 : 0));
  }

  // ---------------------------------------------------------------- drawing

  /**
   * The static part of the room (gradient, floor, vignette) is baked into an offscreen layer at
   * layout time and blitted once per frame: three full-screen gradient fills per frame was the
   * single biggest raster cost in this scene. Only the flame's warm light is drawn live.
   */
  function buildBackgroundLayer(w, h) {
    try {
      const dpr = engine.dpr;
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(w * dpr));
      cv.height = Math.max(1, Math.round(h * dpr));
      const b = cv.getContext('2d');
      b.setTransform(dpr, 0, 0, dpr, 0, 0);
      b.fillStyle = HEARTH.bg0;
      b.fillRect(0, 0, w, h);
      const grad = b.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, HEARTH.bg0);
      grad.addColorStop(0.55, HEARTH.bg1);
      grad.addColorStop(1, shade(HEARTH.bg1, 1.35));
      b.fillStyle = grad;
      b.fillRect(0, 0, w, h);
      b.fillStyle = withAlpha(HEARTH.stone, 0.55);
      b.beginPath();
      b.moveTo(0, h);
      b.lineTo(0, h * (L.portrait ? 0.9 : 0.88));
      b.quadraticCurveTo(w * 0.5, h * (L.portrait ? 0.83 : 0.8), w, h * (L.portrait ? 0.9 : 0.88));
      b.lineTo(w, h);
      b.closePath();
      b.fill();
      vignette(b, w, h, 0.42);
      bgLayer = cv;
    } catch (e) {
      bgLayer = null;
    }
  }

  function drawBackground(g, w, h) {
    if (bgLayer) g.drawImage(bgLayer, 0, 0, w, h);
    else {
      g.fillStyle = HEARTH.bg1;
      g.fillRect(0, 0, w, h);
    }
    // live: the warm light the flame throws into the room
    const col = currentFlameColor();
    const amb = 0.34 + flameBreath * 0.08 + (element ? 0.2 : 0);
    radialFlood(g, L.flame.x, L.flame.y - L.flame.hh * 0.35, L.S * (0.86 + flameBreath * 0.07), col, amb * 0.62);
  }

  function drawHearthStone(g) {
    const f = L.flame, S = L.S;
    const col = currentFlameColor();
    const w = S * 0.50, h = S * 0.135;
    g.save();
    g.translate(f.x, f.y);
    // stone bowl
    g.fillStyle = HEARTH.stone;
    g.beginPath();
    g.moveTo(-w / 2, h * 0.1);
    g.quadraticCurveTo(-w * 0.42, h * 1.1, 0, h * 1.15);
    g.quadraticCurveTo(w * 0.42, h * 1.1, w / 2, h * 0.1);
    g.quadraticCurveTo(0, -h * 0.42, -w / 2, h * 0.1);
    g.closePath();
    g.fill();
    // lit rim
    g.strokeStyle = withAlpha(lerpColor(HEARTH.stoneLit, col, 0.5), 0.9);
    g.lineWidth = S * 0.012;
    g.beginPath();
    g.moveTo(-w / 2, h * 0.1);
    g.quadraticCurveTo(0, -h * 0.42, w / 2, h * 0.1);
    g.stroke();
    // ember bed
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * Math.PI - Math.PI;
      const ex = Math.cos(a) * w * 0.34;
      const ey = h * 0.02 + Math.sin(a) * h * 0.1;
      const k = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2 + i * 1.7));
      glowCircle(g, ex, ey, S * 0.03 * k, col, 0.5 * k);
    }
    g.restore();
  }

  function drawFlame(g) {
    const f = L.flame, S = L.S;
    const breath = 0.88 + flameBreath * 0.24;
    const swell = element ? 1 + 0.4 * easeOutBack(norm(revealT, REVEAL.FULL - 0.1, REVEAL.FULL + 0.35)) : 1;
    const hh = f.hh * breath * swell;
    const hw = f.hw * (0.94 + flameBreath * 0.12) * (1 + (swell - 1) * 0.6);
    const base = f.y;
    const creep = element ? norm(revealT, REVEAL.SINK, REVEAL.FULL) : 0;
    const col = element ? element.flameColor : HEARTH.flameColor;

    g.save();
    g.globalCompositeOperation = 'lighter';

    // warm outer body (always the hearth's own colour beneath)
    g.globalAlpha = 0.5;
    g.fillStyle = withAlpha(HEARTH.flameColor, 0.55);
    flameShape(g, f.x, base, hw * 1.18, hh * 1.06, S * 0.012, t * 1.6);
    g.fill();

    g.globalAlpha = 0.8;
    g.fillStyle = withAlpha(HEARTH.flameColor, 0.75);
    flameShape(g, f.x, base, hw * 0.86, hh * 0.86, S * 0.01, t * 2.1 + 1);
    g.fill();

    // the element's colour crawls up from the root (§1.5 t=0.25..0.75)
    if (creep > 0) {
      g.save();
      g.beginPath();
      g.rect(f.x - hw * 2, base - hh * 1.25 * creep, hw * 4, hh * 1.4 * creep + hh * 0.3);
      g.clip();
      g.globalAlpha = 0.85;
      g.fillStyle = withAlpha(col, 0.9);
      flameShape(g, f.x, base, hw * 1.12, hh * 1.02, S * 0.012, t * 1.6);
      g.fill();
      g.globalAlpha = 0.95;
      g.fillStyle = withAlpha(col, 0.95);
      flameShape(g, f.x, base, hw * 0.8, hh * 0.84, S * 0.01, t * 2.1 + 1);
      g.fill();
      g.restore();
    }

    // bright core
    g.globalAlpha = 0.95;
    g.fillStyle = creep > 0.8 ? withAlpha(lerpColor('#ffffff', col, 0.45), 0.95) : withAlpha(HEARTH.flameCore, 0.9);
    flameShape(g, f.x, base, hw * 0.36, hh * 0.46, S * 0.006, t * 2.7 + 2);
    g.fill();
    g.restore();

    glowCircle(g, f.x, base - hh * 0.3, hh * 1.1, element ? lerpColor(HEARTH.flameColor, col, creep) : HEARTH.glowColor, 0.5 + flameBreath * 0.15);

    // idle sparks
    if (engine.frameCount % 5 === 0 && phase !== 'outbound') {
      engine.particles.emit({
        x: f.x + rng.sym(hw * 0.5), y: base - hh * 0.2,
        vx: rng.sym(14), vy: -rng.range(30, 80),
        r: rng.range(0.8, 2.0), life: rng.range(0.5, 1.2),
        color: element ? lerpColor(HEARTH.flameColor, col, creep) : HEARTH.glowColor,
        drag: 0.96
      });
    }
  }

  /**
   * §C The wire must read as "a ring you put things in", not as a stick. It hangs as a slack
   * rope with a sag, and the ring at the end pulses in the TARGET DISH's own colour once it has
   * come down, so the eye connects ring -> dish without a word.
   */
  function drawWire(g) {
    const S = L.S;
    const topY = Math.max(L.portrait ? L.h * 0.09 : L.h * 0.11, engine.insets.top + 8);
    const descended = phase === 'idle' && idleT > IDLE_WIRE_AFTER;
    const tgt = L.dishes[targetDish];
    const hot = wire.hot;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
    const ringCol = hot > 0
      ? lerpColor(HEARTH.platinum, '#ffd08a', hot)
      : descended && tgt ? lerpColor(HEARTH.platinum, tgt.def.glowColor, 0.35 + 0.45 * pulse)
        : HEARTH.platinum;

    // rope: two passes (dark core + light highlight) with a real sag
    // §新-3 The rope is suspended over the RIM of the fire bowl, on whichever side the ring is
    // heading for, and the flame is drawn after it — so the rope never runs through the flame.
    const side = wire.x >= L.flame.x ? 1 : -1;
    const ax = L.flame.x + side * S * 0.21;
    const sag = Math.min(S * 0.16, Math.abs(wire.x - ax) * 0.42 + S * 0.03);
    const cx = (ax + wire.x) / 2;
    const cy = topY + (wire.y - topY) * 0.62 + sag;
    g.save();
    g.lineCap = 'round';
    g.strokeStyle = withAlpha('#6b6f78', 0.85);
    g.lineWidth = S * 0.018;
    g.beginPath();
    g.moveTo(ax, topY);
    g.quadraticCurveTo(cx, cy, wire.x, wire.y - S * 0.045);
    g.stroke();
    g.strokeStyle = withAlpha(HEARTH.platinum, 0.8);
    g.lineWidth = S * 0.008;
    g.beginPath();
    g.moveTo(ax, topY);
    g.quadraticCurveTo(cx, cy, wire.x, wire.y - S * 0.045);
    g.stroke();

    // the ring itself: thick, open, unmistakably a hole
    g.strokeStyle = withAlpha('#3b3f47', 0.9);
    g.lineWidth = S * 0.026;
    g.beginPath();
    g.ellipse(wire.x, wire.y, S * 0.052, S * 0.026, 0, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = ringCol;
    g.lineWidth = S * 0.017;
    g.beginPath();
    g.ellipse(wire.x, wire.y, S * 0.052, S * 0.026, 0, 0, Math.PI * 2);
    g.stroke();
    g.restore();

    if (hot > 0.02) glowCircle(g, wire.x, wire.y, S * 0.11 * hot, '#ffd08a', 0.75 * hot);
    if (descended && tgt) {
      glowCircle(g, wire.x, wire.y, S * (0.075 + 0.035 * pulse), tgt.def.glowColor, 0.30 + 0.35 * pulse);
    }
  }

  // ---- sample shapes (§1.2): shape + texture + idle motion, never colour alone
  function drawSample(g, def, x, y, r, k = 1) {
    g.save();
    g.translate(x, y);
    const S = L.S;
    switch (def.sampleShape) {
      case 'pebble': {
        const p = 0.5 - 0.5 * Math.cos((t / 2.4) * Math.PI * 2);   // 2.4s red pulse
        g.fillStyle = shade(def.sampleColor, 0.85);
        g.beginPath();
        g.ellipse(0, 0, r * 0.62, r * 0.52, 0.2, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = withAlpha('#ffffff', 0.35);
        g.beginPath();
        g.ellipse(-r * 0.18, -r * 0.18, r * 0.2, r * 0.13, 0.3, 0, Math.PI * 2);
        g.fill();
        glowCircle(g, 0, 0, r * (0.36 + p * 0.2), '#ff3b34', 0.55 + p * 0.4);
        break;
      }
      case 'coil': {
        const bob = Math.sin((t / 1.8) * Math.PI * 2) * r * 0.16;  // 1.8s spring bounce
        g.translate(0, bob);
        g.strokeStyle = def.sampleColor;
        g.lineWidth = r * 0.17;
        g.lineCap = 'round';
        g.beginPath();
        for (let i = 0; i <= 42; i++) {
          const a = (i / 42) * Math.PI * 5.2;
          const rr = r * 0.62 * (1 - i / 60);
          const px = Math.cos(a) * rr;
          const py = Math.sin(a) * rr * 0.42 + (i / 42) * r * 0.25 - r * 0.12;
          if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.stroke();
        g.strokeStyle = withAlpha('#ffd0a8', 0.5);
        g.lineWidth = r * 0.06;
        g.stroke();
        break;
      }
      case 'cubes': {
        const n = 6;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + 0.4;
          const rr = r * (i % 2 ? 0.34 : 0.2);
          const cx = Math.cos(a) * rr, cy = Math.sin(a) * rr * 0.6;
          const sz = r * (0.2 + (i % 3) * 0.045);
          g.save();
          g.translate(cx, cy);
          g.rotate(0.2 + i * 0.3);
          g.fillStyle = def.sampleColor;
          fillRoundRect(g, -sz / 2, -sz / 2, sz, sz, sz * 0.22);
          g.fillStyle = withAlpha('#9fb0c8', 0.55);
          fillRoundRect(g, -sz / 2, sz * 0.12, sz, sz * 0.38, sz * 0.18);
          g.restore();
          // travelling glint
          const gl = (t * 0.7 + i / n) % 1;
          if (gl < 0.18) {
            glowCircle(g, cx + sz * 0.3, cy - sz * 0.35, r * 0.2, '#ffffff', 0.8 * (1 - gl / 0.18));
          }
        }
        break;
      }
      case 'needles': {
        const sh = Math.sin(t * 24) * r * 0.028;                   // high-frequency shiver
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i - 2) * 0.28;
          g.save();
          g.rotate(a * 0.55);
          g.translate(sh * (i % 2 ? 1 : -1), 0);
          g.fillStyle = i % 2 ? def.sampleColor : shade(def.sampleColor, 0.82);
          g.beginPath();
          g.moveTo(0, -r * 0.66);
          g.lineTo(r * 0.09, r * 0.28);
          g.lineTo(-r * 0.09, r * 0.28);
          g.closePath();
          g.fill();
          g.restore();
        }
        g.fillStyle = withAlpha('#ffffff', 0.25);
        g.beginPath();
        g.ellipse(0, r * 0.3, r * 0.42, r * 0.11, 0, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'plate':
      default: {
        const tilt = Math.sin(t * 0.9) * 0.5;                      // slow orbiting tilt
        g.save();
        g.scale(1, 0.42 + Math.abs(Math.cos(t * 0.9)) * 0.45);
        g.rotate(tilt * 0.25);
        g.fillStyle = def.sampleColor;
        polygon(g, 0, 0, r * 0.62, 6, 0.2);
        g.fill();
        g.fillStyle = withAlpha('#dfffe0', 0.35 + 0.35 * Math.abs(Math.sin(t * 0.9)));
        polygon(g, 0, -r * 0.06, r * 0.44, 6, 0.2);
        g.fill();
        g.restore();
        break;
      }
    }
    void k; void S;
    g.restore();
  }

  function drawDish(g, i) {
    const d = L.dishes[i];
    const a = dishAnim[i];
    const S = L.S;
    const wob = a.wob;
    // §1.7: after a world comes home the "play me next" dish must be impossible to miss —
    // a real hop (lift), a real tilt and a small scale pop, not a shiver.
    const boost = a.boost * a.boost;
    const hopK = Math.abs(Math.sin(t * 4.4 + a.ph));
    const lift = -a.lift * S * 0.012
      + Math.sin(t * 5.2 + a.ph) * wob * S * 0.012
      - hopK * boost * S * 0.055;
    const rot = Math.sin(t * 4.6 + a.ph) * wob * 0.09 + Math.sin(t * 4.4 + a.ph) * boost * 0.20;
    const pop = 1 + boost * 0.10 * hopK;
    const held = carry && carry.dishIndex === i;

    g.save();
    g.translate(d.x, d.y + lift);
    g.rotate(rot);
    if (pop !== 1) g.scale(pop, pop);

    // attention halo for the dish we want touched
    if (wob > 0.02 || boost > 0.02) {
      glowCircle(g, 0, 0, d.r * (1.5 + 0.25 * Math.sin(t * 3) + boost * 0.9),
        boost > 0.02 ? d.def.glowColor : HEARTH.glowColor, 0.28 * wob + 0.5 * boost);
    }

    // §D every dish carries a faint rim light so all five are findable on the dark floor
    glowCircle(g, 0, d.r * 0.30, d.r * 1.25, d.def.glowColor, 0.13);

    // dish bowl
    g.fillStyle = shade(HEARTH.stone, 1.5);
    g.beginPath();
    g.ellipse(0, d.r * 0.34, d.r * 0.88, d.r * 0.37, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = shade(HEARTH.stoneLit, 1.1);
    g.beginPath();
    g.ellipse(0, d.r * 0.22, d.r * 0.81, d.r * 0.30, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = withAlpha('#000000', 0.35);
    g.beginPath();
    g.ellipse(0, d.r * 0.20, d.r * 0.70, d.r * 0.24, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = withAlpha(d.def.glowColor, 0.42);
    g.lineWidth = Math.max(1, d.r * 0.055);
    g.beginPath();
    g.ellipse(0, d.r * 0.22, d.r * 0.81, d.r * 0.30, 0, Math.PI * 1.04, Math.PI * 1.96);
    g.stroke();

    if (!held) {
      drawSample(g, d.def, 0, -d.r * 0.02, d.r);
      if (d.def.domed) drawDome(g, 0, d.r * 0.08, d.r * 0.82);
    }
    g.restore();
  }

  function drawDome(g, x, y, r) {
    g.save();
    g.translate(x, y);
    g.beginPath();
    g.arc(0, 0, r, Math.PI, 0);
    g.closePath();
    g.fillStyle = withAlpha('#bfe2ff', 0.13);
    g.fill();
    g.strokeStyle = withAlpha('#dff1ff', 0.4);
    g.lineWidth = r * 0.06;
    g.stroke();
    g.strokeStyle = withAlpha('#ffffff', 0.5);
    g.lineWidth = r * 0.07;
    g.beginPath();
    g.arc(0, 0, r * 0.72, Math.PI * 1.15, Math.PI * 1.45);
    g.stroke();
    g.restore();
  }

  function drawCarry(g) {
    if (!carry) return;
    const S = L.S;
    const r = L.dishR * 0.95;
    glowCircle(g, carry.x, carry.y, r * 1.6, HEARTH.glowColor, 0.35);
    drawSample(g, carry.def, carry.x, carry.y, r);
    if (carry.def.domed) drawDome(g, carry.x, carry.y + r * 0.1, r * 0.82);
    void S;
  }

  /**
   * ヒノコ — eyes and hands only, never a mouth, never a word (§1.3).
   * §B At phone size a few pixels of pupil offset is invisible, so the WHOLE BODY leans
   * 8-10 degrees toward whatever they are looking at, the pupils are large with a white
   * sclera, and the hands swing to the side they are pointing at.
   */
  function drawHinoko(g) {
    const S = L.S;
    const r = L.hinoko.r;
    const hopK = clamp(hinoko.hop / HOP_SEC);
    const hop = hopK > 0 ? Math.abs(Math.sin(t * 9.5)) * S * 0.10 * (0.35 + 0.65 * hopK) : 0;
    const x = hinoko.x;
    const y = hinoko.y - hop + Math.sin(t * 1.6) * S * 0.006;
    const cheer = hinoko.cheer > 0 ? 1 : 0;

    const gx = hinoko.gx || x, gy = hinoko.gy || y;
    const dx = gx - x, dy = gy - y;
    const dist = Math.hypot(dx, dy) || 1;
    const dirX = Math.max(-1, Math.min(1, dx / Math.max(S * 0.18, dist)));
    const lean = cheer ? 0 : dirX * 0.17;                 // up to ~10 degrees

    g.save();
    g.translate(x, y + r * 0.9);
    g.rotate(lean);
    g.translate(-x, -(y + r * 0.9));

    // ember body
    glowCircle(g, x, y, r * 2.4, HEARTH.hinoko, 0.5);
    softDisc(g, x, y, r, '#ffe9b0', withAlpha(HEARTH.hinoko, 0.1));
    g.save();
    g.fillStyle = withAlpha('#ffb54a', 0.9);
    g.beginPath();
    g.ellipse(x, y + r * 0.1, r * 0.86, r * 0.9, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = withAlpha('#fff0c8', 0.95);
    g.beginPath();
    g.ellipse(x, y, r * 0.70, r * 0.74, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // eyes: big sclera + big pupils so the direction is legible on a phone
    const ang = Math.atan2(dy, dx);
    const look = Math.min(r * 0.20, dist * 0.14);
    const ex = Math.cos(ang) * look, ey = Math.sin(ang) * look;
    const eo = r * 0.30;
    const blink = hinoko.blink > 0 ? 0.16 : 1;
    for (const sgn of [-1, 1]) {
      const cxE = x + sgn * eo + dirX * r * 0.06;
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.ellipse(cxE, y - r * 0.05, r * 0.27, r * 0.30 * blink, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = withAlpha('#2a1410', 0.25);
      g.beginPath();
      g.ellipse(cxE, y - r * 0.05, r * 0.27, r * 0.30 * blink, 0, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#231108';
      g.beginPath();
      g.ellipse(cxE + ex, y - r * 0.05 + ey, r * 0.16, r * 0.19 * blink, 0, 0, Math.PI * 2);
      g.fill();
      if (blink > 0.5) {                                   // catch-light: makes the eye read as an eye
        g.fillStyle = withAlpha('#ffffff', 0.9);
        g.beginPath();
        g.arc(cxE + ex + r * 0.05, y - r * 0.11 + ey, r * 0.05, 0, Math.PI * 2);
        g.fill();
      }
    }

    // hands: raised when cheering, otherwise swung toward what ヒノコ is looking at
    const hy = cheer ? y - r * 1.0 : y + r * 0.38;
    for (const sgn of [-1, 1]) {
      const hx = x + sgn * r * (cheer ? 0.95 : 1.05) + (cheer ? 0 : dirX * r * 0.35);
      const bob = Math.sin(t * 6 + sgn) * r * 0.06 * (cheer ? 1 : 0.35);
      glowCircle(g, hx, hy + bob, r * 0.55, HEARTH.hinoko, 0.5);
      g.fillStyle = withAlpha('#ffd98a', 0.95);
      g.beginPath();
      g.arc(hx, hy + bob, r * 0.22, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  // ---- shelf and mini dioramas (§1.7)
  function drawShelf(g) {
    const s = L.shelf, S = L.S;
    g.save();
    if (s.vertical) {
      g.fillStyle = HEARTH.wood;
      fillRoundRect(g, s.x - s.w / 2, s.y - s.h / 2, s.w, s.h, s.w * 0.28);
      g.fillStyle = withAlpha(HEARTH.woodLit, 0.7);
      fillRoundRect(g, s.x - s.w / 2, s.y - s.h / 2, s.w * 0.22, s.h, s.w * 0.14);
    } else {
      g.fillStyle = HEARTH.wood;
      fillRoundRect(g, s.x - s.w / 2, s.y - s.h / 2, s.w, s.h, s.h * 0.3);
      g.fillStyle = withAlpha(HEARTH.woodLit, 0.7);
      fillRoundRect(g, s.x - s.w / 2, s.y - s.h / 2, s.w, s.h * 0.22, s.h * 0.12);
    }
    g.restore();

    for (let i = 0; i < ELEMENTS.length; i++) {
      const def = ELEMENTS[i];
      const n = progress().plays[def.id] || 0;
      const slot = L.slots[i];
      if (n <= 0) {
        // empty socket: a real hole in the ledge (an invitation, not a label)
        g.save();
        const hy = L.shelf.vertical ? slot.y : L.shelf.y;
        g.fillStyle = withAlpha('#000000', 0.55);
        g.beginPath();
        g.ellipse(slot.x, hy, slot.r * 0.52, slot.r * 0.30, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = withAlpha(HEARTH.woodLit, 0.5);
        g.lineWidth = Math.max(1, slot.r * 0.07);
        g.beginPath();
        g.ellipse(slot.x, hy - slot.r * 0.05, slot.r * 0.52, slot.r * 0.30, 0, 0, Math.PI * 2);
        g.stroke();
        g.restore();
        continue;
      }
      const arriving = returning && returning.idx === i && !returning.placed;
      if (arriving) continue;   // it is still flying in
      drawDiorama(g, def, slot.x, slot.y, slot.r, 1, t);
    }
    void S;
  }

  function drawSpectroscope(g) {
    if (!spectro.shown) return;
    const S = L.S;
    const r = L.spectro.r;
    const intro = easeOutCubic(spectro.intro);
    const x = spectro.x, y = spectro.y - (1 - intro) * S * 0.12;
    const glow = scopeCanEnterFlame() ? 0.5 + 0.5 * Math.sin(t * 5) : 0.12;
    g.save();
    g.translate(x, y);
    g.rotate(spectro.roll + (1 - intro) * 2.4);
    glowCircle(g, 0, 0, r * 2.2, '#ffd79a', 0.28 + glow * 0.5);
    // brass tube
    g.fillStyle = '#c9963f';
    fillRoundRect(g, -r * 1.05, -r * 0.34, r * 1.7, r * 0.68, r * 0.3);
    g.fillStyle = withAlpha('#ffe7ab', 0.75);
    fillRoundRect(g, -r * 1.0, -r * 0.28, r * 1.6, r * 0.2, r * 0.1);
    // prism head
    g.fillStyle = withAlpha('#bfe6ff', 0.85);
    g.beginPath();
    g.moveTo(r * 0.62, -r * 0.62);
    g.lineTo(r * 1.15, r * 0.5);
    g.lineTo(r * 0.12, r * 0.5);
    g.closePath();
    g.fill();
    g.fillStyle = withAlpha('#ffffff', 0.5);
    g.beginPath();
    g.moveTo(r * 0.62, -r * 0.5);
    g.lineTo(r * 0.9, r * 0.35);
    g.lineTo(r * 0.5, r * 0.35);
    g.closePath();
    g.fill();
    // eyepiece
    g.fillStyle = '#7a5a26';
    g.beginPath();
    g.ellipse(-r * 1.02, 0, r * 0.2, r * 0.36, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
    if (scopeCanEnterFlame()) {
      // it leans toward the coloured flame
      const a = Math.atan2(L.flame.y - y, L.flame.x - x);
      glowCircle(g, x + Math.cos(a) * r * 1.4, y + Math.sin(a) * r * 1.4, r * 0.7, element ? element.glowColor : '#fff', 0.5 * glow);
    }
  }

  function drawMute(g) {
    const m = L.mute, S = L.S;
    const r = m.r;
    const muted = engine.audio.muted;
    g.save();
    g.translate(m.x, m.y);
    g.fillStyle = withAlpha('#000000', 0.28);
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    const col = muted ? withAlpha('#ffffff', 0.45) : withAlpha('#ffe7bd', 0.95);
    g.fillStyle = col;
    // speaker body (drawn glyph — never a font)
    g.beginPath();
    g.moveTo(-r * 0.46, -r * 0.16);
    g.lineTo(-r * 0.18, -r * 0.16);
    g.lineTo(0.02 * r, -r * 0.46);
    g.lineTo(0.02 * r, r * 0.46);
    g.lineTo(-r * 0.18, r * 0.16);
    g.lineTo(-r * 0.46, r * 0.16);
    g.closePath();
    g.fill();
    g.strokeStyle = col;
    g.lineWidth = r * 0.1;
    g.lineCap = 'round';
    if (!muted) {
      for (let i = 1; i <= 2; i++) {
        g.beginPath();
        g.arc(r * 0.06, 0, r * (0.2 + i * 0.16), -0.9, 0.9);
        g.stroke();
      }
    } else {
      g.beginPath();
      g.moveTo(r * 0.24, -r * 0.24);
      g.lineTo(r * 0.6, r * 0.24);
      g.moveTo(r * 0.6, -r * 0.24);
      g.lineTo(r * 0.24, r * 0.24);
      g.stroke();
    }
    g.restore();
    void S;
  }

  /**
   * §1.7 the world shrinks into its shelf slot. §新-1: the mini-diorama is drawn for a 35px
   * globe, so it must NOT be blown up across the screen — for the first third of the return the
   * outgoing world carries the picture by itself, and the globe then fades in at a modest size
   * and condenses into the slot.
   */
  function drawReturning(g) {
    if (!returning) return;
    const k = clamp(returning.t / returning.dur);
    if (k < 0.3) return;                       // the world's own pull-back is the picture here
    const e = easeInOutCubic(k);
    const slot = L.slots[returning.idx];
    const def = ELEMENT_BY_ID[returning.elementId];
    if (!def) return;
    const x = lerp(returning.from.x, slot.x, e);
    const y = lerp(returning.from.y, slot.y, e);
    const r = lerp(Math.max(L.w, L.h) * 0.14, slot.r, e);
    const alpha = clamp((k - 0.25) / 0.3);
    g.save();
    drawDiorama(g, def, x, y, r, alpha, t);
    g.restore();
  }

  function drawFlood(g, w, h) {
    if (!element) return;
    const S = L.S;
    const k = norm(revealT, REVEAL.FLOOD, REVEAL.DEPART + 0.8);
    if (k <= 0) return;
    const r = lerp(S * 0.2, Math.hypot(w, h) * 1.1, easeOutCubic(k));
    // §L the flood used to saturate the screen to one flat colour for ~1s. Peak alpha is now
    // ~0.75x and it eases back down after the peak, so both scenes stay readable. Still no cut.
    // §L rise fast, hold the peak for only ~0.4s, then ease down; peak alpha cut another ~0.8x.
    const peak = k < 0.28 ? k / 0.28 : k < 0.56 ? 1 : Math.max(0.35, 1 - (k - 0.56) / 0.44 * 0.65);
    radialFlood(g, L.flame.x, L.flame.y - L.flame.hh * 0.5, r, element.flameColor, 0.16 + 0.34 * peak);
    // §1.5 t=1.30 the particles gather into the fragment
    if (revealT >= REVEAL.FRAGMENT) {
      engine.particles.attract(L.flame.x, L.flame.y - L.flame.hh * 0.6, 900, 1 / 60);
      const fk = norm(revealT, REVEAL.FRAGMENT, REVEAL.DEPART);
      glowCircle(g, L.flame.x, L.flame.y - L.flame.hh * 0.6, S * (0.06 + fk * 0.1), '#ffffff', 0.5 + fk * 0.5);
    }
  }

  // ---------------------------------------------------------------- draw

  function draw(g) {
    if (!L) layout(engine.width, engine.height);
    const w = L.w, h = L.h;
    const outAlpha = (phase === 'outbound' && handoffOut()) ? 1 - clamp(outHandoff.progress * 1.15) : 1;

    g.save();
    // camera push-in toward the flame during the reveal (§1.5 t=1.0)
    const z = revealZoom();
    if (z !== 1) {
      g.translate(L.flame.x, L.flame.y - L.flame.hh * 0.4);
      g.scale(z, z);
      g.translate(-L.flame.x, -(L.flame.y - L.flame.hh * 0.4));
    }
    g.globalAlpha = outAlpha;

    drawBackground(g, w, h);
    drawShelf(g);
    drawHearthStone(g);
    drawWire(g);        // §新-3 behind the flame
    drawFlame(g);
    for (let i = 0; i < L.dishes.length; i++) drawDish(g, i);
    drawCarry(g);
    drawSpectroscope(g);
    drawHinoko(g);
    drawFlood(g, w, h);
    if (phase === 'returning') drawReturning(g);
    g.restore();

    // HUD-ish, never scaled, always inside the safe area
    g.save();
    g.globalAlpha = outAlpha;
    drawMute(g);
    g.restore();

    // incoming-from-spectroscope wash
    if (ambientFade > 0) {
      g.save();
      g.globalAlpha = ambientFade * 0.26;
      radialFlood(g, w / 2, h / 2, Math.hypot(w, h) * 0.7, ambientColor, 0.6);
      g.restore();
    }
  }

  function handoffOut() { return !!outHandoff; }

  // ---------------------------------------------------------------- debug

  function debugState() {
    return {
      phase,
      elementId: element ? element.id : null,
      revealT: Math.round(revealT * 1000) / 1000,
      holdT: Math.round(holdT * 1000) / 1000,
      idleT: Math.round(idleT * 100) / 100,
      targetDish: L ? L.dishes[targetDish].id : null,
      carrying: carry ? carry.def.id : null,
      spectroscopeUnlocked: spectroActive(),
      muted: engine.audio.muted,
      wireDown: phase === 'idle' && idleT > IDLE_WIRE_AFTER
    };
  }

  function hitPoints() {
    if (!L) return [];
    const S = L.S;
    const out = [];
    for (const d of L.dishes) out.push({ id: 'dish:' + d.id, x: d.x, y: d.y, r: d.r });
    const fp = engine.clampSafe(L.flame.x, L.flame.y - L.flame.hh * 0.45, S * 0.1);
    out.push({ id: 'flame', x: fp.x, y: fp.y, r: S * SNAP_RATIO });
    if (spectro.shown) {
      const sp = engine.clampSafe(spectro.x, spectro.y, L.spectro.r);
      out.push({ id: 'spectroscope', x: sp.x, y: sp.y, r: L.spectro.r });
    }
    out.push({ id: 'mute', x: L.mute.x, y: L.mute.y, r: L.mute.r });
    return out;
  }

  /** window.__game.complete(): burn the currently suggested dish right now. */
  function complete() {
    if (phase === 'idle' && L) ignite(L.dishes[targetDish].def);
  }

  // ---------------------------------------------------------------- scene

  return {
    id: 'hearth',
    enter,
    exit,
    update,
    draw,
    layout,
    debugState,
    hitPoints,
    complete,
    onPointerDown(p) { touched(); rec.down(p); },
    onPointerMove(p) { rec.move(p); },
    onPointerUp(p) { rec.up(p); },
    /** test helper used by __game.goto('<element>') from the hearth */
    _ignite: (id) => { const d = ELEMENT_BY_ID[id]; if (d) ignite(d); },
    get _phase() { return phase; }
  };
}

export default { id: 'hearth', createHearth };
