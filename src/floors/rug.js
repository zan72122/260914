import { Floor } from './floor.js';
import { TAU } from '../core/math.js';

/**
 * Living-room corner floor: mid-tone boards (so bright paper reads against
 * them) plus a rug lying across the NEAR edge of the view, fringe and all.
 * The rug is only the near ground — the scraps live on the bare boards beyond
 * it, which is where the hidden crayon doodle is.
 *
 * opts:
 *   plankW      board width
 *   horizontal  boards run across instead of away
 *   rug         {y0, y1}  world band covered by the rug (y1 = far side... no:
 *               y0 is the FAR edge of the rug, y1 the bottom of the rect)
 *   rugColor / rugBorder
 */
export function makeRugFloor(rect, rng, opts = {}) {
  const f = new Floor(rect);
  const g = f.bctx;
  const W = f.w, H = f.h;
  const plankW = opts.plankW || 96;
  const horizontal = !!opts.horizontal;

  g.fillStyle = '#9d7a55';
  g.fillRect(0, 0, W, H);

  const tones = ['#9d7a55', '#a5825c', '#957250', '#ab8a63', '#8f6c4b'];
  const along = horizontal ? W : H;
  const across = horizontal ? H : W;
  const nPlanks = Math.ceil(across / plankW) + 1;

  for (let i = 0; i < nPlanks; i++) {
    const a0 = i * plankW;
    let p = 0;
    while (p < along) {
      const segLen = rng.range(220, 520);
      const tone = tones[rng.int(0, tones.length - 1)];
      g.save();
      if (horizontal) g.translate(p, a0); else g.translate(a0, p);
      const sw = horizontal ? segLen : plankW;
      const sh = horizontal ? plankW : segLen;
      g.fillStyle = tone;
      g.fillRect(0, 0, sw, sh);
      g.strokeStyle = 'rgba(78,52,28,0.15)';
      g.lineWidth = 1;
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        const off = ((k + 0.5) / 6) * plankW + rng.range(-3, 3);
        if (horizontal) {
          g.moveTo(0, off);
          for (let x = 0; x < segLen; x += 28) g.lineTo(x, off + Math.sin((x + i * 31) * 0.025) * 2.0);
        } else {
          g.moveTo(off, 0);
          for (let y = 0; y < segLen; y += 28) g.lineTo(off + Math.sin((y + i * 31) * 0.025) * 2.0, y);
        }
        g.stroke();
      }
      g.fillStyle = 'rgba(62,40,18,0.26)';
      if (horizontal) g.fillRect(0, sh - 2.5, sw, 2.5); else g.fillRect(sw - 2.5, 0, 2.5, sh);
      g.restore();
      p += segLen;
    }
  }

  if (opts.rug) paintRug(f, opts.rug, rng, opts);
  return f;
}

/** A soft wool rug lying across the bottom of the view, fringe facing us. */
export function paintRug(floor, rug, rng, opts = {}) {
  const g = floor.bctx;
  const x0 = -floor.rect.x0 + rug.x0;
  const x1 = -floor.rect.x0 + rug.x1;
  const yTop = -floor.rect.y0 + rug.y0;          // far edge of the rug
  const yBot = -floor.rect.y0 + rug.y1;
  const body = opts.rugColor || '#4f7f8c';
  const border = opts.rugBorder || '#e8d9b8';

  g.save();
  // cast shadow where the rug lifts off the boards
  const sg = g.createLinearGradient(0, yTop - 16, 0, yTop + 8);
  sg.addColorStop(0, 'rgba(40,26,12,0)');
  sg.addColorStop(1, 'rgba(40,26,12,0.30)');
  g.fillStyle = sg;
  g.fillRect(x0 - 40, yTop - 16, x1 - x0 + 80, 24);

  // fringe: little tassels on the far edge so the rug reads as woven cloth
  g.strokeStyle = '#ddcba4';
  g.lineWidth = 2.6;
  g.lineCap = 'round';
  for (let x = x0; x < x1; x += 9) {
    const L = 11 + rng.range(-3, 4);
    g.beginPath();
    g.moveTo(x, yTop + 2);
    g.lineTo(x + rng.range(-2.5, 2.5), yTop - L);
    g.stroke();
  }

  g.fillStyle = body;
  g.fillRect(x0, yTop, x1 - x0, yBot - yTop);
  g.fillStyle = border;
  g.fillRect(x0, yTop, x1 - x0, 13);
  g.fillStyle = 'rgba(255,255,255,0.10)';
  g.fillRect(x0, yTop + 13, x1 - x0, 6);
  // woven texture + a simple repeated motif so it is obviously a rug
  g.strokeStyle = 'rgba(255,255,255,0.07)';
  g.lineWidth = 1.5;
  for (let y = yTop + 22; y < yBot; y += 7) {
    g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
  }
  g.strokeStyle = 'rgba(232,217,184,0.55)';
  g.lineWidth = 4;
  for (let x = x0 + 46; x < x1 - 20; x += 116) {
    g.beginPath();
    g.moveTo(x, yTop + 40);
    g.lineTo(x + 26, yTop + 66);
    g.lineTo(x, yTop + 92);
    g.lineTo(x - 26, yTop + 66);
    g.closePath();
    g.stroke();
  }
  g.restore();
}

