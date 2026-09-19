import { Scene } from './scene.js';
import { State } from '../debris/base.js';
import { DustBunny } from '../debris/dustBunny.js';
import { Crumb, resolveCrumbs } from '../debris/crumb.js';
import { Bead } from '../debris/bead.js';
import { Prop, resolveProps, keepInside } from '../props/prop.js';
import { ToyCar, PlushBear, BlockTrain, covers, rrect } from '../props/toys.js';
import { makePlayroomFloor, paintSticker, paintDustPatch } from '../floors/playroom.js';
import { TAU, clamp, smoothstep } from '../core/math.js';

/**
 * Scene 4 — the playroom.
 *
 * The suction idea: the vacuum CANNOT swallow a big toy, but the air still
 * plays with every loose thing on it — the car's paper pennant, the bear's ear
 * fur and ribbon tails, the train's price tag all lean and flutter while the
 * toy itself does not budge a millimetre. What DOES move a toy is the head
 * bumping into it, and each toy slides differently (the car rolls far and only
 * along its axle, the bear scoots and wobbles, the block train is dead weight).
 * Underneath every toy is a year's worth of hidden nest: fluff, crumbs and hard
 * little beads that rattle round the mouth before they are swallowed. A toy
 * half-pushed shows a sliver of that nest leaning toward the nozzle, and the
 * sliver is the whole invitation to shove it further.
 */
export class ToyScene extends Scene {
  constructor(rng) {
    super('toy', rng);
    this.nests = [];
    this.rides = [];
    this.puffs = [];
    this.thread = null;
    this._glow = null;
  }

  _p(nx, ny) { return { x: (nx - 0.5) * this.vw, y: (ny - 0.5) * this.vh }; }

  // ------------------------------------------------------------ layout

