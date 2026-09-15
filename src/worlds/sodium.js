/**
 * sodium.js — ナトリウム (Na): 「塩の食卓」→「黄色く灯る夜の街」 (DESIGN §2.3).
 *
 * Two stages, one continuous camera move, no cut:
 *   Stage 1 — 夕方の食卓: a dull boiled potato under a cluster of WHITE CUBIC salt crystals
 *             and a few yellow light droplets. Tapping anywhere sprinkles salt onto the
 *             potato; after 3 sprinkles the potato turns glossy, the steam swells, ヒノコ
 *             cheers — and ONE salt cube floats up and begins to GLOW YELLOW *without
 *             changing shape*, then drifts out through the window (§2.3 science note:
 *             this is "the same element lives here too", NOT a transformation).
 *   Stage 2 — 夜の街: the camera tilts up and rises (camera.tiltTo + camera.panTo) to a row
 *             of five unlit sodium street lamps whose hoods are dark hollows breathing
 *             faintly yellow (empty-slot variant). The glowing cube enters the first lamp
 *             and vanishes inside it. Tapping (or dragging across) the lamps lights them;
 *             after 3 the rest chain-light. When all five burn, the WHOLE screen — shadows
 *             included — is tinted sodium yellow and the name is spoken ONCE.
 *
 * Science rules honoured here: no silvery metal anywhere; the salt is drawn as white cubic
 * crystals from the first frame; the cube keeps its shape when it glows and when it enters
 * the lamp; the table and the street are NOT cause and effect, only two homes of one element.
 *
 * NO TEXT IS EVER DRAWN. No ctx.filter. Gradients cached.
 */

import { ELEMENT_BY_ID } from '../core/palette.js';
import { makeHandoff } from '../core/scene.js';
import { clamp, lerp, damp, easeOutCubic, easeInOutCubic, easeOutBack } from '../core/tween.js';
import {
  withAlpha, lerpColor, glowCircle, radialFlood, applyAmbient, vignette,
  fillRoundRect, cachedLinear, ellipse
} from '../core/draw.js';

const DEF = ELEMENT_BY_ID['sodium'];

// ---------------------------------------------------------------- world constants
// The camera zoom is chosen per layout so that VH world units of HEIGHT are visible in
// both orientations; only the visible WIDTH differs, and every x is derived from it.
const VH = 820;
const TABLE_Y = 1000;          // world y of the dinner table stage centre
const STREET_Y = 0;            // world y of the street stage centre

const NEED_TAPS = 3;           // §2.3 three sprinkles is "done"
const MAX_TAPS = 20;           // but up to twenty are welcome
const LAMP_N = 5;
const CHAIN_AFTER = 4;         // 4 lamps lit by hand -> the last one chains (§review H)

const T_LIFT = 0.45;           // s after the 3rd sprinkle: one cube lifts and starts to glow
const LIFT_FLY = 0.90;         // cube: salt cluster -> hovering just inside the window
const WAIT_AUTO = 4.0;         // the cube waits to be sent; after this it leaves by itself
const RISE_DUR = 2.00;
const FLY_DUR = 1.90;          // cube: window -> inside the first lamp
const TINT_DUR = 0.70;         // how long the whole screen takes to turn yellow
const HOLD_AFTER = 2.20;       // savour the yellow street before pulling back
const LEAVE_DUR = 1.20;

const SALT_WHITE = DEF.sampleColor;   // '#f2f4f8' — crystal white, never metal silver
const POTATO_DULL = '#b0834a';
const POTATO_GLOSSY = '#dcab63';

