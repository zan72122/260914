import { Debris, State } from './base.js';
import { smoothstep, TAU, noise1 } from '../core/math.js';

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };

const BURY = 10;       // sand depth that hides an item completely
const SHOW = 5.2;      // depth below which it is loose enough to be taken
const BREAK = 0.55;    // a solid little object needs much more air than a grain
const ACC = 1050;
const FRICTION = 2.6;
const ROLLDOWN = 34;   // how hard the slope of the bowl pulls a rolling thing in
const CREEP = 1.6;     // how fast a still-buried thing slides with the sand
const SLIP = 2.0;      // slope under an exposed thing that starts it toppling in

/**
 * Something solid buried in the sand: a marble, a shell, a coin-sized button.
 *
 * It is invisible while the sand covers it, surfaces as the pile drains, then
 * rocks in its socket as the flow builds, cocks away once, and rattles across
 * the floor into the mouth. The rattle is the point: it is the one thing in the
 * pile that makes a noise going in.
 */
export class BuriedItem extends Debris {
  constructor(x, y, rng, kind) {
    super(x, y);
    this.rng = rng;
    this.kind2 = kind || 'marble';
    this.r = this.kind2 === 'button' ? 12 : this.kind2 === 'shell' ? 14 : 13;
    this.rot = rng.range(0, TAU);
    this.spin = 0;
    this.seed = rng.range(0, 80);
    this.pile = null;        // set by the scene
    this.cover = BURY;
    this.emerge = 0;         // 0 buried .. 1 completely uncovered
    this.rock = 0;
    this.rolling = false;
    this.cock = 0;
    this.charge = 0;
    this.lx = 0; this.ly = 0;   // smoothed direction of the pull
    this.dx = 0; this.dy = 0;   // downhill, into the bowl
    this.slip = 0;
    this.clack = 0;
    this._clackT = 0;
    this.hue = this.kind2 === 'marble'
      ? rng.pick(['#4aa3d8', '#54b98f', '#c05fae'])
      : this.kind2 === 'shell' ? '#f3e2d2' : rng.pick(['#e7554e', '#f0b23c']);
  }
  get type() { return this.kind2; }

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    this.t += dt;
    this.cover = this.pile ? this.pile.heightAt(this.x, this.y) : 0;
    const e = 1 - smoothstep(SHOW, BURY, this.cover);
    this.emerge = e;
    const f = vac.field(this.x, this.y, TMPF);
    const s = f.strength;
    this.strength = s;
    // which way the air is dragging it: the lean has to point at the nozzle,
    // so the strain reads as suction and not as a random wobble
    if (s > 1e-4) {
      const k = 1 - Math.exp(-10 * dt);
      this.lx += (f.fx / s - this.lx) * k;
      this.ly += (f.fy / s - this.ly) * k;
    }

    if (e < 0.9) {
      // Still held in the sand — but the sand around it is sliding, so it
      // creeps downhill with it. That is what walks a buried thing toward the
      // crater, i.e. toward the side of the pile the nozzle is working, so it
      // surfaces where the head can reach it instead of out on a flank.
      if (this.pile && s > 0.08) {
        // The sand under it is not just slumping, it is being carried AT the
        // mouth, so it settles toward the nozzle as well as downhill. That is
        // what makes a buried thing surface on the side the player is working.
        const hf = this.pile.hf, c = 10;
        const gx = hf.get(this.x - c, this.y) - hf.get(this.x + c, this.y);
        const gy = hf.get(this.x, this.y - c) - hf.get(this.x, this.y + c);
        const k = CREEP * s * dt;
        this.x += (gx * 0.45 + this.lx * 26) * k;
        this.y += (gy * 0.45 + this.ly * 26) * k;
      }
      this.rock += (smoothstep(0.08, 0.7, s) * e - this.rock) * (1 - Math.exp(-11 * dt));
      this.state = s > 0.08 && e > 0.05 ? State.REACTING : State.IDLE;
      return;
    }

