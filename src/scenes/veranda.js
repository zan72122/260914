import { Scene } from './scene.js';
import { State } from '../debris/base.js';
import { DryLeaf, WetLeaf, Twig, SeedPod, LeafPile } from '../debris/leaf.js';
import { Airborne } from '../core/airborne.js';
import { resolveProps } from '../props/prop.js';
import { makePlantPot, makeWateringCan } from '../props/veranda.js';
import { makeVerandaFloor, paintTilePattern, paintGrate, paintLitter } from '../floors/veranda.js';
import { TAU, clamp, smoothstep, noise1 } from '../core/math.js';

/**
 * Room — the veranda: fallen leaves on the balcony.
 *
 * Motion law: leaves are BRITTLE, and the mouth is where that matters. A dry
 * leaf skitters in and then does not fit through the intake: it presses flat
 * against it, cracks along its veins and bursts into fragments that race up the
 * tube. A heap of them comes apart from the top down, and a charging head blows
 * the top layer away instead of taking it. The damp ones at the bottom are
 * glued to the tile and only a held nozzle peels them off.
 *
 * Spatial structure: portrait is a balcony receding to the railing with the sky
 * beyond and the house door at the near end; landscape is a long balcony run
 * along the railing with the door at the far right. Under the litter, a painted
 * tile pattern and the drain grate.
 */
export class VerandaScene extends Scene {
  constructor(rng) {
    super('veranda', rng);
    this.air = new Airborne(200, {
      kinds: {
        // smaller and browner than the core default: these are dry flakes, and
        // a hundred of them must not fill the cup on their own
        leaf: { color: '#b0712c', drag: 2.3, gravity: 220, r: 3.0, life: 2.2, lift: 0.85 },
        dust: { color: '#b9a582', drag: 3.4, gravity: 120, r: 2.0, life: 1.4, lift: 1.0 },
      },
    });
    this.env = {
      air: this.air,
      breeze: { x: 0, y: 0, gust: 0 },
      onCrumble: (leaf, n) => this._onCrumble(leaf, n),
      onPeel: (leaf) => this._onPeel(leaf),
    };
    this.sweepT = 0;
    this.sky = 0;             // 0..1 how bright the sky beyond the railing is
    this.breezeT = 0;
    this.crunch = 0;          // the "zazaa" of a burst, decaying
    this._ctx = null;
  }

  _p(nx, ny) { return { x: (nx - 0.5) * this.vw, y: (ny - 0.5) * this.vh }; }

  // ---------------------------------------------------------------- layout

