import { Scene } from './scene.js';
import { State } from '../debris/base.js';
import { DustBunny } from '../debris/dustBunny.js';
import { Crumb } from '../debris/crumb.js';
import { CarpetFloor } from '../floors/carpet.js';
import { BuriedItem } from '../debris/buriedItem.js';
import { GlitterPatch, BeadPile } from '../debris/glitter.js';
import { Prop, resolveProps } from '../props/prop.js';
import { Bin } from '../props/bin.js';
import { TAU, clamp, lerp, smoothstep } from '../core/math.js';

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };

const CLEAN = 0.58;          // fraction of the rug that must be combed
const COMB_R = 36;           // brush-roll footprint, design px

/**
 * Scene 8 (last) — the deep-pile rug.
 *
 * New floor physics: the pile itself. It bends toward the mouth (that is the
 * airflow, visible at last as a whole field), it HOLDS things down so suction
 * alone achieves nothing, and it only gives them up to the brush roll — rubbing
 * the head back and forth (vac.scrub) spins the roller, leaves a combed stripe
 * that shows the rug's true colours, and kicks the buried things to the surface
 * where they finally react to the air.
 *
 * Progress needs no counter: the rug is dull grey until it is combed, and the
 * pattern comes up out of it wherever the roller has been.
 *
 * Ending: the whole game ends here. The camera settles on the vacuum, the dust
 * cup — full of everything the child collected — is emptied into a bin in one
 * long "zazaa", the lid claps shut, the cup is clear again, and the world fades
 * back to the first room so it can all start over.
 */
export class CarpetScene extends Scene {
  constructor(rng) {
    super('carpet', rng);
    this.roll = 0;           // brush-roll angle
    this.rollSpin = 0;
    this.flecks = [];
    this.fin = null;
    this.combFrac = 0;
    this._lastM = { x: 0, y: 0, has: false };
    this._sparkles = [];
  }

  _p(nx, ny) { return { x: (nx - 0.5) * this.vw, y: (ny - 0.5) * this.vh }; }

  // --------------------------------------------------------------- layout

