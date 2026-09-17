import { makeWoodFloor } from './wood.js';
import { TAU } from '../core/math.js';

/**
 * The bedroom floor: the same warm boards as the rest of the house, with a soft
 * bedside mat baked into the base canvas.
 *
 * Everything here is static, so it is painted ONCE into the floor's own opaque
 * blit (see Floor.growBase) rather than rasterised every frame: the mat, its
 * fringe, and the warm pool of the bedside lamp are three big gradients that
 * would otherwise cost more than the floor itself.
 */
export function makeBedroomFloor(rect, rng, opts = {}) {
  const f = makeWoodFloor(rect, rng, {
    plankW: opts.plankW || 84, horizontal: !!opts.horizontal,
  });
  const g = f.growBase(rect);
  if (opts.mat) bakeMat(g, opts.mat, rng);
  if (opts.pool) bakePool(g, opts.pool);
  g.restore();
  return f;
}

/** A soft oval bedside mat with a short fringe — where the cushions have landed. */
function bakeMat(g, m, rng) {
  const { x, y, rx, ry } = m;
  g.save();
  g.fillStyle = 'rgba(60,40,30,0.13)';
  g.beginPath(); g.ellipse(x + 6, y + 8, rx, ry, 0, 0, TAU); g.fill();
  g.fillStyle = m.color || '#e7dbe8';
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
  // two concentric bands, so the mat reads as woven and not as a blob
  g.strokeStyle = m.band || 'rgba(196,166,196,0.55)';
  g.lineWidth = 7;
  g.beginPath(); g.ellipse(x, y, rx * 0.82, ry * 0.80, 0, 0, TAU); g.stroke();
  g.lineWidth = 3.5;
  g.beginPath(); g.ellipse(x, y, rx * 0.63, ry * 0.58, 0, 0, TAU); g.stroke();
  // fringe: short strokes around the rim
  g.strokeStyle = 'rgba(232,222,232,0.85)';
  g.lineWidth = 2.4;
  g.beginPath();
  for (let i = 0; i < 74; i++) {
    const a = (i / 74) * TAU;
    const ca = Math.cos(a), sa = Math.sin(a);
    const L = 9 + (rng ? rng.range(-2.5, 3.5) : 0);
    g.moveTo(x + ca * rx, y + sa * ry);
    g.lineTo(x + ca * (rx + L), y + sa * (ry + L * 0.7));
  }
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.16)';
  g.beginPath(); g.ellipse(x - rx * 0.22, y - ry * 0.28, rx * 0.44, ry * 0.30, -0.3, 0, TAU); g.fill();
  g.restore();
}

/** The warm pool of the bedside lamp, spilling across the boards. */
function bakePool(g, p) {
  const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
  grad.addColorStop(0, 'rgba(255,230,186,0.40)');
  grad.addColorStop(0.5, 'rgba(255,224,176,0.17)');
  grad.addColorStop(1, 'rgba(255,222,170,0)');
  g.save();
  g.fillStyle = grad;
  g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
  g.restore();
}
