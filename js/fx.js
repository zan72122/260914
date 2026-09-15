// fx.js — animation helpers (Web Animations API + rAF).
// Every effect here is purely visual; nothing in it renders text.

const EASE_OUT = 'cubic-bezier(.22,.9,.28,1)';

/** Generic rAF tween. onFrame(t) with t eased 0..1. Returns a Promise. */
export function tween(duration, onFrame, easing = easeOutCubic) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      onFrame(easing(p), p);
      if (p < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

export const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);
export const easeInOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
export const linear = (p) => p;
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * "Softly float back" to the element's resting transform (rule 5: never punish).
 * `fromTransform` is where the finger left it.
 */
export function springBack(el, fromTransform, toTransform, duration = 200) {
  const anim = el.animate(
    [{ transform: fromTransform }, { transform: toTransform }],
    { duration, easing: EASE_OUT, fill: 'none' }
  );
  el.style.transform = toTransform;
  return anim.finished.catch(() => {});
}

/** Settling wobble after a successful drop / a satisfied puzzle condition. */
export function wiggle(el, amount = 3, duration = 420) {
  const base = el.style.transform || '';
  const f = (d) => ({ transform: `${base} translateX(${d}px)` });
  const anim = el.animate(
    [f(0), f(-amount), f(amount), f(-amount * 0.5), f(0)],
    { duration, easing: 'ease-in-out', fill: 'none' }
  );
  return anim.finished.catch(() => {});
}

/* --------------------------- SVG layer helpers --------------------------- */

/** Fade an element (SVG group or DOM node) and leave it at `to`. */
export function fade(el, from, to, duration = 600) {
  if (!el) return Promise.resolve();
  el.style.opacity = String(from);
  const anim = el.animate([{ opacity: from }, { opacity: to }], { duration, easing: 'ease', fill: 'none' });
  el.style.opacity = String(to);
  return anim.finished.catch(() => {});
}

/** Translate an SVG group in user units (attribute-based: works everywhere). */
export function shift(el, fromY, toY, duration, easing = linear, fromX = 0, toX = 0) {
  if (!el) return Promise.resolve();
  return tween(duration, (t) => {
    el.setAttribute('transform', `translate(${fromX + (toX - fromX) * t} ${fromY + (toY - fromY) * t})`);
  }, easing);
}

/** Grow an SVG group out of a point (used for the sprout, bud and flower). */
export function growFrom(el, cx, cy, duration, from = 0.04, to = 1) {
  if (!el) return Promise.resolve();
  return tween(duration, (t) => {
    const s = from + (to - from) * t;
    el.setAttribute('transform', `translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`);
  }, easeOutCubic);
}

/** Rain: repeat a downward sweep of a drop group a few times. */
export async function rainLoop(el, distance, cycleMs, cycles) {
  if (!el) return;
  for (let i = 0; i < cycles; i++) {
    await shift(el, 0, distance, cycleMs, linear);
  }
  el.setAttribute('transform', 'translate(0 0)');
}

/* ------------------------------ idle hints ------------------------------ */

/** 2px float used by the 15s hint (docs/01.md 4.7). Returns the Animation. */
export function bob(el, amount = 2, duration = 1800) {
  const base = el.style.transform || '';
  return el.animate(
    [{ transform: `${base} translateY(0px)` },
     { transform: `${base} translateY(-${amount}px)` },
     { transform: `${base} translateY(0px)` }],
    { duration, easing: 'ease-in-out', iterations: Infinity }
  );
}

/** 6px lean toward the receiving side, used by the 45s hint. */
export function lean(el, dx, dy, duration = 2200) {
  const base = el.style.transform || '';
  return el.animate(
    [{ transform: `${base} translate(0px, 0px)` },
     { transform: `${base} translate(${dx}px, ${dy}px)` },
     { transform: `${base} translate(0px, 0px)` }],
    { duration, easing: 'ease-in-out', iterations: Infinity }
  );
}

/** Soft brightening of the receiving target (soil, window, trail gap). */
export function glow(el, duration = 1800) {
  if (!el) return null;
  return el.animate(
    [{ filter: 'brightness(1)' }, { filter: 'brightness(1.28)' }, { filter: 'brightness(1)' }],
    { duration, easing: 'ease-in-out', iterations: Infinity }
  );
}

export function stop(anim) {
  if (!anim) return;
  try { anim.cancel(); } catch (_) {}
}