  layout(pose, w, h) {
    super.layout(pose, w, h);
    w = this.vw; h = this.vh;
    this.debris.length = 0;
    this.props.length = 0;
    this.nests.length = 0;
    this.rides.length = 0;
    this.puffs.length = 0;
    this._glow = null;
    const rng = this.rng;
    const portrait = pose === 'portrait';

    this.rest = { x: 0, y: 0, zoom: this.scale, tilt: portrait ? 0.10 : 0.05 };

    let toys;
    if (portrait) {
      // the playroom RECEDES: three toys at three depths, the train parked
      // against the back wall right under the doorway
      this.startPointer = { x: 0.5, y: 0.86 };
      this.floor = makePlayroomFloor({ x0: -w * 1.0, y0: -h * 0.95, x1: w * 1.0, y1: h * 0.85 }, rng, { tile: 150 });
      this.wall = { y: -h * 0.38, h: 460 };
      this.door = { x: w * 0.17, w: 168, h: 210 };
      this.chest = null;
      toys = [
        { k: 'bear', p: this._p(0.29, 0.560), a: 0 },
        { k: 'car', p: this._p(0.71, 0.395), a: -0.34 },
        { k: 'train', p: this._p(0.40, 0.215), a: 0.06 },
      ];
      this.exitCam = { x: this.door.x, y: this.wall.y - 40, zoom: this.scale * 1.05, tilt: 0.36 };
      // toys stay in the room: never behind the wall, never off the side
      this.bounds = { x0: -w * 0.5, y0: this.wall.y, x1: w * 0.5, y1: h * 0.40, inset: 0.8 };
    } else {
      // WIDE floor: the toys strung out left to right, a solid toy chest
      // along the back that the head has to slide around
      this.startPointer = { x: 0.08, y: 0.84 };
      this.floor = makePlayroomFloor({ x0: -w * 0.95, y0: -h * 1.25, x1: w * 1.15, y1: h * 1.1 }, rng, { tile: 140 });
      this.wall = { x: w * 0.44, w: 620 };
      this.door = { y: -h * 0.02, w: 180, h: 250 };
      // Kept clear of the bottom of the reach rectangle. A toy's nest lies on
      // the toy's own footprint and never moves, so a toy parked at the edge of
      // the head's travel hides a bead the head can only just touch — which is
      // a fourteen-second grind on the last piece in the room, not a puzzle.
      toys = [
        { k: 'bear', p: this._p(0.30, 0.635), a: 0 },
        { k: 'car', p: this._p(0.55, 0.395), a: 0.30 },
        { k: 'train', p: this._p(0.78, 0.600), a: -0.10 },
      ];
      const c = this._p(0.38, 0.145);
      this.chest = { x: c.x, y: c.y, w: 250, h: 104 };
      this.exitCam = { x: w * 0.40, y: -h * 0.02, zoom: this.scale * 1.05, tilt: 0.24 };
      this.bounds = { x0: -w * 0.5, y0: -h * 0.5, x1: this.wall.x, y1: h * 0.5, inset: 0.8 };
    }

    // ...and a toy may not be SHOVED out of reach either: a toy pushed past the
    // end of the head's travel can never be pushed back, and it takes its nest
    // with it. `bounds` is what `resolveProps` keeps the toys inside, so
    // clipping it here fixes the whole room at once.
    {
      const RR = this.reachRect({ x0: 0, y0: 0, x1: 0, y1: 0 }, 20);
      this.bounds.x0 = Math.max(this.bounds.x0, RR.x0);
      this.bounds.x1 = Math.min(this.bounds.x1, RR.x1);
      this.bounds.y0 = Math.max(this.bounds.y0, RR.y0);
      this.bounds.y1 = Math.min(this.bounds.y1, RR.y1);
    }

    if (this.chest) {
      const c = this.chest;
      this.props.push(new Prop({
        x: c.x, y: c.y, shape: 'rect', w: c.w, h: c.h, pushable: false,
        shadow: false, draw: (ctx) => this._drawChest(ctx),
      }));
    }

    this.floor.enableGrime();

    const park = this._park();
    for (let i = 0; i < toys.length; i++) {
      const t = toys[i];
      let prop;
      if (t.k === 'car') prop = new ToyCar({ x: t.p.x, y: t.p.y, angle: t.a, rng });
      else if (t.k === 'bear') prop = new PlushBear({ x: t.p.x, y: t.p.y, rng });
      else prop = new BlockTrain({ x: t.p.x, y: t.p.y, angle: t.a, rng });
      prop.home = { x: t.p.x, y: t.p.y };
      this.props.push(prop);
      this.nests.push(this._makeNest(prop, i, park, i === 0));
    }

    // the hint for the NEXT room: a long hair lying in the corridor
    this.thread = this._makeThread(portrait);

    this.placeBin();
    this._restoreProgress();
  }

  /**
   * An orientation change rebuilds the whole room, so the scene carries its own
   * progress across in `persist`: how far each toy was shoved, how much of each
   * nest was already eaten, and every hole already wiped in the dust.
   */
  _restoreProgress() {
    const P = this.persist.nests;
    if (!P) return;
    for (let i = 0; i < this.nests.length; i++) {
      const n = this.nests[i];
      const p = P[i];
      if (!p) continue;
      n.prop.x += (p.mx || 0) * this.vw;
      n.prop.y += (p.my || 0) * this.vh;
      keepInside(n.prop, this.bounds);
      for (let k = 0; k < n.items.length; k++) {
        const d = n.items[k];
        d.dormant = covers(n.prop, d.x, d.y, 0.99);
      }
      let c = p.cleared || 0;
      for (let k = 0; k < n.items.length && c > 0; k++) {
        const d = n.items[k];
        if (d.state === State.DONE) continue;
        d.state = State.DONE; d.dormant = false; c--;
      }
      n.revealT = p.revealT || 0;
      n.cleared = n.revealT > 0;
      const R = Math.max(n.patch.rx, n.patch.ry);
      const rev = p.reveals;
      if (rev) for (let k = 0; k < rev.length; k++) {
        this.floor.reveal(n.patch.x + rev[k][0] * R, n.patch.y + rev[k][1] * R, rev[k][2] * R);
      }
    }
  }

  /**
   * The room is rebuilt from `persist` above — how far each toy was shoved, how
   * much of each nest was eaten, every hole wiped in the dust — so the core's
   * generic replay has nothing left to do.
   */
  saveProgress() { return null; }
  restoreProgress() {}

