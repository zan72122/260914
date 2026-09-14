// ポインタ入力。タップとドラッグを区別して game に渡す。
export function attachInput(canvas, handlers) {
  let active = null;
  const pos = (e) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (active) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const p = pos(e);
    active = { id: e.pointerId, start: p, cur: p, dragging: false };
    handlers.onDown(p);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!active || e.pointerId !== active.id) return;
    e.preventDefault();
    const p = pos(e);
    active.cur = p;
    const dx = p.x - active.start.x;
    const dy = p.y - active.start.y;
    if (!active.dragging && Math.hypot(dx, dy) > 10) {
      active.dragging = true;
      handlers.onDragStart(active.start, p);
    }
    if (active.dragging) handlers.onDragMove(active.start, p);
  });
  const end = (e) => {
    if (!active || e.pointerId !== active.id) return;
    e.preventDefault();
    const a = active;
    active = null;
    if (a.dragging) handlers.onDragEnd(a.start, a.cur);
    else handlers.onTap(a.start);
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}
