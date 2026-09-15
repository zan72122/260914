import { Prop } from './prop.js';
import { TAU, clamp, smoothstep, noise1 } from '../core/math.js';

const F = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };
const P = { x: 0, y: 0 };

/**
 * Big toys. The vacuum cannot swallow them — but the AIR still finds them.
 *
 * Every toy carries one loose, light part (a paper flag, ear fur and a ribbon,
 * a paper price tag) that samples vacuum.field() at its own position and
 * flutters, leans and lifts as the nozzle comes near, while the toy itself does
 * not move a millimetre from suction alone. Only the HEAD bumping it moves it,
 * through Prop/resolveProps, and each one slides differently.
 */
export class ToyProp extends Prop {
  constructor(opts = {}) {
    super(opts);
    this.rng = opts.rng || null;
    this.seed = this.rng ? this.rng.range(0, 100) : 0;
    this.air = 0;          // smoothed airflow at the loose part, 0..~1.6
    this.airRaw = 0;
    this.aimX = 0; this.aimY = -1;
    this.flut = this.seed;
    this.wob = 0; this.wobV = 0;
    this._pn = 0;
  }

  /** Where the loose part hangs, in world coords. Subclasses override. */
  loosePoint(out) { out.x = this.x; out.y = this.y; return out; }

  /** Called by the scene once per step, BEFORE resolveProps(). */
  sense(dt, vac) {
    const p = this.loosePoint(P);
    const f = vac.field(p.x, p.y, F);
    this.airRaw = f.strength;
    this.air += (clamp(f.strength * 0.95, 0, 1.5) - this.air) * (1 - Math.exp(-9 * dt));
    if (f.strength > 0.0004) {
      const l = Math.hypot(f.fx, f.fy) || 1;
      const k = 1 - Math.exp(-7 * dt);
      this.aimX += (f.fx / l - this.aimX) * k;
      this.aimY += (f.fy / l - this.aimY) * k;
    }
    // flutter runs faster the harder the air blows: the part is never still
    this.flut += dt * (2.4 + this.air * 17);
    // being bumped rings a little wobble through the toy
    if (this.nudge > this._pn) this.wobV += (this.nudge - this._pn) * 46;
    this._pn = this.nudge;
    const o = 11;
    this.wobV += (-2 * o * this.wobV - o * o * this.wob) * dt;
    this.wob += this.wobV * dt;
  }

  snapshot() {
    const s = super.snapshot();
    s.kind = this.kind;
    s.air = +this.air.toFixed(3);
    return s;
  }
}

// --------------------------------------------------------------- toy car

/**
 * Wheels: it only moves along its own axis, and it rolls a long way once it is
 * going. Its loose part is a little paper pennant on a wire at the back.
 */
export class ToyCar extends ToyProp {
  constructor(opts = {}) {
    super(Object.assign({
      shape: 'rect', w: 112, h: 58, mass: 0.80, friction: 2.0, pushable: true,
      shadow: false, color: '#e8483f',
    }, opts));
    this.roll = 0;
    this.wheelR = 13;
    this.body = opts.body || '#e8483f';
    this.trim = opts.trim || '#ffd24a';
  }
  get kind() { return 'car'; }

  loosePoint(out) {
    const ca = Math.cos(this.angle), sa = Math.sin(this.angle);
    // tip of the pennant, off the back of the car
    const lx = -this.w * 0.40, ly = -this.h * 0.52 - 34;
    out.x = this.x + lx * ca - ly * sa;
    out.y = this.y + lx * sa + ly * ca;
    return out;
  }

  update(dt) {
    // wheels: sideways shove does not turn into sideways motion
    const ca = Math.cos(this.angle), sa = Math.sin(this.angle);
    const along = this.vx * ca + this.vy * sa;
    this.vx = ca * along; this.vy = sa * along;
    this.roll += (along * dt) / this.wheelR;
    super.update(dt);
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(45,35,25,0.26)';
    ctx.beginPath();
    ctx.ellipse(this.x + 5, this.y + this.h * 0.42, this.w * 0.48, this.h * 0.32, this.angle, 0, TAU);
    ctx.fill();

    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + this.wob * 0.05);
    const hw = this.w / 2, hh = this.h / 2;

