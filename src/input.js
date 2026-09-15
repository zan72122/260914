// 一本指だけのジェスチャー判定。2 本目以降の pointer は完全に無視する。
// tap / longpress / drag / rub を区別するが、どのジェスチャーでも必ず onMove は流す
// （「触れば必ず何かがその場で変わる」を保証するため）。

const LONGPRESS_MS = 850;     // 満ちきるまで
const LONGPRESS_SLOP = 26;    // px
const TAP_MS = 320;
const TAP_SLOP = 12;

export function createInput(el, handlers = {}) {
  const h = Object.assign({
    onDown() {}, onMove() {}, onUp() {}, onTap() {},
    onLongPressProgress() {}, onLongPress() {}, onLongPressCancel() {}
  }, handlers);

  const state = {
    id: null, t0: 0, x0: 0, y0: 0, x: 0, y: 0, px: 0, py: 0,
    pathLen: 0, lastT: 0, lp: 0, lpFired: false, lpDead: false, moved: 0,
    // こすり判定用
    recent: [], rubScore: 0
  };

  function reset() {
    state.id = null; state.lp = 0; state.lpFired = false; state.lpDead = false;
    state.recent.length = 0; state.rubScore = 0;
  }

  function isRub() {
    // 小さな往復 = 経路長は長いのに正味の移動が小さい
    const net = Math.hypot(state.x - state.x0, state.y - state.y0);
    return state.pathLen > 34 && state.pathLen > net * 1.45;
  }

  function onPointerDown(e) {
    if (state.id !== null) return;            // 2 本目は無視
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    state.id = e.pointerId;
    const now = performance.now();
    state.t0 = now; state.lastT = now;
    state.x0 = state.x = state.px = e.clientX;
    state.y0 = state.y = state.py = e.clientY;
    state.pathLen = 0; state.moved = 0;
    state.lp = 0; state.lpFired = false; state.lpDead = false;
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
    h.onDown({ x: state.x, y: state.y });
  }

  function onPointerMove(e) {
    if (e.pointerId !== state.id) return;
    e.preventDefault();
    const now = performance.now();
    const x = e.clientX, y = e.clientY;
    const dx = x - state.px, dy = y - state.py;
    const d = Math.hypot(dx, dy);
    state.pathLen += d;
    state.x = x; state.y = y;
    const net = Math.hypot(x - state.x0, y - state.y0);
    if (net > state.moved) state.moved = net;
    if (net > LONGPRESS_SLOP && !state.lpFired && !state.lpDead) {
      // 一度でも大きく動いたら、この指では長押しは成立しない
      state.lpDead = true;
      if (state.lp > 0) { state.lp = 0; h.onLongPressCancel(); }
    }
    state.px = x; state.py = y;
    const dt = Math.max(1, now - state.lastT);
    state.lastT = now;
    h.onMove({
      x, y, dx, dy, dist: d, speed: d / dt * 1000,
      pathLen: state.pathLen, net, rub: isRub(),
      dtms: dt
    });
  }

  function finish(e, cancelled) {
    if (e.pointerId !== state.id) return;
    const now = performance.now();
    const dur = now - state.t0;
    const net = Math.hypot(state.x - state.x0, state.y - state.y0);
    try { el.releasePointerCapture(e.pointerId); } catch (_) {}
    if (state.lp > 0 && !state.lpFired) h.onLongPressCancel();
    const wasLp = state.lpFired;
    reset();
    h.onUp({ x: e.clientX, y: e.clientY, dur, net });
    if (!cancelled && !wasLp && dur < TAP_MS && net < TAP_SLOP) {
      h.onTap({ x: e.clientX, y: e.clientY });
    }
  }

  function tick() {
    if (state.id === null || state.lpFired || state.lpDead) return;
    const now = performance.now();
    const net = Math.hypot(state.x - state.x0, state.y - state.y0);
    if (net > LONGPRESS_SLOP) { state.lpDead = true; state.lp = 0; return; }
    const held = now - state.t0;
    if (held < 110) return;
    state.lp = Math.min(1, (held - 110) / LONGPRESS_MS);
    h.onLongPressProgress(state.lp, { x: state.x, y: state.y });
    if (state.lp >= 1) {
      state.lpFired = true;
      h.onLongPress({ x: state.x, y: state.y });
    }
  }

  el.addEventListener('pointerdown', onPointerDown, { passive: false });
  el.addEventListener('pointermove', onPointerMove, { passive: false });
  el.addEventListener('pointerup', (e) => finish(e, false), { passive: false });
  el.addEventListener('pointercancel', (e) => finish(e, true), { passive: false });
  el.addEventListener('lostpointercapture', (e) => { if (e.pointerId === state.id) reset(); });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  el.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  el.addEventListener('gesturestart', (e) => e.preventDefault());
  el.addEventListener('dblclick', (e) => e.preventDefault());

  return { tick, state };
}
