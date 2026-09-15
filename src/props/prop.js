import { TAU, clamp } from '../core/math.js';

/**
 * Pushable / blocking rigid props.
 *
 * A prop is a circle or a rounded rect on the floor. The nozzle HEAD (not the
 * airflow) interacts with it:
 *   pushable: true   the head shoves it aside, it slides and grinds to a halt
 *   pushable: false  it blocks the head, which slides along its edge
 *
 * Scenes own their own `props` array and call resolveProps() from update().
 * Nothing in the core owns props, so a scene can invent its own subclass.
 */
export class Prop {
  constructor(opts = {}) {
    this.x = opts.x || 0;
    this.y = opts.y || 0;
    this.shape = opts.shape || 'circle';     // 'circle' | 'rect'
    this.r = opts.r || 24;                   // circle radius
    this.w = opts.w || 60;                   // rect size
    this.h = opts.h || 40;
    this.angle = opts.angle || 0;
    this.mass = opts.mass === undefined ? 1 : opts.mass;
    this.friction = opts.friction === undefined ? 6 : opts.friction;
    this.pushable = !!opts.pushable;
    this.color = opts.color || '#d8cbb4';
    this.shadow = opts.shadow === undefined ? true : opts.shadow;
    this.vx = 0; this.vy = 0;
    this.nudge = 0;                          // 0..1, decays: use it to squash/rock
    this.data = opts.data || null;           // scene payload
    if (opts.draw) this.draw = opts.draw;
  }

  /** Half-extent along a direction, used for the cheap overlap test. */
  get radius() { return this.shape === 'circle' ? this.r : Math.hypot(this.w, this.h) * 0.5; }

  update(dt) {
    if (this.pushable) {
      const d = Math.exp(-this.friction * dt);
      this.vx *= d; this.vy *= d;
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (Math.hypot(this.vx, this.vy) < 2) { this.vx = 0; this.vy = 0; }
    }
    this.nudge = Math.max(0, this.nudge - dt * 3);
  }

  draw(ctx) {
    ctx.save();
    if (this.shadow) {
      ctx.fillStyle = 'rgba(40,28,16,0.20)';
      ctx.beginPath();
      ctx.ellipse(this.x + 4, this.y + (this.shape === 'circle' ? this.r * 0.5 : this.h * 0.45),
        this.radius * 0.95, this.radius * 0.35, 0, 0, TAU);
      ctx.fill();
    }
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    const sq = 1 + this.nudge * 0.06;
    ctx.scale(sq, 2 - sq);
    ctx.fillStyle = this.color;
    if (this.shape === 'circle') {
      ctx.beginPath(); ctx.arc(0, 0, this.r, 0, TAU); ctx.fill();
    } else {
      ctx.beginPath();
      const r = Math.min(10, Math.min(this.w, this.h) * 0.3);
      const x = -this.w / 2, y = -this.h / 2;
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + this.w, y, x + this.w, y + this.h, r);
      ctx.arcTo(x + this.w, y + this.h, x, y + this.h, r);
      ctx.arcTo(x, y + this.h, x, y, r);
      ctx.arcTo(x, y, x + this.w, y, r);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  snapshot() {
    return { x: Math.round(this.x), y: Math.round(this.y), pushable: this.pushable };
  }
}

const N = { x: 0, y: 0, depth: 0 };

/** Closest point on this prop's footprint to (px,py); returns penetration info. */
function penetration(prop, px, py, headR, out) {
  if (prop.shape === 'circle') {
    let dx = px - prop.x, dy = py - prop.y;
    let d = Math.hypot(dx, dy);
    if (d < 1e-4) { dx = 1; dy = 0; d = 1e-4; }
    const depth = prop.r + headR - d;
    if (depth <= 0) return null;
    out.x = dx / d; out.y = dy / d; out.depth = depth;
    return out;
  }
  const ca = Math.cos(-prop.angle), sa = Math.sin(-prop.angle);
  const rx = (px - prop.x) * ca - (py - prop.y) * sa;
  const ry = (px - prop.x) * sa + (py - prop.y) * ca;
  const hx = prop.w / 2, hy = prop.h / 2;
  const cx = clamp(rx, -hx, hx), cy = clamp(ry, -hy, hy);
  let dx = rx - cx, dy = ry - cy;
  let d = Math.hypot(dx, dy);
  if (d < 1e-4) {
    // centre is inside: push out along the shallowest axis
    const ox = hx - Math.abs(rx), oy = hy - Math.abs(ry);
    if (ox < oy) { dx = Math.sign(rx) || 1; dy = 0; d = 1; out.depth = ox + headR; }
    else { dx = 0; dy = Math.sign(ry) || 1; d = 1; out.depth = oy + headR; }
  } else {
    const depth = headR - d;
    if (depth <= 0) return null;
    out.depth = depth;
  }
  const nx = dx / d, ny = dy / d;
  // back to world space
  const cb = Math.cos(prop.angle), sb = Math.sin(prop.angle);
  out.x = nx * cb - ny * sb;
  out.y = nx * sb + ny * cb;
  return out;
}

/**
 * Push props with the nozzle head, or let solid props block it.
 * Call once per step from the scene, AFTER vac.update().
 */
export function resolveProps(vac, props, dt) {
  const headR = vac.headRadius * 0.72;
  const hx = vac.nozzle.x, hy = vac.nozzle.y;
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    p.update(dt);
    const n = penetration(p, hx, hy, headR, N);
    if (!n) continue;
    if (p.pushable) {
      const k = 1 / Math.max(0.2, p.mass);
      p.x -= n.x * n.depth * k;
      p.y -= n.y * n.depth * k;
      const hv = Math.hypot(vac.nozzle.vx, vac.nozzle.vy);
      p.vx -= n.x * hv * 0.55 * k;
      p.vy -= n.y * hv * 0.55 * k;
      p.nudge = 1;
    } else {
      // the head cannot pass through: push it out and kill the inward velocity
      vac.nozzle.x += n.x * n.depth;
      vac.nozzle.y += n.y * n.depth;
      const vn = vac.nozzle.vx * n.x + vac.nozzle.vy * n.y;
      if (vn < 0) { vac.nozzle.vx -= n.x * vn; vac.nozzle.vy -= n.y * vn; }
    }
  }
}
