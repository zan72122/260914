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
    const a = { x: 0, y: 0 };
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      if (d.dormant || d.anchored) continue;        // hidden / tied down: leave it
      d.aim(a);
      let dx = a.x - p.x, dy = a.y - p.y;
      let l = Math.hypot(dx, dy);
      if (l >= minDist) continue;
      if (l < 1e-3) { dx = 0; dy = 1; l = 1; }
      d.translate((dx / l) * (minDist - l), (dy / l) * (minDist - l));
    }
  }

  /**
   * Progress across an orientation change.
   *
   * `layout()` rebuilds the world from scratch, so whatever the player already
   * cleared has to be put back. The default remembers WHICH pieces were done
   * (by index — layout is deterministic for a given seed, so index i is the
   * same piece in both poses) and falls back to a count if the list changed
   * length. A scene that keeps richer state in `persist` can override both to
   * no-ops; a scene with its own erasures can extend them.
   */
  saveProgress() {
    const done = [];
    let cleared = 0;
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      if (d.decor || d.state !== State.DONE) continue;
      done.push(i); cleared++;
    }
    return { done, cleared, n: this.debris.length };
  }

  restoreProgress(p) {
    if (!p) return;
    if (p.done && p.n === this.debris.length) {
      for (let i = 0; i < p.done.length; i++) {
        const d = this.debris[p.done[i]];
        if (d && !d.decor) d.state = State.DONE;
      }
      return;
    }
    let c = p.cleared || 0;
    for (let i = 0; i < this.debris.length && c > 0; i++) {
      const d = this.debris[i];
      if (d.decor || d.dormant || d.state === State.DONE) continue;
      d.state = State.DONE; c--;
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

  /**
   * Drawn AFTER the vacuum, so a scene can put something in front of the
   * machine: the finale pour out of the dust cup, a strand still hanging out of
   * the mouth, a highlight on the head. Camera transform is not applied.
   */
  drawOver(ctx, cam) {}

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