    // wheels, seen from above/behind: dark tyres with a hub that turns
    for (let i = 0; i < 4; i++) {
      const wx = (i < 2 ? -1 : 1) * hw * 0.58;
      const wy = (i % 2 ? 1 : -1) * (hh + 3);
      ctx.save();
      ctx.translate(wx, wy);
      ctx.fillStyle = '#2b2b31';
      rrect(ctx, -16, -8, 32, 16, 7); ctx.fill();
      ctx.fillStyle = '#e9e9ec';
      ctx.beginPath(); ctx.arc(0, 0, 5.4, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#8b8b93'; ctx.lineWidth = 2;
      for (let k = 0; k < 3; k++) {
        const a = this.roll + k * (TAU / 3);
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 5.2, Math.sin(a) * 5.2); ctx.stroke();
      }
      ctx.restore();
    }

    // body
    ctx.fillStyle = this.body;
    rrect(ctx, -hw, -hh, this.w, this.h, 16); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    rrect(ctx, -hw + 7, -hh + 6, this.w - 14, 12, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(110,30,25,0.55)'; ctx.lineWidth = 2.5;
    rrect(ctx, -hw, -hh, this.w, this.h, 16); ctx.stroke();
    // cabin
    ctx.fillStyle = '#bfe4f4';
    rrect(ctx, -hw * 0.30, -hh * 0.62, this.w * 0.42, this.h * 1.24, 11); ctx.fill();
    ctx.strokeStyle = 'rgba(80,120,140,0.6)'; ctx.lineWidth = 2;
    rrect(ctx, -hw * 0.30, -hh * 0.62, this.w * 0.42, this.h * 1.24, 11); ctx.stroke();
    // headlights forward, a yellow stripe along the flank
    ctx.fillStyle = this.trim;
    rrect(ctx, -hw + 6, -3.5, this.w - 12, 7, 3.5); ctx.fill();
    ctx.fillStyle = '#fff6cf';
    ctx.beginPath(); ctx.ellipse(hw - 7, -hh * 0.55, 6, 5, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hw - 7, hh * 0.55, 6, 5, 0, 0, TAU); ctx.fill();

    this._drawPennant(ctx, -hw * 0.80, -hh * 0.52);
    ctx.restore();
  }

  /** A paper pennant on a wire: the air grabs THIS, the car never moves. */
  _drawPennant(ctx, bx, by) {
    const a = this.air;
    // lean of the wire, in the toy's own frame
    const ca = Math.cos(-this.angle), sa = Math.sin(-this.angle);
    const lx = this.aimX * ca - this.aimY * sa;
    const ly = this.aimX * sa + this.aimY * ca;
    const lean = clamp(a, 0, 1.4);
    const tipX = bx + lx * 16 * lean;
    const tipY = by - 38 + ly * 16 * lean;

    ctx.save();
    ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + lx * 6 * lean, by - 21, tipX, tipY);
    ctx.stroke();

    // the flag itself: a triangle with a travelling wave along it
    const wave = Math.sin(this.flut) * (2.5 + a * 9);
    const wave2 = Math.sin(this.flut * 1.7 + 1.1) * (2 + a * 8);
    const dirx = lx || 0, diry = ly || -1;
    const fx = dirx * (24 + a * 12), fy = diry * (24 + a * 12);
    const px = -diry, py = dirx;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.quadraticCurveTo(tipX + fx * 0.5 + px * wave, tipY + fy * 0.5 + py * wave,
      tipX + fx, tipY + fy);
    ctx.quadraticCurveTo(tipX + fx * 0.55 + px * (wave2 - 9), tipY + fy * 0.55 + py * (wave2 - 9),
      tipX + px * -9, tipY + py * -9);
    ctx.closePath();
    ctx.fillStyle = '#fff4e0';
    ctx.fill();
    ctx.strokeStyle = '#e0894a'; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.restore();
  }
}

// -------------------------------------------------------------- plush bear

/**
 * Soft and light: it scoots and wobbles when bumped and settles quickly. Its
 * ear fur is a ring of single fibers that each sample the field at their own
 * tip, so the ear nearest the nozzle combs over first; the neck ribbon's two
 * tails lift and snake.
 */
export class PlushBear extends ToyProp {
  constructor(opts = {}) {
    super(Object.assign({
      shape: 'circle', r: 50, mass: 1.35, friction: 9.0, pushable: true,
      shadow: false, color: '#c98f52',
    }, opts));
    this.fur = 'rgba(214,166,112,1)';
    this.n = 9;
    this.fl = new Float32Array(this.n * 2);      // per-fiber lean x
    this.fm = new Float32Array(this.n * 2);      // per-fiber lean y
    this.ribbon = 0;
  }
  get kind() { return 'bear'; }

