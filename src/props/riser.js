import { Prop } from './prop.js';
import { clamp, smoothstep, TAU } from '../core/math.js';

const HEAD_IN = 9;        // how far the head's centre stays clear of the corner
const HOP_DUR = 0.36;
const CROUCH = 0.26;      // fraction of the hop spent gathering itself
const HOP_ARC = 32;       // peak lift of the arc, design px

/**
 * One riser: the solid vertical face at the front of a step.
 *
 * It is a non-pushable `Prop` so it reads as furniture to anything that walks
 * the props array, but the head does NOT resolve against it the usual way. A
 * two-sided rigid block on a staircase is exactly how a head gets wedged
 * between two of them, and this room has seven. Instead a riser blocks only
 * from BELOW — `Climb` clamps the head to the tread it is standing on — so
 * going back down a step is always free and the head can never be trapped.
 *
 * Pressing into it is the input. `press` (0..1) is how long the head has been
 * leaning on this face, and it is drawn: the face brightens where the head is
 * and dust shakes loose out of the corner. At 1 the head HOPS up.
 */
export class Riser extends Prop {
  constructor(stair, j) {
    const l = stair.left(j), r = stair.right(j);
    super({
      x: (l + r) * 0.5, y: stair.noseY(j) + stair.riser * 0.5,
      shape: 'rect', w: r - l, h: stair.riser,
      pushable: false, shadow: false, draw: () => {},
    });
    this.stair = stair;
    this.j = j;
    this.press = 0;
    this.hitX = this.x;
    this.flash = 0;
  }

  /**
   * The press cue.
   *
   * Leaning on a riser has to look like effort, so the CORNER the head is
   * jammed into lights up and the lip above it brightens along the width of the
   * head — and both grow with the press, so the child can see the machine
   * winding itself up to go. It is drawn on the corner line, where the contact
   * actually is, not smeared over the face.
   */
  drawPress(ctx) {
    const p = this.press;
    if (p < 0.02 && this.flash < 0.02) return;
    const st = this.stair;
    const base = st.cornerY(this.j - 1);     // the corner the head is jammed in
    const lip = st.noseY(this.j);            // the lip it is about to go over
    const x = this.hitX;
    const q = p * p;
    const w = 40 + q * 30;
    ctx.save();
    ctx.globalAlpha = clamp(0.16 + 0.46 * q + 0.5 * this.flash, 0, 1);
    ctx.fillStyle = '#ffeec4';
    ctx.beginPath();
    ctx.ellipse(x, base + 1, w, 5 + q * 5, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = clamp(0.30 * q + 0.9 * this.flash, 0, 1);
    ctx.fillStyle = '#fffaea';
    ctx.fillRect(x - w * 0.55, lip - 6, w * 1.1, 6);
    ctx.restore();
  }

  snapshot() { const s = super.snapshot(); s.j = this.j; s.press = +this.press.toFixed(2); return s; }
}

/**
 * The climb.
 *
 * The head lives on ONE tread at a time. It can walk down a step whenever it
 * likes (that is just falling off a lip), but it only goes UP by pressing into
 * the riser in front of it until the machine gathers itself and hops: a crouch,
 * an arc, a landing that squashes the mouth and kicks the camera, and a puff of
 * dust off the nosing. The body stays where it was and comes up the hose a step
 * behind, dangling — which is exactly what a vacuum does on stairs.
 *
 *   this.climb = new Climb(stair, risers);
 *   this.climb.update(dt, vac, cam);        // after vac.update(), from update()
 *   this.climb.k                            // which tread the head is on
 */
export class Climb {
  constructor(stair, risers) {
    this.stair = stair;
    this.risers = risers;         // risers[j] is the face BELOW tread j
    this.k = 0;
    this.press = 0;
    this.cool = 0;
    this.hop = null;
    this.hopN = 0;
    this.grace = 0;
    this.onHop = null;            // (phase, x, y) => void : 'take' | 'land'
    this.lastCeil = 0;
  }

  setStep(k) { this.k = clamp(k, 0, this.stair.n); this.hop = null; this.press = 0; }

  /** y the head's centre is held at when it is pressed into the riser. */
  ceilY(k) { return this.stair.cornerY(k) + HEAD_IN; }

