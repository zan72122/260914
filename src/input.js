// input.js
// 指1本だけ。最初に触れたポインタ以外は完全に無視する（マルチタッチ事故の防止）。
//
// 「見えないレール」: きりもみ中のドラッグは画面のどこから始めてもよい。
// 指の横移動＝弓の横移動（同じ量・同じ向き）。縦のぶれは捨てる。
// ななめでもぐにゃぐにゃでも、横成分さえあれば必ず進む。

const JITTER = 1.2; // これ未満の震えは無視（px）

export function attachInput(canvas, game, getLayout) {
  let id = null;
  let lastX = 0, lastY = 0, lastT = 0;

  const pos = (e) => ({ x: e.clientX, y: e.clientY });

  function down(e) {
    if (id !== null) return;          // 2本目以降は無視
    id = e.pointerId;
    const p = pos(e);
    lastX = p.x; lastY = p.y; lastT = performance.now();
    if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (_) {} }
    game.pointerDown(p.x, p.y, getLayout());
    e.preventDefault();
  }

  function move(e) {
    if (e.pointerId !== id) return;
    const p = pos(e);
    const now = performance.now();
    const dt = Math.max(1, now - lastT) / 1000;
    const dx = p.x - lastX;
    game.pointerMove(p.x, p.y, getLayout());
    if (Math.abs(dx) >= JITTER) {
      game.drag(dx, dx / dt, getLayout());
      lastX = p.x;
      lastT = now;
    }
    lastY = p.y;
    e.preventDefault();
  }

  function up(e) {
    if (e.pointerId !== id) return;
    const p = pos(e);
    id = null;
    game.pointerUp(p.x, p.y, getLayout());
    e.preventDefault();
  }

  canvas.addEventListener('pointerdown', down, { passive: false });
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', up, { passive: false });
  window.addEventListener('pointercancel', up, { passive: false });

  // iOS: スクロール・ピンチ・ダブルタップ拡大・長押しメニューを止める
  const stop = (e) => { e.preventDefault(); };
  // touchstart は preventDefault しない（ポインタイベントの流れを壊さないため）。
  document.addEventListener('touchmove', stop, { passive: false });
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('contextmenu', stop, { passive: false });
  document.addEventListener('dblclick', stop, { passive: false });
}
