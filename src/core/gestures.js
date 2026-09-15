/**
 * gestures.js — GestureRecognizer (DESIGN §5.5.7). READ THIS BEFORE WRITING A WORLD.
 *
 * ── Creating a recognizer ───────────────────────────────────────────────────────
 *   import { createGestures } from '../core/gestures.js';
 *   const rec = createGestures(engine);            // or: engine.gestures(config)
 *
 * The recognizer is fed by YOUR Scene's pointer callbacks:
 *   onPointerDown(p){ rec.down(p); }
 *   onPointerMove(p){ rec.move(p); }
 *   onPointerUp(p)  { rec.up(p); }
 * and it is ticked automatically once per frame by the engine (long-press timers,
 * circle inertia). Call `rec.destroy()` in your Scene's exit().
 *
 * ── Tolerance philosophy ────────────────────────────────────────────────────────
 * No recognizer ever reports failure. "Not recognised" simply means nothing happened.
 * All radii/distances are expressed as a RATIO OF S (= min(width,height)).
 * Only the single locked finger is ever seen (input.js).
 *
 * ── API ─────────────────────────────────────────────────────────────────────────
 * Every `on*` returns a handle: { cancel(), enabled:boolean, update(opts) }.
 *
 *  rec.onTap(hitTest, cb, opts)
 *      hitTest : (p) => boolean   — or the string 'any'
 *      opts    : { maxMoveRatio = 0.06, maxDurationMs = 700 }
 *      cb(p)
 *
 *  rec.onLongPress(hitTest, { onStart, onHold, onRelease, onCancel }, opts)
 *      opts    : { minMs = 300, maxMs = 2000, moveToleranceRatio = 0.25 }
 *      onStart(p)                  finger went down on the target
 *      onHold(t01, p)              t01 = 0..1 normalised over [minMs, maxMs]
 *      onRelease(t01, p, auto)     fired only when held >= minMs; auto=true at maxMs
 *      onCancel(p)                 released too early / moved too far
 *
 *  rec.onDrag(hitTest, { onStart, onMove, onEnd }, opts)
 *      opts    : { snapTargets: [{x,y,r}]   // r is an S-RATIO (e.g. 0.18)
 *                , returnOnRelease = true
 *                , hitPaddingRatio = 0.6    // hit area is 1.6x the visual (passed to your hitTest via p.pad)
 *                , snapOnEnter = false }    // fire onEnd as soon as a target is entered (magnetic snap)
 *      onStart(p)
 *      onMove(p, info)  info = { dx, dy, snapTarget|null }   (dx,dy = total delta from start)
 *      onEnd(p, info)   info = { snapped:boolean, target|null, returnOnRelease:boolean }
 *
 *  rec.onSwipe(hitTest, cb, opts)
 *      opts    : { minDistRatio = 0.15, maxMs = 800, direction = 'any'|'up'|'down'|'left'|'right' }
 *      cb({ dir, dist, vx, vy, p })
 *
 *  rec.onTrace(path, { onProgress, onComplete, onDeviate }, opts)
 *      path    : [{x,y}...] in css px — REBUILD IT IN layout()  (handle.update({path}))
 *      opts    : { toleranceRatio = 0.10, autoCompleteAt = 0.5, monotonic = true,
 *                  resampleStep = 8, startToleranceRatio = 0.18 }
 *      onProgress(t01, nearestPoint, isOnPath)
 *      onComplete(auto)   auto=true when released past autoCompleteAt
 *      onDeviate(t01, p)  finger outside the corridor, or released below autoCompleteAt (progress reset)
 *
 *  rec.onCircle(center, { onProgress, onComplete }, opts)
 *      center  : {x,y} css px (handle.update({center}))
 *      opts    : { turnsRequired = 2.5, direction = 'either'|'cw'|'ccw',
 *                  minRadiusRatio = 0.02, inertia = 0.92, accumulateAbs = true }
 *      onProgress(turns01, angularVelocity)   angularVelocity in rad/s (signed)
 *      onComplete()
 *      Radius is never checked (beyond minRadiusRatio); reversals never subtract;
 *      releasing the finger keeps spinning with `inertia` damping.
 */

