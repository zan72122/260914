/**
 * camera.js — Camera2D (DESIGN §5.5.8).
 *
 * A world draws in its own design space (default core rect 600x600 world units).
 * `setFrame({coreW, coreH, mode})` fits that rect into the screen ('contain' keeps the
 * whole core rect visible in BOTH orientations; 'cover' fills the screen).
 *
 *   cam.setFrame({coreW:600, coreH:600, mode:'contain'});
 *   cam.apply(g);   ...draw in world units...   cam.restore(g);
 *   const s = cam.worldToScreen(wx, wy);  // -> {x,y} css px
 *   const w = cam.screenToWorld(sx, sy);  // -> {x,y} world units
 *
 * Tilt is a PSEUDO tilt: vertical squash + vertical skew + vertical pan (no real 3D).
 */

import { ease, clamp } from './tween.js';

export class Camera2D {
  constructor(engine) {
    this.engine = engine;
    this.x = 300; this.y = 300;
    this.zoom = 1; this.rotation = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.coreW = 600; this.coreH = 600; this.mode = 'contain';
    this.baseScale = 1;
    this._tilt = 0;            // degrees
    this._tiltT = null;
    this._tweens = [];
    this._shake = null;
    this._follow = null;
    this._m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    this._depth = 0;
    this.recompute();
  }

  /** @param {{coreW?:number,coreH?:number,mode?:'contain'|'cover'}} o */
  setFrame(o = {}) {
    if (o.coreW) this.coreW = o.coreW;
    if (o.coreH) this.coreH = o.coreH;
    if (o.mode) this.mode = o.mode;
    this.x = this.coreW / 2; this.y = this.coreH / 2;
    this.recompute();
    return this;
  }

  /** Reset to an identity-ish screen-space camera (1 world unit == 1 css px). */
  resetToScreen() {
    const w = this.engine ? this.engine.width : 1, h = this.engine ? this.engine.height : 1;
    this.coreW = w; this.coreH = h; this.mode = 'contain';
    this.x = w / 2; this.y = h / 2;
    this.zoom = 1; this.rotation = 0; this._tilt = 0;
    this.shakeX = this.shakeY = 0;
    this._tweens.length = 0; this._shake = null; this._follow = null; this._tiltT = null;
    this.recompute();
    return this;
  }

  recompute() {
    const w = this.engine ? this.engine.width : this.coreW;
    const h = this.engine ? this.engine.height : this.coreH;
    const sx = w / this.coreW, sy = h / this.coreH;
    this.baseScale = this.mode === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
    this.viewW = w; this.viewH = h;
  }

  get scale() { return this.baseScale * this.zoom; }

  /** visible world rect (approximate; ignores rotation/tilt) */
  get viewRect() {
    const s = this.scale;
    return { x: this.x - this.viewW / (2 * s), y: this.y - this.viewH / (2 * s), w: this.viewW / s, h: this.viewH / s };
  }

  _matrix() {
    const s = this.scale;
    const rad = (this._tilt * Math.PI) / 180;
    const tiltY = Math.cos(rad * 0.85);            // vertical squash
    const skew = Math.sin(rad) * 0.35;             // vertical skew (perspective feel)
    const cos = Math.cos(this.rotation), sin = Math.sin(this.rotation);
    // M = T(cx,cy) * R * S(s, s*tiltY, skew) * T(-x,-y)
    const a0 = s, b0 = 0, c0 = skew * s, d0 = s * tiltY;
    const a = cos * a0 - sin * b0, b = sin * a0 + cos * b0;
    const c = cos * c0 - sin * d0, d = sin * c0 + cos * d0;
    const cx = this.viewW / 2 + this.shakeX, cy = this.viewH / 2 + this.shakeY;
    const e = cx - (a * this.x + c * this.y);
    const f = cy - (b * this.x + d * this.y);
    this._m = { a, b, c, d, e, f };
    return this._m;
  }

  apply(g) {
    const m = this._matrix();
    g.save();
    g.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    this._depth++;
  }

  restore(g) {
    if (this._depth > 0) { g.restore(); this._depth--; }
  }

  worldToScreen(x, y) {
    const m = this._matrix();
    return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
  }

  screenToWorld(x, y) {
    const m = this._matrix();
    const det = m.a * m.d - m.b * m.c || 1e-6;
    const px = x - m.e, py = y - m.f;
    return { x: (px * m.d - py * m.c) / det, y: (py * m.a - px * m.b) / det };
  }

  // ------------------------------------------------------------- motion

