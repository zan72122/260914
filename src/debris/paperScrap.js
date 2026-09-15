import { Debris, State } from './base.js';
import { clamp, smoothstep, TAU, noise1 } from '../core/math.js';

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };

const GRAV = 900;        // design px/s^2 pulling a scrap back onto the floor
const AIRLIFT = 1200;    // lift per unit field strength -> it leaves the floor at s ~ 0.75
const ZMAX = 28;         // ceiling, so nothing floats away
const PULL = 3000;       // horizontal acceleration toward the mouth
const GUST = 12000;      // the air that spills out AROUND the mouth
const BOW = 4600;        // the bow wave a CHARGING head shoves ahead of itself
const STICK = 520;       // acceleration a sheet still touching the floor must beat
const GROUND = 0.45;     // the pull has much less purchase while it is still down
const FOLD_MAX = 2.45;   // radians of total fold at fold = 1 (flat -> V -> tube)

/**
 * Light paper: scraps, confetti, a torn envelope strip, tissue.
 *
 * The whole point of this type is that a light thing CATCHES THE AIR BEFORE IT
 * IS CAPTURED, so everything is sampled off `vac.field`, never off a distance:
 *
 *  far   every CORNER samples the field at its own position, so the corner
 *        nearest the mouth peels up and flutters while the far corner is still
 *        flat on the floor. You see the underside colour in the lifted sliver.
 *  mid   `s * AIRLIFT` beats gravity, the sheet leaves the floor and is then
 *        fully at the mercy of two competing forces:
 *          PULL  along the field vector, into the mouth
 *          GUST  the air that misses the mouth and spills out around its sides.
 *        The gust is directed along the component of "mouth -> me" that is
 *        PERPENDICULAR to the mouth's facing — i.e. it only exists when the
 *        scrap is BESIDE the mouth rather than in front of it — and it is
 *        scaled by how fast the head is being swung and killed by held power.
 *        So: rush past a scrap and it skates away, flipping onto its back;
 *        creep up on it, or hold still, and the pull wins and it comes in.
 *  near  in front of the mouth it turns its crease into the flow and FOLDS:
 *        flat quad -> V -> tube, flapping as it folds (never a static pose),
 *        then curls into the mouth and lands in the cup as a crumpled ball.
 */
export class PaperScrap extends Debris {
  constructor(x, y, rng, opts = {}) {
    super(x, y);
    this.rng = rng;
    this.kind2 = opts.kind || 'scrap';
    const K = SHAPES[this.kind2] || SHAPES.scrap;
    this.hw = (opts.w || rng.range(K.w[0], K.w[1])) * 0.5;
    this.hh = (opts.h || rng.range(K.h[0], K.h[1])) * 0.5;
    this.front = opts.front || rng.pick(K.front);
    this.back = opts.back || BACK[this.front] || '#b9ae9a';
    this.rot = opts.rot === undefined ? rng.range(0, TAU) : opts.rot;
    this.seed = rng.range(0, 100);
    this.soft = this.kind2 === 'tissue';

    this.z = 0; this.vz = 0;
    this.spin = 0;
    this.flipPhase = 0; this.flipSpd = 0;
    this.fold = 0;
    this.flee = 0;
    this.sail = 0;
    this.rush = 0;
    this._loose = false;
    this.align = 0;
    this.gust = 0;
    this.capT = -1;
    this.curl = 0;
    this.aimX = 0; this.aimY = -1;
    this.bounds = null;          // set by the scene: never leave the room

    // torn edges: per-corner radius wobble + per-edge bow, baked once
    this.cw = new Float32Array(4);
    for (let i = 0; i < 4; i++) this.cw[i] = rng.range(0.86, 1.12);
    this.eb = new Float32Array(4);
    for (let i = 0; i < 4; i++) this.eb[i] = rng.range(-0.22, 0.22) * (this.soft ? 2.2 : 1);
    // per-corner lift state (this is the "per-edge sampling" the scene is about)
    this.cz = new Float32Array(4);
    this.cv = new Float32Array(4);
    this.cs = new Float32Array(4);   // last sampled strength per corner
    this._cx = new Float32Array(4);
    this._cy = new Float32Array(4);
  }
  get type() { return 'paper'; }

