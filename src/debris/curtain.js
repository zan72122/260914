import { Cloth } from '../core/cloth.js';
import { makeCanvas } from '../floors/floor.js';
import { clamp, smoothstep, TAU } from '../core/math.js';

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };

/**
 * The floor-length curtain by the window — a `Cloth` with one extra idea.
 *
 * The core cloth pulls each node toward the mouth in the PLANE of the floor,
 * which is what a cushion face does. A curtain hanging against the wall does
 * something else: its hem comes OFF the boards. So every node also carries a
 * lift (0..1) driven by the air it feels where it actually is, and the lift
 * swings the node back up toward the rail — the hem's footprint on the floor
 * retracts, and whatever was hiding under it is simply not covered any more.
 * Nothing is faded in or out: the fabric moves and the floor is there.
 *
 * The top row is sewn to the rail, so the bulge grows downward: the lower rows
 * leave first, the hem last and furthest, which is the pre-suction reaction the
 * room is built on.
 *
 * The hold beat: keep the mouth on the hem and the fabric is drawn taut into
 * the intake (`gain` climbs, the motor labours through `vac.clog`), until after
 * ~0.6 s the weave slips free with a flap and a puff of lint. It is never
 * swallowed — a can't-have-it toy, like the ribbon.
 */
export class Curtain {
  /**
   * @param rect  {x0,y0,x1,y1} — y0 at the rail on the wall, y1 the hem
   * @param opts  {cols, rows, railY, color, onSnap(x,y,power)}
   */
  constructor(rect, rng, opts = {}) {
    this.rect = rect;
    this.rng = rng;
    this.cols = opts.cols || 10;
    this.rows = opts.rows || 14;
    this.railY = opts.railY === undefined ? rect.y0 : opts.railY;
    this.onSnap = opts.onSnap || null;

    this.cl = new Cloth(rect, this.cols, this.rows, {
      stiffness: opts.stiffness === undefined ? 21 : opts.stiffness,
      link: opts.link === undefined ? 42 : opts.link,
      damp: 0.92,
      gain: 26,
      pinned: 'none',
    });
    // `pinned: {t:1}` is not a thing the core cloth understands (it knows
    // 'all' / 'none' / 'edges'), and 'edges' would sew the hem down as well —
    // which is the one thing this curtain must not be. The pin array is plain
    // data, so the top row is pinned here instead of asking for a core change.
    for (let c = 0; c < this.cols; c++) this.cl.pin[c] = 1;

    const n = this.cols * this.rows;
    this.lf = new Float32Array(n);      // 0..1 how far off the floor this node is
    this.dx = new Float32Array(n);      // display positions (lift applied)
    this.dy = new Float32Array(n);
    this.rowW = new Float32Array(this.rows);
    for (let r = 0; r < this.rows; r++) this.rowW[r] = Math.pow(r / (this.rows - 1), 1.25);

    this.baseGain = 26;
    this.t = 0;
    this.lift = 0;          // 0..1 mean lift of the hem row: "how far it is open"
    this.liftMax = 0;       // the furthest it has ever been open (latched)
    this.grab = 0;          // 0..1 the hold beat
    this.grabT = 0;
    this.cool = 0;
    this.snapFlash = 0;
    this.calm = 0;          // 1 once the room is finished: a slow, happy sway
    this.img = makeCurtainImage(this.cols, rng, opts.color);
    this._hemY = new Float32Array(this.cols);
    for (let i = 0; i < n; i++) { this.dx[i] = this.cl.x[i]; this.dy[i] = this.cl.y[i]; }
    this._syncHem();
  }

  /** The lowest drawn edge of the fabric at a world x — i.e. what is covered. */
  hemYAt(wx) {
    const u = clamp((wx - this.rect.x0) / (this.rect.x1 - this.rect.x0), 0, 1);
    const f = u * (this.cols - 1);
    const i = Math.min(this.cols - 2, Math.floor(f));
    const k = f - i;
    return this._hemY[i] + (this._hemY[i + 1] - this._hemY[i]) * k;
  }

  _syncHem() {
    const base = (this.rows - 1) * this.cols;
    for (let c = 0; c < this.cols; c++) this._hemY[c] = this.dy[base + c];
  }