/* ------------------------------------------------------------------ doodle */

const CRAYON = ['#e0653f', '#f0b429', '#4f9d5d', '#3f7fc4', '#d2508f', '#8a5fc0'];

/** Wobbly crayon stroke: two passes, jittered, so it looks waxy not vector. */
function crayon(g, pts, color, width, rng) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    g.strokeStyle = color;
    g.globalAlpha = pass === 0 ? 0.32 : 0.78;
    g.lineWidth = pass === 0 ? width * 1.9 : width;
    g.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const j = pass === 0 ? 1.7 : 0.9;
      const x = pts[i][0] + rng.range(-j, j);
      const y = pts[i][1] + rng.range(-j, j);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
}

function ring(cx, cy, r, n, wob, rng) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const rr = r * (1 + rng.range(-wob, wob));
    p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.94]);
  }
  return p;
}

/**
 * A four-year-old's crayon drawing, hidden on the boards under the paper:
 * a big smiling sun, a flower, a little cat and some stars. Painted onto the
 * floor BASE; `paintFloorHaze` then covers it until the scraps are gone.
 */
export function paintDoodle(floor, cx, cy, r, rng, xstretch = 1) {
  const g = floor.bctx;
  const x = cx - floor.rect.x0, y = cy - floor.rect.y0;
  g.save();
  g.translate(x, y);
  if (xstretch !== 1) g.scale(xstretch, 1);

  // sun, upper left of the doodle
  const sx = -r * 0.42, sy = -r * 0.30, sr = r * 0.26;
  crayon(g, ring(sx, sy, sr, 22, 0.05, rng), CRAYON[1], 5.5, rng);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.2;
    crayon(g, [
      [sx + Math.cos(a) * sr * 1.22, sy + Math.sin(a) * sr * 1.16],
      [sx + Math.cos(a) * sr * 1.78, sy + Math.sin(a) * sr * 1.68],
    ], CRAYON[1], 5, rng);
  }
  crayon(g, [[sx - sr * 0.34, sy - sr * 0.18], [sx - sr * 0.34, sy - sr * 0.02]], CRAYON[0], 4.5, rng);
  crayon(g, [[sx + sr * 0.34, sy - sr * 0.18], [sx + sr * 0.34, sy - sr * 0.02]], CRAYON[0], 4.5, rng);
  crayon(g, [
    [sx - sr * 0.38, sy + sr * 0.26], [sx - sr * 0.12, sy + sr * 0.48],
    [sx + sr * 0.12, sy + sr * 0.48], [sx + sr * 0.38, sy + sr * 0.26],
  ], CRAYON[0], 4.5, rng);

  // flower, right
  const fx = r * 0.46, fy = -r * 0.10, fr = r * 0.13;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    crayon(g, ring(fx + Math.cos(a) * fr * 1.25, fy + Math.sin(a) * fr * 1.25, fr * 0.72, 14, 0.09, rng), CRAYON[4], 4.2, rng);
  }
  crayon(g, ring(fx, fy, fr * 0.56, 14, 0.07, rng), CRAYON[1], 4.5, rng);
  crayon(g, [[fx, fy + fr * 1.9], [fx - fr * 0.25, fy + fr * 3.2], [fx + fr * 0.1, fy + fr * 4.4]], CRAYON[2], 5, rng);
  crayon(g, [[fx - fr * 0.1, fy + fr * 3.1], [fx - fr * 1.5, fy + fr * 2.7], [fx - fr * 0.9, fy + fr * 3.8]], CRAYON[2], 4.4, rng);

  // cat, bottom left
  const kx = -r * 0.30, ky = r * 0.40, kr = r * 0.17;
  crayon(g, ring(kx, ky, kr, 18, 0.06, rng), CRAYON[5], 5, rng);
  crayon(g, [[kx - kr * 0.85, ky - kr * 0.55], [kx - kr * 1.05, ky - kr * 1.45], [kx - kr * 0.2, ky - kr * 0.95]], CRAYON[5], 4.6, rng);
  crayon(g, [[kx + kr * 0.85, ky - kr * 0.55], [kx + kr * 1.05, ky - kr * 1.45], [kx + kr * 0.2, ky - kr * 0.95]], CRAYON[5], 4.6, rng);
  crayon(g, [[kx - kr * 0.34, ky - kr * 0.1], [kx - kr * 0.34, ky + kr * 0.06]], CRAYON[5], 4, rng);
  crayon(g, [[kx + kr * 0.34, ky - kr * 0.1], [kx + kr * 0.34, ky + kr * 0.06]], CRAYON[5], 4, rng);
  crayon(g, [[kx - kr * 0.3, ky + kr * 0.4], [kx, ky + kr * 0.56], [kx + kr * 0.3, ky + kr * 0.4]], CRAYON[5], 4, rng);
  crayon(g, [[kx - kr * 1.5, ky + kr * 0.1], [kx - kr * 0.55, ky + kr * 0.22]], CRAYON[5], 3.4, rng);
  crayon(g, [[kx + kr * 0.55, ky + kr * 0.22], [kx + kr * 1.5, ky + kr * 0.1]], CRAYON[5], 3.4, rng);

  // stars scattered between
  for (let i = 0; i < 5; i++) {
    const a = rng.range(0, TAU);
    const rr = r * rng.range(0.45, 0.82);
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr * 0.72;
    const ss = r * rng.range(0.035, 0.06);
    const col = CRAYON[rng.int(0, CRAYON.length - 1)];
    for (let k = 0; k < 3; k++) {
      const aa = (k / 3) * Math.PI + 0.3;
      crayon(g, [[px - Math.cos(aa) * ss, py - Math.sin(aa) * ss], [px + Math.cos(aa) * ss, py + Math.sin(aa) * ss]], col, 3.6, rng);
    }
  }
  g.restore();
}

