import { Debris, State } from './base.js';
import { Powder } from '../core/powder.js';
import { Airborne } from '../core/airborne.js';
import { clamp } from '../core/math.js';
import { makeCanvas } from '../floors/floor.js';

const F = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };
const AIM = { x: 0, y: 0 };

/** How many cup deposits a whole spill is worth; `batch` is derived from it. */
const DEPOSITS = 85;
/** Head speed (design px/s) at which a pass starts to throw flour up. */
const GUST_LO = 360;
const GUST_HI = 980;
/** Resolution of the progress map kept across an orientation change. */
const EU = 26, EV = 18;

/**
 * The flour spill: the one debris in the game that shows you the AIR.
 *
 * It is a `Powder` density film plus an `Airborne` speck layer, and the two
 * trade mass in both directions, which is the whole mechanic:
 *
 *   advect      every frame the film slides a little way down the flow, so it
 *               draws itself into curved streaks that converge on the mouth and
 *               thins along them, leaving clean black tile tracks
 *   suck        at the mouth the film is taken away and banked into the cup in
 *               batches, the way sand is — a white layer, not 4000 pops
 *   puff        moving the head FAST across the film throws it up into the air
 *               as a cloud that hangs, drifts and then settles back down as a
 *               thinner, WIDER film. Rushing spreads it; holding gathers it.
 *   drift       at the far edge, where the air is barely felt, single specks
 *               lift off the surface and creep in at ankle height
 *
 * Nothing here measures distance to the nozzle: the film samples
 * `vac.field()` per cell and the specks sample it per speck.
 */
export class FlourSpill extends Debris {
  constructor(rect, rng, opts = {}) {
    super((rect.x0 + rect.x1) * 0.5, (rect.y0 + rect.y1) * 0.5);
    this.rng = rng;
    this.rect = rect;
    this.pw = new Powder(rect, opts.cols || 48, opts.rows || 48, {
      cleanEps: 0.07, color: opts.color || '#fbf6ea',
    });
    this.air = new Airborne(opts.pool || 300, {
      kinds: {
        // `r` is deliberately small: it is what the cup charges for a speck.
        // How big a speck LOOKS is `drawAir`'s business, not the cup's.
        flour: { color: '#fdfaf3', drag: 3.0, gravity: 84, r: 1.25, life: 3.2, lift: 1.35 },
      },
    });
    this.color = opts.color || '#fbf6ea';
    this.target = opts.target === undefined ? 0.92 : opts.target;
    this.anchored = true;             // clearStartZone must never drag a film about
    this.d0 = null;                   // the film as it was laid down
    this.total0 = 1;
    this.batch = 1;
    this.cupDebt = 0;
    this.deposited = 0;
    this.roar = 0;                    // 0..1, how hard it is draining (audio)
    this.gust = 0;                    // 0..1, how hard the last pass puffed
    this.dig = 0;                     // 0..1, how long the hold has been digging
    this.frac = 0;                    // cleanFrac, cached
    this.reject = 0;                  // cup-full puff-back, for the scene's fx
    this._aim = { x: this.x, y: this.y };
    this._aimT = 0;
    this._fracT = 0;
    this._puffCool = 0;
    this._driftT = 0;
    this._rejectCool = 0;
    this._settleNorm = 1;
    this._settleR = 13;
    this._fade = 0;                   // set by the scene once the room is done
    // how much film each speck is carrying; `_m` rides on the pooled object
    for (let i = 0; i < this.air.p.length; i++) this.air.p[i]._m = 0;
  }

  get type() { return 'flour'; }
  translate() {}                       // a film does not move house
  aim(out) { out = out || AIM; out.x = this._aim.x; out.y = this._aim.y; return out; }

  // ------------------------------------------------------------ laying it

  /** Pour a fan of flour out of the bag mouth at (sx,sy) heading (dx,dy). */
  fan(sx, sy, dx, dy, len, wide, amount, rng) {
    const l = Math.hypot(dx, dy) || 1;
    const ux = dx / l, uy = dy / l;
    const px = -uy, py = ux;
    for (let i = 0; i < 46; i++) {
      const t = i / 45;
      const along = t * len;
      const spread = wide * (0.22 + t * 1.0);
      const n = 3 + Math.round(t * 5);
      for (let k = 0; k < n; k++) {
        const off = rng.range(-spread, spread);
        const r = 26 + t * 30;
        this.pw.blob(sx + ux * along + px * off + rng.range(-8, 8),
          sy + uy * along + py * off + rng.range(-8, 8),
          r, amount * (1.05 - t * 0.55) / n);
      }
    }
  }

