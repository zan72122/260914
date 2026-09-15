import { Debris, State } from './base.js';
import { HeightField } from '../core/heightfield.js';
import { makeCanvas } from '../floors/floor.js';
import { clamp, TAU } from '../core/math.js';

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };

/* ---- tuning (height units; one cell is ~7.5 design px wide) -------------- */
const EAT = 5;          // units/s/cell swallowed inside the capture ellipse at strength 1
const LIFT_S0 = 0.34;   // above this the flow lifts grain off the open surface
const LIFT = 9;         // units/s/cell lifted off the open surface, and it
const LIFT_CAP = 1.1;   // saturates: the bowl is broad and flat, not a spike
const SHIM_S0 = 0.04;   // the faint shimmer starts this early
const ROLL_S0 = 0.11;   // a grain leaves the surface and rolls from here
const ROLL_GO = 0.52;   // a rolling grain is torn off the floor and flies in
const GRAIN_MASS = 2.6; // units of drained sand each visible flying grain stands for
const ROLL_MASS = 2.4;  // units a surface grain takes with it
const CUP_BATCH = 55;   // units per deposit in the dust cup (also the tube stream rate)
const SLUMP_DIFF = 7.5; // height step between neighbours that makes a wall let go
const RELAX_REPOSE = 0.62;
const RELAX_RATE = 0.42;
const MAXH = 30;
const WAKE_DECAY = 1.3; // how long a cell keeps being scoured after the head passes
const RIM = 4.2;        // slope (height per cell) at which a crater wall catches a hard edge

const N_GRAINS = 280;

/**
 * A pile of sand on a height field.
 *
 * Nothing here knows where the nozzle is: every cell asks vacuum.field() for the
 * airflow over itself. That single rule produces the whole chain —
 *
 *   far   the surface nearest the mouth shimmers, single grains skitter loose
 *   mid   the near slope trickles: grains roll down and race away
 *   near  the capture zone eats a crater; relax() slides the walls in after it
 *   hold  the crater widens until the floor pattern shows through
 *   steep a wall passes the angle of repose and a whole chunk slides at once
 *
 * Mass that goes into the mouth is batched into the dust cup as a rising layer
 * of sand rather than one item per grain.
 */
export class SandPile extends Debris {
  constructor(rect, rng, opts = {}) {
    const cx = (rect.x0 + rect.x1) / 2, cy = (rect.y0 + rect.y1) / 2;
    super(cx, cy);
    this.rng = rng;
    const w = rect.x1 - rect.x0, h = rect.y1 - rect.y0;
    const cols = clamp(Math.round(w / 7.6), 12, 64);
    const rows = clamp(Math.round(h / 7.6), 12, 48);
    this.hf = new HeightField(rect, cols, rows);
    this.rect = rect;
    this.cols = cols; this.rows = rows;
    this.lo = opts.lo || '#e6d1a1';
    this.hi = opts.hi || '#f2e3bd';
    this.shim = new Float32Array(cols * rows);
    this.wake = new Float32Array(cols * rows);
    this.mass0 = 1;
    this.cupDebt = 0;
    this.spawnDebt = 0;
    this.eaten = 0;          // total units that reached the mouth
    this.slumps = 0;
    this._slumpT = 0;
    this._slumpCool = 0;
    this.slumpFX = { t: 0, dur: 0.45, x: 0, y: 0, dx: 0, dy: 0, r: 20, run: 30 };
    this._sites = new Float32Array(32);   // ring buffer of recently eaten spots
    this._siteN = 0;
    this._trickle = 0;
    this._roar = 0;          // 0..1 how hard it is draining right now (for fx)
    this._frac = 1;
    this._cleared = false;
    this._mcx = 0; this._mcy = 0;

    // grain pool
    this.grains = [];
    for (let i = 0; i < N_GRAINS; i++) {
      this.grains.push({ on: 0, x: 0, y: 0, vx: 0, vy: 0, r: 1.6, m: 0, mode: 0, life: 0, rot: 0, spin: 0, c: 0 });
    }
    this._gi = 0;

    // render targets
    this.gw = Math.max(1, Math.round(w));
    this.gh = Math.max(1, Math.round(h));
    this.cell = makeCanvas(cols, rows);
    this.cellCtx = this.cell.getContext('2d');
    this.img = this.cellCtx.createImageData(cols, rows);
    this.sprite = makeCanvas(this.gw, this.gh);
    this.sctx = this.sprite.getContext('2d');
    this.speck = makeCanvas(this.gw, this.gh);
    this._bakeSpeck(rng);
  }

