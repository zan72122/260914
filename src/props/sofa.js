import { TAU, clamp } from '../core/math.js';
import { Prop } from './prop.js';
import { makeCanvas } from '../floors/floor.js';

/**
 * Drawing for the sofa scene: the sofa itself (which fades to a see-through
 * frame once the nozzle is underneath it), its legs, the lost toy and the
 * carpet the next scene lives on.
 *
 * A sofa is `{x0, x1, yEdge, yBack, gap}` in world units: the footprint spans
 * x0..x1 and yBack..yEdge, the viewer is at +y, and the strip
 * (yEdge-gap .. yEdge) is the dark slot you can see into from outside.
 */

function rr(ctx, x, y, w, h, r) {
  const k = Math.min(r, Math.min(w, h) * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

/** The dark slot under the front edge, plus the cavity's own gloom. */
export function drawCavityShadow(ctx, s, u) {
  const W = s.x1 - s.x0;
  const yb = s.yBack, ye = s.yEdge;
  const g = ctx.createLinearGradient(0, ye + 26, 0, yb);
  const k = 1 - 0.92 * u;
  g.addColorStop(0, 'rgba(18,14,20,0.0)');
  g.addColorStop(0.16, 'rgba(18,14,20,' + (0.55 * k).toFixed(3) + ')');
  g.addColorStop(1, 'rgba(10,8,16,' + (0.74 * k).toFixed(3) + ')');
  ctx.fillStyle = g;
  ctx.fillRect(s.x0 - 12, yb - 20, W + 24, ye - yb + 40);
}

/**
 * The dark slot along the front edge — the thing you see from the lit room.
 * Drawn AFTER the debris, so whatever sits in the slot is half-swallowed by the
 * shadow: a sliver of fluff sticking out of a black gap.
 */
export function drawSlot(ctx, s, u) {
  const a = 1 - u * 0.88;
  if (a <= 0.02) return;
  const top = s.yEdge - s.gap, bot = s.yEdge + 14;
  const g = ctx.createLinearGradient(0, top - 6, 0, bot);
  g.addColorStop(0, 'rgba(8,6,12,' + (0.78 * a).toFixed(3) + ')');
  g.addColorStop(0.45, 'rgba(10,8,16,' + (0.60 * a).toFixed(3) + ')');
  g.addColorStop(1, 'rgba(12,10,18,0)');
  ctx.fillStyle = g;
  ctx.fillRect(s.x0, top - 8, s.x1 - s.x0, bot - top + 8);
}

/** The skirting board / wall at the far end of the cavity. */
export function drawBackWall(ctx, s) {
  const W = s.x1 - s.x0;
  const H = 360;
  const g = ctx.createLinearGradient(0, s.yBack - H, 0, s.yBack);
  g.addColorStop(0, '#221b1c');
  g.addColorStop(0.72, '#4a3f38');
  g.addColorStop(1, '#7b6a58');
  ctx.fillStyle = g;
  ctx.fillRect(s.x0 - 150, s.yBack - H, W + 300, H);
  ctx.fillStyle = '#9c8a72';
  ctx.fillRect(s.x0 - 150, s.yBack - 26, W + 300, 26);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(s.x0 - 150, s.yBack - 26, W + 300, 5);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(s.x0 - 150, s.yBack, W + 300, 12);
}

/**
 * The sofa. `alpha` 1 = solid (you cannot see under it, only the slot);
 * 0 = you are underneath it and it is just a ghost frame overhead.
 */
/**
 * The sofa never changes shape, so it is painted once into its own canvas and
 * composited with an alpha after that: one drawImage per frame instead of two
 * dozen big fills.
 */
export function makeSofaImage(s) {
  const pad = 14;
  const w = Math.round(s.x1 - s.x0) + pad * 2;
  const h = Math.round(s.yEdge - s.gap - s.yBack) + pad * 2 + 8;
  const canvas = makeCanvas(w, h);
  const g = canvas.getContext('2d');
  g.translate(pad - s.x0, pad - (s.yBack - 8));
  paintSofa(g, s);
  return { canvas, x: s.x0 - pad, y: s.yBack - 8 - pad, w, h };
}

/** alpha 1 = solid; 0 = you are underneath and it is only a ghost frame. */
export function drawSofa(ctx, s, alpha, img) {
  const x0 = s.x0, x1 = s.x1, W = x1 - x0;
  const yb = s.yBack, ye = s.yEdge - s.gap, D = ye - yb;
  if (alpha > 0.02) {
    ctx.save();
    ctx.globalAlpha = alpha;
    if (img) ctx.drawImage(img.canvas, img.x, img.y, img.w, img.h);
    else paintSofa(ctx, s);
    ctx.restore();
  }
  drawSofaGhost(ctx, s, alpha);
}

function paintSofa(ctx, s) {
  const x0 = s.x0, x1 = s.x1, W = x1 - x0;
  const yb = s.yBack, ye = s.yEdge - s.gap, D = ye - yb;
  {
    ctx.save();
    // body
    ctx.fillStyle = '#4e6f8a';
    rr(ctx, x0, yb - 8, W, D + 8, 26); ctx.fill();
    // backrest (far end)
    ctx.fillStyle = '#41607a';
    rr(ctx, x0 + 6, yb - 6, W - 12, Math.max(34, D * 0.24), 20); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    rr(ctx, x0 + 16, yb + 2, W - 32, Math.max(14, D * 0.09), 10); ctx.fill();
    // armrests
    const aw = Math.min(W * 0.16, 70);
    ctx.fillStyle = '#587c99';
    rr(ctx, x0, yb + D * 0.16, aw, D * 0.86, 20); ctx.fill();
    rr(ctx, x1 - aw, yb + D * 0.16, aw, D * 0.86, 20); ctx.fill();
    // seat cushions
    const ix0 = x0 + aw + 8, ix1 = x1 - aw - 8;
    const iy0 = yb + D * 0.26, iy1 = ye - 10;
    const iw = ix1 - ix0, ih = iy1 - iy0;
    const cols = clamp(Math.round(iw / 150), 1, 4);
    const rows = clamp(Math.round(ih / 190), 1, 4);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cw = iw / cols, ch = ih / rows;
        ctx.fillStyle = (r + c) % 2 ? '#6b90ad' : '#63879f';
        rr(ctx, ix0 + c * cw + 5, iy0 + r * ch + 5, cw - 10, ch - 10, 18); ctx.fill();
        ctx.strokeStyle = 'rgba(30,45,60,0.30)'; ctx.lineWidth = 2.5;
        rr(ctx, ix0 + c * cw + 5, iy0 + r * ch + 5, cw - 10, ch - 10, 18); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.13)';
        rr(ctx, ix0 + c * cw + 16, iy0 + r * ch + 14, cw - 32, ch * 0.28, 12); ctx.fill();
      }
    }
    // front edge roll, right above the slot
    ctx.fillStyle = '#3c5a73';
    rr(ctx, x0 + 4, ye - 26, W - 8, 30, 14); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    rr(ctx, x0 + 14, ye - 24, W - 28, 9, 5); ctx.fill();
    ctx.restore();
  }
}