const now = () => performance.now();

function makeHandle(rec, r) {
  return {
    get enabled() { return r.enabled; },
    set enabled(v) { r.enabled = !!v; if (!v) rec._resetOne(r); },
    cancel() { rec._resetOne(r); r.enabled = false; },
    remove() { const i = rec.list.indexOf(r); if (i >= 0) rec.list.splice(i, 1); },
    update(opts) { Object.assign(r, opts || {}); if (r.kind === 'trace' && opts && opts.path) rec._buildTrace(r); },
    get state() { return r; }
  };
}

function resample(path, step) {
  const out = [];
  if (!path || path.length === 0) return out;
  out.push({ x: path[0].x, y: path[0].y });
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    let ax = path[i - 1].x, ay = path[i - 1].y;
    const bx = path[i].x, by = path[i].y;
    let seg = Math.hypot(bx - ax, by - ay);
    while (acc + seg >= step) {
      const t = (step - acc) / seg;
      ax = ax + (bx - ax) * t; ay = ay + (by - ay) * t;
      out.push({ x: ax, y: ay });
      seg = Math.hypot(bx - ax, by - ay);
      acc = 0;
    }
    acc += seg;
  }
  const last = path[path.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last.x - tail.x, last.y - tail.y) > step * 0.4) out.push({ x: last.x, y: last.y });
  return out;
}

class Recognizers {
  constructor(engine, config = {}) {
    this.engine = engine;
    this.config = config;
    this.list = [];
    this._frame = -1;
    this._destroyed = false;
    if (engine && engine._registerGestures) engine._registerGestures(this);
  }

  get S() { return this.engine ? this.engine.S : 400; }

  _hit(r, p) {
    if (r.hitTest === 'any' || r.hitTest == null) return true;
    try { return !!r.hitTest(p); } catch (e) { return false; }
  }

  _add(r) { this.list.push(r); return makeHandle(this, r); }

  _resetOne(r) {
    if (r.kind === 'longPress' && r.active) { r.active = false; if (r.onCancel) r.onCancel(r.p); }
    r.active = false;
    if (r.kind === 'circle') { r.vel = 0; }
  }

  // ------------------------------------------------------------------ tap
  onTap(hitTest, cb, opts = {}) {
    return this._add({
      kind: 'tap', enabled: true, hitTest, cb,
      maxMoveRatio: opts.maxMoveRatio == null ? 0.06 : opts.maxMoveRatio,
      maxDurationMs: opts.maxDurationMs == null ? 700 : opts.maxDurationMs,
      active: false, sx: 0, sy: 0, st: 0, moved: 0
    });
  }

  // ------------------------------------------------------------ long press
  onLongPress(hitTest, cbs = {}, opts = {}) {
    return this._add({
      kind: 'longPress', enabled: true, hitTest,
      onStart: cbs.onStart, onHold: cbs.onHold, onRelease: cbs.onRelease, onCancel: cbs.onCancel,
      minMs: opts.minMs == null ? 300 : opts.minMs,
      maxMs: opts.maxMs == null ? 2000 : opts.maxMs,
      moveToleranceRatio: opts.moveToleranceRatio == null ? 0.25 : opts.moveToleranceRatio,
      active: false, st: 0, sx: 0, sy: 0, p: null, fired: false
    });
  }

