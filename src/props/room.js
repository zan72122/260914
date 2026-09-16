import { TAU } from '../core/math.js';
import { Prop } from './prop.js';

/**
 * Furniture and floor coverings that are not tied to one scene: a standing
 * lamp, a cushion off the sofa, the warm pool a lamp throws, the near edge of
 * a rug. Landscape is the WIDE pose, and a wide pose needs something between
 * the near edge of the frame and the far one.
 *
 * Everything static here is meant to be BAKED into a floor's base canvas
 * (Floor.growBase), not drawn per frame.
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

/**
 * A standing lamp at the edge of the room. It is SOLID, like the sofa's own
 * legs: in landscape the whole point of the pose is width and going round
 * things, so the near corner of the room gets something to go round.
 */
export function makeFloorLamp(x, y, r = 18) {
  return new Prop({
    x, y, shape: 'circle', r, pushable: false, shadow: false,
    data: { leg: true, lamp: true },
    draw(ctx) {
      ctx.save();
      // the pool it throws is baked into the floor; this is the thing itself
      ctx.fillStyle = 'rgba(12,8,16,0.34)';
      ctx.beginPath(); ctx.ellipse(this.x - r * 1.9, this.y + r * 0.5, r * 2.4, r * 0.9, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6a625a';
      ctx.beginPath(); ctx.ellipse(this.x, this.y, r * 1.5, r * 0.62, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8e857a';
      ctx.beginPath(); ctx.ellipse(this.x - 1, this.y - r * 0.18, r * 1.2, r * 0.44, 0, 0, TAU); ctx.fill();
      // the pole, running up out of the frame
      ctx.fillStyle = '#7d7368';
      ctx.fillRect(this.x - 4, this.y - r * 9, 8, r * 9);
      ctx.fillStyle = 'rgba(255,240,210,0.30)';
      ctx.fillRect(this.x - 4, this.y - r * 9, 3, r * 9);
      ctx.restore();
    },
  });
}

/**
 * A cushion off the sofa, lying on the floor. Heavy and soft: shoving it moves
 * it a little and squashes it, which is all it is for.
 */
export function makeCushion(x, y, w, h, angle, color) {
  return new Prop({
    x, y, shape: 'rect', w, h, angle, pushable: true, mass: 3, friction: 9,
    shadow: false, data: { room: true, col: color || '#5c809c' },
    draw(ctx) {
      const d = this.data;
      ctx.save();
      ctx.fillStyle = 'rgba(20,14,22,0.28)';
      ctx.beginPath();
      ctx.ellipse(this.x + 7, this.y + this.h * 0.42, this.w * 0.56, this.h * 0.34, this.angle, 0, TAU);
      ctx.fill();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      const sq = 1 + this.nudge * 0.10;
      ctx.scale(sq, 2 - sq);
      const w = this.w, h = this.h;
      ctx.fillStyle = d.col;
      rr(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.34); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      rr(ctx, -w / 2 + 9, -h / 2 + 8, w - 18, h * 0.30, Math.min(w, h) * 0.2); ctx.fill();
      ctx.strokeStyle = 'rgba(24,38,52,0.34)'; ctx.lineWidth = 2.5;
      rr(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.34); ctx.stroke();
      // a tuft at the middle, so it reads as soft and not as a box
      ctx.fillStyle = 'rgba(24,38,52,0.22)';
      ctx.beginPath(); ctx.ellipse(0, 0, 5, 3.4, 0, 0, TAU); ctx.fill();
      ctx.restore();
    },
  });
}

/**
 * The warm pool a standing lamp throws across the boards, and the long shadow
 * the furniture throws away from it. Baked straight into the floor's base
 * canvas: it never changes, and a scene should not be rasterising a
 * screen-sized radial gradient sixty times a second to stand still.
 *
 * `g` must already be in WORLD coordinates (see Floor.growBase).
 */
export function bakeRoomLight(g, o) {
  const { x, y, r } = o;
  const pool = g.createRadialGradient(x, y, 0, x, y, r);
  pool.addColorStop(0, 'rgba(255,229,177,0.44)');
  pool.addColorStop(0.45, 'rgba(255,222,165,0.20)');
  pool.addColorStop(1, 'rgba(255,220,160,0)');
  g.save();
  g.fillStyle = pool;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  // ...and everything between the lamp and the furniture throws a long soft
  // one the other way. Ellipses along the axis, not a wedge: a polygon has
  // straight edges and a shadow on a wooden floor does not.
  const shadows = o.shadows || [];
  for (let i = 0; i < shadows.length; i++) {
    const sh2 = shadows[i];
    const dx = sh2.x - x, dy = sh2.y - y;
    const l = Math.hypot(dx, dy) || 1;
    const ux = dx / l, uy = dy / l;
    const a = Math.atan2(uy, ux);
    const N = 9;
    for (let k = 0; k < N; k++) {
      const t = (k + 0.5) / N;
      const w = sh2.w * (1 + 1.6 * t);
      const a2 = 0.16 * (1 - t * 0.9) * Math.min(1, t * 4);
      if (a2 <= 0.004) continue;
      g.save();
      g.translate(sh2.x + ux * sh2.len * t, sh2.y + uy * sh2.len * t);
      g.rotate(a);
      g.scale(w * 1.5, w);
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      rg.addColorStop(0, 'rgba(46,30,16,' + a2.toFixed(3) + ')');
      rg.addColorStop(0.5, 'rgba(46,30,16,' + (a2 * 0.62).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(46,30,16,0)');
      g.fillStyle = rg;
      g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill();
      g.restore();
    }
    g.globalAlpha = 1;
  }
  g.restore();
}

/**
 * The near edge of a rug running off the bottom of the frame: a band, a bound
 * edge and a fringe. Baked into the floor, like everything else that never
 * moves. `dir` is +1 when the rug lies BELOW y (its edge faces the sofa) and
 * -1 when it lies above.
 */
export function bakeRugEdge(g, o) {
  const { x0, x1, y } = o;
  const depth = o.depth || 300;
  const dir = o.dir === undefined ? 1 : o.dir;
  const body = o.color || '#6c7f72';
  const light = o.light || '#8b9d8e';
  const dark = o.dark || '#4a5a4f';
  g.save();
  // the shadow the pile casts on the boards at its edge
  const sh = g.createLinearGradient(0, y - dir * 16, 0, y + dir * 10);
  sh.addColorStop(0, 'rgba(40,28,16,0)');
  sh.addColorStop(1, 'rgba(40,28,16,0.26)');
  g.fillStyle = sh;
  g.fillRect(x0, Math.min(y - 16, y + 10), x1 - x0, 26);
  g.fillStyle = body;
  g.fillRect(x0, dir > 0 ? y : y - depth, x1 - x0, depth);
  // woven texture: short strokes, so it is pile and not paint
  g.lineCap = 'round';
  g.lineWidth = 2;
  for (let i = 0; i < 420; i++) {
    const t = (i * 1234.567) % 1;
    const s2 = (i * 98.765) % 1;
    const x = x0 + t * (x1 - x0);
    const yy = (dir > 0 ? y : y - depth) + s2 * depth;
    g.strokeStyle = i % 3 === 0 ? 'rgba(174,190,176,0.30)' : 'rgba(58,74,62,0.26)';
    g.beginPath(); g.moveTo(x, yy); g.lineTo(x + ((i % 7) - 3) * 0.5, yy - 5); g.stroke();
  }
  // two woven bands parallel to the edge: they carry the eye along the width
  g.fillStyle = 'rgba(232,224,206,0.20)';
  g.fillRect(x0, y + dir * 26, x1 - x0, 9);
  g.fillStyle = 'rgba(232,224,206,0.12)';
  g.fillRect(x0, y + dir * 44, x1 - x0, 4);
  // the bound edge and its fringe
  g.fillStyle = dark;
  g.fillRect(x0, dir > 0 ? y : y - 7, x1 - x0, 7);
  g.fillStyle = light;
  g.fillRect(x0, dir > 0 ? y + 7 : y - 9, x1 - x0, 2);
  g.strokeStyle = o.fringe || 'rgba(198,206,218,0.72)';
  g.lineWidth = 1.6;
  g.beginPath();
  for (let x = x0; x < x1; x += 7) {
    g.moveTo(x, y - dir * 1);
    g.lineTo(x + ((x | 0) % 3) - 1, y - dir * 10);
  }
  g.stroke();
  // ...and the side edge too, when the rug turns a CORNER inside the frame
  // instead of running off both sides of it
  if (o.side) {
    const sx = o.side > 0 ? x1 : x0;
    const sgn = o.side > 0 ? 1 : -1;
    const y0 = dir > 0 ? y : y - depth, y1 = dir > 0 ? y + depth : y;
    g.fillStyle = dark;
    g.fillRect(sgn > 0 ? sx - 7 : sx, y0, 7, y1 - y0);
    g.fillStyle = light;
    g.fillRect(sgn > 0 ? sx - 9 : sx + 7, y0, 2, y1 - y0);
    g.beginPath();
    for (let yy = y0; yy < y1; yy += 7) {
      g.moveTo(sx + sgn * 1, yy);
      g.lineTo(sx + sgn * 10, yy + ((yy | 0) % 3) - 1);
    }
    g.stroke();
  }
  g.restore();
}