  /** The ribbon tails hang below the chin: that is what the air finds first. */
  loosePoint(out) {
    out.x = this.x + 2;
    out.y = this.y + this.r * 0.34;
    return out;
  }

  /** Irregular tuft lengths, so the ear reads as fur and not as whiskers. */
  _furLen(i) { return this.r * 0.52 * (0.52 + 0.48 * Math.abs(Math.sin(i * 2.3 + this.seed))); }

  _earPos(i, out) {
    const side = i === 0 ? -1 : 1;
    out.x = this.x + side * this.r * 0.62;
    out.y = this.y - this.r * 0.66;
    return out;
  }

  sense(dt, vac) {
    super.sense(dt, vac);
    // ear fur: each tuft samples the flow at its own tip
    for (let e = 0; e < 2; e++) {
      this._earPos(e, P);
      const ex = P.x, ey = P.y;
      for (let i = 0; i < this.n; i++) {
        const a = -Math.PI + (i / (this.n - 1)) * Math.PI * 1.15;
        const L = this._furLen(i);
        const tx = ex + Math.cos(a) * L, ty = ey + Math.sin(a) * L;
        const f = vac.field(tx, ty, F);
        const l = Math.hypot(f.fx, f.fy) || 1;
        const lean = clamp(f.strength * 40, 0, 23);
        const k = e * this.n + i;
        const wob = noise1(this.flut * 2.2 + k * 3.1) * f.strength * 4.5;
        const gx = (f.fx / l) * lean + wob, gy = (f.fy / l) * lean + wob;
        const s = 1 - Math.exp(-10 * dt);
        this.fl[k] += (gx - this.fl[k]) * s;
        this.fm[k] += (gy - this.fm[k]) * s;
      }
    }
    this.ribbon += (clamp(this.air, 0, 1.5) - this.ribbon) * (1 - Math.exp(-8 * dt));
  }

