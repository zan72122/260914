// Pointer Events → 一本指ジェスチャ（tap / hold / drag / swipe）
// 2本目以降のポインタは完全に無視する。
export function attachInput(canvas, h) {
  const st = { id: null, x: 0, y: 0, px: 0, py: 0, sx: 0, sy: 0, t0: 0, moved: 0, down: false };

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (st.id !== null) return;          // 一本指のみ
    st.id = e.pointerId;
    const p = pos(e);
    st.x = st.px = st.sx = p.x;
    st.y = st.py = st.sy = p.y;
    st.t0 = performance.now();
    st.moved = 0;
    st.down = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
    h.down && h.down(snap(st, 0, 0));
  }, { passive: false });

  canvas.addEventListener('pointermove', (e) => {
    if (st.id !== e.pointerId || !st.down) return;
    const p = pos(e);
    const dx = p.x - st.x, dy = p.y - st.y;
    st.px = st.x; st.py = st.y;
    st.x = p.x; st.y = p.y;
    st.moved += Math.hypot(dx, dy);
    e.preventDefault();
    h.move && h.move(snap(st, dx, dy));
  }, { passive: false });

  const end = (e) => {
    if (st.id !== e.pointerId) return;
    st.down = false;
    st.id = null;
    e.preventDefault && e.preventDefault();
    h.up && h.up(snap(st, 0, 0));
  };
  canvas.addEventListener('pointerup', end, { passive: false });
  canvas.addEventListener('pointercancel', end, { passive: false });
  canvas.addEventListener('lostpointercapture', (e) => { if (st.id === e.pointerId) end(e); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('dblclick', (e) => e.preventDefault());
  for (const g of ['gesturestart', 'gesturechange', 'gestureend']) {
    canvas.addEventListener(g, (e) => e.preventDefault(), { passive: false });
  }
  return st;
}

function snap(st, dx, dy) {
  return {
    x: st.x, y: st.y, dx, dy,
    sx: st.sx, sy: st.sy,
    moved: st.moved,
    hold: (performance.now() - st.t0) / 1000,
  };
}
