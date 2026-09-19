import { TAU, clamp } from '../core/math.js';

/**
 * Pushable / blocking rigid props.
 *
 * A prop is a circle or a rounded rect on the floor. The nozzle HEAD (not the
 * airflow) interacts with it:
 *   pushable: true      the head shoves it aside, it slides and grinds to a halt
 *   pushable: false     it blocks the head, which slides along its edge
 *   pushable: 'sweep'   the head rides OVER it — a rug corner, a flat toy, a
 *                       sheet of paper. Creeping up to it does nothing at all;
 *                       only a fast sweep displaces it, and by how fast. That is
 *                       the difference between something you bump into and
 *                       something you brush past.
 *
 * `oneWay: {x, y}` makes a prop solid from ONE side only: the head is pushed
 * back out along `-(x,y)` when it comes from the side the vector points away
 * from, and passes straight through from the other. A stair nosing you can come
 * down over but not climb back up through, the lip of a doorway, the open end of
 * a nook. It is a half-space test on the contact normal, so it works for both
 * shapes and costs one dot product.
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
    /** true | false | 'sweep' — see the class comment. */
    this.pushable = opts.pushable === 'sweep' ? 'sweep' : !!opts.pushable;
    /** Optional half-space: solid only from the side this vector points away from. */
    this.oneWay = opts.oneWay || null;
    /** 'sweep' only: head speed (world px/s) below which nothing happens at all. */
    this.sweepSpeed = opts.sweepSpeed === undefined ? 260 : opts.sweepSpeed;
    this.color = opts.color || '#d8cbb4';
    this.shadow = opts.shadow === undefined ? true : opts.shadow;
    this.vx = 0; this.vy = 0;
    this.nudge = 0;                          // 0..1, decays: use it to squash/rock
    this.data = opts.data || null;           // scene payload
    if (opts.draw) this.draw = opts.draw;
  }

  /** Half-extent along a direction, used for the cheap overlap test. */
  get radius() { return this.shape === 'circle' ? this.r : Math.hypot(this.w, this.h) * 0.5; }

  /** Does this prop move when it is shoved? ('sweep' does, but only when swept.) */
  get movable() { return this.pushable === true || this.pushable === 'sweep'; }

  update(dt) {
    if (this.movable) {
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
 * **Round stops let the head slide out of dead ends.**
 *
 * The rule every solid prop in this game is laid out by, and the one that is
 * easiest to get wrong. A non-pushable prop resolves the overlap along the
 * contact NORMAL and cancels only the inward part of the head's velocity, so
 * the head keeps whatever motion runs along the surface and slides. That works
 * beautifully on a circle and on the long face of a rectangle, and fails in two
 * places:
 *
 *   * an INTERNAL corner — two solid rects meeting at a right angle, or a rect
 *     whose end is flush against a wall. Both normals push the head out, the two
 *     corrections fight, and the sliding component of the velocity is cancelled
 *     twice over. The head stops dead in the notch, the finger is somewhere else
 *     entirely, and the child is holding a machine that will not move.
 *   * a rect narrower than the head, where the shallowest-axis fallback inside
 *     `penetration()` can flip the head to the other side between frames.
 *
 * So: build the stop out of CIRCLES wherever the head can actually arrive at
 * it — a table leg, a bowl, a plant pot, the end cap of a wall run — and keep
 * rectangles for surfaces the head only ever meets face-on (a skirting board, a
 * sofa front, the long edge of a stair). A run of overlapping circles makes a
 * perfectly good soft wall and has no internal corners anywhere. Where a
 * rectangle really is the shape, round its ENDS with a circle at each end, and
 * never leave a notch narrower than `vac.headRadius * 1.5` that the head can
 * reach: the head will find it, and it will stay there.
 *
 * Push props with the nozzle head, let solid props block it, and keep the props
 * out of each other. Call once per step from the scene, AFTER vac.update().
 *
 *   resolveProps(vac, this.props, dt, {
 *     separate: true,                       // props shoulder each other aside
 *     bounds: {x0, y0, x1, y1, pad},        // pushable props stay in this rect,
 *                                           // `pad` px clear of every wall
 *   });
 *
 * The overlap with the head is ALWAYS fully resolved: a light prop gets out of
 * the way, a heavy one pushes the head back instead of letting it sink in.
 */
export function resolveProps(vac, props, dt, opts) {
  const headR = vac.headRadius * 0.72;
  for (let i = 0; i < props.length; i++) props[i].update(dt);

  const hspd = Math.hypot(vac.nozzle.vx, vac.nozzle.vy);
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    const n = penetration(p, vac.nozzle.x, vac.nozzle.y, headR, N);
    if (!n) continue;
    // a one-way prop is only there at all when the head is on its solid side
    if (p.oneWay && (n.x * p.oneWay.x + n.y * p.oneWay.y) < 0.2) continue;
    if (p.pushable === 'sweep') {
      // the head rides OVER it: no collision at all, but a fast pass drags it
      // along. Below `sweepSpeed` this is a no-op, so creeping up achieves
      // nothing and the child learns the difference by doing it.
      const over = hspd - p.sweepSpeed;
      if (over > 0) {
        const k = Math.min(1, over / 600);
        p.vx += vac.nozzle.vx * 0.5 * k / Math.max(0.2, p.mass);
        p.vy += vac.nozzle.vy * 0.5 * k / Math.max(0.2, p.mass);
        p.nudge = Math.max(p.nudge, k);
      }
      continue;
    }
    if (p.pushable) {
      // split the correction by mass: 1.0 for a feather, ~0 for a boulder, and
      // the remainder is taken by the head, so nothing ever sinks into it
      const give = 1 / (1 + Math.max(0, p.mass));
      p.x -= n.x * n.depth * give;
      p.y -= n.y * n.depth * give;
      vac.nozzle.x += n.x * n.depth * (1 - give);
      vac.nozzle.y += n.y * n.depth * (1 - give);
      const hv = Math.hypot(vac.nozzle.vx, vac.nozzle.vy);
      p.vx -= n.x * hv * 0.55 * give * 2;
      p.vy -= n.y * hv * 0.55 * give * 2;
      p.nudge = 1;
      if (give < 0.95) {
        const vn = vac.nozzle.vx * n.x + vac.nozzle.vy * n.y;
        if (vn < 0) { vac.nozzle.vx -= n.x * vn * (1 - give); vac.nozzle.vy -= n.y * vn * (1 - give); }
      }
    } else {
      // the head cannot pass through: push it out and kill the inward velocity
      vac.nozzle.x += n.x * n.depth;
      vac.nozzle.y += n.y * n.depth;
      const vn = vac.nozzle.vx * n.x + vac.nozzle.vy * n.y;
      if (vn < 0) { vac.nozzle.vx -= n.x * vn; vac.nozzle.vy -= n.y * vn; }
    }
  }

  // The BODY is solid too. This is not decoration: the head points away from
  // the body, so a body that has been driven through a wall while the head was
  // held against it flips the head round to face backwards — and with it the
  // whole airflow cone. Under the sofa that turned the deepest nook, which is
  // meant to be won by holding still, into somewhere the air never reaches.
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    if (p.movable) continue;
    const n = penetration(p, vac.body.x, vac.body.y, vac.bodyRadius, N);
    if (!n) continue;
    if (p.oneWay && (n.x * p.oneWay.x + n.y * p.oneWay.y) < 0.2) continue;
    vac.body.x += n.x * n.depth;
    vac.body.y += n.y * n.depth;
    const vn = vac.body.vx * n.x + vac.body.vy * n.y;
    if (vn < 0) { vac.body.vx -= n.x * vn; vac.body.vy -= n.y * vn; }
  }

  if (opts && opts.separate) separateProps(props);
  if (opts && opts.bounds) { for (let i = 0; i < props.length; i++) keepInside(props[i], opts.bounds); }
}

