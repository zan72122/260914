/**
 * copper.js — 銅 (Cu) / 「通る世界」 (DESIGN §2.2).
 *
 * The world: a dark night-town diorama sitting on a circuit board. Every window, lamp and
 * sign is dark because ONE trace on the board is broken. The two broken endpoints spark and
 * sway toward each other; the かけら (a glowing copper wire) trembles over endpoint A and
 * ヒノコ crouches at the gap, looking into it.
 *
 * The action: one finger traces from endpoint A to endpoint B. The wire grows along the
 * finger; off the ideal path it only BOWS toward the finger (it never breaks, never fails).
 * Progress is monotonic; releasing past 50% finishes the wire by itself, below 50% the wire
 * springs gently back to A so the child can try again.
 *
 * The change: the current races across the joint, branches over the whole board, and the town
 * lights up domino-style; a tiny train starts running around it. The camera is a MACRO
 * close-up while tracing (micro-panning with the finger) and then pulls back hard
 * (zoom 1.6 -> 0.55 in 1.1s) — "the discovery of the wide shot".
 *
 * Science note (§2.2): copper conducts electricity — this is the literal, honest one. The
 * かけら glows blue-green only as a memory of the flame: the instant the circuit closes the
 * WIRE settles to copper red-brown and only the FLOWING CURRENT stays blue-green
 * (material vs. light are separated). Copper does not "glow": current runs through it.
 *
 * NO TEXT IS EVER DRAWN.
 */

import { ELEMENT_BY_ID } from '../core/palette.js';
import { makeHandoff } from '../core/scene.js';
import { clamp, lerp, damp, easeOutCubic, easeInOutCubic, easeOutBack } from '../core/tween.js';
import {
  glowCircle, radialFlood, withAlpha, lerpColor, fillRoundRect, roundRect,
  glowLine, softDisc, vignette, cachedLinear
} from '../core/draw.js';

const DEF = ELEMENT_BY_ID['copper'];

// ---------------------------------------------------------------- palette (world-local)
const WIRE_COPPER = '#c4713d';     // the settled metal
const WIRE_COPPER_HI = '#e79a5f';
const TRACE_DARK = '#6d4327';      // unpowered copper traces on the board
const BOARD_0 = '#071a18';
const BOARD_1 = '#0d2a25';
const BOARD_EDGE = '#1b4c42';
const PAD = '#caa06a';
const HOUSE_DARK = '#101c28';
const HOUSE_LIT = '#24394a';
const ROOF_DARK = '#0b1420';
const WARM = '#ffd27a';
const WARM_HOT = '#fff3cf';
const NIGHT_0 = '#04070d';
const NIGHT_1 = '#0a1621';
const HINOKO = '#ffd27a';

const MACRO_ZOOM = 1.6;
const WIDE_ZOOM = 0.55;
const SHELF_ZOOM = 0.13;

// ---------------------------------------------------------------- world geometry (600x600 core)
// The whole diorama lives inside a 1080x1080 board centred on (300,300): at the pull-back
// zoom (0.55) the board exactly fills the short side of the screen in either orientation,
// while the macro zoom (1.6) shows only the broken gap and the houses right behind it.
const A = { x: 220, y: 336 };
const B = { x: 380, y: 278 };
const BEZ = [A, { x: 262, y: 286 }, { x: 338, y: 330 }, B];

const BOARD = { x: -240, y: -240, w: 1080, h: 1080 };
const TOWN = { x: 300, y: 300 };

/** houses: x,y = top-left of the body; win = [wx,wy,ww,wh] as fractions of the body */
const W4 = [[0.16, 0.20, 0.27, 0.24], [0.57, 0.20, 0.27, 0.24], [0.16, 0.58, 0.27, 0.26], [0.57, 0.58, 0.27, 0.26]];
const W6 = [[0.20, 0.14, 0.26, 0.13], [0.54, 0.14, 0.26, 0.13], [0.20, 0.40, 0.26, 0.13], [0.54, 0.40, 0.26, 0.13], [0.20, 0.66, 0.26, 0.13], [0.54, 0.66, 0.26, 0.13]];
const W3 = [[0.14, 0.24, 0.30, 0.26], [0.56, 0.24, 0.30, 0.26], [0.33, 0.64, 0.34, 0.28]];
const W2 = [[0.18, 0.26, 0.28, 0.30], [0.54, 0.26, 0.28, 0.30]];
const HOUSES = [
  // back row (the far side of the street) — nearest the joint lights first
  { x: 100, y: 86, w: 120, h: 114, roof: 34, litAt: 0.58, manual: 'window:3', win: W3 },
  { x: 250, y: 44, w: 104, h: 156, roof: 26, litAt: 0.64, sign: true, win: W6 },
  { x: 392, y: 80, w: 124, h: 120, roof: 34, litAt: 0.70, manual: 'window:0', win: W3 },
  { x: -20, y: 30, w: 96, h: 170, roof: 24, litAt: 0.82, win: W6 },
  { x: 548, y: 36, w: 100, h: 164, roof: 24, litAt: 0.88, win: W6 },
  { x: -170, y: 70, w: 120, h: 130, roof: 34, litAt: 1.01, win: W4 },
  { x: 678, y: 88, w: 118, h: 112, roof: 32, litAt: 1.06, win: W3 },
  // front row (this side of the street)
  { x: 160, y: 510, w: 118, h: 130, roof: 34, litAt: 0.75, win: W4 },
  { x: 320, y: 540, w: 110, h: 100, roof: 28, litAt: 0.80, manual: 'window:1', win: W2 },
  { x: 10, y: 545, w: 104, h: 95, roof: 26, litAt: 0.91, win: W2 },
  { x: 470, y: 505, w: 128, h: 135, roof: 36, litAt: 0.94, win: W4 },
  { x: -150, y: 520, w: 124, h: 120, roof: 34, litAt: 1.07, win: W3 },
  { x: 640, y: 535, w: 112, h: 105, roof: 30, litAt: 1.12, win: W3 }
];

/** street lamps: base of the pole, height, light delay */
const LAMPS = [
  { x: 60, y: 238, h: 74, litAt: 0.67 },
  { x: 520, y: 238, h: 74, litAt: 0.77, manual: 'window:2' },
  { x: 120, y: 700, h: 84, litAt: 0.85, manual: 'window:4' },
  { x: 300, y: 700, h: 84, litAt: 0.78 },
  { x: 480, y: 700, h: 84, litAt: 0.98 },
  { x: -60, y: 700, h: 84, litAt: 1.10 },
  { x: 660, y: 700, h: 84, litAt: 1.15 }
];

/** fat board components (never thin detail), kept clear of the traced corridor */
const CHIPS = [
  { x: 120, y: 398, w: 86, h: 56 },
  { x: 402, y: 376, w: 76, h: 50 },
  { x: -96, y: 396, w: 80, h: 52 },
  { x: 600, y: 386, w: 84, h: 54 },
  { x: 214, y: 226, w: 70, h: 44 },
  { x: 372, y: 208, w: 66, h: 42 }
];

