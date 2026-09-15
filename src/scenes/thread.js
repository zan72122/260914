import { Scene } from './scene.js';
import { State } from '../debris/base.js';
import { Strand } from '../debris/strand.js';
import { makeWoodFloor } from '../floors/wood.js';
import { Prop, resolveProps } from '../props/prop.js';
import { TAU, clamp, smoothstep, lerp } from '../core/math.js';

/**
 * Scene 5 — the sewing corner at the end of a corridor.
 *
 * New motion law: long thin things (thread, yarn, hair, a ribbon) are taken
 * from ONE END. The tip lifts and waves, the floor's grip walks back along the
 * strand, the line goes taut, and then the whole thing is reeled in through the
 * mouth while the rest is still lying on the floor — a second of pure pleasure,
 * finished by the strand racing up the transparent tube and coiling in the cup.
 *
 * Spatial structure: portrait is a narrow corridor receding AWAY from the
 * viewer with a chair on one side; landscape is a long skirting board you
 * travel ALONG, going around the chair. Both end at the doormat of the next
 * room, which is already sandy.
 *
 * Everything is laid out along one "travel axis" measured from the parked
 * nozzle, so an iPhone and an iPad get the same journey and the same reel
 * timings even though their design viewports differ by 40%.
 */
export class ThreadScene extends Scene {
  constructor(rng) {
    super('thread', rng);
    this.shineT = 0;
    this.t = 0;
    this.motes = [];
    this.puffs = [];
  }

  _p(nx, ny) { return { x: (nx - 0.5) * this.vw, y: (ny - 0.5) * this.vh }; }

  /**
   * A point on the travel axis. u = 0 at the parked nozzle, 1 at the far end;
   * lat = -1..1 across the corridor (portrait) or 0..1 from skirting to the
   * near edge (landscape).
   */
  _a(u, lat) {
    if (this.pose === 'portrait') {
      const y = this.p0.y - u * this.span;
      return { x: lat * this._halfAt(y) * 0.86, y };
    }
    return { x: this.p0.x + u * this.span, y: lerp(this.wallY + 64, this.vh * 0.44, lat) };
  }