  layout(pose, w, h) {
    super.layout(pose, w, h);
    w = this.vw; h = this.vh;
    const rng = this.rng;
    this.debris.length = 0;
    this.props.length = 0;
    this.flecks.length = 0;
    this._sparkles.length = 0;
    this.fin = null;
    this._lastM.has = false;
    const portrait = pose === 'portrait';

    let rug, rect, opts;
    if (portrait) {
      this.startPointer = { x: 0.5, y: 0.80 };
      this.rest = { x: 0, y: 0, zoom: this.scale, tilt: 0.13 };
      rug = { x0: -w * 0.40, y0: -h * 0.46, x1: w * 0.40, y1: h * 0.40 };
      rect = { x0: -w * 0.62, y0: -h * 0.64, x1: w * 0.62, y1: h * 0.66 };
      opts = { along: 'y' };
    } else {
      this.startPointer = { x: 0.24, y: 0.80 };
      this.rest = { x: 0, y: 0, zoom: this.scale, tilt: 0.06 };
      rug = { x0: -w * 0.455, y0: -h * 0.34, x1: w * 0.455, y1: h * 0.42 };
      rect = { x0: -w * 0.56, y0: -h * 0.70, x1: w * 0.56, y1: h * 0.72 };
      opts = { along: 'x' };
    }
    this.rug = rug;
    this.floor = new CarpetFloor(rect, rug, rng, opts);
    if (this.persist.comb) this.floor.restore(this.persist.comb);
    this.combFrac = this.floor.progress;

    // ---- the coffee table (landscape only): glass top, solid legs --------
    this.table = null;
    if (!portrait) {
      const t = { x: w * 0.13, y: -h * 0.02, w: w * 0.30, h: h * 0.34 };
      this.table = t;
      const lx = t.w * 0.5 - 16, ly = t.h * 0.5 - 14;
      for (let i = 0; i < 4; i++) {
        const sx = i & 1 ? 1 : -1, sy = i & 2 ? 1 : -1;
        this.props.push(new Prop({
          x: t.x + sx * lx, y: t.y + sy * ly, shape: 'circle', r: 13,
          pushable: false, shadow: false, draw: () => {},
        }));
      }
    }

    // ---- what is buried in the pile -------------------------------------
    const B = (nx, ny, inner, o) => {
      const p = this._p(nx, ny);
      inner.x = p.x; inner.y = p.y; inner.hx = p.x; inner.hy = p.y;
      if (inner.bits) for (const b of inner.bits) { b.x += p.x - o.ox; b.y += p.y - o.oy; b.hx = b.x; b.hy = b.y; }
      if (inner.beads) for (const b of inner.beads) { b.x += p.x - o.ox; b.y += p.y - o.oy; b.hx = b.x; b.hy = b.y; }
      const it = new BuriedItem(inner, { rng, color: o.color, color2: o.color2, size: o.size, rate: o.rate });
      this.debris.push(it);
      return it;
    };

    const spots = portrait
      ? { glitter: [0.50, 0.30], hair1: [0.30, 0.20], hair2: [0.68, 0.55], crumb1: [0.34, 0.545], crumb2: [0.63, 0.135], beads: [0.44, 0.665], surf1: [0.66, 0.375], surf2: [0.325, 0.435] }
      : { glitter: [0.40, 0.42], hair1: [0.155, 0.28], hair2: [0.72, 0.60], crumb1: [0.30, 0.66], crumb2: [0.615, 0.28], beads: [0.855, 0.50], surf1: [0.50, 0.63], surf2: [0.80, 0.30] };

    const mk = (key, make, o) => {
      const s = spots[key];
      const p = this._p(s[0], s[1]);
      const inner = make(p.x, p.y);
      return B(s[0], s[1], inner, Object.assign({ ox: p.x, oy: p.y }, o));
    };

    mk('glitter', (x, y) => new GlitterPatch(x, y, rng, 14, 27), { color: '#ff7ec0', color2: '#fff3b0', size: 23, rate: 1.1 });
    mk('beads', (x, y) => new BeadPile(x, y, rng, 8, 19), { color: '#7fd4ff', color2: '#ffe27a', size: 22, rate: 1 });
    mk('hair1', (x, y) => this._hair(x, y, 21), { color: '#a9622f', color2: '#e0b98c', size: 20, rate: 1 });
    mk('hair2', (x, y) => this._hair(x, y, 24), { color: '#8d5a3a', color2: '#d8b58e', size: 21, rate: 1 });
    mk('crumb1', (x, y) => new Crumb(x, y, rng, 'crumb'), { color: '#d19a4f', color2: '#f1d3a0', size: 18, rate: 1.15 });
    mk('crumb2', (x, y) => new Crumb(x, y, rng, 'crumb'), { color: '#c98c45', color2: '#efcf9c', size: 18, rate: 1.15 });

    // ---- and what is sitting ON the pile ---------------------------------
    this.surface = [];
    for (const key of ['surf1', 'surf2']) {
      const s = spots[key];
      const p = this._p(s[0], s[1]);
      const b = new DustBunny(p.x, p.y, key === 'surf1' ? 30 : 25, rng);
      b.hx = p.x; b.hy = p.y;
      b._homeX = p.x; b._homeY = p.y;
      this.debris.push(b);
      this.surface.push(b);
    }

    // Debris.translate() carries the wrapped debris and its pieces along, so
    // shoving something out of the parked nozzle's reach is one core call
    this.clearStartZone(215);
    for (const b of this.surface) { b._homeX = b.x; b._homeY = b.y; }
    // the same bin every room has. The finale simply walks it over to the
    // machine instead of conjuring a second one.
    this.placeBin();

    this.exitCam = { x: 0, y: 0, zoom: this.scale * 0.82, tilt: 0 };
  }

  /** A clump of pet hair: a small, gingery, tighter dust bunny. */
  _hair(x, y, r) {
    const b = new DustBunny(x, y, r, this.rng);
    b.core = '#9a6438'; b.rim = '#6d4322'; b.light = '#caa274';
    return b;
  }

  // --------------------------------------------------------------- update