  // ----------------------------------------------------------------- drag
  onDrag(hitTest, cbs = {}, opts = {}) {
    return this._add({
      kind: 'drag', enabled: true, hitTest,
      onStart: cbs.onStart, onMove: cbs.onMove, onEnd: cbs.onEnd,
      snapTargets: opts.snapTargets || [],
      returnOnRelease: opts.returnOnRelease !== false,
      hitPaddingRatio: opts.hitPaddingRatio == null ? 0.6 : opts.hitPaddingRatio,
      snapOnEnter: !!opts.snapOnEnter,
      active: false, sx: 0, sy: 0
    });
  }

  // ---------------------------------------------------------------- swipe
  onSwipe(hitTest, cb, opts = {}) {
    return this._add({
      kind: 'swipe', enabled: true, hitTest, cb,
      minDistRatio: opts.minDistRatio == null ? 0.15 : opts.minDistRatio,
      maxMs: opts.maxMs == null ? 800 : opts.maxMs,
      direction: opts.direction || 'any',
      active: false, sx: 0, sy: 0, st: 0
    });
  }

  // ---------------------------------------------------------------- trace
  onTrace(path, cbs = {}, opts = {}) {
    const r = {
      kind: 'trace', enabled: true, path,
      onProgress: cbs.onProgress, onComplete: cbs.onComplete, onDeviate: cbs.onDeviate,
      toleranceRatio: opts.toleranceRatio == null ? 0.10 : opts.toleranceRatio,
      autoCompleteAt: opts.autoCompleteAt == null ? 0.5 : opts.autoCompleteAt,
      monotonic: opts.monotonic !== false,
      resampleStep: opts.resampleStep == null ? 8 : opts.resampleStep,
      startToleranceRatio: opts.startToleranceRatio == null ? 0.18 : opts.startToleranceRatio,
      active: false, prog: 0, pts: [], completed: false, wasOn: true
    };
    this._buildTrace(r);
    return this._add(r);
  }

  _buildTrace(r) { r.pts = resample(r.path || [], Math.max(2, r.resampleStep)); }

  // --------------------------------------------------------------- circle
  onCircle(center, cbs = {}, opts = {}) {
    return this._add({
      kind: 'circle', enabled: true, center: center || { x: 0, y: 0 },
      onProgress: cbs.onProgress, onComplete: cbs.onComplete,
      turnsRequired: opts.turnsRequired == null ? 2.5 : opts.turnsRequired,
      direction: opts.direction || 'either',
      minRadiusRatio: opts.minRadiusRatio == null ? 0.02 : opts.minRadiusRatio,
      inertia: opts.inertia == null ? 0.92 : opts.inertia,
      accumulateAbs: opts.accumulateAbs !== false,
      active: false, lastA: 0, total: 0, vel: 0, completed: false
    });
  }

  // ------------------------------------------------------------- dispatch
  down(p) {
    if (this._destroyed || !p) return;
    const S = this.S;
    for (const r of this.list) {
      if (!r.enabled) continue;
      switch (r.kind) {
        case 'tap':
          if (this._hit(r, p)) { r.active = true; r.sx = p.x; r.sy = p.y; r.st = p.t || now(); r.moved = 0; }
          break;
        case 'longPress':
          if (this._hit(r, p)) {
            r.active = true; r.st = p.t || now(); r.sx = p.x; r.sy = p.y; r.p = p; r.fired = false;
            if (r.onStart) r.onStart(p);
            if (r.onHold) r.onHold(0, p);
          }
          break;
        case 'drag': {
          const pp = { ...p, pad: r.hitPaddingRatio };
          if (this._hit(r, pp)) { r.active = true; r.sx = p.x; r.sy = p.y; if (r.onStart) r.onStart(p); }
          break;
        }
        case 'swipe':
          if (this._hit(r, p)) { r.active = true; r.sx = p.x; r.sy = p.y; r.st = p.t || now(); }
          break;
        case 'trace': {
          if (!r.pts.length || r.completed) break;
          const near = this._nearest(r, p.x, p.y);
          const tol = r.startToleranceRatio * S;
          const startOk = near.d <= Math.max(tol, r.toleranceRatio * S * 2);
          if (startOk) {
            r.active = true;
            r.wasOn = true;
            if (!r.monotonic) r.prog = near.i / Math.max(1, r.pts.length - 1);
            if (r.onProgress) r.onProgress(r.prog, near.pt, true);
          }
          break;
        }
        case 'circle': {
          const dx = p.x - r.center.x, dy = p.y - r.center.y;
          r.active = true;
          r.lastA = Math.atan2(dy, dx);
          r.vel = 0;
          break;
        }
        default: break;
      }
    }
  }

