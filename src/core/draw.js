/**
 * draw.js — shared 2D drawing helpers (DESIGN §5.5.9).
 *
 * RULES (hard):
 *   - NEVER call fillText / strokeText. This file contains no text drawing at all.
 *   - NEVER set ctx.filter (slow on iOS). Glow = multi-pass + globalCompositeOperation 'lighter'.
 *   - Gradients are cached (see cachedRadial / cachedLinear); call clearGradientCache() on layout.
 *
 * Every helper takes the 2D context as first argument `g`.
 */

// ---------------------------------------------------------------- colour utils

const _parseCache = Object.create(null);

/** '#rgb' | '#rrggbb' | 'rgb(...)' | 'rgba(...)' -> {r,g,b,a} */
export function parseColor(c) {
  if (typeof c !== 'string') return { r: 255, g: 255, b: 255, a: 1 };
  const hit = _parseCache[c];
  if (hit) return hit;
  let out = { r: 255, g: 255, b: 255, a: 1 };
  const s = c.trim();
  if (s[0] === '#') {
    if (s.length === 4 || s.length === 5) {
      out = {
        r: parseInt(s[1] + s[1], 16), g: parseInt(s[2] + s[2], 16), b: parseInt(s[3] + s[3], 16),
        a: s.length === 5 ? parseInt(s[4] + s[4], 16) / 255 : 1
      };
    } else if (s.length === 7 || s.length === 9) {
      out = {
        r: parseInt(s.slice(1, 3), 16), g: parseInt(s.slice(3, 5), 16), b: parseInt(s.slice(5, 7), 16),
        a: s.length === 9 ? parseInt(s.slice(7, 9), 16) / 255 : 1
      };
    }
  } else if (s.startsWith('rgb')) {
    const m = s.match(/-?[\d.]+/g);
    if (m && m.length >= 3) out = { r: +m[0], g: +m[1], b: +m[2], a: m.length > 3 ? +m[3] : 1 };
  }
  _parseCache[c] = out;
  return out;
}

/** colour with a new alpha -> 'rgba(...)' */
export function withAlpha(color, a) {
  const c = parseColor(color);
  return `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${Math.max(0, Math.min(1, a * c.a))})`;
}