/** The outline overhead, so you always know you are under something. */
function drawSofaGhost(ctx, s, alpha) {
  const x0 = s.x0, x1 = s.x1, W = x1 - x0;
  const yb = s.yBack, ye = s.yEdge - s.gap, D = ye - yb;
  if (alpha < 0.85) {
    ctx.save();
    ctx.globalAlpha = (1 - alpha) * 0.42;
    ctx.strokeStyle = 'rgba(150,180,210,0.6)';
    ctx.lineWidth = 3;
    rr(ctx, x0, yb - 8, W, D + 8, 26); ctx.stroke();
    // the front edge stays readable: it is the line you crossed to get in here
    ctx.strokeStyle = 'rgba(120,150,185,0.75)';
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(x0 + 8, ye - 4); ctx.lineTo(x1 - 8, ye - 4); ctx.stroke();
    ctx.restore();
  }
}

/** A sofa leg: solid, the head slides around it. */
export function makeLeg(x, y, r) {
  return new Prop({
    x, y, shape: 'circle', r, pushable: false, shadow: false,
    data: { leg: true },
    draw(ctx) {
      ctx.save();
      ctx.fillStyle = 'rgba(10,8,14,0.45)';
      ctx.beginPath(); ctx.ellipse(this.x + 5, this.y + r * 0.7, r * 1.5, r * 0.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6b4a2c';
      ctx.beginPath();
      ctx.moveTo(this.x - r * 0.85, this.y - r * 2.6);
      ctx.lineTo(this.x + r * 0.85, this.y - r * 2.6);
      ctx.lineTo(this.x + r * 0.7, this.y + r * 0.5);
      ctx.lineTo(this.x - r * 0.7, this.y + r * 0.5);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8a6440';
      ctx.fillRect(this.x - r * 0.85, this.y - r * 2.6, r * 0.55, r * 3.1);
      ctx.fillStyle = '#4a3220';
      ctx.beginPath(); ctx.ellipse(this.x, this.y + r * 0.5, r * 0.75, r * 0.32, 0, 0, TAU); ctx.fill();
      ctx.restore();
    },
  });
}

/** The lost toy: solid, cannot be sucked. It rocks in the flow and is pushed. */
export function makeToy(x, y, rng) {
  return new Prop({
    x, y, shape: 'circle', r: 21, pushable: true, mass: 1.5, friction: 7,
    shadow: false, data: { toy: true, wob: 0, seed: rng ? rng.range(0, 100) : 0 },
    draw(ctx) {
      const d = this.data;
      const tilt = Math.sin(d.wob * 9 + d.seed) * d.wob * 0.28 + this.nudge * 0.22;
      ctx.save();
      ctx.fillStyle = 'rgba(10,8,14,0.4)';
      ctx.beginPath(); ctx.ellipse(this.x + 4, this.y + 15, 20, 7, 0, 0, TAU); ctx.fill();
      ctx.translate(this.x, this.y + 6);
      ctx.rotate(tilt);
      ctx.translate(0, -6);
      // little rubber duck: unmistakable, and it plainly is not dust
      ctx.fillStyle = '#f2c23c';
      ctx.beginPath(); ctx.ellipse(0, 6, 20, 13, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-9, -9, 11, 11, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e8892c';
      ctx.beginPath();
      ctx.moveTo(-13, -12); ctx.quadraticCurveTo(-28, -9, -26, -4);
      ctx.quadraticCurveTo(-19, -3, -13, -6);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f2c23c';
      ctx.fillStyle = '#d9a12a';
      ctx.beginPath(); ctx.ellipse(2, 9, 11, 6, 0.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2b2118';
      ctx.beginPath(); ctx.arc(-12, -11, 2.6, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.beginPath(); ctx.ellipse(-13, -14, 4, 3, -0.5, 0, TAU); ctx.fill();
      ctx.restore();
    },
  });
}

/**
 * The corner of the next room's carpet: a thick pile the camera pans to when
 * the cavity is clean. `rect` = {x0,y0,x1,y1}; `edge` is which side faces the
 * camera ('bottom' | 'left').
 */
export function makeCarpet(rect, edge) {
  const w = Math.max(1, Math.round(rect.x1 - rect.x0) + 24);
  const h = Math.max(1, Math.round(rect.y1 - rect.y0) + 24);
  const canvas = makeCanvas(w, h);
  const g = canvas.getContext('2d');
  g.translate(12 - rect.x0, 12 - rect.y0);
  drawCarpet(g, rect, edge);
  return { canvas, x: rect.x0 - 12, y: rect.y0 - 12 };
}

export function drawCarpetImage(ctx, c) {
  if (c) ctx.drawImage(c.canvas, c.x, c.y);
}

function drawCarpet(ctx, rect, edge) {
  const { x0, y0, x1, y1 } = rect;
  ctx.save();
  ctx.fillStyle = 'rgba(20,12,8,0.22)';
  ctx.fillRect(x0 + 6, y0 + 8, x1 - x0, y1 - y0);
  ctx.fillStyle = '#b2554d';
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  // pile: short strokes, dense, so it reads as deep fibre and not as paint
  ctx.lineCap = 'round';
  for (let i = 0; i < 520; i++) {
    const t = (i * 1234.567) % 1;
    const s2 = (i * 98.765) % 1;
    const x = x0 + t * (x1 - x0);
    const y = y0 + s2 * (y1 - y0);
    const a = 6 + ((i * 37) % 5);
    ctx.strokeStyle = i % 3 === 0 ? 'rgba(212,120,102,0.55)' : 'rgba(126,52,46,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + ((i % 7) - 3) * 0.6, y - a); ctx.stroke();
  }
  // the near edge, with the pile standing proud of the floor
  const ey = edge === 'bottom' ? y1 : null;
  ctx.strokeStyle = '#8e3f3a'; ctx.lineWidth = 6;
  if (ey !== null) {
    ctx.beginPath(); ctx.moveTo(x0, ey); ctx.lineTo(x1, ey); ctx.stroke();
    ctx.strokeStyle = 'rgba(226,150,130,0.8)'; ctx.lineWidth = 2;
    for (let x = x0; x < x1; x += 7) {
      ctx.beginPath(); ctx.moveTo(x, ey + 2); ctx.lineTo(x + ((x | 0) % 3) - 1, ey + 11); ctx.stroke();
    }
  } else {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.stroke();
    ctx.strokeStyle = 'rgba(226,150,130,0.8)'; ctx.lineWidth = 2;
    for (let y = y0; y < y1; y += 7) {
      ctx.beginPath(); ctx.moveTo(x0 - 2, y); ctx.lineTo(x0 - 11, y + ((y | 0) % 3) - 1); ctx.stroke();
    }
  }
  ctx.restore();
}