    if (!this.rolling) {
      if (this.cock > 0) {
        this.cock -= dt;
        if (this.cock <= 0) {
          this.rolling = true;
          this.state = State.PULLED;
          // it does not fly in: it is knocked out of its hollow sideways and
          // rolls, curving into the mouth, clacking on the bare floor
          const side = this.rng.next() < 0.5 ? 1 : -1;
          this.vx = f.fx * 46 - f.fy * 95 * side + this.dx * 70;
          this.vy = f.fy * 46 + f.fx * 95 * side + this.dy * 70;
          this.spin = (this.rng.next() - 0.5) * 9;
          this.clack = 1;
          if (world && world.audio) world.audio.pop('tick', 0.8);
        }
        return;
      }
      // rocking harder and harder in the hollow it was buried in. A solid thing
      // does not go on the first gust: the flow has to work at it for a moment.
      this.rock += (smoothstep(0.08, BREAK, s) - this.rock) * (1 - Math.exp(-9 * dt));
      this.state = s > 0.06 ? State.REACTING : State.IDLE;
      if (s > BREAK) this.charge += (s - BREAK) * dt;
      else this.charge = Math.max(0, this.charge - dt * 0.45);
      // It is also standing on the lip of the hole the nozzle just dug out from
      // under it. Behind the head the cone gives almost no pull, so without
      // this an exposed thing would sit on the rim for ever.
      this.slip = 0;
      if (this.pile) {
        const hf = this.pile.hf, c = 9;
        const gx = hf.get(this.x - c, this.y) - hf.get(this.x + c, this.y);
        const gy = hf.get(this.x, this.y - c) - hf.get(this.x, this.y + c);
        const m = Math.hypot(gx, gy);
        if (m > SLIP) {
          this.slip = m;
          this.dx = gx / m; this.dy = gy / m;
          this.charge += (m - SLIP) * 0.16 * dt;
          this.rock = Math.max(this.rock, smoothstep(SLIP, SLIP + 5, m) * 0.8);
        }
      }
      // once it is out of the sand it is just a loose thing on a hard floor:
      // even the weak air behind the head walks it slowly toward the nozzle
      if (s > 0.04) { this.x += this.lx * s * 150 * dt; this.y += this.ly * s * 150 * dt; }
      if (this.charge > 0.11) { this.cock = 0.09; this.state = State.REACTING; }
    } else {
      this.vx += f.fx * ACC * dt;
      this.vy += f.fy * ACC * dt;
      // A round thing on a slope rolls DOWNHILL, and the bowl the nozzle has
      // dug is downhill. That is what carries it in from beside the head,
      // where the cone gives almost no pull of its own.
      if (this.pile) {
        const hf = this.pile.hf, c = 9;
        const gx = hf.get(this.x - c, this.y) - hf.get(this.x + c, this.y);
        const gy = hf.get(this.x, this.y - c) - hf.get(this.x, this.y + c);
        this.vx += gx * ROLLDOWN * dt;
        this.vy += gy * ROLLDOWN * dt;
      }
      const d = Math.exp(-FRICTION * dt);
      this.vx *= d; this.vy *= d;
      const px = this.x, py = this.y;
      this.x += this.vx * dt; this.y += this.vy * dt;
      const sp = Math.hypot(this.vx, this.vy);
      this.spin += (sp * 0.028 * (this.kind2 === 'marble' ? 1 : 0.6) - this.spin) * (1 - Math.exp(-5 * dt));
      this.rot += this.spin * dt;
      this.clack = Math.max(0, this.clack - dt * 3.4);
      // it is a hard thing on a hard floor: it keeps clacking as it rolls
      this._clackT -= dt;
      if (sp > 90 && this._clackT <= 0) {
        this._clackT = 0.16 + this.rng.next() * 0.1;
        this.clack = Math.max(this.clack, 0.55);
        if (world && world.audio) world.audio.pop('tick', 0.42);
      }
      if (this.pile && sp > 40) {
        // it ploughs a little furrow through whatever sand is left
        this.pile.hf.add(this.x, this.y, -Math.min(0.9, sp * 0.004));
      }
      if (sp < 7 && s < 0.18) { this.rolling = false; this.vx = 0; this.vy = 0; this.charge = 0; }
    }