  /** A drift banked up against something solid. */
  drift(x, y, r, amount) { this.pw.blob(x, y, r, amount); }

  /**
   * Fade the film out toward the edges of a rectangle instead of guillotining
   * it. A spill with a straight edge is a painted rectangle; a spill that
   * thins away at its rim is flour.
   */
  feather(rect, w) {
    const pw = this.pw;
    for (let cy = 0; cy < pw.rows; cy++) {
      const wy = pw.worldY(cy);
      const ky = clamp((wy - rect.y0) / w, 0, 1) * clamp((rect.y1 - wy) / w, 0, 1);
      for (let cx = 0; cx < pw.cols; cx++) {
        const wx = pw.worldX(cx);
        const k = ky * clamp((wx - rect.x0) / w, 0, 1) * clamp((rect.x1 - wx) / w, 0, 1);
        const i = cy * pw.cols + cx;
        pw.d[i] *= k * k * (3 - 2 * k);
      }
    }
  }

  /** Zero the film outside a rectangle — nothing may be laid out of reach. */
  clipTo(rect) {
    const pw = this.pw;
    for (let cy = 0; cy < pw.rows; cy++) {
      const wy = pw.worldY(cy);
      for (let cx = 0; cx < pw.cols; cx++) {
        if (wy >= rect.y0 && wy <= rect.y1) {
          const wx = pw.worldX(cx);
          if (wx >= rect.x0 && wx <= rect.x1) continue;
        }
        pw.d[cy * pw.cols + cx] = 0;
      }
    }
  }

  /** Zero the film in a disc — the parked nozzle's own patch of floor. */
  clearDisc(wx, wy, r) {
    const pw = this.pw;
    for (let cy = 0; cy < pw.rows; cy++) {
      const dy = pw.worldY(cy) - wy;
      for (let cx = 0; cx < pw.cols; cx++) {
        const dx = pw.worldX(cx) - wx;
        if (dx * dx + dy * dy < r * r) pw.d[cy * pw.cols + cx] = 0;
      }
    }
  }

  /** Freeze what has to be cleaned and calibrate the cup batches against it. */
  seal() {
    this.pw.markDirty();
    this.d0 = new Float32Array(this.pw.d);
    this.total0 = Math.max(1e-3, this.pw.total());
    this.batch = this.total0 / DEPOSITS;
    const rs = 13;
    this._settleNorm = Math.max(0.2, (Math.PI * rs * rs * 0.5) / (this.pw.cw * this.pw.ch));
    this._settleR = rs;
    this.frac = this.pw.cleanFrac();
    return this.total0;
  }

  densityAt(x, y) { return this.pw.get(x, y); }
  cleanFrac() { return this.frac; }

