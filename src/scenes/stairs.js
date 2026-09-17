import { Scene } from './scene.js';
import { State } from '../debris/base.js';
import { Stair, makeStairsFloor } from '../floors/stairs.js';
import { Riser, Climb } from '../props/riser.js';
import { Tumbler } from '../debris/tumbler.js';
import { StepBunny } from '../debris/stepBunny.js';
import { RiserFluff } from '../debris/riserFluff.js';
import { Sock } from '../debris/sock.js';
import { Strand } from '../debris/strand.js';
import { clamp, lerp, TAU } from '../core/math.js';

const RR = { x0: 0, y0: 0, x1: 0, y1: 0 };

/**
 * Room — the stairs.
 *
 * The phenomenon here is SUCTION PLUS GRAVITY. Everywhere else in the house the
 * airflow has to win on its own; on a staircase it only has to tip something
 * over the lip of a step, and the stairs finish the job. So the pre-suction
 * moment is a TEETER on a nosing, and what it buys you is a tumble: the crumb
 * drops, bounces on the tread below with a puff, and comes down the flight into
 * the mouth. The child watches gravity do the work their finger started.
 *
 * And because the debris is up there, the child has to go up there. The head
 * lives on one tread at a time; it climbs by being PRESSED into the riser in
 * front of it until the machine gathers itself and hops, and the body comes up
 * the hose a step behind, dangling. The camera does not glide — it settles on
 * each tread and jumps a whole step at a time, which is what stairs feel like.
 *
 *   portrait   the flight fills the frame and recedes upward, seen from below
 *   landscape  the same flight laid out as a long diagonal with a banister down
 *              its open side, and a gap under the banister where a sock and a
 *              tangle of hair have collected out of reach of any broom
 *
 * Finishing it is the window on the landing coming on, the camera looking back
 * down a clean flight while a shine ripples from tread to tread, and the door.
 */
