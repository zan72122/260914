import { Scene } from './scene.js';
import { State } from '../debris/base.js';
import { PaperScrap, PaperPlane } from '../debris/paperScrap.js';
import { Prop, resolveProps } from '../props/prop.js';
import { makeRugFloor, paintDoodle, paintFloorHaze } from '../floors/rug.js';
import { TAU, clamp } from '../core/math.js';

/**
 * Scene 3 — paper scraps in a living-room corner.
 *
 * Motion law: light things CATCH THE AIR before they are caught. Edges peel and
 * flutter, the sheet lifts off, and then it is a tug of war between the flow
 * into the mouth and the air spilling out around its sides — so a rushed or
 * side-on approach makes the scrap flip over and skate away, while a slow
 * creep or a held finger pins it, folds it and reels it in.
 *
 * Spatial structure: portrait is a corner receding away from the viewer with a
 * low table in it; landscape is a long bookshelf you sweep along, with one
 * scrap tucked behind a leg. Under everything, a crayon drawing nobody has
 * seen since the paper covered it.
 */
export class PaperScene extends Scene {
  constructor(rng) {
    super('paper', rng);
    this.revealT = 0;
    this.doodle = { x: 0, y: 0, r: 200 };
    this.bits = [];
    this.wheelT = 0;
  }

  _p(nx, ny) { return { x: (nx - 0.5) * this.vw, y: (ny - 0.5) * this.vh }; }

  layout(pose, w, h) {
    super.layout(pose, w, h);
    w = this.vw; h = this.vh;
    this.debris.length = 0;
    this.props.length = 0;
    this.bits.length = 0;
    this.revealT = 0;
    const rng = this.rng;
    const portrait = pose === 'portrait';
    this.rest = { x: 0, y: 0, zoom: this.scale, tilt: portrait ? 0.08 : 0.05 };

    let scraps, confetti, plane;
    if (portrait) {
      this.startPointer = { x: 0.5, y: 0.84 };
      this.floor = makeRugFloor(
        { x0: -w * 0.70, y0: -h * 0.58, x1: w * 1.06, y1: h * 0.70 }, rng,
        { plankW: 92, rug: { x0: -w * 0.70, x1: w * 1.06, y0: h * 0.355, y1: h * 0.70 } });
      this.wallY = -h * 0.365;
      this.corner = { x: -w * 0.20 };          // where the two walls meet
      this.table = { x0: -w * 1.05, y0: -h * 0.358, x1: -w * 0.04, y1: -h * 0.170 };
      this.shelf = null;
      this.doodle = { x: 0, y: h * 0.035, r: w * 0.62, sx: 1 };
      this.toy = { x: w * 0.62, y: h * 0.19, r: w * 0.26 };
      this.bounds = { x0: -w * 0.43, x1: w * 0.43, y0: -h * 0.172, y1: h * 0.29 };
      this.exitCam = { x: w * 0.46, y: h * 0.12, zoom: this.scale, tilt: 0.02 };
      scraps = [
        // two half under the table's shadow: only the fluttering edge shows
        [0.165, 0.338, 'scrap', 'under'],
        [0.330, 0.352, 'tissue', 'under'],
        // scattered up the depth of the corner
        [0.630, 0.395, 'scrap', ''],
        [0.800, 0.460, 'strip', ''],
        [0.300, 0.482, 'scrap', ''],
        [0.545, 0.530, 'tissue', ''],
        [0.175, 0.585, 'scrap', ''],
        [0.735, 0.600, 'scrap', ''],
        [0.415, 0.640, 'strip', ''],
      ];
      confetti = [[0.880, 0.545], [0.235, 0.438], [0.640, 0.700]];
      plane = [0.790, 0.700];
    } else {
      this.startPointer = { x: 0.12, y: 0.84 };
      this.floor = makeRugFloor(
        { x0: -w * 0.62, y0: -h * 0.60, x1: w * 1.14, y1: h * 0.64 }, rng,
        { plankW: 86, horizontal: true, rug: { x0: -w * 0.62, x1: w * 1.14, y0: h * 0.375, y1: h * 0.64 } });
      this.wallY = -h * 0.46;
      this.corner = null;
      this.table = null;
      // a long low bookshelf: its base line is the spine of the whole scene
      this.shelf = { x0: -w * 1.15, y0: -h * 0.46, x1: w * 0.50, y1: -h * 0.185 };
      this.doodle = { x: -w * 0.05, y: h * 0.095, r: h * 0.44, sx: 1.75 };
      this.toy = { x: w * 0.685, y: h * 0.07, r: w * 0.20 };
      this.bounds = { x0: -w * 0.44, x1: w * 0.44, y0: -h * 0.200, y1: h * 0.28 };
      this.exitCam = { x: w * 0.52, y: h * 0.02, zoom: this.scale, tilt: 0.02 };
      scraps = [
        [0.205, 0.338, 'scrap', 'under'],
        [0.445, 0.350, 'tissue', 'under'],
        [0.536, 0.360, 'scrap', 'behind'],   // tucked behind the shelf leg
        [0.300, 0.425, 'scrap', ''],
        [0.400, 0.505, 'strip', ''],
        [0.640, 0.430, 'scrap', ''],
        [0.720, 0.545, 'tissue', ''],
        [0.855, 0.405, 'scrap', ''],
        [0.245, 0.560, 'strip', ''],
      ];
      confetti = [[0.520, 0.612], [0.118, 0.470], [0.815, 0.645]];
      plane = [0.330, 0.720];
    }

    for (let i = 0; i < scraps.length; i++) {
      const [nx, ny, kind, tag] = scraps[i];
      const p = this._p(nx, ny);
      const d = new PaperScrap(p.x, p.y, rng, { kind });
      d.bounds = this.bounds;
      if (tag === 'under') d.under = true;
      this.debris.push(d);
    }
    for (let i = 0; i < confetti.length; i++) {
      const p = this._p(confetti[i][0], confetti[i][1]);
      const d = new PaperScrap(p.x, p.y, rng, { kind: 'confetti' });
      d.bounds = this.bounds;
      this.debris.push(d);
    }
    const pp = this._p(plane[0], plane[1]);
    this.plane = new PaperPlane(pp.x, pp.y, rng, { rot: portrait ? -1.9 : -2.6, L: 80, W: 54 });
    this.plane.bounds = this.bounds;
    this.debris.push(this.plane);

    // the leg you have to go around (landscape); solid, so the head slides off
    if (!portrait) {
      const lp = this._p(0.560, 0.382);
      this.leg = lp;
      this.props.push(new Prop({
        x: lp.x, y: lp.y, shape: 'circle', r: 17, pushable: false, shadow: false,
        draw: () => {},
      }));
    } else {
      this.leg = null;
    }

    // the crayon drawing, and the dusty film that has been hiding it
    paintDoodle(this.floor, this.doodle.x, this.doodle.y, this.doodle.r, rng, this.doodle.sx);
    this.floor.enableGrime();
    paintFloorHaze(this.floor, this.doodle.x, this.doodle.y, this.doodle.r * 1.12, rng, this.doodle.sx);

    this.clearStartZone(195);
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      d.hx = d.x; d.hy = d.y;
    }