  update(dt, ctx) {
    const vac = ctx.vacuum;
    this._vac = vac;                       // draw() is not handed the vacuum
    this.t0 = (this.t0 || 0) + dt;
    resolveProps(vac, this.props, dt);

    if (!this.fin) {
      this._comb(dt, vac, ctx);
      this._pileTilt(dt, vac);
    }

    const list = this.debris;
    for (let i = 0; i < list.length; i++) list[i].update(dt, vac, ctx.world);

    this._flecks(dt, vac);
    for (let i = this._sparkles.length - 1; i >= 0; i--) {
      const s = this._sparkles[i];
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.vx *= 0.9; s.vy *= 0.9;
      s.life -= dt * 1.5;
      if (s.life <= 0) this._sparkles.splice(i, 1);
    }

    this.combFrac = this.floor.progress;
    // keep the combed stripes across an orientation change (cheap, not per frame)
    this._saveT = (this._saveT || 0) - dt;
    if (this._saveT <= 0) { this._saveT = 0.6; this.persist.comb = this.floor.save(); }

    // combing mass out of the pile is a wide noise bed rather than a pop per
    // piece. The pour's own "zazaa" belongs to the bin, which is ticked after
    // this and sets the same stream itself.
    if (ctx.audio && !(this.bin && this.bin.pouring)) {
      ctx.audio.setStream(clamp((this.combPower || 0) * 0.75, 0, 1));
    }

    if (!this.fin && this._roomClean()) this._beginFinale(ctx);
    if (this.fin) this._finale(dt, ctx);
  }

  _roomClean() {
    if (this.combFrac < CLEAN) return false;
    for (let i = 0; i < this.debris.length; i++) if (this.debris[i].state !== State.DONE) return false;
    return true;
  }

  /** The brush roll: rubbing combs a stripe and spins the roller visibly. */
  _comb(dt, vac, ctx) {
    // the roller sits under the HEAD, a little ahead of its centre
    const mx = vac.nozzle.x + vac.dirX * 20, my = vac.nozzle.y + vac.dirY * 20;
    let moved = 0;
    if (this._lastM.has) moved = Math.hypot(mx - this._lastM.x, my - this._lastM.y);
    this._lastM.x = mx; this._lastM.y = my; this._lastM.has = true;

    const onRug = this.floor.inRug(mx, my);
    const speed = clamp(moved / Math.max(dt, 1e-4) / 190, 0, 1.4);
    const scrubK = 0.10 + 0.90 * smoothstep(0.06, 0.48, vac.scrub);
    // the roller only really turns when the head is worked back and forth
    const spinTarget = onRug ? (3 + 46 * scrubK * (0.35 + speed)) : 0;
    this.rollSpin += (spinTarget - this.rollSpin) * (1 - Math.exp(-7 * dt));
    this.roll += this.rollSpin * dt;
    this.combPower = onRug ? scrubK * clamp(0.35 + speed, 0, 1.5) : 0;

    // combing is per unit of TRAVEL, not per second: one worked pass leaves a
    // finished stripe however fast the child sweeps
    if (onRug && scrubK > 0.02) {
      const amount = (moved / (COMB_R * 2) * 3.2 + dt * 0.8) * scrubK;
      if (amount > 0.0005) {
        // the grid updates every step; the (texture-uploading) colour stamp is
        // rate limited, which is invisible but much cheaper
        this._stampT = (this._stampT || 0) - dt;
        const stamp = this._stampT <= 0;
        if (stamp) this._stampT = 0.05;
        const gained = this.floor.comb(mx, my, COMB_R, amount, stamp);
        // anything buried under the roller gets worked loose by the same stroke,
        // but only real back-and-forth work digs it out
        const dig = amount * 3.0 * smoothstep(0.06, 0.46, vac.scrub);
        for (let i = 0; i < this.debris.length; i++) {
          const d = this.debris[i];
          if (!d.applyComb) continue;
          const dx = d.x - mx, dy = d.y - my;
          const dd = Math.hypot(dx, dy);
          if (dd > COMB_R + d.size * 0.5) continue;
          if (dig > 0) d.applyComb(dig * clamp(1 - dd / (COMB_R * 1.6), 0.15, 1), vac);
        }
        if (gained > 0.01 && this.rng.next() < dt * 46 * this.combPower) this._fleck(vac);
      }
    }
  }

  /** The pile bends under the bunnies sitting on it and tips them over first. */
  _pileTilt(dt, vac) {
    for (let i = 0; i < this.surface.length; i++) {
      const b = this.surface[i];
      if (b.state === State.DONE || b.state === State.PULLED || b.state === State.CAPTURED) continue;
      const f = vac.field(b._homeX, b._homeY, TMPF);
      const k = clamp(f.strength * 1.5, 0, 1);
      b.hx = b._homeX + f.fx * 17 * k;
      b.hy = b._homeY + f.fy * 17 * k;
    }
  }

