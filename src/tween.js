// 最小のトゥイーン/タイマー。演出（降下・巻き戻し・跳ね）に使う。
const list = [];
export const ease = {
  linear: (k) => k,
  outCubic: (k) => 1 - Math.pow(1 - k, 3),
  inOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  outBack: (k) => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
  outElastic: (k) => k === 0 ? 0 : k === 1 ? 1 : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * (2 * Math.PI) / 3) + 1,
};
export function tween({ dur = 1, delay = 0, ease: e = ease.outCubic, update = () => {}, done = () => {} }) {
  const t = { t: -delay, dur, e, update, done, alive: true };
  list.push(t);
  return t;
}
export function after(delay, fn) { return tween({ dur: 0.0001, delay, update: () => {}, done: fn }); }
export function tick(dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const t = list[i];
    if (!t.alive) { list.splice(i, 1); continue; }
    t.t += dt;
    if (t.t < 0) continue;
    const k = Math.min(1, t.t / t.dur);
    t.update(t.e(k), k);
    if (k >= 1) { t.alive = false; list.splice(i, 1); t.done(); }
  }
}
export function clearAll() { list.length = 0; }