/**
 * Pushable props shoulder each other aside instead of stacking up, and are
 * pushed out of solid ones. Cheap O(n^2) over a handful of props.
 */
export function separateProps(props) {
  for (let i = 0; i < props.length; i++) {
    const a = props[i];
    if (a.pushable !== true) continue;          // 'sweep' props lie flat: nothing stacks on them
    for (let j = 0; j < props.length; j++) {
      if (j === i) continue;
      const b = props[j];
      if (b.pushable === 'sweep') continue;
      if (!b.pushable) { pushOutOfSolid(a, b); continue; }
      if (j < i) continue;                      // pushable pairs only once
      const rr = (a.radius + b.radius) * 0.78;
      let dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > rr || d < 1e-4) continue;
      const nx = dx / d, ny = dy / d;
      const ma = 1 / Math.max(0.2, a.mass), mb = 1 / Math.max(0.2, b.mass);
      const tot = ma + mb;
      const push = rr - d;
      a.x -= nx * push * (ma / tot); a.y -= ny * push * (ma / tot);
      b.x += nx * push * (mb / tot); b.y += ny * push * (mb / tot);
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        a.vx += nx * rel * (ma / tot); a.vy += ny * rel * (ma / tot);
        b.vx -= nx * rel * (mb / tot); b.vy -= ny * rel * (mb / tot);
        a.nudge = Math.max(a.nudge, 0.55); b.nudge = Math.max(b.nudge, 0.55);
      }
    }
  }
}