  draw(ctx) {
    const r = this.r;
    ctx.save();
    ctx.fillStyle = 'rgba(45,35,25,0.26)';
    ctx.beginPath();
    ctx.ellipse(this.x + 5, this.y + r * 0.62, r * 0.92, r * 0.34, 0, 0, TAU);
    ctx.fill();

    ctx.translate(this.x, this.y);
    ctx.rotate(this.wob * 0.09);
    const sq = 1 + this.nudge * 0.07 + this.wob * 0.03;
    ctx.scale(sq, 2 - sq);

    // legs and arms poking out, so it reads as a bear from above
    ctx.fillStyle = '#b87f45';
    for (let i = 0; i < 4; i++) {
      const a = [2.35, 0.79, 1.95, 1.19][i];
      const d = i < 2 ? r * 0.82 : r * 0.72;
      const px = Math.cos(a + (i < 2 ? 0 : Math.PI)) * d;
      const py = Math.sin(a + (i < 2 ? 0 : Math.PI)) * d * 0.85;
      ctx.save(); ctx.translate(px, py); ctx.rotate(a);
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.28, r * 0.19, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // ears (with fur) behind the head
    for (let e = 0; e < 2; e++) {
      const side = e === 0 ? -1 : 1;
      const ex = side * r * 0.62, ey = -r * 0.66;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(226,190,142,0.95)';
      ctx.lineWidth = 4.6;
      ctx.beginPath();
      for (let i = 0; i < this.n; i++) {
        const a = -Math.PI + (i / (this.n - 1)) * Math.PI * 1.15;
        const L = this._furLen(i);
        const bx = ex + Math.cos(a) * L * 0.55, by = ey + Math.sin(a) * L * 0.55;
        const k = e * this.n + i;
        const tx = ex + Math.cos(a) * L + this.fl[k];
        const ty = ey + Math.sin(a) * L + this.fm[k];
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo((bx + tx) * 0.5 - this.fm[k] * 0.22, (by + ty) * 0.5 + this.fl[k] * 0.22, tx, ty);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(142,96,48,0.9)';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.fillStyle = '#c08a4d';
      ctx.beginPath(); ctx.arc(ex, ey, r * 0.28, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e8b98a';
      ctx.beginPath(); ctx.arc(ex, ey, r * 0.15, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // body + head
    ctx.fillStyle = '#c99257';
    ctx.beginPath(); ctx.ellipse(0, r * 0.22, r * 0.78, r * 0.66, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e3c9a3';
    ctx.beginPath(); ctx.ellipse(0, r * 0.30, r * 0.44, r * 0.38, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#cf9a5d';
    ctx.beginPath(); ctx.arc(0, -r * 0.24, r * 0.56, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(140,96,48,0.45)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -r * 0.24, r * 0.56, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#efd7b4';
    ctx.beginPath(); ctx.ellipse(0, -r * 0.10, r * 0.28, r * 0.22, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4a3423';
    ctx.beginPath(); ctx.ellipse(0, -r * 0.14, r * 0.10, r * 0.075, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(-r * 0.22, -r * 0.36, r * 0.072, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.22, -r * 0.36, r * 0.072, 0, TAU); ctx.fill();

    this._drawRibbon(ctx, r);
    ctx.restore();
  }

  /** Ribbon round the neck: the tails lift and snake in the draught. */
  _drawRibbon(ctx, r) {
    const lx = this.aimX, ly = this.aimY;
    const a = this.ribbon;
    ctx.save();
    ctx.strokeStyle = '#e2497f'; ctx.lineWidth = r * 0.14; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.48, r * 0.16);
    ctx.quadraticCurveTo(0, r * 0.30, r * 0.48, r * 0.16);
    ctx.stroke();
    // the knot
    ctx.fillStyle = '#f2649a';
    ctx.beginPath(); ctx.ellipse(-r * 0.06, r * 0.20, r * 0.13, r * 0.10, 0, 0, TAU); ctx.fill();
    // two tails, each with its own phase, leaning where the air goes
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      const ph = this.flut + i * 1.9;
      const bx = -r * 0.06 + side * r * 0.10, by = r * 0.24;
      const L = r * 0.46 * (1 + a * 0.28);
      const swing = Math.sin(ph) * (1.8 + a * 11) * side;
      const mx = bx + side * L * 0.34 + lx * L * 0.24 * a + swing * 0.55;
      const my = by + L * 0.34 + ly * L * 0.24 * a + swing * 0.25;
      const tx = bx + side * L * 0.50 + lx * L * 0.52 * a + swing * 1.25;
      const ty = by + L * 0.66 + ly * L * 0.52 * a + swing * 0.5;
      ctx.strokeStyle = '#e2497f';
      ctx.lineWidth = r * 0.11 * (1 - 0.18 * a);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(mx, my, tx, ty);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = r * 0.035;
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------- block train

/**
 * Solid wood: heavy, high friction, barely budges — it takes a couple of good
 * shoves. Its loose part is a paper price tag on a thread, which flaps.
 */
export class BlockTrain extends ToyProp {
  constructor(opts = {}) {
    super(Object.assign({
      shape: 'rect', w: 136, h: 58, mass: 2.2, friction: 5.5, pushable: true,
      shadow: false, color: '#c9a063',
    }, opts));
    this.roll = 0;
    this.cols = ['#5fb4d8', '#f4c542', '#e2685f'];
  }
  get kind() { return 'train'; }

  loosePoint(out) {
    const ca = Math.cos(this.angle), sa = Math.sin(this.angle);
    const lx = this.w * 0.30, ly = -this.h * 0.52 - 22;
    out.x = this.x + lx * ca - ly * sa;
    out.y = this.y + lx * sa + ly * ca;
    return out;
  }

  update(dt) {
    const sp = Math.hypot(this.vx, this.vy);
    this.roll += (this.vx * Math.cos(this.angle) + this.vy * Math.sin(this.angle)) * dt / 12;
    super.update(dt);
    if (sp > 0) this.grind = sp;
  }

  draw(ctx) {
    const hw = this.w / 2, hh = this.h / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(45,35,25,0.30)';
    ctx.beginPath();
    ctx.ellipse(this.x + 5, this.y + this.h * 0.44, this.w * 0.48, this.h * 0.30, this.angle, 0, TAU);
    ctx.fill();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + this.wob * 0.02);

    // wheels
    for (let i = 0; i < 6; i++) {
      const wx = (-1 + (i >> 1)) * hw * 0.58;
      const wy = (i % 2 ? 1 : -1) * (hh + 2);
      ctx.save(); ctx.translate(wx, wy);
      ctx.fillStyle = '#7a5a34';
      ctx.beginPath(); ctx.ellipse(0, 0, 12, 7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#d9b374';
      ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#8a6636'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(this.roll) * 4, Math.sin(this.roll) * 4); ctx.stroke();
      ctx.restore();
    }

    // wooden flatbed
    ctx.fillStyle = '#c69a5d';
    rrect(ctx, -hw, -hh, this.w, this.h, 9); ctx.fill();
    ctx.strokeStyle = 'rgba(110,76,36,0.6)'; ctx.lineWidth = 2.5;
    rrect(ctx, -hw, -hh, this.w, this.h, 9); ctx.stroke();
    ctx.fillStyle = 'rgba(255,240,210,0.25)';
    rrect(ctx, -hw + 6, -hh + 5, this.w - 12, 9, 4); ctx.fill();

    // three stacked blocks with letters, seen from above
    const letters = ['A', 'B', 'C'];
    for (let i = 0; i < 3; i++) {
      const bx = -hw * 0.62 + i * hw * 0.62;
      ctx.save();
      ctx.translate(bx, -2);
      ctx.rotate((i - 1) * 0.06 + this.wob * 0.05 * (i - 1));
      ctx.fillStyle = this.cols[i];
      rrect(ctx, -19, -19, 38, 38, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.20)'; ctx.lineWidth = 2;
      rrect(ctx, -19, -19, 38, 38, 6); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(letters[i], 0, 1);
      ctx.restore();
    }

    // chimney at the front with the price tag hanging off it
    ctx.fillStyle = '#8a6031';
    ctx.beginPath(); ctx.arc(hw * 0.74, 0, 13, 0, TAU); ctx.fill();
    ctx.fillStyle = '#a97a41';
    ctx.beginPath(); ctx.arc(hw * 0.74, 0, 8, 0, TAU); ctx.fill();
    this._drawTag(ctx, hw * 0.74, -hh * 0.5);
    ctx.restore();
  }

  /** A paper tag on a thread. Paper is light: this is where the air shows. */
  _drawTag(ctx, bx, by) {
    const a = clamp(this.air, 0, 1.5);
    const ca = Math.cos(-this.angle), sa = Math.sin(-this.angle);
    const lx = this.aimX * ca - this.aimY * sa;
    const ly = this.aimX * sa + this.aimY * ca;
    const flap = Math.sin(this.flut) * (0.10 + a * 0.62);
    const lift = a * 16;
    const tx = bx + lx * lift, ty = by - 22 + ly * lift;

    ctx.save();
    ctx.strokeStyle = '#efe6d4'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + lx * lift * 0.4, by - 13, tx, ty);
    ctx.stroke();

    ctx.translate(tx, ty);
    ctx.rotate(flap + Math.atan2(ly, lx) * 0.18 * a);
    // the paper turns edge-on at the extremes of the flap: that IS the flutter
    const wsc = Math.abs(Math.cos(flap * 1.6)) * 0.72 + 0.28;
    ctx.scale(wsc, 1);
    ctx.fillStyle = '#fdf6e6';
    rrect(ctx, -13, -2, 26, 30, 3); ctx.fill();
    ctx.strokeStyle = '#c9b48c'; ctx.lineWidth = 1.8;
    rrect(ctx, -13, -2, 26, 30, 3); ctx.stroke();
    ctx.fillStyle = '#c9b48c';
    ctx.beginPath(); ctx.arc(0, 2.5, 2.1, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(180,160,120,0.9)'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-6, 11); ctx.lineTo(6, 11);
    ctx.moveTo(-6, 16); ctx.lineTo(3, 16);
    ctx.stroke();
    ctx.restore();
  }
}

export function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Is a world point still hidden under this toy's footprint? */
export function covers(prop, x, y, shrink = 1) {
  if (prop.shape === 'circle') {
    const r = prop.r * shrink;
    const dx = x - prop.x, dy = y - prop.y;
    return dx * dx + dy * dy <= r * r;
  }
  const ca = Math.cos(-prop.angle), sa = Math.sin(-prop.angle);
  const rx = (x - prop.x) * ca - (y - prop.y) * sa;
  const ry = (x - prop.x) * sa + (y - prop.y) * ca;
  return Math.abs(rx) <= prop.w * 0.5 * shrink && Math.abs(ry) <= prop.h * 0.5 * shrink;
}
