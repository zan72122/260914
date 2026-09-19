import { Scene } from './scene.js';
import { State } from '../debris/base.js';
import { DustBunny } from '../debris/dustBunny.js';
import { Crumb } from '../debris/crumb.js';
import { PaperScrap } from '../debris/paperScrap.js';
import { Curtain } from '../debris/curtain.js';
import { GapItem } from '../debris/gapItem.js';
import { Airborne } from '../core/airborne.js';
import { resolveProps } from '../props/prop.js';
import {
  makeWindowFloor, bakeWindowWall, bakeStickerLine, paintHemDust, paintShafts,
} from '../floors/window.js';
import {
  bakeBookshelf, bakeSideWall, makeGapProps, makeBookStack,
} from '../props/bookshelf.js';
import { clamp, lerp, smoothstep, TAU } from '../core/math.js';

const VR = { x0: 0, y0: 0, x1: 0, y1: 0 };
const TP = { x: 0, y: 0 };

/**
 * Room — the window: curtains, light shafts, and the gap beside the bookshelf.
 *
 * Two phenomena, and both of them are the air made visible.
 *
 * 1. THE CURTAIN. A floor-length curtain hangs by the window. Bring the head
 *    near and its hem comes off the boards — the lower rows lift and flap while
 *    the top stays sewn to the rail — and what the fabric has been hiding all
 *    this time is simply there: a nest of dust bunnies and crumbs against the
 *    skirting, leaning in the flow the moment they are uncovered. Hold ON the
 *    hem and the fabric is drawn taut into the intake, the motor labours, and
 *    after about six tenths of a second it slips free with a flap and a puff of
 *    lint. It is never yours. Under the nest, a row of stickers somebody put
 *    along the skirting board years ago.
 *
 * 2. THE CREVICE TOOL. Between the bookshelf and the wall is a slot 1.2 heads
 *    wide. Drive the head into it and the nozzle narrows into it — the cone goes
 *    long and thin, which the child watches happen because it is driven by how
 *    far in they have actually gone. Down there, in single file, is everything
 *    that has ever been dropped behind a bookshelf. There is no room to pass, so
 *    they come out one at a time: the front one rocks, cocks back, and shoots
 *    down the corridor, and the queue shuffles up behind it.
 *
 * And over all of it, the sun through the glass: shafts lying on the boards and
 * motes turning in them, which drift until the head comes under the light and
 * then pour down into the mouth. The air is visible where the light is.
 */
export class WindowScene extends Scene {
  constructor(rng) {
    super('window', rng);
    this.curtain = null;
    this.air = new Airborne(120, {
      kinds: {
        // a mote hangs: almost no gravity, a lot of drag, and it lifts easily,
        // so a shaft keeps turning over instead of raining onto the floor
        mote: { color: '#fff6dc', drag: 1.5, gravity: 7, r: 1.7, life: 7.5, lift: 1.5 },
        lint: { color: '#ded6c4', drag: 3.0, gravity: 46, r: 3.4, life: 2.6, lift: 1.2 },
      },
    });
    this.shafts = [];
    this.nest = [];
    this.gapItems = [];
    this.tool = 0;
    this.bright = 0;
    this.calm = 0;
    this.moteT = 0;
    this.sparks = [];
    this.stream = 0;
  }

  _p(nx, ny) { return { x: (nx - 0.5) * this.vw, y: (ny - 0.5) * this.vh }; }

  // ------------------------------------------------------------------ layout