  layout(pose, w, h) {
    super.layout(pose, w, h);
    const vw = this.vw, vh = this.vh;
    this.debris.length = 0;
    this.props.length = 0;
    this.air.reset();
    this.sweepT = 0; this.sky = 0;
    this._glassG = null; this._spillG = null;
    const rng = this.rng;
    const portrait = pose === 'portrait';
    this.rest = { x: 0, y: 0, zoom: this.scale, tilt: portrait ? 0.16 : 0.07 };

    let rect, dryAt, pileAt, wetAt, twigAt, podAt, potAt, canAt, grate, pattern;
    if (portrait) {
      // DEPTH: the deck runs away from the viewer to the railing; the house is
      // at the near end, and the door is what the camera walks back into.
      this.startPointer = { x: 0.5, y: 0.86 };
      this.railY = -vh * 0.34;
      this.railH = 92;
      this.wallY = vh * 0.33;
      this.wallX = null;
      this.door = { x: -vw * 0.06, w: Math.min(230, vw * 0.62), axis: 'y' };
      rect = { x0: -vw * 0.75, y0: -vh * 0.80, x1: vw * 0.75, y1: vh * 0.75 };
      this.bounds = { x0: -vw * 0.42, x1: vw * 0.42, y0: this.railY + 30, y1: this.wallY - 34 };
      grate = { x: vw * 0.26, y: vh * 0.045, w: 118, h: 62, horizontal: false };
      pattern = { x: 0, y: vh * 0.02, w: vw * 0.92, h: vh * 0.48 };
      pileAt = this._p(0.34, 0.345);
      dryAt = [[0.70, 0.295], [0.20, 0.520], [0.78, 0.470], [0.44, 0.625]];
      wetAt = [[0.755, 0.560], [0.415, 0.470]];
      twigAt = [[0.60, 0.395, -0.35], [0.24, 0.235, 1.15]];
      podAt = [[0.845, 0.640], [0.135, 0.400]];
      potAt = this._p(0.145, 0.295);
      canAt = this._p(0.845, 0.215);
      this.exitCam = { x: this.door.x, y: vh * 0.30, zoom: this.scale * 1.07, tilt: 0.30 };
    } else {
      // WIDTH: a long run along the railing, with the house at the right-hand
      // end — the door is a wall you drive toward, not a strip at your feet.
      this.startPointer = { x: 0.14, y: 0.84 };
      this.railY = -vh * 0.30;
      this.railH = 54;
      this.wallY = null;
      this.wallX = vw * 0.40;
      this.door = { x: vw * 0.40, w: Math.min(190, vh * 0.52), axis: 'x' };
      rect = { x0: -vw * 0.80, y0: -vh * 0.95, x1: vw * 0.80, y1: vh * 0.90 };
      this.bounds = { x0: -vw * 0.44, x1: this.wallX - 52, y0: this.railY + 30, y1: vh * 0.40 };
      grate = { x: -vw * 0.28, y: vh * 0.20, w: 150, h: 54, horizontal: true };
      pattern = { x: -vw * 0.06, y: vh * 0.06, w: vw * 0.84, h: vh * 0.60 };
      pileAt = this._p(0.375, 0.500);
      dryAt = [[0.255, 0.330], [0.560, 0.330], [0.640, 0.610], [0.205, 0.690]];
      wetAt = [[0.330, 0.690], [0.585, 0.455]];
      twigAt = [[0.470, 0.660, 0.25], [0.690, 0.300, -1.35]];
      podAt = [[0.720, 0.690], [0.145, 0.470]];
      potAt = this._p(0.065, 0.330);
      canAt = this._p(0.800, 0.240);
      this.exitCam = { x: this.wallX * 0.72, y: vh * 0.04, zoom: this.scale * 1.06, tilt: 0.12 };
    }
    this.grate = grate;
    this.pattern = pattern;

    // ---- the deck, the pattern under the litter, the grate ---------------
    this.floor = makeVerandaFloor(rect, rng, { tile: 92 });
    paintTilePattern(this.floor, pattern.x, pattern.y, pattern.w, pattern.h, 92);
    paintGrate(this.floor, grate.x, grate.y, grate.w, grate.h, grate.horizontal);
    this._bakeSet(rect, portrait);
    paintLitter(this.floor, pattern.x, pattern.y, pattern.w * 0.58, pattern.h * 0.60, rng,
      [{ x: pileAt.x, y: pileAt.y, r: 80 }, { x: grate.x, y: grate.y, r: 64 }],
      { x0: rect.x0, y0: this.railY + 18,
        x1: portrait ? rect.x1 : this.wallX - 6, y1: portrait ? this.wallY - 4 : rect.y1 });

    // ---- the heap --------------------------------------------------------
    const pile = new LeafPile(pileAt.x, pileAt.y);
    this.pile = pile;
    // bottom layer: damp, and it stays when the top is blown off
    for (let i = 0; i < 2; i++) {
      const a = rng.range(0, TAU);
      const wl = new WetLeaf(pileAt.x + Math.cos(a) * 24, pileAt.y + Math.sin(a) * 15, rng);
      wl.env = this.env; wl.bounds = this.bounds;
      this.debris.push(wl);
    }
    for (let layer = 0; layer < 3; layer++) {
      const n = layer === 0 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + layer * 0.9;
        const r = 30 - layer * 8;
        const d = new DryLeaf(pileAt.x + Math.cos(a) * r + rng.range(-7, 7),
          pileAt.y + Math.sin(a) * r * 0.66 + rng.range(-5, 5) - layer * 3, rng,
          { loose: layer === 2 ? 1 : 0.3 });
        d.env = this.env; d.bounds = this.bounds;
        pile.add(d, layer);
        this.debris.push(d);
      }
    }