  move(p) {
    if (this._destroyed || !p) return;
    const S = this.S;
    for (const r of this.list) {
      if (!r.enabled || !r.active) continue;
      switch (r.kind) {
        case 'tap':
          r.moved = Math.max(r.moved, Math.hypot(p.x - r.sx, p.y - r.sy));
          break;
        case 'longPress': {
          const d = Math.hypot(p.x - r.sx, p.y - r.sy);
          r.p = p;
          if (d > r.moveToleranceRatio * S) {
            r.active = false;
            if (r.onCancel) r.onCancel(p);
          }
          break;
        }
        case 'drag': {
          const info = { dx: p.x - r.sx, dy: p.y - r.sy, snapTarget: this._snapHit(r, p, S) };
          if (r.onMove) r.onMove(p, info);
          if (r.snapOnEnter && info.snapTarget) {
            r.active = false;
            if (r.onEnd) r.onEnd(p, { snapped: true, target: info.snapTarget, returnOnRelease: r.returnOnRelease, auto: true });
          }
          break;
        }
        case 'trace': {
          const near = this._nearest(r, p.x, p.y);
          const on = near.d <= r.toleranceRatio * S;
          const t = near.i / Math.max(1, r.pts.length - 1);
          r.prog = r.monotonic ? Math.max(r.prog, t) : t;
          if (!on && r.wasOn && r.onDeviate) r.onDeviate(r.prog, p);
          r.wasOn = on;
          if (r.onProgress) r.onProgress(r.prog, near.pt, on);
          if (r.prog >= 0.999 && !r.completed) {
            r.completed = true; r.active = false;
            if (r.onComplete) r.onComplete(false);
          }
          break;
        }
        case 'circle': {
          const dx = p.x - r.center.x, dy = p.y - r.center.y;
          const rad = Math.hypot(dx, dy);
          if (rad < r.minRadiusRatio * S) break;
          const a = Math.atan2(dy, dx);
          let d = a - r.lastA;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          r.lastA = a;
          let add = r.accumulateAbs ? Math.abs(d) : d;
          if (r.direction === 'cw') add = Math.max(0, d);
          else if (r.direction === 'ccw') add = Math.max(0, -d);
          r.total += add;
          r.vel = d * 60;
          this._circleProgress(r);
          break;
        }
        default: break;
      }
    }
  }