  get type() { return 'sand'; }

  // ------------------------------------------------------------- building

  /** Heap a smooth mound. */
  heap(x, y, r, amount) { this.hf.addRadial(x, y, r, amount); return this; }

  /** Diffuse only the cells the airflow has been working (mass conserving). */
  _smoothActive(k) {
    const h = this.hf.h, d = this.hf._d, w = this.wake, C = this.cols, R = this.rows;
    for (let y = 1; y < R - 1; y++) {
      for (let x = 1; x < C - 1; x++) {
        const i = y * C + x;
        if (w[i] < 0.25) { d[i] = h[i]; continue; }
        d[i] = h[i] + ((h[i - 1] + h[i + 1] + h[i - C] + h[i + C]) * 0.25 - h[i]) * k;
      }
    }
    for (let y = 1; y < R - 1; y++) {
      for (let x = 1; x < C - 1; x++) { const i = y * C + x; if (w[i] >= 0.25) h[i] = d[i]; }
    }
  }

  /** Blend the heaps into one mound so the lobes do not read as separate domes. */
  smooth(passes = 2, k = 0.4) {
    const h = this.hf.h, d = this.hf._d, C = this.cols, R = this.rows;
    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < R; y++) {
        for (let x = 0; x < C; x++) {
          const i = y * C + x;
          const l = x > 0 ? h[i - 1] : h[i], r = x < C - 1 ? h[i + 1] : h[i];
          const u = y > 0 ? h[i - C] : h[i], w = y < R - 1 ? h[i + C] : h[i];
          d[i] = h[i] + ((l + r + u + w) * 0.25 - h[i]) * k;
        }
      }
      for (let i = 0; i < h.length; i++) h[i] = d[i];
    }
    return this;
  }

  /** Call once the heaps are in: records the reference mass. */
  seal() {
    this.mass0 = Math.max(1, this.hf.total());
    return this;
  }

  heightAt(x, y) { return this.hf.get(x, y); }
  get mass() { return this.hf.total(); }
  get fraction() { return this.hf.total() / this.mass0; }

  /**
   * Orientation change: the grid is laid out relative to the mat and has the
   * same size in both poses, so the heights can simply be carried across.
   * Copies into a buffer the scene owns; no allocation after the first call.
   */
  saveTo(store) {
    if (!store.sandH || store.sandH.length !== this.hf.h.length) {
      store.sandH = new Float32Array(this.hf.h.length);
    }
    store.sandH.set(this.hf.h);
    store.sandMass0 = this.mass0;
  }
  loadFrom(store) {
    if (!store.sandH || store.sandH.length !== this.hf.h.length) return false;
    this.hf.h.set(store.sandH);
    if (store.sandMass0) this.mass0 = store.sandMass0;
    return true;
  }

  // -------------------------------------------------------------- update

  update(dt, vac, world, sctx) {
    if (this.state === State.DONE) {
      if (!this._cleared) { this.hf.h.fill(0); this._cleared = true; this._killGrains(); }
      return;
    }
    this.t += dt;
    const hf = this.hf, h = hf.h, C = this.cols, R = this.rows;
    const mx = vac.mouthX, my = vac.mouthY;

    // ---- shimmer memory decays everywhere, is refreshed where the air blows
    const decay = Math.exp(-3.4 * dt);
    const wdecay = Math.exp(-WAKE_DECAY * dt);
    for (let i = 0; i < this.shim.length; i++) { this.shim[i] *= decay; this.wake[i] *= wdecay; }

    // ---- the cells under the airflow -------------------------------------
    // Empty cells cost nothing (the height test comes before the field sample),
    // so the scan can cover the whole reach of the airflow: that is what makes
    // the far surface shimmer long before anything actually moves.
    let taken = 0, peakS = 0, lifted = 0;
    // Once the pile is down to a film there is no body left to hold it: the
    // airflow takes the last of it wholesale, so the player is never left
    // hunting for invisible specks to finish the scene.
    const thin = 0.45 + (1 - Math.min(1, this._frac / 0.2)) * 2.6;
    const REACH = 340;
    this._mcx = hf.cx(mx); this._mcy = hf.cy(my);
    const c0 = Math.max(0, hf.cx(mx - REACH)), c1 = Math.min(C - 1, hf.cx(mx + REACH));
    const r0 = Math.max(0, hf.cy(my - REACH)), r1 = Math.min(R - 1, hf.cy(my + REACH));
    for (let cy = r0; cy <= r1; cy++) {
      const wy = hf.worldY(cy);
      for (let cx = c0; cx <= c1; cx++) {
        const i = cy * C + cx;
        const hv = h[i];
        if (hv <= 0.005) continue;
        const wx = hf.worldX(cx);
        const f = vac.field(wx, wy, TMPF);
        const s = f.strength;
        if (s < SHIM_S0) continue;
        if (s > peakS) peakS = s;
        if (s > this.shim[i]) this.shim[i] = s;

        if (hv < thin && s > 0.2) { taken += hv; h[i] = 0; continue; }
        // The cell keeps being scoured for a moment after the head has moved
        // on, so a moving head leaves a trough behind it instead of a hole that
        // closes the instant it passes.
        if (s > this.wake[i]) this.wake[i] = s;
        const se = s > this.wake[i] * 0.80 ? s : this.wake[i] * 0.80;
        let take = 0;
        if (f.inCapture) take = EAT * s * dt;
        else if (se > LIFT_S0) {
          const ex = se - LIFT_S0;
          take = LIFT * (ex < LIFT_CAP ? ex : LIFT_CAP) * dt;
          lifted += take;
        }
        if (take > 0) {
          if (take > hv) take = hv;
          h[i] = hv - take;
          taken += take;
          if (take > 0.04) this._site(wx, wy);
        } else if (s > ROLL_S0 && hv > 0.5) {
          // the surface itself starts to creep: single grains let go and roll
          const p = (s - ROLL_S0) * 0.55 * dt;
          if (this.rng.next() < p) this._spawnRoll(wx, wy, hv);
        }
      }
    }
    this.eaten += taken;
    this.cupDebt += taken;
    this.spawnDebt += taken;
    this._roar += (clamp(taken / (dt * 90 + 1e-6), 0, 1) - this._roar) * (1 - Math.exp(-7 * dt));
    this._trickle = clamp(lifted * 40, 0, 1);

    // ---- the removed mass becomes a visible stream of grains -------------
    let guard = 24;
    while (this.spawnDebt >= GRAIN_MASS && guard-- > 0) {
      this.spawnDebt -= GRAIN_MASS;
      this._spawnStream(mx, my);
    }
    if (this.spawnDebt > GRAIN_MASS * 26) this.spawnDebt = GRAIN_MASS * 26;

    // ---- the walls slide in after the crater -----------------------------
    hf.relax(dt * RELAX_RATE, RELAX_REPOSE);
    // Sand that the air has been working keeps a smooth surface: without this
    // the per-cell erosion leaves grid noise, and noise makes the slope shading
    // (which is what draws the crater) fire everywhere instead of on the walls.
    this._smoothActive(clamp(dt * 9, 0, 0.35));

    // ---- and every so often a whole chunk lets go at once ----------------
    this._slumpCool -= dt;
    this._slumpT -= dt;
    if (this._slumpT <= 0) {
      this._slumpT = 0.08;
      if (this._slumpCool <= 0) this._checkSlump(mx, my, world, sctx);
    }
    if (this.slumpFX.t > 0) this.slumpFX.t -= dt;

    // ---- grains ----------------------------------------------------------
    this._updateGrains(dt, vac);

    // ---- the cup fills with a layer of sand, not with 900 grains ---------
    while (this.cupDebt >= CUP_BATCH) {
      this.cupDebt -= CUP_BATCH;
      vac.transit({ kind: 'crumb', color: this.rng.next() < 0.5 ? '#e7d3a3' : '#d8c08a', size: 5.2 });
    }

    // ---- state / completion ---------------------------------------------
    const frac = this.fraction;
    this._frac = frac;
    if (taken > 0.02) this.state = State.PULLED;
    else if (peakS > 0.12) this.state = State.REACTING;
    else this.state = State.IDLE;
    this.strength = peakS;
    if (frac < 0.012 && this._activeGrains() === 0) {
      this.hf.h.fill(0);
      this._cleared = true;
      this.state = State.DONE;
      world && world.onCaptured && world.onCaptured(this);
    }
  }

  /** Remember where mass was just taken from, so grains spawn there. */
  _site(x, y) {
    const n = this._siteN;
    this._sites[(n % 16) * 2] = x;
    this._sites[(n % 16) * 2 + 1] = y;
    this._siteN = n + 1;
  }

  _grain() {
    const g = this.grains;
    for (let k = 0; k < N_GRAINS; k++) {
      this._gi = (this._gi + 1) % N_GRAINS;
      if (!g[this._gi].on) return g[this._gi];
    }
    return null;
  }
  _activeGrains() {
    let n = 0;
    for (let i = 0; i < N_GRAINS; i++) if (this.grains[i].on) n++;
    return n;
  }
  _killGrains() { for (let i = 0; i < N_GRAINS; i++) this.grains[i].on = 0; }

  /** A grain torn straight off the sand and racing into the mouth. */
  _spawnStream(mx, my) {
    const g = this._grain();
    if (!g) return;
    const n = Math.min(16, this._siteN);
    let x, y;
    if (n > 0) {
      const k = (this._siteN - 1 - this.rng.int(0, n - 1) + 16 * 4) % 16;
      x = this._sites[k * 2]; y = this._sites[k * 2 + 1];
    } else { x = mx; y = my; }
    const a = this.rng.range(0, TAU), rad = this.rng.range(0, 11);
    g.on = 1; g.mode = 0;
    g.x = x + Math.cos(a) * rad; g.y = y + Math.sin(a) * rad;
    g.vx = this.rng.range(-70, 70); g.vy = this.rng.range(-70, 70);
    g.r = this.rng.range(1.5, 2.9);
    g.life = 0.75; g.m = GRAIN_MASS; g.c = this.rng.int(0, 2);
    g.rot = this.rng.range(0, TAU); g.spin = this.rng.range(-9, 9);
  }

  /** A grain that lets go of the surface and rolls down toward the mouth. */
  _spawnRoll(x, y, hv) {
    const g = this._grain();
    if (!g) return;
    const m = Math.min(ROLL_MASS, hv * 0.6);
    this.hf.add(x, y, -m);
    g.on = 1; g.mode = 1;
    g.x = x + this.rng.range(-3, 3); g.y = y + this.rng.range(-3, 3);
    g.vx = 0; g.vy = 0;
    g.r = this.rng.range(1.7, 3.1);
    g.life = 3.4; g.m = m; g.c = this.rng.int(0, 2);
    g.rot = this.rng.range(0, TAU); g.spin = this.rng.range(-5, 5);
  }

  _updateGrains(dt, vac) {
    const g = this.grains;
    const hf = this.hf;
    for (let i = 0; i < N_GRAINS; i++) {
      const p = g[i];
      if (!p.on) continue;
      const f = vac.field(p.x, p.y, TMPF);
      if (p.mode === 0) {
        // airborne: the flow owns it
        p.vx += f.fx * 3000 * dt;
        p.vy += f.fy * 3000 * dt;
        const d = Math.exp(-2.2 * dt);
        p.vx *= d; p.vy *= d;
      } else if (p.mode === 1) {
        // on the surface: airflow plus the slope it is sitting on
        let gx = 0, gy = 0;
        const c = 6;
        gx = hf.get(p.x - c, p.y) - hf.get(p.x + c, p.y);
        gy = hf.get(p.x, p.y - c) - hf.get(p.x, p.y + c);
        p.vx += (f.fx * 620 + gx * 26) * dt;
        p.vy += (f.fy * 620 + gy * 26) * dt;
        const d = Math.exp(-5.6 * dt);
        p.vx *= d; p.vy *= d;
        if (f.strength > ROLL_GO) { p.mode = 0; p.life = 0.8; }
      } else {
        // slump debris tumbling down the wall
        p.vx += f.fx * 500 * dt;
        p.vy += f.fy * 500 * dt;
        const d = Math.exp(-6.5 * dt);
        p.vx *= d; p.vy *= d;
        if (f.strength > ROLL_GO) { p.mode = 0; p.life = 0.8; }
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const sp = Math.hypot(p.vx, p.vy);
      p.spin += (sp * 0.05 - p.spin) * (1 - Math.exp(-6 * dt));
      p.rot += p.spin * dt;
      p.life -= dt;
      if (f.inCapture) {
        // a stream grain is the picture of mass that was already counted when
        // the cell lost it; only grains that took mass with them add more
        if (p.mode !== 0) { this.cupDebt += p.m; this.eaten += p.m; }
        p.on = 0;
        continue;
      }
      if (p.life <= 0 || (p.mode !== 0 && sp < 5 && f.strength < ROLL_S0 * 0.7)) {
        if (p.mode !== 0 && p.m > 0) hf.add(p.x, p.y, p.m);   // it settles again
        p.on = 0;
      }
    }
  }

  /**
   * Find the steepest step between neighbouring cells near the mouth. Past the
   * angle of repose a whole chunk breaks away at once instead of creeping.
   */
  _checkSlump(mx, my, world, sctx) {
    const hf = this.hf, h = hf.h, C = this.cols, R = this.rows;
    const REACH = 150;
    const c0 = Math.max(1, hf.cx(mx - REACH)), c1 = Math.min(C - 2, hf.cx(mx + REACH));
    const r0 = Math.max(1, hf.cy(my - REACH)), r1 = Math.min(R - 2, hf.cy(my + REACH));
    let best = 0, bi = -1, bdx = 0, bdy = 0;
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const i = cy * C + cx;
        const hv = h[i];
        if (hv < SLUMP_DIFF) continue;
        for (let k = 0; k < 4; k++) {
          const dx = k === 0 ? 1 : k === 1 ? -1 : 0;
          const dy = k === 2 ? 1 : k === 3 ? -1 : 0;
          const diff = hv - h[i + dy * C + dx];
          if (diff > best) { best = diff; bi = i; bdx = dx; bdy = dy; }
        }
      }
    }
    if (bi < 0 || best < SLUMP_DIFF) return;
    const cx = bi % C, cy = (bi / C) | 0;
    const wx = hf.worldX(cx), wy = hf.worldY(cy);
    const cw = hf.cw, ch = hf.ch;
    const rad = cw * 2.6;
    const amt = Math.min(best * 0.55, 9);
    // the chunk leaves the wall...
    const moved = -hf.addRadial(wx - bdx * cw * 0.6, wy - bdy * ch * 0.6, rad, -amt);
    if (moved <= 0.4) return;
    // ...and lands lower down, minus the fraction that becomes flying grains.
    // addRadial takes a HEIGHT, so convert the mass we are moving back into one.
    const dr = rad * 1.15;
    const perUnit = (0.5 * Math.PI * dr * dr) / (cw * ch);
    hf.addRadial(wx + bdx * cw * 2.6, wy + bdy * ch * 2.6, dr, (moved * 0.76) / perUnit);
    this.slumps++;
    this._slumpCool = 0.52;
    const fx = this.slumpFX;
    fx.t = fx.dur; fx.x = wx; fx.y = wy;
    fx.dx = bdx; fx.dy = bdy; fx.r = rad * 1.25; fx.run = cw * 3.6;
    const n = 22 + ((moved * 0.7) | 0);
    for (let i = 0; i < Math.min(34, n); i++) {
      const p = this._grain();
      if (!p) break;
      p.on = 1; p.mode = 2;
      p.x = wx + this.rng.range(-rad, rad) * 0.8 + bdx * cw;
      p.y = wy + this.rng.range(-rad, rad) * 0.8 + bdy * ch;
      p.vx = bdx * this.rng.range(60, 165) + this.rng.range(-26, 26);
      p.vy = bdy * this.rng.range(60, 165) + this.rng.range(-26, 26);
      p.r = this.rng.range(1.8, 3.4);
      p.life = 1.5; p.m = moved * 0.02; p.c = this.rng.int(0, 2);
      p.rot = this.rng.range(0, TAU); p.spin = this.rng.range(-8, 8);
    }
    if (sctx && sctx.camera) sctx.camera.kick(3.4);
    const audio = world && world.audio;
    if (audio) audio.pop('whoosh', 0.45);
  }

  // --------------------------------------------------------------- render

  _bakeSpeck(rng) {
    const g = this.speck.getContext('2d');
    const W = this.gw, H = this.gh;
    const n = Math.round(W * H / 26);
    for (let i = 0; i < n; i++) {
      const x = rng.range(0, W), y = rng.range(0, H);
      const k = rng.next();
      g.fillStyle = k < 0.42 ? 'rgba(255,248,224,0.38)'
        : k < 0.78 ? 'rgba(150,120,68,0.30)' : 'rgba(205,168,106,0.34)';
      g.fillRect(x, y, rng.range(1, 2.3), rng.range(1, 2.1));
    }
  }

  draw(ctx, cam) {
    if (this._cleared) { this._drawGrains(ctx); return; }
    const C = this.cols, R = this.rows, h = this.hf.h;
    const d = this.img.data;
    const t = this.t;
    const mcx = this._mcx || 0, mcy = this._mcy || 0;
    let any = false;
    for (let y = 0; y < R; y++) {
      for (let x = 0; x < C; x++) {
        const i = y * C + x;
        const v = h[i];
        const o = i * 4;
        if (v <= 0.02) { d[o + 3] = 0; continue; }
        any = true;
        const k = v > MAXH ? 1 : v / MAXH;
        // Real slope shading from a central difference, hard enough that a pit
        // reads AS a pit: light from the top-left, the far wall of the crater in
        // shadow, a bright lip where the wall crests, and the floor of the bowl
        // sunk in its own ambient occlusion.
        const hl = x > 0 ? h[i - 1] : v, hr = x < C - 1 ? h[i + 1] : v;
        const hu = y > 0 ? h[i - C] : v, hd = y < R - 1 ? h[i + C] : v;
        const gx = hl - hr, gy = hu - hd;
        // The light comes from the top-left, like every other shadow in the
        // scene, so a face that FALLS toward the top-left is the one that is
        // lit; the far wall of a crater turns away and goes into shadow.
        const lit = -(gx + gy);
        // The pile's own dome is gently curved and must stay warm, so the
        // shading is deliberately non-linear: soft everywhere, then hard once a
        // slope is steep enough to be a crater WALL.
        let sh = 1 + lit * 0.050;
        const amb = (hl + hr + hu + hd) * 0.25 - v;
        if (amb > 1.2) sh -= (amb - 1.2 > 5 ? 5 : amb - 1.2) * 0.045;   // in the hollow
        const slope = (gx < 0 ? -gx : gx) + (gy < 0 ? -gy : gy);
        if (slope > RIM) {
          const w = slope - RIM > 4 ? 1 : (slope - RIM) / 4;
          sh += (lit > 0 ? 0.34 : -0.27) * w;
        }
        if (sh < 0.70) sh = 0.70; else if (sh > 1.52) sh = 1.52;
        const sm = this.shim[i];
        if (sm > SHIM_S0) {
          // fine ripples running in toward the mouth: the air is already moving
          const ax = x - mcx, ay = y - mcy;
          const dd = Math.sqrt(ax * ax + ay * ay);
          sh += Math.sin(t * 16 - dd * 1.15) * 0.065 * Math.min(1, sm * 7);
        }
        // Sand is sand: colour must NOT fall off with depth, or a drained pile
        // goes olive everywhere except its peak. Only the slope shades it.
        let r = (226 + 18 * k) * sh;
        let g = (198 + 18 * k) * sh;
        let b = (143 + 20 * k) * sh;
        d[o] = r > 255 ? 255 : r;
        d[o + 1] = g > 255 ? 255 : g;
        d[o + 2] = b > 255 ? 255 : b;
        // Sand covers or it does not. A long translucent ramp over the dark mat
        // just reads as mud, and it blurs the moment the pattern comes through.
        const a = v * 470;
        d[o + 3] = a > 255 ? 255 : a;
      }
    }
    if (any) {
      this.cellCtx.putImageData(this.img, 0, 0);
      const s = this.sctx;
      s.clearRect(0, 0, this.gw, this.gh);
      s.imageSmoothingEnabled = true;
      s.drawImage(this.cell, 0, 0, this.gw, this.gh);
      s.globalCompositeOperation = 'source-atop';
      s.drawImage(this.speck, 0, 0);
      s.globalCompositeOperation = 'source-over';
      ctx.drawImage(this.sprite, this.rect.x0, this.rect.y0);
    }
    this._drawSlumpFX(ctx);
    this._drawGrains(ctx);
  }

  /** A whole chunk of wall coming away: you see the block slide, not a puff. */
  _drawSlumpFX(ctx) {
    const s = this.slumpFX;
    if (s.t <= 0) return;
    const u = 1 - s.t / s.dur;
    const e = u * (2 - u);                     // eases out: it lets go, then settles
    const cx = s.x + s.dx * s.run * e, cy = s.y + s.dy * s.run * e;
    const r = s.r;
    ctx.save();
    // the scar it left on the wall behind it
    ctx.globalAlpha = 0.5 * (1 - u);
    ctx.fillStyle = 'rgba(96,72,36,1)';
    ctx.beginPath();
    ctx.ellipse(s.x - s.dx * 3, s.y - s.dy * 3, r * 1.05, r * 0.85, 0, 0, TAU);
    ctx.fill();
    // the chunk itself, with a dark edge on its uphill side
    ctx.globalAlpha = 0.9 * (1 - u * u);
    ctx.fillStyle = 'rgba(70,52,26,0.55)';
    ctx.beginPath();
    ctx.ellipse(cx - s.dx * 5 + 3, cy - s.dy * 5 + 4, r * 1.02, r * 0.8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#e6cf9c';
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.78, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,248,222,0.6)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.25, cy - r * 0.28, r * 0.5, r * 0.34, 0, 0, TAU);
    ctx.fill();
    // and the dust it throws up
    ctx.globalAlpha = 0.42 * (1 - u);
    ctx.fillStyle = '#f4e7c6';
    const rr = r * (0.9 + u * 1.5);
    ctx.beginPath();
    ctx.ellipse(cx + s.dx * 10, cy + s.dy * 10, rr, rr * 0.72, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  _drawGrains(ctx) {
    const g = this.grains;
    ctx.save();
    for (let i = 0; i < N_GRAINS; i++) {
      const p = g[i];
      if (!p.on) continue;
      const sp = Math.hypot(p.vx, p.vy);
      // a fast grain smears into a long bright streak: dozens of them pouring
      // along the same lines is what makes the drain read as a rush of sand
      if (sp > 80) {
        const f = sp > 420 ? 1 : sp / 420;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(210,175,110,' + (0.28 + 0.30 * f).toFixed(3) + ')';
        ctx.lineWidth = p.r * 2.2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,250,232,' + (0.42 + 0.45 * f).toFixed(3) + ')';
        ctx.lineWidth = p.r * 1.0;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.032, p.y - p.vy * 0.032);
        ctx.stroke();
      } else if (p.mode !== 0) {
        ctx.fillStyle = 'rgba(70,55,30,0.22)';
        ctx.beginPath();
        ctx.ellipse(p.x + 1, p.y + 1.6, p.r * 1.25, p.r * 0.8, 0, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = p.c === 0 ? '#f6ead0' : p.c === 1 ? '#e2c993' : '#c8a86e';
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r * 1.35, p.r * 0.95, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  snapshot() {
    const s = super.snapshot();
    s.mass = +this.hf.total().toFixed(1);
    s.frac = +this.fraction.toFixed(4);
    s.eaten = +this.eaten.toFixed(1);
    s.grains = this._activeGrains();
    s.slumps = this.slumps;
    s.roar = +this._roar.toFixed(3);
    return s;
  }
}
