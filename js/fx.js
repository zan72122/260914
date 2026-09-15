// fx.js — minimal animation helpers (Web Animations API + rAF). Phase F1/F2 scope.

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

/** Gentle lift used while a tile is being carried. */
export function nudgeUp(el, duration = 120) {
  return el.animate([{ opacity: 1 }, { opacity: 1 }], { duration }).finished.catch(() => {});
}
