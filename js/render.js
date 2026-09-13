// All drawing. Everything is vector; the canvas transform maps world → screen.
window.G = window.G || {};
(function (G) {
  var R = G.R;
  var GOO_A = '#8b7bc4', GOO_B = '#4a3f78', GOO_LINE = '#584b8e';

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  G.render = function (ctx, S, W, H, time) {
    var L = S.level, cam = S.cam, v = cam.view; // view = visible world rect
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(cam.dpr * cam.scale, 0, 0, cam.dpr * cam.scale, cam.dpr * cam.tx, cam.dpr * cam.ty);

    // Sky
    var g = ctx.createLinearGradient(0, v.y, 0, v.y + v.h);
    g.addColorStop(0, L.sky[0]); g.addColorStop(1, L.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(v.x, v.y, v.w, v.h);

    // Stars (night)
    if (L.sun.moon) {
      ctx.fillStyle = '#fff';
      for (var i = 0; i < 70; i++) {
        var sx = ((i * 373) % 1800) - 450, sy = ((i * 211) % 700) - 100;
        var tw = 0.5 + 0.5 * Math.sin(time * 2 + i);
        ctx.globalAlpha = 0.4 + 0.6 * tw; ctx.beginPath(); ctx.arc(sx, sy, 1.5 + (i % 3) * 0.7, 0, 6.29); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // Sun / moon
    ctx.save(); ctx.fillStyle = L.sun.c; ctx.shadowColor = L.sun.c; ctx.shadowBlur = 40;
    ctx.beginPath(); ctx.arc(L.sun.x, L.sun.y, 46, 0, 6.29); ctx.fill();
    if (L.sun.moon) { ctx.shadowBlur = 0; ctx.fillStyle = L.sky[0]; ctx.beginPath(); ctx.arc(L.sun.x + 18, L.sun.y - 10, 38, 0, 6.29); ctx.fill(); }
    ctx.restore();

    // Parallax hills
    hills(ctx, v, L.hillFar, 0.25, 560, 90, 0.004, S.camOff);
    hills(ctx, v, L.hillNear, 0.5, 640, 60, 0.007, S.camOff);

    // Pipe tube (behind terrain)
    drawPipeTube(ctx, S, v);

    // Terrain
    var T = S.terrain, pts = T.pts;
    ctx.beginPath(); ctx.moveTo(v.x - 10, v.y + v.h + 10);
    ctx.lineTo(v.x - 10, T.groundY(v.x - 10));
    for (var i = 0; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.lineTo(v.x + v.w + 10, T.groundY(v.x + v.w + 10)); ctx.lineTo(v.x + v.w + 10, v.y + v.h + 10); ctx.closePath();
    var gg = ctx.createLinearGradient(0, 600, 0, v.y + v.h); gg.addColorStop(0, L.ground); gg.addColorStop(1, L.groundDeep);
    ctx.fillStyle = gg; ctx.fill();
    ctx.strokeStyle = L.hillNear; ctx.lineWidth = 10; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(v.x - 10, T.groundY(v.x - 10));
    for (i = 0; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.lineTo(v.x + v.w + 10, T.groundY(v.x + v.w + 10)); ctx.stroke();
    // Rocks
    for (i = 0; i < T.rocks.length; i++) {
      var rk = T.rocks[i];
      var rg = ctx.createRadialGradient(rk.x - rk.r * 0.4, rk.y - rk.r * 0.4, 4, rk.x, rk.y, rk.r);
      rg.addColorStop(0, '#9a94b8'); rg.addColorStop(1, '#4e4870');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(rk.x, rk.y, rk.r, 0, 6.29); ctx.fill();
    }

    // Strands
    var st = S.structure;
    for (i = 0; i < st.springs.length; i++) drawStrand(ctx, st.springs[i]);

    // Preview strands for held goo
    if (S.held && S.preview) {
      var hp = S.held.node, pv = S.preview;
      ctx.save(); ctx.setLineDash([8, 8]); ctx.lineDashOffset = -time * 40; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.strokeStyle = pv.ok ? 'rgba(150,255,170,0.95)' : 'rgba(255,255,255,0.35)';
      for (i = 0; i < pv.list.length; i++) {
        ctx.beginPath(); ctx.moveTo(hp.x, hp.y); ctx.lineTo(pv.list[i].n.x, pv.list[i].n.y); ctx.stroke();
      }
      ctx.restore();
      if (pv.ok) {
        ctx.save(); ctx.globalAlpha = 0.35 + 0.15 * Math.sin(time * 8); ctx.strokeStyle = '#b8ffc8'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(hp.x, hp.y, R * 1.8, 0, 6.29); ctx.stroke(); ctx.restore();
      }
    }

    // Goos
    var goos = S.goos;
    for (i = 0; i < goos.length; i++) if (goos[i].state === 'fixed') drawGoo(ctx, goos[i], S, time);
    for (i = 0; i < goos.length; i++) if (goos[i].state === 'strand' || goos[i].state === 'free') drawGoo(ctx, goos[i], S, time);
    for (i = 0; i < goos.length; i++) if (goos[i].state === 'sucked') drawGoo(ctx, goos[i], S, time);

    // Pipe mouth (in front)
    drawPipeMouth(ctx, S, time);

    if (S.held) drawGoo(ctx, S.held, S, time);

    G.fx.draw(ctx);

    // Demo ghost finger
    if (S.demo && S.demo.ghost > 0) {
      var d = S.demo;
      ctx.save(); ctx.globalAlpha = d.ghost * 0.85;
      var fg = ctx.createRadialGradient(d.gx, d.gy, 2, d.gx, d.gy, 30);
      fg.addColorStop(0, 'rgba(255,255,255,0.9)'); fg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(d.gx, d.gy, 30, 0, 6.29); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(d.gx, d.gy, 18 + 4 * Math.sin(time * 6), 0, 6.29); ctx.stroke();
      ctx.restore();
    }

    // Fade overlay
    if (S.fade > 0) {
      ctx.save(); ctx.globalAlpha = Math.min(1, S.fade); ctx.fillStyle = S.fadeColor || '#000';
      ctx.fillRect(v.x - 10, v.y - 10, v.w + 20, v.h + 20); ctx.restore();
    }
  };

  function hills(ctx, v, color, par, base, amp, freq, off) {
    ctx.fillStyle = color; ctx.beginPath();
    var ox = off.x * par, oy = off.y * par * 0.5;
    ctx.moveTo(v.x - 10, v.y + v.h + 10);
    for (var x = v.x - 10; x <= v.x + v.w + 20; x += 20) {
      var wx = x + ox;
      var y = base + oy + Math.sin(wx * freq) * amp + Math.sin(wx * freq * 2.7 + 1) * amp * 0.4;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(v.x + v.w + 10, v.y + v.h + 10); ctx.closePath(); ctx.fill();
  }

  function drawStrand(ctx, s) {
    var a = s.a, b = s.b;
    var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    var nx = -(b.y - a.y), ny = (b.x - a.x), nl = Math.hypot(nx, ny) || 1;
    var sag = Math.max(0, -s.strain) * 40; // compressed strands bulge
    var stretch = Math.max(0, s.strain);
    var col = stretch > 0.15 ? 'rgb(' + Math.round(58 + stretch * 400) + ',49,96)' : GOO_LINE;
    ctx.strokeStyle = col; ctx.lineCap = 'round';
    ctx.lineWidth = 8 - Math.min(4, stretch * 12);
    ctx.beginPath(); ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(mx + nx / nl * sag, my + ny / nl * sag, b.x, b.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(a.x, a.y - 2); ctx.quadraticCurveTo(mx + nx / nl * sag, my + ny / nl * sag - 2, b.x, b.y - 2); ctx.stroke();
  }

  function drawGoo(ctx, goo, S, time) {
    var p = goo.pos();
    var breathe = 1 + 0.045 * Math.sin(time * 4 + goo.phase);
    var sx = breathe, sy = 1 / breathe;
    if (goo.squash > 0) { sx *= 1 + goo.squash * 0.35; sy *= 1 - goo.squash * 0.3; }
    if (goo.state === 'held') { sx *= 0.92; sy *= 1.12; }
    if (goo.state === 'sucked' && goo.suck) { var k = goo.suck.t / goo.suck.dur; sx *= 1 - k * 0.6; sy *= 1 + k * 0.8; }
    var r = R;
    ctx.save(); ctx.translate(p.x, p.y);
    // shadow
    ctx.globalAlpha = 0.18; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(2, r * 0.9, r * 0.9 * sx, r * 0.35, 0, 0, 6.29); ctx.fill(); ctx.globalAlpha = 1;
    ctx.scale(sx, sy);
    var gr = ctx.createRadialGradient(-r * 0.35, -r * 0.4, 2, 0, 0, r * 1.1);
    gr.addColorStop(0, GOO_A); gr.addColorStop(1, GOO_B);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.29); ctx.fill();
    // highlight
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.45, r * 0.3, r * 0.18, -0.6, 0, 6.29); ctx.fill();
    // eyes
    var lx = goo.look.x, ly = goo.look.y;
    var wide = goo.state === 'held' ? 1.25 : 1;
    var blink = goo.blinkT > 0 && goo.blinkT < 0.13;
    for (var e = -1; e <= 1; e += 2) {
      var ex = e * r * 0.36, ey = -r * 0.2;
      if (blink) {
        ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ex - 4, ey); ctx.lineTo(ex + 4, ey); ctx.stroke();
      } else {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, r * 0.33 * wide, 0, 6.29); ctx.fill();
        ctx.fillStyle = '#20182e'; ctx.beginPath(); ctx.arc(ex + lx * r * 0.13, ey + ly * r * 0.13, r * 0.16 * wide, 0, 6.29); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + lx * r * 0.13 - 1.5, ey + ly * r * 0.13 - 1.5, r * 0.06, 0, 6.29); ctx.fill();
      }
    }
    // mouth: tiny smile; open when held
    ctx.strokeStyle = '#20182e'; ctx.lineWidth = 1.6; ctx.beginPath();
    if (goo.state === 'held') { ctx.arc(0, r * 0.3, r * 0.18, 0, 6.29); } else { ctx.arc(0, r * 0.18, r * 0.25, 0.3, Math.PI - 0.3); }
    ctx.stroke();
    ctx.restore();
  }

  function pipeDir(L) {
    return L.pipe.dir === 'up' ? { x: 0, y: -1 } : L.pipe.dir === 'right' ? { x: 1, y: 0 } : { x: -1, y: 0 };
  }

  function drawPipeTube(ctx, S, v) {
    var P = S.level.pipe, d = pipeDir(S.level), w = R * 3;
    var len = 2500;
    var ex = P.x + d.x * len, ey = P.y + d.y * len;
    ctx.save(); ctx.lineCap = 'butt';
    // outer
    var grad = d.x === 0 ? ctx.createLinearGradient(P.x - w / 2, 0, P.x + w / 2, 0) : ctx.createLinearGradient(0, P.y - w / 2, 0, P.y + w / 2);
    grad.addColorStop(0, '#6d7482'); grad.addColorStop(0.35, '#c9d0da'); grad.addColorStop(0.6, '#9aa2ae'); grad.addColorStop(1, '#4f5561');
    ctx.strokeStyle = grad; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(P.x + d.x * 8, P.y + d.y * 8); ctx.lineTo(ex, ey); ctx.stroke();
    // rings
    ctx.strokeStyle = '#3f4450'; ctx.lineWidth = 4;
    for (var i = 80; i < 1200; i += 150) {
      var cx = P.x + d.x * i, cy = P.y + d.y * i;
      ctx.beginPath();
      if (d.x === 0) { ctx.moveTo(cx - w / 2, cy); ctx.lineTo(cx + w / 2, cy); } else { ctx.moveTo(cx, cy - w / 2); ctx.lineTo(cx, cy + w / 2); }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPipeMouth(ctx, S, time) {
    var P = S.level.pipe, d = pipeDir(S.level), pipe = S.pipe;
    var open = pipe.open, gulp = pipe.gulp;
    var w = R * 3 * (1 + gulp * 0.35);
    ctx.save(); ctx.translate(P.x, P.y);
    var ang = Math.atan2(d.y, d.x); ctx.rotate(ang); // +x points into the tube
    // funnel toward target when active
    if (pipe.active && pipe.target) {
      var tx = pipe.target.x - P.x, ty = pipe.target.y - P.y;
      var c = Math.cos(-ang), s = Math.sin(-ang);
      var lx = tx * c - ty * s, ly = tx * s + ty * c;
      var k = pipe.stretch; // 0..1
      ctx.fillStyle = 'rgba(80,60,110,0.55)'; ctx.beginPath();
      ctx.moveTo(0, -w / 2); ctx.lineTo(lx * k, ly * k - 8); ctx.lineTo(lx * k, ly * k + 8); ctx.lineTo(0, w / 2); ctx.closePath(); ctx.fill();
      // suction sparkles
      for (var i = 0; i < 5; i++) {
        var f = ((time * 1.5 + i * 0.2) % 1);
        ctx.globalAlpha = 1 - f; ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(lx * k * (1 - f) + (i - 2) * 3, ly * k * (1 - f) + Math.sin(i * 3 + time * 8) * 6, 3, 0, 6.29); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // rubber lip: ellipse opening toward -x
    var lipW = w * 0.55, lipH = w * (0.62 + 0.28 * open);
    ctx.fillStyle = '#2b2233'; ctx.beginPath(); ctx.ellipse(-2, 0, lipW * 0.6, lipH * 0.72, 0, 0, 6.29); ctx.fill();
    ctx.lineWidth = 9; ctx.strokeStyle = '#d8586f';
    ctx.beginPath(); ctx.ellipse(-4, 0, lipW * 0.7, lipH * 0.85, 0, 0, 6.29); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.ellipse(-6, -2, lipW * 0.6, lipH * 0.7, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.restore();
  }
})(window.G);
