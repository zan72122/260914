/**
 * Named one-finger gestures.
 *
 * A gesture is an array of {t, x, y, down}:
 *   t    ms from the start of the replay
 *   x,y  normalized screen coords (0..1) so the same gesture works on any device
 *   down finger on the glass
 *
 * Feed one to the page with window.game.input.replay(frames).
 *
 * Every gesture is built from a `from` point and a `to` point. `to` is where the
 * FINGER ends up; the nozzle is drawn ahead of it, so shot.mjs offsets `to` by
 * the lead distance when aiming at a debris (see resolveTarget below).
 */

const SAMPLE = 25; // ms between samples

function build(fn, dur, opts = {}) {
  const out = [];
  const n = Math.max(2, Math.round(dur / SAMPLE));
  // a real tap: one frame with the finger still up, then contact
  const p0 = fn(0);
  out.push({ t: 0, x: p0.x, y: p0.y, down: false });
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = fn(u);
    out.push({ t: Math.round(40 + u * dur), x: round(p.x), y: round(p.y), down: p.down !== undefined ? p.down : true });
  }
  if (opts.release) {
    const last = out[out.length - 1];
    out.push({ t: last.t + 60, x: last.x, y: last.y, down: false });
  }
  return out;
}
const round = (v) => Math.round(v * 10000) / 10000;
const mix = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

export const GESTURES = {
  /** Creep up on the target: the whole point is the pre-suction reaction. */
  'approach-slow': (o) => build((u) => ({
    x: mix(o.from.x, o.to.x, ease(u)),
    y: mix(o.from.y, o.to.y, ease(u)),
  }), o.dur || 2600),

  /** Same path, four times faster: less anticipation, more bang. */
  'approach-fast': (o) => build((u) => ({
    x: mix(o.from.x, o.to.x, ease(u)),
    y: mix(o.from.y, o.to.y, ease(u)),
  }), o.dur || 650),

  /** Stop short of the target and hold: the motor winds up, far fibers lean. */
  hold: (o) => build((u) => {
    const approach = Math.min(1, u / 0.3);
    const k = ease(approach) * 0.62;         // stop 38% short
    return { x: mix(o.from.x, o.to.x, k), y: mix(o.from.y, o.to.y, k) };
  }, o.dur || 3000),

  /** Scrub back and forth over the target. */
  rub: (o) => build((u) => {
    const approach = Math.min(1, u / 0.28);
    const bx = mix(o.from.x, o.to.x, ease(approach));
    const by = mix(o.from.y, o.to.y, ease(approach));
    const s = Math.max(0, (u - 0.28) / 0.72);
    const osc = Math.sin(s * Math.PI * 2 * 4.5);
    return { x: bx + osc * 0.16, y: by + osc * 0.03 };
  }, o.dur || 3200),

  /** Big lazy circle around the target: what a 4-year-old actually does. */
  circle: (o) => build((u) => {
    const approach = Math.min(1, u / 0.25);
    const cx = mix(o.from.x, o.to.x, ease(approach));
    const cy = mix(o.from.y, o.to.y, ease(approach));
    const s = Math.max(0, (u - 0.25) / 0.75);
    const a = s * Math.PI * 2 * 2 - Math.PI / 2;
    const r = 0.17 * Math.min(1, s * 4);
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.55 };
  }, o.dur || 3400),

  /** Sweep straight past the target and keep going: overshoot / skating. */
  'pass-by': (o) => build((u) => {
    const dx = o.to.x - o.from.x, dy = o.to.y - o.from.y;
    const k = ease(u) * 1.85;              // overshoot well past
    return { x: o.from.x + dx * k, y: o.from.y + dy * k };
  }, o.dur || 1400),

  /** Sit still far away: the baseline "nothing is happening" reference. */
  idle: (o) => build(() => ({ x: o.from.x, y: o.from.y, down: false }), o.dur || 1500),
};

export function gestureNames() { return Object.keys(GESTURES); }

export function makeGesture(name, opts) {
  const g = GESTURES[name];
  if (!g) throw new Error('unknown gesture: ' + name + ' (have: ' + gestureNames().join(', ') + ')');
  return g(opts);
}

/**
 * How far the MOUTH is ahead of the finger, in screen px.
 *
 * Two separate offsets, both of which the harness has to know about or it aims
 * the middle of the head at the target instead of the mouth:
 *   LEAD[pose].up   the head is drawn this far above the finger (screen px)
 *   MOUTH_OFFSET    the mouth is this far in front of the head (DESIGN px, so
 *                   it scales with the camera zoom)
 * Both come straight from the vacuum, so they can never drift apart again.
 */
export { LEAD, MOUTH_OFFSET } from '../src/vacuum/vacuum.js';
import { LEAD, MOUTH_OFFSET } from '../src/vacuum/vacuum.js';

/** Screen-px offset from the finger to the mouth, for a given game state. */
export function mouthLeadPx(state) {
  const L = LEAD[state.pose] || LEAD.portrait;
  const zoom = (state.camera && state.camera.zoom) || 1;
  return L.up + MOUTH_OFFSET * zoom;
}

/**
 * Turn a debris selector into a finger destination, given a window.game.state()
 * dump. selector: 'auto' (first pending debris), an exact id ('bunny#3'), or a
 * type prefix ('crumb'). The returned point is where the FINGER goes so that
 * the MOUTH lands on the debris' own aim point.
 */
export function resolveTarget(state, selector = 'auto') {
  const list = state.scene.debris.filter((d) => d.state !== 'in-cup' && !d.decor && !d.dormant);
  let d = null;
  if (!selector || selector === 'auto') d = list[0];
  else d = list.find((x) => x.id === selector) || list.find((x) => x.type === selector) || null;
  if (!d) return null;
  return { x: d.nx, y: d.ny + mouthLeadPx(state) / state.viewport.h, id: d.id };
}

/**
 * A waypoint path in normalized screen coords: [{x, y, hold}]. `seg` is the
 * travel time between waypoints in ms and `hold` the dwell at each one. The
 * finger goes down on the first point and stays down.
 */
export function makePath(points, opts = {}) {
  const seg = opts.seg === undefined ? 700 : opts.seg;
  const hold = opts.hold === undefined ? 0 : opts.hold;
  const out = [];
  if (!points.length) return out;
  const p0 = points[0];
  out.push({ t: 0, x: round(p0.x), y: round(p0.y), down: false });
  let t = 40;
  out.push({ t, x: round(p0.x), y: round(p0.y), down: true });
  const dwell0 = p0.hold === undefined ? hold : p0.hold;
  if (dwell0 > 0) { t += dwell0; out.push({ t, x: round(p0.x), y: round(p0.y), down: true }); }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const d = b.seg === undefined ? seg : b.seg;
    const n = Math.max(1, Math.round(d / SAMPLE));
    for (let k = 1; k <= n; k++) {
      const u = ease(k / n);
      out.push({ t: Math.round(t + (d * k) / n), x: round(mix(a.x, b.x, u)), y: round(mix(a.y, b.y, u)), down: true });
    }
    t += d;
    const dwell = b.hold === undefined ? hold : b.hold;
    if (dwell > 0) { t += dwell; out.push({ t: Math.round(t), x: round(b.x), y: round(b.y), down: true }); }
  }
  if (opts.release) out.push({ t: Math.round(t + 60), x: round(points[points.length - 1].x), y: round(points[points.length - 1].y), down: false });
  return out;
}
