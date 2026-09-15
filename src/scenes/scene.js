import { State } from '../debris/base.js';

/**
 * Scene contract (this is all a new scene has to implement).
 *
 *   layout(pose, w, h)  build the world for THIS pose. Portrait and landscape
 *                       are separate designs, not one design scaled.
 *   update(dt, ctx)     ctx = {vacuum, camera, input, rng, audio, world}
 *   draw(ctx2d, camera) camera transform is NOT applied for you; use cam.apply
 *                       or the helpers below (drawFloor does it).
 *   isComplete()        true once the scene's goal is met
 *   exit()              {to:{x,y,zoom,tilt}, dur, next} camera move that shows
 *                       the way on. No UI, no text, ever.
 *   entry()             where the camera starts when this scene is entered
 *
 * Everything else (vacuum, field, transit, cup, harness) is core and must not
 * be modified to add a scene.
 */
export class Scene {
  constructor(id, rng) {
    this.id = id;
    this.rng = rng;
    this.debris = [];
    this.props = [];
    this.floor = null;
    this.pose = 'portrait';
    this.w = 0; this.h = 0;
    this.rest = { x: 0, y: 0, zoom: 1, tilt: 0 };
    this.startPointer = { x: 0.5, y: 0.72 };
    this.done = false;
    /** Survives relayout() (orientation change). Put anything you want kept here. */
    this.persist = {};
    /** Optional: set to a LightLayer to make the scene dark. */
    this.light = null;
    /** Optional: props array; call resolveProps(vac, this.props, dt) from update(). */
    this.props = [];
    this._sinceDone = 0;
    this.world = null;
  }

  /**
   * Scenes lay out in DESIGN units, not device pixels: `vw`/`vh` are the
   * viewport measured in design units and `scale` is the camera zoom that maps
   * them back to the screen. A dust bunny therefore covers the same fraction of
   * an iPhone and an iPad. Always build geometry from vw/vh, never from w/h.
   */
  layout(pose, w, h) {
    this.pose = pose; this.w = w; this.h = h;
    this.scale = Math.max(1, Math.min(2, Math.min(w, h) / 390));
    this.vw = w / this.scale;
    this.vh = h / this.scale;
  }

  /** Where the nozzle mouth sits before the player has touched anything. */
  parkPoint(leadPx = 92) {
    return {
      x: (this.startPointer.x - 0.5) * this.vw,
      y: (this.startPointer.y - 0.5) * this.vh - (leadPx - 22) / this.scale,
    };
  }

  /**
   * Push any debris that spawned inside the parked nozzle's idle airflow out to
   * `minDist`. Call at the end of layout(): otherwise those pieces are eaten
   * before the player touches the screen. ~150 design px still sways (good for
   * fluff), ~240 is out of reach (use that for anything with a low threshold).
   */
  clearStartZone(minDist = 240, leadPx = 92) {
    const p = this.parkPoint(leadPx);
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      let dx = d.x - p.x, dy = d.y - p.y;
      let l = Math.hypot(dx, dy);
      if (l >= minDist) continue;
      if (l < 1e-3) { dx = 0; dy = 1; l = 1; }
      d.x = p.x + (dx / l) * minDist;
      d.y = p.y + (dy / l) * minDist;
      d.hx = d.x; d.hy = d.y;
    }
  }

  /** Default: tick every debris and drop the finished ones. */
  update(dt, ctx) {
    const list = this.debris;
    for (let i = 0; i < list.length; i++) list[i].update(dt, ctx.vacuum, ctx.world);
    for (let i = list.length - 1; i >= 0; i--) if (list[i].state === State.DONE && list[i].remove) list.splice(i, 1);
  }

  drawFloor(ctx, cam) {
    if (!this.floor) return;
    ctx.save();
    cam.apply(ctx);
    this.floor.draw(ctx);
    ctx.restore();
  }

  drawDebris(ctx, cam) {
    ctx.save();
    cam.apply(ctx);
    const list = this.debris;
    for (let i = 0; i < list.length; i++) if (!list[i].dormant) list[i].draw(ctx, cam);
    ctx.restore();
  }

  draw(ctx, cam) {
    this.drawFloor(ctx, cam);
    this.drawDebris(ctx, cam);
  }

  /** Debris that still counts toward finishing (decor is excluded). */
  remaining() {
    let n = 0;
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      if (!d.decor && d.state !== State.DONE) n++;
    }
    return n;
  }

  isComplete() { return this.remaining() === 0; }

  /** Optional hook: add scene lights when `this.light` is set (screen coords). */
  lights(layer, cam, vac) {}

  exit() { return { to: { x: this.rest.x, y: this.rest.y, zoom: this.rest.zoom, tilt: this.rest.tilt }, dur: 1.2, next: null }; }
  entry() { return { x: this.rest.x, y: this.rest.y, zoom: this.rest.zoom, tilt: this.rest.tilt }; }

  snapshot() {
    return {
      id: this.id, pose: this.pose, remaining: this.remaining(),
      complete: this.isComplete(),
      debris: this.debris.map((d) => d.snapshot()),
    };
  }
}
