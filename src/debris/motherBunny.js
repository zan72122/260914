import { DustBunny } from './dustBunny.js';
import { State } from './base.js';
import { clamp } from '../core/math.js';

/**
 * The mother of all dust bunnies: the thing that lives at the far end of the
 * cavity. Same law as `DustBunny` (every fiber samples the flow at its own tip)
 * but tuned to be the longest, heaviest pull in the game:
 *
 *  - a much higher break-loose threshold, so a slow approach strains it for
 *    seconds while it sheds fiber after fiber into the mouth
 *  - it sheds roughly twice as fast, and each lost fiber lowers the threshold,
 *    so holding still always, visibly, wins
 *  - once free it is HEAVY: extra drag makes it lumber in, stretched, instead
 *    of snapping, and the swallow itself takes ~0.25s of squash
 */
export class MotherBunny extends DustBunny {
  constructor(x, y, r, rng) {
    super(x, y, r, rng);
    this.core = '#b3a898';
    this.rim = '#8a7d6b';
    this.light = '#d6cec2';
    this.gulped = false;
    /**
     * It does not simply vanish when the mouth reaches it: it JAMS there. While
     * `grip` lasts, the mouth holds it, it strains and sheds furiously, and only
     * then does it fold in. That is the longest pull in the game, and it happens
     * however you approach — you can never swallow it by accident.
     */
    this.grip = 1;
    this.jamShed = 0;
  }
  get type() { return 'mother'; }

  get breakThreshold() { return 0.78 + 0.55 * (this.fibers / this.n); }

  /** Sheds about twice as fast as a normal bunny: it is visibly coming apart. */
  _shed(vac) {
    super._shed(vac);
    this.shedT *= 0.45;
  }

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    if (this.state === State.CAPTURED && this.grip > 0) {
      // jammed on the mouth: hold on, strain, shed
      this.grip -= dt * (0.55 + 0.35 * this.strength);
      if (this.grip > 0) {
        this.state = State.REACTING;
        this.hx = this.x; this.hy = this.y;
        this.vx *= 0.4; this.vy *= 0.4;
        this.squash = 0;
        // jammed on the intake, it is torn apart one fiber at a time
        this.jamShed -= dt;
        if (this.jamShed <= 0 && this.fibers > 10) { this.jamShed = 0.085; this._shed(vac); }
      }
    }
    if (this.state === State.CAPTURED) {
      this.t += dt;
      this.squash += dt / 0.24;                     // a long, meaty swallow
      this.stretch = Math.min(1.7, this.stretch + dt * 7);
      if (this.squash >= 1 && !this.gulped) {
        this.gulped = true;
        this._handOff(vac, { kind: 'fluff', color: this.light, size: 30 });
        if (vac.audio) vac.audio.pop('whoosh', 0.7);
        world.onCaptured && world.onCaptured(this);
      }
      this._updateFibers(dt, vac, 1.7);
      return;
    }
    const wasPulled = this.state === State.PULLED;
    const thinning = this.fibers;
    super.update(dt, vac, world);
    if (this.state === State.PULLED) {
      // heavy: it lumbers in rather than snapping
      const d = Math.exp(-2.6 * dt);
      this.vx *= d; this.vy *= d;
      if (!wasPulled && vac.audio) vac.audio.pop('whoosh', 0.45);
      this.stretch = clamp(this.stretch + dt * 1.0, 0, 1.15);
    }
    if (thinning !== this.fibers && this.grip < 1) this.grip -= 0.02;
  }

  snapshot() {
    const s = super.snapshot();
    s.grip = +Math.max(0, this.grip).toFixed(2);
    return s;
  }
}