/** Shove a pushable prop out of a solid one along the shallowest axis. */
function pushOutOfSolid(p, s) {
  if (s.oneWay) return;
  const ph = p.shape === 'circle' ? p.r : null;
  const sw = s.shape === 'circle' ? s.r : s.w * 0.5;
  const sh = s.shape === 'circle' ? s.r : s.h * 0.5;
  const hw = sw + (ph === null ? p.w * 0.42 : ph);
  const hh = sh + (ph === null ? p.h * 0.42 : ph);
  const dx = p.x - s.x, dy = p.y - s.y;
  if (Math.abs(dx) >= hw || Math.abs(dy) >= hh) return;
  const ox = hw - Math.abs(dx), oy = hh - Math.abs(dy);
  if (ox < oy) { p.x = s.x + (dx < 0 ? -hw : hw); p.vx = 0; }
  else { p.y = s.y + (dy < 0 ? -hh : hh); p.vy = 0; }
}

/**
 * Keep a pushable prop inside a world rectangle.
 *
 * The clearance from each wall is, in order of preference:
 *
 *   b.pad        PIXELS, and nothing else is consulted. This is the form to
 *                use: "stay 24px inside this rectangle" means that whatever
 *                shape the prop is.
 *   b.inset      the ORIGINAL form, and a trap: it is a multiplier on the
 *                prop's own half-extent, so the same number means a different
 *                clearance for every prop, and `inset: 24` would be twenty-four
 *                prop-widths rather than 24px. It is still honoured for the
 *                scenes written against it (`toy`, `pantry`), and a value
 *                greater than 2 — which can only ever have been meant as
 *                pixels — is read as pixels instead.
 *   neither      0.8 half-extents, as before.
 */
export function keepInside(p, b) {
  if (!p.movable) return;
  const half = p.shape === 'circle' ? p.r : Math.max(p.w, p.h) * 0.5;
  let mx;
  if (b.pad !== undefined) mx = b.pad;
  else if (b.inset === undefined) mx = half * 0.8;
  else if (b.inset > 2) mx = b.inset;                 // obviously px, not a factor
  else mx = half * b.inset;
  if (p.x < b.x0 + mx) { p.x = b.x0 + mx; p.vx = 0; }
  if (p.x > b.x1 - mx) { p.x = b.x1 - mx; p.vx = 0; }
  if (p.y < b.y0 + mx) { p.y = b.y0 + mx; p.vy = 0; }
  if (p.y > b.y1 - mx) { p.y = b.y1 - mx; p.vy = 0; }
}