/** conducting traces: d0 = seconds after the joint closes, dur = travel time */
const TRACES = [
  { d0: 0.24, dur: 0.30, pts: [A, { x: 170, y: 348 }, { x: 96, y: 344 }, { x: 10, y: 330 }, { x: -110, y: 330 }, { x: -210, y: 336 }] },
  { d0: 0.24, dur: 0.30, pts: [B, { x: 432, y: 268 }, { x: 512, y: 258 }, { x: 610, y: 266 }, { x: 726, y: 282 }, { x: 812, y: 288 }] },
  { d0: 0.52, dur: 0.22, pts: [{ x: 170, y: 348 }, { x: 166, y: 262 }, { x: 160, y: 200 }] },
  { d0: 0.60, dur: 0.24, pts: [{ x: 96, y: 344 }, { x: 96, y: 260 }, { x: 60, y: 238 }] },
  { d0: 0.60, dur: 0.26, pts: [{ x: 432, y: 268 }, { x: 436, y: 214 }, { x: 452, y: 200 }] },
  { d0: 0.66, dur: 0.26, pts: [{ x: 512, y: 258 }, { x: 516, y: 214 }, { x: 520, y: 238 }] },
  { d0: 0.68, dur: 0.30, pts: [{ x: 10, y: 330 }, { x: 10, y: 240 }, { x: 28, y: 200 }] },
  { d0: 0.86, dur: 0.34, pts: [{ x: -110, y: 330 }, { x: -110, y: 250 }, { x: -110, y: 200 }] },
  { d0: 0.92, dur: 0.34, pts: [{ x: 610, y: 266 }, { x: 598, y: 200 }, { x: 598, y: 180 }] },
  { d0: 1.14, dur: 0.34, pts: [{ x: 726, y: 282 }, { x: 736, y: 220 }, { x: 736, y: 200 }] },
  // down into the front row
  { d0: 0.44, dur: 0.26, pts: [{ x: 300, y: 307 }, { x: 300, y: 410 }, { x: 300, y: 470 }] },
  { d0: 0.72, dur: 0.30, pts: [{ x: 300, y: 470 }, { x: 220, y: 480 }, { x: 214, y: 510 }] },
  { d0: 0.78, dur: 0.30, pts: [{ x: 300, y: 470 }, { x: 376, y: 486 }, { x: 376, y: 540 }] },
  { d0: 0.92, dur: 0.34, pts: [{ x: 96, y: 344 }, { x: 62, y: 480 }, { x: 62, y: 545 }] },
  { d0: 0.96, dur: 0.36, pts: [{ x: 512, y: 258 }, { x: 560, y: 420 }, { x: 534, y: 505 }] },
  { d0: 1.10, dur: 0.38, pts: [{ x: -110, y: 330 }, { x: -120, y: 470 }, { x: -88, y: 520 }] },
  { d0: 1.20, dur: 0.38, pts: [{ x: 726, y: 282 }, { x: 726, y: 460 }, { x: 696, y: 535 }] },
  // the lamp-lit street in the foreground
  { d0: 0.86, dur: 0.30, pts: [{ x: 300, y: 470 }, { x: 300, y: 620 }, { x: 300, y: 700 }] },
  { d0: 0.98, dur: 0.32, pts: [{ x: 300, y: 700 }, { x: 200, y: 706 }, { x: 120, y: 700 }] },
  { d0: 1.10, dur: 0.32, pts: [{ x: 300, y: 700 }, { x: 400, y: 706 }, { x: 480, y: 700 }] },
  { d0: 1.28, dur: 0.34, pts: [{ x: 120, y: 700 }, { x: 20, y: 706 }, { x: -60, y: 700 }] },
  { d0: 1.34, dur: 0.34, pts: [{ x: 480, y: 700 }, { x: 580, y: 706 }, { x: 660, y: 700 }] }
];

// ---------------------------------------------------------------- small geometry helpers

function bezierPath(p0, p1, p2, p3, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
    });
  }
  return out;
}

function polyLengths(pts) {
  const seg = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    seg.push(d); total += d;
  }
  return { seg, total };
}

/** the first `frac` of a polyline, as a new point list (>= 2 points when frac > 0) */
function slicePoly(pts, frac, cache) {
  const f = clamp(frac);
  if (f <= 0) return null;
  const L = cache || polyLengths(pts);
  if (L.total <= 0) return null;
  const want = L.total * f;
  const out = [{ x: pts[0].x, y: pts[0].y }];
  let acc = 0;
  for (let i = 0; i < L.seg.length; i++) {
    const s = L.seg[i];
    if (acc + s >= want) {
      const k = s <= 0 ? 0 : (want - acc) / s;
      out.push({ x: lerp(pts[i].x, pts[i + 1].x, k), y: lerp(pts[i].y, pts[i + 1].y, k) });
      return out;
    }
    acc += s;
    out.push({ x: pts[i + 1].x, y: pts[i + 1].y });
  }
  return out;
}

function pointAtFrac(pts, frac, cache) {
  const L = cache || polyLengths(pts);
  const want = L.total * clamp(frac);
  let acc = 0;
  for (let i = 0; i < L.seg.length; i++) {
    const s = L.seg[i];
    if (acc + s >= want) {
      const k = s <= 0 ? 0 : (want - acc) / s;
      return {
        x: lerp(pts[i].x, pts[i + 1].x, k), y: lerp(pts[i].y, pts[i + 1].y, k),
        tx: (pts[i + 1].x - pts[i].x) / (s || 1), ty: (pts[i + 1].y - pts[i].y) / (s || 1)
      };
    }
    acc += s;
  }
  const n = pts.length;
  return { x: pts[n - 1].x, y: pts[n - 1].y, tx: 1, ty: 0 };
}

function roundedRectPoints(cx, cy, w, h, r, perSide = 7) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  const out = [];
  const corner = (ccx, ccy, a0) => {
    for (let i = 0; i <= perSide; i++) {
      const a = a0 + (i / perSide) * (Math.PI / 2);
      out.push({ x: ccx + Math.cos(a) * r, y: ccy + Math.sin(a) * r });
    }
  };
  out.push({ x: x0 + r, y: y0 });
  out.push({ x: x1 - r, y: y0 });
  corner(x1 - r, y0 + r, -Math.PI / 2);
  out.push({ x: x1, y: y1 - r });
  corner(x1 - r, y1 - r, 0);
  out.push({ x: x0 + r, y: y1 });
  corner(x0 + r, y1 - r, Math.PI / 2);
  out.push({ x: x0, y: y0 + r });
  corner(x0 + r, y0 + r, Math.PI);
  return out;
}