  /** Local-space corner, including the torn wobble. */
  _corner(i, out) {
    const sx = (i === 0 || i === 3) ? -1 : 1;
    const sy = (i < 2) ? -1 : 1;
    out.x = sx * this.hw * this.cw[i];
    out.y = sy * this.hh * this.cw[(i + 2) & 3];
    return out;
  }

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    this.t += dt;

    const f = vac.field(this.x, this.y, this._f);
    const s = f.strength;
    this.strength = s;

    if (s > 1e-4) {
      const l = Math.hypot(f.fx, f.fy) || 1;
      const k = 1 - Math.exp(-11 * dt);
      this.aimX += (f.fx / l - this.aimX) * k;
      this.aimY += (f.fy / l - this.aimY) * k;
    }
    const al = Math.hypot(this.aimX, this.aimY) || 1;
    this.aimX /= al; this.aimY /= al;

    this._corners(dt, vac);

    // ---- in the mouth: curl into a tube and go ---------------------------
    if (this.state === State.CAPTURED) {
      this.capT += dt;
      this.fold += (1.15 - this.fold) * (1 - Math.exp(-22 * dt));
      this.curl = clamp(this.capT / 0.17, 0, 1);
      const m = vac.mouth();
      this.x += (m.x - this.x) * (1 - Math.exp(-20 * dt));
      this.y += (m.y - this.y) * (1 - Math.exp(-20 * dt));
      this.z += (14 - this.z) * (1 - Math.exp(-14 * dt));
      this.spin += dt * 9;
      if (this.capT >= 0.17) {
        this._handOff(vac, { kind: 'fluff', color: this.front, size: Math.max(9, this.hw * 1.15) });
        world.onCaptured && world.onCaptured(this);
      }
      return;
    }

    // ---- which way is the air actually going here? -----------------------
    // mouth -> me, and how far off the mouth's axis that is
    const m = vac.mouth();
    const ux = -this.aimX, uy = -this.aimY;
    const align = ux * m.dirX + uy * m.dirY;      // 1 = straight in front of it
    this.align = align;
    const side = smoothstep(0.95, 0.35, align);
    // only the part of the head's motion that CHARGES at us counts
    const closing = Math.max(0, vac.nozzle.vx * ux + vac.nozzle.vy * uy);
    const rush = smoothstep(130, 620, closing);
    this.rush = rush;
    // a swung head throws air about; a head held still just inhales
    const gustK = (0.24 + 1.65 * rush) * (1 - 0.90 * vac.powerN);

    // ---- vertical: does it beat gravity? ---------------------------------
    this.vz += (s * AIRLIFT * this.lightness - GRAV) * dt;
    this.z += this.vz * dt;
    if (this.z >= ZMAX) { this.z = ZMAX; if (this.vz > 0) this.vz *= 0.12; }
    if (this.z <= 0) {
      this.z = 0;
      if (this.vz < 0) {
        // land: a sheet does not bounce, it slaps down and skids a little
        this.vz = 0;
        this.vx *= 0.35; this.vy *= 0.35;
        this.flipSpd *= 0.25;
      }
    }
    const air = clamp(this.z / 5, 0, 1);
    // a peeled-up edge is a SAIL: the sheet catches the air long before it
    // leaves the floor, which is why a rushed sweep can blow it away
    const reach = this.hh * 1.0 + 7;
    let maxc = 0;
    for (let i = 0; i < 4; i++) if (this.cz[i] > maxc) maxc = this.cz[i];
    const sail = clamp(maxc / reach, 0, 1);
    const caught = Math.max(air, sail * 0.9);
    this.sail = sail;

