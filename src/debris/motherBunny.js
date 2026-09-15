import { DustBunny } from './dustBunny.js';
import { State } from './base.js';
import { clamp, TAU } from '../core/math.js';

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
    this.jam = false;
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

    // ---- jammed on the intake -------------------------------------------
    // Once the mouth reaches it, it does not simply vanish: it JAMS there,
    // plastered across the nozzle, quivering, while the flow tears fiber after
    // fiber off it. Only when its grip runs out does it fold in. This is the
    // longest, heaviest pull in the game and it happens however you approach.
    if (this.state === State.CAPTURED && this.grip > 0) this.jam = true;
    if (this.jam) {
      this.t += dt;
      const f = vac.field(this.x, this.y, this._f);
      this.strength = f.strength;
      this.grip -= dt * (0.55 + 0.35 * f.strength);
      if (this.grip <= 0) {
        this.jam = false;
        this.state = State.CAPTURED;
        this.squash = 0;
      } else {
        this.state = State.CAPTURED;          // for the dev overlay
        // plastered across the intake: the machine bogs down and shakes
        const jam = clamp(this.grip, 0, 1) * 0.85;
        if (jam > vac.clog) vac.clog = jam;
        const m = vac.mouth();
        // sit ON the face of the nozzle, not inside it: it is the biggest
        // thing on screen and it has to be seen straining
        const q = Math.sin(this.t * 27) * 3.4 + Math.sin(this.t * 41.3) * 1.8;
        const tx = m.x + m.dirX * (this.r * 0.92 + q) - m.dirY * q * 0.4;
        const ty = m.y + m.dirY * (this.r * 0.92 + q) + m.dirX * q * 0.4;
        const o = 21;
        this.vx += (-2 * o * this.vx - o * o * (this.x - tx)) * dt;
        this.vy += (-2 * o * this.vy - o * o * (this.y - ty)) * dt;
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.aimX = m.dirX; this.aimY = m.dirY;
        this.pulse += dt * TAU * 3.4;
        this.stretch += (0.85 + 0.30 * Math.sin(this.pulse) - this.stretch) * (1 - Math.exp(-13 * dt));
        this.tremble = 1.25;
        this.jamShed -= dt;
        if (this.jamShed <= 0 && this.fibers > 10) { this.jamShed = 0.085; this._shed(vac); }
        this._updateWisps(dt, vac);
        this._updateFibers(dt, vac, 1.7);
        return;
      }
    }

    // ---- the swallow ------------------------------------------------------
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
      this._updateWisps(dt, vac);
      this._updateFibers(dt, vac, 1.7);
      return;
    }

    const wasPulled = this.state === State.PULLED;
    super.update(dt, vac, world);
    if (this.state === State.PULLED) {
      // heavy: it lumbers in rather than snapping
      const d = Math.exp(-2.6 * dt);
      this.vx *= d; this.vy *= d;
      if (!wasPulled && vac.audio) vac.audio.pop('whoosh', 0.45);
      this.stretch = clamp(this.stretch + dt * 1.0, 0, 1.15);
    }
  }

  snapshot() {
    const s = super.snapshot();
    s.grip = +Math.max(0, this.grip).toFixed(2);
    return s;
  }
}