/** linear blend of two css colours */
export function lerpColor(c1, c2, t) {
  const a = parseColor(c1), b = parseColor(c2);
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(a.r + (b.r - a.r) * k)},${Math.round(a.g + (b.g - a.g) * k)},${Math.round(a.b + (b.b - a.b) * k)})`;
}

/** multiply brightness (k>1 brightens, clamped) */
export function shade(color, k, alpha = 1) {
  const c = parseColor(color);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return alpha >= 1 ? `rgb(${f(c.r)},${f(c.g)},${f(c.b)})` : `rgba(${f(c.r)},${f(c.g)},${f(c.b)},${alpha})`;
}

// ---------------------------------------------------------------- gradient cache

const _gradCache = new Map();
export function clearGradientCache() { _gradCache.clear(); }

/**
 * Cached UNIT radial gradient (radius 1) centred at the origin.
 * Draw with: g.translate(x,y); g.scale(r,r); fill a circle of radius 1.
 * Because the gradient never depends on the radius, ONE gradient per colour is created for
 * the whole session even when the glow pulses every frame (DESIGN §5.5.9 perf rule).
 * @param {CanvasRenderingContext2D} g
 * @param {string} key stable cache key (usually the colour)
 * @param {Array<[number,string]>} stops
 */
export function cachedUnitRadial(g, key, stops) {
  let grad = _gradCache.get(key);
  if (!grad) {
    grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (const [p, c] of stops) grad.addColorStop(Math.max(0, Math.min(1, p)), c);
    _gradCache.set(key, grad);
    if (_gradCache.size > 240) { const first = _gradCache.keys().next().value; _gradCache.delete(first); }
  }
  return grad;
}

/** Back-compat wrapper: same unit gradient, `r` is ignored (scale the context instead). */
export function cachedRadial(g, key, r, stops) {
  return cachedUnitRadial(g, key, stops);
}

/**
 * Cached vertical linear gradient from (0,y0) to (0,y1).
 */
export function cachedLinear(g, key, x0, y0, x1, y1, stops) {
  const k = key + '|' + Math.round(x0) + ',' + Math.round(y0) + ',' + Math.round(x1) + ',' + Math.round(y1);
  let grad = _gradCache.get(k);
  if (!grad) {
    grad = g.createLinearGradient(x0, y0, x1, y1);
    for (const [p, c] of stops) grad.addColorStop(Math.max(0, Math.min(1, p)), c);
    _gradCache.set(k, grad);
    if (_gradCache.size > 220) { const first = _gradCache.keys().next().value; _gradCache.delete(first); }
  }
  return grad;
}

// ---------------------------------------------------------------- shapes

/** rounded-rect PATH (call beginPath yourself if you need a fresh path) */
export function roundRect(g, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(Math.abs(w), Math.abs(h)) / 2));
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y);
  g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr);
  g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr);
  g.quadraticCurveTo(x, y, x + rr, y);
  g.closePath();
}

export function fillRoundRect(g, x, y, w, h, r, fill) {
  g.beginPath(); roundRect(g, x, y, w, h, r);
  if (fill) g.fillStyle = fill;
  g.fill();
}

/** star PATH */
export function star(g, x, y, rOuter, rInner, points = 5, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = rot + (i * Math.PI) / points;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
}

/** regular polygon PATH */
export function polygon(g, x, y, r, sides = 6, rot = 0) {
  g.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i * Math.PI * 2) / sides;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
}

/** smooth curve PATH through points (Catmull-Rom-ish via quadratics) */
export function smoothPath(g, pts, close = false) {
  if (!pts || pts.length < 2) return;
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    g.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const last = pts[pts.length - 1];
  g.lineTo(last.x, last.y);
  if (close) g.closePath();
}

// ---------------------------------------------------------------- glows

/**
 * Soft additive glow blob.
 * @param {number} intensity 0..~2
 */
export function glowCircle(g, x, y, r, color, intensity = 1) {
  if (r <= 0 || intensity <= 0) return;
  const c = parseColor(color);
  const rgb = `${c.r | 0},${c.g | 0},${c.b | 0}`;
  const grad = cachedUnitRadial(g, 'glow' + rgb, [
    [0, `rgba(${rgb},0.95)`],
    [0.28, `rgba(${rgb},0.5)`],
    [0.62, `rgba(${rgb},0.16)`],
    [1, `rgba(${rgb},0)`]
  ]);
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = Math.min(1, intensity);
  g.translate(x, y);
  g.scale(r, r);
  g.fillStyle = grad;
  g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill();
  g.restore();
}

/** Opaque soft-edged disc (non-additive) — good for bodies/cores. */
export function softDisc(g, x, y, r, inner, outer) {
  const grad = cachedUnitRadial(g, 'disc' + inner + outer, [[0, inner], [0.6, inner], [1, outer]]);
  g.save(); g.translate(x, y); g.scale(r, r); g.fillStyle = grad;
  g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill(); g.restore();
}

/** Screen-filling radial colour flood (used by the flame reveal / handoff). */
export function radialFlood(g, cx, cy, r, color, alpha = 1) {
  if (alpha <= 0 || r <= 0) return;
  const c = parseColor(color);
  const rgb = `${c.r | 0},${c.g | 0},${c.b | 0}`;
  const grad = cachedUnitRadial(g, 'flood' + rgb, [
    [0, `rgba(${rgb},1)`],
    [0.35, `rgba(${rgb},0.72)`],
    [0.7, `rgba(${rgb},0.28)`],
    [1, `rgba(${rgb},0)`]
  ]);
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = Math.min(1, alpha);
  g.translate(cx, cy);
  g.scale(r, r);
  g.fillStyle = grad;
  g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill();
  g.restore();
}

/** Glowing polyline: wide dim pass + narrow bright pass. */
export function glowLine(g, pts, width, color, intensity = 1) {
  if (!pts || pts.length < 2) return;
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.globalCompositeOperation = 'lighter';
  const passes = [[3.2, 0.14], [1.9, 0.26], [1, 0.9]];
  for (const [wk, ak] of passes) {
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.lineWidth = width * wk;
    g.strokeStyle = withAlpha(color, ak * intensity);
    g.stroke();
  }
  g.restore();
}

/** A trail of shrinking sparks along pts (newest first). */
export function sparkTrail(g, pts, width, color, alpha = 1) {
  if (!pts || !pts.length) return;
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < pts.length; i++) {
    const k = 1 - i / pts.length;
    g.globalAlpha = alpha * k * k;
    g.fillStyle = color;
    g.beginPath();
    g.arc(pts[i].x, pts[i].y, Math.max(0.4, width * k), 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** Tint the whole screen with a colour using 'screen' compositing. */
export function applyAmbient(g, w, h, color, alpha) {
  if (alpha <= 0) return;
  g.save();
  g.globalCompositeOperation = 'screen';
  g.globalAlpha = Math.min(1, alpha);
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  g.restore();
}

/** Darken/vignette the screen edges (keeps focus in the middle). */
export function vignette(g, w, h, strength = 0.5, color = '#000000') {
  const r = Math.max(w, h) * 0.78;
  const c = parseColor(color);
  const rgb = `${c.r | 0},${c.g | 0},${c.b | 0}`;
  const key = 'vignette' + rgb + Math.round(strength * 100) + '|' + Math.round(w) + 'x' + Math.round(h);
  let gr = _gradCache.get(key + '|' + Math.round(r));
  if (!gr) {
    gr = g.createRadialGradient(w / 2, h / 2, r * 0.42, w / 2, h / 2, r);
    gr.addColorStop(0, `rgba(${rgb},0)`);
    gr.addColorStop(1, `rgba(${rgb},${strength})`);
    _gradCache.set(key + '|' + Math.round(r), gr);
  }
  g.save(); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.restore();
}

/** Teardrop / flame silhouette PATH centred on (x, baseY), pointing up. */
export function flameShape(g, x, baseY, halfWidth, height, wobble = 0, t = 0) {
  const w = halfWidth, hgt = height;
  const tipX = x + Math.sin(t * 1.7) * wobble;
  g.beginPath();
  g.moveTo(x - w, baseY);
  g.bezierCurveTo(
    x - w * 1.08, baseY - hgt * 0.42,
    tipX - w * 0.62 + Math.sin(t * 2.3) * wobble * 0.6, baseY - hgt * 0.74,
    tipX, baseY - hgt
  );
  g.bezierCurveTo(
    tipX + w * 0.62 + Math.cos(t * 2.1) * wobble * 0.6, baseY - hgt * 0.74,
    x + w * 1.08, baseY - hgt * 0.42,
    x + w, baseY
  );
  g.quadraticCurveTo(x, baseY + hgt * 0.14, x - w, baseY);
  g.closePath();
}

/** Ellipse PATH (rotation-aware); avoids relying on ctx.ellipse quirks. */
export function ellipse(g, x, y, rx, ry, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2);
}

/** Distance helper */
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