    // The real head has a slot across its whole width, so anything rolling on
    // the floor goes in as soon as it is under the head — not only when it
    // happens to cross the little ellipse in front of the mouth.
    let taken = f.inCapture;
    if (!taken && this.rolling) {
      const dx = this.x - vac.nozzle.x, dy = this.y - vac.nozzle.y;
      const rr = vac.headRadius + this.r * 0.6;
      taken = dx * dx + dy * dy < rr * rr;
    }
    if (taken) {
      this.clack = 1;
      this._handOff(vac, { kind: this.kind2, color: this.hue, size: this.r * 2.4 });
      world && world.onCaptured && world.onCaptured(this);
    }
  }

  draw(ctx, cam) {
    if (this.state === State.DONE) return;
    const e = this.emerge;
    if (e <= 0.02) return;
    const r = this.r;
    const rk = this.rock * (this.rolling ? 0 : 1);
    // It strains TOWARD the mouth — a big lean along the pull, plus a fast
    // tremble across it — and cocks back the other way just before it goes.
    const wob = noise1(this.t * (6 + rk * 11) + this.seed) * rk;
    const lean = rk * 7 * (0.55 + 0.45 * Math.sin(this.t * 13)) - (this.cock > 0 ? 7 : 0);
    const ang = this.rot + (this.lx * rk) * 0.5 + wob * 0.35;
    const x = this.x + this.lx * lean - this.ly * wob * 2.2;
    const y = this.y + this.ly * lean + this.lx * wob * 2.2;

    ctx.save();
    // shadow only once it is really out of the sand
    if (e > 0.6) {
      ctx.fillStyle = 'rgba(44,34,18,' + (0.26 * e).toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(x + 1.6, y + r * 0.62, r * 1.02, r * 0.5, 0, 0, TAU);
      ctx.fill();
    }
    // only the part that is above the sand line is visible
    if (e < 0.9) {
      ctx.beginPath();
      ctx.rect(x - r * 1.6, y - r * 1.6, r * 3.2, r * 1.6 + r * 1.6 * e);
      ctx.clip();
    }
    ctx.translate(x, y);
    ctx.rotate(ang);
    if (this.kind2 === 'marble') this._marble(ctx, r);
    else if (this.kind2 === 'shell') this._shell(ctx, r);
    else this._button(ctx, r);
    ctx.restore();

    // a rim of sand around the part still buried: it is sitting IN something
    if (e > 0.04 && e < 0.98) {
      ctx.save();
      ctx.strokeStyle = 'rgba(226,203,152,0.85)';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.ellipse(x, y + r * (0.6 - e * 0.6), r * 1.15, r * 0.4, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    // the clack: a hard white flash when it hits the floor
    if (this.clack > 0.02) {
      ctx.save();
      ctx.globalAlpha = this.clack * 0.55;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r * (1.3 + (1 - this.clack) * 1.5), 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  _marble(ctx, r) {
    ctx.fillStyle = '#eef6fb';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.fillStyle = this.hue;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.78, r * 0.34, 0.5, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0.2 * r, -0.1 * r, r * 0.34, r * 0.72, -0.6, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,70,95,0.45)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, r - 0.6, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath(); ctx.ellipse(-r * 0.34, -r * 0.36, r * 0.27, r * 0.19, -0.6, 0, TAU); ctx.fill();
  }

  _shell(ctx, r) {
    ctx.fillStyle = this.hue;
    ctx.beginPath();
    ctx.moveTo(0, r * 0.75);
    ctx.arc(0, r * 0.75, r * 1.25, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,140,110,0.75)'; ctx.lineWidth = 1.3;
    for (let i = 1; i < 5; i++) {
      const a = Math.PI + (i / 5) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(0, r * 0.75);
      ctx.lineTo(Math.cos(a) * r * 1.2, r * 0.75 + Math.sin(a) * r * 1.2);
      ctx.stroke();
    }
    ctx.strokeStyle = '#d8b39a'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, r * 0.75, r * 1.25, Math.PI, 0); ctx.stroke();
  }

  _button(ctx, r) {
    ctx.fillStyle = this.hue;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(70,30,20,0.4)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.74, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(60,24,16,0.62)';
    for (let i = 0; i < 4; i++) {
      const a = i * (TAU / 4) + 0.78;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.34, Math.sin(a) * r * 0.34, r * 0.15, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.4, r * 0.3, r * 0.16, -0.6, 0, TAU); ctx.fill();
  }

  snapshot() {
    const s = super.snapshot();
    s.cover = +this.cover.toFixed(2);
    s.emerge = +this.emerge.toFixed(3);
    s.rock = +this.rock.toFixed(3);
    s.rolling = this.rolling;
    s.charge = +this.charge.toFixed(3);
    s.slip = +this.slip.toFixed(2);
    return s;
  }
}