  up(p) {
    if (this._destroyed || !p) return;
    const S = this.S;
    const t = p.t || now();
    for (const r of this.list) {
      if (!r.enabled || !r.active) continue;
      switch (r.kind) {
        case 'tap': {
          r.active = false;
          const moved = Math.max(r.moved, Math.hypot(p.x - r.sx, p.y - r.sy));
          if (moved <= r.maxMoveRatio * S && t - r.st <= r.maxDurationMs) r.cb(p);
          break;
        }
        case 'longPress': {
          r.active = false;
          const el = t - r.st;
          const t01 = Math.max(0, Math.min(1, (el - r.minMs) / Math.max(1, r.maxMs - r.minMs)));
          if (el >= r.minMs) { if (r.onRelease) r.onRelease(t01, p, false); }
          else if (r.onCancel) r.onCancel(p);
          break;
        }
        case 'drag': {
          r.active = false;
          const target = this._snapHit(r, p, S);
          if (r.onEnd) r.onEnd(p, { snapped: !!target, target, returnOnRelease: r.returnOnRelease, auto: false });
          break;
        }
        case 'swipe': {
          r.active = false;
          const dx = p.x - r.sx, dy = p.y - r.sy;
          const d = Math.hypot(dx, dy);
          const ms = t - r.st;
          if (d >= r.minDistRatio * S && ms <= r.maxMs) {
            const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
            if (r.direction === 'any' || r.direction === dir) {
              r.cb({ dir, dist: d, vx: dx / (ms / 1000 || 1), vy: dy / (ms / 1000 || 1), p });
            }
          }
          break;
        }
        case 'trace': {
          r.active = false;
          if (r.completed) break;
          if (r.prog >= r.autoCompleteAt) {
            r.completed = true;
            if (r.onComplete) r.onComplete(true);
          } else {
            r.prog = 0;
            if (r.onDeviate) r.onDeviate(0, p);
            if (r.onProgress) r.onProgress(0, r.pts[0], true);
          }
          break;
        }
        case 'circle':
          r.active = false;   // keep spinning on inertia in update()
          break;
        default: break;
      }
    }
  }

  _snapHit(r, p, S) {
    let best = null, bestD = Infinity;
    for (const tgt of (r.snapTargets || [])) {
      const rad = (tgt.r == null ? 0.15 : tgt.r) * S;
      const d = Math.hypot(p.x - tgt.x, p.y - tgt.y);
      if (d <= rad && d < bestD) { best = tgt; bestD = d; }
    }
    return best;
  }

  _nearest(r, x, y) {
    let bi = 0, bd = Infinity;
    const pts = r.pts;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - x, pts[i].y - y);
      if (d < bd) { bd = d; bi = i; }
    }
    return { i: bi, d: bd, pt: pts[bi] || { x, y } };
  }

  _circleProgress(r) {
    const need = r.turnsRequired * Math.PI * 2;
    const t01 = Math.max(0, Math.min(1, r.total / need));
    if (r.onProgress) r.onProgress(t01, r.vel);
    if (t01 >= 1 && !r.completed) {
      r.completed = true;
      if (r.onComplete) r.onComplete();
    }
  }

  /** Ticked by the engine once per frame (safe to call manually; idempotent per frame). */
  update(dt, frameId) {
    if (this._destroyed) return;
    if (frameId != null) { if (this._frame === frameId) return; this._frame = frameId; }
    const t = now();
    for (const r of this.list) {
      if (!r.enabled) continue;
      if (r.kind === 'longPress' && r.active) {
        const el = t - r.st;
        const t01 = Math.max(0, Math.min(1, (el - r.minMs) / Math.max(1, r.maxMs - r.minMs)));
        if (r.onHold) r.onHold(t01, r.p);
        if (el >= r.maxMs) {
          r.active = false;
          if (r.onRelease) r.onRelease(1, r.p, true);
        }
      } else if (r.kind === 'circle' && !r.active && !r.completed && Math.abs(r.vel) > 0.0001) {
        const k = Math.pow(r.inertia, dt * 60);
        r.vel *= k;
        const d = r.vel * dt;
        r.total += r.accumulateAbs ? Math.abs(d) : Math.max(0, d);
        if (Math.abs(r.vel) < 0.02) r.vel = 0;
        this._circleProgress(r);
      }
    }
  }

  /** Cancel every in-flight recognition without notifying (scene teardown). */
  reset() { for (const r of this.list) { r.active = false; if (r.kind === 'circle') r.vel = 0; } }

  destroy() {
    this._destroyed = true;
    this.list.length = 0;
    if (this.engine && this.engine._unregisterGestures) this.engine._unregisterGestures(this);
  }
}

/**
 * @param {Object} engine
 * @param {Object} [config]
 * @returns {Recognizers}
 */
export function createGestures(engine, config) {
  return new Recognizers(engine, config);
}

export { Recognizers };