  /**
   * Something solid dragged through the film pushes the powder off itself and
   * banks it up around its edge. The spoon uses this; it is why flour slides
   * off a spoon instead of the spoon being a hole in the picture.
   */
  sweep(wx, wy, r) {
    const pw = this.pw;
    const c0 = pw.cx(wx - r), c1 = pw.cx(wx + r);
    const r0 = pw.cy(wy - r), r1 = pw.cy(wy + r);
    let moved = 0;
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        if (!pw.inside(cx, cy)) continue;
        const dx = pw.worldX(cx) - wx, dy = pw.worldY(cy) - wy;
        const q = Math.hypot(dx, dy) / r;
        if (q > 1) continue;
        const i = pw.idx(cx, cy);
        const take = pw.d[i] * 0.5 * (1 - q * q);
        pw.d[i] -= take; moved += take;
      }
    }
    if (moved > 1e-4) pw.blob(wx, wy, r * 1.55, moved / (this._settleNorm * 3.4));
  }

  // --------------------------------------------------------------- update

  update(dt, vac, world) {
    this.t += dt;

    // ---- the air made visible: the film streaks toward the mouth ---------
    const swirl = 0.62;
    this._advect(vac, dt, 380, swirl);

    // the flow just in front of the mouth, which is what everything scales by
    const f = vac.field(vac.mouthX + vac.dirX * 15, vac.mouthY + vac.dirY * 15, F);
    const s = f.strength;
    this.strength = s;

    // ---- a hold digs: the longer it stays, the wider the hole -----------
    const holding = vac.powerN > 0.45 && s > 0.35;
    this.dig = clamp(this.dig + (holding ? dt / 1.5 : -dt / 0.5), 0, 1);

    // ---- suck ------------------------------------------------------------
    let got = 0;
    if (!vac.cupFull && s > 0.05 && this._fade <= 0) {
      const r = 29 + 16 * vac.powerN + 20 * this.dig;
      got = this.pw.suck(vac.mouthX, vac.mouthY, r, 4.0 * dt * s);
      this.cupDebt += got;
    }
    while (this.cupDebt >= this.batch) {
      this.cupDebt -= this.batch;
      this.deposited++;
      vac.transit({ kind: 'wisp', color: '#fdfaf3', size: 5.4 });
    }

    // ---- a fast pass throws the film up into the air ----------------------
    const spd = Math.hypot(vac.nozzle.vx, vac.nozzle.vy);
    const g = clamp((spd - GUST_LO) / (GUST_HI - GUST_LO), 0, 1);
    this.gust += (g - this.gust) * (1 - Math.exp(-9 * dt));
    this._puffCool -= dt;
    if (g > 0.06 && s > 0.08 && this._puffCool <= 0 && !vac.cupFull && this._fade <= 0 && this.air.n < 170) {
      this._puffCool = 0.10;
      const pr = 46 + 30 * g;
      const m = this.pw.puff(vac.mouthX, vac.mouthY, pr, 0.22 + 0.42 * g);
      if (m > 0.02) this._spawnCloud(m, vac.mouthX, vac.mouthY, pr, g, vac);
    }

    // ---- the far edge: single specks creep off the surface -----------------
    this._driftT -= dt;
    if (this._driftT <= 0 && this._fade <= 0 && this.air.n < 95) {
      this._driftT = 0.17;
      this._drift(vac);
    }

    // ---- a full cup blows the flour back off the mouth --------------------
    this.reject = Math.max(0, this.reject - dt * 3);
    this._rejectCool -= dt;
    if (vac.cupFull && s > 0.10 && this._rejectCool <= 0) {
      const m = this.pw.puff(vac.mouthX, vac.mouthY, 46, 0.22);
      if (m > 0.002) {
        this._rejectCool = 0.09;
        this.reject = 1;
        const n = clamp(Math.round(m * 40), 3, 14);
        for (let i = 0; i < n; i++) {
          const a = this.rng.range(0, Math.PI * 2);
          const sp = this.rng.range(90, 230);
          this.air.spawn(vac.mouthX + this.rng.range(-10, 10),
            vac.mouthY + this.rng.range(-10, 10), this.rng.range(6, 22),
            Math.cos(a) * sp - vac.dirX * 140, Math.sin(a) * sp - vac.dirY * 140,
            this.rng.range(70, 170), 'flour')._m = m / n;
        }
      }
    }

    // ---- the cloud: settle it back into the film --------------------------
    this.air.update(dt, vac);
    this._settle();

    // ---- fading the last thin haze once the room is finished --------------
    if (this._fade > 0) {
      const k = Math.exp(-this._fade * dt);
      const d = this.pw.d;
      for (let i = 0; i < d.length; i++) d[i] *= k;
    }

    // ---- progress, aim and the sound of a mass draining -------------------
    this._fracT -= dt;
    if (this._fracT <= 0) { this._fracT = 0.12; this.frac = this.pw.cleanFrac(); }
    this._aimT -= dt;
    if (this._aimT <= 0) { this._aimT = 0.22; this._findAim(); }
    const flow = clamp(got / (dt * 1.4 + 1e-6), 0, 1);
    this.roar += (Math.max(flow, this.gust * 0.8) - this.roar) * (1 - Math.exp(-7 * dt));

    if (got > 0.004 || this.gust > 0.1) this.state = State.PULLED;
    else if (s > 0.12) this.state = State.REACTING;
    else this.state = State.IDLE;
    if (this.frac >= this.target) this.state = State.DONE;
  }

  /**
   * `Powder.advect` with a curl added: far from the mouth the air comes round
   * in an arc and only straightens out as it is swallowed, so the streaks are
   * a visible SWIRL into the mouth rather than a set of spokes. Same single
   * pass and the same clamped step as the core version.
   */
  _advect(vac, dt, gain, swirl) {
    const pw = this.pw;
    const C = pw.cols, R = pw.rows, d = pw.d, t = pw._t;
    const step = Math.min(0.05, dt);
    const x0 = pw.rect.x0, y0 = pw.rect.y0, cw = pw.cw, ch = pw.ch;
    if (!this._touch) this._touch = new Int32Array(C * R);
    const touch = this._touch;
    let nt = 0, was = 0, now = 0;
    t.set(d);
    for (let cy = 0; cy < R; cy++) {
      const wy = pw.worldY(cy);
      for (let cx = 0; cx < C; cx++) {
        const i = cy * C + cx;
        const v0 = t[i];
        if (v0 <= 0.0005) { d[i] = v0; continue; }
        const wx = pw.worldX(cx);
        const f = vac.field(wx, wy, F);
        if (f.strength < 0.02) { d[i] = v0; continue; }
        const a = swirl / (1 + f.strength * 3.4);
        const ca = Math.cos(a), sa = Math.sin(a);
        const fx = f.fx * ca - f.fy * sa;
        const fy = f.fx * sa + f.fy * ca;
        const sx = clamp((wx - fx * gain * step - x0) / cw - 0.5, 0, C - 1.001);
        const sy = clamp((wy - fy * gain * step - y0) / ch - 0.5, 0, R - 1.001);
        const ix = sx | 0, iy = sy | 0;
        const tx = sx - ix, ty = sy - iy;
        const p = iy * C + ix;
        const aa = t[p], bb = t[p + 1], cc = t[p + C], ee = t[p + C + 1];
        const top = aa + (bb - aa) * tx;
        const bot = cc + (ee - cc) * tx;
        const v = top + (bot - top) * ty;
        const k = clamp(f.strength * 1.45, 0, 0.72);
        const nv = v0 + (v - v0) * k;
        d[i] = nv;
        touch[nt++] = i;
        was += v0; now += nv;
      }
    }
    // Semi-Lagrangian sampling leaks mass at the leading edge of the film, and
    // that leak is invisible cleaning: flour would disappear without going up
    // the tube, which would make the room shorter the harder the air blows.
    // Give the leak back to the cells the air is actually touching, so the
    // flour GATHERS where the flow is instead of evaporating.
    if (nt && now > 1e-6 && was > now) {
      const k = Math.min(1.06, was / now);
      for (let i = 0; i < nt; i++) d[touch[i]] *= k;
    }
  }

  _spawnCloud(m, x, y, r, g, vac) {
    const n = clamp(Math.round(4 + m * 22), 3, 26);
    const each = m / n;
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const q = Math.sqrt(this.rng.next()) * r * 0.9;
      const sp = this.rng.range(30, 110) * (0.4 + g);
      this.air.spawn(x + Math.cos(a) * q, y + Math.sin(a) * q,
        this.rng.range(8, 26),
        Math.cos(a) * sp + vac.nozzle.vx * 0.18,
        Math.sin(a) * sp + vac.nozzle.vy * 0.18,
        this.rng.range(110, 150) + 190 * g, 'flour')._m = each;
    }
  }

  /**
   * The far tell. Where the air is only just felt, a few grains lift clear of
   * the surface and creep in at ankle height — the first thing that moves as
   * the machine comes nearer, long before the film streaks.
   */
  _drift(vac) {
    const pw = this.pw;
    for (let k = 0; k < 5; k++) {
      const cx = this.rng.int(0, pw.cols - 1), cy = this.rng.int(0, pw.rows - 1);
      const i = cy * pw.cols + cx;
      if (pw.d[i] < 0.14) continue;
      const wx = pw.worldX(cx), wy = pw.worldY(cy);
      const f = vac.field(wx, wy, F);
      if (f.strength < 0.035 || f.strength > 0.75) continue;
      const m = pw.puff(wx, wy, 11, 0.24);
      if (m < 0.002) continue;
      this.air.spawn(wx, wy, this.rng.range(2, 9),
        f.fx * 140, f.fy * 140, this.rng.range(14, 46), 'flour')._m = m;
      return;
    }
  }

  /** A speck that has come back down puts its flour back on the floor. */
  _settle() {
    const P = this.air.p;
    const rs = this._settleR;
    for (let i = 0; i < P.length; i++) {
      const it = P[i];
      if (!it._m) continue;
      if (it.life <= 0) { it._m = 0; continue; }
      if (it.z > 0.6 || it.vz > 0) continue;
      const x = clamp(it.x, this.rect.x0 + rs, this.rect.x1 - rs);
      const y = clamp(it.y, this.rect.y0 + rs, this.rect.y1 - rs);
      this.pw.blob(x, y, rs, it._m / this._settleNorm);
      it._m = 0;
      it.life = 0;
    }
  }

  /** The thickest square of film left: what the harness and the child aim at. */
  _findAim() {
    const pw = this.pw;
    let best = -1, bx = this.x, by = this.y;
    for (let cy = 1; cy < pw.rows - 1; cy++) {
      for (let cx = 1; cx < pw.cols - 1; cx++) {
        const i = cy * pw.cols + cx;
        if (!pw.mask[i]) continue;
        const v = pw.d[i] + pw.d[i - 1] + pw.d[i + 1] + pw.d[i - pw.cols] + pw.d[i + pw.cols];
        if (v > best) { best = v; bx = pw.worldX(cx); by = pw.worldY(cy); }
      }
    }
    this._aim.x = bx; this._aim.y = by;
    this.x = bx; this.y = by;
  }

  /** Finish instantly (dev/shot.mjs --complete). */
  devFinish() {
    const d = this.pw.d;
    for (let i = 0; i < d.length; i++) d[i] = 0;
    this.frac = this.pw.cleanFrac();
    this.state = State.DONE;
  }

  /** Start dissolving whatever haze is left, once the room is finished. */
  fadeOut(rate) { this._fade = rate || 2.4; }

  // ----------------------------------------------------------------- draw

  draw(ctx, cam) {
    const pw = this.pw, C = pw.cols, R = pw.rows, d = pw.d;
    if (!this._img) {
      this._can = makeCanvas(C, R);
      this._ictx = this._can.getContext('2d');
      this._img = this._ictx.createImageData(C, R);
      this._blur = new Float32Array(C * R);
      const px = this._img.data;
      const r = parseInt(this.color.slice(1, 3), 16);
      const g = parseInt(this.color.slice(3, 5), 16);
      const b = parseInt(this.color.slice(5, 7), 16);
      for (let i = 0; i < C * R; i++) { px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; }
    }
    // One low-resolution bitmap, blown up with the bilinear filter: flour is
    // the one thing in the game that SHOULD be soft, and this is a single
    // filtered blit of the spill's own rectangle instead of five thousand
    // little alpha rects.
    const px = this._img.data;
    const bl = this._blur;
    // a 1-2-1 blur before the blit: it is three cheap passes over a 56x48
    // bitmap, and it is the difference between flour and a mosaic
    for (let cy = 0; cy < R; cy++) {
      const o = cy * C;
      for (let cx = 0; cx < C; cx++) {
        const l = cx > 0 ? d[o + cx - 1] : d[o + cx];
        const r2 = cx < C - 1 ? d[o + cx + 1] : d[o + cx];
        bl[o + cx] = (l + d[o + cx] * 2 + r2) * 0.25;
      }
    }
    let any = 0;
    // opacity saturates: a haze is see-through and anything like a real
    // covering of flour hides the floor completely, so the motif only appears
    // where the film has actually been taken away
    for (let cy = 0; cy < R; cy++) {
      const o = cy * C;
      for (let cx = 0; cx < C; cx++) {
        const i = o + cx;
        const u = cy > 0 ? bl[i - C] : bl[i];
        const w = cy < R - 1 ? bl[i + C] : bl[i];
        const dv = (u + bl[i] * 2 + w) * 0.25;
        const v = dv <= 0.010 ? 0 : (253 - 253 * Math.exp(-4.4 * dv)) | 0;
        px[i * 4 + 3] = v;
        any += v;
      }
    }
    if (!any) return;
    this._ictx.putImageData(this._img, 0, 0);
    const rc = pw.rect;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this._can, rc.x0, rc.y0, rc.x1 - rc.x0, rc.y1 - rc.y0);
    // and a crumb pass on the THICK cells only, so a deep drift has grain in
    // it and does not read as poured paint
    ctx.fillStyle = '#ffffff';
    const cw = pw.cw, ch = pw.ch;
    for (let cy = 0; cy < R; cy++) {
      for (let cx = 0; cx < C; cx++) {
        const v = d[cy * C + cx];
        if (v <= 0.62) continue;
        ctx.globalAlpha = clamp((v - 0.62) * 0.55, 0, 0.35);
        ctx.fillRect(rc.x0 + cx * cw, rc.y0 + cy * ch, cw, ch);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  /**
   * The cloud, drawn in FRONT of the machine: it is in the air, not on the
   * floor. Drawn here rather than by `Airborne.draw` so a speck can look like
   * a puff of flour without the dust cup charging for a puff of flour — the
   * cup's unit is `kind.r`, and at the size a 4-year-old needs to see, a
   * room's worth of specks would fill it on their own.
   */
  drawAir(ctx, cam) {
    const P = this.air.p;
    ctx.save();
    ctx.fillStyle = 'rgba(34,26,14,0.18)';
    for (let i = 0; i < P.length; i++) {
      const it = P[i];
      if (it.life <= 0 || it.z < 3) continue;
      ctx.globalAlpha = clamp(1 - it.z / 170, 0.10, 1) * clamp(it.life, 0, 1) * 0.55;
      ctx.beginPath();
      ctx.ellipse(it.x + it.z * 0.12, it.y + it.z * 0.22, it.r * 2.1, it.r * 0.95, 0, 0, 6.28318);
      ctx.fill();
    }
    ctx.fillStyle = '#fdfaf3';
    for (let i = 0; i < P.length; i++) {
      const it = P[i];
      if (it.life <= 0) continue;
      const sc = 2.4 * (1 + it.z / 190);
      ctx.globalAlpha = clamp(it.life / Math.max(0.3, it.maxLife * 0.45), 0, 1) * 0.95;
      ctx.beginPath();
      ctx.arc(it.x, it.y - it.z * 0.55, it.r * sc, 0, 6.28318);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ------------------------------------------------- orientation change

  /**
   * The spill's own frame: along the fan (u, 0 at the bag's neck, 1 at the far
   * end) and across it (v, in half-widths).
   *
   * Progress is stored in THAT frame, not in screen fractions, because the two
   * poses lay out different fans in different rooms — but both fans are built
   * from the same (u, v) recipe, so a track the child wiped at the middle of
   * the tongue is still at the middle of the tongue after they turn the iPad
   * over.
   */
  setAxis(ax, ay, ux, uy, len, halfW) {
    this.ax = ax; this.ay = ay; this.ux = ux; this.uy = uy;
    this.alen = Math.max(1, len); this.ahalf = Math.max(1, halfW);
  }

  _bin(wx, wy) {
    const dx = wx - this.ax, dy = wy - this.ay;
    const u = clamp((dx * this.ux + dy * this.uy) / this.alen, -0.2, 1.2);
    const v = clamp((dx * -this.uy + dy * this.ux) / this.ahalf, -1.3, 1.3);
    const bu = Math.min(EU - 1, ((u + 0.2) / 1.4 * EU) | 0);
    const bv = Math.min(EV - 1, ((v + 1.3) / 2.6 * EV) | 0);
    return bu * EV + bv;
  }

  /** How much of the film is left, bin by bin, in the spill's own frame. */
  saveTo(persist) {
    if (!this.ax && this.ax !== 0) return;
    const N = EU * EV;
    if (!persist.ero || persist.ero.length !== N) persist.ero = new Array(N).fill(1);
    if (!this._eN) { this._eN = new Float32Array(N); this._eD = new Float32Array(N); }
    const num = this._eN, den = this._eD;
    num.fill(0); den.fill(0);
    const pw = this.pw, d0 = this.d0;
    for (let cy = 0; cy < pw.rows; cy++) {
      const wy = pw.worldY(cy);
      for (let cx = 0; cx < pw.cols; cx++) {
        const i = cy * pw.cols + cx;
        if (d0[i] <= 0.02) continue;
        const b = this._bin(pw.worldX(cx), wy);
        num[b] += pw.d[i]; den[b] += d0[i];
      }
    }
    for (let b = 0; b < N; b++) persist.ero[b] = den[b] > 0 ? clamp(num[b] / den[b], 0, 1.3) : 1;
    persist.dep = this.deposited;
    persist.frac = this.frac;
  }

  loadFrom(persist) {
    const e = persist.ero;
    if (!e || e.length !== EU * EV) return;
    const pw = this.pw;
    for (let cy = 0; cy < pw.rows; cy++) {
      const wy = pw.worldY(cy);
      for (let cx = 0; cx < pw.cols; cx++) {
        pw.d[cy * pw.cols + cx] *= e[this._bin(pw.worldX(cx), wy)];
      }
    }
    this.deposited = persist.dep || 0;
    this.frac = this.pw.cleanFrac();
    if (this.frac >= this.target) this.state = State.DONE;
  }

  snapshot() {
    const s = super.snapshot();
    s.clean = +this.frac.toFixed(3);
    s.gust = +this.gust.toFixed(3);
    s.dig = +this.dig.toFixed(3);
    s.roar = +this.roar.toFixed(3);
    s.reject = +this.reject.toFixed(2);
    s.air = this.air.n;
    s.caught = this.air.captured;
    s.dep = this.deposited;
    return s;
  }
}