/**
 * The dusty film that hides the doodle. Same trick as the kitchen spill: it
 * lives on the erasable grime layer, and each captured scrap wipes a hole.
 */
export function paintFloorHaze(floor, cx, cy, r, rng, xstretch = 1) {
  const g = floor.gctx || floor.enableGrime();
  const x = cx - floor.rect.x0, y = cy - floor.rect.y0;
  g.save();
  g.translate(x, y);
  if (xstretch !== 1) g.scale(xstretch, 1);
  const grad = g.createRadialGradient(0, 0, r * 0.12, 0, 0, r);
  grad.addColorStop(0, 'rgba(188,166,138,1)');
  grad.addColorStop(0.52, 'rgba(185,163,135,0.995)');
  grad.addColorStop(0.76, 'rgba(181,159,131,0.90)');
  grad.addColorStop(0.90, 'rgba(177,156,128,0.45)');
  grad.addColorStop(1, 'rgba(174,153,125,0.0)');
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(0, 0, r, r * 0.92, 0, 0, TAU);
  g.fill();
  // grain, so it reads as floor rather than fog
  for (let i = 0; i < 560; i++) {
    const a = rng.range(0, TAU);
    const rr = Math.pow(rng.next(), 0.55) * r * 0.94;
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr * 0.9;
    g.fillStyle = rng.next() < 0.5 ? 'rgba(150,130,104,0.5)' : 'rgba(224,210,186,0.55)';
    g.beginPath(); g.arc(px, py, rng.range(0.7, 2.2), 0, TAU); g.fill();
  }
  g.restore();
}