    // ---- horizontal: pull versus spill -----------------------------------
    // the suction has much less purchase on a sheet that is still lying flat;
    // the spilling air does not, because the peeled edge is a sail
    const pull = PULL * caught * (this.z <= 1.2 ? GROUND : 1);
    let ax = f.fx * pull;
    let ay = f.fy * pull;
    // outward component of (mouth -> me): the air that spills round the sides
    let px = ux - align * m.dirX, py = uy - align * m.dirY;
    const pl = Math.hypot(px, py);
    if (pl > 1e-4) { px /= pl; py /= pl; } else { px = -m.dirY; py = m.dirX; }
    const gmag = s * side * gustK * GUST * caught;
    this.gust = gmag;
    ax += (px * 0.92 + ux * 0.40) * gmag;
    ay += (py * 0.92 + uy * 0.40) * gmag;
    // and the bow wave: charge at a sheet of paper and you push it away first
    const bmag = s * rush * BOW * caught * (1 - 0.75 * vac.powerN);
    ax += ux * bmag; ay += uy * bmag;

    const pmag = Math.hypot(f.fx, f.fy) * pull;
    const fleeNow = (gmag + bmag) / (gmag + bmag + pmag + 1e-3);
    this.flee += (fleeNow - this.flee) * (1 - Math.exp(-9 * dt));

    // still touching the floor: friction has to be beaten before anything moves
    if (this.z <= 1.2) {
      const am = Math.hypot(ax, ay);
      if (am < STICK) { ax = 0; ay = 0; }
      else if (!this._loose) {
        // it breaks away all at once, with a visible kick off the boards
        this._loose = true;
        this.vx += ax / am * 60; this.vy += ay / am * 60;
        if (this.flee > 0.42) this.vz = Math.max(this.vz, 130);
      }
    } else { this._loose = true; }
    if (this.z <= 0.01 && Math.hypot(this.vx, this.vy) < 18) this._loose = false;

    this.vx += ax * dt; this.vy += ay * dt;
    const drag = Math.exp(-(air > 0.2 ? 3.2 : 10) * dt);
    this.vx *= drag; this.vy *= drag;
    this.x += this.vx * dt; this.y += this.vy * dt;

    const sp = Math.hypot(this.vx, this.vy);
    // tumbling: a fleeing sheet flips over and shows its back
    const wantFlip = air * (0.5 + this.flee * 3.0) * clamp(sp / 260, 0, 1.6);
    this.flipSpd += (wantFlip * 9 - this.flipSpd) * (1 - Math.exp(-6 * dt));
    this.flipPhase += this.flipSpd * dt;
    this.spin += (air * (this.flee - 0.25) * sp * 0.010 - this.spin) * (1 - Math.exp(-4 * dt));
    this.rot += this.spin * dt;

    // ---- folding: only when it is in FRONT of the mouth ------------------
    const foldGate = smoothstep(0.42, 0.80, align) * clamp(air * 1.3, 0, 1);
    const flap = 1 + 0.20 * Math.sin(this.t * TAU * 2.7 + this.seed);
    const ft = smoothstep(0.62, 1.40, s) * foldGate * flap;
    this.fold += (ft - this.fold) * (1 - Math.exp(-9 * dt));
    if (this.fold > 0.06) {
      // turn the crease across the flow so it folds TOWARD the mouth
      const want = Math.atan2(this.aimY, this.aimX);
      let d = ((want - this.rot + Math.PI) % TAU + TAU) % TAU - Math.PI;
      this.rot += d * (1 - Math.exp(-6 * this.fold * dt * 3));
    }

    // ---- stay in the room, always re-catchable ---------------------------
    const b = this.bounds;
    if (b) {
      if (this.x < b.x0) { this.x = b.x0; this.vx = Math.abs(this.vx) * 0.25; }
      else if (this.x > b.x1) { this.x = b.x1; this.vx = -Math.abs(this.vx) * 0.25; }
      if (this.y < b.y0) { this.y = b.y0; this.vy = Math.abs(this.vy) * 0.25; }
      else if (this.y > b.y1) { this.y = b.y1; this.vy = -Math.abs(this.vy) * 0.25; }
    }

