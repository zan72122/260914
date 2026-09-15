/**
 * spectroscope.js — "inside the tube" (DESIGN §3.2 layer 3, §3.3).
 *
 * The child has already put a sample in the flame and dragged the brass spectroscope
 * into it. This scene is what they SEE through the eyepiece:
 *
 *   1. the round field of view of the tube EXPANDS out of handoff.origin over the hearth
 *      (a circular mask growing — never a cut, never a black frame),
 *   2. black inside, with the faintest dark rainbow hint of where colours live,
 *   3. the element's emission lines fade in as vertical glowing bars at nmToX01()
 *      positions, coloured by nmToColor(); width scales with i^2 and brightness with i,
 *      so a strong line DOMINATES a weak one (lithium = one fat red + a thin orange),
 *   4. 1.0s later the element's mini-diorama floats in UNDER the lines — literally the
 *      same drawDiorama() the hearth shelf uses, so "these lines = that world" is one picture.
 *   5. if the OTHER red (lithium <-> strontium) has already been seen, BOTH spectra are
 *      stacked: the remembered one dimmer above, the fresh one bright below, so
 *      "tidy single line" vs "busy, and there is a blue one" is a picture, not a sentence.
 *
 * Exit: any tap (or ~6s of nothing) shrinks the field of view back toward the origin and
 * floods the flame colour back in, then finish() hands us to the hearth continuously.
 *
 * HARD RULES: no fillText/strokeText, no tick marks, no numbers, no arrows, no ctx.filter.
 */

import { ELEMENT_BY_ID, nmToColor, nmToX01 } from '../core/palette.js';
import { clamp, lerp, easeOutCubic, easeInCubic, easeOutBack } from '../core/tween.js';
import {
  glowCircle, withAlpha, fillRoundRect, radialFlood, cachedLinear, cachedUnitRadial, shade
} from '../core/draw.js';
import { markSpectrumSeen } from '../core/storage.js';
// scenes may import scenes: the shelf and the tube MUST show the identical picture (§3.3).
import { drawDiorama } from './hearth.js';

const T_MASK = 0.55;      // field of view opens
const T_LINES = 0.28;     // first line starts to glow
const T_LINE_EACH = 0.30; // per-line fade
const T_LINE_STEP = 0.10; // stagger between lines
const T_DIORAMA = 1.0;    // §3.3 "1.0s after the lines appear"
const IDLE_EXIT = 6.0;    // seconds of nothing -> drift back out
const T_CLOSE = 0.55;     // field of view closes

/** the two reds the whole §3 comparison is about */
const REDS = { lithium: 'strontium', strontium: 'lithium' };

/** extra fatness per element (§3.3 table): sodium's single D line is absurdly fat. */
const FAT = { sodium: 2.6, lithium: 1.15, strontium: 1.0, copper: 1.0, barium: 1.05 };

