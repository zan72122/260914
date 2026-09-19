import { Floor } from './floor.js';
import { TAU, clamp } from '../core/math.js';

/**
 * The window room's floor.
 *
 * Boards, plus the one thing this room is about before anything moves: the
 * sunlight lying ON the floor. The shafts are BAKED into the opaque base blit
 * that has to happen anyway — three quads with a soft edge cost nothing there
 * and would cost a full-screen alpha pass a frame if they were drawn live (see
 * the performance rules in docs/ARCHITECTURE.md). The scene only draws a thin
 * additive pass over the same quads when the light brightens at the end.
 *
 *   const f = makeWindowFloor(rect, rng, { horizontal, shafts });
 *   bakeWindowWall(f.growBase(bigRect), cfg);  // wall, window, sill, skirting
 *   bakeStickerLine(g, cfg, rng);              // the hidden reveal
 */
export function makeWindowFloor(rect, rng, opts = {}) {
  /**
   * The GRIME layer is the expensive one — it is the one with alpha, and it is
   * composited every frame until it is cleared. So the floor is constructed on
   * the little band under the curtain hem (the only part of this room that has
   * anything to wipe off it) and the base is then GROWN to the whole room. The
   * boards, the sun and the set are painted into that grown base: one opaque
   * blit, and a 130x130 alpha blit instead of a full-screen one.
   */
  const f = new Floor(opts.band || rect);
  const g = f.growBase(rect);           // save()d, already in world coordinates
  const plankW = opts.plankW || 84;
  const horizontal = !!opts.horizontal;
  const W = rect.x1 - rect.x0, H = rect.y1 - rect.y0;

  g.fillStyle = '#c49a6a';
  g.fillRect(rect.x0, rect.y0, W, H);

  // paler, cooler boards than the intro's: the sun has to have something to be
  // bright AGAINST, and a warm floor everywhere leaves the shafts invisible
  const tones = ['#c39a6b', '#bb9061', '#cba679', '#b28a5c', '#c6a072'];
  const along = horizontal ? W : H;
  const across = horizontal ? H : W;
  const n = Math.ceil(across / plankW) + 1;
  for (let i = 0; i < n; i++) {
    const a0 = i * plankW;
    let p = 0;
    while (p < along) {
      const segLen = rng.range(180, 440);
      g.save();
      if (horizontal) g.translate(rect.x0 + p, rect.y0 + a0);
      else g.translate(rect.x0 + a0, rect.y0 + p);
      const sw = horizontal ? segLen : plankW;
      const sh = horizontal ? plankW : segLen;
      g.fillStyle = tones[rng.int(0, tones.length - 1)];
      g.fillRect(0, 0, sw, sh);
      g.strokeStyle = 'rgba(115,76,38,0.15)';
      g.lineWidth = 1;
      for (let k = 0; k < 6; k++) {
        const off = ((k + 0.5) / 6) * plankW + rng.range(-3, 3);
        g.beginPath();
        if (horizontal) {
          g.moveTo(0, off);
          for (let x = 0; x < segLen; x += 28) g.lineTo(x, off + Math.sin((x + i * 31) * 0.028) * 1.7);
        } else {
          g.moveTo(off, 0);
          for (let y = 0; y < segLen; y += 28) g.lineTo(off + Math.sin((y + i * 31) * 0.028) * 1.7, y);
        }
        g.stroke();
      }
      g.fillStyle = 'rgba(88,56,22,0.20)';
      if (horizontal) g.fillRect(0, sh - 2, sw, 2); else g.fillRect(sw - 2, 0, 2, sh);
      g.fillStyle = 'rgba(88,56,22,0.28)';
      if (horizontal) g.fillRect(segLen - 1.5, 0, 1.5, plankW);
      else g.fillRect(0, segLen - 1.5, plankW, 1.5);
      g.restore();
      p += segLen;
    }
  }

  // the sun on the boards
  if (opts.shafts) paintShafts(g, opts.shafts, 1);

  // a soft vignette so the lit floor reads as the bright part of the room
  const cx = (rect.x0 + rect.x1) * 0.5, cy = (rect.y0 + rect.y1) * 0.5;
  const vg = g.createRadialGradient(cx, cy, Math.min(W, H) * 0.2, cx, cy, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(255,244,214,0.06)');
  vg.addColorStop(1, 'rgba(56,32,10,0.26)');
  g.fillStyle = vg;
  g.fillRect(rect.x0, rect.y0, W, H);
  g.restore();
  f.smoothGrime = false;
  return f;
}

/**
 * The quads of sunlight, in WORLD coordinates. Called once with `k = 1` to bake
 * them into the boards, and again every frame with a small `k` when the room
 * finishes and the light comes up. Flat fills only: no gradient is built here,
 * because building one in a draw loop is a fresh raster every frame.
 */
export function paintShafts(g, shafts, k) {
  for (let i = 0; i < shafts.length; i++) {
    const s = shafts[i];
    for (let pass = 0; pass < 3; pass++) {
      const grow = pass * 7;
      g.globalAlpha = clamp(s.a * k * (pass === 0 ? 0.55 : pass === 1 ? 0.30 : 0.18), 0, 1);
      g.fillStyle = '#fff3cd';
      g.beginPath();
      g.moveTo(s.tx0 - grow, s.ty);
      g.lineTo(s.tx1 + grow, s.ty);
      g.lineTo(s.bx1 + grow * 1.6, s.by);
      g.lineTo(s.bx0 - grow * 1.6, s.by);
      g.closePath();
      g.fill();
    }
  }
  g.globalAlpha = 1;
}

/**
 * The far wall with the window in it, the sill, and the skirting board. Painted
 * into the floor's own base canvas (`floor.growBase(rect)` hands back a context
 * already in world coordinates), so the whole static set is part of the one
 * opaque blit instead of a screenful of fills per frame.
 */
export function bakeWindowWall(g, cfg) {
  const { wallY, x0, x1, win } = cfg;
  const sillGap = cfg.sillGap === undefined ? 40 : cfg.sillGap;
  const skirt = cfg.skirt === undefined ? 30 : cfg.skirt;
  const top = wallY - 900;
  // a deeper wall than the window, or the pane disappears into it: at landscape
  // size the whole window is only ~50 design px tall, and a near-white hole in a
  // near-white wall is not a light source, it is a smudge
  g.fillStyle = '#d6c7ac';
  g.fillRect(x0, top, x1 - x0, wallY - top);

  // skirting board FIRST: the sill has to sit on top of it, not under it (with
  // a short landscape wall the window comes down far enough that the skirting
  // was painted over the bottom of the glass)
  g.fillStyle = '#f2ebde';
  g.fillRect(x0, wallY - skirt, x1 - x0, skirt);
  g.fillStyle = '#b9a88e';
  g.fillRect(x0, wallY - 5, x1 - x0, 6);
  const sh = g.createLinearGradient(0, wallY, 0, wallY + 58);
  sh.addColorStop(0, 'rgba(38,26,12,0.32)');
  sh.addColorStop(1, 'rgba(38,26,12,0)');
  g.fillStyle = sh;
  g.fillRect(x0, wallY, x1 - x0, 58);

  // the window: a bright pane, glazing bars, a frame and a sill
  const wy1 = wallY - sillGap;            // the sill sits just above the skirting
  const wy0 = wy1 - win.h;
  const wh = wy1 - wy0, ww = win.x1 - win.x0;
  // the wash of light the glass throws onto the wall around itself, so the
  // window reads as the thing everything in the room is lit BY
  g.fillStyle = 'rgba(255,246,206,0.42)';
  g.fillRect(win.x0 - 26, wy0 - 22, ww + 52, wh + 52);
  g.fillStyle = 'rgba(255,246,206,0.42)';
  g.fillRect(win.x0 - 13, wy0 - 11, ww + 26, wh + 30);
  // outside: sky, a band of hedge, a strip of grass. Saturated, because this is
  // the only saturated thing above the skirting and it has to sing.
  const pane = g.createLinearGradient(0, wy0, 0, wy1);
  pane.addColorStop(0, '#9fd8f4');
  pane.addColorStop(0.5, '#dff1fb');
  pane.addColorStop(1, '#fdf7de');
  g.fillStyle = pane;
  g.fillRect(win.x0, wy0, ww, wh);
  g.fillStyle = '#8cc472';
  g.fillRect(win.x0, wy1 - wh * 0.30, ww, wh * 0.30);
  g.fillStyle = '#6faa58';
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.arc(win.x0 + ((i + 0.5) / 5) * ww, wy1 - wh * 0.30, ww * 0.10, 0, TAU);
    g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillRect(win.x0, wy0, ww, wh * 0.16);
  // glazing bars and a frame with a real edge to it
  g.strokeStyle = '#fffaee';
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo((win.x0 + win.x1) * 0.5, wy0); g.lineTo((win.x0 + win.x1) * 0.5, wy1);
  g.moveTo(win.x0, (wy0 + wy1) * 0.5); g.lineTo(win.x1, (wy0 + wy1) * 0.5);
  g.stroke();
  g.strokeStyle = '#fffaee';
  g.lineWidth = 14;
  g.strokeRect(win.x0, wy0, ww, wh);
  g.strokeStyle = 'rgba(126,102,70,0.55)';
  g.lineWidth = 3;
  g.strokeRect(win.x0 - 7, wy0 - 7, ww + 14, wh + 14);
  // sill
  g.fillStyle = '#fff7e8';
  g.fillRect(win.x0 - 18, wy1 + 2, ww + 36, 14);
  g.fillStyle = 'rgba(120,98,70,0.40)';
  g.fillRect(win.x0 - 18, wy1 + 15, ww + 36, 5);
  // the curtain rail, so the fabric is clearly hung and not floating
  g.fillStyle = '#9a7c55';
  g.fillRect(cfg.rail.x0, cfg.rail.y - 6, cfg.rail.x1 - cfg.rail.x0, 7);

}

/**
 * The thing nobody has seen since the curtain last hung still: a row of a
 * child's stickers stuck along the skirting board, and a wobbly crayon line
 * joining them up. Painted on the BASE, under the dust, so clearing the nest is
 * what uncovers it.
 */
export function bakeStickerLine(g, cfg, rng) {
  const { band } = cfg;
  // halfway down the band, so a hem hanging slightly open puts them on show
  const y = band.y0 + (band.y1 - band.y0) * 0.46;
  g.save();
  g.strokeStyle = 'rgba(224,120,150,0.75)';
  g.lineWidth = 3.4;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(band.x0, y + 10);
  for (let x = band.x0; x <= band.x1; x += 26) g.lineTo(x, y + 10 + Math.sin(x * 0.05) * 5);
  g.stroke();

  const cols = ['#f2a63c', '#e35d6a', '#59b0d8', '#7ec46a', '#c98ad8'];
  let i = 0;
  for (let x = band.x0 + 26; x < band.x1 - 24; x += 36) {
    const c = cols[i % cols.length];
    const r = 15 + (i % 3) * 3;
    const yy = y - 6 + Math.sin(i * 1.7) * 7;
    g.save();
    g.translate(x + rng.range(-5, 5), yy);
    g.rotate(rng.range(-0.4, 0.4));
    g.fillStyle = '#fffdf6';
    if (i % 3 === 0) {
      // a star
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU - Math.PI / 2;
        const rr = k % 2 ? r * 0.45 : r;
        if (k === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
    } else if (i % 3 === 1) {
      // a flower
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        g.ellipse(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.5, r * 0.5, 0, 0, TAU);
      }
    } else {
      g.beginPath(); g.ellipse(0, 0, r, r * 0.9, 0, 0, TAU);
    }
    g.fillStyle = c;
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath(); g.ellipse(-r * 0.25, -r * 0.3, r * 0.3, r * 0.22, -0.4, 0, TAU); g.fill();
    g.restore();
    i++;
  }
  g.restore();
}

/**
 * The film of dust the curtain has been keeping off the boards: a soft band
 * along the skirting, over the stickers. Soft blobs only, so the grime layer
 * does not want the bilinear filter.
 */
export function paintHemDust(floor, cfg, rng) {
  const g = floor.enableGrime();
  floor.smoothGrime = false;
  const band = cfg.band;
  const W = band.x1 - band.x0, H = band.y1 - band.y0;
  g.save();
  g.translate(-floor.rect.x0, -floor.rect.y0);
  // Positions are kept well inside the band and the alpha is faded toward its
  // edges, because the grime canvas IS the band: a blob painted at the border
  // is cut off square, and a rectangle of dust with four hard edges reads as a
  // pane of glass lying on the floor rather than as dust.
  for (let i = 0; i < 54; i++) {
    const u = rng.next(), v = rng.next();
    const x = band.x0 + (0.10 + u * 0.80) * W;
    const y = band.y0 + (0.12 + v * 0.76) * H;
    const r = rng.range(20, 46);
    const edge = Math.min(1, Math.min(u, 1 - u) * 3.2) * Math.min(1, Math.min(v, 1 - v) * 3.0);
    const a = rng.range(0.10, 0.26) * edge;
    if (a <= 0.012) continue;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(176,167,150,' + a.toFixed(3) + ')');
    grad.addColorStop(1, 'rgba(176,167,150,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  g.restore();
}