  _persistFor(nest) {
    const all = this.persist.nests || (this.persist.nests = []);
    return all[nest.index] || (all[nest.index] = { cleared: 0, revealT: 0, mx: 0, my: 0, reveals: [] });
  }

  /** The mouth position before the player has touched anything. */
  _park() {
    return {
      x: (this.startPointer.x - 0.5) * this.vw,
      y: (this.startPointer.y - 0.5) * this.vh - 70 / this.scale,
    };
  }

  _halfExtentAlong(p, dx, dy) {
    if (p.shape === 'circle') return p.r;
    const ca = Math.cos(-p.angle), sa = Math.sin(-p.angle);
    const lx = dx * ca - dy * sa, ly = dx * sa + dy * ca;
    const tx = Math.abs(lx) > 1e-4 ? (p.w * 0.5) / Math.abs(lx) : 1e9;
    const ty = Math.abs(ly) > 1e-4 ? (p.h * 0.5) / Math.abs(ly) : 1e9;
    return Math.min(tx, ty);
  }

  /**
   * The hidden patch under one toy: fluff, crumbs and hard beads, all dormant
   * (invisible, unsuckable) until the toy has slid off them — plus one tuft
   * already poking out from under the rim, which is what makes a four-year-old
   * shove the toy in the first place.
   */
  _makeNest(prop, index, park, sticker) {
    const rng = this.rng;
    const circle = prop.shape === 'circle';
    const rx = (circle ? prop.r : prop.w * 0.5) * 0.92;
    const ry = (circle ? prop.r : prop.h * 0.5) * 0.92;
    const ca = Math.cos(prop.angle), sa = Math.sin(prop.angle);
    const at = (u, v) => ({ x: prop.x + (u * rx) * ca - (v * ry) * sa, y: prop.y + (u * rx) * sa + (v * ry) * ca });

    const nest = { prop, index, items: [], revealT: 0, cleared: false, sticker: !!sticker, puffed: false };

    // dust: a couple of soft balls lying along the toy
    const spots = [[-0.58, -0.10], [0.52, 0.28]];
    for (let i = 0; i < spots.length; i++) {
      const p = at(spots[i][0] + rng.range(-0.08, 0.08), spots[i][1] + rng.range(-0.1, 0.1));
      nest.items.push(this._bunny(p.x, p.y, rng.range(23, 28)));
    }
    // crumbs scattered between them
    for (let i = 0; i < 5; i++) {
      const p = at(rng.range(-0.92, 0.92), rng.range(-0.85, 0.85));
      const c = new Crumb(p.x, p.y, rng, 'crumb');
      // year-old floor crumbs, not breakfast cereal: bigger and much darker,
      // so a four-year-old sees them on the pale mat from across the room
      c.r *= 1.5;
      c.color = rng.pick(['#6d4a22', '#8a5c2a', '#5a3d1c', '#7b5327']);
      nest.items.push(c);
    }
    // and the hard little things that make the noise
    for (let i = 0; i < 3; i++) {
      const p = at(rng.range(-0.75, 0.75), rng.range(-0.7, 0.7));
      nest.items.push(new Bead(p.x, p.y, rng));
    }

    // the sliver: a tuft already sticking out from under the near rim
    let dx = park.x - prop.x, dy = park.y - prop.y;
    let l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    let ex = this._halfExtentAlong(prop, dx, dy);
    let sx = prop.x + dx * (ex + 11), sy = prop.y + dy * (ex + 11);
    if (Math.hypot(sx - park.x, sy - park.y) < 190) {
      // too close to the parked nozzle: tuck it out on the flank instead
      const px = -dy, py = dx;
      ex = this._halfExtentAlong(prop, px, py);
      sx = prop.x + px * (ex + 11); sy = prop.y + py * (ex + 11);
    }
    nest.items.push(this._bunny(sx, sy, 24));

    for (let i = 0; i < nest.items.length; i++) {
      const d = nest.items[i];
      d.nest = nest;
      d.dormant = covers(prop, d.x, d.y, 0.99);
      this.debris.push(d);
    }

    // the grime patch, and (under the first toy only) the sticker beneath it
    const gx = prop.x, gy = prop.y;
    const grx = (circle ? prop.r : prop.w * 0.5) * (circle ? 1.52 : 1.34);
    const gry = (circle ? prop.r : prop.h * 0.5) * (circle ? 1.52 : 1.62);
    nest.patch = { x: gx, y: gy, rx: grx, ry: gry };
    if (sticker) paintSticker(this.floor, gx, gy, Math.min(grx, gry) * 0.70, rng);
    paintDustPatch(this.floor, gx, gy, grx, gry, rng);
    return nest;
  }