  _fleck(vac) {
    if (this.flecks.length > 40) return;
    const a = this.rng.range(0, TAU);
    const sp = this.rng.range(50, 150);
    this.flecks.push({
      x: vac.mouthX + this.rng.range(-24, 24), y: vac.mouthY + this.rng.range(-18, 18),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, life: 1,
      r: this.rng.range(1.2, 2.8),
    });
  }

  /** Combed-out pile fluff: it flies, then the flow takes it back in. */
  _flecks(dt, vac) {
    for (let i = this.flecks.length - 1; i >= 0; i--) {
      const p = this.flecks[i];
      const f = vac.field(p.x, p.y, TMPF);
      p.vx += f.fx * 900 * dt; p.vy += f.fy * 900 * dt;
      p.vx *= 0.92; p.vy *= 0.92;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.life -= dt * 1.1;
      if (p.life <= 0 || f.inCapture) this.flecks.splice(i, 1);
    }
  }

  onCaptured(d, ctx) {
    for (let i = 0; i < 9; i++) {
      this._sparkles.push({
        x: d.x, y: d.y, vx: this.rng.range(-90, 90), vy: this.rng.range(-90, 90),
        life: 1, r: this.rng.range(1.2, 3), c: '#fff2d2',
      });
    }
  }

  // --------------------------------------------------------------- finale

  _beginFinale(ctx) {
    this.fin = { phase: 'settle', t: 0, glow: 0, shine: 0, done: false };
    if (ctx.audio) ctx.audio.pop('whoosh', 0.5);
  }

  _finale(dt, ctx) {
    const F = this.fin;
    const vac = ctx.vacuum;
    const cam = ctx.camera;
    F.t += dt;
    F.glow = clamp(F.glow + dt * 0.7, 0, 1);

    if (F.phase === 'settle') {
      // the pile relaxes and the whole rug comes up in colour at once
      this.floor.bloom(dt * 1.5);
      if (F.t > 1.35) {
        this.floor.fill(1);
        this.combFrac = this.floor.progress;
        F.phase = 'toBin'; F.t = 0; this._placeBin(vac, cam);
      }
    } else if (F.phase === 'toBin') {
      // the bin slides up beside the machine
      this.bin._appear = clamp(F.t / 0.5, 0, 1);
      if (F.t > 1.15) {
        F.phase = 'pour'; F.t = 0;
        // a single room's worth would be a trickle; the whole run is a rush
        this.bin.beginPour(vac, ctx, { pad: 34 });
      }
    } else if (F.phase === 'pour') {
      if (!this.bin.pouring) {
        F.phase = 'shine'; F.t = 0;
        cam.kick(5);
        if (ctx.audio) ctx.audio.pop('tick', 0.9);
      }
    } else if (F.phase === 'shine') {
      F.shine = clamp(F.t / 0.35, 0, 1) * (1 - smoothstep(0.9, 1.5, F.t));
      if (F.t > 1.6) { F.phase = 'done'; F.t = 0; F.done = true; }
    }

    // The head is pinned to the finger in SCREEN space, so panning cannot
    // re-frame it (chasing it would make the camera run away). Push in instead,
    // and hang the bin off the cup at a fixed offset so both always share the
    // frame wherever the child left their finger.
    const tz = this.scale * (F.phase === 'settle' ? 1.03 : 1.16);
    const k = 1 - Math.exp(-2.0 * dt);
    cam.zoom += (tz - cam.zoom) * k;
    cam.tilt += (0 - cam.tilt) * k;
    if (F.binOff) {
      this.bin.x = vac.cupCenter.x + F.binOff.x;
      this.bin.y = vac.cupCenter.y + F.binOff.y;
    }
  }

