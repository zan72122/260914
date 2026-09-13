// Game loop, state machine, camera, and goo behaviour.
window.G = window.G || {};
(function (G) {
  var R = G.R, REACH = 150;
  var canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
  var W = 0, H = 0, DPR = 1;
  var S = G.state = {
    li: 0, level: null, terrain: null, structure: null, goos: [], held: null, preview: null,
    pipe: { active: false, target: null, open: 0.5, gulp: 0, stretch: 0 },
    sucked: 0, phase: 'intro', phaseT: 0, camOff: { x: 0, y: 0 }, fade: 0, fadeColor: '#000',
    cam: { scale: 1, tx: 0, ty: 0, dpr: 1, view: { x: 0, y: 0, w: 900, h: 900 } },
    demo: null, idle: 0, placed: 0, demoDone: false, loop: 0, dists: null, entries: []
  };

  // ---------- setup ----------
  function resize() {
    var vv = window.visualViewport;
    W = vv ? vv.width : window.innerWidth; H = vv ? vv.height : window.innerHeight;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    updateCam();
  }
  function updateCam() {
    var b = S.level.bounds, c = S.cam;
    c.dpr = DPR; c.scale = Math.min(W / b.w, H / b.h);
    var Ww = W / c.scale, Hw = H / c.scale;
    var cx = b.x + b.w / 2;
    var gb = 0; for (var i = 0; i < S.terrain.pts.length; i++) gb = Math.max(gb, S.terrain.pts[i][1]);
    var lo = b.y + b.h - Hw / 2, hi = b.y + Hw / 2;
    var cy = Math.max(lo, Math.min(hi, gb - 0.3 * Hw));
    cx += S.camOff.x; cy += S.camOff.y;
    c.tx = W / 2 - cx * c.scale; c.ty = H / 2 - cy * c.scale;
    c.view = { x: cx - Ww / 2, y: cy - Hw / 2, w: Ww, h: Hw };
  }
  function toWorld(sx, sy) { return { x: (sx - S.cam.tx) / S.cam.scale, y: (sy - S.cam.ty) / S.cam.scale }; }

  function loadLevel(i) {
    var L = G.LEVELS[i % G.LEVELS.length];
    S.li = i % G.LEVELS.length; S.level = L;
    S.terrain = new G.Terrain(L.terrain, L.rocks);
    S.structure = new G.Structure();
    S.goos = []; S.held = null; S.preview = null; S.sucked = 0; S.placed = 0; S.idle = 0; S.demo = null; S.demoDone = false;
    S.pipe = { active: false, target: null, open: 0.5, gulp: 0, stretch: 0 };
    G.fx.clear();
    // initial triangle (already built, so it reads as "stackable")
    var sx = L.start.x, sy = L.start.y - R;
    var tri = [[-46, 0], [46, 0], [0, -80]].map(function (o) {
      var g = new G.Goo(sx + o[0], sy + o[1]); g.state = 'fixed'; S.goos.push(g); S.structure.addNode(g.node); return g.node;
    });
    S.structure.link(tri[0], tri[1]); S.structure.link(tri[1], tri[2]); S.structure.link(tri[2], tri[0]);
    // free goos on the platform
    for (var k = 0; k < L.gooCount; k++) {
      var x = L.homeX + (Math.random() - 0.5) * 240;
      var g2 = new G.Goo(x, S.terrain.groundY(x) - R - Math.random() * 40);
      S.goos.push(g2);
    }
    G.audio.startBgm(L.music);
    updateCam();
  }

  // ---------- goo behaviour ----------
  function attach(goo, node) {
    goo.state = 'strand'; goo.from = node; goo.to = node; goo.t = 1; goo.spring = null; goo.idle = 0;
    goo.node.x = node.x; goo.node.y = node.y;
    G.audio.se('hop');
  }
  function toFree(goo, x, y, vx, vy) {
    goo.state = 'free'; goo.spring = null;
    goo.node.x = x; goo.node.y = y; goo.node.px = x - (vx || 0) / 120; goo.node.py = y - (vy || 0) / 120;
    goo.wait = 0.3;
  }
  function nearestEntry(x, y) {
    var best = null, bd = 1e9;
    for (var i = 0; i < S.entries.length; i++) {
      var n = S.entries[i], d = Math.hypot(n.x - x, n.y - y);
      if (d < bd) { bd = d; best = n; }
    }
    return { n: best, d: bd };
  }
  function updateFree(goo, dt) {
    var n = goo.node, T = S.terrain;
    var wasG = n.grounded;
    var onGround = T.nearest(n.x, n.y).d < R + 2.5 && T.groundY(n.x) - n.y < R + 30;
    n.grounded = onGround || T.distToGround(n.x, n.y) < R + 2.5;
    if (!wasG && n.grounded) {
      var vy = (n.y - n.py) * 120;
      if (vy > 120) { goo.squash = 1; G.audio.se('bounce'); G.fx.puff(n.x, n.y + R * 0.6, 'rgba(255,255,255,0.35)'); }
    }
    if (!onGround) return;
    goo.wait -= dt;
    var dir = 0, speed = 45;
    var e = nearestEntry(n.x, n.y);
    if (S.pipe.active && e.n) {
      if (e.d < R * 2.4) { attach(goo, e.n); return; }
      dir = Math.sign(e.n.x - n.x); speed = 75;
    } else {
      if (goo.wait <= 0) {
        goo.wait = 1 + Math.random() * 2.5;
        var r = Math.random();
        var wr = S.level.walk;
        if (n.x < wr[0] || n.x > wr[1]) goo.walk = Math.sign(S.level.homeX - n.x);
        else goo.walk = r < 0.35 ? 0 : (r < 0.67 ? 1 : -1);
      }
      dir = goo.walk;
      if (e.n && e.d < R * 2.4 && Math.random() < dt * 0.5) { attach(goo, e.n); return; }
    }
    if (dir !== 0) goo.look.x = dir * 0.8;
    var wr2 = S.level.walk;
    if (!(S.pipe.active && e.n)) { if (n.x < wr2[0] - 10 && dir < 0) dir = 1; if (n.x > wr2[1] + 10 && dir > 0) dir = -1; goo.walk = dir; }
    n.x += dir * speed * dt; n.px = n.x;
    n.y = T.groundY(n.x) - R; n.py = n.y;
  }
  function updateStrand(goo, dt) {
    if (goo.spring) {
      goo.t += dt * 70 / Math.max(30, goo.spring.len);
      goo.look.x = Math.sign(goo.to.x - goo.from.x) * 0.8;
      if (goo.t < 1) return;
    }
    var at = goo.to, st = S.structure;
    if (S.pipe.active && at === S.pipe.target) {
      var p = goo.pos(), P = S.level.pipe;
      goo.state = 'sucked'; goo.suck = { x0: p.x, y0: p.y, x1: P.x, y1: P.y, t: 0, dur: 0.5 };
      G.audio.se('suck'); return;
    }
    var ss = st.adj.get(at) || [];
    // Sometimes hop back down to the ground when standing on a low node.
    if (!S.pipe.active && goo.spring && Math.random() < 0.35 && S.terrain.distToGround(at.x, at.y) < R * 2.6) {
      toFree(goo, at.x, at.y - R, (Math.random() - 0.5) * 120, -60); return;
    }
    if (!ss.length) { goo.idle += dt; if (goo.idle > 1) toFree(goo, at.x, at.y - R, 0, 0); return; }
    var pick = null;
    if (S.dists && S.dists.has(at)) {
      var dcur = S.dists.get(at), opts = [];
      for (var i = 0; i < ss.length; i++) { var o = st.other(ss[i], at); if (S.dists.has(o) && S.dists.get(o) < dcur) opts.push(ss[i]); }
      if (opts.length) pick = opts[Math.floor(Math.random() * opts.length)];
    }
    if (!pick) {
      var cand = ss.filter(function (s) { return st.other(s, at) !== goo.from; });
      if (!cand.length) cand = ss;
      goo.idle += dt;
      if (goo.idle < 0.3 + Math.random() * 0.8 && goo.spring) return; // linger at node
      pick = cand[Math.floor(Math.random() * cand.length)];
    }
    goo.idle = 0; goo.spring = pick; goo.from = at; goo.to = st.other(pick, at); goo.t = 0;
  }

  // ---------- pipe ----------
  function updatePipe(dt, time) {
    var P = S.level.pipe, pipe = S.pipe, best = null, bd = REACH;
    for (var i = 0; i < S.structure.nodes.length; i++) {
      var n = S.structure.nodes[i], d = Math.hypot(n.x - P.x, n.y - P.y);
      if (d < bd) { bd = d; best = n; }
    }
    var was = pipe.active;
    pipe.active = !!best; pipe.target = best;
    if (pipe.active && !was) { G.audio.se('gulp'); G.fx.ripple(P.x, P.y, 'rgba(255,255,255,0.9)'); }
    S.dists = pipe.active ? S.structure.distances(best) : null;
    S.entries = S.structure.entryNodes(S.terrain);
    pipe.stretch += ((pipe.active ? 0.75 : 0) - pipe.stretch) * Math.min(1, dt * 6);
    var targetOpen = pipe.active ? 1 : 0.5 + 0.5 * Math.sin(time * 2.2);
    if (S.phase === 'win') targetOpen = 0;
    pipe.open += (targetOpen - pipe.open) * Math.min(1, dt * 8);
    pipe.gulp = Math.max(0, pipe.gulp - dt * 3);
  }

  // ---------- input ----------
  function pointerWorld() {
    var I = G.input, p = toWorld(I.x, I.y);
    if (I.touch) p.y -= 46; // keep the goo visible above the finger
    return p;
  }
  function tryPick(p) {
    var best = null, bd = R * 2.6;
    for (var i = 0; i < S.goos.length; i++) {
      var g = S.goos[i]; if (!g.pickable()) continue;
      var q = g.pos(), d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }
  function hold(goo, p) {
    if (goo.state === 'strand') { goo.spring = null; }
    goo.state = 'held'; goo.squash = 0.8; goo.node.x = p.x; goo.node.y = p.y; goo.node.px = p.x; goo.node.py = p.y;
    S.held = goo; G.audio.se('pick'); G.fx.ripple(p.x, p.y);
  }
  function release(goo, p, vx, vy) {
    S.held = null;
    var pv = S.structure.candidates(p.x, p.y);
    var inGround = S.terrain.distToGround(p.x, p.y) < R * 0.5;
    if (pv.ok && !inGround) {
      goo.state = 'fixed'; goo.node.x = p.x; goo.node.y = p.y; goo.node.px = p.x; goo.node.py = p.y;
      S.structure.addNode(goo.node);
      for (var i = 0; i < pv.list.length; i++) S.structure.link(goo.node, pv.list[i].n);
      goo.squash = 1; S.placed++;
      G.audio.se('place'); setTimeout(function () { G.audio.se('link'); }, 90);
      G.fx.ripple(p.x, p.y, 'rgba(180,255,200,0.9)');
    } else {
      toFree(goo, p.x, p.y, vx, vy);
      G.audio.se('drop');
    }
    S.preview = null;
  }
  function handleInput(dt) {
    var I = G.input;
    if (I.justDown) {
      I.justDown = false; S.idle = 0;
      G.audio.init();
      if (S.demo) cancelDemo();
      if (S.phase === 'play' && !S.held) {
        var p = pointerWorld(), g = tryPick(p);
        if (g) hold(g, p); else G.fx.ripple(p.x, p.y, 'rgba(255,255,255,0.5)');
      }
    }
    if (S.held && S.held.demo !== true) {
      var p2 = pointerWorld(), n = S.held.node, k = Math.min(1, dt * 28);
      n.x += (p2.x - n.x) * k; n.y += (p2.y - n.y) * k;
      S.preview = S.structure.candidates(n.x, n.y);
      if (S.preview.ok && !(S.prevOk)) G.audio.se('pop');
      S.prevOk = S.preview.ok;
    }
    if (I.justUp) {
      I.justUp = false;
      if (S.held && S.held.demo !== true) {
        var vx = I.vx / S.cam.scale, vy = I.vy / S.cam.scale;
        release(S.held, { x: S.held.node.x, y: S.held.node.y }, vx * 0.6, vy * 0.6);
      }
    }
  }

  // ---------- demo (the world shows what to do; no words) ----------
  function startDemo() {
    var L = S.level, sx = L.start.x, sy = L.start.y - R;
    var side = L.pipe.x < sx ? -1 : 1;
    var tries = [[side * 88, -138], [side * 75, -145], [0, -150], [side * 95, -125]];
    var target = null;
    for (var i = 0; i < tries.length; i++) {
      var tx = sx + tries[i][0], ty = sy + tries[i][1];
      if (S.structure.candidates(tx, ty).ok) { target = { x: tx, y: ty }; break; }
    }
    if (!target) { S.demoDone = true; return; }
    var goo = null, bd = 1e9;
    for (i = 0; i < S.goos.length; i++) {
      var g = S.goos[i]; if (g.state !== 'free' || !g.node.grounded) continue;
      var d = Math.hypot(g.node.x - sx, g.node.y - sy); if (d < bd) { bd = d; goo = g; }
    }
    if (!goo) return;
    S.demo = { goo: goo, phase: 'appear', t: 0, ghost: 0, gx: goo.node.x, gy: goo.node.y, x0: goo.node.x, y0: goo.node.y, tx: target.x, ty: target.y };
    S.demoDone = true;
  }
  function cancelDemo() {
    var d = S.demo; S.demo = null;
    if (d && d.goo.state === 'held') { d.goo.demo = false; S.held = null; toFree(d.goo, d.goo.node.x, d.goo.node.y, 0, 0); S.preview = null; }
  }
  function updateDemo(dt) {
    var d = S.demo; if (!d) return;
    d.t += dt;
    if (d.phase === 'appear') {
      d.ghost = Math.min(1, d.t / 0.5);
      if (d.t > 0.7) { d.phase = 'lift'; d.t = 0; hold(d.goo, { x: d.x0, y: d.y0 }); d.goo.demo = true; }
    } else if (d.phase === 'lift') {
      var k = Math.min(1, d.t / 1.4), e = k * k * (3 - 2 * k);
      var x = d.x0 + (d.tx - d.x0) * e, y = d.y0 + (d.ty - d.y0) * e - Math.sin(k * Math.PI) * 80;
      d.goo.node.x = x; d.goo.node.y = y; d.gx = x; d.gy = y + 46;
      S.preview = S.structure.candidates(x, y);
      if (k >= 1 && d.t > 1.9) { d.phase = 'vanish'; d.t = 0; d.goo.demo = false; release(d.goo, { x: x, y: y }, 0, 0); }
    } else if (d.phase === 'vanish') {
      d.ghost = Math.max(0, 1 - d.t / 0.5);
      if (d.t > 0.6) S.demo = null;
    }
  }

  // ---------- physics ----------
  function stepPhysics(dt) {
    var st = S.structure, T = S.terrain, b = S.level.bounds, i, j;
    for (i = 0; i < st.nodes.length; i++) G.integrate(st.nodes[i], dt, 0.985, 5);
    for (j = 0; j < 6; j++) {
      for (i = 0; i < st.springs.length; i++) G.solveSpring(st.springs[i], 0.35);
      for (i = 0; i < st.nodes.length; i++) { T.collide(st.nodes[i], 1); G.clampBounds(st.nodes[i], b); }
    }
    var free = [];
    for (i = 0; i < S.goos.length; i++) {
      var g = S.goos[i]; if (g.state !== 'free') continue;
      G.integrate(g.node, dt, 0.99);
      T.collide(g.node, 0.35); G.clampBounds(g.node, b); free.push(g.node);
    }
    // gentle separation so the crowd spreads out instead of stacking
    for (i = 0; i < free.length; i++) for (j = i + 1; j < free.length; j++) {
      var a = free[i], c = free[j], dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = R * 1.9;
      if (d < min) { var push = (min - d) / d * 0.25, sx = dx === 0 ? (i % 2 ? 1 : -1) : dx; a.x -= sx * push; c.x += sx * push; }
    }
  }

  // ---------- phases ----------
  function pipeDir() { var d = S.level.pipe.dir; return d === 'up' ? { x: 0, y: -1 } : d === 'right' ? { x: 1, y: 0 } : { x: -1, y: 0 }; }
  function updatePhase(dt) {
    S.phaseT += dt;
    var t = S.phaseT;
    if (S.phase === 'intro') {
      var dd = pipeDir(), k = Math.min(1, t / 1.1), e = 1 - Math.pow(1 - k, 3);
      S.camOff.x = dd.x * 500 * (1 - e); S.camOff.y = dd.y * 500 * (1 - e);
      S.fade = 1 - e; S.fadeColor = S.level.sky[0];
      if (k >= 1) { S.phase = 'play'; S.phaseT = 0; S.camOff.x = S.camOff.y = 0; S.fade = 0; }
    } else if (S.phase === 'play') {
      if (S.sucked >= S.level.need) {
        S.phase = 'win'; S.phaseT = 0;
        if (S.held) { var h = S.held; S.held = null; toFree(h, h.node.x, h.node.y, 0, 0); S.preview = null; }
        if (S.demo) cancelDemo();
        G.audio.se('win'); S.pipe.gulp = 1;
        G.fx.confetti(S.level.pipe.x, S.level.pipe.y, 90);
      }
    } else if (S.phase === 'win') {
      if (t > 0.6 && t < 1.4 && Math.random() < dt * 6) G.fx.confetti(S.level.pipe.x + (Math.random() - 0.5) * 120, S.level.pipe.y, 6);
      if (t > 1.8) { S.phase = 'pan'; S.phaseT = 0; }
    } else if (S.phase === 'pan') {
      var d2 = pipeDir(), k2 = Math.min(1, t / 1.2), e2 = k2 * k2 * k2;
      S.camOff.x = -d2.x * 500 * e2; S.camOff.y = -d2.y * 500 * e2; // camera flies along the pipe
      var next = G.LEVELS[(S.li + 1) % G.LEVELS.length];
      S.fade = e2; S.fadeColor = next.sky[0];
      if (k2 >= 1) {
        var ni = S.li + 1; if (ni >= G.LEVELS.length) { ni = 0; S.loop++; }
        loadLevel(ni); S.phase = 'intro'; S.phaseT = 0; S.fade = 1;
      }
    }
  }

  // ---------- main loop ----------
  var last = 0, acc = 0, STEP = 1 / 120, time = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000 || 0); last = now; time += dt;
    handleInput(dt);
    updatePhase(dt);
    updateCam();
    if (S.phase !== 'pan') {
      acc += dt;
      while (acc >= STEP) { stepPhysics(STEP); acc -= STEP; }
      var strain = S.structure.maxStrain();
      if (strain > 0.28 && Math.random() < dt * 3) G.audio.se('creak');
      updatePipe(dt, time);
      for (var i = 0; i < S.goos.length; i++) {
        var g = S.goos[i];
        g.squash = Math.max(0, g.squash - dt * 4);
        g.blink -= dt; if (g.blink <= 0) { g.blink = 2 + Math.random() * 4; g.blinkT = 0.001; }
        if (g.blinkT > 0) { g.blinkT += dt; if (g.blinkT > 0.2) g.blinkT = 0; }
        // eyes follow the finger, otherwise drift back
        if (G.input.down && g.state !== 'held') {
          var p = pointerWorld(), q = g.pos(), dx = p.x - q.x, dy = p.y - q.y, l = Math.hypot(dx, dy) || 1;
          g.look.x += (dx / l - g.look.x) * dt * 6; g.look.y += (dy / l - g.look.y) * dt * 6;
        } else { g.look.x *= 1 - dt * 2; g.look.y *= 1 - dt * 2; }
        if (S.phase === 'play' || S.phase === 'win') {
          if (g.state === 'free') updateFree(g, dt);
          else if (g.state === 'strand') updateStrand(g, dt);
          else if (g.state === 'sucked') {
            g.suck.t += dt;
            if (g.suck.t >= g.suck.dur) { g.state = 'gone'; S.sucked++; S.pipe.gulp = 1; G.audio.se('gulp'); G.fx.puff(S.level.pipe.x, S.level.pipe.y, 'rgba(255,255,255,0.6)'); }
          }
        }
      }
      if (S.phase === 'play') {
        S.idle += dt;
        if (!S.demoDone && S.placed === 0 && S.idle > 5 && !G.input.down) startDemo();
        updateDemo(dt);
      }
    }
    G.fx.update(dt);
    G.render(ctx, S, W, H, time);
  }

  G.initInput(canvas);
  loadLevel(0);
  resize();
  window.addEventListener('resize', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 50); setTimeout(resize, 400); });
  S.fade = 1; S.fadeColor = S.level.sky[0];
  requestAnimationFrame(function (t) { last = t; frame(t); });
})(window.G);
