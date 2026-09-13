// Pointer input (touch + mouse). Emits stroke segments in screen space.
export function setupInput(canvas, handlers) {
  const active = new Map();
  let first = true;

  const pos = (e) => ({ x: e.clientX, y: e.clientY });

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (first) { first = false; handlers.onFirst && handlers.onFirst(); }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const p = pos(e);
    active.set(e.pointerId, p);
    handlers.onStroke(p, p, e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    e.preventDefault();
    const prev = active.get(e.pointerId);
    if (!prev) { handlers.onHover && handlers.onHover(pos(e)); return; }
    const p = pos(e);
    handlers.onStroke(prev, p, e.pointerId);
    active.set(e.pointerId, p);
  });

  const end = (e) => {
    e.preventDefault();
    active.delete(e.pointerId);
    handlers.onRelease && handlers.onRelease(e.pointerId);
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', (e) => { if (active.has(e.pointerId)) end(e); });

  // Belt and braces against iOS gestures.
  for (const ev of ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange']) {
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  }
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
}