  /**
   * A nest bunny. Trimmed to fewer, slightly longer fibers than the default:
   * a dozen of these share the screen here, and each fiber costs a field
   * sample, so the scene buys back the frame time it needs.
   */
  _bunny(x, y, r) {
    const b = new DustBunny(x, y, r, this.rng);
    b.hx = x; b.hy = y;
    const n = Math.max(14, Math.round(b.n * 0.68));
    for (let i = n; i < b.n; i++) b.fl[i] = 0;
    b.n = n; b.fibers = n;
    for (let i = 0; i < n; i++) { b.fa[i] = (i / n) * TAU + this.rng.range(-0.1, 0.1); b.fl[i] *= 1.12; }
    return b;
  }

  _makeThread(portrait) {
    const pts = [];
    const n = 16;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      if (portrait) {
        const y = this.wall.y - 12 - t * 190;
        pts.push({ x: this.door.x - 52 + Math.sin(t * 6.1) * 30 + t * 40, y });
      } else {
        const x = this.wall.x + 26 + t * 210;
        pts.push({ x, y: this.door.y + 40 + Math.sin(t * 5.6) * 28 - t * 26 });
      }
    }
    return pts;
  }

  // ------------------------------------------------------------ update

  update(dt, ctx) {
    const vac = ctx.vacuum;

    // the air finds every loose part, every frame, whether or not anything moves
    for (let i = 0; i < this.props.length; i++) {
      const p = this.props[i];
      if (p.sense) p.sense(dt, vac);
    }

    // Leaning on a toy shoves it, even without a swipe.
    //
    // `resolveProps` gives a pushable prop velocity proportional to the HEAD's
    // velocity, so a head held still against a toy does nothing at all. That is
    // right for a glancing knock and wrong for the thing a child actually does,
    // which is to push and keep pushing — and it is what made a nest
    // unwinnable: the driver creeps up to a piece under the train, stops
    // because it cannot get closer, holds, and the train never moves again. The
    // pieces stay under it for ever. (ipad-landscape, `crumb#153 ground out
    // wd=30` five times over, 200s in a room that takes nine.) A steady press
    // now makes the toy creep, scaled by its mass, so the bear slides easily
    // and the block train grudgingly.
    for (let i = 0; i < this.props.length; i++) {
      const p = this.props[i];
      if (p.pushable !== true) continue;
      const hv = Math.hypot(vac.nozzle.vx, vac.nozzle.vy);
      if (hv > 110) continue;                       // a real sweep already shoves it
      const dx = vac.nozzle.x - p.x, dy = vac.nozzle.y - p.y;
      let inside;
      if (p.shape === 'circle') {
        inside = Math.hypot(dx, dy) < p.r + vac.headRadius * 0.72;
      } else {
        const ca = Math.cos(-p.angle), sa = Math.sin(-p.angle);
        const rx = dx * ca - dy * sa, ry = dx * sa + dy * ca;
        inside = Math.abs(rx) < p.w * 0.5 + vac.headRadius * 0.72
          && Math.abs(ry) < p.h * 0.5 + vac.headRadius * 0.72;
      }
      if (!inside) continue;
      const d = Math.hypot(dx, dy) || 1;
      const k = (240 / Math.max(0.3, p.mass)) * dt;
      p.vx -= (dx / d) * k;
      p.vy -= (dy / d) * k;
      p.nudge = Math.max(p.nudge, 0.35);
    }

    // the core does the shoving, the toy-on-toy separation and the room bounds
    resolveProps(vac, this.props, dt, { separate: true, bounds: this.bounds });

    // a toy sliding off its nest uncovers it, piece by piece
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      if (!d.dormant || !d.nest) continue;
      if (!covers(d.nest.prop, d.x, d.y, 0.99)) {
        d.dormant = false;
        this._puff(d.x, d.y, 5);
      }
    }

    const list = this.debris;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (d.dormant) continue;
      d.update(dt, vac, ctx.world);
    }
    resolveCrumbs(list);

    for (let i = 0; i < this.nests.length; i++) {
      const n = this.nests[i];
      const p = this._persistFor(n);
      p.mx = +((n.prop.x - n.prop.home.x) / this.vw).toFixed(4);
      p.my = +((n.prop.y - n.prop.home.y) / this.vh).toFixed(4);
    }

    this._updateRides(dt);
    this._updatePuffs(dt);
    this._updateReveals(dt);
  }




  /** Make the transit visibly BOUNCE down the tube instead of gliding. */
  _updateRides(dt) {
    for (let i = this.rides.length - 1; i >= 0; i--) {
      const it = this.rides[i];
      if (!it || it.t >= 1) { this.rides.splice(i, 1); continue; }
      const u = clamp(it.t, 0, 1);
      const ph = u * Math.PI * 3.2;
      it.size = it._base * (0.80 + 0.46 * Math.abs(Math.cos(ph)));
      it.dur = it._baseDur * (0.74 + 0.5 * Math.abs(Math.sin(ph)));
    }
  }

  _puff(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.puffs.push({
        x: x + this.rng.range(-8, 8), y: y + this.rng.range(-6, 6),
        vx: this.rng.range(-38, 38), vy: this.rng.range(-38, 38),
        life: 1, r: this.rng.range(2.2, 5.5),
      });
    }
  }

  _updatePuffs(dt) {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const s = this.puffs[i];
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.vx *= 0.92; s.vy *= 0.92;
      s.life -= dt * 1.5;
      if (s.life <= 0) this.puffs.splice(i, 1);
    }
  }

  /** A cleared nest wipes its dust patch away — and the first one finds art. */
  _updateReveals(dt) {
    for (let i = 0; i < this.nests.length; i++) {
      const n = this.nests[i];
      if (!n.cleared) {
        let left = 0;
        for (let k = 0; k < n.items.length; k++) if (n.items[k].state !== State.DONE) left++;
        if (left === 0) { n.cleared = true; this._puff(n.patch.x, n.patch.y, 10); }
        continue;
      }
      if (n.revealT >= 1) continue;
      const prev = n.revealT;
      n.revealT = clamp(n.revealT + dt / (n.sticker ? 1.15 : 0.8), 0, 1);
      this._persistFor(n).revealT = n.revealT;
      const R = Math.max(n.patch.rx, n.patch.ry) * 1.25;
      const r0 = prev * R, r1 = n.revealT * R;
      for (let ring = 0; ring < 2; ring++) {
        const rr = r0 + (r1 - r0) * ((ring + 1) / 2);
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * TAU + n.revealT * 2.4 + i;
          this._reveal(n, n.patch.x + Math.cos(a) * rr, n.patch.y + Math.sin(a) * rr * 0.88, 36);
        }
      }
    }
  }

  _reveal(nest, x, y, r) {
    this.floor.reveal(x, y, r);
    if (!nest) return;
    const p = this._persistFor(nest);
    const R = Math.max(nest.patch.rx, nest.patch.ry);
    if (p.reveals.length < 400) {
      p.reveals.push([+((x - nest.patch.x) / R).toFixed(3), +((y - nest.patch.y) / R).toFixed(3), +(r / R).toFixed(3)]);
    }
  }

  onCaptured(d) {
    this._reveal(d.nest, d.x, d.y, d.type === 'bunny' ? 34 : 24);
    if (d.nest) this._persistFor(d.nest).cleared++;
    if (d.ride) {
      d.ride._base = d.ride.size;
      d.ride._baseDur = d.ride.dur;
      this.rides.push(d.ride);
      d.ride = null;
    }
    if (d.type === 'bunny') this._puff(d.x, d.y, 4);
  }

  isComplete() {
    if (this.remaining() !== 0) return false;
    for (let i = 0; i < this.nests.length; i++) if (this.nests[i].revealT < 1) return false;
    return true;
  }

  // -------------------------------------------------------------- draw

  draw(ctx, cam) {
    this.drawFloor(ctx, cam);
    ctx.save();
    cam.apply(ctx);
    this._drawRoom(ctx);
    ctx.restore();

    this.drawDebris(ctx, cam);

    ctx.save();
    cam.apply(ctx);
    for (let i = 0; i < this.props.length; i++) this.props[i].draw(ctx);
    // fluff puffs on top of everything on the floor
    for (let i = 0; i < this.puffs.length; i++) {
      const s = this.puffs[i];
      ctx.globalAlpha = clamp(s.life, 0, 1) * 0.7;
      ctx.fillStyle = 'rgba(206,199,186,0.95)';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawRoom(ctx) {
    const portrait = this.pose === 'portrait';
    if (portrait) {
      const y = this.wall.y;
      const x0 = -this.vw, x1 = this.vw;
      // skirting + wall
      ctx.fillStyle = '#dfe3ea';
      ctx.fillRect(x0, y - this.wall.h, x1 - x0, this.wall.h);
      ctx.fillStyle = '#c3cad6';
      ctx.fillRect(x0, y - 16, x1 - x0, 16);
      this._drawWallArt(ctx, -this.vw * 0.22, y - 160, false);
      // the corridor through the doorway, with the next room's hair in it
      const d = this.door;
      ctx.fillStyle = '#6a6258';
      ctx.fillRect(d.x - d.w / 2, y - d.h, d.w, d.h);
      ctx.fillStyle = '#b9b0a2';
      ctx.fillRect(d.x - d.w / 2, y - d.h * 0.55, d.w, d.h * 0.55);
      this._drawThread(ctx);
      if (!this._glow) {
        const g = ctx.createLinearGradient(0, y - d.h, 0, y + 70);
        g.addColorStop(0, 'rgba(255,232,178,0.55)');
        g.addColorStop(1, 'rgba(255,232,178,0)');
        this._glow = g;
      }
      ctx.fillStyle = this._glow;
      ctx.fillRect(d.x - d.w / 2, y - d.h, d.w, d.h + 70);
      ctx.strokeStyle = '#a9b0bd'; ctx.lineWidth = 9;
      ctx.strokeRect(d.x - d.w / 2, y - d.h, d.w, d.h);
    } else {
      const x = this.wall.x;
      const y0 = -this.vh * 1.25, y1 = this.vh * 1.1;
      ctx.fillStyle = '#dfe3ea';
      ctx.fillRect(x, y0, this.wall.w, y1 - y0);
      ctx.fillStyle = '#c3cad6';
      ctx.fillRect(x, y0, 15, y1 - y0);
      this._drawWallArt(ctx, x + 120, -this.vh * 0.5, true);
      const d = this.door;
      ctx.fillStyle = '#6a6258';
      ctx.fillRect(x + 9, d.y - d.h / 2, d.w, d.h);
      ctx.fillStyle = '#b9b0a2';
      ctx.fillRect(x + 9, d.y - d.h / 2, d.w * 0.5, d.h);
      this._drawThread(ctx);
      if (!this._glow) {
        const g = ctx.createLinearGradient(x - 70, 0, x + d.w + 90, 0);
        g.addColorStop(0, 'rgba(255,232,178,0)');
        g.addColorStop(0.2, 'rgba(255,232,178,0.5)');
        g.addColorStop(1, 'rgba(255,232,178,0)');
        this._glow = g;
      }
      ctx.fillStyle = this._glow;
      ctx.fillRect(x - 70, d.y - d.h / 2, d.w + 170, d.h);
      ctx.strokeStyle = '#a9b0bd'; ctx.lineWidth = 9;
      ctx.strokeRect(x + 9, d.y - d.h / 2, d.w, d.h);
    }
  }

  /** One long hair lying in the corridor: the next scene, with no words. */
  _drawThread(ctx) {
    const p = this.thread;
    if (!p) return;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length - 1; i++) {
      ctx.quadraticCurveTo(p[i].x, p[i].y, (p[i].x + p[i + 1].x) / 2, (p[i].y + p[i + 1].y) / 2);
    }
    ctx.strokeStyle = 'rgba(30,24,18,0.35)'; ctx.lineWidth = 4.2; ctx.stroke();
    ctx.strokeStyle = '#3c3229'; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,245,220,0.5)'; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.restore();
  }

  _drawWallArt(ctx, x, y, side) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#f6f1e4';
    rrect(ctx, -54, -40, 108, 80, 5); ctx.fill();
    ctx.strokeStyle = '#c0b49c'; ctx.lineWidth = 5;
    rrect(ctx, -54, -40, 108, 80, 5); ctx.stroke();
    ctx.fillStyle = '#8fc7e8';
    ctx.beginPath(); ctx.arc(-18, -10, 16, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f2b03c';
    ctx.beginPath(); ctx.moveTo(6, 22); ctx.lineTo(28, -18); ctx.lineTo(48, 22); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  _drawChest(ctx) {
    const c = this.chest;
    if (!c) return;
    const hw = c.w / 2, hh = c.h / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(45,35,25,0.28)';
    ctx.beginPath(); ctx.ellipse(c.x + 6, c.y + hh * 0.9, hw * 1.0, hh * 0.35, 0, 0, TAU); ctx.fill();
    ctx.translate(c.x, c.y);
    ctx.fillStyle = '#8f6a3f';
    rrect(ctx, -hw, -hh, c.w, c.h, 12); ctx.fill();
    ctx.fillStyle = '#a97f4c';
    rrect(ctx, -hw + 7, -hh + 7, c.w - 14, c.h - 26, 9); ctx.fill();
    ctx.strokeStyle = 'rgba(70,48,24,0.6)'; ctx.lineWidth = 3;
    rrect(ctx, -hw, -hh, c.w, c.h, 12); ctx.stroke();
    // lid slats and a couple of toys sticking out of the top
    ctx.strokeStyle = 'rgba(70,48,24,0.35)'; ctx.lineWidth = 2.5;
    for (let i = 1; i < 4; i++) {
      const x = -hw + (c.w * i) / 4;
      ctx.beginPath(); ctx.moveTo(x, -hh + 8); ctx.lineTo(x, hh - 20); ctx.stroke();
    }
    ctx.fillStyle = '#e2685f';
    ctx.beginPath(); ctx.arc(-hw * 0.42, -hh - 12, 20, Math.PI, TAU); ctx.fill();
    ctx.fillStyle = '#5fb4d8';
    rrect(ctx, hw * 0.18, -hh - 26, 34, 30, 5); ctx.fill();
    ctx.fillStyle = '#f4c542';
    ctx.beginPath(); ctx.arc(hw * 0.62, -hh - 9, 15, Math.PI, TAU); ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------------- chain

  exit() { return { to: this.exitCam, dur: 1.6, next: 'thread' }; }

  entry() {
    return this.pose === 'portrait'
      ? { x: 0, y: this.vh * 0.5, zoom: this.scale * 1.03, tilt: 0.28 }
      : { x: -this.vw * 0.48, y: 0, zoom: this.scale * 1.03, tilt: 0.20 };
  }

  snapshot() {
    const s = super.snapshot();
    s.props = this.props.map((p) => p.snapshot());
    s.nests = this.nests.map((n) => ({
      kind: n.prop.kind, cleared: n.cleared, reveal: +n.revealT.toFixed(2),
      hidden: n.items.filter((d) => d.dormant).length,
      left: n.items.filter((d) => d.state !== State.DONE).length,
      moved: Math.round(Math.hypot(n.prop.x - n.prop.home.x, n.prop.y - n.prop.home.y)),
    }));
    return s;
  }
}
