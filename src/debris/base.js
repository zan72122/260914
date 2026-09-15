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
const AIM = { x: 0, y: 0 };

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
  /**
   * Move the whole piece, including any private node arrays. The default moves
   * the centre and the home position; anything built out of nodes (a rope, a
   * strand, a patch of glitter) overrides this. `Scene.clearStartZone()` and
   * relayout use it, so nothing has to know a debris type's internals.
   */
  translate(dx, dy) {
    this.x += dx; this.y += dy;
    if (typeof this.hx === 'number') { this.hx += dx; this.hy += dy; }
  }
  /**
   * Where the harness (and clearStartZone) should aim: the point of the body
   * that actually has to meet the mouth. Defaults to the centre; a strand
   * overrides it with its tip, a trail with its nearest live grain.
   */
  aim(out) { out = out || { x: 0, y: 0 }; out.x = this.x; out.y = this.y; return out; }
  get alive() { return this.state !== State.DONE; }
  /** Does this object still count against scene completion? */
  get pending() { return this.state !== State.DONE; }

  /** @param {number} dt @param {import('../vacuum/vacuum.js').Vacuum} vac @param {object} world */
  update(dt, vac, world) { this.t += dt; }
  draw(ctx, cam) {}

  /**
   * Hand ourselves to the tube. Subclasses supply the look of the travelling
   * item. Returns the transit record, so a scene can keep animating the ride
   * (the playroom makes hard beads BOUNCE down the tube instead of gliding).
   */
  _handOff(vac, item, dur) {
    this.state = State.TRANSIT;
    const it = vac.transit(item, dur);
    this.state = State.DONE;
    return it;
  }

  snapshot() {
    const a = this.aim(AIM);
    return {
      id: this.id, type: this.type, state: this.state,
      x: Math.round(this.x), y: Math.round(this.y),
      ax: Math.round(a.x), ay: Math.round(a.y),
      s: +this.strength.toFixed(3),
      decor: !!this.decor, dormant: !!this.dormant,
    };
  }
}