    const rev = this.persist.reveals;
    if (rev && rev.length) {
      for (let i = 0; i < rev.length; i++) {
        this.floor.reveal(this.doodle.x + rev[i][0] * this.doodle.r,
                          this.doodle.y + rev[i][1] * this.doodle.r,
                          rev[i][2] * this.doodle.r);
      }
    }
    if (this.persist.revealed) { this.floor.clearGrime(); this.revealT = 1; }
  }

  // ------------------------------------------------------------------ sim

  onCaptured(d) {
    this.floor.reveal(d.x, d.y, 42);
    if (!this.persist.reveals) this.persist.reveals = [];
    if (this.persist.reveals.length < 400) {
      this.persist.reveals.push([
        +((d.x - this.doodle.x) / this.doodle.r).toFixed(3),
        +((d.y - this.doodle.y) / this.doodle.r).toFixed(3),
        +(42 / this.doodle.r).toFixed(3),
      ]);
    }
    // a puff of torn confetti at the mouth
    const col = d.front || d.color || '#f6f3e8';
    for (let i = 0; i < 6; i++) {
      this.bits.push({
        x: d.x, y: d.y,
        vx: this.rng.range(-110, 110), vy: this.rng.range(-110, 110),
        rot: this.rng.range(0, TAU), spin: this.rng.range(-9, 9),
        life: 1, r: this.rng.range(1.8, 3.6), color: col,
      });
    }
  }

  update(dt, ctx) {
    const list = this.debris;
    for (let i = 0; i < list.length; i++) list[i].update(dt, ctx.vacuum, ctx.world);
    if (this.props.length) resolveProps(ctx.vacuum, this.props, dt);

    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.vx *= 0.92; b.vy *= 0.92;
      b.rot += b.spin * dt;
      b.life -= dt * 1.5;
      if (b.life <= 0) this.bits.splice(i, 1);
    }

    // last scrap gone: the dust film lifts and the crayon drawing surfaces
    if (this.remaining() === 0 && this.revealT < 1) {
      const prev = this.revealT;
      this.revealT = clamp(this.revealT + dt / 1.25, 0, 1);
      const r0 = prev * this.doodle.r * 1.25, r1 = this.revealT * this.doodle.r * 1.25;
      for (let ring = 0; ring < 2; ring++) {
        const rr = r0 + (r1 - r0) * ((ring + 1) / 2);
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU + this.revealT * 2.0;
          this.floor.reveal(this.doodle.x + Math.cos(a) * rr * this.doodle.sx,
                            this.doodle.y + Math.sin(a) * rr * 0.86, 44);
        }
      }
      // Floor.draw() skips a cleared grime layer, so this also buys the frame back
      if (this.revealT >= 1) { this.floor.clearGrime(); this.persist.revealed = true; }
    }
    if (this.revealT >= 1) this.wheelT = clamp(this.wheelT + dt / 0.9, 0, 1);
  }

  isComplete() { return this.remaining() === 0 && this.revealT >= 1; }

  // ----------------------------------------------------------------- draw

  draw(ctx, cam) {
    this.drawFloor(ctx, cam);
    ctx.save(); cam.apply(ctx);
    this._drawWalls(ctx);
    ctx.restore();
    this._drawSome(ctx, cam, true);          // the ones half under the furniture
    ctx.save(); cam.apply(ctx);
    if (this.table) this._drawTable(ctx);
    if (this.shelf) this._drawShelf(ctx);
    this._drawToy(ctx);
    ctx.restore();
    this._drawSome(ctx, cam, false);
    ctx.save(); cam.apply(ctx);
    for (let i = 0; i < this.bits.length; i++) {
      const b = this.bits[i];
      ctx.save();
      ctx.globalAlpha = clamp(b.life, 0, 1);
      ctx.translate(b.x, b.y); ctx.rotate(b.rot);
      ctx.fillStyle = b.color;
      ctx.fillRect(-b.r, -b.r * 0.6, b.r * 2, b.r * 1.2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawSome(ctx, cam, under) {
    ctx.save();
    cam.apply(ctx);
    const list = this.debris;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (d.dormant) continue;
      // a piece that has taken off is no longer "under" anything
      const isUnder = !!d.under && d.state !== State.PULLED && d.state !== State.CAPTURED;
      if (isUnder !== under) continue;
      d.draw(ctx, cam);
    }
    ctx.restore();
  }

  _drawWalls(ctx) {
    const w = this.vw, h = this.vh;
    const y = this.wallY;
    const x0 = -w * 1.15, x1 = w * 1.35;
    ctx.fillStyle = '#ded1bb';
    ctx.fillRect(x0, y - 700, x1 - x0, 700);
    // the corner: a second wall plane receding on the left (portrait only)
    if (this.corner) {
      ctx.fillStyle = '#cbbda4';
      ctx.beginPath();
      ctx.moveTo(x0, y - 700);
      ctx.lineTo(this.corner.x, y - 700);
      ctx.lineTo(this.corner.x, y);
      ctx.lineTo(x0, y + 40);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,102,78,0.45)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(this.corner.x, y - 700); ctx.lineTo(this.corner.x, y); ctx.stroke();
    }
    // skirting board + the dark line where the floor meets it
    ctx.fillStyle = '#f0e8db';
    ctx.fillRect(x0, y - 26, x1 - x0, 26);
    ctx.fillStyle = '#b7a68c';
    ctx.fillRect(x0, y - 4, x1 - x0, 6);
    const g = ctx.createLinearGradient(0, y, 0, y + 54);
    g.addColorStop(0, 'rgba(35,24,12,0.34)');
    g.addColorStop(1, 'rgba(35,24,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, y, x1 - x0, 54);
  }

  /** Low table in the corner: its shadow is where the hidden scraps live. */
  _drawTable(ctx) {
    const t = this.table;
    const g = ctx.createLinearGradient(0, t.y1, 0, t.y1 + 78);
    g.addColorStop(0, 'rgba(30,20,10,0.42)');
    g.addColorStop(1, 'rgba(30,20,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(t.x0, t.y1, t.x1 - t.x0, 78);

    ctx.fillStyle = '#8b5e3c';
    ctx.fillRect(t.x0, t.y0, t.x1 - t.x0, t.y1 - t.y0);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(t.x0, t.y0, t.x1 - t.x0, 22);
    ctx.strokeStyle = 'rgba(70,42,20,0.5)';
    ctx.lineWidth = 2;
    for (let x = t.x0 + 60; x < t.x1; x += 78) {
      ctx.beginPath(); ctx.moveTo(x, t.y0); ctx.lineTo(x, t.y1); ctx.stroke();
    }
    // thick near edge, then a stubby leg at the visible corner
    ctx.fillStyle = '#a9713f';
    ctx.fillRect(t.x0, t.y1 - 16, t.x1 - t.x0, 16);
    ctx.fillStyle = '#6e4524';
    ctx.fillRect(t.x1 - 34, t.y1 - 2, 22, 34);
    ctx.fillStyle = '#8b5e3c';
    ctx.fillRect(t.x1 - 34, t.y1 - 2, 9, 34);
  }

  /** Long low bookshelf; one leg is solid, so a scrap hides behind it. */
  _drawShelf(ctx) {
    const s = this.shelf;
    const g = ctx.createLinearGradient(0, s.y1, 0, s.y1 + 74);
    g.addColorStop(0, 'rgba(30,20,10,0.42)');
    g.addColorStop(1, 'rgba(30,20,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(s.x0, s.y1, s.x1 - s.x0, 74);

    ctx.fillStyle = '#7f5637';
    ctx.fillRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
    // book spines standing in the shelf: colour along the top of the frame
    const cols = ['#c8563f', '#e0a63c', '#4b8f6a', '#3f6fa8', '#a9558f', '#d6cbb0'];
    let x = s.x0 + 14;
    let i = 0;
    const bh = (s.y1 - s.y0) * 0.60;
    while (x < s.x1 - 20) {
      const bw = 15 + ((i * 37) % 17);
      ctx.fillStyle = cols[i % cols.length];
      ctx.fillRect(x, s.y1 - bh - 20, bw, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(x, s.y1 - bh - 20, bw * 0.34, bh);
      x += bw + 3; i++;
    }
    ctx.fillStyle = '#9d6b43';
    ctx.fillRect(s.x0, s.y1 - 20, s.x1 - s.x0, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(s.x0, s.y1 - 20, s.x1 - s.x0, 5);
    // the legs
    if (this.leg) {
      ctx.fillStyle = 'rgba(38,24,12,0.34)';
      ctx.beginPath(); ctx.ellipse(this.leg.x + 7, s.y1 + 40, 27, 9, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5c3a1f';
      ctx.fillRect(this.leg.x - 21, s.y1 - 6, 42, 46);
      ctx.fillStyle = '#7f5637';
      ctx.fillRect(this.leg.x - 21, s.y1 - 6, 15, 46);
      ctx.fillStyle = '#42280f';
      ctx.fillRect(this.leg.x - 21, s.y1 + 36, 42, 5);
    }
    ctx.fillStyle = '#5c3a1f';
    ctx.fillRect(s.x0 + 24, s.y1 - 4, 30, 28);
  }

  /**
   * The next scene poking in at the edge: one big wheel of a ride-on toy.
   * It is the only round, saturated thing in the room, so the eye goes to it
   * the moment the camera starts to pan.
   */
  _drawToy(ctx) {
    const t = this.toy;
    const r = t.r;
    const bob = Math.sin(this.wheelT * 4) * this.wheelT * 3;
    ctx.save();
    ctx.translate(t.x, t.y + bob);
    ctx.fillStyle = 'rgba(30,20,10,0.28)';
    ctx.beginPath(); ctx.ellipse(6, r * 0.42, r * 0.95, r * 0.34, 0, 0, TAU); ctx.fill();
    // body edge sliding in behind the wheel
    ctx.fillStyle = '#f2b937';
    ctx.beginPath();
    ctx.moveTo(r * 0.1, -r * 1.05);
    ctx.lineTo(r * 2.2, -r * 1.05);
    ctx.lineTo(r * 2.2, r * 0.55);
    ctx.quadraticCurveTo(r * 0.8, r * 0.75, r * 0.1, r * 0.35);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(r * 0.2, -r * 0.95, r * 1.9, r * 0.22);
    // tyre
    ctx.fillStyle = '#c0392b';
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.96, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8f281d';
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.78, r * 0.75, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f5efe2';
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.46, r * 0.44, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#c9c0ac'; ctx.lineWidth = r * 0.075;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.4 + this.wheelT * 0.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.40);
      ctx.stroke();
    }
    ctx.fillStyle = '#7e8898';
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.15, r * 0.14, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  exit() { return { to: this.exitCam, dur: 1.5, next: 'toy' }; }

  entry() {
    const p = this.pose === 'portrait';
    return p
      ? { x: this.rest.x, y: this.rest.y + this.vh * 0.5, zoom: this.scale * 1.02, tilt: 0.26 }
      : { x: this.rest.x - this.vw * 0.48, y: this.rest.y, zoom: this.scale * 1.02, tilt: 0.2 };
  }
}
