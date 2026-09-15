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

/** Lead offset (screen px) the nozzle is drawn ahead of the finger. */
export const LEAD_PX = { portrait: 70, landscape: 60 };

/**
 * Turn a debris selector into a finger destination, given a window.game.state()
 * dump. selector: 'auto' (first pending debris), an exact id ('bunny#3'), or a
 * type prefix ('crumb').
 */
export function resolveTarget(state, selector = 'auto') {
  const list = state.scene.debris.filter((d) => d.state !== 'in-cup');
  let d = null;
  if (!selector || selector === 'auto') d = list[0];
  else d = list.find((x) => x.id === selector) || list.find((x) => x.type === selector) || null;
  if (!d) return null;
  const lead = (LEAD_PX[state.pose] || 70) / state.viewport.h;
  return { x: d.nx, y: d.ny + lead, id: d.id };
}