  /**
   * Stand the bin BESIDE the vacuum — never in front of it: the head, hose and
   * body take up a vertical strip, and the pour has to be seen. It goes to
   * whichever side has more screen, and is pulled back in if it would fall off.
   */
  _placeBin(vac, cam) {
    const p = { x: 0, y: 0 };
    cam.toScreen(vac.cupCenter.x, vac.cupCenter.y, p);
    const side = p.x <= cam.w * 0.5 ? 1 : -1;
    let dx = side * 0.96, dy = -0.28;
    const l = Math.hypot(dx, dy); dx /= l; dy /= l;
    let D = 132;
    // keep it on screen
    const q = { x: 0, y: 0 };
    for (let i = 0; i < 6; i++) {
      cam.toScreen(vac.cupCenter.x + dx * D, vac.cupCenter.y + dy * D, q);
      if (q.x > 56 && q.x < cam.w - 56 && q.y > 60 && q.y < cam.h - 56) break;
      D -= 16;
    }
    this.fin.binOff = { x: dx * D, y: dy * D };
    this.bin.x = vac.cupCenter.x + dx * D;
    this.bin.y = vac.cupCenter.y + dy * D;
    this.bin._appear = 0;
    this.bin.armed = false;          // the finale drives this pour itself
  }

  /** Dev hook: jump straight to the finale (used by dev/carpet-finale.mjs). */
  devFinish() {
    this.floor.fill(1);
    this.combFrac = this.floor.progress;
    for (let i = 0; i < this.debris.length; i++) this.debris[i].state = State.DONE;
  }

  // ----------------------------------------------------------- completion

  isComplete() { return !!(this.fin && this.fin.done); }

  exit() { return { to: this.exitCam, dur: 1.8, next: 'intro' }; }
  entry() {
    return { x: this.rest.x, y: this.rest.y - (this.pose === 'portrait' ? 40 : 0), zoom: this.scale * 1.12, tilt: this.rest.tilt };
  }

  snapshot() {
    const s = super.snapshot();
    s.comb = +this.combFrac.toFixed(3);
    s.roll = +this.rollSpin.toFixed(1);
    s.finale = this.fin ? this.fin.phase : null;
    return s;
  }

  // ----------------------------------------------------------------- draw

  draw(ctx, cam) {
    ctx.save();
    cam.apply(ctx);
    this.floor.draw(ctx);
    ctx.restore();

    ctx.save();
    cam.apply(ctx);
    if (this._vac) this.floor.drawPile(ctx, this._vac, this.t0 || 0);
    this._drawLegs(ctx);
    ctx.restore();

    this.drawDebris(ctx, cam);

    ctx.save();
    cam.apply(ctx);
    this._drawFlecks(ctx);
    if (this._vac) this._drawRoller(ctx, this._vac);
    this._drawTableTop(ctx);
    ctx.restore();
  }

  /**
   * The bin, the arcing contents and the lid are the shared prop now (main.js
   * draws them around the vacuum); what is left here is the scene's own
   * sparkle on the empty cup, which has to be in FRONT of the machine.
   */
  drawOver(ctx, cam) {
    if (!this.fin) return;
    ctx.save();
    cam.apply(ctx);
    this._drawShine(ctx);
    ctx.restore();
  }