  /** A wandering strand of a FIXED design length, so every device reels alike. */
  _snake(tip, angDeg, len, amp, waves, phase) {
    const a = (angDeg * Math.PI) / 180;
    const ux = Math.cos(a), uy = Math.sin(a);
    const pts = [];
    const N = 12;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const d = u * len;
      const w = Math.sin(u * Math.PI * 2 * waves + (phase || 0)) * amp * (0.30 + 0.70 * u);
      pts.push({ x: tip.x + ux * d - uy * w, y: tip.y + uy * d + ux * w });
    }
    return pts;
  }

  _add(opts) {
    const s = new Strand(Object.assign({ rng: this.rng }, opts));
    this.debris.push(s);
    return s;
  }

  // ------------------------------------------------------------------ layout

  layout(pose, w, h) {
    super.layout(pose, w, h);
    w = this.vw; h = this.vh;
    this.debris.length = 0;
    this.props.length = 0;
    this.motes.length = 0;
    this.puffs.length = 0;
    this.shineT = 0;
    this.t = 0;
    this._wallG = null; this._shadG = null; this._doorG = null; this._baseG = null; this._skirtG = null; this._doorLG = null;
    const rng = this.rng;
    const portrait = pose === 'portrait';
    this.rest = { x: 0, y: 0, zoom: this.scale, tilt: portrait ? 0.16 : 0.08 };

    if (portrait) this._layoutPortrait(w, h, rng);
    else this._layoutLandscape(w, h, rng);

    // a dusty film over the working area; every strand taken wipes a clean line
    // through it, so the floor itself remembers where you have been
    this.floor.enableGrime();
    this._paintHaze();

    for (let i = 0; i < 14; i++) {
      this.motes.push({
        x: rng.range(-w * 0.45, w * 0.45), y: rng.range(-h * 0.5, h * 0.45),
        r: rng.range(0.7, 1.7), ph: rng.range(0, TAU), sp: rng.range(0.4, 1.1),
      });
    }
    this._makeLegProps();
    // Debris.translate()/aim() let the core do this now: a strand is measured
    // and moved by its TIP, and the tied ribbon is left alone.
    this.clearStartZone(140);
  }

  _layoutPortrait(w, h, rng) {
    this.startPointer = { x: 0.5, y: 0.80 };
    this.yFar = -h * 0.42;
    this.yNear = h * 0.56;
    this.halfFar = w * 0.25;
    this.halfNear = w * 0.50;
    this.p0 = this.parkPoint();
    this.span = this.p0.y - (this.yFar + 46);
    this.floor = makeWoodFloor({ x0: -w * 0.56, y0: -h * 0.58, x1: w * 0.56, y1: h * 0.62 }, rng, { plankW: 56 });

    const L = clamp(this.span * 0.45, 200, 250);   // thread length in design px
    this.mat = { x: 0, y: this.yFar + 40, w: w * 0.46, h: 76 };

    // the chair stands against the left wall, half-way up the corridor; its two
    // right-hand legs stick out into the corridor and you have to go round them
    this._setChair(this._a(0.72, -0.80), 100, 92, 0.16, 1);

    // 1. the thread the toy room hinted at: nearest the player, tip toward them
    this._add({ variant: 'thread', path: this._snake(this._a(0.18, 0.56), -76, L, 26, 1.5, 0.4) });
    // 2. a hair: thinner, curlier, and its tip whips
    this._add({ variant: 'hair', path: this._snake(this._a(0.34, -0.62), -96, L * 0.70, L * 0.06, 3.4, 1.9) });
    // 3. the yarn, wrapped around the chair leg
    this._add({ variant: 'yarn', snag: { x: this.legA.x, y: this.legA.y, r: 21 },
      path: this._wrap(this._a(0.42, 0.34), this.legA, this._a(0.90, -0.08)) });
    // 4. a second thread, deeper in
    this._add({ variant: 'thread', color: '#7a52d8', light: '#cbb6ff',
      path: this._snake(this._a(0.46, 0.80), -100, L * 0.95, 24, 1.4, 2.6) });
    // 5. a few hairs tangled into one clump: a faster, different "fwip"
    this._add({ variant: 'hair', clump: 3, width: 2.6,
      path: this._snake(this._a(0.80, 0.68), -150, 135, 15, 2.6, 0.8) });
    // 6. the ribbon, tied to the chair: it can never be taken
    this._addRibbon(this.legB, this._a(0.66, 0.46));

    this.exitCam = { x: 0, y: this.yFar + h * 0.22, zoom: this.scale * 1.06, tilt: 0.36 };
  }

  _layoutLandscape(w, h, rng) {
    this.startPointer = { x: 0.14, y: 0.80 };
    this.wallY = -h * 0.33;
    this.p0 = this.parkPoint();
    this.span = w * 0.46 - this.p0.x;
    this.floor = makeWoodFloor({ x0: -w * 0.54, y0: -h * 0.42, x1: w * 0.56, y1: h * 0.56 }, rng,
      { plankW: 54, horizontal: true });

    const L = clamp(this.span * 0.44, 200, 250);
    this.mat = { x: w * 0.455, y: h * 0.02, w: 92, h: h * 0.62 };

    // the chair sits against the skirting: its near legs stick out into the run
    this._setChair(this._a(0.55, 0.02), 104, 94, -0.12, -1);

    // 1. the thread the toy room hinted at, running along the skirting
    this._add({ variant: 'thread', path: this._snake(this._a(0.12, 0.80), -16, L, 24, 1.5, 0.4) });
    // 2. a hair against the skirting board
    this._add({ variant: 'hair', path: this._snake(this._a(0.30, 0.16), 20, L * 0.70, L * 0.06, 3.4, 1.9) });
    // 3. the yarn, round the chair leg
    this._add({ variant: 'yarn', snag: { x: this.legA.x, y: this.legA.y, r: 21 },
      path: this._wrap(this._a(0.40, 0.92), this.legA, this._a(0.76, 0.90)) });
    // 4. a second thread beyond the chair
    this._add({ variant: 'thread', color: '#7a52d8', light: '#cbb6ff',
      path: this._snake(this._a(0.72, 0.78), -22, L * 0.95, 24, 1.4, 2.6) });
    // 5. the hair clump
    this._add({ variant: 'hair', clump: 3, width: 2.6,
      path: this._snake(this._a(0.90, 0.30), 120, 130, 14, 2.6, 0.8) });
    // 6. the ribbon tied to the chair
    this._addRibbon(this.legB, this._a(0.70, 0.62));

    this.exitCam = { x: w * 0.30, y: h * 0.02, zoom: this.scale * 1.06, tilt: 0.12 };
  }

  /**
   * Place the chair and derive its four feet. `side` is +1 when the chair
   * stands to the LEFT of the run (portrait corridor) and -1 when it stands
   * behind it (landscape skirting); legA/legB are the two feet that stick out
   * where the player has to work around them.
   */
  _setChair(c, cw, ch, angle, side) {
    this.chair = { x: c.x, y: c.y, w: cw, h: ch, angle };
    const dx = cw * 0.58, dy = ch * 0.56;
    if (side > 0) {
      this.legA = { x: c.x + dx, y: c.y + dy };
      this.legB = { x: c.x + dx * 0.92, y: c.y - dy };
      this.legsBack = [{ x: c.x - dx, y: c.y + dy * 0.9 }, { x: c.x - dx, y: c.y - dy * 0.9 }];
    } else {
      this.legA = { x: c.x - dx, y: c.y + dy };
      this.legB = { x: c.x + dx, y: c.y + dy * 0.92 };
      this.legsBack = [{ x: c.x - dx * 0.9, y: c.y - dy }, { x: c.x + dx * 0.9, y: c.y - dy }];
    }
  }

  /** A path that runs to a leg, wraps round its far side, and carries on. */
  _wrap(tip, leg, end) {
    const r = 30;
    return [
      { x: tip.x, y: tip.y },
      { x: lerp(tip.x, leg.x, 0.45), y: lerp(tip.y, leg.y, 0.45) },
      { x: lerp(tip.x, leg.x, 0.82), y: lerp(tip.y, leg.y, 0.82) },
      { x: leg.x + r * 0.2, y: leg.y + r },
      { x: leg.x - r, y: leg.y + r * 0.25 },
      { x: leg.x - r * 0.7, y: leg.y - r * 0.8 },
      { x: leg.x + r * 0.5, y: leg.y - r * 0.9 },
      { x: lerp(leg.x, end.x, 0.4), y: lerp(leg.y, end.y, 0.4) },
      { x: end.x, y: end.y },
    ];
  }

  _addRibbon(anchor, tip) {
    const dx = tip.x - anchor.x, dy = tip.y - anchor.y;
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    // a lazy S with real slack in it: a ribbon pulled dead straight is a rope,
    // and a rope is not fun. The slack is what flutters.
    const b = l * 0.34;
    const r = this._add({ variant: 'ribbon', anchor: true, path: [
      { x: tip.x, y: tip.y },
      { x: anchor.x + dx * 0.78 + nx * b, y: anchor.y + dy * 0.78 + ny * b },
      { x: anchor.x + dx * 0.50 - nx * b * 0.5, y: anchor.y + dy * 0.50 - ny * b * 0.5 },
      { x: anchor.x + dx * 0.24 + nx * b * 0.8, y: anchor.y + dy * 0.24 + ny * b * 0.8 },
      { x: anchor.x, y: anchor.y },
    ] });
    r.decor = true;          // it never counts toward finishing the room
    this.ribbon = r;
    return r;
  }

  /** The two chair legs are solid: the head slides around them. */
  _makeLegProps() {
    this.props.push(new Prop({ x: this.legA.x, y: this.legA.y, shape: 'circle', r: 13,
      pushable: false, shadow: false, draw: () => {} }));
    this.props.push(new Prop({ x: this.legB.x, y: this.legB.y, shape: 'circle', r: 13,
      pushable: false, shadow: false, draw: () => {} }));
  }


  _paintHaze() {
    const g = this.floor.gctx;
    if (!g) return;
    const f = this.floor;
    g.save();
    g.translate(-f.rect.x0, -f.rect.y0);
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      if (!d.hxs || d.variant === 'ribbon') continue;
      g.beginPath();
      for (let k = 0; k < d.n; k++) {
        if (k === 0) g.moveTo(d.hxs[k], d.hys[k]); else g.lineTo(d.hxs[k], d.hys[k]);
      }
      g.strokeStyle = 'rgba(226,218,200,0.10)'; g.lineWidth = 62; g.stroke();
      g.strokeStyle = 'rgba(230,222,206,0.10)'; g.lineWidth = 34; g.stroke();
    }
    g.restore();
  }

  // ------------------------------------------------------------------ update

  update(dt, ctx) {
    this.t += dt;
    const list = this.debris;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      d.update(dt, ctx.vacuum, ctx.world);
      if (d.justSnapped) {
        ctx.camera.kick(3.2);
        this._puff(d.snapX, d.snapY, d.lightColor);
      }
      if (d.state === State.DONE && !d._wiped) { d._wiped = true; this._wipe(d); }
    }
    resolveProps(ctx.vacuum, this.props, dt);

    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.92; p.vy *= 0.92;
      p.life -= dt * 1.7;
      if (p.life <= 0) this.puffs.splice(i, 1);
    }

    if (this.remaining() === 0 && this.shineT < 1) {
      const prev = this.shineT;
      this.shineT = clamp(this.shineT + dt / 1.25, 0, 1);
      this._polish(prev, this.shineT);
      if (this.shineT >= 1) this.floor.clearGrime();
    }
  }

  /**
   * The core puts the same strands back in the DONE state (by identity); this
   * also replays the clean lines they wiped through the haze, so the floor
   * still remembers where the player has been after an orientation change.
   */
  restoreProgress(p) {
    super.restoreProgress(p);
    let left = 0;
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      if (d.state !== State.DONE) { if (!d.decor) left++; continue; }
      d._wiped = true;
      this._wipe(d);
    }
    if (left === 0) { this.shineT = 1; this.floor.clearGrime(); }
  }

  _wipe(d) {
    if (!d.hxs || !this.floor.gctx) return;
    for (let k = 0; k < d.n; k++) this.floor.reveal(d.hxs[k], d.hys[k], 36);
  }

  _puff(x, y, color) {
    if (x === undefined) return;
    for (let i = 0; i < 9; i++) {
      this.puffs.push({
        x, y, vx: this.rng.range(-130, 130), vy: this.rng.range(-130, 130),
        life: 1, r: this.rng.range(1.4, 3.2), color: color || '#fff',
      });
    }
  }

  /** The finish: one bright streak sweeps the floor clean along the travel axis. */
  _polish(a, b) {
    const portrait = this.pose === 'portrait';
    const steps = 9;
    for (let i = 1; i <= steps; i++) {
      const u = a + (b - a) * (i / steps);
      if (portrait) {
        const y = lerp(this.p0.y + 40, this.yFar + 40, u);
        const hw = this._halfAt(y) * 0.8;
        for (let k = -2; k <= 2; k++) this.floor.reveal(k * hw * 0.45, y, 62);
      } else {
        const x = lerp(this.p0.x - 40, this.vw * 0.46, u);
        for (let k = -2; k <= 2; k++) this.floor.reveal(x, this.wallY + 90 + k * this.vh * 0.17, 62);
      }
    }
  }

  isComplete() { return this.remaining() === 0 && this.shineT >= 1; }

  // -------------------------------------------------------------------- draw

  /**
   * A strand is taken in through the mouth, so while it is reeling it must be
   * drawn ON TOP of the head — otherwise the last half metre disappears behind
   * the nozzle exactly when it is most fun to watch. `drawDebris` skips it and
   * the core's drawOver hook puts it back in front of the machine.
   */
  drawOver(ctx, cam) {
    let any = false;
    for (let i = 0; i < this.debris.length; i++) if (this.debris[i].phase === 'reel') { any = true; break; }
    if (!any) return;
    ctx.save();
    cam.apply(ctx);
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      if (d.phase === 'reel') d.draw(ctx, cam);
    }
    ctx.restore();
  }

  drawDebris(ctx, cam) {
    ctx.save();
    cam.apply(ctx);
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      if (d.dormant || d.phase === 'reel') continue;
      d.draw(ctx, cam);
    }
    ctx.restore();
  }

  draw(ctx, cam) {
    this.drawFloor(ctx, cam);
    ctx.save();
    cam.apply(ctx);
    if (this.pose === 'portrait') this._drawCorridor(ctx); else this._drawBaseboard(ctx);
    this._drawMat(ctx);
    this._drawChair(ctx);
    ctx.restore();
    this.drawDebris(ctx, cam);
    ctx.save();
    cam.apply(ctx);
    this._drawShine(ctx);
    this._drawMotes(ctx);
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      ctx.globalAlpha = clamp(p.life, 0, 1) * 0.85;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _halfAt(y) {
    return lerp(this.halfNear, this.halfFar, smoothstep(this.yNear, this.yFar, y));
  }

  /** Portrait: two walls closing in toward the far door — depth, not width. */
  _drawCorridor(ctx) {
    const w = this.vw, h = this.vh;
    const yF = this.yFar, yN = this.yNear;
    for (let side = -1; side <= 1; side += 2) {
      ctx.beginPath();
      ctx.moveTo(side * this.halfFar, yF);
      ctx.lineTo(side * this.halfNear, yN);
      ctx.lineTo(side * w * 0.95, yN);
      ctx.lineTo(side * w * 0.95, yF - h * 0.5);
      ctx.closePath();
      const gi = side < 0 ? 0 : 1;
      if (!this._wallG) this._wallG = [];
      let g = this._wallG[gi];
      if (!g) {
        g = ctx.createLinearGradient(side * this.halfFar, yF, side * w * 0.85, yN);
        g.addColorStop(0, '#b3a189');
        g.addColorStop(1, '#e6dac7');
        this._wallG[gi] = g;
      }
      ctx.fillStyle = g; ctx.fill();
      // skirting board: a strong line that carries the eye into the depth
      ctx.strokeStyle = '#7f6c54'; ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(side * this.halfFar, yF); ctx.lineTo(side * this.halfNear, yN); ctx.stroke();
      ctx.strokeStyle = '#dccdb4'; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(side * this.halfFar, yF - 2); ctx.lineTo(side * this.halfNear, yN - 2); ctx.stroke();
      // shadow pooling at the foot of the wall
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(side * this.halfFar, yF);
      ctx.lineTo(side * this.halfNear, yN);
      ctx.lineTo(side * (this.halfNear - 66), yN);
      ctx.lineTo(side * (this.halfFar - 46), yF);
      ctx.closePath();
      if (!this._shadG) this._shadG = [];
      let sg = this._shadG[gi];
      if (!sg) {
        sg = ctx.createLinearGradient(side * this.halfNear, 0, side * (this.halfNear - 66), 0);
        sg.addColorStop(0, 'rgba(52,34,16,0.30)');
        sg.addColorStop(1, 'rgba(52,34,16,0)');
        this._shadG[gi] = sg;
      }
      ctx.fillStyle = sg; ctx.fill();
      ctx.restore();
    }
    // far wall with the opening to the next room
    ctx.fillStyle = '#c7b69d';
    ctx.fillRect(-w * 0.95, yF - h * 0.55, w * 1.9, h * 0.55);
    ctx.fillStyle = '#95836a';
    ctx.fillRect(-w * 0.95, yF - 14, w * 1.9, 14);
    const d = this.mat.w * 1.04;
    ctx.fillStyle = '#f0e2c6';
    ctx.fillRect(-d / 2, yF - h * 0.34, d, h * 0.34);
    let lg = this._doorG;
    if (!lg) {
      lg = ctx.createLinearGradient(0, yF - h * 0.34, 0, yF + 150);
      lg.addColorStop(0, 'rgba(255,238,198,0.78)');
      lg.addColorStop(1, 'rgba(255,238,198,0)');
      this._doorG = lg;
    }
    ctx.fillStyle = lg;
    ctx.fillRect(-d / 2 - 34, yF - h * 0.34, d + 68, h * 0.34 + 150);
  }

  /** Landscape: one long skirting board to travel along. */
  _drawBaseboard(ctx) {
    const w = this.vw, h = this.vh;
    const y = this.wallY;
    ctx.fillStyle = '#e6dac7';
    ctx.fillRect(-w * 0.9, y - h, w * 1.9, h);
    let g = this._baseG;
    if (!g) {
      g = ctx.createLinearGradient(0, y - 44, 0, y);
      g.addColorStop(0, '#ece0cd'); g.addColorStop(1, '#c6b59c');
      this._baseG = g;
    }
    ctx.fillStyle = g;
    ctx.fillRect(-w * 0.9, y - 44, w * 1.9, 44);
    ctx.fillStyle = '#7f6c54'; ctx.fillRect(-w * 0.9, y - 13, w * 1.9, 13);
    ctx.fillStyle = '#dccdb4'; ctx.fillRect(-w * 0.9, y - 15, w * 1.9, 3);
    let sg = this._skirtG;
    if (!sg) {
      sg = ctx.createLinearGradient(0, y, 0, y + 64);
      sg.addColorStop(0, 'rgba(52,34,16,0.30)');
      sg.addColorStop(1, 'rgba(52,34,16,0)');
      this._skirtG = sg;
    }
    ctx.fillStyle = sg;
    ctx.fillRect(-w * 0.9, y, w * 1.9, 64);
    // the lit doorway at the far end, where the mat is
    const m = this.mat;
    let lg = this._doorLG;
    if (!lg) {
      lg = ctx.createLinearGradient(m.x - 120, 0, m.x + 120, 0);
      lg.addColorStop(0, 'rgba(255,238,198,0)');
      lg.addColorStop(1, 'rgba(255,238,198,0.55)');
      this._doorLG = lg;
    }
    ctx.fillStyle = lg;
    ctx.fillRect(m.x - 120, y, 240, h);
  }

  /** The next room's doormat, already sandy: the target after this one. */
  _drawMat(ctx) {
    const m = this.mat;
    ctx.save();
    ctx.fillStyle = 'rgba(40,28,14,0.16)';
    ctx.beginPath();
    ctx.ellipse(m.x + 4, m.y + m.h * 0.5 + 5, m.w * 0.52, m.h * 0.28, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#96764a';
    ctx.fillRect(m.x - m.w / 2, m.y - m.h / 2, m.w, m.h);
    ctx.fillStyle = '#ac8b59';
    ctx.fillRect(m.x - m.w / 2 + 6, m.y - m.h / 2 + 6, m.w - 12, m.h - 12);
    ctx.strokeStyle = 'rgba(70,50,26,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath();
    const horiz = m.w > m.h;
    const n = horiz ? 10 : 8;
    for (let i = 1; i < n; i++) {
      if (horiz) {
        const x = m.x - m.w / 2 + (i / n) * m.w;
        ctx.moveTo(x, m.y - m.h / 2 + 7); ctx.lineTo(x, m.y + m.h / 2 - 7);
      } else {
        const y = m.y - m.h / 2 + (i / n) * m.h;
        ctx.moveTo(m.x - m.w / 2 + 7, y); ctx.lineTo(m.x + m.w / 2 - 7, y);
      }
    }
    ctx.stroke();
    // sand spilling off its edge, so the next room announces itself
    ctx.fillStyle = '#e8ce93';
    ctx.beginPath();
    for (let i = 0; i < 46; i++) {
      const a = (i * 2.399) % TAU;
      const rr = 0.3 + ((i * 7919) % 100) / 100 * 0.95;
      const x = m.x + Math.cos(a) * m.w * 0.56 * rr;
      const y = m.y + Math.sin(a) * m.h * 0.62 * rr;
      const r = 1.1 + (i % 3) * 0.6;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, TAU);
    }
    ctx.fill();
    ctx.restore();
  }

  _drawChair(ctx) {
    const c = this.chair;
    ctx.save();
    ctx.fillStyle = 'rgba(42,28,14,0.18)';
    ctx.beginPath();
    ctx.ellipse(c.x + 10, c.y + c.h * 0.42, c.w * 0.72, c.h * 0.38, 0, 0, TAU);
    ctx.fill();
    for (let i = 0; i < this.legsBack.length; i++) this._drawLeg(ctx, this.legsBack[i], 0.82);
    this._drawLeg(ctx, this.legA, 1);
    this._drawLeg(ctx, this.legB, 1);
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    // backrest: two posts with open gaps between three slats. The gaps are what
    // make this read as a chair and not a box.
    const bh = 40;
    ctx.fillStyle = '#7a4f2a';
    for (let k = -1; k <= 1; k += 2) {
      roundRectPath(ctx, k * (c.w / 2 - 5) - 5, -c.h / 2 - bh, 10, bh + 12, 4); ctx.fill();
    }
    ctx.fillStyle = '#9a6a3c';
    for (let i = 0; i < 2; i++) {
      roundRectPath(ctx, -c.w / 2 + 6, -c.h / 2 - bh + 4 + i * 16, c.w - 12, 9, 4); ctx.fill();
    }
    // seat: plain wood, so the eye reads a flat surface at chair height
    ctx.fillStyle = '#7d5430';
    roundRectPath(ctx, -c.w / 2, -c.h / 2, c.w, c.h, 12); ctx.fill();
    ctx.fillStyle = '#a97644';
    roundRectPath(ctx, -c.w / 2 + 3, -c.h / 2 + 3, c.w - 6, c.h - 9, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(96,60,26,0.35)'; ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-c.w / 2 + 8, -c.h / 2 + (i / 4) * c.h);
      ctx.lineTo(c.w / 2 - 8, -c.h / 2 + (i / 4) * c.h);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(70,42,18,0.5)'; ctx.lineWidth = 2.5;
    roundRectPath(ctx, -c.w / 2, -c.h / 2, c.w, c.h, 12); ctx.stroke();
    ctx.restore();
    // the sewing basket on the seat: why there is thread on this floor at all
    ctx.save();
    ctx.translate(c.x - 6, c.y + 4);
    ctx.fillStyle = 'rgba(60,38,16,0.22)';
    ctx.beginPath(); ctx.ellipse(3, 4, 22, 15, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d6ab72';
    ctx.beginPath(); ctx.ellipse(0, 0, 21, 16, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7d5a33';
    ctx.beginPath(); ctx.ellipse(0, 0, 15, 11, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5f7fe0';
    ctx.beginPath(); ctx.arc(-4, -1, 7, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(-4, -1, 6 - i * 1.8, 4 - i * 1.2, i * 1.1, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = '#17b1a0';
    ctx.beginPath(); ctx.arc(7, 3, 5.5, 0, TAU); ctx.fill();
    ctx.restore();
    this._drawBow(ctx, this.legB);
  }

  _drawLeg(ctx, l, k) {
    const s = k || 1;
    ctx.fillStyle = 'rgba(40,28,16,0.20)';
    ctx.beginPath(); ctx.ellipse(l.x + 7 * s, l.y + 9 * s, 16 * s, 7 * s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6f4829';
    ctx.beginPath(); ctx.ellipse(l.x, l.y, 13 * s, 11 * s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#93643b';
    ctx.beginPath(); ctx.ellipse(l.x - 2 * s, l.y - 2 * s, 9 * s, 7 * s, 0, 0, TAU); ctx.fill();
  }

  /** The knot: this is WHY the ribbon can never be taken. */
  _drawBow(ctx, l) {
    const tug = this.ribbon ? this.ribbon.tugged : 0;
    const w = 1 + 0.10 * Math.sin(this.t * 22) * tug;
    ctx.save();
    ctx.translate(l.x, l.y - 4);
    ctx.rotate(0.3 + tug * 0.12 * Math.sin(this.t * 17));
    ctx.scale(w, 2 - w);
    ctx.fillStyle = '#ef4f6b';
    for (let k = -1; k <= 1; k += 2) {
      ctx.beginPath();
      ctx.ellipse(k * 11, -2, 10, 7, k * 0.5, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(110,26,44,0.45)'; ctx.lineWidth = 1.4;
    for (let k = -1; k <= 1; k += 2) {
      ctx.beginPath(); ctx.ellipse(k * 11, -2, 10, 7, k * 0.5, 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = '#ffd9e0';
    ctx.beginPath(); ctx.ellipse(0, -2, 5, 4.4, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  _drawShine(ctx) {
    if (this.shineT <= 0) return;
    const u = this.shineT;
    const a = Math.sin(clamp(u, 0, 1) * Math.PI) * 0.5 + (u >= 1 ? 0.10 : 0);
    if (a <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (this.pose === 'portrait') {
      const y = lerp(this.p0.y + 40, this.yFar + 40, u);
      const hw = this._halfAt(y) * 0.95;
      const g = ctx.createLinearGradient(0, y - 80, 0, y + 80);
      g.addColorStop(0, 'rgba(255,250,232,0)');
      g.addColorStop(0.5, 'rgba(255,250,232,' + a.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,250,232,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-hw, y - 80, hw * 2, 160);
    } else {
      const x = lerp(this.p0.x - 40, this.vw * 0.46, u);
      const g = ctx.createLinearGradient(x - 80, 0, x + 80, 0);
      g.addColorStop(0, 'rgba(255,250,232,0)');
      g.addColorStop(0.5, 'rgba(255,250,232,' + a.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,250,232,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 80, this.wallY, 160, this.vh);
    }
    ctx.restore();
  }

  /** Lint in the air, drifting: the corridor is never dead still. */
  _drawMotes(ctx) {
    ctx.fillStyle = 'rgba(255,248,230,0.5)';
    const t = this.t;
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      ctx.globalAlpha = 0.14 + 0.16 * (0.5 + 0.5 * Math.sin(m.ph + t));
      ctx.beginPath();
      ctx.arc(m.x + Math.sin(m.ph + t * m.sp) * 9, m.y + Math.cos(m.ph * 1.3 + t * m.sp * 0.7) * 6, m.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- chaining

  entry() {
    // arriving from the toy room: low and from behind, so the first thread that
    // room hinted at is the first thing in view
    return this.pose === 'portrait'
      ? { x: 0, y: this.vh * 0.40, zoom: this.scale * 1.05, tilt: 0.30 }
      : { x: -this.vw * 0.38, y: this.vh * 0.10, zoom: this.scale * 1.05, tilt: 0.18 };
  }

  exit() { return { to: this.exitCam, dur: 1.5, next: 'sand' }; }
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