    // settle
    if (this.z <= 0 && sp < 22 && s < 0.22) {
      this.hx = this.x; this.hy = this.y;
      this.flipSpd *= Math.exp(-6 * dt);
      const snap = Math.round(this.flipPhase / Math.PI) * Math.PI;
      this.flipPhase += (snap - this.flipPhase) * (1 - Math.exp(-7 * dt));
      this.spin *= Math.exp(-6 * dt);
    }

    this.state = this.z > 1.2 ? State.PULLED : (s > 0.055 ? State.REACTING : State.IDLE);
    if (f.inCapture) { this.state = State.CAPTURED; this.capT = 0; }
  }

  get lightness() { return this.soft ? 1.25 : this.kind2 === 'confetti' ? 1.35 : 1; }

  /** Per-corner field sampling: the near edge peels while the far edge lies flat. */
  _corners(dt, vac) {
    const c = Math.cos(this.rot), sn = Math.sin(this.rot);
    for (let i = 0; i < 4; i++) {
      this._corner(i, TMPC);
      const wx = this.x + TMPC.x * c - TMPC.y * sn;
      const wy = this.y + TMPC.x * sn + TMPC.y * c;
      this._cx[i] = wx; this._cy[i] = wy;
      const f = vac.field(wx, wy, TMPF);
      this.cs[i] = f.strength;
      const reach = this.hh * 1.0 + 7;
      // what matters is how much MORE flow this corner gets than the middle of
      // the sheet: that is why the near edge peels while the far edge lies flat
      const rel = (f.strength - this.strength) / Math.max(0.05, this.strength);
      const bias = clamp(0.44 + 3.2 * rel, 0, 1);
      let tz = smoothstep(0.028, 0.46, f.strength) * reach * bias;
      tz += noise1(this.t * 17 + this.seed + i * 13) * smoothstep(0.02, 0.26, f.strength) * 6.5 * (0.35 + bias);
      tz = clamp(tz, 0, reach * 1.2);
      const o = 17;
      const a = -2 * o * this.cv[i] - o * o * (this.cz[i] - tz);
      this.cv[i] += a * dt;
      this.cz[i] += this.cv[i] * dt;
      if (this.cz[i] < 0) { this.cz[i] = 0; if (this.cv[i] < 0) this.cv[i] = 0; }
    }
  }

  // ------------------------------------------------------------------ draw

  draw(ctx, cam) {
    if (this.state === State.DONE) return;
    const face = Math.cos(this.flipPhase);
    const up = face >= 0;
    const top = up ? this.front : this.back;
    const under = up ? this.back : this.front;

    // contact shadow: shrinks and softens as the sheet leaves the floor
    const lift = this.z / ZMAX;
    const cornerLift = (this.cz[0] + this.cz[1] + this.cz[2] + this.cz[3]) * 0.25;
    const sa = 0.30 * (1 - lift * 0.55) * (1 - clamp(cornerLift / (this.hh * 1.3), 0, 1) * 0.3);
    ctx.fillStyle = 'rgba(38,24,12,' + sa.toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(this.x + 3 + lift * 7, this.y + 4 + lift * 12,
      this.hw * (1 - lift * 0.22) * 1.0, this.hh * (1 - lift * 0.22) * 0.72, this.rot, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(this.x, this.y - this.z * 0.95);
    ctx.rotate(this.rot);
    const fs = Math.abs(face) * 0.86 + 0.14;
    ctx.scale(1, fs);

    // lift direction expressed in the (rotated) local frame
    // world "up-screen" (0,-1) expressed in the rotated local frame
    const lx = -Math.sin(this.rot) * 0.95, ly = -Math.cos(this.rot) * 0.95;

    if (this.fold > 0.12) this._drawFolded(ctx, top, under);
    else this._drawFlat(ctx, top, under, lx, ly);

    ctx.restore();
  }

  /**
   * Flat (or peeling) sheet. Each corner is displaced by its OWN lift, and a
   * lifted corner also draws in toward the middle — paper curls, it does not
   * extrude — so what you see is the sheet rolling up from the near edge with
   * its underside colour showing in the curl.
   */
  _drawFlat(ctx, top, under, lx, ly) {
    const P = PTS;
    const reach = this.hh * 1.0 + 7;
    for (let i = 0; i < 4; i++) {
      this._corner(i, TMPC);
      P[i].bx = TMPC.x; P[i].by = TMPC.y;
      const k = clamp(this.cz[i] / reach, 0, 1);
      const shrink = 1 - 0.30 * k;
      P[i].x = TMPC.x * shrink + lx * this.cz[i];
      P[i].y = TMPC.y * shrink + ly * this.cz[i];
    }
    // the curled-under face of every edge that has peeled up
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) & 3;
      const a = this.cz[i], b = this.cz[j];
      if (a < 1.6 && b < 1.6) continue;
      const k = clamp((a + b) / (reach * 2), 0, 1);
      ctx.fillStyle = shade(under, -0.06 - 0.22 * k);
      ctx.beginPath();
      ctx.moveTo(P[i].bx, P[i].by);
      // bow the curl so the fold is round, not a chamfered block
      const mbx = (P[i].bx + P[j].bx) * 0.5, mby = (P[i].by + P[j].by) * 0.5;
      const mtx = (P[i].x + P[j].x) * 0.5, mty = (P[i].y + P[j].y) * 0.5;
      ctx.lineTo(P[j].bx, P[j].by);
      ctx.quadraticCurveTo(mbx * 0.32 + mtx * 0.68 + lx * 1.5, mby * 0.32 + mty * 0.68 + ly * 1.5, P[j].x, P[j].y);
      ctx.lineTo(P[i].x, P[i].y);
      ctx.quadraticCurveTo(mbx * 0.68 + mtx * 0.32, mby * 0.68 + mty * 0.32, P[i].bx, P[i].by);
      ctx.closePath();
      ctx.fill();
    }

    // the sheet itself, edges bowed by their torn wobble
    ctx.beginPath();
    ctx.moveTo(P[0].x, P[0].y);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) & 3;
      const mx = (P[i].x + P[j].x) * 0.5, my = (P[i].y + P[j].y) * 0.5;
      const ex = P[j].x - P[i].x, ey = P[j].y - P[i].y;
      const bow = this.eb[i] * (this.soft ? 0.5 : 0.30);
      ctx.quadraticCurveTo(mx - ey * bow, my + ex * bow, P[j].x, P[j].y);
    }
    ctx.closePath();
    ctx.fillStyle = top;
    ctx.fill();
    // shading: the lifted end catches the light
    const glow = clamp((this.cz[0] + this.cz[1] + this.cz[2] + this.cz[3]) / (this.hh * 3), 0, 1);
    if (glow > 0.03) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.28 * glow).toFixed(3) + ')';
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(70,52,34,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    this._decor(ctx);
  }

  /** Folded: flat quad -> V along the crease -> tube, then curling inward. */
  _drawFolded(ctx, top, under) {
    const fold = clamp(this.fold, 0, 1.15);
    const half = Math.min(1.25, fold) * FOLD_MAX * 0.5;
    const c = Math.cos(half);
    const w = this.hw * c;
    const hh = this.hh * (1 - fold * 0.10) * (1 - this.curl * 0.30);
    const bulge = 1 + fold * 0.13;

    // far half (folded away from us): darker, showing its underside
    ctx.fillStyle = shade(under, -0.16);
    ctx.beginPath();
    ctx.moveTo(-w * this.cw[0], -hh);
    ctx.quadraticCurveTo(-w * 0.5, -hh * bulge, 0, -hh * bulge);
    ctx.lineTo(0, hh * bulge);
    ctx.quadraticCurveTo(-w * 0.5, hh * bulge, -w * this.cw[3], hh);
    ctx.closePath();
    ctx.fill();

    // near half: the lit face
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.moveTo(w * this.cw[1], -hh);
    ctx.quadraticCurveTo(w * 0.5, -hh * bulge, 0, -hh * bulge);
    ctx.lineTo(0, hh * bulge);
    ctx.quadraticCurveTo(w * 0.5, hh * bulge, w * this.cw[2], hh);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,' + (0.20 + 0.22 * fold).toFixed(3) + ')';
    ctx.fill();

    // the crease itself
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.6 + fold * 1.4;
    ctx.beginPath(); ctx.moveTo(0, -hh * bulge); ctx.lineTo(0, hh * bulge); ctx.stroke();
    ctx.strokeStyle = 'rgba(70,52,34,0.5)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-w * this.cw[0], -hh); ctx.lineTo(-w * this.cw[3], hh);
    ctx.moveTo(w * this.cw[1], -hh); ctx.lineTo(w * this.cw[2], hh);
    ctx.stroke();

    // once it is a tube, roll it: curl bands that travel as it is swallowed
    if (fold > 0.62) {
      const k = smoothstep(0.62, 1.0, fold);
      ctx.strokeStyle = 'rgba(70,52,34,' + (0.35 * k).toFixed(3) + ')';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const u = (i + 1) / 4;
        const yy = -hh * bulge + hh * bulge * 2 * u;
        ctx.beginPath();
        ctx.moveTo(-w * 0.95, yy);
        ctx.quadraticCurveTo(0, yy + (4 + this.curl * 6) * Math.sin(this.t * 9 + i + this.seed), w * 0.95, yy);
        ctx.stroke();
      }
      // the leading opening of the tube, dark: you can see down it
      ctx.fillStyle = 'rgba(40,28,16,' + (0.45 * k).toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(0, -hh * bulge, w * 0.9, 2.4 + 2.5 * k, 0, 0, TAU);
      ctx.fill();
    }
  }

  /** Print / pattern so a scrap reads as paper, not a coloured tile. */
  _decor(ctx) {
    if (this.kind2 === 'confetti') return;
    ctx.save();
    ctx.globalAlpha = 0.5;
    if (this.kind2 === 'strip') {
      ctx.strokeStyle = 'rgba(80,90,140,0.7)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-this.hw * 0.8, -this.hh * 0.2); ctx.lineTo(this.hw * 0.8, -this.hh * 0.2);
      ctx.moveTo(-this.hw * 0.8, this.hh * 0.35); ctx.lineTo(this.hw * 0.3, this.hh * 0.35);
      ctx.stroke();
    } else if (!this.soft) {
      ctx.strokeStyle = 'rgba(90,80,70,0.55)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        const y = i * this.hh * 0.42;
        ctx.moveTo(-this.hw * 0.62, y);
        ctx.lineTo(this.hw * (i === 1 ? 0.2 : 0.62), y);
      }
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(190,185,180,0.8)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-this.hw * 0.5, -this.hh * 0.3);
      ctx.quadraticCurveTo(0, this.hh * 0.2, this.hw * 0.5, -this.hh * 0.25);
      ctx.stroke();
    }
    ctx.restore();
  }

  snapshot() {
    const s = super.snapshot();
    s.z = +this.z.toFixed(1);
    s.lift = +((this.cz[0] + this.cz[1] + this.cz[2] + this.cz[3]) * 0.25).toFixed(1);
    s.edge = [+this.cz[0].toFixed(1), +this.cz[1].toFixed(1), +this.cz[2].toFixed(1), +this.cz[3].toFixed(1)];
    s.fold = +this.fold.toFixed(2);
    s.flee = +this.flee.toFixed(2);
    s.sail = +this.sail.toFixed(2);
    s.rush = +this.rush.toFixed(2);
    s.align = +this.align.toFixed(2);
    s.face = Math.cos(this.flipPhase) >= 0 ? 'front' : 'back';
    return s;
  }
}