  update(dt, vac, audio) {
    this.t += dt;
    const cl = this.cl;
    const C = this.cols, R = this.rows;

    // ---- the hold beat -------------------------------------------------
    // measured on the hem itself: the mouth has to be ON the fabric, not near
    // the window, and the air has to actually be strong there
    // sampled at the hem's REST places, not where the air has already dragged it
    // to: otherwise the grab pulls the fabric onto the mouth, the reading spikes,
    // and after the snap — when the sheet springs back — the same held finger
    // reads as "nowhere near the hem" and the beat can never repeat.
    let hemS = 0, hemX = 0, hemY = 0, hemD = 1e9;
    const base = (R - 1) * C;
    for (let c = 0; c < C; c++) {
      const i = base + c;
      const f = vac.field(cl.hx[i], cl.hy[i], TMPF);
      if (f.strength > hemS) { hemS = f.strength; hemX = cl.x[i]; hemY = cl.y[i]; }
      if (f.dist < hemD) hemD = f.dist;
    }
    this.hemStrength = hemS;
    this.cool = Math.max(0, this.cool - dt);
    if (this.calm < 0.5 && this.cool <= 0 && hemS > 0.62 && hemD < 96) {
      this.grabT += dt;
    } else {
      this.grabT = Math.max(0, this.grabT - dt * 2.2);
    }
    this.grab = clamp(this.grabT / 0.6, 0, 1);
    if (this.grab > 0.02) {
      // the intake is half plugged by fabric: the motor drops and boomes, the
      // head judders, and the airflow itself weakens. Lightly — the beat has to
      // stay winnable and the puff at the end has to still have some air in it.
      vac.clog = Math.max(vac.clog, 0.14 + 0.30 * this.grab);
    }
    if (this.grabT >= 0.6) this._snap(vac, hemX, hemY, audio);

    // taut: the whole sheet is drawn into the mouth while it is held
    cl.gain = this.baseGain + 108 * this.grab;
    cl.update(dt, vac);

    // ---- the lift ------------------------------------------------------
    let hemLift = 0;
    for (let r = 0; r < R; r++) {
      const w = this.rowW[r];
      for (let c = 0; c < C; c++) {
        const i = r * C + c;
        const f = vac.field(cl.x[i], cl.y[i], TMPF);
        const off = Math.hypot(cl.x[i] - cl.hx[i], cl.y[i] - cl.hy[i]);
        // once the room is finished the hem hangs a little off the boards for
        // good, swaying: that is what leaves the skirting-board stickers on show
        // A power curve, not a smoothstep. smoothstep(0.07, 0.95) is flat at the
        // bottom, so the hem did nothing at all until the head was almost on it
        // and then went in a third of a second. This starts stirring at field
        // strength ~0.05 (about 130px away at idle, a head and a half) and grows
        // every frame the head comes closer, which is the ~1s of anticipation
        // the room is supposed to be built on.
        const want = Math.max(
          clamp(Math.pow(clamp(f.strength / 0.85, 0, 1), 0.65) * 0.80 + off / 40, 0, 1),
          this.calm * 0.50) * w;
        this.lf[i] += (want - this.lf[i]) * (1 - Math.exp(-(want > this.lf[i] ? 7.5 : 3.4) * dt));
        if (r === R - 1) hemLift += this.lf[i];
      }
    }
    this.lift = hemLift / C;
    if (this.lift > this.liftMax) this.liftMax = this.lift;

    // ---- display positions --------------------------------------------
    // the lift swings the node back up toward the rail (a hanging sheet coming
    // off the floor is foreshortened, so its footprint retracts) and adds the
    // flap: a travelling wave along the hem, never a static deformed pose
    const swayAmp = 0.5 + this.calm * 1.4;
    const flapF = 6.2 + 3.2 * this.grab;
    for (let r = 0; r < R; r++) {
      const w = this.rowW[r];
      for (let c = 0; c < C; c++) {
        const i = r * C + c;
        const l = this.lf[i];
        const wave = Math.sin(this.t * flapF - c * 0.72 + r * 0.24);
        const idle = Math.sin(this.t * 1.35 - c * 0.5) * swayAmp * w;
        const amp = (2.2 + 9.5 * l) * (1 - 0.55 * this.grab) + this.snapFlash * 15 * w;
        this.dx[i] = cl.x[i] + wave * amp * 0.55 + idle;
        // the hem rolls up further than the rows above it, so the fabric bows
        // into a curl instead of sliding up as one flat sheet
        const ret = 0.52 + 0.30 * w;
        this.dy[i] = cl.y[i] - l * (cl.hy[i] - this.railY) * ret + wave * amp * 0.28;
      }
    }
    this.snapFlash = Math.max(0, this.snapFlash - dt * 2.6);
    this._syncHem();
  }

  /** The fabric slips off the intake: a flap, a puff, and it is never yours. */
  _snap(vac, hx, hy, audio) {
    const cl = this.cl, C = this.cols, R = this.rows;
    const mx = vac.mouthX, my = vac.mouthY;
    for (let r = 1; r < R; r++) {
      const w = this.rowW[r];
      for (let c = 0; c < C; c++) {
        const i = r * C + c;
        let ax = cl.x[i] - mx, ay = cl.y[i] - my;
        const d = Math.hypot(ax, ay) || 1;
        ax /= d; ay /= d;
        cl.vx[i] += ax * 520 * w + Math.sin(c * 1.3) * 180 * w;
        cl.vy[i] += ay * 520 * w;
      }
    }
    this.grabT = 0; this.grab = 0;
    this.cool = 1.15;
    this.snapFlash = 1;
    vac.clog = Math.max(vac.clog, 0.5);
    vac.gulp(0.5);
    if (audio) { audio.pop('pop', 0.55); }
    if (this.onSnap) this.onSnap(hx, hy, 1);
  }