  _drawFlecks(ctx) {
    if (this.flecks.length) {
      ctx.save();
      ctx.fillStyle = '#efe6d0';
      for (let i = 0; i < this.flecks.length; i++) {
        const p = this.flecks[i];
        ctx.globalAlpha = clamp(p.life, 0, 1) * 0.7;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    if (this._sparkles.length) {
      ctx.save();
      for (let i = 0; i < this._sparkles.length; i++) {
        const s = this._sparkles[i];
        ctx.globalAlpha = clamp(s.life, 0, 1) * 0.85;
        ctx.fillStyle = s.c;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  /**
   * The brush roll, drawn on the floor just in front of the mouth so the head
   * itself (drawn after the scene) covers its back half: it reads as a roller
   * turning UNDER the nozzle. Spinning = the pile is being combed.
   */
  _drawRoller(ctx, vac) {
    if (!this.floor.inRug(vac.mouthX, vac.mouthY)) return;
    const a = Math.atan2(vac.dirY, vac.dirX);
    ctx.save();
    ctx.translate(vac.mouthX + vac.dirX * 9, vac.mouthY + vac.dirY * 9);
    ctx.rotate(a);
    const L = 26, T = 11.5;
    // the trough the roller digs in the pile
    ctx.fillStyle = 'rgba(38,26,12,0.30)';
    ctx.beginPath(); ctx.ellipse(1, 0, T * 1.25, L * 1.12, 0, 0, TAU); ctx.fill();
    // barrel
    ctx.fillStyle = '#3b4258';
    ctx.beginPath(); ctx.ellipse(0, 0, T, L, 0, 0, TAU); ctx.fill();
    // helical bristle bands, turning
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, 0, T, L, 0, 0, TAU); ctx.clip();
    for (let i = 0; i < 5; i++) {
      const ph = this.roll * 0.5 + i * (TAU / 5);
      const off = Math.sin(ph) * T;
      const bright = Math.cos(ph) > 0;
      ctx.strokeStyle = bright ? 'rgba(244,236,214,0.92)' : 'rgba(150,140,120,0.5)';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(off - 3.5, -L); ctx.lineTo(off + 3.5, L);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.beginPath(); ctx.ellipse(-T * 0.35, 0, T * 0.25, L * 0.86, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(20,22,32,0.6)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(0, 0, T, L, 0, 0, TAU); ctx.stroke();
    // bristle tips flicking out of the front edge
    const flick = clamp(this.rollSpin / 40, 0, 1);
    if (flick > 0.05) {
      ctx.strokeStyle = 'rgba(248,242,226,' + (0.35 + flick * 0.5).toFixed(3) + ')';
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      for (let i = -4; i <= 4; i++) {
        const y = i * (L / 4.6);
        const w = 4 + 5 * flick * (0.6 + 0.4 * Math.sin(this.roll * 0.9 + i));
        ctx.moveTo(T * 0.6, y); ctx.lineTo(T * 0.6 + w, y + Math.sin(this.roll + i) * 2);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawLegs(ctx) {
    if (!this.table) return;
    for (let i = 0; i < this.props.length; i++) {
      const p = this.props[i];
      ctx.fillStyle = 'rgba(40,26,10,0.30)';
      ctx.beginPath(); ctx.ellipse(p.x + 5, p.y + 8, p.r * 1.5, p.r * 0.8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6f4a2a';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8c5f36';
      ctx.beginPath(); ctx.arc(p.x - 2, p.y - 2, p.r * 0.72, 0, TAU); ctx.fill();
    }
  }

  /** Glass top: you can see the rug (and the debris) under the table. */
  _drawTableTop(ctx) {
    const t = this.table;
    if (!t) return;
    ctx.save();
    // a shadow under the glass sells the height
    ctx.fillStyle = 'rgba(40,28,14,0.13)';
    this._round(ctx, t.x - t.w / 2 + 8, t.y - t.h / 2 + 12, t.w, t.h, 14);
    ctx.fill();
    ctx.fillStyle = 'rgba(196,230,240,0.22)';
    this._round(ctx, t.x - t.w / 2, t.y - t.h / 2, t.w, t.h, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,160,175,0.35)';
    ctx.lineWidth = 7;
    this._round(ctx, t.x - t.w / 2, t.y - t.h / 2, t.w, t.h, 14);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(240,253,255,0.75)';
    ctx.lineWidth = 3.5;
    this._round(ctx, t.x - t.w / 2, t.y - t.h / 2, t.w, t.h, 14);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(t.x - t.w * 0.34, t.y - t.h * 0.40);
    ctx.lineTo(t.x + t.w * 0.16, t.y + t.h * 0.42);
    ctx.stroke();
    ctx.restore();
  }

  _round(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---- finale drawing --------------------------------------------------

  _drawShine(ctx) {
    const F = this.fin;
    if (F.shine <= 0.01 || !this._vac) return;
    const c = this._vac.cupCenter;
    const s = F.shine;
    ctx.save();
    ctx.globalAlpha = s;
    // a clean, empty, shiny cup
    ctx.strokeStyle = 'rgba(255,255,255,' + (s * 0.5).toFixed(3) + ')';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, 40 + s * 10, 44 + s * 10, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 7; i++) {
      const a = i * (TAU / 7) + F.t * 0.8;
      const d = 50 + Math.sin(F.t * 6 + i) * 5;
      const x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d * 0.9;
      const L = 8 + 7 * Math.abs(Math.sin(F.t * 5 + i));
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(x - L, y); ctx.lineTo(x + L, y);
      ctx.moveTo(x, y - L); ctx.lineTo(x, y + L);
      ctx.stroke();
    }
    ctx.restore();
  }
}