  update(dt, vac, cam) {
    const st = this.stair;
    this.cool = Math.max(0, this.cool - dt);
    this.grace = Math.max(0, this.grace - dt);
    // every face relaxes; the one being leaned on is re-asserted below, so a
    // cue can never be left burning on a riser the head has walked away from
    for (let i = 0; i < this.risers.length; i++) {
      const r = this.risers[i];
      r.flash = Math.max(0, r.flash - dt * 3.4);
      r.press = Math.max(0, r.press - dt * 3.0);
    }

    if (this.hop) return this._hop(dt, vac, cam);

    // --- walking back down is free: past the lip and you are on the one below
    let guard = 0;
    while (this.grace <= 0 && this.k > 0
      && vac.nozzle.y > st.noseY(this.k) + 6 && guard++ < 24) this.k--;

    // --- the tread you are on is a ceiling, and leaning on it is the input
    const ceil = this.ceilY(this.k);
    this.lastCeil = ceil;
    const pen = ceil - vac.nozzle.y;
    const r = this.risers[this.k + 1];
    if (pen > 0) {
      vac.nozzle.y = ceil;
      if (vac.nozzle.vy < 0) vac.nozzle.vy = 0;
      if (this.k < st.n && this.cool <= 0) {
        this.press = clamp(this.press + dt * (0.5 + 2.2 * smoothstep(1.0, 9, pen)), 0, 1);
      }
    } else {
      this.press = Math.max(0, this.press - dt * 2.4);
    }
    if (r) { r.press = this.press; r.hitX = vac.nozzle.x; }

    // The body cannot climb: it stays on the step BELOW and dangles from the
    // hose. That is not decoration — a body dragged up level with the head
    // makes the machine read as one squashed blob instead of a thing on stairs.
    const bFloor = (this.k > 0 ? st.cornerY(this.k - 1) : st.y0 + st.riser) + 10;
    if (vac.body.y < bFloor) { vac.body.y = bFloor; if (vac.body.vy < 0) vac.body.vy = 0; }

    if (this.press >= 1) this._start(vac, cam);
  }

  _start(vac, cam) {
    const st = this.stair;
    const k1 = this.k + 1;
    this.hop = {
      t: 0, x0: vac.nozzle.x, y0: vac.nozzle.y,
      yT: st.noseY(k1) - Math.min(st.depth(k1), 90) * 0.34,
    };
    this.k = k1;                       // the world rises with you, at once
    this.press = 0;
    this.cool = 0.5;
    this.hopN++;
    const r = this.risers[k1];
    if (r) { r.press = 0; r.flash = 1; }
    if (this.onHop) this.onHop('take', vac.nozzle.x, this.hop.y0);
  }

  _hop(dt, vac, cam) {
    const st = this.stair;
    const h = this.hop;
    h.t += dt;
    const u = clamp(h.t / HOP_DUR, 0, 1);
    let y;
    if (u < CROUCH) {
      // gather: it dips into the tread before it goes, which is the whole
      // reason the hop reads as a hop and not a teleport
      const e = u / CROUCH;
      y = h.y0 + 10 * Math.sin(e * Math.PI * 0.5);
    } else {
      const e = (u - CROUCH) / (1 - CROUCH);
      const s = e * e * (3 - 2 * e);
      y = (h.y0 + 10) + (h.yT - h.y0 - 10) * s - HOP_ARC * Math.sin(Math.PI * e);
    }
    vac.nozzle.y = y;
    vac.nozzle.vy = 0;
    // it may drift sideways with the finger, but not off the step
    const l = st.left(this.k) + 42, r = st.right(this.k) - 42;
    if (vac.nozzle.x < l) { vac.nozzle.x = l; vac.nozzle.vx = 0; }
    if (vac.nozzle.x > r) { vac.nozzle.x = r; vac.nozzle.vx = 0; }
    const bFloor = (this.k > 1 ? st.cornerY(this.k - 2) : st.y0 + st.riser) + 10;
    if (vac.body.y < bFloor) { vac.body.y = bFloor; vac.body.vy = 0; }

    if (u >= 1) {
      this.hop = null;
      this.grace = 0.3;
      vac.gulp(0.85);
      if (cam) cam.kick(4.4);
      if (this.onHop) this.onHop('land', vac.nozzle.x, h.yT);
    }
  }

  snapshot() {
    return { k: this.k, press: +this.press.toFixed(2), hop: !!this.hop, hops: this.hopN };
  }
}
