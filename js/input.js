// One-finger pointer input. Extra fingers are ignored on purpose.
window.G = window.G || {};
(function (G) {
  G.input = { down: false, x: 0, y: 0, id: null, touch: false, justDown: false, justUp: false, vx: 0, vy: 0, lastT: 0, anyEver: false };
  G.initInput = function (canvas) {
    var I = G.input;
    function pos(e) { I.x = e.clientX; I.y = e.clientY; }
    canvas.addEventListener('pointerdown', function (e) {
      if (I.down) return;
      I.down = true; I.id = e.pointerId; I.touch = e.pointerType === 'touch';
      pos(e); I.justDown = true; I.anyEver = true; I.vx = I.vy = 0; I.lastT = performance.now();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('pointermove', function (e) {
      if (!I.down || e.pointerId !== I.id) return;
      var t = performance.now(), dt = Math.max(1, t - I.lastT) / 1000;
      I.vx = I.vx * 0.5 + ((e.clientX - I.x) / dt) * 0.5;
      I.vy = I.vy * 0.5 + ((e.clientY - I.y) / dt) * 0.5;
      I.lastT = t; pos(e);
      e.preventDefault();
    }, { passive: false });
    function up(e) {
      if (!I.down || e.pointerId !== I.id) return;
      pos(e); I.down = false; I.id = null; I.justUp = true;
      e.preventDefault();
    }
    canvas.addEventListener('pointerup', up, { passive: false });
    canvas.addEventListener('pointercancel', up, { passive: false });
    // Kill iOS gestures.
    ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange', 'dblclick'].forEach(function (n) {
      document.addEventListener(n, function (e) { e.preventDefault(); }, { passive: false });
    });
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };
})(window.G);
