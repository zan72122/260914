/**
 * tween.js — easing functions + a tiny Tween / Timeline runner.
 *
 *   const t = new Tween(0, 1, 0.6, easeOutCubic, v => obj.a = v);
 *   t.update(dt); t.done
 *
 *   const tl = new Timeline();
 *   tl.at(0.0, () => ...).at(0.75, () => ...).tween(0.25, 0.5, 0,1, easeOutCubic, v=>...);
 *   tl.update(dt);
 */

export const linear = (t) => t;
export const easeInQuad = (t) => t * t;
export const easeOutQuad = (t) => t * (2 - t);
export const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
export const easeInCubic = (t) => t * t * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
export const easeInOutQuart = (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInExpo = (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10));
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutElastic = (t) => {
  const c4 = (2 * Math.PI) / 3;
  return t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};
export const easeOutBounce = (t) => {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

export const EASES = {
  linear, easeInQuad, easeOutQuad, easeInOutQuad, easeInCubic, easeOutCubic, easeInOutCubic,
  easeOutQuart, easeInOutQuart, easeOutExpo, easeInExpo, easeOutBack, easeOutElastic,
  easeOutBounce, easeInOutSine
};

/** resolve an ease given as a function or a name */
export function ease(e) {
  if (typeof e === 'function') return e;
  if (typeof e === 'string' && EASES[e]) return EASES[e];
  return easeOutCubic;
}

/** clamp + lerp helpers used everywhere */
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** normalized 0..1 progress of v between a and b */
export const t01 = (v, a, b) => clamp((v - a) / (b - a || 1));
/** smooth 0..1..0 pulse */
export const pulse01 = (t) => 0.5 - 0.5 * Math.cos(Math.PI * 2 * clamp(t));
/** frame-rate independent damping factor */
export const damp = (rate, dt) => 1 - Math.pow(rate, dt * 60);

export class Tween {
  /**
   * @param {number} from @param {number} to @param {number} dur seconds
   * @param {Function|string} easeFn @param {(v:number,t:number)=>void} [onUpdate]
   * @param {()=>void} [onDone]
   */
  constructor(from, to, dur, easeFn, onUpdate, onDone) {
    this.from = from; this.to = to; this.dur = Math.max(1e-6, dur);
    this.ease = ease(easeFn); this.onUpdate = onUpdate; this.onDone = onDone;
    this.t = 0; this.done = false; this.value = from; this.delay = 0;
  }
  update(dt) {
    if (this.done) return this.value;
    if (this.delay > 0) { this.delay -= dt; if (this.delay > 0) return this.value; dt = -this.delay; this.delay = 0; }
    this.t = Math.min(this.dur, this.t + dt);
    const k = this.ease(this.t / this.dur);
    this.value = this.from + (this.to - this.from) * k;
    if (this.onUpdate) this.onUpdate(this.value, this.t / this.dur);
    if (this.t >= this.dur) { this.done = true; if (this.onDone) this.onDone(); }
    return this.value;
  }
  finish() { while (!this.done) this.update(this.dur); return this.value; }
}

/** A list of tweens/callbacks on a shared clock (seconds). */
export class Timeline {
  constructor() { this.time = 0; this.items = []; this.duration = 0; this.running = true; }
  /** run cb once when the clock passes t */
  at(t, cb) {
    this.items.push({ kind: 'cue', t, cb, fired: false });
    this.duration = Math.max(this.duration, t);
    return this;
  }
  /** animate from->to between t0 and t0+dur */
  tween(t0, dur, from, to, easeFn, onUpdate) {
    this.items.push({ kind: 'tween', t: t0, dur: Math.max(1e-6, dur), from, to, ease: ease(easeFn), cb: onUpdate });
    this.duration = Math.max(this.duration, t0 + dur);
    return this;
  }
  update(dt) {
    if (!this.running) return;
    this.time += dt;
    for (const it of this.items) {
      if (it.kind === 'cue') {
        if (!it.fired && this.time >= it.t) { it.fired = true; it.cb(); }
      } else {
        const k = clamp((this.time - it.t) / it.dur);
        if (this.time >= it.t && (k < 1 || it.last !== 1)) {
          it.last = k;
          it.cb(it.from + (it.to - it.from) * it.ease(k), k);
        }
      }
    }
  }
  get finished() { return this.time >= this.duration; }
  reset() { this.time = 0; for (const it of this.items) { it.fired = false; it.last = undefined; } }
}