  panTo(x, y, dur = 0.6, easeFn = 'easeInOutCubic') {
    if (dur <= 0) { this.x = x; this.y = y; return; }
    this._tweens.push({ keys: ['x', 'y'], from: [this.x, this.y], to: [x, y], t: 0, dur, ease: ease(easeFn) });
  }

  zoomTo(z, dur = 0.6, easeFn = 'easeOutCubic') {
    if (dur <= 0) { this.zoom = z; return; }
    this._tweens.push({ keys: ['zoom'], from: [this.zoom], to: [z], t: 0, dur, ease: ease(easeFn) });
  }

  rotateTo(rad, dur = 0.6, easeFn = 'easeInOutCubic') {
    if (dur <= 0) { this.rotation = rad; return; }
    this._tweens.push({ keys: ['rotation'], from: [this.rotation], to: [rad], t: 0, dur, ease: ease(easeFn) });
  }

  /** pseudo-tilt in degrees (0 = flat on) */
  tiltTo(deg, dur = 0.8, easeFn = 'easeInOutCubic') {
    if (dur <= 0) { this._tilt = deg; return; }
    this._tiltT = { from: this._tilt, to: deg, t: 0, dur, ease: ease(easeFn) };
  }
  get tilt() { return this._tilt; }

  /**
   * @param {() => ({x:number,y:number})} targetFn world-space target
   * @param {{lead?:number, damping?:number, screenAnchor?:{x:number,y:number}}} [o]
   *        screenAnchor in 0..1 screen coords (default centre; lithium uses {x:0.33,y:0.5})
   */
  follow(targetFn, o = {}) {
    if (!targetFn) { this._follow = null; return; }
    this._follow = {
      fn: targetFn,
      lead: o.lead || 0,
      damping: o.damping == null ? 0.12 : o.damping,
      anchor: o.screenAnchor || { x: 0.5, y: 0.5 },
      lastX: null, lastY: null
    };
  }

  /** @param {number} amplitudeRatio fraction of S @param {number} dur seconds */
  shake(amplitudeRatio = 0.012, dur = 0.5) {
    const S = this.engine ? this.engine.S : Math.min(this.viewW, this.viewH);
    this._shake = { amp: amplitudeRatio * S, t: 0, dur: Math.max(0.01, dur) };
  }

  /** place the camera on a circle around a world point (pseudo-orbit) */
  orbit(centerX, centerY, angle, radius) {
    this.x = centerX + Math.sin(angle) * radius;
    this.y = centerY + Math.cos(angle) * radius * 0.28;
    this.rotation = -Math.sin(angle) * 0.05;
  }

  update(dt) {
    for (let i = this._tweens.length - 1; i >= 0; i--) {
      const tw = this._tweens[i];
      tw.t = Math.min(tw.dur, tw.t + dt);
      const k = tw.ease(tw.t / tw.dur);
      for (let j = 0; j < tw.keys.length; j++) this[tw.keys[j]] = tw.from[j] + (tw.to[j] - tw.from[j]) * k;
      if (tw.t >= tw.dur) this._tweens.splice(i, 1);
    }
    if (this._tiltT) {
      const t = this._tiltT;
      t.t = Math.min(t.dur, t.t + dt);
      this._tilt = t.from + (t.to - t.from) * t.ease(t.t / t.dur);
      if (t.t >= t.dur) this._tiltT = null;
    }
    if (this._follow) {
      const f = this._follow;
      const tgt = f.fn();
      if (tgt) {
        const s = this.scale;
        let vx = 0, vy = 0;
        if (f.lastX != null && dt > 0) { vx = (tgt.x - f.lastX) / dt; vy = (tgt.y - f.lastY) / dt; }
        f.lastX = tgt.x; f.lastY = tgt.y;
        const dx = (f.anchor.x - 0.5) * this.viewW / s;
        const dy = (f.anchor.y - 0.5) * this.viewH / s;
        const wantX = tgt.x - dx + vx * f.lead;
        const wantY = tgt.y - dy + vy * f.lead;
        const k = 1 - Math.pow(1 - clamp(f.damping, 0.001, 1), dt * 60);
        this.x += (wantX - this.x) * k;
        this.y += (wantY - this.y) * k;
      }
    }
    if (this._shake) {
      const s = this._shake;
      s.t += dt;
      const k = Math.max(0, 1 - s.t / s.dur);
      const a = s.amp * k * k;
      this.shakeX = (Math.random() * 2 - 1) * a;
      this.shakeY = (Math.random() * 2 - 1) * a;
      if (s.t >= s.dur) { this._shake = null; this.shakeX = this.shakeY = 0; }
    }
    this.recompute();
  }
}
