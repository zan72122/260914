/**
 * Debris contract.
 *
 * A debris object NEVER asks "is the nozzle within N pixels". It samples
 * vacuum.field(x, y, out) at one or more points on its own body and derives
 * every reaction from {fx, fy, strength, inCapture}. That is the only coupling
 * between the vacuum and the world, so new debris types and new scenes can be
 * added without touching the core.
 */

export const State = {
  IDLE: 'idle',         // airflow too weak to notice
  REACTING: 'reacting', // visibly reacting but still held by friction/weight
  PULLED: 'pulled',     // friction lost, travelling toward the mouth
  CAPTURED: 'captured', // inside the mouth, playing the pop
  TRANSIT: 'transit',   // handed to vacuum.transit()
  DONE: 'in-cup',
};

let _nextId = 0;

export class Debris {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.hx = x; this.hy = y;       // home (resting) position
    this.vx = 0; this.vy = 0;
    this.state = State.IDLE;
    this.strength = 0;              // last sampled field strength at the centre
    this.t = 0;
    this.id = this.type + '#' + (++_nextId);
    this._f = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };
  }
  get type() { return 'debris'; }
  get alive() { return this.state !== State.DONE; }
  /** Does this object still count against scene completion? */
  get pending() { return this.state !== State.DONE; }

  /** @param {number} dt @param {import('../vacuum/vacuum.js').Vacuum} vac @param {object} world */
  update(dt, vac, world) { this.t += dt; }
  draw(ctx, cam) {}

  /** Hand ourselves to the tube. Subclasses supply the look of the travelling item. */
  _handOff(vac, item) {
    this.state = State.TRANSIT;
    vac.transit(item);
    this.state = State.DONE;
  }

  snapshot() {
    return {
      id: this.id, type: this.type, state: this.state,
      x: Math.round(this.x), y: Math.round(this.y),
      s: +this.strength.toFixed(3),
    };
  }
}