  layout(pose, w, h) {
    super.layout(pose, w, h);
    const vw = this.vw, vh = this.vh;
    const rng = this.rng;
    this.debris.length = 0;
    this.props.length = 0;
    this.sparks.length = 0;
    this.nest.length = 0;
    this.gapItems.length = 0;
    this.air.reset();
    this.tool = 0;
    this.bright = 0;
    this.calm = 0;
    const portrait = pose === 'portrait';
    this.rest = { x: 0, y: 0, zoom: this.scale, tilt: portrait ? 0.08 : 0.05 };

    let cfg;
    if (portrait) {
      // DEPTH: the room recedes to the window, and the slot beside the shelf
      // runs away from the viewer up the right-hand side.
      this.startPointer = { x: 0.5, y: 0.84 };
      const wallY = -0.30 * vh;
      cfg = {
        wallY,
        win: { x0: -0.28 * vw, x1: -0.02 * vw, h: 0.13 * vh },
        rail: { x0: -0.48 * vw, x1: -0.18 * vw, y: wallY - 0.13 * vh - 46 },
        curtain: { x0: -0.46 * vw, x1: -0.20 * vw, y0: wallY - 0.13 * vh - 46, y1: wallY + 0.115 * vh },
        // the shelf is wider than the slot beside it, or the slot stops reading
        // as a gap and starts reading as a doorway
        shelf: { x0: -0.11 * vw, x1: 0.30 * vw - 41, y0: wallY, y1: wallY + 0.34 * vh },
        gap: { x: 0.30 * vw, hw: 41, yDeep: wallY + 6, yOpen: wallY + 0.34 * vh + 8 },
        shaftLen: 0.72 * vh, shaftDx: 0.26 * vw, shaftSpread: 0.17 * vw,
        binAt: { x: -0.38 * vw, y: 0.26 * vh },
        exitCam: { x: 0, y: 0.28 * vh, zoom: this.scale * 0.98, tilt: 0.06 },
      };
    } else {
      // WIDTH: a wide bookshelf along the far wall with a vertical slot at its
      // right-hand end, entered from below; the window and the curtain at the
      // left, and the sun raking across the whole floor.
      this.startPointer = { x: 0.62, y: 0.88 };
      // A landscape viewport is only ~390 design px tall, and three things are
      // competing for it: the whole window has to be ON the glass (it used to be
      // cut off by the top edge), the shelf face has to be tall enough to read,
      // and the slot beside it has to hold six things in SINGLE FILE — under
      // ~30px of spacing it stops being a queue and becomes a heap seen end-on,
      // which is exactly what it was. So the wall is low, the window is a wide
      // strip sitting right down on the sill, and the slot carries on a little
      // way UP the wall as a dark crack: 195px of queue instead of 146.
      const wallY = -0.26 * vh;
      const winH = 0.115 * vh, sillGap = 24;
      const railY = wallY - sillGap - winH - 8;
      cfg = {
        wallY,
        sillGap,
        skirt: 16,
        win: { x0: -0.30 * vw, x1: -0.04 * vw, h: winH },
        rail: { x0: -0.44 * vw, x1: -0.24 * vw, y: railY },
        curtain: { x0: -0.42 * vw, x1: -0.26 * vw, y0: railY, y1: wallY + 0.245 * vh },
        shelf: { x0: -0.04 * vw, x1: 0.33 * vw - 41, y0: wallY, y1: 0.15 * vh },
        gap: { x: 0.33 * vw, hw: 41, yDeep: wallY - 30, yOpen: 0.15 * vh + 6 },
        shaftLen: 0.62 * vh, shaftDx: 0.44 * vw, shaftSpread: 0.14 * vw,
        binAt: { x: -0.40 * vw, y: 0.22 * vh },
        exitCam: { x: -0.20 * vw, y: 0.26 * vh, zoom: this.scale * 0.98, tilt: 0.04 },
      };
    }
    this.cfg = cfg;
    this.gap = cfg.gap;
    this.wall = { x0: cfg.gap.x + cfg.gap.hw, x1: vw, y0: cfg.wallY - 40, y1: vh };
    // the reveal band is a little wider than the fabric: the stickers somebody
    // stuck along the skirting are the payoff for clearing the nest, and three
    // of them hiding exactly under the hem is not a payoff
    cfg.band = {
      x0: cfg.curtain.x0 - 22, x1: cfg.curtain.x1 + 34,
      y0: cfg.wallY - 4, y1: cfg.curtain.y1 + 24,
    };

    this._buildShafts(cfg);
    this._buildFloor(cfg, rng, portrait);
    this._buildCurtain(cfg, rng);
    this._buildNest(cfg, rng);
    this._buildGap(cfg, rng);
    this._buildOpenFloor(cfg, rng, portrait);

    this.props.push(...makeGapProps(cfg.shelf, cfg.gap, this.wall,
      { x0: -vw * 0.9, x1: cfg.gap.x - cfg.gap.hw - 6, y: cfg.wallY - 6 }));
    this.props.push(makeBookStack(
      portrait ? cfg.shelf.x0 + 46 : 0.06 * vw,
      portrait ? cfg.shelf.y1 + 42 : 0.19 * vh, rng));

    this.clearStartZone(165);
    // placeBin() would happily score the corner nearest the entrance, and in
    // both poses that corner is INSIDE the slot or on the shelf. A bin the head
    // cannot get to strands a child with a full cup, so this one is placed by
    // hand: on the open boards, well inside reachRect, clear of the set.
    this.placeBin(cfg.binAt);

    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      if (typeof d.hx === 'number' && !d.nest && !d.gap) { d.hx = d.x; d.hy = d.y; }
    }
    this._replayReveals();
    if (this.persist.uncovered) {
      for (let i = 0; i < this.nest.length; i++) {
        if (this.persist.uncovered[i]) this.nest[i].dormant = false;
      }
    }
    if (this.persist.swept) { this.floor.clearGrime(); this.bright = 1; this.calm = 1; }
  }

  /** The quads of sun on the boards. Baked into the floor; also drawn live to brighten. */
  _buildShafts(cfg) {
    this.shafts.length = 0;
    const w = cfg.win, y = cfg.wallY;
    // only the pane the curtain is NOT covering throws light on the boards:
    // draw the curtain and the room goes dull, which is the point of it
    const px0 = Math.max(w.x0, cfg.curtain.x1 - 10);
    const n = 2;
    const span = (w.x1 - px0) / n;
    for (let i = 0; i < n; i++) {
      const a0 = px0 + i * span + 5, a1 = px0 + (i + 1) * span - 5;
      this.shafts.push({
        tx0: a0, tx1: a1, ty: y - 6,
        bx0: a0 + cfg.shaftDx, bx1: a1 + cfg.shaftDx + cfg.shaftSpread,
        by: y + cfg.shaftLen,
        a: i === 1 ? 1 : 0.82,
      });
    }
  }

  _buildFloor(cfg, rng, portrait) {
    const vw = this.vw, vh = this.vh;
    // The boards run well past the frame in both directions, because the exit
    // camera pulls back toward the door and must never show the edge of them.
    const rect = { x0: -vw * 0.82, y0: cfg.wallY - 20, x1: vw * 0.82, y1: vh * 0.95 };
    this.floor = makeWindowFloor(rect, rng, {
      plankW: portrait ? 86 : 80, horizontal: !portrait, shafts: this.shafts,
      band: cfg.band,
    });
    // the whole static set folded into the one opaque blit
    const g = this.floor.growBase({
      x0: -vw * 0.85, y0: cfg.wallY - 0.46 * vh - 60, x1: vw * 0.85, y1: vh * 0.95,
    });
    bakeWindowWall(g, {
      wallY: cfg.wallY, x0: -vw * 0.85, x1: vw * 0.85,
      win: cfg.win, rail: cfg.rail, sillGap: cfg.sillGap, skirt: cfg.skirt,
    });
    bakeSideWall(g, this.wall);
    bakeBookshelf(g, cfg.shelf, cfg.gap, rng, { wide: !portrait });
    bakeStickerLine(g, { wallY: cfg.wallY, band: cfg.band }, rng);
    g.restore();
    paintHemDust(this.floor, cfg, rng);
  }

  _buildCurtain(cfg, rng) {
    const c = cfg.curtain;
    this.curtain = new Curtain(c, rng, {
      cols: 10, rows: 14, railY: cfg.rail.y,
      onSnap: (x, y) => this._puff(x, y),
    });
  }

  /**
   * The nest: what the hem has been keeping the light off. Every piece is
   * `dormant` until the fabric has actually risen above it — not faded in, not
   * spawned: it was there, and the curtain was on top of it.
   */
  _buildNest(cfg, rng) {
    const c = cfg.curtain;
    const w = c.x1 - c.x0;
    const y0 = cfg.wallY + 10, y1 = c.y1 - 16;
    // `u` stays inside 0.28..0.92 of the curtain's width on purpose: the outer
    // edge of the fabric is past the left-hand end of `reachRect`, and a single
    // dust bunny out there is a room that can never be finished.
    const spots = [
      [0.34, 0.18, 'b', 21], [0.54, 0.10, 'b', 17], [0.76, 0.22, 'b', 19],
      [0.42, 0.52, 'b', 15], [0.90, 0.48, 'c', 0], [0.64, 0.62, 'c', 0],
      [0.32, 0.80, 'c', 0], [0.72, 0.86, 'b', 14],
    ];
    for (let i = 0; i < spots.length; i++) {
      const [u, v, kind, r] = spots[i];
      const x = c.x0 + u * w, y = lerp(y0, y1, v);
      const d = kind === 'b' ? new DustBunny(x, y, r, rng) : new Crumb(x, y, rng);
      d.dormant = true;
      d.nest = true;
      d.nestDepth = 1 - v;              // 1 = right against the skirting
      this.debris.push(d);
      this.nest.push(d);
    }
    // the sliver: three pieces already poking out from under the hem, swaying
    // in the idle air. Nobody is told the curtain lifts; this is what asks.
    const peek = [[0.30, 1.12, 'b'], [0.58, 1.16, 'b'], [0.84, 1.10, 'c']];
    for (let i = 0; i < peek.length; i++) {
      const [u, v, kind] = peek[i];
      const x = c.x0 + u * w, y = lerp(y0, y1, v) + 18;
      const d = kind === 'b' ? new DustBunny(x, y, 17, rng) : new Crumb(x, y, rng);
      d.hem = true;
      this.debris.push(d);
    }
  }

  /** The queue down the slot: crumbs, lint, a bead, a hair clip, a folded note. */
  _buildGap(cfg, rng) {
    const g = cfg.gap;
    const order = ['crumb', 'lint', 'bead', 'note', 'clip', 'crumb'];
    const len = g.yOpen - g.yDeep;
    const n = order.length;
    // fill the WHOLE slot, not the middle two thirds of it: the biggest item in
    // the queue is ~27px long, and anything under ~30px of spacing stops being
    // single file and becomes a heap seen end-on (which is what landscape was).
    const V0 = 0.07, V1 = 0.93;
    for (let i = 0; i < n; i++) {
      // deepest first: the last one out is the one furthest down the throat
      const v = V0 + (i / (n - 1)) * (V1 - V0);
      const y = g.yDeep + len * v;
      const d = new GapItem(g.x + rng.range(-5, 5), y, rng, {
        kind: order[n - 1 - i],
        axis: { x: 0, y: 1 },
        line: { x: g.x, y: g.yDeep },
        len,
      });
      d.gap = true;
      // `clearStartZone` must not fan these out of the slot: the corridor IS
      // their motion law, and a gap item dragged sideways out of it can never
      // be lined up with the mouth again — and, being at the head of the queue,
      // it would block everything behind it for ever.
      d.anchored = true;
      this.debris.push(d);
      this.gapItems.push(d);
    }
    this.gapSpacing = (len * (V1 - V0)) / (n - 1);
  }

  /**
   * The open boards: a few bunnies and a few paper scraps, so the room has
   * ordinary play in it as well as its two set pieces. Placed by hand in both
   * poses — portrait spreads them down the depth of the room, landscape along
   * the width, and neither one is the other scaled.
   */
  _buildOpenFloor(cfg, rng, portrait) {
    const vw = this.vw, vh = this.vh;
    const bunnies = portrait
      ? [[-0.34, 0.06, 20], [0.28, 0.12, 24], [-0.12, 0.18, 18]]
      : [[-0.30, 0.02, 20], [-0.18, 0.14, 24], [-0.02, 0.20, 18]];
    for (let i = 0; i < bunnies.length; i++) {
      const [u, v, r] = bunnies[i];
      this.debris.push(new DustBunny(u * vw, v * vh, r, rng));
    }
    const scraps = portrait
      ? [[-0.30, 0.17, 'scrap'], [0.16, 0.05, 'strip'], [0.06, 0.19, 'tissue']]
      : [[-0.28, 0.17, 'scrap'], [-0.08, 0.04, 'strip'], [-0.22, 0.09, 'tissue']];
    const bounds = portrait
      ? { x0: -0.40 * vw, x1: 0.34 * vw, y0: cfg.shelf.y1 + 20, y1: 0.30 * vh }
      : { x0: -0.46 * vw, x1: 0.06 * vw, y0: cfg.curtain.y1 + 26, y1: 0.24 * vh };
    for (let i = 0; i < scraps.length; i++) {
      const [u, v, kind] = scraps[i];
      const d = new PaperScrap(u * vw, v * vh, rng, { kind });
      d.bounds = bounds;
      this.debris.push(d);
    }
  }

  // ------------------------------------------------------------------ update

  update(dt, ctx) {
    const vac = ctx.vacuum;
    resolveProps(vac, this.props, dt);

    this._tool(dt, vac);
    this._guideOut(dt, vac, ctx.camera, ctx.input);
    this.curtain.update(dt, vac, ctx.audio);
    this._uncover(vac);
    this._queue();

    const list = this.debris;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (d.dormant) continue;
      d.update(dt, vac, ctx.world);
    }

    this._motes(dt, vac);
    this.air.update(dt, vac);
    this._sparks(dt);

    // the "shoo": a wide draining noise for as long as something is actually
    // running down the slot, instead of a pop per item
    let flying = 0;
    for (let i = 0; i < this.gapItems.length; i++) {
      const it = this.gapItems[i];
      if (it.state !== State.DONE && it.flying) flying++;
    }
    const wantStream = clamp(flying * 0.5 + this.curtain.grab * 0.35, 0, 1);
    this.stream += (wantStream - this.stream) * (1 - Math.exp(-7 * dt));
    if (ctx.audio) ctx.audio.setStream(this.stream);

    // finished: the fabric sways instead of straining, the sun comes up, the
    // stickers under the skirting are uncovered for good
    if (this.remaining() === 0) {
      const prev = this.calm;
      this.calm = clamp(this.calm + dt / 1.5, 0, 1);
      this.curtain.calm = this.calm;
      this.bright = this.calm;
      if (prev < 1 && this.calm >= 1) { this.floor.clearGrime(); this.persist.swept = true; }
      else this._sweepDust(prev, this.calm);
    }
  }

  /**
   * The morph. `t` is pure geometry — how far into the slot the mouth is, and
   * how well lined up with it — so the head narrowing is something the child
   * causes and watches, not a mode that switches. ~0.3s each way.
   */
  _tool(dt, vac) {
    const g = this.gap;
    const lat = Math.abs(vac.mouthX - g.x);
    const depth = g.yOpen - vac.mouthY;                   // >0: inside the slot
    // both ramps are tight on purpose: the head must be lined up with the slot
    // AND actually at its mouth before it starts to narrow, or it walks around
    // the open floor beside the shelf permanently half-morphed
    const want = smoothstep(g.hw + 34, g.hw - 6, lat) * smoothstep(-20, 24, depth);
    this.tool += (want - this.tool) * (1 - Math.exp(-dt / 0.10));
    if (this.tool > 0.002) vac.setTool('crevice', this.tool);
    else vac.setTool('wide', 0);
  }

  /**
   * The slot only opens one way.
   *
   * A corridor one head wide between two solid things is a trap for a nozzle
   * that only ever moves toward the finger: press the head into the far corner
   * and both components of the spring are cancelled by the two walls, so it
   * sits there for ever — and that is not a puzzle, it is a room a child cannot
   * get out of. (It is also exactly what `dev/playthrough.mjs` found: the head
   * wedged at the top of the gap with the next dust bunny across the room.)
   *
   * So while the head is IN the slot and the finger is asking for somewhere
   * outside it, the slot slides the head back down toward its opening instead
   * of grinding it into the corner. It only ever moves the head the way it came
   * in, and it does nothing at all while the finger is still in the gap, so it
   * can never take a hold away from the player.
   */
  _guideOut(dt, vac, cam, input) {
    const g = this.gap;
    if (Math.abs(vac.nozzle.x - g.x) > g.hw + 24) return;
    if (vac.nozzle.y > g.yOpen + 16 || vac.nozzle.y < g.yDeep - 60) return;
    cam.toWorld(input.x, input.y - vac.leadUp, TP);
    if (Math.abs(TP.x - g.x) < g.hw) return;          // still asking for the gap
    const out = g.yOpen + 46;
    if (vac.nozzle.y >= out) return;
    vac.nozzle.y += (out - vac.nozzle.y) * (1 - Math.exp(-2.4 * dt));
  }

  /** The hem has risen above it, so it is not covered any more. Latched. */
  _uncover(vac) {
    let anyLive = false;
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      if (!d.dormant && d.state !== State.DONE && !d.decor) { anyLive = true; break; }
    }
    let changed = false;
    for (let i = 0; i < this.nest.length; i++) {
      const d = this.nest[i];
      if (!d.dormant) continue;
      // a safety net, not a shortcut: if the room has nothing else left alive,
      // the nest comes out anyway, so a child can never be locked in here
      // Three ways the fabric stops being on top of it, and the room needs all
      // three or it can deadlock:
      //  - the hem has literally come off this spot (the ordinary, visible one);
      //  - the hem has been that far open anywhere along its width, because a
      //    curtain lifted at one end opens the whole run of it;
      //  - the air is strong where the piece is lying. The head can be right on
      //    a deep piece with the hem BEHIND the mouth, so the fabric there never
      //    reads the flow and never lifts: without this the child pokes at the
      //    one thing left in the room and nothing whatever happens.
      // Plus the last-resort net: nothing else alive, so it comes out anyway.
      const open = this.curtain.liftMax >= 0.46 + 0.30 * d.nestDepth;
      const blown = vac ? vac.field(d.x, d.y, this._uf || (this._uf = {})).strength > 0.55 : false;
      if (open || blown || this.curtain.hemYAt(d.x) < d.y - 4 || !anyLive) {
        d.dormant = false; changed = true;
      }
    }
    if (changed) {
      const list = this.persist.uncovered || (this.persist.uncovered = []);
      for (let i = 0; i < this.nest.length; i++) list[i] = !this.nest[i].dormant;
    }
  }

  /** Only the one nearest the mouth of the slot has anywhere to go. */
  _queue() {
    let front = null;
    for (let i = 0; i < this.gapItems.length; i++) {
      const it = this.gapItems[i];
      it.ready = false;
      // an item that shot out of the slot is not in the queue any more, and
      // must not be allowed to head it: it has the greatest `along` of them all
      if (it.state === State.DONE || it.escaped) continue;
      if (!front || it.along > front.along) front = it;
    }
    if (front) {
      front.ready = true;
      // a new one at the head of the queue takes a moment to realise it is free
      if (front !== this.front) front.wait = Math.max(front.wait, 0.5);
    }
    this.front = front;
  }

  /** Dust motes turning in the sun. Spawned inside the shafts, nowhere else. */
  _motes(dt, vac) {
    this.moteT -= dt;
    if (this.moteT <= 0 && this.air.n < 34) {
      this.moteT = 0.07;
      const s = this.shafts[this.rng.int(0, this.shafts.length - 1)];
      const v = this.rng.next();
      const x0 = lerp(s.tx0, s.bx0, v), x1 = lerp(s.tx1, s.bx1, v);
      this.air.spawn(
        this.rng.range(x0, x1), lerp(s.ty, s.by, v),
        this.rng.range(6, 92),
        this.rng.range(-7, 7), this.rng.range(-5, 5), this.rng.range(-3, 6), 'mote');
    }
  }

  /** The puff of lint the curtain lets go of when it slips off the intake. */
  _puff(x, y) {
    for (let i = 0; i < 12; i++) {
      this.air.spawn(x + this.rng.range(-22, 22), y + this.rng.range(-10, 10),
        this.rng.range(4, 26),
        this.rng.range(-120, 120), this.rng.range(-60, 90), this.rng.range(20, 130), 'lint');
    }
    for (let i = 0; i < 8; i++) {
      this.sparks.push({
        x, y, vx: this.rng.range(-150, 150), vy: this.rng.range(-130, 80),
        life: 1, r: this.rng.range(1.4, 3.4),
      });
    }
  }

  _sparks(dt) {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.vx *= 0.92; s.vy *= 0.92;
      s.life -= dt * 1.6;
      if (s.life <= 0) this.sparks.splice(i, 1);
    }
  }

  /** The last of the dust wipes out from under where the hem used to be. */
  _sweepDust(a, b) {
    const band = this.cfg.band;
    const y = lerp(band.y0, band.y1, 0.5);
    const x0 = lerp(band.x0, band.x1, a), x1 = lerp(band.x0, band.x1, b);
    for (let k = 0; k < 4; k++) {
      const x = lerp(x0, x1, (k + 0.5) / 4);
      this.floor.reveal(x, y - 12, 58);
      this.floor.reveal(x, y + 16, 58);
    }
  }

  onCaptured(d, ctx) {
    if (d.nest || d.hem) {
      this.floor.reveal(d.x, d.y, 54);
      this._remember(d.x, d.y, 54);
    }
    const n = d.type === 'bunny' ? 7 : 5;
    for (let i = 0; i < n; i++) {
      this.sparks.push({
        x: d.x, y: d.y,
        vx: this.rng.range(-80, 80), vy: this.rng.range(-80, 80),
        life: 1, r: this.rng.range(1.2, 3.0),
      });
    }
    if (d.gap) {
      // the queue closes up: the one behind hops forward into the empty place
      for (let i = 0; i < this.gapItems.length; i++) {
        const it = this.gapItems[i];
        if (it.state !== State.DONE && !it.escaped && it.along < d.along) it.stepUp(this.gapSpacing * 0.62);
      }
      if (ctx && ctx.camera) ctx.camera.kick(2.4);
    }
  }

  _remember(x, y, r) {
    const b = this.cfg.band;
    const list = this.persist.reveals || (this.persist.reveals = []);
    if (list.length > 260) return;
    list.push([
      +((x - b.x0) / (b.x1 - b.x0)).toFixed(4),
      +((y - b.y0) / (b.y1 - b.y0)).toFixed(4),
      +(r / (b.x1 - b.x0)).toFixed(4),
    ]);
  }

  _replayReveals() {
    const list = this.persist.reveals;
    if (!list || !list.length) return;
    const b = this.cfg.band;
    const W = b.x1 - b.x0, H = b.y1 - b.y0;
    for (let i = 0; i < list.length; i++) {
      this.floor.reveal(b.x0 + list[i][0] * W, b.y0 + list[i][1] * H, list[i][2] * W);
    }
  }

  // -------------------------------------------------------------------- draw

  draw(ctx, cam) {
    this.drawFloor(ctx, cam);
    ctx.save();
    cam.apply(ctx);
    // the sun coming up at the end: the same quads as the baked ones, a couple
    // of flat fills, only while it is actually brightening
    if (this.bright > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      paintShafts(ctx, this.shafts, this.bright * 0.15);
      ctx.globalCompositeOperation = 'source-over';
    }
    for (let i = 0; i < this.props.length; i++) {
      const p = this.props[i];
      if (!p.data || (!p.data.shelf && !p.data.wall)) p.draw(ctx);
    }
    ctx.restore();

    // everything the curtain is on top of, then the curtain, then the rest
    this._drawSome(ctx, cam, true);
    ctx.save();
    cam.apply(ctx);
    this.curtain.draw(ctx);
    ctx.restore();
    this._drawSome(ctx, cam, false);

    ctx.save();
    cam.apply(ctx);
    this.air.draw(ctx, cam);
    this._drawSparks(ctx);
    ctx.restore();
  }

  _drawSome(ctx, cam, behind) {
    cam.viewRect(VR, 140);
    ctx.save();
    cam.apply(ctx);
    const list = this.debris;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (d.dormant) continue;
      // a nest piece that has taken off is out in the room, not behind cloth
      const isBehind = !!d.nest && d.state !== State.PULLED && d.state !== State.CAPTURED;
      if (isBehind !== behind) continue;
      if (d.x < VR.x0 || d.x > VR.x1 || d.y < VR.y0 || d.y > VR.y1) continue;
      d.draw(ctx, cam);
    }
    ctx.restore();
  }

  _drawSparks(ctx) {
    if (!this.sparks.length) return;
    ctx.fillStyle = 'rgba(248,240,224,0.92)';
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      ctx.globalAlpha = clamp(s.life, 0, 1) * 0.85;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- contract

  isComplete() { return this.remaining() === 0 && this.calm >= 1; }

  devFinish() {
    for (let i = 0; i < this.debris.length; i++) {
      this.debris[i].dormant = false;
      this.debris[i].state = State.DONE;
    }
    this.calm = 1; this.bright = 1;
    this.curtain.calm = 1;
    this.floor.clearGrime();
  }

  exit() { return { to: this.cfg.exitCam, dur: 1.5, next: 'hall' }; }

  entry() {
    // coming in through the door: a step lower and wider, looking straight at
    // the curtain and the sun on the boards
    return this.pose === 'portrait'
      ? { x: 0, y: this.vh * 0.16, zoom: this.scale * 0.94, tilt: 0.22 }
      : { x: -this.vw * 0.26, y: this.vh * 0.10, zoom: this.scale * 0.94, tilt: 0.16 };
  }

  restoreProgress(p) {
    super.restoreProgress(p);
    // a piece that was collected while it was still under the hem must not come
    // back as a covered one
    for (let i = 0; i < this.nest.length; i++) {
      if (this.nest[i].state === State.DONE) this.nest[i].dormant = false;
    }
  }

  snapshot() {
    const s = super.snapshot();
    s.curtain = this.curtain.snapshot();
    s.tool = +this.tool.toFixed(3);
    s.crevice = +this.tool.toFixed(3);
    s.motes = this.air.snapshot();
    s.calm = +this.calm.toFixed(2);
    s.front = this.front ? this.front.id : null;
    return s;
  }
}