/**
 * The heavy one: a folded paper aeroplane. Same airflow, but it is stiff and
 * heavy enough that it never leaves the floor and never flees — it only pivots
 * its nose into the flow and slides. It is there so that the scraps' skittish
 * lightness has something to be light COMPARED TO.
 */
export class PaperPlane extends Debris {
  constructor(x, y, rng, opts = {}) {
    super(x, y);
    this.rng = rng;
    this.L = opts.L || 62;            // nose-to-tail
    this.W = opts.W || 40;            // wingspan
    this.rot = opts.rot === undefined ? rng.range(0, TAU) : opts.rot;
    this.spin = 0;
    this.seed = rng.range(0, 100);
    this.color = opts.color || '#f4f1e6';
    this.shade = opts.shade || '#cfc8b6';
    this.accent = opts.accent || '#5a9bd6';
    this.sliding = false;
    this.shiver = 0;
    this.nose = 0;                    // how strongly the nose has swung round
    this.bounds = null;
    this.skid = 0;
  }
  get type() { return 'plane'; }

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    this.t += dt;
    const f = vac.field(this.x, this.y, this._f);
    const s = f.strength;
    this.strength = s;

    // the nose swings to point at the mouth long before anything moves:
    // sample the field at nose and tail and let the difference turn it
    const c = Math.cos(this.rot), sn = Math.sin(this.rot);
    const nx = this.x + c * this.L * 0.5, ny = this.y + sn * this.L * 0.5;
    const tx = this.x - c * this.L * 0.5, ty = this.y - sn * this.L * 0.5;
    const fn = vac.field(nx, ny, TMPF).strength;
    const ft = vac.field(tx, ty, this._f2 || (this._f2 = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 })).strength;
    const want = Math.atan2(f.fy, f.fx);
    let d = ((want - this.rot + Math.PI) % TAU + TAU) % TAU - Math.PI;
    const turn = clamp((fn + ft) * 2.6, 0, 1.6);
    this.rot += d * turn * dt * 2.2;
    this.nose = turn;
    // a stiff sheet on the floor buzzes rather than flutters
    this.shiver += (smoothstep(0.05, 0.62, s) - this.shiver) * (1 - Math.exp(-12 * dt));

    if (!this.sliding) {
      if (s > 0.46) { this.sliding = true; this.skid = 1; this.vx = f.fx * 26; this.vy = f.fy * 26; }
    } else {
      // stick-slip: a stiff folded plane scoots in short lurches
      const lurch = 0.55 + 0.45 * Math.sin(this.t * 13 + this.seed);
      this.vx += f.fx * 900 * lurch * dt;
      this.vy += f.fy * 900 * lurch * dt;
      const dr = Math.exp(-4.2 * dt);
      this.vx *= dr; this.vy *= dr;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.skid = clamp(Math.hypot(this.vx, this.vy) / 240, 0, 1);
      if (s < 0.24 && Math.hypot(this.vx, this.vy) < 16) {
        this.sliding = false; this.vx = 0; this.vy = 0; this.hx = this.x; this.hy = this.y;
      }
    }
    const b = this.bounds;
    if (b) { this.x = clamp(this.x, b.x0, b.x1); this.y = clamp(this.y, b.y0, b.y1); }

    this.state = this.sliding ? State.PULLED : (s > 0.05 ? State.REACTING : State.IDLE);
    if (f.inCapture) {
      this._handOff(vac, { kind: 'fluff', color: this.color, size: 16 });
      world.onCaptured && world.onCaptured(this);
    }
  }

  draw(ctx, cam) {
    if (this.state === State.DONE) return;
    const jx = noise1(this.t * 28 + this.seed) * this.shiver * 1.5;
    const jy = noise1(this.t * 28 + this.seed + 9) * this.shiver * 1.5;
    ctx.fillStyle = 'rgba(38,24,12,0.30)';
    ctx.beginPath();
    ctx.ellipse(this.x + 4, this.y + 5, this.L * 0.46, this.W * 0.34, this.rot, 0, TAU);
    ctx.fill();
    if (this.skid > 0.1) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.20 * this.skid).toFixed(3) + ')';
      ctx.lineWidth = this.W * 0.26;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(this.x + jx, this.y + jy);
    ctx.rotate(this.rot);
    const L = this.L, W = this.W;
    // far wing
    ctx.fillStyle = this.shade;
    ctx.beginPath();
    ctx.moveTo(L * 0.5, 0);
    ctx.lineTo(-L * 0.5, -W * 0.5);
    ctx.lineTo(-L * 0.28, 0);
    ctx.closePath(); ctx.fill();
    // near wing
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(L * 0.5, 0);
    ctx.lineTo(-L * 0.5, W * 0.5);
    ctx.lineTo(-L * 0.28, 0);
    ctx.closePath(); ctx.fill();
    // keel
    ctx.strokeStyle = 'rgba(70,52,34,0.55)';
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(L * 0.5, 0); ctx.lineTo(-L * 0.36, 0); ctx.stroke();
    ctx.strokeStyle = 'rgba(70,52,34,0.35)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(L * 0.5, 0); ctx.lineTo(-L * 0.5, -W * 0.5);
    ctx.moveTo(L * 0.5, 0); ctx.lineTo(-L * 0.5, W * 0.5);
    ctx.moveTo(-L * 0.5, -W * 0.5); ctx.lineTo(-L * 0.5, W * 0.5);
    ctx.stroke();
    ctx.fillStyle = this.accent;
    ctx.beginPath();
    ctx.moveTo(L * 0.44, 0); ctx.lineTo(L * 0.18, -W * 0.12); ctx.lineTo(L * 0.18, W * 0.12);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  snapshot() {
    const s = super.snapshot();
    s.shiver = +this.shiver.toFixed(2);
    s.sliding = this.sliding;
    s.nose = +this.nose.toFixed(2);
    return s;
  }
}