// ================================================================ world module

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
    const rng = engine.rng;

    // ------------------------------------------------------------ state
    let t = 0;
    let phase = 'intro';              // intro | invite | acting | change | complete | leaving
    let introT = 0;
    let flow = -1;                    // seconds since the joint closed (-1 = not yet)
    let leaveT = 0;
    let spoken = false;
    let finished = false;
    let retHandoff = null;

    let prog = 0;                     // recognizer progress (monotonic)
    let renderProg = 0;               // what the wire actually shows (springs back)
    let spring = null;                // {from, t}
    let fingerDown = false;
    let bow = { x: 0, y: 0 };         // world-space bow offset of the wire tip
    let traceH = null;
    let traceSfx = null;
    let sparkT = 0;
    let idleT = 0;
    // §2.2 / review G: after the domino, 2 windows + 1 lamp stay dark on purpose so the
    // child can keep touching. Each one lit adds time; the train can be tooted.
    let leaveAt = 12;               // seconds after the joint closes (capped at 18)
    const manualOn = new Map();     // house/lamp object -> flow time it was switched on
    let trainU = 0;
    let trainBoost = 0;
    let trainToot = 0;
    const pulses = [];              // {pts, t} small currents running to a just-lit window

    // camera (kept locally so the hearth's own camera reset during the return overlap
    // cannot snap this world back to screen space mid-shrink; mirrored into engine.camera)
    const cam = { zoom: MACRO_ZOOM, x: TOWN.x, y: TOWN.y };
    let viewW = 1, viewH = 1, baseScale = 1, S = 1;
    let panOff = { x: 0, y: 0 };      // micro-pan offset in world units
    let gapAnchor = { x: 0, y: 0 };   // screen px where the gap sits during the macro shot
    let shelfHint = { x: 0, y: 0 };

    // geometry caches
    const path = bezierPath(BEZ[0], BEZ[1], BEZ[2], BEZ[3], 34);
    const pathLen = polyLengths(path);
    const traceLens = TRACES.map((tr) => polyLengths(tr.pts));
    const ring = roundedRectPoints(TOWN.x, TOWN.y, 980, 980, 250, 7);
    const ringLen = polyLengths(ring);
    let screenPath = [];
    let lastSyncX = 1e9, lastSyncY = 1e9;

    const ambientAt = () => lerpColor(handoff ? handoff.flameColor : DEF.flameColor, DEF.ambient, clamp(t / 1.5));
    /** when this light turns on: its domino time, or (for the reserved ones) the tap time */
    const litTime = (o) => {
      if (!o.manual) return o.litAt;
      const v = manualOn.get(o);
      return v == null ? Infinity : v;
    };
    const litCount = () => {
      if (flow < 0) return 0;
      let n = 0;
      for (const hs of HOUSES) if (flow >= litTime(hs)) n++;
      for (const lp of LAMPS) if (flow >= litTime(lp)) n++;
      return n;
    };
    /** lights the domino itself brings up (the reserved dark ones are the child's) */
    const autoLit = () => {
      if (flow < 0) return 0;
      let n = 0;
      for (const hs of HOUSES) if (!hs.manual && flow >= hs.litAt) n++;
      for (const lp of LAMPS) if (!lp.manual && flow >= lp.litAt) n++;
      return n;
    };
    const autoTotal = HOUSES.filter((h) => !h.manual).length + LAMPS.filter((l) => !l.manual).length;
    /** the reserved dark lights, in a stable order, with their world anchor point */
    const DARK = [];
    for (const hs of HOUSES) if (hs.manual) DARK.push({ id: hs.manual, o: hs, x: hs.x + hs.w / 2, y: hs.y + hs.h * 0.45 });
    for (const lp of LAMPS) if (lp.manual) DARK.push({ id: lp.manual, o: lp, x: lp.x, y: lp.y - lp.h });
    DARK.sort((a, b) => (a.id < b.id ? -1 : 1));
    const trainPos = () => pointAtFrac(ring, trainU, ringLen);
    const trainAlive = () => flow >= 1.55;

    /** switch one reserved light on: teal pulse down its feeder trace + more time to play */
    function lightUp(d) {
      if (manualOn.has(d.o)) return;
      manualOn.set(d.o, flow);
      leaveAt = Math.min(18, Math.max(leaveAt, flow + 2.2) + 1.5);
      engine.audio.play('lamp_on');
      // find the trace that feeds this light and run a current along it
      let best = null, bd = Infinity;
      for (const tr of TRACES) {
        const e = tr.pts[tr.pts.length - 1];
        const dd = Math.hypot(e.x - d.x, e.y - d.y);
        if (dd < bd) { bd = dd; best = tr; }
      }
      if (best) pulses.push({ pts: best.pts, t: 0 });
      const sp = w2s(d.x, d.y);
      engine.particles.burst(sp.x, sp.y, 14, {
        speed: [40, 150], life: [0.3, 0.7], r: [1.2, 2.6],
        color: [DEF.glowColor, WARM, '#ffffff'], drag: 0.88
      });
    }
    const litTotal = HOUSES.length + LAMPS.length;

    // ------------------------------------------------------------ camera helpers
    const scale = () => baseScale * cam.zoom;
    function w2s(x, y) {
      const s = scale();
      return { x: (x - cam.x) * s + viewW / 2, y: (y - cam.y) * s + viewH / 2 };
    }
    function s2w(x, y) {
      const s = scale();
      return { x: (x - viewW / 2) / s + cam.x, y: (y - viewH / 2) / s + cam.y };
    }
    function centerOn(wx, wy, sx, sy) {
      const s = scale();
      cam.x = wx - (sx - viewW / 2) / s;
      cam.y = wy - (sy - viewH / 2) / s;
    }
    function mirrorCamera() {
      if (finished) return;
      try {
        engine.camera.zoom = cam.zoom;
        engine.camera.x = cam.x;
        engine.camera.y = cam.y;
      } catch (e) { /* */ }
    }

    // ------------------------------------------------------------ layout
    function frameMacro() {
      cam.zoom = MACRO_ZOOM;
      const mid = pointAtFrac(path, 0.5, pathLen);
      centerOn(mid.x + panOff.x, mid.y + panOff.y, gapAnchor.x, gapAnchor.y);
    }
    function frameWide() {
      cam.zoom = WIDE_ZOOM;
      centerOn(TOWN.x, TOWN.y, viewW / 2, viewH * (engine.isPortrait ? 0.47 : 0.5));
    }

    function layout(w, h) {
      viewW = w; viewH = h;
      S = Math.min(w, h);
      baseScale = S / 600;
      engine.camera.setFrame({ coreW: 600, coreH: 600, mode: 'contain' });

      const zone = engine.thumbZone();
      gapAnchor = { x: w * 0.5, y: zone.y + zone.h * 0.42 };
      shelfHint = engine.isPortrait
        ? { x: w * 0.5, y: h * 0.635 }
        : { x: w * 0.085, y: h * 0.5 };

      if (phase === 'change' || phase === 'complete') frameWide();
      else if (phase !== 'leaving') {
        frameMacro();
        // keep both endpoints comfortably inside the safe area
        const ins = engine.insets;
        const padX = Math.max(ins.left, ins.right) + S * 0.06;
        const padY = S * 0.09;
        for (let i = 0; i < 3; i++) {
          const sa = w2s(A.x, A.y), sb = w2s(B.x, B.y);
          let dx = 0, dy = 0;
          const minX = Math.min(sa.x, sb.x), maxX = Math.max(sa.x, sb.x);
          const minY = Math.min(sa.y, sb.y), maxY = Math.max(sa.y, sb.y);
          if (minX < padX) dx = padX - minX;
          else if (maxX > w - padX) dx = (w - padX) - maxX;
          if (minY < ins.top + padY) dy = ins.top + padY - minY;
          else if (maxY > h - ins.bottom - padY) dy = (h - ins.bottom - padY) - maxY;
          if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) break;
          gapAnchor.x += dx; gapAnchor.y += dy;
          frameMacro();
        }
      }
      syncTracePath(true);
      mirrorCamera();
    }

    /** rebuild the css-px ideal path (recognizer + debugState) from the current camera */
    function syncTracePath(force) {
      if (!force && Math.abs(cam.x - lastSyncX) * scale() < 0.8 && Math.abs(cam.y - lastSyncY) * scale() < 0.8) return;
      lastSyncX = cam.x; lastSyncY = cam.y;
      const out = new Array(path.length);
      for (let i = 0; i < path.length; i++) out[i] = w2s(path[i].x, path[i].y);
      screenPath = out;
      if (traceH) traceH.update({ path: screenPath });
    }

    // ------------------------------------------------------------ the climax
    function connect() {
      if (flow >= 0) return;
      flow = 0;
      phase = 'change';
      prog = 1; renderProg = 1; spring = null;
      if (traceH) traceH.cancel();
      if (traceSfx) { traceSfx.stop(); traceSfx = null; }
      engine.audio.play('snap');
      engine.audio.play('power_on', { base: 392 });
      // the joint sparks, in screen space
      const j = w2s(B.x, B.y);
      engine.particles.burst(j.x, j.y, 26, {
        speed: [60, 260], life: [0.35, 0.9], r: [1.4, 3.2],
        color: [DEF.flameColor, DEF.glowColor, '#ffffff'], drag: 0.88
      });
      // the camera discovers the town
      camAnim = { t: 0, dur: 1.1, z0: cam.zoom, z1: WIDE_ZOOM };
      engine.audio.play('spread');
    }
    let camAnim = null;

    // ------------------------------------------------------------ enter / exit
    function enter() {
      if (handoff && handoff.particles) engine.particles.inject(handoff.particles);
      layout(engine.width, engine.height);

      traceH = rec.onTrace(screenPath, {
        onProgress: (t01, near, onPath) => {
          if (flow >= 0) return;
          if (t01 > prog) prog = t01;
          if (t01 >= renderProg) { renderProg = t01; spring = null; }
          if (phase === 'intro' || phase === 'invite') {
            phase = 'acting';
            if (!traceSfx) traceSfx = engine.audio.play('trace', { f0: 330 });
          }
          if (traceSfx) traceSfx.setLevel(renderProg);
          idleT = 0;
        },
        onComplete: () => connect(),
        onDeviate: (t01) => {
          if (flow >= 0) return;
          if (!fingerDown && t01 <= 0.0001 && renderProg > 0.01) {
            // released below 50%: the wire springs gently home for another try
            spring = { from: renderProg, t: 0 };
            prog = 0;
            engine.audio.play('drop_back');
          }
        }
      }, {
        toleranceRatio: 0.10,
        autoCompleteAt: 0.5,
        monotonic: true,
        resampleStep: 7,
        startToleranceRatio: 0.30
      });

      // once the town is alive, the dark windows and the little train stay touchable
      rec.onTap((p) => flow >= 0 && !!pickTapTarget(p), (p) => {
        const hit = pickTapTarget(p);
        if (!hit) return;
        if (hit === 'train') {
          trainBoost = 1;
          trainToot = 0.5;
          engine.audio.play('hop');
          const tp = trainPos();
          const sp = w2s(tp.x, tp.y);
          engine.particles.burst(sp.x, sp.y, 10, {
            speed: [30, 120], life: [0.3, 0.8], r: [1.4, 3],
            color: ['#ffffff', WARM], drag: 0.9, gravity: -40
          });
          leaveAt = Math.min(18, Math.max(leaveAt, flow + 2.0));
        } else {
          lightUp(hit);
        }
        idleT = 0;
      }, { maxMoveRatio: 0.10, maxDurationMs: 900 });
    }

    /** nearest still-dark window / the train, in screen space (very generous radii) */
    function pickTapTarget(p) {
      if (flow < 0) return null;
      let best = null, bd = Infinity;
      for (const d of DARK) {
        if (manualOn.has(d.o)) continue;
        const sp = w2s(d.x, d.y);
        const dd = Math.hypot(p.x - sp.x, p.y - sp.y);
        if (dd < S * 0.16 && dd < bd) { bd = dd; best = d; }
      }
      if (trainAlive()) {
        const tp = trainPos();
        const sp = w2s(tp.x, tp.y);
        const dd = Math.hypot(p.x - sp.x, p.y - sp.y);
        if (dd < S * 0.14 && dd < bd) { bd = dd; best = 'train'; }
      }
      return best;
    }

    function exit() {
      rec.destroy();
      if (traceSfx) { traceSfx.stop(); traceSfx = null; }
    }

    // ------------------------------------------------------------ update
    function update(dt) {
      t += dt;
      idleT += dt;

      if (phase === 'intro') {
        introT += dt;
        // the flood of flame colour keeps drifting toward the gap
        const a = w2s(A.x, A.y);
        engine.particles.attract(a.x, a.y - S * 0.07, 220, dt);
        if (introT >= 1.05) phase = 'invite';
      }

      // wire spring-back
      if (spring) {
        spring.t += dt;
        const k = clamp(spring.t / 0.5);
        renderProg = spring.from * (1 - easeInOutCubic(k));
        if (k >= 1) { spring = null; renderProg = 0; if (phase === 'acting') phase = 'invite'; }
      }

      // micro-pan: the macro shot follows the finger a little
      if (flow < 0) {
        let want = { x: 0, y: 0 };
        if (fingerDown && lastFinger) {
          const fw = s2w(lastFinger.x, lastFinger.y);
          const mid = pointAtFrac(path, 0.5, pathLen);
          want = {
            x: clamp((fw.x - mid.x) * 0.16, -46, 46),
            y: clamp((fw.y - mid.y) * 0.16, -34, 34)
          };
        }
        panOff.x = lerp(panOff.x, want.x, damp(0.90, dt));
        panOff.y = lerp(panOff.y, want.y, damp(0.90, dt));
        frameMacro();
        syncTracePath(false);

        // sparks at the two broken ends (§2.2 invitation)
        sparkT -= dt;
        if (sparkT <= 0 && phase !== 'intro') {
          sparkT = 0.13;
          for (const e of [{ x: A.x + 20, y: A.y - 7 }, { x: B.x - 20, y: B.y + 7 }]) {
            const sp = w2s(e.x, e.y);
            engine.particles.emit({
              x: sp.x, y: sp.y,
              vx: (rng.next() - 0.5) * 90, vy: -30 - rng.next() * 70,
              r: 1.2 + rng.next() * 1.8, life: 0.3 + rng.next() * 0.4,
              color: rng.next() < 0.3 ? '#ffffff' : DEF.glowColor, drag: 0.9, gravity: 120
            });
          }
        }
      }

      // the world change
      if (flow >= 0) {
        flow += dt;
        if (trainAlive()) trainU = (trainU + (0.052 + trainBoost * 0.11) * dt) % 1;
        if (trainBoost > 0) trainBoost = Math.max(0, trainBoost - dt / 1.6);
        if (trainToot > 0) trainToot = Math.max(0, trainToot - dt);
        for (let i = pulses.length - 1; i >= 0; i--) {
          pulses[i].t += dt;
          if (pulses[i].t > 0.55) pulses.splice(i, 1);
        }
        if (camAnim) {
          camAnim.t = Math.min(camAnim.dur, camAnim.t + dt);
          const k = easeOutCubic(camAnim.t / camAnim.dur);
          cam.zoom = lerp(camAnim.z0, camAnim.z1, k);
          const mid = pointAtFrac(path, 0.5, pathLen);
          const wx = lerp(mid.x, TOWN.x, k), wy = lerp(mid.y, TOWN.y, k);
          const sx = lerp(gapAnchor.x, viewW / 2, k);
          const sy = lerp(gapAnchor.y, viewH * (engine.isPortrait ? 0.47 : 0.5), k);
          centerOn(wx, wy, sx, sy);
          if (camAnim.t >= camAnim.dur) camAnim = null;
        }
        // 「どう」— spoken once, mid pull-back, when more than half the town is lit
        if (!spoken && autoLit() > autoTotal * 0.5) {
          spoken = true;
          engine.audio.speakElement(DEF.id);
        }
        if (phase === 'change' && flow >= 2.2) phase = 'complete';
        if (phase === 'complete' && flow >= leaveAt) { phase = 'leaving'; leaveT = 0; }
      }

      if (phase === 'leaving') {
        leaveT += dt;
        const k = easeInOutCubic(clamp(leaveT / 1.2));
        cam.zoom = lerp(WIDE_ZOOM, SHELF_ZOOM, k);
        const sx = lerp(viewW / 2, shelfHint.x, k);
        const sy = lerp(viewH * (engine.isPortrait ? 0.47 : 0.5), shelfHint.y, k);
        centerOn(TOWN.x, TOWN.y, sx, sy);
        if (leaveT >= 1.2 && !finished) {
          finished = true;
          const o = w2s(TOWN.x, TOWN.y);
          retHandoff = makeHandoff({
            elementId: DEF.id,
            flameColor: DEF.flameColor,
            glowColor: DEF.glowColor,
            ambient: DEF.ambient,
            origin: { x: o.x, y: o.y },
            particles: engine.particles.snapshot(),
            cameraZoom: cam.zoom
          });
          finish({
            worldId: DEF.id,
            completed: true,
            shelfAnchorHint: { x: shelfHint.x, y: shelfHint.y },
            returnHandoff: retHandoff
          });
        }
      }

      mirrorCamera();
    }

    // ------------------------------------------------------------ drawing pieces

    /** the wire the child is drawing (or that already connects the two ends) */
    function wirePoints() {
      const n = path.length;
      const kf = renderProg * (n - 1);
      const ki = Math.floor(kf);
      const out = [];
      const dv = flow >= 0 ? { x: 0, y: 0 } : bow;
      for (let i = 0; i <= ki; i++) {
        const wgt = kf <= 0 ? 0 : Math.pow(i / kf, 2);
        out.push({ x: path[i].x + dv.x * wgt, y: path[i].y + dv.y * wgt });
      }
      const tip = pointAtFrac(path, renderProg, pathLen);
      out.push({ x: tip.x + dv.x, y: tip.y + dv.y });
      return out;
    }

    function drawBoard(g) {
      const lit = flow >= 0 ? clamp(flow / 1.8) : 0;
      g.save();
      // the board itself
      g.fillStyle = BOARD_0;
      fillRoundRect(g, BOARD.x, BOARD.y, BOARD.w, BOARD.h, 86);
      g.fillStyle = withAlpha(BOARD_1, 0.9);
      fillRoundRect(g, BOARD.x + 30, BOARD.y + 30, BOARD.w - 60, BOARD.h - 60, 62);
      // silkscreen border (rounded, fat, never thin)
      g.strokeStyle = withAlpha(BOARD_EDGE, 0.55 + lit * 0.35);
      g.lineWidth = 10;
      g.beginPath();
      roundRect(g, BOARD.x + 52, BOARD.y + 52, BOARD.w - 104, BOARD.h - 104, 52);
      g.stroke();
      // solder pads: a sparse regular grid
      g.fillStyle = withAlpha(PAD, 0.09 + lit * 0.15);
      for (let gx = -190; gx <= 800; gx += 90) {
        for (let gy = -190; gy <= 800; gy += 90) {
          g.beginPath(); g.arc(gx, gy, 6, 0, Math.PI * 2); g.fill();
        }
      }
      // a few fat components so the empty board is never empty in the macro shot
      for (const c of CHIPS) {
        g.fillStyle = withAlpha('#0a1a20', 0.95);
        fillRoundRect(g, c.x, c.y, c.w, c.h, 12);
        g.fillStyle = withAlpha(PAD, 0.30 + lit * 0.3);
        for (let i = 0; i < 4; i++) {
          const lx = c.x + c.w * (0.18 + i * 0.215);
          fillRoundRect(g, lx, c.y - 7, c.w * 0.13, 8, 3);
          fillRoundRect(g, lx, c.y + c.h - 1, c.w * 0.13, 8, 3);
        }
        const on = lit > 0 && ((flow * 2.2 + c.x * 0.01) % 2) < 1.1;
        if (on) glowCircle(g, c.x + c.w * 0.5, c.y + c.h * 0.5, 30, DEF.glowColor, 0.7);
        g.fillStyle = on ? withAlpha('#ffffff', 0.9) : withAlpha('#16323a', 0.9);
        g.beginPath(); g.arc(c.x + c.w * 0.5, c.y + c.h * 0.5, 6, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }

    /** a settled conducting trace: two additive strokes instead of glowLine's three */
    function litStroke(g, pts, width, close) {
      g.save();
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.globalCompositeOperation = 'lighter';
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      if (close) g.closePath();
      g.lineWidth = width * 2.6;
      g.strokeStyle = withAlpha(DEF.flameColor, 0.13);
      g.stroke();
      g.lineWidth = width;
      g.strokeStyle = withAlpha(DEF.flameColor, 0.5);
      g.stroke();
      g.restore();
    }

    function drawTraces(g) {
      const f = flow;
      for (let i = 0; i < TRACES.length; i++) {
        const tr = TRACES[i];
        const L = traceLens[i];
        // the dull copper trace itself
        g.save();
        g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath();
        g.moveTo(tr.pts[0].x, tr.pts[0].y);
        for (let k = 1; k < tr.pts.length; k++) g.lineTo(tr.pts[k].x, tr.pts[k].y);
        g.lineWidth = 9;
        g.strokeStyle = withAlpha(TRACE_DARK, f >= 0 ? 0.95 : 0.72);
        g.stroke();
        g.restore();
        if (f < tr.d0) continue;
        const k = clamp((f - tr.d0) / tr.dur);
        if (k >= 1) { litStroke(g, tr.pts, 5); continue; }
        const seg = slicePoly(tr.pts, k, L);
        if (seg && seg.length > 1) {
          glowLine(g, seg, 5, DEF.flameColor, 0.5);
          const head = seg[seg.length - 1];
          glowCircle(g, head.x, head.y, 30, DEF.glowColor, 0.7);
        }
      }
      // the track ring conducts too, last of all
      if (f >= 1.1) {
        const k = clamp((f - 1.1) / 0.9);
        const seg = slicePoly(ring, k, ringLen);
        if (seg && seg.length > 1) {
          if (k >= 1) litStroke(g, ring, 4.5, true);
          else glowLine(g, seg, 4.5, DEF.flameColor, 0.42);
        }
      } else {
        g.save();
        g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath();
        g.moveTo(ring[0].x, ring[0].y);
        for (let k = 1; k < ring.length; k++) g.lineTo(ring[k].x, ring[k].y);
        g.closePath();
        g.lineWidth = 8;
        g.strokeStyle = withAlpha(TRACE_DARK, 0.5);
        g.stroke();
        g.restore();
      }
    }

    function drawTrain(g) {
      if (!trainAlive()) return;
      const a = clamp((flow - 1.55) / 0.5);
      const u = trainU;
      for (let c = 0; c < 3; c++) {
        const p = pointAtFrac(ring, (u - c * 0.018 + 1) % 1, ringLen);
        const ang = Math.atan2(p.ty, p.tx);
        g.save();
        g.globalAlpha = a;
        g.translate(p.x, p.y);
        g.rotate(ang);
        glowCircle(g, 0, 0, 52, DEF.glowColor, 0.4 * a);
        g.fillStyle = c === 0 ? '#32586a' : '#2a4859';
        fillRoundRect(g, -27, -16, 54, 32, 12);
        g.fillStyle = withAlpha(WARM_HOT, 0.95);
        fillRoundRect(g, -16, -8, 13, 13, 5);
        fillRoundRect(g, 4, -8, 13, 13, 5);
        if (c === 0) {
          glowCircle(g, 30, 0, 34 + trainBoost * 16, WARM, 0.9);
          if (trainToot > 0) {
            // a little puff of steam when the train is tooted
            const k = 1 - trainToot / 0.5;
            glowCircle(g, -6, -26 - k * 26, 16 + k * 26, '#ffffff', 0.5 * (1 - k));
          }
        }
        g.restore();
      }
    }

    function drawHouse(g, hs) {
      const lit = flow < 0 ? 0 : clamp((flow - litTime(hs)) / 0.3);
      const pop = lit > 0 ? easeOutBack(lit) : 0;
      const bodyCol = lerpColor(HOUSE_DARK, HOUSE_LIT, lit * 0.75);
      const cx = hs.x + hs.w / 2;
      g.save();
      if (hs.manual && lit <= 0 && flow > 1.2) {
        const b = 0.35 + 0.65 * (0.5 - 0.5 * Math.cos(t * 3.2));
        glowCircle(g, cx, hs.y + hs.h * 0.5, hs.w * 0.9, DEF.glowColor, 0.18 + 0.3 * b);
      }
      // warm pool of light the house throws on the board
      if (lit > 0) {
        glowCircle(g, cx, hs.y + hs.h, hs.w * 1.15 * lit, WARM, 0.22 * lit);
        if (lit >= 1) glowCircle(g, cx, hs.y + hs.h * 0.5, hs.w * 0.95, WARM, 0.4);
      }
      // roof: a soft pitched cap with rounded corners
      g.fillStyle = lerpColor(ROOF_DARK, '#2e4c5c', lit * 0.75);
      g.beginPath();
      g.moveTo(hs.x - 14, hs.y + 12);
      g.quadraticCurveTo(hs.x - 14, hs.y + 2, hs.x - 2, hs.y - 4);
      g.lineTo(cx - 10, hs.y - hs.roof - 6);
      g.quadraticCurveTo(cx, hs.y - hs.roof - 18, cx + 10, hs.y - hs.roof - 6);
      g.lineTo(hs.x + hs.w + 2, hs.y - 4);
      g.quadraticCurveTo(hs.x + hs.w + 14, hs.y + 2, hs.x + hs.w + 14, hs.y + 12);
      g.closePath();
      g.fill();
      // body
      g.fillStyle = bodyCol;
      fillRoundRect(g, hs.x, hs.y, hs.w, hs.h, 15);
      // rim light along the roof line so the silhouette reads against the board
      g.strokeStyle = withAlpha(lerpColor(DEF.glowColor, WARM, lit), 0.16 + 0.34 * lit);
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(hs.x + 8, hs.y + 6);
      g.lineTo(hs.x + hs.w - 8, hs.y + 6);
      g.stroke();
      // windows
      for (const wn of hs.win) {
        const wx = hs.x + wn[0] * hs.w, wy = hs.y + wn[1] * hs.h;
        const ww = wn[2] * hs.w, wh = wn[3] * hs.h;
        const cx2 = wx + ww / 2, cy2 = wy + wh / 2;
        g.fillStyle = withAlpha('#050b12', 0.92);
        fillRoundRect(g, wx, wy, ww, wh, Math.min(ww, wh) * 0.32);
        if (lit > 0) {
          const k = 0.62 + 0.38 * pop;
          if (lit < 1) glowCircle(g, cx2, cy2, Math.max(ww, wh) * (1.5 + pop * 0.7), WARM, 0.5 * lit);
          g.fillStyle = withAlpha(WARM_HOT, 0.25 + 0.72 * lit);
          fillRoundRect(g, cx2 - ww * k / 2, cy2 - wh * k / 2, ww * k, wh * k, Math.min(ww, wh) * 0.3);
        }
      }
      if (hs.sign) {
        const sx = cx, sy = hs.y - hs.roof - 46;
        g.fillStyle = lerpColor('#0d1a22', '#2a4656', lit);
        fillRoundRect(g, sx - 17, sy - 30, 34, 64, 13);
        for (let i = 0; i < 3; i++) {
          const on = lit > 0 && ((flow * 3 + i) % 3) < 1.7;
          const cy2 = sy - 18 + i * 18;
          if (on) glowCircle(g, sx, cy2, 22, DEF.glowColor, 0.85);
          g.fillStyle = on ? withAlpha('#ffffff', 0.95) : withAlpha('#1c2c36', 0.9);
          g.beginPath(); g.arc(sx, cy2, 7, 0, Math.PI * 2); g.fill();
        }
      }
      g.restore();
    }

    function drawLamp(g, lp) {
      const lit = flow < 0 ? 0 : clamp((flow - litTime(lp)) / 0.28);
      g.save();
      if (lp.manual && lit <= 0 && flow > 1.2) {
        const b = 0.35 + 0.65 * (0.5 - 0.5 * Math.cos(t * 3.2));
        glowCircle(g, lp.x, lp.y - lp.h, 78, DEF.glowColor, 0.18 + 0.3 * b);
      }
      g.strokeStyle = lerpColor('#16242e', '#3a5866', lit);
      g.lineWidth = 8; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(lp.x, lp.y);
      g.lineTo(lp.x, lp.y - lp.h);
      g.stroke();
      const hx = lp.x, hy = lp.y - lp.h - 6;
      if (lit > 0) {
        glowCircle(g, hx, hy + 10, 86 * (0.6 + 0.4 * lit), WARM, 0.75 * lit);
        // the pool of light on the board
        glowCircle(g, lp.x, lp.y, 58 * lit, WARM, 0.3 * lit);
      }
      g.fillStyle = lit > 0 ? withAlpha(WARM_HOT, 0.6 + 0.4 * lit) : '#1b2b36';
      g.beginPath();
      g.moveTo(hx - 17, hy + 10);
      g.quadraticCurveTo(hx, hy - 16, hx + 17, hy + 10);
      g.quadraticCurveTo(hx, hy + 18, hx - 17, hy + 10);
      g.closePath();
      g.fill();
      g.restore();
    }

    /** the two broken ends: pads, stubs that sway toward each other, sparks */
    function drawGap(g) {
      if (flow >= 0) return;
      const sway = Math.sin(t * 2.1) * 5 + Math.sin(t * 3.7) * 2;
      const puls = 0.55 + 0.45 * Math.sin(t * 3.4);
      const ends = [
        { p: A, dir: { x: 1, y: -0.35 }, s: 1 },
        { p: B, dir: { x: -1, y: 0.35 }, s: -1 }
      ];
      for (const e of ends) {
        // the torn-off stub leans toward the other end, as if the two want to touch
        const lean = 20 + sway * e.s;
        const tipX = e.p.x + e.dir.x * lean;
        const tipY = e.p.y + e.dir.y * lean;
        g.save();
        g.lineCap = 'round';
        g.lineWidth = 11;
        g.strokeStyle = withAlpha(TRACE_DARK, 0.95);
        g.beginPath();
        g.moveTo(e.p.x - e.dir.x * 16, e.p.y - e.dir.y * 16);
        g.lineTo(tipX, tipY);
        g.stroke();
        g.fillStyle = withAlpha('#a2703f', 0.95);
        g.beginPath(); g.arc(e.p.x, e.p.y, 12, 0, Math.PI * 2); g.fill();
        g.restore();
        glowCircle(g, tipX, tipY, 40 + puls * 18, DEF.glowColor, 0.5 + puls * 0.35);
        g.save();
        g.fillStyle = withAlpha('#ffffff', 0.55 + puls * 0.4);
        g.beginPath(); g.arc(tipX, tipY, 6.5 + puls * 1.5, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    }

    /** the breathing string of light dots between A and B (never an arrow) */
    function drawDotString(g) {
      if (flow >= 0 || renderProg > 0.02) return;
      const breathe = 0.5 - 0.5 * Math.cos(clamp(((t + 0.6) % 3.4) / 1.5) * Math.PI * 2);
      if (breathe <= 0.01) return;
      const n = 13;
      for (let i = 1; i < n; i++) {
        const f = i / n;
        const p = pointAtFrac(path, f, pathLen);
        const wave = 0.35 + 0.65 * Math.max(0, Math.sin((f - (t * 0.45) % 1) * Math.PI * 2 + Math.PI / 2));
        const a = breathe * wave * 0.5;
        if (a <= 0.02) continue;
        glowCircle(g, p.x, p.y, 16, DEF.glowColor, a * 0.9);
        g.save();
        g.globalAlpha = a;
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(p.x, p.y, 4, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    }

    function drawWire(g) {
      if (renderProg <= 0.001 && flow < 0) return;
      const pts = wirePoints();
      if (pts.length < 2) return;
      // material: blue-green memory of the flame -> copper red-brown once it conducts
      const settle = flow < 0 ? 0 : clamp(flow / 0.55);
      const metal = lerpColor(DEF.flameColor, WIRE_COPPER, settle);
      const metalHi = lerpColor(DEF.glowColor, WIRE_COPPER_HI, settle);
      g.save();
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.lineWidth = 15;
      g.strokeStyle = withAlpha(metal, 0.98);
      g.stroke();
      g.lineWidth = 5;
      g.strokeStyle = withAlpha(metalHi, 0.3 + 0.25 * settle);
      g.stroke();
      g.restore();
      if (settle < 1) glowLine(g, pts, 8, DEF.flameColor, 0.34 * (1 - settle) + 0.1);

      // the current itself always stays blue-green (light vs material):
      // first it races across the new joint, then it keeps pulsing through the copper
      if (flow >= 0) {
        if (flow < 0.6) {
          const seg = slicePoly(pts, clamp(flow / 0.5));
          if (seg && seg.length > 1) glowLine(g, seg, 6, DEF.flameColor, 0.7);
        } else {
          const L = polyLengths(pts);
          const u = (flow * 0.55) % 1.25;
          const f1 = clamp(u), f0 = clamp(u - 0.22);
          if (f1 > f0) {
            const seg = [];
            for (let i = 0; i <= 5; i++) seg.push(pointAtFrac(pts, f0 + (f1 - f0) * (i / 5), L));
            glowLine(g, seg, 5, DEF.flameColor, 0.55);
            glowCircle(g, seg[5].x, seg[5].y, 22, DEF.glowColor, 0.6);
          }
        }
      } else {
        // the growing tip sparkles
        const tip = pts[pts.length - 1];
        glowCircle(g, tip.x, tip.y, 30 + Math.sin(t * 8) * 4, DEF.glowColor, 0.9);
      }
    }

    /** ヒノコ — glowing round head, two eyes, two little hands, no mouth (§1.3) */
    function drawHinoko(g) {
      const r = 34;
      const crouch = flow < 0;
      const cheer = flow >= 0 && flow > 0.8;
      const hop = cheer ? Math.abs(Math.sin(flow * 7)) * 12 : 0;
      const x = (A.x + B.x) / 2 - 62;
      const y = (crouch ? A.y + 86 : A.y + 70) - hop + Math.sin(t * 1.7) * 3;
      // gaze: into the gap while it is broken, up at the town once it is lit
      const gx = crouch ? (A.x + B.x) / 2 : TOWN.x;
      const gy = crouch ? (A.y + B.y) / 2 + 8 : TOWN.y - 190;

      glowCircle(g, x, y, r * 2.6, HINOKO, 0.5);
      softDisc(g, x, y, r, '#ffeab4', withAlpha(HINOKO, 0.1));
      g.save();
      g.fillStyle = withAlpha('#ffb54a', 0.92);
      g.beginPath(); g.ellipse(x, y + r * 0.1, r * 0.84, r * 0.88, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = withAlpha('#fff1cc', 0.96);
      g.beginPath(); g.ellipse(x, y, r * 0.68, r * 0.72, 0, 0, Math.PI * 2); g.fill();
      g.restore();

      const ang = Math.atan2(gy - y, gx - x);
      const look = Math.min(r * 0.24, Math.hypot(gx - x, gy - y) * 0.1);
      const ex = Math.cos(ang) * look, ey = Math.sin(ang) * look;
      const eo = r * 0.3;
      const blink = (t % 3.6) < 0.14 ? 0.18 : 1;
      for (const s of [-1, 1]) {
        g.fillStyle = '#ffffff';
        g.beginPath(); g.ellipse(x + s * eo, y - r * 0.04, r * 0.2, r * 0.23 * blink, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#2a1410';
        g.beginPath(); g.ellipse(x + s * eo + ex, y - r * 0.04 + ey, r * 0.11, r * 0.13 * blink, 0, 0, Math.PI * 2); g.fill();
      }
      const hy = cheer ? y - r * 1.0 : y + r * 0.42;
      for (const s of [-1, 1]) {
        const hx = x + s * r * (cheer ? 0.95 : 1.06);
        const yy = hy + Math.sin(t * 6 + s) * r * 0.06 * (cheer ? 1.4 : 0.4);
        glowCircle(g, hx, yy, r * 0.55, HINOKO, 0.5);
        g.fillStyle = withAlpha('#ffd98a', 0.95);
        g.beginPath(); g.arc(hx, yy, r * 0.2, 0, Math.PI * 2); g.fill();
      }
    }

    /** the かけら: a glowing copper wire fragment, trembling over endpoint A (screen space) */
    function drawFragment(g) {
      if (renderProg > 0.02 || flow >= 0) return;
      const target = w2s(A.x, A.y);
      const home = { x: target.x, y: target.y - S * 0.085 };
      let px = home.x, py = home.y, a = 1;
      if (phase === 'intro') {
        const k = easeOutCubic(clamp(introT / 1.05));
        const o = (handoff && handoff.origin) ? handoff.origin : { x: viewW / 2, y: viewH * 0.4 };
        px = lerp(o.x, home.x, k);
        py = lerp(o.y, home.y, k) - Math.sin(k * Math.PI) * S * 0.09;
        a = clamp(introT / 0.3);
      }
      const trem = phase === 'intro' ? 0 : 1;
      px += Math.sin(t * 19) * S * 0.006 * trem;
      py += Math.cos(t * 23) * S * 0.005 * trem + Math.sin(t * 2.2) * S * 0.006;
      // after a while with nobody touching, the fragment dips toward the endpoint
      // and comes back — a physical "it goes here", never an arrow (§1.3 / §2.2)
      if (trem && idleT > 4) {
        const dip = Math.max(0, Math.sin(((idleT - 4) % 2.6) / 2.6 * Math.PI * 2));
        py += dip * S * 0.05;
      }
      const L2 = S * 0.085;
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const f = i / 8;
        pts.push({ x: px + (f - 0.5) * L2, y: py + Math.sin(f * Math.PI * 2) * L2 * 0.16 });
      }
      g.save();
      g.globalAlpha = a;
      glowLine(g, pts, S * 0.017, DEF.glowColor, 1);
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.lineWidth = S * 0.013;
      g.strokeStyle = withAlpha(DEF.flameColor, 0.95);
      g.stroke();
      g.restore();
    }

    // ------------------------------------------------------------ draw
    function draw(g) {
      const w = engine.width, h = engine.height;
      const hp = handoff && typeof handoff.progress === 'number' ? handoff.progress : 1;
      let alpha = clamp(Math.max(hp, t / 0.6));
      if (retHandoff && retHandoff.progress > 0) alpha *= clamp(1 - retHandoff.progress * 0.9);
      if (alpha <= 0.002) return;

      const amb = ambientAt();

      g.save();
      g.globalAlpha = alpha;

      // night sky behind the diorama (smooth, no banding seam)
      g.fillStyle = cachedLinear(g, 'copper-sky', 0, 0, 0, h, [
        [0, NIGHT_0], [0.55, NIGHT_1], [1, '#061019']
      ]);
      g.fillRect(0, 0, w, h);
      const glowStrength = flow >= 0 ? 0.09 + 0.10 * clamp(flow / 1.8) : 0.18;
      const glowAt = flow >= 0 ? w2s(TOWN.x, TOWN.y) : w2s((A.x + B.x) / 2, (A.y + B.y) / 2);
      radialFlood(g, glowAt.x, glowAt.y, S * (0.55 + 0.45 * cam.zoom), amb, glowStrength);

      // ---- the diorama, in world units
      const s = scale();
      g.save();
      g.translate(w / 2, h / 2);
      g.scale(s, s);
      g.translate(-cam.x, -cam.y);

      drawBoard(g);
      drawTraces(g);
      for (const hs of HOUSES) drawHouse(g, hs);
      for (const lp of LAMPS) drawLamp(g, lp);
      drawTrain(g);
      for (const pu of pulses) {
        const L = polyLengths(pu.pts);
        const f1 = clamp(pu.t / 0.4), f0 = clamp(f1 - 0.3);
        if (f1 > f0) {
          const seg = [];
          for (let i = 0; i <= 5; i++) seg.push(pointAtFrac(pu.pts, f0 + (f1 - f0) * (i / 5), L));
          glowLine(g, seg, 6, DEF.flameColor, 0.7 * (1 - clamp((pu.t - 0.4) / 0.15)));
        }
      }
      drawDotString(g);
      drawGap(g);
      drawWire(g);
      drawHinoko(g);

      g.restore();

      // ---- screen-space overlays
      drawFragment(g);

      if (flow >= 0 && flow < 1.2) {
        // the moment the current crosses the joint floods the screen a little
        const k = 1 - clamp(flow / 1.2);
        const j = w2s((A.x + B.x) / 2, (A.y + B.y) / 2);
        radialFlood(g, j.x, j.y, Math.max(w, h) * (0.3 + 0.7 * (1 - k)), DEF.glowColor, 0.30 * k);
      }
      vignette(g, w, h, flow >= 0 ? 0.42 : 0.55, '#01040a');

      g.restore();
    }

    // ------------------------------------------------------------ pointer
    let lastFinger = null;

    const scene = {
      id: DEF.id,
      layout,
      enter,
      exit,
      update,
      draw,

      onPointerDown(p) {
        fingerDown = true;
        lastFinger = { x: p.x, y: p.y };
        idleT = 0;
        rec.down(p);
      },
      onPointerMove(p) {
        lastFinger = { x: p.x, y: p.y };
        if (flow < 0 && fingerDown) {
          // the wire bows toward a finger that wanders off the ideal path
          const fw = s2w(p.x, p.y);
          const tip = pointAtFrac(path, renderProg, pathLen);
          const dx = clamp(fw.x - tip.x, -90, 90);
          const dy = clamp(fw.y - tip.y, -90, 90);
          bow.x = lerp(bow.x, dx, 0.35);
          bow.y = lerp(bow.y, dy, 0.35);
        }
        rec.move(p);
        if (flow < 0 && fingerDown && renderProg > 0.2) {
          const eb = w2s(B.x, B.y);
          if (Math.hypot(p.x - eb.x, p.y - eb.y) < S * 0.14) connect();
        }
      },
      onPointerUp(p) {
        fingerDown = false;
        rec.up(p);
        bow.x = 0; bow.y = 0;
        if (traceSfx && flow < 0) { traceSfx.stop(); traceSfx = null; }
        lastFinger = null;
      },

      /** __game.complete() — skip straight to the climax */
      complete() { connect(); },

      debugState() {
        return {
          phase,
          elementId: DEF.id,
          progress: renderProg,
          traceProgress: prog,
          tracePath: screenPath.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })),
          lit: litCount(),
          darkLeft: DARK.filter((d) => !manualOn.has(d.o)).map((d) => d.id),
          leaveAt,
          litTotal,
          spoken,
          connected: flow >= 0,
          t
        };
      },

      hitPoints() {
        if (phase === 'leaving') return [];
        const out = [];
        // The joint is only touchable until the circuit closes. It stays published through
        // 'change' (the current is still racing and a replayed gesture must find it) and is
        // dropped the moment the town is alive — after that only the dark windows and the
        // train can actually be touched (round-2 新-6).
        if (phase !== 'complete') {
          const a = w2s(A.x, A.y), b = w2s(B.x, B.y);
          out.push({ id: 'trace:start', x: a.x, y: a.y, r: S * 0.12 });
          out.push({ id: 'trace:end', x: b.x, y: b.y, r: S * 0.12 });
        }
        if (flow >= 0) {
          for (const d of DARK) {
            if (manualOn.has(d.o)) continue;
            const sp = w2s(d.x, d.y);
            out.push({ id: d.id, x: sp.x, y: sp.y, r: S * 0.16 });
          }
          if (trainAlive()) {
            const tp = trainPos();
            const sp = w2s(tp.x, tp.y);
            out.push({ id: 'train', x: sp.x, y: sp.y, r: S * 0.14 });
          }
        }
        return out;
      }
    };

    return scene;
  }
};
