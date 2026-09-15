import { Debris, State } from './base.js';
import { clamp, smoothstep, TAU, noise1 } from '../core/math.js';

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };

/**
 * A debris hidden down in the carpet pile.
 *
 * Until the brush roll has combed the pile back and forth over it, all you get
 * is a signifier: a coloured speck between the tufts, a low bump, and a couple
 * of tufts standing the wrong way. Sucking does nothing — the pile holds it.
 * Rubbing the head over the spot (vac.scrub: reversals of the HEAD's own
 * motion) parts the tufts, the bump rises and strains, and then it POPS to the
 * surface, at which point the wrapped debris takes over and behaves normally.
 *
 *   new BuriedItem(new Crumb(x, y, rng), { color:'#d19a4f', rng })
 */
export class BuriedItem extends Debris {
  constructor(inner, opts = {}) {
    super(inner.x, inner.y);
    this.inner = inner;
    this.id = this.type + '#' + this.id.split('#')[1];
    this.rng = opts.rng;
    this.color = opts.color || '#e4572e';
    this.color2 = opts.color2 || '#fff0c8';
    this.size = opts.size || 15;
    this.rate = opts.rate === undefined ? 1 : opts.rate;
    this.dig = 0;
    this.surfaced = false;
    this.popT = -1;
    this.strain = 0;
    this.seed = (opts.rng ? opts.rng.range(0, 100) : Math.random() * 100);
    // the tufts that sit over it and part as it is combed out
    this.tufts = [];
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (opts.rng ? opts.rng.range(-0.2, 0.2) : 0);
      this.tufts.push({ a, l: this.size * (0.75 + (opts.rng ? opts.rng.next() : 0.5) * 0.7), w: i * 3.1 });
    }
    this.specks = [];
    const m = 4;
    for (let i = 0; i < m; i++) {
      const a = (opts.rng ? opts.rng.range(0, TAU) : i);
      const d = (opts.rng ? opts.rng.next() : 0.5) * this.size * 0.45;
      this.specks.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * 0.7, r: 2.0 + (opts.rng ? opts.rng.next() : 0.4) * 2.2 });
    }
    this.puffs = [];
    for (let i = 0; i < 9; i++) this.puffs.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, r: 3 });
  }

  get type() { return this.inner ? 'buried-' + this.inner.type : 'buried'; }

  /** Moving a buried thing moves what is buried, tufts and all. */
  translate(dx, dy) {
    super.translate(dx, dy);
    if (this.inner && this.inner.translate) this.inner.translate(dx, dy);
    else if (this.inner) {
      this.inner.x += dx; this.inner.y += dy;
      if (typeof this.inner.hx === 'number') { this.inner.hx += dx; this.inner.hy += dy; }
    }
  }
  get pending() { return this.state !== State.DONE; }

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    this.t += dt;

    if (this.surfaced) {
      this.inner.update(dt, vac, world);
      this.x = this.inner.x; this.y = this.inner.y;
      this.strength = this.inner.strength;
      this.state = this.inner.state;
      if (this.popT >= 0) { this.popT += dt; if (this.popT > 0.5) this.popT = -1; }
      this._puffs(dt);
      return;
    }

    const f = vac.field(this.x, this.y, TMPF);
    const s = f.strength;
    this.strength = s;

    // Airflow alone barely disturbs it: the pile holds on. (The brush roll is
    // mechanical contact, so the scene drives that through applyComb().)
    const over = smoothstep(0.10, 0.55, s);
    const d = over * 0.22 * this.rate;
    if (d > 0) {
      this.dig = clamp(this.dig + d * dt, 0, 1);
    } else if (this.dig < 0.999) {
      this.dig = Math.max(0, this.dig - dt * 0.05);   // settles back very slowly
    }

    // straining: once it is half out it pushes rhythmically against the pile
    this.strain = this.dig * (0.55 + 0.45 * Math.sin(this.t * 13 + this.seed));
    this.state = this.dig > 0.03 ? State.REACTING : (s > 0.08 ? State.REACTING : State.IDLE);

    if (this.dig >= 1) this._surface(vac, world);
    this._puffs(dt);
  }

  /**
   * The brush roll has passed over this spot. `amount` is how much combing the
   * roller did here this step (the same number that lightens the pile).
   */
  applyComb(amount, vac) {
    if (this.surfaced || this.state === State.DONE) return;
    this.dig = clamp(this.dig + amount * this.rate, 0, 1);
    this.combed = 1;
    if (this.rng && this.rng.next() < amount * 6) this._puff(vac);
  }

  _surface(vac, world) {
    this.surfaced = true;
    this.popT = 0;
    const inner = this.inner;
    inner.x = this.x; inner.y = this.y;
    inner.hx = this.x; inner.hy = this.y;
    // kicked loose: a real hop out of the pile, away from the mouth for a beat
    const mx = vac.mouthX, my = vac.mouthY;
    let dx = this.x - mx, dy = this.y - my;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    if (inner.vx !== undefined) { inner.vx = dx * 120; inner.vy = dy * 120 - 40; }
    if (inner.bits) for (const b of inner.bits) { b.vx = dx * 150 + (this.rng ? this.rng.range(-90, 90) : 0); b.vy = dy * 150 + (this.rng ? this.rng.range(-90, 90) : 0); b.lift = 0.6; }
    if (inner.beads) for (const b of inner.beads) { b.vx = dx * 90; b.vy = dy * 90; b.hop = 1; b.hx = b.x; b.hy = b.y; }
    for (let i = 0; i < 7; i++) this._puff(vac, 1.6);
    if (world && world.audio) world.audio.pop('pop', 0.55);
    if (world && world.onSurfaced) world.onSurfaced(this);
  }

  _puff(vac, k = 1) {
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      if (p.life > 0) continue;
      const a = this.rng ? this.rng.range(0, TAU) : Math.random() * TAU;
      const sp = (this.rng ? this.rng.range(30, 95) : 60) * k;
      p.x = this.x + Math.cos(a) * this.size * 0.5;
      p.y = this.y + Math.sin(a) * this.size * 0.4;
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp * 0.7 - 20 * k;
      p.life = 1; p.r = 2.4 + (this.rng ? this.rng.next() : 0.5) * 3 * k;
      break;
    }
  }

  _puffs(dt) {
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      if (p.life <= 0) continue;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.9; p.vy *= 0.9;
      p.life -= dt * 1.9;
    }
  }

  draw(ctx, cam) {
    if (this.state === State.DONE) return;
    if (this.surfaced) {
      this.inner.draw(ctx, cam);
      if (this.popT >= 0) this._drawPop(ctx);
      this._drawPuffs(ctx);
      return;
    }
    const dig = this.dig;
    const rise = dig * dig;
    const S = this.size;

    // 1. the bump: the pile is pushed up from underneath
    ctx.save();
    ctx.fillStyle = 'rgba(255,246,225,' + (0.10 + rise * 0.22).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y - rise * 2, S * (0.85 + rise * 0.5), S * (0.6 + rise * 0.4), 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(46,32,16,' + (0.14 + rise * 0.14).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(this.x + 2, this.y + S * 0.42, S * (0.8 + rise * 0.4), S * 0.30, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // 2. the thing itself, still mostly under the pile
    const show = 0.34 + rise * 0.66;
    ctx.save();
    ctx.translate(this.x, this.y - rise * 5 + this.strain * 1.2);
    ctx.scale(0.55 + show * 0.55, 0.45 + show * 0.55);
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, S * 0.62, S * 0.46, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.color2;
    ctx.globalAlpha = 0.5 + show * 0.5;
    for (let i = 0; i < this.specks.length; i++) {
      const sp = this.specks[i];
      ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // 3. the tufts over it, parting as it is combed out
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < this.tufts.length; i++) {
      const tf = this.tufts[i];
      const wob = noise1(this.t * (3.4 + dig * 16) + tf.w) * (1.5 + dig * 3.4);
      const part = 0.3 + dig * 1.25;
      const a = tf.a;
      const rx = this.x + Math.cos(a) * S * 0.34;
      const ry = this.y + Math.sin(a) * S * 0.26;
      const L = tf.l * (1 - dig * 0.15);
      const tipx = rx + Math.cos(a) * L * part + wob;
      const tipy = ry + Math.sin(a) * L * part * 0.8 - L * 0.35 * (1 - dig);
      ctx.moveTo(rx, ry);
      ctx.quadraticCurveTo((rx + tipx) * 0.5 - Math.sin(a) * 3, (ry + tipy) * 0.5 + Math.cos(a) * 3, tipx, tipy);
    }
    ctx.strokeStyle = 'rgba(52,38,22,0.42)';
    ctx.lineWidth = 3.0; ctx.stroke();
    ctx.strokeStyle = 'rgba(236,226,205,' + (0.5 + dig * 0.35).toFixed(3) + ')';
    ctx.lineWidth = 1.6; ctx.stroke();
    ctx.restore();

    this._drawPuffs(ctx);
  }

  _drawPop(ctx) {
    const u = clamp(this.popT / 0.5, 0, 1);
    const r = 6 + u * 34;
    ctx.save();
    ctx.globalAlpha = (1 - u) * 0.5;
    ctx.strokeStyle = '#fff6df';
    ctx.lineWidth = 3 * (1 - u) + 0.6;
    ctx.beginPath();
    ctx.ellipse(this.inner.x, this.inner.y, r, r * 0.6, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  _drawPuffs(ctx) {
    let any = false;
    for (let i = 0; i < this.puffs.length; i++) if (this.puffs[i].life > 0) { any = true; break; }
    if (!any) return;
    ctx.save();
    ctx.fillStyle = '#efe6d2';
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      if (p.life <= 0) continue;
      ctx.globalAlpha = clamp(p.life, 0, 1) * 0.55;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.6 - p.life * 0.6), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  snapshot() {
    const s = super.snapshot();
    s.dig = +this.dig.toFixed(3);
    s.surfaced = this.surfaced;
    if (this.surfaced) s.inner = this.inner.snapshot();
    return s;
  }
}
