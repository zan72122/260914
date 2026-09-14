/** Pointer Events を集約する。最初の指だけを扱う(ピンチ誤動作防止)。 */

export interface PointerHandlers {
  down(x: number, y: number): void;
  move(x: number, y: number): void;
  up(x: number, y: number): void;
  cancel(): void;
}

export function attachPointer(canvas: HTMLCanvasElement, h: PointerHandlers): void {
  let activeId: number | null = null;
  const pos = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (activeId !== null) return;
    activeId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* noop */ }
    const p = pos(e); h.down(p.x, p.y);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activeId) return;
    e.preventDefault();
    const p = pos(e); h.move(p.x, p.y);
  });
  const end = (e: PointerEvent, cancelled: boolean) => {
    if (e.pointerId !== activeId) return;
    activeId = null;
    const p = pos(e);
    if (cancelled) h.cancel(); else h.up(p.x, p.y);
  };
  canvas.addEventListener('pointerup', (e) => end(e, false));
  canvas.addEventListener('pointercancel', (e) => end(e, true));
  canvas.addEventListener('lostpointercapture', (e) => end(e, true));
  // iOS Safari のジェスチャ(ダブルタップズーム等)を抑止
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'touchmove', 'dblclick', 'contextmenu']) {
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  }
}