export function createSpectroscope(engine, handoff, finish) {
  const rec = engine.gestures();

  const elementId = (handoff && handoff.elementId && ELEMENT_BY_ID[handoff.elementId])
    ? handoff.elementId : 'lithium';
  const def = ELEMENT_BY_ID[elementId];

  // Read progress BEFORE we mark ourselves seen, so "the other red" is the remembered one.
  const seenBefore = (engine.progress && engine.progress.spectraSeen) || {};
  const otherId = REDS[elementId] || null;
  const compare = !!(otherId && seenBefore[otherId]);
  const otherDef = compare ? ELEMENT_BY_ID[otherId] : null;

  const origin = (handoff && handoff.origin) ? { x: handoff.origin.x, y: handoff.origin.y } : null;

  let t = 0;
  let idleT = 0;
  let phase = 'intro';      // intro -> change -> complete -> leaving
  let stage = 'opening';    // opening | lines | diorama | closing
  let closeT = 0;
  let leaving = false;
  let finished = false;
  let marked = false;
  let sawDown = false;    // the finger that dragged the scope in must not also close it
  let L = null;

  // ---------------------------------------------------------------- layout

  function layout(w, h) {
    const S = Math.min(w, h);
    const ins = engine.insets;
    const pad = Math.max(S * 0.10, ins.left + 10, ins.right + 10);
    const x0 = pad;
    const x1 = w - pad;

    const o = origin || { x: w * 0.5, y: h * 0.5 };
    let maxD = 0;
    for (const c of [[0, 0], [w, 0], [0, h], [w, h]]) {
      maxD = Math.max(maxD, Math.hypot(c[0] - o.x, c[1] - o.y));
    }

    // Each band is a group: [lines] + [the mini-diorama that belongs to them], and the
    // groups are centred as a whole so portrait and landscape both breathe.
    const bands = compare
      ? [{ def: otherDef, half: S * 0.115, dr: S * 0.078, dim: true },
         { def, half: S * 0.115, dr: S * 0.082, dim: false }]
      : [{ def, half: S * 0.200, dr: S * 0.130, dim: false }];

    const gapIn = S * 0.045;      // lines -> their own diorama (tight: they belong together)
    const gapOut = S * 0.075;     // between the two remembered/fresh groups (loose)
    let total = 0;
    for (const b of bands) { b.gh = b.half * 2 + gapIn + b.dr * 1.72; total += b.gh; }
    total += gapOut * (bands.length - 1);
    let top = h * 0.47 - total / 2;
    for (const b of bands) {
      b.cy = top + b.half;
      b.dy = b.cy + b.half + gapIn + b.dr * 0.86;
      top += b.gh + gapOut;
    }

    L = { w, h, S, x0, x1, o, coverR: maxD * 1.04, bands };
  }

  // ---------------------------------------------------------------- lifecycle

  function enter() {
    layout(engine.width, engine.height);
    engine.camera.resetToScreen();
    if (handoff && handoff.particles && handoff.particles.length) {
      engine.particles.inject(handoff.particles);
    }
    // Any fresh touch anywhere closes the tube — a 4-year-old's "I'm done looking".
    // A touch that STARTED on the hearth (the drag that brought us here) must not count,
    // so a tap only closes once this scene has seen its own pointerdown and the lines are up.
    rec.onTap(() => sawDown && t > 0.8, () => leave(), { maxMoveRatio: 0.4, maxDurationMs: 1400 });
  }

  function exit() { rec.destroy(); }

  function linesShownAt() { return T_LINES + T_LINE_EACH + T_LINE_STEP * Math.max(0, def.spectrum.length - 1); }

  function leave() {
    if (leaving) return;
    leaving = true;
    phase = 'leaving';
    stage = 'closing';
    closeT = 0;
    engine.audio.play('whoosh');
  }

  function update(dt) {
    t += dt;
    if (!L) layout(engine.width, engine.height);

    if (!leaving) {
      const shown = linesShownAt();
      if (t < shown) { phase = 'intro'; stage = t < T_LINES ? 'opening' : 'lines'; }
      else if (t < shown + T_DIORAMA) { phase = 'change'; stage = 'lines'; }
      else { phase = 'complete'; stage = 'diorama'; }

      // §5.5.6 — record it as soon as the lines are fully readable. main.js marks it again
      // on the way home; markSpectrumSeen is idempotent so that costs nothing.
      if (!marked && t >= shown) {
        marked = true;
        engine.progress = markSpectrumSeen(elementId);
      }

      idleT += dt;
      if (idleT > IDLE_EXIT && t > linesShownAt() + T_DIORAMA + 1.2) leave();
    } else {
      closeT += dt;
      if (!finished && closeT >= T_CLOSE) {
        finished = true;
        finish({ worldId: 'spectroscope', completed: false, elementId, returnToHearth: true });
      }
    }
  }

  /** window.__game.complete(): jump straight to the fully-revealed picture. */
  function complete() {
    if (leaving) return;
    t = Math.max(t, linesShownAt() + T_DIORAMA + 0.05);
    if (!marked) { marked = true; engine.progress = markSpectrumSeen(elementId); }
  }

  // ---------------------------------------------------------------- drawing

  /** 0..1 how open the round field of view is */
  function aperture() {
    if (leaving) return Math.pow(1 - clamp(closeT / T_CLOSE), 1.35);
    return easeOutCubic(clamp(t / T_MASK));
  }

  /** 0..1 reveal of line #i */
  function lineK(i) {
    return clamp((t - (T_LINES + i * T_LINE_STEP)) / T_LINE_EACH);
  }

  function dioramaK(b) {
    if (b.dim) return clamp((t - (linesShownAt() + T_DIORAMA * 0.6)) / 0.6);
    return clamp((t - (linesShownAt() + T_DIORAMA)) / 0.7);
  }

  /** the soft dark rainbow that says "colours live along here" — no ticks, no numbers */
  function drawHintBand(g, b) {
    const { x0, x1 } = L;
    const y = b.cy - b.half, hh = b.half * 2;
    const grad = cachedLinear(g, 'spectrohint', x0, 0, x1, 0, [
      [0.00, 'rgba(74,36,150,1)'],
      [0.16, 'rgba(36,66,184,1)'],
      [0.33, 'rgba(26,132,146,1)'],
      [0.50, 'rgba(38,150,62,1)'],
      [0.68, 'rgba(154,136,32,1)'],
      [0.84, 'rgba(166,76,26,1)'],
      [1.00, 'rgba(146,28,38,1)']
    ]);
    g.save();
    g.globalAlpha = b.dim ? 0.11 : 0.20;
    g.fillStyle = grad;
    fillRoundRect(g, x0, y, x1 - x0, hh, hh * 0.13);
    g.restore();

    // soften the top and bottom edges back into the dark so it reads as a glow, not a bar
    const fade = cachedLinear(g, 'spectrofade' + Math.round(hh), 0, y, 0, y + hh, [
      [0.00, 'rgba(4,3,8,1)'],
      [0.22, 'rgba(4,3,8,0)'],
      [0.78, 'rgba(4,3,8,0)'],
      [1.00, 'rgba(4,3,8,1)']
    ]);
    g.save();
    g.fillStyle = fade;
    g.fillRect(x0 - 4, y - 1, x1 - x0 + 8, hh + 2);
    g.restore();
  }

  /** the emission lines themselves */
  function drawLines(g, b) {
    const { x0, x1, S } = L;
    const span = x1 - x0;
    const fat = FAT[b.def.id] || 1;
    const dimK = b.dim ? 0.42 : 1;

    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < b.def.spectrum.length; i++) {
      const ln = b.def.spectrum[i];
      const k = b.dim ? 1 : lineK(i);
      if (k <= 0) continue;
      const kk = easeOutCubic(k);
      // gentle shimmer — light that is alive, not a printed diagram
      const sh = 0.86 + 0.14 * Math.sin(t * (2.1 + i * 0.37) + i * 1.7);
      const col = nmToColor(ln.nm);
      const x = x0 + span * nmToX01(ln.nm);
      // §Q the whole point is the SHAPE of the pattern: a strong line must dominate a weak
      // one. Width grows with i^2 and brightness with i, so lithium reads as "one fat red
      // line with a thin orange friend", not "two lines".
      const wk = 0.30 + 0.70 * ln.i * ln.i;
      const cw = Math.max(1.5, S * 0.034 * wk * fat);
      const hh = b.half * (0.62 + 0.38 * ln.i) * (0.55 + 0.45 * kk);
      const a = kk * dimK * sh * (0.34 + 0.66 * ln.i);

      // wide halo
      g.fillStyle = withAlpha(col, 0.09 * a);
      fillRoundRect(g, x - cw * 3.2, b.cy - hh * 1.06, cw * 6.4, hh * 2.12, cw * 3.2);
      // soft body
      g.fillStyle = withAlpha(col, 0.26 * a);
      fillRoundRect(g, x - cw * 1.3, b.cy - hh, cw * 2.6, hh * 2, cw * 1.3);
      // bright core
      g.fillStyle = withAlpha(col, 0.95 * a);
      fillRoundRect(g, x - cw * 0.5, b.cy - hh * 0.98, cw, hh * 1.96, cw * 0.5);
      // hot centre for the strong lines
      if (ln.i > 0.55) {
        g.fillStyle = withAlpha(shade(col, 1.6), 0.55 * a * ln.i);
        fillRoundRect(g, x - cw * 0.17, b.cy - hh * 0.92, cw * 0.34, hh * 1.84, cw * 0.17);
      }
      // a bloom where the line crosses the middle
      glowCircle(g, x, b.cy, cw * 5.5, col, 0.22 * a * ln.i);
    }
    g.restore();
  }

  function draw(g) {
    if (!L) layout(engine.width, engine.height);
    const { w, h, S, o } = L;
    const ap = aperture();
    const R = Math.max(1, L.coverR * ap);

    // ---- the round field of view of the tube. Outside it, the hearth (still alive during
    // the handoff overlap) shows through untouched: no cut, no black frame.
    g.save();
    g.beginPath();
    g.arc(o.x, o.y, R, 0, Math.PI * 2);
    g.clip();

    g.fillStyle = '#040308';
    g.fillRect(0, 0, w, h);

    for (const b of L.bands) {
      drawHintBand(g, b);
      drawLines(g, b);
      const dk = dioramaK(b);
      if (dk > 0) {
        const rise = easeOutBack(dk);
        drawDiorama(g, b.def, w * 0.5, b.dy + (1 - rise) * S * 0.08,
          b.dr * (0.6 + 0.4 * rise), dk * (b.dim ? 0.55 : 1), t);
      }
    }

    // inside-the-tube vignette: the barrel closes in at the rim
    g.save();
    g.globalCompositeOperation = 'source-over';
    const vg = cachedUnitRadial(g, 'tubeBarrel', [
      [0.00, 'rgba(0,0,0,0)'],
      [0.52, 'rgba(0,0,0,0)'],
      [0.78, 'rgba(0,0,0,0.34)'],
      [1.00, 'rgba(0,0,0,0.94)']
    ]);
    const vOpen = clamp((R - Math.hypot(w, h) * 0.52) / (Math.hypot(w, h) * 0.2));
    const vx = lerp(o.x, w * 0.5, vOpen);
    const vy = lerp(o.y, h * 0.5, vOpen);
    const vr = lerp(R, Math.hypot(w, h) * 0.56, vOpen);
    g.translate(vx, vy); g.scale(vr, vr);
    g.fillStyle = vg;
    g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill();
    g.restore();

    // a little warm light leaking in past the rim as the tube closes
    if (leaving) {
      const kc = clamp(closeT / T_CLOSE);
      radialFlood(g, o.x, o.y, R * 0.95, def.flameColor, 0.05 + kc * 0.16);
    }
    g.restore();

    // Outside the shrinking iris the firelight of the hearth floods back in, so by the time
    // finish() hands over, the screen is already the flame colour the hearth returns with.
    if (leaving) {
      const kc = easeInCubic(clamp(closeT / T_CLOSE));
      g.save();
      g.beginPath();
      g.rect(0, 0, w, h);
      g.arc(o.x, o.y, R, 0, Math.PI * 2, true);   // hole: the iris stays dark and readable
      g.clip('evenodd');
      g.fillStyle = withAlpha('#120608', 0.9);
      g.fillRect(0, 0, w, h);
      radialFlood(g, o.x, o.y, Math.hypot(w, h) * (0.5 + kc * 0.5), def.flameColor, 0.45 + kc * 0.55);
      g.restore();
    }
    // ---- the brass rim of the eyepiece, right on the edge of the aperture
    if (ap > 0.02 && ap < 0.999) {
      g.save();
      g.lineWidth = Math.max(2, S * 0.022);
      g.strokeStyle = withAlpha('#c9963f', 0.55 * (1 - ap * 0.4));
      g.beginPath(); g.arc(o.x, o.y, R, 0, Math.PI * 2); g.stroke();
      g.lineWidth = Math.max(1, S * 0.008);
      g.strokeStyle = withAlpha('#ffe7ab', 0.45 * (1 - ap * 0.4));
      g.beginPath(); g.arc(o.x, o.y, R * 0.985, 0, Math.PI * 2); g.stroke();
      g.restore();
    }

  }

  // ---------------------------------------------------------------- debug / test hooks

  function debugState() {
    return {
      phase,
      stage,
      spectrumId: elementId,
      lineCount: def.spectrum.length,
      hasBlueLine: def.spectrum.some((l) => l.nm < 500),
      compare,
      compareWith: compare ? otherId : null,
      aperture: Math.round(aperture() * 100) / 100,
      leaving
    };
  }

  function hitPoints() {
    if (!L) return [];
    const p = engine.clampSafe(L.w * 0.5, L.h * 0.5, L.S * 0.1);
    return [{ id: 'close', x: p.x, y: p.y, r: L.S * 0.45 }];
  }

  return {
    id: 'spectroscope',
    enter,
    exit,
    update,
    draw,
    layout,
    debugState,
    hitPoints,
    complete,
    onPointerDown(p) { idleT = 0; sawDown = true; rec.down(p); },
    onPointerMove(p) { rec.move(p); },
    onPointerUp(p) { rec.up(p); }
  };
}

export default { id: 'spectroscope', createSpectroscope };
