// Particles: confetti, ripples, and pipe sparkles.
window.G = window.G || {};
(function (G) {
  var F = G.fx = { parts: [] };
  F.clear = function () { F.parts = []; };
  F.ripple = function (x, y, c) { F.parts.push({ k: 'ripple', x: x, y: y, t: 0, dur: 0.5, c: c || 'rgba(255,255,255,0.8)' }); };
  F.confetti = function (x, y, n) {
    var cols = ['#ff6b8a', '#ffd93d', '#6bffb8', '#6bc5ff', '#c56bff', '#ffffff'];
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = 200 + Math.random() * 500;
      F.parts.push({ k: 'conf', x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 300, t: 0, dur: 1.8 + Math.random(),
        c: cols[i % cols.length], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, w: 6 + Math.random() * 6 });
    }
  };
  F.puff = function (x, y, c) {
    for (var i = 0; i < 6; i++) {
      var a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 80;
      F.parts.push({ k: 'puff', x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, dur: 0.5, c: c || 'rgba(255,255,255,0.7)', r: 4 + Math.random() * 5 });
    }
  };
  F.update = function (dt) {
    var out = [];
    for (var i = 0; i < F.parts.length; i++) {
      var p = F.parts[i]; p.t += dt;
      if (p.t > p.dur) continue;
      if (p.k === 'conf') { p.vy += 900 * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; }
      if (p.k === 'puff') { p.x += p.vx * dt; p.y += p.vy * dt; }
      out.push(p);
    }
    F.parts = out;
  };
  F.draw = function (ctx) {
    for (var i = 0; i < F.parts.length; i++) {
      var p = F.parts[i], k = p.t / p.dur;
      ctx.save();
      if (p.k === 'ripple') {
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = p.c; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, 10 + k * 50, 0, Math.PI * 2); ctx.stroke();
      } else if (p.k === 'conf') {
        ctx.globalAlpha = Math.min(1, (1 - k) * 3); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2);
      } else if (p.k === 'puff') {
        ctx.globalAlpha = 1 - k; ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + k), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  };
})(window.G);
