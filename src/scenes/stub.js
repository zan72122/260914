import { Scene } from './scene.js';
import { makeWoodFloor } from '../floors/wood.js';
import { Bin } from '../props/bin.js';

/**
 * A placeholder room.
 *
 * `pantry`, `stairs`, `window`, `veranda` and `bedroom` are real doors in the
 * hall from Phase A onward, but their scenes are written in Phase B by five
 * different agents. Until then each id resolves to one of these: an empty room
 * with a bin by the door that finishes on its own after a beat and hands back
 * to the hall, so the hub, the door states and `dev/playthrough.mjs` are all
 * exercisable today.
 *
 * A Phase B agent DELETES nothing here: they write `src/scenes/<id>.js` and
 * swap the one registry line in `src/scenes/index.js` (see
 * docs/SCENE_AGENT_GUIDE.md).
 */
export class StubScene extends Scene {
  constructor(id, rng) {
    super(id, rng);
    this.t = 0;
    this.done = false;
  }

  layout(pose, w, h) {
    super.layout(pose, w, h);
    const vw = this.vw, vh = this.vh;
    this.t = 0;
    this.done = false;
    this.rest = { x: 0, y: 0, zoom: this.scale, tilt: pose === 'portrait' ? 0.10 : 0.05 };
    this.startPointer = pose === 'portrait' ? { x: 0.5, y: 0.80 } : { x: 0.18, y: 0.82 };
    this.floor = makeWoodFloor(
      { x0: -vw * 0.7, y0: -vh * 0.7, x1: vw * 0.7, y1: vh * 0.7 },
      this.rng, { plankW: 80, horizontal: pose !== 'portrait' });
    // every room has a bin by its entrance, placeholders included: a Phase B
    // agent inherits the rule rather than remembering it
    const b = this.binSpot(pose);
    this.bin = new Bin({ x: b.x, y: b.y, rng: this.rng });
  }

  /** Where a room's bin goes: near where you came in, out of the debris. */
  binSpot(pose) {
    return pose === 'portrait'
      ? { x: this.vw * 0.33, y: this.vh * 0.28 }
      : { x: -this.vw * 0.40, y: -this.vh * 0.22 };
  }

  update(dt, ctx) {
    this.t += dt;
    if (this.t > 1.1) this.done = true;
    if (this.bin) this.bin.update(dt, ctx);
  }

  isComplete() { return this.done; }
  remaining() { return this.done ? 0 : 1; }
  devFinish() { this.done = true; }
  exit() { return { to: { x: 0, y: 0, zoom: this.scale * 1.05, tilt: this.rest.tilt }, dur: 0.9, next: 'hall' }; }
  entry() { return { x: 0, y: 0, zoom: this.scale * 0.92, tilt: this.rest.tilt }; }
  saveProgress() { return null; }
  restoreProgress() {}
}