export class StairsScene extends Scene {
  constructor(rng) {
    super('stairs', rng);
    this.stair = null;
    this.climb = null;
    this.risers = [];
    this.puffs = [];
    for (let i = 0; i < 46; i++) this.puffs.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, r: 3, kind: 0 });
    this._pi = 0;
    this._camA = { x: 0, y: 0, zoom: 1, tilt: 0 };
    this._sub = { x: 0, y: 0 };
    this._camReady = false;
    this.lit = 0;           // the landing window coming on, 0..1
    this.shine = -1;        // the ripple down the clean flight, once it starts
    this.atTop = false;     // has the flight ever been clean with the head up top
    this.clearT = 0;
    this.call = 0;          // the light that runs UP the treads asking for the climb
    this._glow = null;
    this._glowR = 0;
  }

  // -------------------------------------------------------------- layout

  layout(pose, w, h) {
    super.layout(pose, w, h);
    const vw = this.vw, vh = this.vh, rng = this.rng;
    const portrait = pose === 'portrait';
    this.debris.length = 0;
    this.props.length = 0;
    this.risers.length = 0;
    this._camReady = false;
    this.lit = this.persist.lit || 0;
    this.atTop = !!this.persist.atTop;
    this.clearT = 0;
    this.call = 0;
    this.shine = -1;
    for (let i = 0; i < this.puffs.length; i++) this.puffs[i].life = 0;

    this.rest = { x: 0, y: 0, zoom: this.scale, tilt: portrait ? 0.10 : 0.06 };
    const R = this.reachRect(RR, 24);

    // The flight is dimensioned FROM the reach rectangle, not from the viewport:
    // the hall floor at its foot — where the bin stands and where anything that
    // rolled all the way down waits — has to be somewhere the head can go, on
    // every one of the four devices.
    const n = 7;
    this.stair = portrait
      ? new Stair({
        pose, n, step: 124, tread: 70, land: 250, taper: 9,
        wid: vw * 0.92, x0: -vw * 0.46, y0: R.y1 - 118, floorDepth: 190,
      })
      : new Stair({
        pose, n, step: 96, tread: 58, land: 190,
        wid: clamp(vw * 0.46, 290, 400), shift: clamp(vw * 0.46, 290, 400) * 0.34,
        x0: R.x0 + 6, y0: R.y1 - 84, floorDepth: 150,
      });
    const st = this.stair;
    st.onPuff = (x, y, k, kind) => this.puff(x, y, k, kind);

    this.floor = makeStairsFloor(st, rng);
    this.win = this.floor.window;

    // one solid face per riser (see props/riser.js: it blocks from BELOW only,
    // so the head can walk back down and can never wedge between two of them)
    for (let j = 0; j <= n; j++) {
      const r = new Riser(st, j);
      this.risers[j] = r;
      this.props.push(r);
    }
    this.climb = new Climb(st, this.risers);
    this.climb.onHop = (phase, x, y) => this._onHop(phase, x, y);
    const k0 = clamp(this.persist.k || 0, 0, n);
    this.climb.setStep(k0);

    // where the machine stands: on the tread it was last on, mid-tread
    const park = { x: st.midX(k0) + (portrait ? 0 : st.wid * 0.10), y: st.noseY(k0) - st.depth(k0) * 0.5 };
    this.startWorld = park;
    const lead = portrait ? 92 : 78;
    this.startPointer = {
      x: clamp(0.5 + park.x / vw, 0.12, 0.88),
      y: clamp(0.5 + (park.y + (lead - 22) / this.scale) / vh, 0.36, 0.90),
    };

    if (portrait) this._layoutPortrait(); else this._layoutLandscape();

    // nothing may sit in the parked nozzle's own airflow — except the fluff on
    // the tread the machine is standing on, which is meant to be swaying
    this.clearStartZone(132, lead);

    // the bin stands on the hall floor at the foot of the flight, which is
    // where the child comes in and where everything that got away ends up
    const binX = portrait
      ? (park.x < 0 ? R.x1 - 56 : R.x0 + 56)
      : R.x0 + 52;
    this.placeBin({ x: clamp(binX, R.x0 + 40, R.x1 - 40), y: clamp(st.y0 + st.riser + 34, st.y0 + st.riser + 18, R.y1 - 8) });
  }

  _slot(d, name) { d.slot = name; this.debris.push(d); return d; }

  _layoutPortrait() {
    const st = this.stair, rng = this.rng;
    // ---- edge crumbs on the nosings, two per lip -------------------------
    const RING_ON = { 2: true, 5: true };
    for (let j = 1; j <= 6; j++) {
      const nose = st.noseY(j);
      for (let i = 0; i < 2; i++) {
        const x = lerp(-st.wid * 0.20, st.wid * 0.20, (i + 0.5) / 2) + rng.range(-22, 22);
        this._slot(new Tumbler(x, nose - 5, rng, { stair: st }), 'c' + j + '_' + i);
      }
      if (RING_ON[j]) {
        this._slot(new Tumbler(rng.range(-40, 40) + (j === 2 ? -70 : 78), nose - 9, rng,
          { stair: st, heavy: true }), 'ring' + j);
      }
    }
    // ---- fluff jammed in the riser corners -------------------------------
    for (const j of [1, 3, 5]) {
      const y = st.cornerY(j) + 3;
      for (let i = 0; i < 2; i++) {
        const x = (i ? 1 : -1) * rng.range(52, 110);
        this._slot(new RiserFluff(x, y, rng, { stair: st, w: rng.range(46, 60) }), 'f' + j + '_' + i);
      }
    }
    // ---- the top landing -------------------------------------------------
    // Fluff rooted in the middle of the landing is the one thing on this flight
    // that cannot come down to you, and it is a whole landing deep, far further
    // than the flow reaches from the step below — so the only way to have it is
    // to be standing up there. That is what makes "finish the room" and "get to
    // the top" the same act, with nothing written down anywhere.
    this._slot(new RiserFluff(-58, st.cornerY(7) + 74, this.rng, { stair: st, w: 58, thr: 0.80 }), 'ft0');
    this._slot(new RiserFluff(62, st.cornerY(7) + 112, this.rng, { stair: st, w: 50, thr: 0.80 }), 'ft1');
    this._slot(new StepBunny(-46, st.cornerY(7) + 178, 34, this.rng, st), 'b0');
    this._slot(new StepBunny(78, st.cornerY(7) + 216, 27, this.rng, st), 'b1');
  }

  _layoutLandscape() {
    const st = this.stair, rng = this.rng;
    const RING_ON = { 2: true, 5: true };
    for (let j = 1; j <= 6; j++) {
      const nose = st.noseY(j);
      for (let i = 0; i < 2; i++) {
        const u = 0.28 + 0.34 * i + rng.range(-0.06, 0.06);
        this._slot(new Tumbler(st.left(j) + st.wid * u, nose - 4, rng, { stair: st }), 'c' + j + '_' + i);
      }
      if (RING_ON[j]) {
        this._slot(new Tumbler(st.left(j) + st.wid * (j === 2 ? 0.72 : 0.36), nose - 9, rng,
          { stair: st, heavy: true }), 'ring' + j);
      }
    }
    for (const j of [1, 3, 5]) {
      const y = st.cornerY(j) + 2;
      this._slot(new RiserFluff(st.left(j) + st.wid * 0.42, y, rng, { stair: st, w: 50 }), 'f' + j + '_0');
      this._slot(new RiserFluff(st.left(j) + st.wid * 0.74, y, rng, { stair: st, w: 42 }), 'f' + j + '_1');
    }
    // the rooted fluff out on the landing — see the portrait note: it is what
    // makes finishing the room and reaching the top the same act
    this._slot(new RiserFluff(st.midX(7) - 52, st.cornerY(7) + 62, rng, { stair: st, w: 56, thr: 0.80 }), 'ft0');
    this._slot(new RiserFluff(st.midX(7) + 66, st.cornerY(7) + 92, rng, { stair: st, w: 48, thr: 0.80 }), 'ft1');
    this._slot(new StepBunny(st.midX(7) - 14, st.cornerY(7) + 138, 32, rng, st), 'b0');
    this._slot(new StepBunny(st.midX(7) + 82, st.cornerY(7) + 166, 26, rng, st), 'b1');

    // ---- the gap under the banister --------------------------------------
    // Down the open side of the flight there is a slot between the balusters
    // and the tread that no broom has ever reached. A sock is stuffed in it
    // (it plugs the intake on the way in, exactly as it does under the sofa),
    // and a knot of hair is wound along the edge two steps further up.
    const gx = (j) => st.right(j) - 34;
    this._slot(new Sock(gx(2) - 6, st.noseY(2) - st.tread * 0.42, -0.5, rng, { len: 70 }), 'sock');
    const hy = (j) => st.noseY(j) - st.tread * 0.34;
    this._slot(new Strand({
      variant: 'hair', rng, clump: 3,
      path: [
        { x: gx(4) + 8, y: hy(4) },
        { x: gx(4) - 26, y: hy(4) + 8 },
        { x: gx(4) - 58, y: hy(4) - 6 },
        { x: gx(4) - 86, y: hy(4) + 10 },
      ],
    }), 'hair');

    // the rail: a straight diagonal over the stepped open edge
    this.rail = {
      x0: st.right(0) - 10, y0: st.noseY(0) - 74,
      x1: st.right(st.n) + 30, y1: st.noseY(st.n) - 74,
    };
  }

  // -------------------------------------------------------------- update

  update(dt, ctx) {
    const vac = ctx.vacuum, cam = ctx.camera, st = this.stair;

    // dev only (`shot.mjs --complete`): stand the machine on the top landing,
    // which is where a child who has actually finished the room would be
    if (this._devTop) {
      const k = st.n;
      vac.nozzle.x = st.midX(k); vac.nozzle.y = st.noseY(k) - st.depth(k) * 0.45;
      vac.nozzle.vx = 0; vac.nozzle.vy = 0;
      vac.body.x = vac.nozzle.x; vac.body.y = st.cornerY(k - 1) + 10;
      vac.body.vx = 0; vac.body.vy = 0;
      this.climb.setStep(k);
    }

    // the climb owns the head's relationship with the flight, and it runs
    // FIRST so the debris sample the airflow from where the head really is
    this.climb.update(dt, vac, cam);
    const k = this.climb.k;
    // a head that wandered off the side of the flight is put back on it — one
    // sided clamps on an interval, so there is nothing here that can trap it
    const lx = st.left(k) - 6, rx = st.right(k) + 30;
    if (vac.nozzle.x < lx) { vac.nozzle.x = lx; if (vac.nozzle.vx < 0) vac.nozzle.vx = 0; }
    if (vac.nozzle.x > rx) { vac.nozzle.x = rx; if (vac.nozzle.vx > 0) vac.nozzle.vx = 0; }

    const list = this.debris;
    let falling = 0;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (d.dormant) continue;
      d.update(dt, vac, ctx.world);
      if (d.state === State.PULLED && (d.phase === 'fall' || d.rolling)) falling++;
      if (d.type === 'sock' && d.clogAmount > 0) vac.clog = Math.max(vac.clog, d.clogAmount);
    }
    if (ctx.audio) ctx.audio.setStream(clamp(falling * 0.32, 0, 0.8));

    // leaning on a riser shakes dust out of the corner: the wind-up is alive
    if (this.climb.press > 0.3 && !this.climb.hop) {
      this._pressT = (this._pressT || 0) - dt;
      if (this._pressT <= 0) {
        this._pressT = 0.11;
        this.puff(vac.nozzle.x + this.rng.range(-26, 26), st.cornerY(k) + 2, 1, 'fluff');
      }
    }

    this._puffs(dt, vac);

    // ---- the flight is clean: the landing window comes on ----------------
    const clear = this.remaining() === 0;
    this.lit += ((clear ? 1 : 0) - this.lit) * (1 - Math.exp(-2.0 * dt));
    // once it has been true it stays true: the child may well walk back down
    // while the window is still coming on, and that must not un-finish the room
    this.clearT = clear ? this.clearT + dt : 0;
    if (clear && this.climb.k >= st.n) this.atTop = true;
    // The room is meant to end at the top: the window comes on and a light runs
    // UP the treads ahead of the head, asking for the last climb. But crumbs
    // that tumbled down get cleared last, so the child can be standing at the
    // bottom when the flight goes clean — and a room that will not finish is
    // worse than a beat that is missed. After a few seconds of the invitation
    // it ends where they are.
    if (this.clearT > 6) this.atTop = true;
    this.call = clear && !this.atTop ? this.call + dt : 0;
    if (clear && this.lit > 0.5 && this.atTop && this.shine < 0) this.shine = 0;
    if (this.shine >= 0) this.shine += dt;
    this.persist.k = this.climb.k;
    this.persist.lit = this.lit;
    this.persist.atTop = this.atTop;

    // ---- camera: one tread at a time -------------------------------------
    const A = this._camA;
    A.x = this.pose === 'portrait' ? 0 : st.midX(k) + st.wid * 0.06;
    // on the top landing the camera drops a little, or the frame is all wall
    A.y = this.rest.y + (k >= st.n ? st.land * 0.42 : 0);
    A.zoom = this.rest.zoom; A.tilt = this.rest.tilt;
    this._sub.x = vac.nozzle.x;
    this._sub.y = this.rest.y - k * st.step;
    cam.stepTo(dt, A, this._sub, {
      axis: 'y', step: st.step, rate: 7.5, kick: 3.4,
      gain: 0.45, limit: this.pose === 'portrait' ? 78 : 130,
      snap: !this._camReady,
    });
    this._camReady = true;
  }

  _onHop(phase, x, y) {
    if (phase === 'take') this.puff(x, y + 10, 5, 'tip');
    else this.puff(x, y + 26, 9, 'thunk');
  }

  onCaptured(d, ctx) {
    this.puff(d.x, d.y, 4, 'fluff');
  }

  // --------------------------------------------------------------- puffs

  puff(x, y, n, kind) {
    const K = kind === 'fluff' ? 1 : kind === 'thunk' ? 2 : 0;
    for (let i = 0; i < n; i++) {
      const p = this.puffs[this._pi];
      this._pi = (this._pi + 1) % this.puffs.length;
      const a = this.rng.range(0, TAU);
      const sp = this.rng.range(28, 96) * (K === 2 ? 1.5 : 1);
      p.x = x + this.rng.range(-6, 6);
      p.y = y + this.rng.range(-3, 3);
      p.vx = Math.cos(a) * sp;
      p.vy = -Math.abs(Math.sin(a)) * sp * 0.55 - 18;
      p.life = 1;
      p.r = this.rng.range(2.2, 5.4) * (K === 2 ? 1.35 : 1);
      p.kind = K;
    }
  }

  _puffs(dt, vac) {
    const ps = this.puffs;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.life <= 0) continue;
      p.vx *= Math.exp(-2.6 * dt);
      p.vy = p.vy * Math.exp(-2.2 * dt) + 42 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.life -= dt * 1.5;
    }
  }

  // ---------------------------------------------------------------- draw

  draw(ctx, cam) {
    this.drawFloor(ctx, cam);
    ctx.save();
    cam.apply(ctx);
    this._drawWindow(ctx);
    for (let i = 0; i < this.risers.length; i++) this.risers[i].drawPress(ctx);
    ctx.restore();
    this.drawDebris(ctx, cam);
    ctx.save();
    cam.apply(ctx);
    if (this.pose !== 'portrait') this._drawBanister(ctx);
    this._drawPuffs(ctx);
    if (this.shine >= 0) this._drawShine(ctx);
    else if (this.call > 0) this._drawCall(ctx);
    ctx.restore();
  }

  _drawWindow(ctx) {
    const w = this.win;
    if (!w) return;
    const k = this.lit;
    // the pane itself: cold and dull until the flight is clean, then daylight
    ctx.globalAlpha = 1;
    ctx.fillStyle = k > 0.02 ? '#ffe9b0' : '#8fa0a6';
    if (k > 0.02) {
      ctx.globalAlpha = k;
      ctx.fillRect(w.x - w.w / 2, w.y - w.h / 2, w.w, w.h);
      ctx.fillStyle = '#cbbda3';
      ctx.fillRect(w.x - 5, w.y - w.h / 2, 10, w.h);
      ctx.fillRect(w.x - w.w / 2, w.y - 5, w.w, 10);
      // and the light it throws down the top of the flight
      const R = 420;
      if (!this._glow || this._glowR !== R) {
        const g = ctx.createRadialGradient(0, 0, 10, 0, 0, R);
        g.addColorStop(0, 'rgba(255,232,172,0.95)');
        g.addColorStop(0.45, 'rgba(255,226,160,0.34)');
        g.addColorStop(1, 'rgba(255,226,160,0)');
        this._glow = g; this._glowR = R;
      }
      ctx.save();
      ctx.translate(w.x, w.y + 40);
      ctx.globalAlpha = k * 0.85;
      ctx.fillStyle = this._glow;
      ctx.beginPath(); ctx.ellipse(0, 0, R, R * 0.82, 0, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  _drawBanister(ctx) {
    const st = this.stair, r = this.rail;
    if (!r) return;
    const dx = r.x1 - r.x0, dy = r.y1 - r.y0;
    const L = Math.hypot(dx, dy);
    const ux = dx / L, uy = dy / L;
    // balusters: the debris in the gap is BEHIND them, which is what makes the
    // gap read as a gap rather than as a stripe of floor
    ctx.strokeStyle = '#a97f52';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let s = 14; s < L - 8; s += 46) {
      const x = r.x0 + ux * s, y = r.y0 + uy * s;
      const j = clamp(st.stepAt(y + 74), 0, st.n);
      ctx.moveTo(x, y + 4);
      ctx.lineTo(x + 2, st.noseY(j) - 4);
    }
    ctx.stroke();
    // newel posts at both ends
    ctx.fillStyle = '#8f6839';
    ctx.fillRect(r.x0 - 9, r.y0 - 16, 18, 96);
    ctx.fillRect(r.x1 - 9, r.y1 - 16, 18, 96);
    ctx.fillStyle = '#b98a58';
    ctx.fillRect(r.x0 - 12, r.y0 - 24, 24, 12);
    ctx.fillRect(r.x1 - 12, r.y1 - 24, 24, 12);
    // the handrail
    ctx.strokeStyle = '#7d5730';
    ctx.lineWidth = 15;
    ctx.beginPath(); ctx.moveTo(r.x0 - 10, r.y0); ctx.lineTo(r.x1 + 10, r.y1); ctx.stroke();
    ctx.strokeStyle = '#c08f5a';
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(r.x0 - 10, r.y0); ctx.lineTo(r.x1 + 10, r.y1); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,238,206,0.5)';
    ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(r.x0 - 10, r.y0 - 3); ctx.lineTo(r.x1 + 10, r.y1 - 3); ctx.stroke();
  }

  _drawPuffs(ctx) {
    const ps = this.puffs;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.life <= 0) continue;
      const a = clamp(p.life, 0, 1);
      ctx.globalAlpha = a * (p.kind === 2 ? 0.52 : 0.40);
      ctx.fillStyle = p.kind === 1 ? '#ded7cb' : '#cdbda4';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1.9 - a), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * The flight is clean but the child is still down it: a light runs UP the
   * treads in front of the head, again and again, toward the lit window. No
   * arrow, no text — just somewhere brightening in turn, the way the rest of
   * the house invites the next thing.
   */
  _drawCall(ctx) {
    const st = this.stair;
    const k = this.climb.k;
    const u = (this.call % 1.7) / 1.7;
    for (let j = k; j <= st.n; j++) {
      const p = st.n > k ? (j - k) / (st.n - k) : 1;
      const a = Math.max(0, 1 - Math.abs(u - p) * 4.5) * 0.30;
      if (a <= 0.004) continue;
      const l = st.left(j), w = st.right(j) - l;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffeec0';
      ctx.fillRect(l, st.noseY(j) - st.depth(j), w, st.depth(j));
    }
    ctx.globalAlpha = 1;
  }

  /** A shine running from tread to tread down the clean flight. */
  _drawShine(ctx) {
    const st = this.stair;
    const front = this.shine / 1.5;              // 0 at the top, 1 at the bottom
    for (let j = st.n; j >= 0; j--) {
      const u = 1 - j / st.n;
      const a = Math.max(0, 1 - Math.abs(front - u) * 5.2) * 0.62;
      if (a <= 0.002) continue;
      const l = st.left(j), w = st.right(j) - l;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#fff3d2';
      ctx.fillRect(l, st.noseY(j) - st.depth(j), w, st.depth(j));
      ctx.globalAlpha = a * 1.2;
      ctx.fillRect(l, st.noseY(j) - 6, w, 6);
    }
    ctx.globalAlpha = 1;
  }

  // ----------------------------------------------------------- completion

  isComplete() {
    return this.remaining() === 0 && this.atTop && this.lit > 0.55;
  }

  devFinish() {
    for (let i = 0; i < this.debris.length; i++) this.debris[i].state = State.DONE;
    this.climb.setStep(this.stair.n);
    this._devTop = true;
    this.atTop = true;
    this.lit = 1;
  }

  exit() {
    const st = this.stair;
    const top = Math.min(st.cornerY(st.n) - 40, (this.win ? this.win.y - this.win.h * 0.7 : 0));
    const bot = st.y0 + st.riser + 90;
    const span = bot - top;
    const zoom = clamp(this.h / span, this.scale * 0.34, this.scale * 0.95);
    const x = this.pose === 'portrait' ? 0 : (st.midX(0) + st.midX(st.n)) * 0.5;
    return { to: { x, y: (top + bot) * 0.5, zoom, tilt: this.rest.tilt * 0.5 }, dur: 2.0, next: 'hall' };
  }

  entry() {
    return { x: this.rest.x, y: this.rest.y + 46, zoom: this.scale * 0.86, tilt: this.rest.tilt };
  }

  /**
   * Orientation change. The two poses are different flights with different
   * numbers of pieces on them, so the index-based default would put the wrong
   * ones back; every piece carries a stable slot name instead.
   */
  saveProgress() {
    const done = [];
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      if (d.slot && d.state === State.DONE) done.push(d.slot);
    }
    return { done };
  }

  restoreProgress(p) {
    if (!p || !p.done) return;
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      if (d.slot && p.done.indexOf(d.slot) >= 0) d.state = State.DONE;
    }
  }

  snapshot() {
    const s = super.snapshot();
    s.climb = this.climb ? this.climb.snapshot() : null;
    s.lit = +this.lit.toFixed(2);
    return s;
  }
}