/* --------------------------------------------------------------- helpers */

const TMPC = { x: 0, y: 0 };
const PTS = [
  { x: 0, y: 0, bx: 0, by: 0 }, { x: 0, y: 0, bx: 0, by: 0 },
  { x: 0, y: 0, bx: 0, by: 0 }, { x: 0, y: 0, bx: 0, by: 0 },
];

const SHAPES = {
  scrap:    { w: [46, 66], h: [32, 46], front: ['#fbf7ec', '#ffb3c6', '#ffd95c', '#8fd3ff', '#a6e39a'] },
  strip:    { w: [78, 96], h: [16, 22], front: ['#fbf7ec', '#ffcf94'] },
  confetti: { w: [16, 23], h: [13, 18], front: ['#ff7d9e', '#ffd233', '#4fc4f5', '#77dc7b', '#b98cff'] },
  tissue:   { w: [42, 58], h: [36, 48], front: ['#fbfbf8', '#f2f6fb'] },
};

const BACK = {
  '#fbf7ec': '#9c8b6e',
  '#ffb3c6': '#c04c6c',
  '#ffd95c': '#c08a12',
  '#8fd3ff': '#2f7fb0',
  '#a6e39a': '#43934c',
  '#ffcf94': '#c07f38',
  '#ff7d9e': '#a82f56',
  '#ffd233': '#b4880c',
  '#4fc4f5': '#1c6f96',
  '#77dc7b': '#33803a',
  '#b98cff': '#6a3fae',
  '#fbfbf8': '#adafab',
  '#f2f6fb': '#94a2b2',
};

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
}
