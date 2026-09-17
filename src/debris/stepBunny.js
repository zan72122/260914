import { DustBunny } from './dustBunny.js';
import { State } from './base.js';
import { clamp, TAU } from '../core/math.js';

const G = 1250;
const FRIC = 2.4;

/**
 * The bunny on the top landing.
 *
 * It is a real `DustBunny` — the same fibres, the same straining, shedding and
 * popping — with one extra life stage bolted on the front of it: while it is
 * still up on the landing and the mouth is a long way below, the first breath of
 * airflow that reaches it is enough to roll it off the edge, and from then on
 * the STAIRS do the work. It bounces from tread to tread, puffing at every
 * landing, accelerating, and it arrives at the mouth travelling.
 *
 * If it overshoots the mouth it simply carries on down to the next tread and
 * settles there, and once it has stopped it is an ordinary dust bunny again:
 * strain, shed, pop. Nothing can ever roll off the bottom of the flight.
 */
export class StepBunny extends DustBunny {
  constructor(x, y, r, rng, stair) {
    super(x, y, r, rng);
    this.stair = stair;
    this.rolling = false;
    this.bounces = 0;
    this.rollT = 0;
    this.trigger = 0.12;      // the faintest draught is enough to start it
    this.core = '#b3a99b';
    this.rim = '#8a7f70';
  }
  get type() { return 'stepbunny'; }

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    if (!this.rolling) {
      super.update(dt, vac, world);
      if (this.state !== State.DONE && this.state !== State.CAPTURED
        && this.state !== State.TRANSIT && !this.entry
        && this.strength > this.trigger && this.stair.stepAt(this.y) > 0) this._roll(vac);
      return;
    }

    this.t += dt;
    this.rollT += dt;
    const st = this.stair;
    const f = vac.field(this.x, this.y, this._f);
    this.strength = f.strength;
    if (f.strength > 0.001) {
      const l = Math.hypot(f.fx, f.fy) || 1;
      const k = 1 - Math.exp(-10 * dt);
      this.aimX += (f.fx / l - this.aimX) * k;
      this.aimY += (f.fy / l - this.aimY) * k;
    }

    const gnd = st.groundY(this.x, this.y);
    const on = this.y >= gnd - 0.6;
    this.vx += (f.fx * 620 + st.downX * (on ? 120 : 190)) * dt;
    this.vy += (f.fy * 620 + (on ? 190 : G)) * dt;
    if (on) { const d = Math.exp(-FRIC * dt); this.vx *= d; this.vy *= d; }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const sp = Math.hypot(this.vx, this.vy);
    this.spin += (0.9 + sp * 0.012) * dt * (this.vx >= 0 ? 1 : -1);
    this.stretch += (clamp(sp / 620, 0, 0.55) - this.stretch) * (1 - Math.exp(-8 * dt));
    this.tremble = clamp(0.5 + sp / 500, 0, 1.3);

    const g2 = st.groundY(this.x, this.y);
    if (this.y > g2) {
      const impact = this.vy;
      this.y = g2;
      if (impact > 80) {
        // every landing is a puff of its own dust: that is the beat of the fall
        this.vy = -impact * 0.44;
        this.vx *= 0.88;
        this.bounces++;
        this.squash = 0;
        this.stretch = 0;
        st.puff(this.x, this.y + 3, 7, 'fluff');
      } else this.vy = 0;
    }
    st.clampInside(this, this.r + 6);

    this._updateFibers(dt, vac, 1.35);
    this._updateWisps(dt, vac);

    if (f.inCapture) {
      this.rolling = false;
      this.state = State.CAPTURED;
      this.squash = 0;
      return;
    }
    // come to rest, and go back to being an ordinary dust bunny
    if (on && sp < 26 && this.rollT > 0.35) {
      this.rolling = false;
      this.vx = 0; this.vy = 0;
      this.hx = this.x; this.hy = this.y;
      this.state = State.REACTING;
      this.cockT = -1; this.cock = 0;
    }
  }

  _roll(vac) {
    this.rolling = true;
    this.rollT = 0;
    this.state = State.PULLED;
    this.vy = 55;
    this.vx = this.stair.downX * 70 + (this.rng.next() - 0.5) * 40;
    this.cockT = -1; this.cock = 0;
    this.stair.puff(this.x, this.y + this.r * 0.4, 5, 'fluff');
  }

  snapshot() {
    const s = super.snapshot();
    s.rolling = this.rolling;
    s.bounces = this.bounces;
    return s;
  }
}