/** stable pseudo-random so stars/buildings never jitter between layouts */
function hash(i) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
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

  /**
   * @param {Object} engine
   * @param {Object|null} handoff
   * @param {(r:Object)=>void} finish
   */
  createWorld(engine, handoff, finish) {
    const rec = engine.gestures();
    const cam = engine.camera;

    // ------------------------------------------------------------- state
    let L = null;
    let t = 0;
    let phase = 'intro';
    let stage = 1;
    let A = 1;                    // global fade-in alpha (handoff overlap)

    // stage 1
    let saltTaps = 0;
    let holding = false;
    let holdT = 0;
    let lastHoldSprinkle = 0;
    let sprinkledWhileHolding = false;
    let floats = [];              // the fragment: floating white salt cubes
    let drops = [];               // the fragment: yellow light droplets
    let falling = [];             // salt on its way down to the potato
    let landed = [];              // salt resting on the potato (offsets from its centre)
    let gloss = 0;
    let steam = 0.34;
    let potatoHop = 0;
    let nextPotatoHop = 1.1;
    let punch = 0;
    let idleT = 0;                // seconds since the child last did something
    let nudge = 0;                // stage 1: the salt dips toward the potato
    const hin = { gx: 0, gy: 0, hop: 0, cheer: 0, blink: 0, nextBlink: 2.2, gaze: 0, gazeT: 0 };

    // transition
    let climaxT = -1;
    let lifted = false;
    let traveler = null;          // {x,y,glow,k,mode,from,ctrl,to}
    let waiting = false;          // the glowing cube hovers at the window, asking to be sent
    let waitT = 0;
    let riseT = -1;
    let tiltStage = 0;

    // stage 2
    let lamps = [];
    let litCount = 0;
    let chainT = -1;
    let allLitAt = -1;
    let tint = 0;
    let spoken = false;
    let completeAt = -1;
    let leaveK = 0;
    let finished = false;
    let anchor = { x: 0, y: 0 };

    for (let i = 0; i < LAMP_N; i++) {
      lamps.push({ x: 0, lit: false, k: 0, primed: 0, ph: i * 0.7, flick: 0, nudge: 0 });
    }

    // ------------------------------------------------------------- layout

    function layout(w, h) {
      cam.recompute();
      const scale = h / VH;
      const zoom = scale / (cam.baseScale || 1);
      // half the visible width in world units, shrunk to stay clear of the safe-area insets
      const ins = engine.insets;
      const hx = (w - 2 * Math.max(ins.left, ins.right)) / scale / 2;
      const pr = Math.min(hx * 0.56, 118);

      L = {
        w, h, S: Math.min(w, h), scale, hx, zoom,
        tableEdgeY: TABLE_Y + 40,
        potato: { x: 0, y: TABLE_Y + 130, rx: pr, ry: pr * 0.76 },
        plate: { x: 0, y: TABLE_Y + 172, rx: pr * 1.66, ry: pr * 0.48 },
        hinoko: { x: -Math.min(hx * 0.66, 238), y: TABLE_Y - 12, r: Math.min(hx * 0.26, 48) },
        win: { x: Math.min(hx * 0.56, 236), y: TABLE_Y - 210, hw: Math.min(hx * 0.30, 96), hh: 74 },
        salt: { x: 0, y: TABLE_Y - 60, spread: Math.min(hx * 0.40, 104) },
        spacing: Math.min(hx * 0.34, 152),
        lampBaseY: 178,
        lampTopY: -105,
        hoodH: 34,
        roadY: 168
      };
      L.hoodHalf = Math.min(L.spacing * 0.36, 34);
      L.poleW = Math.max(9, L.spacing * 0.14);
      L.cubeSize = Math.min(hx * 0.095, 24);

      for (let i = 0; i < LAMP_N; i++) lamps[i].x = (i - (LAMP_N - 1) / 2) * L.spacing;

      cam.zoom = zoom;
      cam.x = 0;
      if (riseT < 0) cam.y = TABLE_Y;
      else if (riseT >= RISE_DUR) cam.y = STREET_Y;

      anchor = { x: w * 0.5, y: h * 0.48 };
    }

    // ------------------------------------------------------------- helpers

    const w2s = (x, y) => cam.worldToScreen(x, y);

    function floatPos(f, now) {
      const a = f.ang + now * f.spin;
      return {
        x: L.salt.x + Math.cos(a) * f.rad * L.salt.spread,
        y: L.salt.y + Math.sin(a * 1.3 + f.ph) * 26 + Math.sin(now * 1.6 + f.ph) * 7 + f.dy
          + Math.sin(nudge * Math.PI) * 26
      };
    }

    function buildFragment() {
      floats.length = 0; drops.length = 0;
      const o = handoff && handoff.origin ? cam.screenToWorld(handoff.origin.x, handoff.origin.y) : { x: 0, y: L.salt.y };
      for (let i = 0; i < 8; i++) {
        floats.push({
          ang: (i / 8) * Math.PI * 2, rad: 0.35 + hash(i) * 0.6, ph: hash(i + 30) * 6.28,
          spin: 0.10 + hash(i + 60) * 0.10, dy: (hash(i + 90) - 0.5) * 34,
          size: 0.72 + hash(i + 120) * 0.5, rot: hash(i + 150) * 0.9 - 0.45,
          vrot: (hash(i + 180) - 0.5) * 0.5,
          born: 0, ox: o.x, oy: o.y
        });
      }
      for (let i = 0; i < 8; i++) {
        drops.push({
          x: o.x, y: o.y, ox: o.x, oy: o.y,
          ph: hash(i + 200) * 6.28, r: 0.55 + hash(i + 230) * 0.6, k: 0, rise: 0
        });
      }
    }

    function sprinkle() {
      if (stage !== 1 || saltTaps >= MAX_TAPS) return;
      saltTaps++;
      idleT = 0; nudge = 0; waitT = 0;
      if (phase === 'intro' || phase === 'invite') phase = 'acting';
      punch = 0.03;                                    // §2.3 punch-in 1.0 -> 1.03
      engine.audio.play('sprinkle');
      potatoHop = Math.max(potatoHop, 0.5);

      const n = 3 + (saltTaps % 2);
      for (let i = 0; i < n; i++) {
        const src = floats.length ? floatPos(floats[(saltTaps + i) % floats.length], t) : { x: 0, y: L.salt.y };
        falling.push({
          x: src.x + (engine.rng.next() - 0.5) * L.salt.spread * 0.9,
          y: src.y + (engine.rng.next() - 0.5) * 18,
          vx: (engine.rng.next() - 0.5) * 40,
          vy: 20 + engine.rng.next() * 40,
          size: 0.55 + engine.rng.next() * 0.55,
          rot: engine.rng.next() * 1.2, vrot: (engine.rng.next() - 0.5) * 3
        });
      }
      // a sparkle of tiny crystals in screen space, continuing the flame's particles
      const sp = w2s(L.salt.x, L.salt.y);
      engine.particles.burst(sp.x, sp.y, 12, {
        speed: [20, 90], life: [0.35, 0.8], r: [1.2, 2.6], drag: 0.86,
        color: [SALT_WHITE, '#ffffff', DEF.glowColor], shape: 'square', gravity: 160
      });

      if (saltTaps === NEED_TAPS && climaxT < 0) stage1Climax();
    }

    function stage1Climax() {
      climaxT = 0;
      phase = 'change';
      hin.cheer = 1.8; hin.hop = 1.0;
      potatoHop = 1;
      engine.audio.play('hop');
      engine.audio.play('power_on', { base: 330 });
    }

    function liftCube() {
      lifted = true;
      const f = floats.shift();
      const p = f ? floatPos(f, t) : { x: L.salt.x, y: L.salt.y };
      traveler = {
        x: p.x, y: p.y, glow: 0, k: 0, mode: 'toWindow',
        rot: f ? f.rot : 0, size: f ? f.size : 1,
        from: { x: p.x, y: p.y },
        ctrl: { x: L.win.x * 0.72, y: L.win.y + 78 },
        to: { x: L.win.x - L.win.hw * 0.34, y: L.win.y }
      };
      engine.audio.play('whoosh');
    }

    /** the hovering cube's screen position + its (generous) touch radius */
    function cubeTarget() {
      if (!waiting || !traveler || !L) return null;
      const p = w2s(traveler.x, traveler.y);
      const c = engine.clampSafe(p.x, p.y, 8);
      return { x: c.x, y: c.y, r: L.S * 0.16 };
    }

    function nearCube(x, y) {
      const c = cubeTarget();
      if (!c) return false;
      if (Math.hypot(x - c.x, y - c.y) <= c.r) return true;
      // the window itself counts too (the cube is asking to go out through it)
      const a = w2s(L.win.x - L.win.hw, L.win.y - L.win.hh);
      const b = w2s(L.win.x + L.win.hw, L.win.y + L.win.hh);
      const pad = L.S * 0.06;
      return x >= Math.min(a.x, b.x) - pad && x <= Math.max(a.x, b.x) + pad
        && y >= Math.min(a.y, b.y) - pad && y <= Math.max(a.y, b.y) + pad;
    }

    /** the child sends the cube out (or 4s pass and it goes by itself) */
    function sendCube() {
      if (!waiting) return;
      waiting = false;
      if (traveler) {
        traveler.mode = 'toLamp';
        traveler.k = 0;
        traveler.from = { x: traveler.x, y: traveler.y };
        traveler.ctrl = { x: L.win.x * 1.5, y: 430 };
        traveler.to = { x: lamps[0].x, y: L.lampTopY + L.hoodH * 0.72 };
      }
      startRise();
    }

    function startRise() {
      stage = 2;
      phase = 'invite';
      riseT = 0;
      tiltStage = 1;
      cam.panTo(0, STREET_Y, RISE_DUR, 'easeInOutCubic');
      cam.tiltTo(24, 0.95);
      engine.audio.play('whoosh');
    }

    /** screen-space distance from a point to the lamp's pole segment */
    function lampDist(i, x, y) {
      const a = w2s(lamps[i].x, L.lampTopY);
      const b = w2s(lamps[i].x, L.lampBaseY);
      const vx = b.x - a.x, vy = b.y - a.y;
      const len2 = vx * vx + vy * vy || 1;
      let u = ((x - a.x) * vx + (y - a.y) * vy) / len2;
      u = clamp(u, 0, 1);
      return Math.hypot(x - (a.x + vx * u), y - (a.y + vy * u));
    }

    function lampsTouchable() {
      return stage === 2 && riseT >= RISE_DUR && allLitAt < 0 && !finished;
    }

    function tryLight(x, y) {
      if (!lampsTouchable()) return;
      const pad = L.S * 0.08 + L.hoodHalf * L.scale * 0.9;
      let best = -1, bestD = Infinity;
      for (let i = 0; i < LAMP_N; i++) {
        if (lamps[i].lit) continue;
        const d = lampDist(i, x, y);
        if (d <= pad && d < bestD) { bestD = d; best = i; }
      }
      if (best >= 0) lightLamp(best);
    }

    function lightLamp(i) {
      const l = lamps[i];
      if (l.lit) return;
      l.lit = true; l.k = 0; l.flick = 1; l.primed = 0; l.nudge = 0;
      idleT = 0;
      litCount++;
      if (phase !== 'change' && phase !== 'complete') phase = 'acting';
      engine.audio.play('lamp_on');
      const p = w2s(l.x, L.lampTopY + L.hoodH * 0.8);
      engine.particles.burst(p.x, p.y, 10, {
        speed: [20, 110], life: [0.3, 0.8], r: [1.5, 3.4], drag: 0.86,
        color: [DEF.flameColor, DEF.glowColor], gravity: 40
      });
      if (litCount >= CHAIN_AFTER && litCount < LAMP_N && chainT < 0) chainT = 0.32;
    }

    function lightNextUnlit() {
      for (let i = 0; i < LAMP_N; i++) if (!lamps[i].lit) { lightLamp(i); return; }
    }

    // ------------------------------------------------------------- gestures

    function installGestures() {
      rec.onTap('any', (p) => {
        if (waiting && (nearCube(p.x, p.y) || p.y < L.h * 0.5)) { sendCube(); return; }
        if (stage !== 1) return;
        if (sprinkledWhileHolding) return;
        sprinkle();
      }, { maxMoveRatio: 0.14, maxDurationMs: 900 });

      rec.onLongPress('any', {
        onStart: () => { holding = true; holdT = 0; lastHoldSprinkle = 0; sprinkledWhileHolding = false; },
        onRelease: () => { holding = false; },
        onCancel: () => { holding = false; }
      }, { minMs: 300, maxMs: 20000, moveToleranceRatio: 0.45 });

      // lamps: a tap lights one, a slide lights every lamp it crosses (drag-through)
      rec.onDrag('any', {
        onStart: (p) => { if (waiting && nearCube(p.x, p.y)) sendCube(); else tryLight(p.x, p.y); },
        onMove: (p) => { if (waiting && nearCube(p.x, p.y)) sendCube(); else tryLight(p.x, p.y); }
      }, { returnOnRelease: false });
    }

    // ------------------------------------------------------------- update

    function update(dt) {
      t += dt;
      if (finished) return;

      // camera: the design-mandated micro punch-in on every sprinkle
      punch = lerp(punch, 0, damp(0.80, dt));
      if (L) cam.zoom = L.zoom * (1 + punch);

      if (phase === 'intro' && t > 0.7) phase = 'invite';

      // wordless escalation: nothing ever fails, the world just asks again
      idleT += dt;
      if (nudge > 0) nudge = Math.max(0, nudge - dt * 1.5);
      for (const l of lamps) if (l.nudge > 0) l.nudge = Math.max(0, l.nudge - dt * 1.1);
      if (stage === 1 && climaxT < 0 && idleT > 3.0) {
        idleT = 0; nudge = 1; potatoHop = Math.max(potatoHop, 0.55);
      } else if (lampsTouchable() && idleT > 2.4) {
        idleT = 0;
        for (let i = 0; i < LAMP_N; i++) if (!lamps[i].lit) { lamps[i].nudge = 1; break; }
      }

      // continuous sprinkle while a finger stays down
      if (holding) {
        holdT += dt;
        if (stage === 1 && holdT >= 0.45 && holdT - lastHoldSprinkle >= 0.15) {
          lastHoldSprinkle = holdT;
          sprinkledWhileHolding = true;
          sprinkle();
        }
      }

      // fragment settling out of the flame colour
      for (const f of floats) if (f.born < 1) f.born = clamp(f.born + dt / 0.9);
      for (const d of drops) {
        d.k = clamp(d.k + dt / 1.1);
        // they hover with the salt, then drift out to the window: the eye follows them
        const toWin = clamp((t - 1.0) / 4.0);
        const hx = lerp(L.salt.x + Math.cos(d.ph) * L.salt.spread * 1.2,
          L.win.x + Math.cos(t * 0.7 + d.ph) * L.win.hw * 0.7, toWin);
        const hy = lerp(L.salt.y + Math.sin(d.ph * 1.7) * 46,
          L.win.y + Math.sin(t * 0.9 + d.ph) * L.win.hh * 0.6, toWin) - d.rise;
        if (d.k < 1) {
          const k = easeOutCubic(d.k);
          d.x = lerp(d.ox, hx, k); d.y = lerp(d.oy, hy, k);
        } else {
          d.x = lerp(d.x, hx, damp(0.90, dt));
          d.y = lerp(d.y, hy, damp(0.90, dt));
        }
        if (riseT >= 0) d.rise += dt * 300;
      }

      // pull the flame's own particles toward where the fragment condenses
      if (t < 1.2 && L) {
        const sp = w2s(L.salt.x, L.salt.y);
        engine.particles.attract(sp.x, sp.y, 220, dt);
      }

      // falling salt
      const pot = L.potato;
      for (let i = falling.length - 1; i >= 0; i--) {
        const s = falling[i];
        s.vy += 620 * dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.rot += s.vrot * dt;
        const dx = clamp((s.x - pot.x) / pot.rx, -1, 1);
        const surf = pot.y - pot.ry * Math.sqrt(Math.max(0, 1 - dx * dx)) * 0.94;
        if (s.y >= surf) {
          falling.splice(i, 1);
          if (Math.abs(s.x - pot.x) < pot.rx * 1.05 && landed.length < 64) {
            landed.push({ dx: s.x - pot.x, dy: surf - pot.y, size: s.size, rot: s.rot, t: 0 });
          }
        } else if (s.y > pot.y + pot.ry * 2) {
          falling.splice(i, 1);
        }
      }
      for (const s of landed) if (s.t < 1) s.t = clamp(s.t + dt / 0.3);

      // potato: dull + hungry little hops, glossy after the salt
      if (climaxT < 0) {
        nextPotatoHop -= dt;
        if (nextPotatoHop <= 0) { potatoHop = 0.42; nextPotatoHop = 2.0 + engine.rng.next() * 1.2; }
      }
      if (potatoHop > 0) potatoHop = Math.max(0, potatoHop - dt * 1.9);
      const glossTarget = climaxT >= 0 ? 1 : clamp(landed.length / 24) * 0.18;
      gloss = lerp(gloss, glossTarget, damp(0.90, dt));
      steam = lerp(steam, climaxT >= 0 ? 1 : 0.34, damp(0.93, dt));

      // ヒノコ: looks back and forth between the potato and the salt, then cheers
      hin.gazeT -= dt;
      if (hin.gazeT <= 0) { hin.gaze = 1 - hin.gaze; hin.gazeT = 1.25 + engine.rng.next() * 0.4; }
      const gt = climaxT >= 0
        ? (traveler ? { x: traveler.x, y: traveler.y } : { x: L.potato.x, y: L.potato.y })
        : (hin.gaze ? { x: L.salt.x, y: L.salt.y } : { x: L.potato.x, y: L.potato.y });
      hin.gx = hin.gx || gt.x; hin.gy = hin.gy || gt.y;
      hin.gx = lerp(hin.gx, gt.x, damp(0.88, dt));
      hin.gy = lerp(hin.gy, gt.y, damp(0.88, dt));
      hin.nextBlink -= dt;
      if (hin.nextBlink <= 0) { hin.blink = 0.15; hin.nextBlink = 2.2 + engine.rng.next() * 3; }
      if (hin.blink > 0) hin.blink -= dt;
      if (hin.hop > 0) hin.hop = Math.max(0, hin.hop - dt);
      if (hin.cheer > 0) hin.cheer = Math.max(0, hin.cheer - dt);

      // ---- the handover: one cube lifts, glows, travels, enters the first lamp
      if (climaxT >= 0) {
        climaxT += dt;
        if (!lifted && climaxT >= T_LIFT) liftCube();
      }
      if (traveler) {
        const tr = traveler;
        tr.glow = clamp(tr.glow + dt / 0.55);
        if (tr.mode === 'toWindow') {
          tr.k = clamp(tr.k + dt / LIFT_FLY);
          const e = easeInOutCubic(tr.k);
          tr.x = bez(tr.from.x, tr.ctrl.x, tr.to.x, e);
          tr.y = bez(tr.from.y, tr.ctrl.y, tr.to.y, e);
          tr.rot += dt * 0.35;
          if (tr.k >= 1) { tr.mode = 'hover'; waiting = true; waitT = 0; phase = 'invite'; }
        } else if (tr.mode === 'hover') {
          // it bobs toward the window and pulses: "send me out there"
          const b = 0.5 - 0.5 * Math.cos(t * 2.6);
          tr.x = tr.to.x + b * L.win.hw * 0.60;
          tr.y = tr.to.y - Math.sin(t * 1.7) * 7 - b * 5;
          tr.rot += dt * 0.5;
        } else {
          tr.k = clamp(tr.k + dt / FLY_DUR);
          const e = easeInOutCubic(tr.k);
          tr.x = bez(tr.from.x, tr.ctrl.x, tr.to.x, e);
          tr.y = bez(tr.from.y, tr.ctrl.y, tr.to.y, e);
          tr.rot += dt * 0.35;
          if (tr.k >= 1) {
            traveler = null;
            lamps[0].primed = 1;
            engine.audio.play('snap');
            const p = w2s(lamps[0].x, L.lampTopY + L.hoodH * 0.8);
            engine.particles.burst(p.x, p.y, 8, {
              speed: [10, 60], life: [0.3, 0.7], r: [1.2, 2.6], drag: 0.88, color: [DEF.glowColor]
            });
          }
        }
      }

      // the one wait in the world: nobody is ever stuck, it leaves on its own after WAIT_AUTO
      if (waiting) {
        waitT += dt;
        if (waitT >= WAIT_AUTO) sendCube();
      }

      // ---- camera rise
      if (riseT >= 0 && riseT < RISE_DUR) {
        riseT = Math.min(RISE_DUR, riseT + dt);
        if (tiltStage === 1 && riseT >= 0.95) { cam.tiltTo(6, 1.15); tiltStage = 2; }
      }

      // ---- lamps
      for (const l of lamps) {
        if (l.lit) l.k = clamp(l.k + dt / 0.45);
        if (l.flick > 0) l.flick = Math.max(0, l.flick - dt * 1.6);
        if (l.primed > 0 && !l.lit) l.primed = Math.min(1, l.primed + dt);
      }
      if (chainT >= 0 && litCount < LAMP_N) {
        chainT -= dt;
        if (chainT <= 0) { lightNextUnlit(); chainT = litCount < LAMP_N ? 0.30 : -1; }
      }

      // ---- climax: the whole street (and every shadow) turns sodium yellow
      if (litCount >= LAMP_N && allLitAt < 0) {
        allLitAt = t;
        phase = 'change';
        engine.audio.play('spread');
      }
      if (allLitAt >= 0) {
        tint = clamp(tint + dt / TINT_DUR);
        if (tint >= 1 && !spoken) {
          spoken = true;
          completeAt = t;
          phase = 'complete';
          engine.audio.speakElement(DEF.id);       // exactly once, at the top of the change
        }
      }

      // ---- return: the yellow street shrinks toward the shelf
      if (completeAt >= 0 && t - completeAt > HOLD_AFTER) {
        leaveK = clamp(leaveK + dt / LEAVE_DUR);
        if (leaveK >= 1 && !finished) {
          finished = true;
          phase = 'leaving';
          finish({
            worldId: DEF.id,
            completed: true,
            shelfAnchorHint: { x: anchor.x, y: anchor.y },
            returnHandoff: makeHandoff({
              elementId: DEF.id,
              flameColor: DEF.flameColor,
              glowColor: DEF.glowColor,
              ambient: DEF.ambient,
              origin: { x: anchor.x, y: anchor.y },
              particles: engine.particles.snapshot(),
              cameraZoom: cam.zoom
            })
          });
        }
      }
    }

    const bez = (a, c, b, u) => {
      const iu = 1 - u;
      return iu * iu * a + 2 * iu * u * c + u * u * b;
    };

    // ------------------------------------------------------------- drawing

    /** an isometric white salt cube — the shape NEVER changes, only its light */
    function drawCube(g, x, y, s, rot, glow) {
      g.save();
      g.translate(x, y);
      g.rotate(rot * 0.25);
      if (glow > 0) {
        glowCircle(g, 0, 0, s * (2.6 + 0.5 * Math.sin(t * 5)), DEF.flameColor, (0.55 + 0.25 * Math.sin(t * 4)) * glow * A);
        glowCircle(g, 0, 0, s * 1.5, DEF.glowColor, 0.8 * glow * A);
      }
      const top = glow > 0 ? lerpColor('#ffffff', DEF.glowColor, glow * 0.8) : '#ffffff';
      const left = glow > 0 ? lerpColor('#d7dde9', DEF.flameColor, glow * 0.7) : '#d7dde9';
      const right = glow > 0 ? lerpColor('#b9c3d4', DEF.ambient, glow * 0.7) : '#b9c3d4';
      // top face
      g.fillStyle = withAlpha(top, A);
      g.beginPath();
      g.moveTo(0, -s * 0.62); g.lineTo(s * 0.70, -s * 0.22); g.lineTo(0, s * 0.18); g.lineTo(-s * 0.70, -s * 0.22);
      g.closePath(); g.fill();
      // left face
      g.fillStyle = withAlpha(left, A);
      g.beginPath();
      g.moveTo(-s * 0.70, -s * 0.22); g.lineTo(0, s * 0.18); g.lineTo(0, s * 0.92); g.lineTo(-s * 0.70, s * 0.50);
      g.closePath(); g.fill();
      // right face
      g.fillStyle = withAlpha(right, A);
      g.beginPath();
      g.moveTo(s * 0.70, -s * 0.22); g.lineTo(0, s * 0.18); g.lineTo(0, s * 0.92); g.lineTo(s * 0.70, s * 0.50);
      g.closePath(); g.fill();
      g.restore();
    }

    function drawSky(g) {
      g.fillStyle = cachedLinear(g, 'na-sky', 0, -900, 0, L.roadY, [
        [0, '#04060d'], [0.55, '#0b1024'], [1, '#1a2242']
      ]);
      g.fillRect(-4000, -3200, 8000, 3200 + L.roadY);

      // a quiet moon and a scatter of stars
      const mx = -L.hx * 0.52, my = -300;
      glowCircle(g, mx, my, 120, '#cfe0ff', 0.30 * A);
      g.fillStyle = withAlpha('#f3f6ff', 0.92 * A);
      g.beginPath(); g.arc(mx, my, 34, 0, Math.PI * 2); g.fill();
      g.fillStyle = withAlpha('#dde6fb', 0.5 * A);
      g.beginPath(); g.arc(mx + 11, my + 7, 7, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(mx - 12, my - 9, 5, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 40; i++) {
        const sx = (hash(i) - 0.5) * 2400;
        const sy = -660 + hash(i + 11) * 700;
        const tw = 0.45 + 0.4 * Math.sin(t * 1.4 + i);
        g.fillStyle = withAlpha('#e7edff', tw * 0.8 * A);
        g.beginPath(); g.arc(sx, sy, 1.5 + hash(i + 21) * 2.2, 0, Math.PI * 2); g.fill();
      }

      // sleeping town silhouettes behind the lamps
      for (let i = 0; i < 24; i++) {
        const bw = 70 + hash(i + 40) * 110;
        const bx = -1500 + i * 132 + hash(i + 50) * 34;
        const bh = 34 + hash(i + 60) * 96;
        g.fillStyle = withAlpha(i % 2 ? '#0d1226' : '#111731', A);
        fillRoundRect(g, bx, L.roadY - bh, bw, bh + 24, 6);
        // a single dark roof line so the skyline does not read as one slab
        g.fillStyle = withAlpha('#182047', 0.5 * A);
        g.fillRect(bx, L.roadY - bh, bw, 3);
      }

      // wet road
      g.fillStyle = cachedLinear(g, 'na-road', 0, L.roadY, 0, 440, [
        [0, '#1e2544'], [0.30, '#131830'], [1, '#080a14']
      ]);
      g.fillRect(-4000, L.roadY, 8000, 440 - L.roadY);
      // kerb: a pale lip that tells the eye where the ground is
      g.fillStyle = withAlpha('#39406a', 0.75 * A);
      g.fillRect(-4000, L.roadY - 5, 8000, 6);
      g.fillStyle = withAlpha('#11162c', A);
      g.fillRect(-4000, L.roadY - 18, 8000, 13);
      // wet patches so the empty road still reads as a surface
      for (let i = 0; i < 7; i++) {
        const px = -900 + hash(i + 300) * 1800;
        const py = L.roadY + 40 + hash(i + 310) * 250;
        g.fillStyle = withAlpha('#1a2244', 0.45 * A);
        ellipse(g, px, py, 60 + hash(i + 320) * 120, 10 + hash(i + 330) * 14); g.fill();
      }
    }

    function drawBlend(g) {
      g.fillStyle = cachedLinear(g, 'na-blend', 0, 430, 0, 700, [[0, '#080a14'], [1, '#241a26']]);
      g.fillRect(-4000, 430, 8000, 270);
    }

    function drawRoom(g) {
      g.fillStyle = cachedLinear(g, 'na-wall', 0, 700, 0, 1180, [
        [0, '#241a26'], [0.45, '#48301f'], [1, '#6a4327']
      ]);
      g.fillRect(-4000, 700, 8000, 2000);
      // implied warm hanging light above the table
      radialFlood(g, 0, TABLE_Y - 330, 420, '#ffcf8a', 0.16 * A);

      drawWindow(g);

      // table slab
      const ty = L.tableEdgeY;
      g.fillStyle = cachedLinear(g, 'na-table', 0, ty, 0, ty + 360, [
        [0, '#8a5733'], [0.3, '#653d24'], [1, '#3c2415']
      ]);
      fillRoundRect(g, -4000, ty, 8000, 2000, 0);
      g.fillStyle = withAlpha('#b87c47', 0.6 * A);
      g.fillRect(-4000, ty, 8000, 9);
      // the pool of light the (implied) hanging lamp throws on the table
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = A * 0.32;
      g.translate(0, L.plate.y + 10);
      g.scale(1, 0.34);
      glowCircle(g, 0, 0, L.plate.rx * 2.6, '#ffca82', 0.5);
      g.restore();
    }

    function drawWindow(g) {
      const wn = L.win;
      // frame
      g.fillStyle = withAlpha('#5d3c25', A);
      fillRoundRect(g, wn.x - wn.hw - 12, wn.y - wn.hh - 12, (wn.hw + 12) * 2, (wn.hh + 12) * 2, 14);
      // night outside
      g.save();
      g.beginPath();
      const rr = 7;
      g.rect(wn.x - wn.hw, wn.y - wn.hh, wn.hw * 2, wn.hh * 2);
      g.clip();
      g.fillStyle = withAlpha('#0a1024', A);
      g.fillRect(wn.x - wn.hw, wn.y - wn.hh, wn.hw * 2, wn.hh * 2);
      // dark, waiting street lamps far away
      for (let i = 0; i < 3; i++) {
        const lx = wn.x - wn.hw * 0.6 + i * wn.hw * 0.62;
        g.strokeStyle = withAlpha('#1c2340', A);
        g.lineWidth = 4;
        g.beginPath(); g.moveTo(lx, wn.y + wn.hh); g.lineTo(lx, wn.y - wn.hh * 0.1); g.stroke();
        g.fillStyle = withAlpha('#232b4c', A);
        g.beginPath(); g.ellipse(lx, wn.y - wn.hh * 0.16, 9, 6, 0, 0, Math.PI * 2); g.fill();
      }
      for (let i = 0; i < 4; i++) {
        g.fillStyle = withAlpha('#c9d6ff', (0.3 + 0.25 * Math.sin(t * 1.6 + i)) * A);
        g.beginPath();
        g.arc(wn.x - wn.hw * 0.7 + hash(i + 70) * wn.hw * 1.5, wn.y - wn.hh * 0.75 + hash(i + 80) * wn.hh * 0.5, 1.8, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      void rr;
      // mullion
      g.strokeStyle = withAlpha('#5d3c25', A);
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(wn.x, wn.y - wn.hh); g.lineTo(wn.x, wn.y + wn.hh);
      g.moveTo(wn.x - wn.hw, wn.y); g.lineTo(wn.x + wn.hw, wn.y);
      g.stroke();
    }

    function drawPotato(g) {
      const p = L.potato;
      const hop = potatoHop > 0 ? Math.sin(potatoHop * Math.PI) * p.ry * 0.16 : 0;
      const cy = p.y - hop;

      // plate
      g.fillStyle = withAlpha('#0d0a10', 0.35 * A);
      ellipse(g, L.plate.x, L.plate.y + 8, L.plate.rx * 1.02, L.plate.ry * 1.05); g.fill();
      g.fillStyle = withAlpha('#ece7dd', A);
      ellipse(g, L.plate.x, L.plate.y, L.plate.rx, L.plate.ry); g.fill();
      g.fillStyle = withAlpha('#cfc7b8', A);
      ellipse(g, L.plate.x, L.plate.y + L.plate.ry * 0.16, L.plate.rx * 0.74, L.plate.ry * 0.62); g.fill();
      g.fillStyle = withAlpha('#f6f2ea', A);
      ellipse(g, L.plate.x, L.plate.y + L.plate.ry * 0.10, L.plate.rx * 0.70, L.plate.ry * 0.58); g.fill();

      // contact shadow + steam, behind the potato
      g.fillStyle = withAlpha('#4a3218', 0.30 * A);
      ellipse(g, p.x, p.y + p.ry * 0.86, p.rx * 0.92, p.ry * 0.22); g.fill();
      drawSteam(g, hop);

      // body: three soft lobes so it reads as a potato, not a ball
      const body = lerpColor(POTATO_DULL, POTATO_GLOSSY, gloss);
      g.save();
      g.translate(0, -hop);                       // the hop never moves the gradients
      g.fillStyle = withAlpha(body, A);
      ellipse(g, p.x, p.y, p.rx, p.ry); g.fill();
      ellipse(g, p.x - p.rx * 0.42, p.y - p.ry * 0.28, p.rx * 0.52, p.ry * 0.60); g.fill();
      ellipse(g, p.x + p.rx * 0.40, p.y - p.ry * 0.20, p.rx * 0.55, p.ry * 0.62); g.fill();

      // soft top light / belly shade, clipped to the body so no hard rings show
      g.save();
      ellipse(g, p.x, p.y, p.rx * 1.02, p.ry * 1.02); g.clip();
      g.fillStyle = cachedLinear(g, 'na-pot' + Math.round(gloss * 4), p.x, p.y - p.ry, p.x, p.y + p.ry, [
        [0, withAlpha(lerpColor('#ffe0ac', '#ffeec4', gloss), 0.26 + 0.10 * gloss)],
        [0.42, 'rgba(0,0,0,0)'],
        [1, 'rgba(58,34,12,0.34)']
      ]);
      g.fillRect(p.x - p.rx * 1.1, p.y - p.ry * 1.1, p.rx * 2.2, p.ry * 2.2);
      g.restore();

      // dimples (two only — never a face)
      g.fillStyle = withAlpha('#8a6135', 0.4 * A);
      ellipse(g, p.x - p.rx * 0.30, p.y + p.ry * 0.12, p.rx * 0.075, p.ry * 0.07); g.fill();
      ellipse(g, p.x + p.rx * 0.46, p.y + p.ry * 0.30, p.rx * 0.06, p.ry * 0.055); g.fill();
      g.restore();

      // salt resting on top
      for (const s of landed) {
        drawCube(g, p.x + s.dx, cy + s.dy - 2, L.cubeSize * 0.46 * s.size * easeOutBack(s.t), s.rot, 0);
      }

      // gloss: a big soft highlight + a rim of light (the "delicious" moment)
      if (gloss > 0.02) {
        g.save();
        g.globalAlpha = A * gloss;
        g.fillStyle = withAlpha('#fff6df', 0.40);
        ellipse(g, p.x - p.rx * 0.34, cy - p.ry * 0.48, p.rx * 0.22, p.ry * 0.13, -0.5); g.fill();
        g.fillStyle = withAlpha('#ffffff', 0.65);
        ellipse(g, p.x - p.rx * 0.40, cy - p.ry * 0.52, p.rx * 0.10, p.ry * 0.06, -0.5); g.fill();
        g.restore();
        glowCircle(g, p.x, cy - p.ry * 0.1, p.rx * 1.35, '#ffc98a', 0.16 * gloss * A);
      }
    }

    function drawSteam(g, hop) {
      const p = L.potato;
      const y0 = p.y - p.ry * 0.92;                 // fixed: the hop must not move the gradient
      const bucket = Math.round(steam * 4);
      const hgt = p.ry * (2.1 + 1.7 * steam);
      const base = (0.24 + 0.34 * steam) * A;       // §2.3: a freshly boiled potato always steams
      g.save();
      g.translate(0, -hop);
      g.lineCap = 'round';
      g.strokeStyle = cachedLinear(g, 'na-steam' + bucket, 0, y0, 0, y0 - hgt, [
        [0, withAlpha('#fff4e0', base)],
        [0.40, withAlpha('#fff4e0', base * 0.62)],
        [1, withAlpha('#fff4e0', 0)]
      ]);
      for (let i = 0; i < 4; i++) {
        const x0 = p.x + (i - 1.5) * p.rx * 0.40;
        const amp = p.rx * (0.15 + 0.11 * steam);
        g.lineWidth = p.rx * (0.13 + 0.06 * steam) * (i === 1 || i === 2 ? 1.15 : 0.82);
        g.beginPath();
        for (let k = 0; k <= 12; k++) {
          const u = k / 12;
          const x = x0 + Math.sin(t * 1.5 + u * 3.4 + i * 1.9) * amp * u;
          const y = y0 - u * hgt;
          if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      }
      // slow puffs climbing the wisps: steam reads as steam even in a still frame
      const puffs = 6;
      for (let i = 0; i < puffs; i++) {
        const u = ((t * (0.16 + 0.10 * steam) + i / puffs) % 1);
        const lane = i % 4;
        const x0 = p.x + (lane - 1.5) * p.rx * 0.40;
        const x = x0 + Math.sin(t * 1.5 + u * 3.4 + lane * 1.9) * p.rx * (0.15 + 0.11 * steam) * u;
        const y = y0 - u * hgt;
        const rr = p.rx * (0.08 + 0.13 * u) * (0.8 + 0.4 * steam);
        const a = base * 0.85 * Math.sin(Math.min(1, u * 1.15) * Math.PI);
        g.fillStyle = withAlpha('#fff4e0', a);
        ellipse(g, x, y, rr, rr * 0.86); g.fill();
      }
      g.restore();
    }

    function drawHinoko(g) {
      const H = L.hinoko;
      const r = H.r;
      const hop = hin.hop > 0 ? Math.abs(Math.sin(hin.hop * 11)) * r * 0.55 : 0;
      const x = H.x;
      const y = H.y - hop + Math.sin(t * 1.6) * r * 0.06;
      const cheer = hin.cheer > 0 ? 1 : 0;

      glowCircle(g, x, y, r * 2.4, '#ffd27a', 0.5 * A);
      g.fillStyle = withAlpha('#ffb54a', 0.92 * A);
      ellipse(g, x, y + r * 0.1, r * 0.82, r * 0.86); g.fill();
      g.fillStyle = withAlpha('#fff0c8', 0.95 * A);
      ellipse(g, x, y, r * 0.66, r * 0.7); g.fill();

      // eyes only — no mouth, ever
      const ang = Math.atan2(hin.gy - y, hin.gx - x);
      const look = Math.min(r * 0.24, Math.hypot(hin.gx - x, hin.gy - y) * 0.12);
      const ex = Math.cos(ang) * look, ey = Math.sin(ang) * look;
      const eo = r * 0.28;
      const blink = hin.blink > 0 ? 0.18 : 1;
      for (const s of [-1, 1]) {
        g.fillStyle = withAlpha('#ffffff', A);
        ellipse(g, x + s * eo, y - r * 0.06, r * 0.19, r * 0.22 * blink); g.fill();
        g.fillStyle = withAlpha('#2a1410', A);
        ellipse(g, x + s * eo + ex, y - r * 0.06 + ey, r * 0.10, r * 0.12 * blink); g.fill();
      }
      // hands: raised when he is delighted
      const hy = cheer ? y - r * 0.72 : y + r * 0.38;
      for (const s of [-1, 1]) {
        const hx = x + s * r * (cheer ? 1.05 : 1.06);
        const bob = Math.sin(t * 7 + s) * r * 0.07 * (cheer ? 1 : 0.35);
        // an arm appears only when he throws his hands up, so idle hands stay embers
        if (cheer) {
          g.strokeStyle = withAlpha('#ffb54a', 0.7 * A);
          g.lineWidth = r * 0.17;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(x + s * r * 0.62, y + r * 0.42);
          g.quadraticCurveTo(x + s * r * 1.12, y + r * 0.10, hx, hy + bob);
          g.stroke();
        }
        glowCircle(g, hx, hy + bob, r * (cheer ? 0.72 : 0.5), '#ffd27a', 0.6 * A);
        g.fillStyle = withAlpha('#ffe0a0', 0.97 * A);
        g.beginPath(); g.arc(hx, hy + bob, r * (cheer ? 0.25 : 0.2), 0, Math.PI * 2); g.fill();
      }
    }

    function drawFragment(g) {
      // yellow light droplets (the other half of the かけら) drifting toward the window
      // while the cube waits it must be the hero: the droplets step back a little
      const dropA = (riseT >= 0 ? 1 - clamp(riseT / 0.8) : 1) * (waiting ? 0.62 : 1);
      if (dropA > 0.01) {
        for (const d of drops) {
          const rr = L.cubeSize * (0.5 + 0.35 * d.r) * (0.9 + 0.1 * Math.sin(t * 3 + d.ph));
          glowCircle(g, d.x, d.y, rr * 3.2, DEF.flameColor, 0.45 * A * dropA);
          g.fillStyle = withAlpha(DEF.glowColor, 0.9 * A * dropA);
          ellipse(g, d.x, d.y, rr * 0.7, rr * 0.9); g.fill();
        }
      }
      // floating white cubes above the potato
      for (const f of floats) {
        const p = floatPos(f, t);
        const k = easeOutCubic(f.born);
        const x = lerp(f.ox, p.x, k), y = lerp(f.oy, p.y, k);
        glowCircle(g, x, y, L.cubeSize * 1.9, '#ffffff', 0.18 * A);
        drawCube(g, x, y, L.cubeSize * f.size, f.rot + t * f.vrot, 0);
      }
      for (const s of falling) drawCube(g, s.x, s.y, L.cubeSize * s.size * 0.7, s.rot, 0);
    }

    function drawLamp(g, i) {
      const l = lamps[i];
      const x = l.x;
      const top = L.lampTopY;
      const hh = L.hoodHalf;
      const openY = top + L.hoodH;
      const k = l.lit ? easeOutCubic(l.k) : 0;
      const flick = l.lit ? 1 - l.flick * 0.35 * Math.abs(Math.sin(t * 34)) : 0;
      const on = k * flick;

      // light cone + road pool, drawn under the hardware
      if (on > 0.02) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = A * on * 0.30;
        g.fillStyle = cachedLinear(g, 'na-cone' + i, 0, openY, 0, L.lampBaseY + 120, [
          [0, withAlpha(DEF.glowColor, 0.5)], [0.55, withAlpha(DEF.flameColor, 0.16)], [1, withAlpha(DEF.ambient, 0)]
        ]);
        g.beginPath();
        g.moveTo(x - hh * 0.8, openY);
        g.lineTo(x + hh * 0.8, openY);
        g.lineTo(x + hh * 2.7, L.lampBaseY + 120);
        g.lineTo(x - hh * 2.7, L.lampBaseY + 120);
        g.closePath(); g.fill();
        g.restore();

        // long reflection down the wet road (§2.3)
        g.save();
        g.translate(x, L.roadY + 40);
        g.scale(0.34, 2.9);
        glowCircle(g, 0, 0, hh * 3.0, DEF.flameColor, 0.55 * on * A);
        g.restore();
        g.save();
        g.translate(x, L.roadY + 150);
        g.scale(0.16, 3.4);
        glowCircle(g, 0, 0, hh * 2.6, DEF.ambient, 0.4 * on * A);
        g.restore();
      }

      // an unlit pole's FOOT breathes as well, so the whole pole reads as touchable
      if (!l.lit) {
        const footPulse = 0.12 + 0.10 * (0.5 + 0.5 * Math.sin(t * 1.9 + l.ph + 0.9))
          + Math.sin(l.nudge * Math.PI) * 0.26;
        glowCircle(g, x, L.lampBaseY + 2, hh * 1.5, DEF.flameColor, footPulse * 0.55 * A);
      }

      // pole + foot
      const poleCol = l.lit ? lerpColor('#252b40', '#6a5330', on * 0.8) : '#252b40';
      g.fillStyle = withAlpha(poleCol, A);
      fillRoundRect(g, x - L.poleW / 2, openY - 4, L.poleW, L.lampBaseY - openY + 6, L.poleW * 0.5);
      fillRoundRect(g, x - L.poleW * 1.7, L.lampBaseY - 6, L.poleW * 3.4, 14, 5);

      // hood
      g.fillStyle = withAlpha(l.lit ? lerpColor('#232840', '#7c6236', on * 0.7) : '#232840', A);
      g.beginPath();
      g.moveTo(x - hh * 0.30, top);
      g.lineTo(x + hh * 0.30, top);
      g.quadraticCurveTo(x + hh * 1.02, openY - 4, x + hh, openY);
      g.lineTo(x - hh, openY);
      g.quadraticCurveTo(x - hh * 1.02, openY - 4, x - hh * 0.30, top);
      g.closePath(); g.fill();

      // the hollow: an empty socket that breathes faint yellow while unlit
      const breathe = 0.10 + 0.12 * (0.5 + 0.5 * Math.sin(t * 1.9 + l.ph)) + l.primed * 0.28
        + Math.sin(l.nudge * Math.PI) * 0.34;
      g.fillStyle = withAlpha('#0a0c16', A);
      ellipse(g, x, openY - 2, hh * 0.78, hh * 0.30); g.fill();
      if (!l.lit) {
        glowCircle(g, x, openY - 1, hh * (1.1 + 0.25 * l.primed), DEF.flameColor, breathe * A);
        g.fillStyle = withAlpha(DEF.flameColor, (0.10 + breathe * 0.5) * A);
        ellipse(g, x, openY - 2, hh * 0.62, hh * 0.24); g.fill();
      } else {
        glowCircle(g, x, openY - 2, hh * (3.2 + 0.4 * Math.sin(t * 3 + i)) * (0.4 + 0.6 * on), DEF.flameColor, 0.9 * on * A);
        glowCircle(g, x, openY - 2, hh * 1.7, DEF.glowColor, 0.95 * on * A);
        g.fillStyle = withAlpha(lerpColor(DEF.ambient, '#fff7d8', 0.6), on * A);
        ellipse(g, x, openY - 2, hh * 0.70, hh * 0.28); g.fill();
      }
    }

    function drawStreet(g) {
      for (let i = 0; i < LAMP_N; i++) drawLamp(g, i);
    }

    function drawTraveler(g) {
      if (!traveler) return;
      const tr = traveler;
      if (waiting) {
        // a slow halo ping: the cube asks to be sent, with no word and no arrow
        const ping = (t * 0.7) % 1;
        glowCircle(g, tr.x, tr.y, L.cubeSize * (1.6 + ping * 4.2), DEF.flameColor,
          0.38 * (1 - ping) * (1 - ping) * A);
        glowCircle(g, tr.x, tr.y, L.cubeSize * (2.2 + 0.4 * Math.sin(t * 2.6)), DEF.glowColor, 0.30 * A);
      }
      drawCube(g, tr.x, tr.y, L.cubeSize * Math.max(0.85, tr.size) * (waiting ? 1.32 : 1), tr.rot, tr.glow);
    }

    // ------------------------------------------------------------- scene

    const scene = {
      id: DEF.id,

      layout,

      enter() {
        if (handoff && handoff.particles) engine.particles.inject(handoff.particles);
        cam.setFrame({ coreW: 600, coreH: 600, mode: 'contain' });
        cam.tiltTo(0, 0);
        cam.rotateTo(0, 0);
        layout(engine.width, engine.height);
        cam.x = 0; cam.y = TABLE_Y;
        buildFragment();
        installGestures();
      },

      exit() { rec.destroy(); },

      update,

      draw(g) {
        const w = engine.width, h = engine.height;
        // fade in out of the flame flood during the 1.2s overlap (scene.js hands us
        // progress === 1 straight away when there is no overlap)
        A = handoff ? clamp(handoff.progress * 1.25) : 1;

        // after finish() the hearth owns the camera again: keep only the colour alive
        if (finished) {
          radialFlood(g, anchor.x, anchor.y, Math.max(w, h) * 0.45, DEF.ambient, 0.35);
          return;
        }
        if (!L) return;

        g.save();
        if (leaveK > 0) {
          const s = lerp(1, 0.40, easeInOutCubic(leaveK));
          g.translate(anchor.x, anchor.y);
          g.scale(s, s);
          g.translate(-anchor.x, -anchor.y);
        }
        g.globalAlpha = A;
        g.fillStyle = '#06070f';
        g.fillRect(0, 0, w, h);

        cam.apply(g);
        drawSky(g);
        drawStreet(g);
        drawBlend(g);
        drawRoom(g);
        drawPotato(g);
        drawHinoko(g);
        drawFragment(g);
        drawTraveler(g);
        cam.restore(g);

        // ambient light: starts at the flame colour, settles on the world's own light
        const amb = lerpColor(handoff ? handoff.flameColor : DEF.flameColor, DEF.ambient, clamp(t / 1.5));
        applyAmbient(g, w, h, amb, (stage === 1 ? 0.10 : 0.06) * A);

        // the climax: the WHOLE screen — shadows included — becomes sodium yellow.
        // 'color' keeps the night's contrast and repaints every hue, so the shadows go
        // yellow instead of the picture going milky.
        if (tint > 0) {
          const k = easeOutCubic(tint);
          g.save();
          g.globalCompositeOperation = 'color';
          g.globalAlpha = 0.92 * k * A;
          g.fillStyle = DEF.ambient;
          g.fillRect(0, 0, w, h);
          g.restore();
          applyAmbient(g, w, h, DEF.ambient, 0.14 * k * A);
          radialFlood(g, w * 0.5, h * 0.45, Math.max(w, h) * 0.8, DEF.flameColor, 0.12 * k * A);
        }

        vignette(g, w, h, (0.38 - 0.16 * tint) * A);
        g.restore();
        g.globalAlpha = 1;
      },

      debugState() {
        return {
          phase,
          stage,
          elementId: DEF.id,
          saltTaps,
          waiting,
          waitT: Math.round(waitT * 100) / 100,
          landed: landed.length,
          lampsLit: litCount,
          climax: Math.round(climaxT * 100) / 100,
          rise: Math.round(riseT * 100) / 100,
          tint: Math.round(tint * 100) / 100,
          spoken,
          t: Math.round(t * 100) / 100
        };
      },

      hitPoints() {
        if (finished || !L) return [];
        const out = [];
        if (waiting) {
          // the glowing cube is the only thing left to touch; 'tap' is aliased onto it so a
          // finger that is still poking the salt area sends it too
          const c = cubeTarget();
          if (c) {
            out.push({ id: 'cube', x: c.x, y: c.y, r: c.r });
            out.push({ id: 'tap', x: c.x, y: c.y, r: c.r });
          }
        } else if (stage === 1) {
          // §2.3: the potato's hit area is the WHOLE upper half of the screen
          const r = Math.min(L.w, L.h) * 0.32;
          const c = engine.clampSafe(L.w * 0.5, L.h * 0.26, 8);
          out.push({ id: 'tap', x: c.x, y: c.y, r });
        } else if (stage === 2 && riseT >= RISE_DUR) {
          // every lamp keeps an id (the row is the world), but the ones still waiting for a
          // finger come first, so "the next lamp" is always the first match.
          const add = (i) => {
            const p0 = w2s(lamps[i].x, lerp(L.lampTopY, L.lampBaseY, 0.62));
            const p = engine.clampSafe(p0.x, p0.y, 8);
            out.push({ id: 'lamp:' + i, x: p.x, y: p.y, r: L.S * 0.08 + L.hoodHalf * L.scale });
          };
          for (let i = 0; i < LAMP_N; i++) if (!lamps[i].lit) add(i);
          for (let i = 0; i < LAMP_N; i++) if (lamps[i].lit) add(i);
        }
        return out;
      },

      /** __game.complete(): skip straight to the climax */
      complete() {
        if (finished) return;
        if (climaxT < 0) { saltTaps = NEED_TAPS; stage1Climax(); }
        climaxT = Math.max(climaxT, LIFT_FLY);
        gloss = 1;
        lifted = true;
        waiting = false;
        traveler = null;
        stage = 2;
        tiltStage = 2;
        riseT = RISE_DUR;
        // drop any camera tween still in flight, then snap to the street
        cam.stopTweens();
        cam.tiltTo(6, 0);
        cam.x = 0; cam.y = STREET_Y;
        chainT = -1;
        for (let i = 0; i < LAMP_N; i++) lightLamp(i);
        chainT = -1;
      },

      onPointerDown(p) { rec.down(p); },
      onPointerMove(p) { rec.move(p); },
      onPointerUp(p) { rec.up(p); holding = false; }
    };

    return scene;
  }
};