  draw(ctx) {
    const cl = this.cl;
    // hand the deformed-and-lifted grid to the core cloth's own bitmap warp:
    // N small drawImage calls with a transform, not a per-pixel anything
    const ox = cl.x, oy = cl.y;
    cl.x = this.dx; cl.y = this.dy;
    cl.drawImage(ctx, this.img, { shade: true });
    cl.x = ox; cl.y = oy;

    // The hem's shadow stays on the BOARDS, where the fabric is resting when
    // nothing is happening. As the hem comes up the drawn edge climbs away from
    // it and a strip of lit floor opens between the two — that gap is the only
    // thing that tells a four-year-old the hem went UP rather than got shorter,
    // so it is drawn from the rest positions, not the display ones.
    const C = this.cols;
    const base = (this.rows - 1) * C;
    const L = clamp(this.lift, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.11 + 0.24 * L;
    ctx.fillStyle = '#3a2a16';
    ctx.beginPath();
    ctx.moveTo(this.dx[base], cl.hy[base] + 2);
    for (let c = 1; c < C; c++) ctx.lineTo(this.dx[base + c], cl.hy[base + c] + 2);
    for (let c = C - 1; c >= 0; c--) ctx.lineTo(this.dx[base + c], cl.hy[base + c] + 11 + 17 * L);
    ctx.closePath();
    ctx.fill();

    // and the underside of the lifted hem catches the window: a warm lit lip
    // that thickens as it curls, so the edge is a rolled edge and not a cut
    if (L > 0.02) {
      ctx.globalAlpha = clamp(0.20 + 0.72 * L, 0, 1);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(94,72,44,0.55)';
      ctx.lineWidth = 2.4 + 5.5 * L;
      ctx.beginPath();
      ctx.moveTo(this.dx[base], this._hemY[0] + 1);
      for (let c = 1; c < C; c++) ctx.lineTo(this.dx[base + c], this._hemY[c] + 1);
      ctx.stroke();
      ctx.strokeStyle = '#fff1cf';
      ctx.lineWidth = 1.6 + 3.4 * L;
      ctx.beginPath();
      ctx.moveTo(this.dx[base], this._hemY[0] + 2.5 + 2 * L);
      for (let c = 1; c < C; c++) ctx.lineTo(this.dx[base + c], this._hemY[c] + 2.5 + 2 * L);
      ctx.stroke();
    }
    ctx.restore();
  }

  snapshot() {
    return {
      lift: +this.lift.toFixed(3), liftMax: +this.liftMax.toFixed(3),
      grab: +this.grab.toFixed(2), bulge: +this.cl.bulge.toFixed(3),
      hemS: +(this.hemStrength || 0).toFixed(3),
    };
  }
}

/**
 * The fabric, once, into an offscreen bitmap: stripes, vertical folds and a
 * scalloped hem with a band of braid. One texture warped across the grid is a
 * handful of blits; the same look built out of paths would be ~120 fills a
 * frame.
 */
export function makeCurtainImage(cols, rng, color) {
  const W = 256, H = 384;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const base = color || '#dfe7f0';
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  // a warm wash near the top: the sun is coming through the fabric up there
  const wash = g.createLinearGradient(0, 0, 0, H);
  wash.addColorStop(0, 'rgba(255,240,196,0.55)');
  wash.addColorStop(0.45, 'rgba(255,246,222,0.18)');
  wash.addColorStop(1, 'rgba(120,120,150,0.10)');
  g.fillStyle = wash;
  g.fillRect(0, 0, W, H);
  // printed stripes: something for the warp to bend, so the flap is readable
  for (let i = 0; i < 7; i++) {
    const x = (i + 0.5) * (W / 7);
    g.fillStyle = i % 2 ? 'rgba(122,158,196,0.35)' : 'rgba(236,150,160,0.30)';
    g.fillRect(x - 6, 0, 12, H);
  }
  // vertical folds
  for (let i = 0; i < 9; i++) {
    const x = (i / 8) * W;
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.30)' : 'rgba(80,88,110,0.16)';
    g.fillRect(x - 7, 0, 14, H);
  }
  // the braid and the scalloped hem
  g.fillStyle = 'rgba(214,160,86,0.75)';
  g.fillRect(0, H - 40, W, 10);
  g.fillStyle = 'rgba(90,70,48,0.22)';
  g.fillRect(0, H - 16, W, 16);
  g.fillStyle = base;
  for (let i = 0; i < 10; i++) {
    g.beginPath();
    g.arc((i + 0.5) * (W / 10), H - 16, W / 22, 0, TAU);
    g.fill();
  }
  return c;
}