    // ---- everything loose on the deck ------------------------------------
    for (let i = 0; i < dryAt.length; i++) {
      const p = this._p(dryAt[i][0], dryAt[i][1]);
      const d = new DryLeaf(p.x, p.y, rng, { loose: 0.75 });
      d.env = this.env; d.bounds = this.bounds;
      this.debris.push(d);
    }
    for (let i = 0; i < wetAt.length; i++) {
      const p = this._p(wetAt[i][0], wetAt[i][1]);
      const d = new WetLeaf(p.x, p.y, rng);
      d.env = this.env; d.bounds = this.bounds;
      this.debris.push(d);
    }
    for (let i = 0; i < twigAt.length; i++) {
      const p = this._p(twigAt[i][0], twigAt[i][1]);
      const d = new Twig(p.x, p.y, rng, { rot: twigAt[i][2] });
      d.bounds = this.bounds;
      this.debris.push(d);
    }
    for (let i = 0; i < podAt.length; i++) {
      const p = this._p(podAt[i][0], podAt[i][1]);
      const d = new SeedPod(p.x, p.y, rng);
      d.bounds = this.bounds;
      this.debris.push(d);
    }

    // ---- the two things to go around -------------------------------------
    this.pot = makePlantPot(potAt.x, potAt.y, { r: 36 });
    this.can = makeWateringCan(canAt.x, canAt.y, { flip: !portrait });
    this.props.push(this.pot, this.can);

