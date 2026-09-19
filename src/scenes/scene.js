import { State } from '../debris/base.js';
import { LEAD } from '../vacuum/vacuum.js';
import { Bin } from '../props/bin.js';

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
 * Optional hooks:
 *   onCaptured(d, ctx)            something went up the tube. `ctx` is the SAME
 *                       update context the scene is ticked with
 *                       ({vacuum, camera, input, rng, audio, world}), so a
 *                       capture can play a sound, kick the camera or spawn the
 *                       next hint without the scene having to stash a reference
 *                       to any of them. Both arguments have always been passed;
 *                       older scenes simply declared `onCaptured(d)`.
 *   drawOver(ctx2d, cam)          drawn AFTER the vacuum: in front of the machine
 *   saveProgress()/restoreProgress(p)  carry the player's progress across an
 *                       orientation change (the default is index-based and is
 *                       usually right; override with no-ops if the scene
 *                       already rebuilds everything from `persist`)
 *   lights(layer, cam, vac)       when `this.light` is a LightLayer
 *   devFinish()                   finish instantly, for dev/shot.mjs --complete
 *
 * Everything else (vacuum, field, transit, cup, harness) is core and must not
 * be modified to add a scene.
 */
const CSZ_R = { x0: 0, y0: 0, x1: 0, y1: 0 };
const BIN_R = { x0: 0, y0: 0, x1: 0, y1: 0 };

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
    /** The room's bin (see placeBin). main.js ticks and draws it. */
    this.bin = null;
    this.ownsBin = false;
    /** Optional: a world point to start the machine at instead of startPointer. */
    this.startWorld = null;
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
   * The world rectangle the nozzle can actually reach at this scene's rest
   * camera.
   *
   * The finger is clamped to the glass and the head is drawn a fixed distance
   * AHEAD of it, so there is a band at every edge — a wide one along the bottom,
   * the whole lead offset — that the head can never enter. Debris placed in that
   * band can never be collected, and the room can never be finished. Anything
   * laying out debris near an edge should filter against this. Conservative: it
   * ignores the extra reach the mouth gets from leaning into a drag.
   *
   * **It is measured at `this.rest`, and a scene whose camera MOVES has to say
   * what it means by that.** With `followTo`/`stepTo` the reachable world is
   * the rest rectangle swept along whatever path the camera takes, which is far
   * bigger than this one — so a scene that scrolls (the hall, the stairs, the
   * corridor under the sofa) should set `rest` to the composition it wants
   * while the debris is being laid out, or call `reachRect` once per camera
   * station and union the results by hand. Using the single rest rectangle of a
   * scrolling room as if it were the whole floor rejects legitimate positions at
   * the far end; trusting it as if the camera never moved accepts positions the
   * head can only reach after a scroll, which is usually fine but is NOT the
   * same guarantee. When in doubt, place debris where the head can reach it
   * without the camera having to move first.
   */
  reachRect(out, margin = 24) {
    const L = LEAD[this.pose] || LEAD.portrait;
    const r = this.rest;
    const zoom = r.zoom || 1;
    const yScale = zoom * (1 - 0.45 * (r.tilt || 0));
    const push = (r.tilt || 0) * this.h * 0.12;
    const M = 34;                          // the head is kept this far on-screen
    const sx0 = M, sx1 = this.w - M;
    const sy0 = Math.max(M, -L.up);
    const sy1 = Math.min(this.h - M, this.h - L.up);
    out.x0 = (sx0 - this.w * 0.5) / zoom + r.x + margin;
    out.x1 = (sx1 - this.w * 0.5) / zoom + r.x - margin;
    out.y0 = (sy0 - this.h * 0.5 - push) / yScale + r.y + margin;
    out.y1 = (sy1 - this.h * 0.5 - push) / yScale + r.y - margin;
    return out;
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
    const R = this.reachRect(CSZ_R, 0);
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      if (d.dormant || d.anchored) continue;        // hidden / tied down: leave it
      d.aim(a);
      let dx = a.x - p.x, dy = a.y - p.y;
      let l = Math.hypot(dx, dy);
      if (l >= minDist) continue;
      if (l < 1e-3) { dx = 0; dy = 1; l = 1; }
      // Straight out from the parked nozzle is the obvious direction, and it is
      // sometimes wrong: pushing a piece "away" can push it off the bottom of
      // the screen, where the head can never follow and the room can never be
      // finished. Fan around until the piece lands somewhere reachable.
      const a0 = Math.atan2(dy / l, dx / l);
      let bx = p.x + (dx / l) * minDist, by = p.y + (dy / l) * minDist;
      let bestScore = -1;
      for (let k = 0; k < 16; k++) {
        const off = ((k + 1) >> 1) * (k % 2 ? -1 : 1) * 0.3927;   // 0, ±22.5°, ±45°, ...
        const ang = a0 + off;
        const cx = p.x + Math.cos(ang) * minDist, cy = p.y + Math.sin(ang) * minDist;
        const inX = cx > R.x0 && cx < R.x1, inY = cy > R.y0 && cy < R.y1;
        const score = (inX ? 2 : 0) + (inY ? 2 : 0) - Math.abs(off) * 0.1;
        if (score > bestScore) { bestScore = score; bx = cx; by = cy; }
        if (inX && inY) break;
      }
      d.translate(bx - a.x, by - a.y);
    }
  }

  /**
   * Pull every piece back inside the rectangle the head can reach.
   *
   * `clearStartZone` pushes debris OUT of the parked airflow; this is the other
   * guard, and it is the one that decides whether a room can be finished. The
   * head is clamped to the glass and drawn a whole lead offset ahead of the
   * finger, so a piece sitting exactly on the edge of `reachRect` can only be
   * reached with the finger jammed against the bottom of the screen and the
   * mouth barely touching it — which in practice means a long, unrewarding grind
   * on the last piece in the room, not an impossible one. Both are bad.
   *
   * Call it at the end of `layout()`, after every piece is in `this.debris`,
   * with a margin that leaves the head somewhere to stand (30-40 is plenty).
   * It measures from each piece's `aim()` point and moves it with `translate()`,
   * so ropes, strands and patches come along in one piece; `anchored` pieces
   * (an invitation that must stay where it is) are left alone.
   *
   * It is opt-in, not automatic: a scene may have a good reason to put
   * something just outside — the deep nook under the sofa is deliberately out
   * of the head's reach and is won by holding still instead.
   */
  pullIntoReach(margin = 34) {
    const R = this.reachRect(CSZ_R, margin);
    const a = { x: 0, y: 0 };
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      if (d.anchored) continue;
      d.aim(a);
      const nx = a.x < R.x0 ? R.x0 : (a.x > R.x1 ? R.x1 : a.x);
      const ny = a.y < R.y0 ? R.y0 : (a.y > R.y1 ? R.y1 : a.y);
      if (nx !== a.x || ny !== a.y) d.translate(nx - a.x, ny - a.y);
    }
  }

  /**
   * Put the room's bin down.
   *
   * EVERY room has one, because the cup-capacity mechanic only teaches itself
   * if the answer is always already in the room: the cup fills, things stop
   * going in, and the one open thing in sight is this.
   *
   * Where it goes is chosen, not guessed. The candidates are the four corners
   * the nozzle can actually reach; a corner is rejected if it is close enough
   * to the parked machine to be sitting underneath it, or close enough to any
   * debris to be standing on the mess, and of what is left the one NEAREST the
   * entrance wins — so it is the first thing in the room and the last, without
   * ever being in the way.
   *
   * Call it at the end of `layout()`, after `rest`, `startPointer` and the
   * debris. `main.js` ticks and draws `this.bin`; a scene that drives the pour
   * itself (the carpet finale) sets `this.ownsBin = true` as well.
   *
   *   this.placeBin();                        // pick a corner
   *   this.placeBin({ side: 'left' });        // ...on this side
   *   this.placeBin({ x, y });                // or put it exactly here
   *   this.placeBin({ within: {x0,y0,x1,y1} });
   *
   * `within` narrows the search to a world rectangle before the corners are
   * scored — the one thing the corner rule cannot work out for itself, which is
   * that part of the reachable floor is not FLOOR: it is a stair, a balcony
   * edge, the gap behind a bookshelf, the space under a bed. Intersect it with
   * the reachable rectangle rather than replacing it, so a `within` that is too
   * generous still cannot put the bin somewhere the head can never go.
   */
  placeBin(opts) {
    const o = opts || {};
    let x = o.x, y = o.y;
    if (x === undefined || y === undefined) {
      const R = this.reachRect(BIN_R, 30);
      if (o.within) {
        const W = o.within;
        R.x0 = Math.max(R.x0, W.x0); R.x1 = Math.min(R.x1, W.x1);
        R.y0 = Math.max(R.y0, W.y0); R.y1 = Math.min(R.y1, W.y1);
        // a `within` that leaves nothing at all is a mistake in the scene, not
        // a reason to strand the child: fall back to the reachable rectangle
        if (R.x1 - R.x0 < 60 || R.y1 - R.y0 < 60) this.reachRect(R, 30);
      }
      const park = this.parkPoint();
      const cands = [
        { x: R.x0 + 52, y: R.y1 - 48 }, { x: R.x1 - 52, y: R.y1 - 48 },
        { x: R.x0 + 52, y: R.y0 + 62 }, { x: R.x1 - 52, y: R.y0 + 62 },
      ];
      const a = { x: 0, y: 0 };
      let best = cands[0], bestScore = -1e9;
      for (let i = 0; i < cands.length; i++) {
        const c = cands[i];
        if (o.side === 'left' && c.x > 0) continue;
        if (o.side === 'right' && c.x < 0) continue;
        const dPark = Math.hypot(c.x - park.x, c.y - park.y);
        let clear = 1e9;
        for (let k = 0; k < this.debris.length; k++) {
          const d = this.debris[k];
          if (d.decor) continue;
          d.aim(a);
          const dd = Math.hypot(a.x - c.x, a.y - c.y);
          if (dd < clear) clear = dd;
        }
        // Three soft rules, weighted so they can never fight to a bad answer:
        // standing under the parked machine is far worse than standing near
        // the mess, which is worse than being at the far end of the room.
        // 140 is the bin's half-width plus the head's radius plus a margin.
        const score = -(Math.max(0, 110 - dPark) * 0.30
          + Math.max(0, 110 - clear) * 0.008
          + Math.min(dPark, 900) * 0.004);
        if (score > bestScore) { bestScore = score; best = c; }
      }
      const c = best;
      if (x === undefined) x = c.x;
      if (y === undefined) y = c.y;
    }
    this.bin = new Bin({ x, y, rng: this.rng });
    return this.bin;
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
      bin: this.bin ? this.bin.snapshot() : null,
      debris: this.debris.map((d) => d.snapshot()),
    };
  }
}
