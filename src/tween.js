// 超小型トゥイーン。update(dt) を毎フレーム呼ぶ。
const active = [];

export function tween({ duration = 0.5, ease = (t) => t, onUpdate, onComplete, delay = 0 }) {
  const t = { time: -delay, duration, ease, onUpdate, onComplete, done: false };
  active.push(t);
  return t;
}

export function updateTweens(dt) {
  for (let i = active.length - 1; i >= 0; i--) {
    const t = active[i];
    t.time += dt;
    if (t.time < 0) continue;
    const p = Math.min(1, t.time / t.duration);
    t.onUpdate?.(t.ease(p), p);
    if (p >= 1) {
      t.done = true;
      active.splice(i, 1);
      t.onComplete?.();
    }
  }
}

export const wait = (s) => new Promise((r) => tween({ duration: s, onComplete: r }));