    // nothing may sit where the head cannot follow it
    const R = this.reachRect({ x0: 0, y0: 0, x1: 0, y1: 0 }, 26);
    // ...and nothing may be BLOWN there either. `bounds` is the deck a leaf is
    // allowed to slide around on, and every loose piece holds this same object,
    // so clipping it to the reachable rectangle here fixes them all at once.
    // Without this, the side gust piles leaves against the house wall at
    // bounds.x1, which on a landscape phone is past the far end of the mouth's
    // travel: half a dozen leaves the child can see and can never have.
    this.bounds.x0 = Math.max(this.bounds.x0, R.x0);
    this.bounds.x1 = Math.min(this.bounds.x1, R.x1);
    this.bounds.y0 = Math.max(this.bounds.y0, R.y0);
    this.bounds.y1 = Math.min(this.bounds.y1, R.y1);
    const a = { x: 0, y: 0 };
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      d.aim(a);
      const nx = clamp(a.x, R.x0, R.x1), ny = clamp(a.y, R.y0, R.y1);
      if (nx !== a.x || ny !== a.y) d.translate(nx - a.x, ny - a.y);
      // and never inside a solid prop
      for (let k = 0; k < this.props.length; k++) {
        const p = this.props[k];
        const rr = p.shape === 'circle' ? p.r + 26 : Math.max(p.w, p.h) * 0.5 + 24;
        let dx = d.x - p.x, dy = d.y - p.y;
        const l = Math.hypot(dx, dy);
        if (l < rr) {
          if (l < 1e-3) { dx = 0; dy = 1; }
          d.translate((dx / (l || 1)) * (rr - l), (dy / (l || 1)) * (rr - l));
        }
      }
    }
    pile.settle();

    this.clearStartZone(200);
    // The default corner scoring works off reachRect, which here includes the
    // sky above the railing — a bin standing on the parapet. Put it down on the
    // DECK instead, by the door the child comes in at, clear of the props.
    this.placeBin(portrait
      ? { x: vw * 0.36, y: this.bounds.y1 - 30 }
      : { x: -vw * 0.08, y: this.bounds.y1 - 18 });
    for (let i = 0; i < this.debris.length; i++) { this.debris[i].hx = this.debris[i].x; this.debris[i].hy = this.debris[i].y; }

    // ---- progress kept across an orientation change ----------------------
    const rev = this.persist.reveals;
    if (rev && rev.length) {
      for (let i = 0; i < rev.length; i++) {
        this.floor.reveal(pattern.x + rev[i][0] * pattern.w, pattern.y + rev[i][1] * pattern.h, rev[i][2] * 100);
      }
    }
    if (this.persist.swept) { this.floor.clearGrime(); this.sweepT = 1; this.sky = 1; }
  }

  /**
   * The set that never moves — sky, railing, the house wall, the door and the
   * mat — baked into the floor's opaque blit instead of being a screenful of
   * gradients every frame.
   */
  _bakeSet(rect, portrait) {
    const g = this.floor.growBase({
      x0: rect.x0 - 60, y0: rect.y0 - 420, x1: rect.x1 + 60, y1: rect.y1 + 320,
    });
    const x0 = rect.x0 - 60, x1 = rect.x1 + 60;
    const rail = this.railY;

    // sky beyond the railing
    const sg = g.createLinearGradient(0, rail - 420, 0, rail + 10);
    sg.addColorStop(0, '#8fc4e8');
    sg.addColorStop(0.55, '#bcdcf0');
    sg.addColorStop(1, '#e6f1f2');
    g.fillStyle = sg;
    g.fillRect(x0, rail - 420, x1 - x0, 430);
    // far rooftops, so "outside" reads as a place and not a blue wall
    g.fillStyle = 'rgba(150,164,176,0.55)';
    for (let i = 0; i < 9; i++) {
      const bx = x0 + (i / 9) * (x1 - x0) + 20;
      const bh = 40 + ((i * 53) % 60);
      g.fillRect(bx, rail - 26 - bh, 92, bh);
    }
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.ellipse(x0 + (x1 - x0) * 0.72, rail - 300, 120, 34, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(x0 + (x1 - x0) * 0.28, rail - 355, 90, 26, 0, 0, TAU); g.fill();

    // the parapet and the railing on top of it
    g.fillStyle = '#c3bcae';
    g.fillRect(x0, rail - 26, x1 - x0, 44);
    g.fillStyle = '#d6d0c2';
    g.fillRect(x0, rail - 26, x1 - x0, 9);
    g.fillStyle = 'rgba(80,72,58,0.35)';
    g.fillRect(x0, rail + 16, x1 - x0, 6);
    const rh = this.railH;
    g.strokeStyle = '#8a8d90';
    g.lineWidth = 7;
    g.beginPath(); g.moveTo(x0, rail - rh); g.lineTo(x1, rail - rh); g.stroke();
    g.lineWidth = 5;
    for (let x = x0 + 26; x < x1; x += 46) {
      g.beginPath(); g.moveTo(x, rail - rh); g.lineTo(x, rail - 26); g.stroke();
    }
    // the shadow the parapet throws onto the deck
    const dg = g.createLinearGradient(0, rail + 18, 0, rail + 96);
    dg.addColorStop(0, 'rgba(48,40,24,0.30)');
    dg.addColorStop(1, 'rgba(48,40,24,0)');
    g.fillStyle = dg;
    g.fillRect(x0, rail + 18, x1 - x0, 96);

    // the doormat, lying on the deck in front of whichever wall the door is in
    const D = this.door;
    const mx = portrait ? D.x : this.wallX - 46;
    const my = portrait ? this.wallY - 46 : 0;
    g.save();
    g.translate(mx, my);
    if (!portrait) g.rotate(Math.PI / 2);
    g.fillStyle = '#7c6a50';
    g.fillRect(-D.w * 0.44, -28, D.w * 0.88, 56);
    g.fillStyle = '#8d7a5d';
    g.fillRect(-D.w * 0.44 + 5, -23, D.w * 0.88 - 10, 46);
    g.strokeStyle = 'rgba(60,50,36,0.5)';
    g.lineWidth = 2;
    for (let i = -D.w * 0.40; i < D.w * 0.40; i += 9) {
      g.beginPath(); g.moveTo(i, -22); g.lineTo(i, 22); g.stroke();
    }
    g.restore();
    g.restore();
  }

  // ---------------------------------------------------------------- update

  update(dt, ctx) {
    this._ctx = ctx;
    const vac = ctx.vacuum;
    this.breezeT += dt;

    // A world breeze, not the machine: one slow shared direction with an
    // occasional gust. Small enough that a leaf only sways; the suction makes
    // them curl, skitter and crack, which nothing else in the room does.
    const gust = smoothstep(0.30, 1.0, 0.5 + 0.5 * Math.sin(this.breezeT * 0.55) * Math.sin(this.breezeT * 0.21 + 1.1));
    this.env.breeze.x = (0.30 + 2.4 * gust) * (0.7 + 0.3 * Math.sin(this.breezeT * 0.6));
    this.env.breeze.y = (0.18 + 0.8 * gust) * Math.sin(this.breezeT * 0.37 + 1.3);
    this.env.breeze.gust = gust;

    const list = this.debris;
    for (let i = 0; i < list.length; i++) list[i].update(dt, vac, ctx.world);
    this.air.update(dt, vac);
    resolveProps(vac, this.props, dt);

    this.crunch = Math.max(0, this.crunch - dt * 2.4);
    if (ctx.audio) ctx.audio.setStream(clamp(this.crunch, 0, 1));

    // ---- the room is clear: the light comes round -------------------------
    if (this.remaining() === 0 && this.sweepT < 1) {
      const prev = this.sweepT;
      this.sweepT = clamp(this.sweepT + dt / 1.45, 0, 1);
      // the litter lifts along the sweep, so the pattern and the grate surface
      const p = this.pattern;
      const y0 = p.y - p.h * 0.5, y1 = p.y + p.h * 0.5;
      for (let ring = 0; ring < 2; ring++) {
        const u = prev + (this.sweepT - prev) * ((ring + 1) / 2);
        const yy = y0 + (y1 - y0) * u;
        for (let i = 0; i < 10; i++) {
          this.floor.reveal(p.x - p.w * 0.5 + (i / 9) * p.w, yy + Math.sin(i * 1.7) * 26, 76);
        }
      }
      if (this.sweepT >= 1) { this.floor.clearGrime(); this.persist.swept = true; }
    }
    this.sky += (this.remaining() === 0 ? 1 - this.sky : -this.sky) * (1 - Math.exp(-1.6 * dt));
  }

  onCaptured(d) {
    this.floor.reveal(d.x, d.y, d.type === 'wetleaf' ? 54 : 44);
    if (!this.persist.reveals) this.persist.reveals = [];
    const p = this.pattern;
    if (this.persist.reveals.length < 400) {
      this.persist.reveals.push([
        +((d.x - p.x) / p.w).toFixed(3), +((d.y - p.y) / p.h).toFixed(3), 0.46,
      ]);
    }
    if (this.pile) this.pile.settle();
  }

  /** A leaf just cracked apart at the intake. */
  _onCrumble(leaf, n) {
    this.crunch = 1;
    const ctx = this._ctx;
    if (ctx) {
      if (ctx.camera) ctx.camera.kick(3.2);
      if (ctx.audio) { ctx.audio.pop('pop', 0.9); ctx.audio.pop('tick', 0.8); }
    }
    // a puff of dust off the tile where it was standing
    for (let i = 0; i < 3; i++) {
      this.air.spawn(leaf.x + this.rng.range(-12, 12), leaf.y + this.rng.range(-10, 10),
        this.rng.range(2, 8), this.rng.range(-60, 60), this.rng.range(-60, 60), this.rng.range(20, 70), 'dust');
    }
  }

  _onPeel(leaf) {
    const ctx = this._ctx;
    if (ctx && ctx.camera) ctx.camera.kick(1.6);
  }

  isComplete() { return this.remaining() === 0 && this.sweepT >= 1; }

  devFinish() {
    for (let i = 0; i < this.debris.length; i++) this.debris[i].state = State.DONE;
    this.sweepT = 1; this.sky = 1;
    this.floor.clearGrime();
    this.persist.swept = true;
  }

  // ------------------------------------------------------------------ draw

  draw(ctx, cam) {
    this.drawFloor(ctx, cam);
    ctx.save();
    cam.apply(ctx);
    if (this.sky > 0.01) this._drawSkyGlow(ctx);
    ctx.restore();

    this.drawDebris(ctx, cam);

    ctx.save();
    cam.apply(ctx);
    this.air.draw(ctx, cam);
    for (let i = 0; i < this.props.length; i++) this.props[i].draw(ctx);
    ctx.restore();
  }

  /** The house wall and the door: nearest thing to the viewer, drawn last. */
  drawOver(ctx, cam) {
    ctx.save();
    cam.apply(ctx);
    this._drawHouse(ctx);
    if (this.sweepT > 0 && this.sweepT < 1) this._drawSweep(ctx);
    ctx.restore();
  }

  _drawSkyGlow(ctx) {
    const v = this.vw, rail = this.railY;
    ctx.save();
    ctx.globalAlpha = 0.34 * this.sky;
    ctx.fillStyle = '#fff3cd';
    ctx.fillRect(-v * 1.2, rail - 420, v * 2.4, 430);
    ctx.globalAlpha = 0.28 * this.sky;
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(-v * 1.2, rail + 10, v * 2.4, 120);
    ctx.restore();
  }

  /** A band of sunlight running down the deck as the last leaf goes. */
  _drawSweep(ctx) {
    const p = this.pattern;
    const u = this.sweepT;
    const y = p.y - p.h * 0.55 + p.h * 1.1 * u;
    ctx.save();
    ctx.globalAlpha = 0.42 * Math.sin(u * Math.PI);
    ctx.fillStyle = '#fff4cd';
    ctx.fillRect(p.x - p.w * 0.62, y - 44, p.w * 1.24, 88);
    ctx.globalAlpha = 0.7 * Math.sin(u * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(p.x - p.w * 0.62, y - 6, p.w * 1.24, 8);
    ctx.restore();
  }

  /**
   * The house: the wall the balcony belongs to, with the sliding door in it.
   * Portrait puts it across the near end of the deck; landscape stands it at
   * the right-hand end of the run, so the door is something you drive TOWARD.
   * Either way it is drawn after the machine, because it is the nearest thing
   * in the room.
   */
  _drawHouse(ctx) {
    const vw = this.vw, vh = this.vh;
    const d = this.door;
    ctx.save();
    if (this.wallX === null) {
      ctx.translate(0, this.wallY);
    } else {
      // the same wall, turned a quarter: +x becomes "into the house"
      ctx.translate(this.wallX, 0);
      ctx.rotate(-Math.PI / 2);
    }
    const span = (this.wallX === null ? vw : vh) * 1.3;
    const deep = (this.wallX === null ? vh : vw) * 1.2;
    const dx = this.wallX === null ? d.x : 0;

    ctx.fillStyle = '#efe6d6';
    ctx.fillRect(-span, 0, span * 2, deep);
    ctx.fillStyle = '#ded2bd';
    ctx.fillRect(-span, 0, span * 2, 12);
    ctx.fillStyle = 'rgba(70,58,38,0.22)';
    ctx.fillRect(-span, -12, span * 2, 12);

    // a heavy dark frame, two panes of glass with the warm inside behind them,
    // and a handle
    const w = d.w, hh = (this.wallX === null ? vh : vw) * 0.5;
    ctx.fillStyle = '#3f3122';
    ctx.fillRect(dx - w / 2 - 20, -16, w + 40, hh);
    ctx.fillStyle = '#6b5740';
    ctx.fillRect(dx - w / 2 - 20, -16, w + 40, 12);
    // both gradients are built ONCE and kept: a createLinearGradient in a draw
    // loop is a fresh raster every frame
    if (!this._glassG) {
      this._glassG = ctx.createLinearGradient(0, 0, 0, hh * 0.75);
      this._glassG.addColorStop(0, '#f8e3b4');
      this._glassG.addColorStop(1, '#cfae76');
      this._spillG = ctx.createLinearGradient(0, -78, 0, 8);
      this._spillG.addColorStop(0, 'rgba(255,232,170,0)');
      this._spillG.addColorStop(1, 'rgba(255,232,170,1)');
    }
    const g = this._glassG;
    for (let i = 0; i < 2; i++) {
      const px = dx - w / 2 + 8 + i * (w / 2);
      ctx.fillStyle = g;
      ctx.fillRect(px, 2, w / 2 - 16, hh - 26);
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      ctx.beginPath();
      ctx.moveTo(px + 6, 4);
      ctx.lineTo(px + w * 0.16, 4);
      ctx.lineTo(px + w * 0.06, hh - 26);
      ctx.lineTo(px + 6, hh - 26);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#3f3122';
    ctx.fillRect(dx - 7, -8, 14, hh);
    ctx.fillStyle = '#7d6748';
    ctx.fillRect(dx - w / 2 - 20, hh - 26, w + 40, 12);
    ctx.fillStyle = '#c9c3b4';
    ctx.fillRect(dx + 12, 30, 7, 46);
    // the threshold and the step down onto the deck
    ctx.fillStyle = '#9a8a70';
    ctx.fillRect(dx - w / 2 - 20, -22, w + 40, 9);
    ctx.fillStyle = 'rgba(60,48,30,0.35)';
    ctx.fillRect(dx - w / 2 - 20, -13, w + 40, 4);
    // the light the doorway spills back onto the deck, warmer once it is clean
    ctx.globalAlpha = 0.22 + 0.3 * this.sky;
    ctx.fillStyle = this._spillG;
    ctx.fillRect(dx - w * 0.95, -78, w * 1.9, 86);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  exit() { return { to: this.exitCam, dur: 1.5, next: 'hall' }; }

  entry() {
    return this.pose === 'portrait'
      ? { x: 0, y: this.vh * 0.16, zoom: this.scale * 0.94, tilt: 0.30 }
      : { x: this.vw * 0.22, y: this.vh * 0.04, zoom: this.scale * 0.95, tilt: 0.16 };
  }

  snapshot() {
    const s = super.snapshot();
    s.air = this.air.snapshot();
    s.sweep = +this.sweepT.toFixed(2);
    s.breeze = +this.env.breeze.x.toFixed(2);
    return s;
  }
}
