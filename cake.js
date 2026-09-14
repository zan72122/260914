/* Cake Tower — the cake game: stages, structures and rendering. */
'use strict';

// ---------------- stage 0: dowels + board
function newRound() {
  G.nodes.length = 0; G.internals.length = 0; G.parts.length = 0; G.hits.length = 0; G.tweens.length = 0; G.confetti.length = 0;
  G.flavor = G.round % FLAVORS.length;
  G.T1 = new Node('tier', { w: 290, h: 96, holes: [-92, 0, 92], wob: 1, lift: -900, flavor: G.flavor });
  G.root = G.T1; G.nodes.push(G.T1); initFrost(G.T1);
  G.board = null; G.T2 = null; G.slab = null; G.balls = []; G.spire = null; G.candle = null; G.rod = null; G.crane = null; G.struts = []; G.skewer = null; G.rope = null; G.buckets = []; G.toppingsCount = 0;
  G.camSnap = true;
}
stages.dowels = {
  enter() {
    newRound();
    const T1 = G.T1;
    tween(T1, { lift: 0 }, 0.9, easeBounce, () => {
      audio.thud(); G.shake = 8; burst(0, 0, 14, ['#fff', '#f8e2b0'], 200, .5, 400, 5);
      later(0.5, () => {
        T1.dowelsIn = 0;
        for (let i = 0; i < 3; i++) {
          const p = addPart({ kind: 'dowel', hole: null, len: 78 });
          p.hit = addHit({ r: 50, pos: () => [p.x, p.y], down: () => { p.state = 'drag'; audio.plip(); }, move: wp => { p.x = wp[0]; p.y = wp[1] - 40; }, up: () => releaseDowel(p) });
          G.dragKind = 'dowel';
        }
      });
    });
    function releaseDowel(p) {
      const h = nearestHole(p); if (h) {
        p.state = 'done'; removeHit(p.hit);
        const tw = { x: p.x, y: p.y };
        tween(tw, { x: h.wx, y: h.wy - 42 }, 0.16, easeOut, () => {
          removePart(p); T1.holesFilled[h.i] = true; T1.dowelsIn++;
          G.internals.push({ owner: T1, x: h.x, y0: -T1.h - 6, y1: -8, r: 11, c: '#e9cd93', e: '#a8814d', cap: true, drive: 1 });
          const ins = G.internals[G.internals.length - 1]; ins.drive = 0; tween(ins, { drive: 1 }, 0.18, easeIn, () => { snapFx(h.wx, h.wy); T1.wob = Math.max(0, 1 - T1.dowelsIn / 3); T1.squash = 1; if (T1.dowelsIn === 3) allDowels(); });
        });
        p.fly = tw; return;
      }
      p.state = 'tray';
    }
    function nearestHole(p) {
      let best = null, bd = 90 / Math.min(1, G.cam.s * 1.2);
      T1.holes.forEach((hx, i) => { if (T1.holesFilled[i]) return; const [wx, wy] = T1.world(hx, -T1.h); const d = dist(wx, wy, p.x, p.y + 40); if (d < bd) { bd = d; best = { i, x: hx, wx, wy }; } });
      return best;
    }
    T1.holesFilled = [false, false, false];
    function allDowels() {
      T1.wob = 0; sparkle(...T1.topWorld(), 16); audio.shing();
      later(0.7, () => {
        const b = addPart({ kind: 'board', w: 310, h: 12, scale: 0.55 });
        b.hit = addHit({ r: 70, pos: () => [b.x, b.y], down: () => { b.state = 'drag'; tween(b, { scale: 1 }, .2); audio.plip(); }, move: wp => { b.x = wp[0]; b.y = wp[1] - 30; }, up: () => {
          const [tx, ty] = T1.topWorld();
          if (dist(b.x, b.y, tx, ty - 6) < 130 / Math.min(1, G.cam.s * 1.2)) {
            b.state = 'done'; removeHit(b.hit); const tw = { x: b.x, y: b.y };
            tween(tw, { x: tx, y: ty - 6 }, .14, easeOut, () => { removePart(b); const bd = T1.add(new Node('board', { w: 310, h: 12, lift: -18 })); G.board = bd; tween(bd, { lift: 0 }, .12, easeIn, () => { snapFx(tx, ty); later(.5, () => setStage('hammer')); }); });
            b.fly = tw;
          } else { b.state = 'tray'; tween(b, { scale: .55 }, .2); }
        } });
      });
    }
  },
  downAny(wp) { if (!tapWithTrayPart(wp)) jiggleAt(wp); },
  focus() { const T1 = G.T1; return { cx: 0, top: -T1.h - 110, bottom: 30, w: T1.w + 40, tray: true }; },
  update() {},
  draw() {},
};

// ---------------- stage 1: crane lowers T2, hammer the center rod
stages.hammer = {
  enter() {
    const T2 = G.board.add(new Node('tier', { w: 210, h: 130, lift: -700, wob: 0 })); G.T2 = T2; initFrost(T2);
    G.crane = { x: 0, y: -1400, hookTo: T2, mode: 'lower' };
    tween(T2, { lift: 0 }, 1.5, easeInOut, () => {
      audio.thud(); G.shake = 10; T2.wob = 1; burst(...T2.bottomWorld(), 16, ['#fff', '#f8e2b0'], 220, .5, 400, 5);
      G.crane.hookTo = null;
      later(0.7, () => {
        const rod = { owner: T2, x: 0, y0: -T2.h - 224, y1: -T2.h + 4, r: 10, c: '#c9d3dc', e: '#6d7b8a', cap: true, head: true, drive: 1, hits: 0 };
        G.rod = rod; G.internals.push(rod);
        G.crane.hookTo = rod; G.crane.mode = 'hold';
        const hit = addHit({ r: 70, big: 1.3, pos: () => T2.world(rod.x, rod.y0), down: () => { strike(); G.holdT = 0; }, move: () => {}, up: () => { G.holdT = -1; } });
        G.holdT = -1;
        function strike() {
          if (rod.hits >= 6 || rod.busy) return; rod.hits++; rod.busy = true;
          const step = 33; audio.don(); G.shake = 9; T2.sy = 0.86; tween(T2, { sy: 1 }, .35, easeBack);
          tween(rod, { y0: rod.y0 + step, y1: rod.y1 + step }, .1, easeIn, () => {
            rod.busy = false; burst(...T2.world(0, -T2.h), 6, ['#fff', '#e0c7a0'], 150, .4, 400, 4);
            T2.wob = Math.max(0, 1 - rod.hits / 6);
            if (rod.hits >= 6) { removeHit(hit); T2.wob = 0; snapFx(...T2.topWorld()); G.crane.hookTo = null; G.crane.mode = 'leave'; tween(G.crane, { y: -2000 }, 1.2, easeIn); later(.8, () => setStage('slab')); }
          });
        }
        this.strike = strike;
      });
    });
  },
  downAny(wp) { jiggleAt(wp); },
  update(dt) { if (G.holdT >= 0) { G.holdT += dt; if (G.holdT > .42) { G.holdT = 0; this.strike && this.strike(); } } },
  focus() { const T2 = G.T2; const top = G.rod ? T2.world(0, G.rod.y0)[1] - 60 : T2.topWorld()[1] - 220; return { cx: 0, top: Math.min(top, T2.topWorld()[1] - 120), bottom: 20, w: 320 }; },
  draw() {},
};

// ---------------- stage 2: slab on balloons, choose its position, then diagonal struts
stages.slab = {
  enter() {
    const T2 = G.T2;
    const slab = T2.add(new Node('slab', { w: 420, h: 48, lift: -70, x: 0 })); G.slab = slab; initFrost(slab);
    slab.balloons = 1; slab.floatIn = 0; slab.lift = -600; tween(slab, { lift: -70 }, 1.4, easeOut, () => { slab.hover = true; });
    let dragging = false, dragged = false;
    const hit = addHit({ r: 120, big: 1.4, pos: () => slab.world(0, -slab.h / 2), down: () => { dragging = true; dragged = false; audio.plip(); }, move: wp => { const [lx] = T2.local(wp[0], wp[1]); slab.x = clamp(lx, -78, 78); dragged = true; }, up: () => { if (!slab.hover) return; drop(); } });
    function drop() {
      dragging = false; slab.hover = false; removeHit(hit); audio.pop(); slab.balloons = 0;
      burst(...slab.world(0, -slab.h - 80), 14, ['#ff6b8a', '#ffd1dc', '#fff'], 260, .5, 300, 6);
      tween(slab, { lift: 0 }, .45, easeBounce, () => {
        audio.thud(); G.shake = 9; slab.wob = 0.6;
        // overhang -> ends droop
        slab.bendL = 0; slab.bendR = 0; tween(slab, { bendL: 22 + Math.max(0, -slab.x) * .1, bendR: 22 + Math.max(0, slab.x) * .1 }, .6, easeBack);
        later(0.5, () => { spawnStrut('L'); spawnStrut('R'); });
      });
    }
    G.struts = [];
    function sockets(side) {
      const sgn = side === 'L' ? -1 : 1;
      const up = [sgn * (slab.w / 2 - 28), 0];                       // slab-local, under the end
      const lo = T2.local(...T2.world(sgn * T2.w / 2, -T2.h * .5));   // T2 side wall (world)
      return { up, upW: slab.world(...up), loW: T2.world(sgn * T2.w / 2, -T2.h * .5), sgn };
    }
    function spawnStrut(side) {
      const p = addPart({ kind: 'strut', len: 120, side });
      p.hit = addHit({ r: 60, pos: () => [p.x, p.y], down: () => { p.state = 'drag'; audio.plip(); }, move: wp => { p.x = wp[0]; p.y = wp[1] - 30; }, up: () => {
        const s = bestSide(p); if (s) { p.state = 'done'; removeHit(p.hit); const sk = sockets(s); const mid = [(sk.upW[0] + sk.loW[0]) / 2, (sk.upW[1] + sk.loW[1]) / 2];
          const tw = { x: p.x, y: p.y }; tween(tw, { x: mid[0], y: mid[1] }, .15, easeOut, () => { removePart(p); attachStrut(s); }); p.fly = tw; }
        else p.state = 'tray';
      } });
    }
    const done = { L: false, R: false };
    function bestSide(p) {
      let best = null, bd = 150 / Math.min(1, G.cam.s * 1.2);
      for (const s of ['L', 'R']) { if (done[s]) continue; const sk = sockets(s); const mid = [(sk.upW[0] + sk.loW[0]) / 2, (sk.upW[1] + sk.loW[1]) / 2]; const d = dist(mid[0], mid[1], p.x, p.y + 30); if (d < bd) { bd = d; best = s; } }
      return best;
    }
    function attachStrut(s) {
      done[s] = true; const sk = sockets(s); const lo = slab.local(...sk.loW);
      const st = { side: s, a: sk.up, b: lo, grow: 0 }; G.struts.push(st);
      tween(st, { grow: 1 }, .18, easeOut, () => {
        snapFx(...sk.upW); if (s === 'L') tween(slab, { bendL: 0 }, .35, easeBack); else tween(slab, { bendR: 0 }, .35, easeBack);
        if (done.L && done.R) { slab.wob = 0; later(.6, () => setStage('balls')); } else slab.wob = 0.3;
      });
    }
    this.ghostSide = () => { const p = G.parts.find(q => q.kind === 'strut' && q.state === 'drag'); return p ? bestSide(p) : null; };
    this.sockets = sockets; this.done = done;
  },
  downAny(wp) { if (!tapWithTrayPart(wp)) jiggleAt(wp); },
  update() { const s = G.slab; if (s && s.hover) s.lift = -70 + Math.sin(G.t * 2) * 7; },
  focus() { const s = G.slab; const top = s.topWorld()[1] - (s.balloons ? 200 : 60); const sp = slabSpan(); return { cx: s.balloons ? 0 : sp.cx, top, bottom: G.T2.bottomWorld()[1] + 60, w: s.balloons ? 600 : sp.w }; },
  draw() {},
};

// ---------------- stage 3: balls flicked onto a skewer
stages.balls = {
  enter() {
    const slab = G.slab;
    G.skewer = { h: 0 }; tween(G.skewer, { h: 230 }, .5, easeBack, () => audio.shing());
    G.stackH = 0; G.balls = [];
    const specs = [{ r: 46, x: -178 }, { r: 36, x: 178 }, { r: 28, x: -96 }];
    later(.6, () => specs.forEach((sp, i) => later(i * .25, () => spawnBall(sp))));
    function spawnBall(sp) {
      const b = new Node('ball', { r: sp.r, x: sp.x, lift: -500, wob: 0, flavor: (G.flavor + 1 + G.balls.length) % FLAVORS.length }); slab.add(b); initFrost(b); G.balls.push(b);
      tween(b, { lift: 0 }, .55, easeBounce, () => { audio.boing(); b.wob = 1; b.free = true; });
      const hit = addHit({ r: b.r + 30, pos: () => b.world(0, -b.r), down: () => { if (!b.free) return; b.grab = true; b.wob = 0; audio.plip(); }, move: wp => { if (!b.grab) return; const l = slab.local(wp[0], wp[1] - b.r * .3); b.x = l[0]; b.lift = Math.min(0, l[1] + b.r) ; }, up: () => { if (!b.grab) return; b.grab = false; fly(b, hit); } });
    }
    function fly(b, hit) {
      b.free = false; removeHit(hit); audio.whistle();
      const topY = -G.skewer.h - b.r * 2 - 10; // above the skewer tip (slab-local)
      const startX = b.x, startL = b.lift; const arc = { t: 0 };
      tween(arc, { t: 1 }, .45, easeInOut, () => {
        // thread down the skewer
        const restL = -G.stackH; tween(b, { lift: restL }, .28, easeIn, () => {
          audio.shuk(); G.shake = 5; sparkle(...b.world(0, -b.r), 8); G.stackH += b.r * 2; b.stacked = true;
          for (const o of G.balls) if (o.stacked && o !== b) { o.sy = .9; tween(o, { sy: 1 }, .3, easeBack); }
          if (G.balls.every(o => o.stacked)) { audio.kachon(); later(.6, () => setStage('spire')); }
        });
      });
      arc.update = () => { b.x = lerp(startX, 0, arc.t); b.lift = lerp(startL, topY, arc.t) - Math.sin(arc.t * Math.PI) * 120; };
      G.arcs = G.arcs || []; G.arcs.push(arc);
    }
  },
  downAny(wp) { jiggleAt(wp); },
  update() { if (G.arcs) { G.arcs = G.arcs.filter(a => a.t < 1); G.arcs.forEach(a => a.update()); } },
  focus() { const slab = G.slab; const sp = slabSpan(); return { cx: sp.cx, top: slab.topWorld()[1] - G.skewer.h - 130, bottom: slab.bottomWorld()[1] + 90, w: sp.w }; },
  draw() {},
};

// ---------------- stage 4: balloon spire, pop it, wind the winch to straighten
stages.spire = {
  enter() {
    const top = [...G.balls].sort((a, b) => a.world(0, -a.r)[1] - b.world(0, -b.r)[1])[0]; // highest ball
    const spire = top.add(new Node('spire', { w: 78, h: 190, lift: -500, flavor: (G.flavor + 2) % FLAVORS.length })); G.spire = spire; initFrost(spire);
    spire.balloon = 1; tween(spire, { lift: -60 }, 1.6, easeOut, () => { spire.hover = true; });
    const hit = addHit({ r: 80, big: 1.3, pos: () => spire.world(0, -spire.h - 95), down: () => { if (!spire.hover) return; pop(); } });
    function pop() {
      spire.hover = false; removeHit(hit); spire.balloon = 0; audio.pop(); burst(...spire.world(0, -spire.h - 95), 16, ['#7fd3ff', '#d7f1ff', '#fff'], 260, .5, 300, 6);
      tween(spire, { lift: 0 }, .3, easeIn, () => {
        audio.kachon(); G.shake = 6; sparkle(...spire.bottomWorld(), 8);
        // it's tall and soft: it leans
        tween(spire, { lean: -0.5 }, 1.4, easeInOut, () => { spire.wob = 1; setupWinch(); });
      });
    }
    function setupWinch() {
      const slab = G.slab; const w = { x: slab.w / 2 - 34, y: -slab.h, ang: 0, held: false, next: -0.5 }; G.rope = w;
      const h = addHit({ r: 80, big: 1.4, pos: () => slab.world(w.x, w.y - 14), down: () => { w.held = true; audio.click(); wind(0.05); }, move: () => {}, up: () => { w.held = false; } });
      const h2 = addHit({ r: 40, pos: () => spire.world(0, -spire.h), down: () => { w.held = true; wind(0.05); }, move: () => {}, up: () => { w.held = false; } });
      stages.spire.wind = wind;
      function wind(d) {
        if (w.locked) return; spire.lean = Math.min(0, spire.lean + d); w.ang += d * 6; spire.wob = Math.max(.2, -spire.lean * 2);
        if (spire.lean > w.next) { audio.ratchet(); w.next += 0.06; }
        if (spire.lean >= 0) { w.locked = true; w.held = false; spire.lean = 0; spire.wob = 0; removeHit(h); removeHit(h2); snapFx(...spire.world(0, -spire.h)); audio.shing(); later(.8, () => setStage('frost')); }
      }
    }
  },
  downAny(wp) { jiggleAt(wp); },
  update(dt) { const w = G.rope; if (w && w.held && this.wind) this.wind(0.55 * dt); },
  focus() { const s = G.spire; const sp = slabSpan(); return { cx: sp.cx, top: s.world(0, -s.h)[1] - (s.balloon ? 160 : 60), bottom: G.slab.bottomWorld()[1] + 60, w: sp.w }; },
  draw() {},
};

// ---------------- stage 5: frost everything (hide the construction site)
function frostables() { return [G.T1, G.T2, G.slab, ...G.balls, G.spire].filter(Boolean); }
stages.frost = {
  enter() {
    G.brush = null; G.lastP = null; G.paintMode = true;
    CREAMS.forEach((c, i) => {
      const b = addPart({ kind: 'bucket', cream: c, squish: 0 }); G.buckets.push(b);
      b.hit = addHit({ r: 55, pos: () => [b.x, b.y - 10], down: () => pick(b), move: wp => { G.lastP = null; this.moveAny(wp); }, up: () => {} });
    });
    function pick(b) { G.brush = b.cream; b.squish = 1; tween(b, { squish: 0 }, .35, easeBack); audio.plip(); G.lastP = null; }
    this.pick = pick;
  },
  downAny(wp) { if (!G.brush) this.pick(G.buckets[0]); G.lastP = wp; this.paintAt(wp); },
  moveAny(wp) {
    if (!G.brush) this.pick(G.buckets[0]);
    const lp = G.lastP || wp; const d = dist(lp[0], lp[1], wp[0], wp[1]); const n = Math.max(1, Math.ceil(d / 14));
    for (let i = 1; i <= n; i++) this.paintAt([lerp(lp[0], wp[0], i / n), lerp(lp[1], wp[1], i / n)]);
    G.lastP = wp;
  },
  upAny() { G.lastP = null; },
  paintAt(wp) {
    for (const n of frostables()) {
      if (n.fill > 0) continue; const l = n.local(wp[0], wp[1]);
      if (paintFrost(n, l[0], l[1], 40)) {
        if (!n.cream) n.cream = G.brush; n.creamLast = G.brush; n.painting = 0.1;
        if (n.coverage >= (n.kind === 'ball' ? 0.55 : n.kind === 'spire' ? 0.5 : 0.6)) complete(n);
      }
    }
    function complete(n) {
      n.cream = n.creamLast || n.cream; n.fill = 0.01; tween(n, { fill: 1 }, .35, easeOut); audio.fwoosh(); n.sy = 1.06; tween(n, { sy: 1 }, .4, easeBack);
      const c = n.world(0, -n.h / 2); burst(c[0], c[1], 14, [n.cream.hi, n.cream.c, '#fff'], 200, .6, 200, 6);
      if (frostables().every(o => o.fill > 0)) { later(.4, () => { audio.chime(); setStage('topping'); }); }
    }
  },
  update(dt) { for (const n of frostables()) if (n.painting > 0) n.painting -= dt; },
  focus() { return fullCakeFocus(); },
  draw() {},
};
function slabSpan() { const s = G.slab; return { cx: s ? s.x * .5 : 0, w: s ? s.w + Math.abs(s.x) + 60 : 470 }; }
function fullCakeFocus(extraTop = 40) { const top = G.candle ? G.candle.world(0, -G.candle.h - 40)[1] : G.spire.world(0, -G.spire.h)[1]; const sp = slabSpan(); return { cx: sp.cx, top: top - extraTop, bottom: 30, w: sp.w }; }

// ---------------- stage 6: toppings by tap, then candle

stages.topping = {
  enter() {
    G.parts.length = 0; G.hits.length = 0; G.buckets = []; G.paintMode = false;
    const bowl = addPart({ kind: 'bowl' }); G.bowl = bowl; G.toppingsCount = 0; G.candle = null; G.idle = 0;
    bowl.hit = addHit({ r: 60, pos: () => [bowl.x, bowl.y], down: () => { bowl.squish = 1; tween(bowl, { squish: 0 }, .3, easeBack); audio.plip(); burst(bowl.x, bowl.y - 30, 6, ['#ff5c7a', '#ffd400', '#7bd1ff'], 160, .5, 500, 5); } });
  },
  downAny(wp) {
    // nearest frosted body under the finger
    let best = null, bl = null;
    for (const n of frostables()) { const l = n.local(wp[0], wp[1]); if (l[0] > -n.w / 2 - 14 && l[0] < n.w / 2 + 14 && l[1] > -n.h - 14 && l[1] < 14) { best = n; bl = l; } }
    if (!best) return;
    // keep on the surface
    bl[0] = clamp(bl[0], -best.w / 2 + 10, best.w / 2 - 10); bl[1] = clamp(bl[1], -best.h + 8, -6);
    const t = { x: bl[0], y: bl[1], kind: TOPPINGS[(G.toppingsCount + Math.floor(Math.random() * 2)) % TOPPINGS.length], s: 0, rot: rnd(-.3, .3) };
    best.toppings.push(t); tween(t, { s: 1 }, .25, easeBack); audio.pon(1 + Math.random() * .3); G.toppingsCount++; G.idle = 0;
    sparkle(wp[0], wp[1], 4);
    if (G.toppingsCount >= 5 && !G.candle) this.candle();
  },
  candle() {
    const spire = G.spire; const c = spire.add(new Node('candle', { w: 22, h: 60, lift: -500, lit: 0 })); G.candle = c; G.parts.length = 0; G.hits.length = 0;
    tween(c, { lift: 0 }, 1.3, easeOut, () => { audio.kachon(); c.landed = true; sparkle(...c.world(0, -c.h), 6); });
    addHit({ r: 70, big: 1.4, pos: () => c.world(0, -c.h - 10), down: () => { if (!c.landed || c.lit) return; c.lit = 1; audio.fwoosh(); burst(...c.world(0, -c.h - 10), 10, ['#ffd166', '#ff7b3a', '#fff'], 120, .5, -100, 5); later(.9, () => setStage('reveal')); } });
  },
  update(dt) { G.idle += dt; if (G.idle > 9 && !G.candle) this.candle(); },
  focus() { const c = G.candle; if (c && c.landed) { const t = c.world(0, -c.h)[1]; return { cx: c.world(0, 0)[0], top: t - 90, bottom: G.spire.world(0, -G.spire.h * .4)[1], w: 260, slow: true }; } return fullCakeFocus(); },
  draw() {},
};

// ---------------- stage 7: pull back, reveal how huge it is, blow out, begin again
stages.reveal = {
  enter() {
    G.parts.length = 0; G.hits.length = 0; G.revealT = 0; G.blown = false;
    later(1.6, () => { audio.fanfare(); G.confettiOn = true; });
    later(2.4, () => { G.kidJump = 1; });
    addHit({ r: 40, big: 1.2, pos: () => G.candle.world(0, -G.candle.h - 10), down: () => this.blow() });
  },
  downAny() { this.blow(); },
  blow() {
    if (G.blown || G.revealT < 2.2) return; G.blown = true; audio.blow(); G.candle.lit = 0; G.confettiOn = false;
    const p = G.candle.world(0, -G.candle.h - 10); for (let i = 0; i < 10; i++) G.particles.push({ x: p[0] + rnd(-6, 6), y: p[1], vx: rnd(-20, 20), vy: rnd(-60, -30), life: 1.2, max: 1.2, grav: -20, c: 'rgba(120,120,120,.5)', s: rnd(6, 12), shape: 1 });
    G.fade = 0; tween(G, { fade: 1 }, 1.4, easeInOut, () => { G.round++; setGame('start'); tween(G, { fade: 0 }, .8, easeInOut); });
  },
  update(dt) {
    G.revealT += dt; if (G.confettiOn && G.confetti.length < 160 && Math.random() < .6) {
      const v = toWorld(rnd(0, W), -20); G.confetti.push({ x: v[0], y: v[1], vx: rnd(-40, 40), vy: rnd(40, 120), r: rnd(0, TAU), c: ['#ff5c7a', '#ffd400', '#7bd1ff', '#8be37a', '#c58bff'][Math.floor(rnd(0, 5))], s: rnd(6, 11) / G.cam.s, life: 6 });
    }
    for (let i = G.confetti.length - 1; i >= 0; i--) { const c = G.confetti[i]; c.life -= dt; c.x += (c.vx + Math.sin(G.t * 3 + c.r) * 30) * dt / G.cam.s; c.y += c.vy * dt / G.cam.s; c.r += dt * 4; if (c.life <= 0) G.confetti.splice(i, 1); }
    if (G.kidJump > 0) G.kidJump = Math.max(0, G.kidJump - dt * .6);
  },
  focus() { const f = fullCakeFocus(60); return { cx: 0, top: Math.min(f.top - 40, -930), bottom: 200, w: portrait ? 760 : 1200, slow: true, veryslow: G.revealT < 3.5 }; },
  draw() {},
};


function drawBackground() {
  const v = viewRect(); setCam();
  // wall
  ctx.fillStyle = '#fdf3e3'; ctx.fillRect(v.l, v.t, v.r - v.l, v.b - v.t);
  // wallpaper dots (only in view)
  ctx.fillStyle = 'rgba(240,200,170,.35)'; const g = 120;
  const i0 = Math.floor(v.l / g), i1 = Math.ceil(v.r / g), j0 = Math.floor(v.t / g), j1 = Math.ceil(v.b / g);
  if ((i1 - i0) * (j1 - j0) < 900) for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { ctx.beginPath(); ctx.arc(i * g + (j % 2) * g / 2, j * g, 7, 0, TAU); ctx.fill(); }
  // window (left) and shelf (right)
  ctx.fillStyle = '#bfe6ff'; rr(-820, -470, 220, 300, 18); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 10; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-710, -470); ctx.lineTo(-710, -170); ctx.moveTo(-820, -320); ctx.lineTo(-600, -320); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-760, -400, 26, 0, TAU); ctx.arc(-730, -390, 32, 0, TAU); ctx.arc(-700, -405, 22, 0, TAU); ctx.fill();
  ctx.fillStyle = '#d9a66b'; rr(560, -360, 220, 14, 4); ctx.fill();
  ctx.fillStyle = '#e88'; rr(580, -410, 40, 50, 6); ctx.fill(); ctx.fillStyle = '#8bd'; rr(630, -420, 30, 60, 6); ctx.fill(); ctx.fillStyle = '#fc6'; rr(670, -400, 50, 40, 8); ctx.fill();
  // ceiling lamp far above (scale cue)
  ctx.strokeStyle = '#8a7a6a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -3000); ctx.lineTo(0, -900); ctx.stroke();
  ctx.fillStyle = '#ffd98a'; ctx.beginPath(); ctx.moveTo(-70, -840); ctx.lineTo(-30, -905); ctx.lineTo(30, -905); ctx.lineTo(70, -840); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,240,180,.35)'; ctx.beginPath(); ctx.ellipse(0, -838, 70, 12, 0, 0, TAU); ctx.fill();
  // floor
  ctx.fillStyle = '#e6c8a0'; ctx.fillRect(v.l, 90, v.r - v.l, Math.max(0, v.b - 90));
  ctx.strokeStyle = 'rgba(160,110,70,.25)'; ctx.lineWidth = 3; for (let x = Math.floor(v.l / 140) * 140; x < v.r; x += 140) { ctx.beginPath(); ctx.moveTo(x, 90); ctx.lineTo(x, v.b); ctx.stroke(); }
  // table
  ctx.fillStyle = '#b5773f'; rr(-260, 14, 30, 80, 4); ctx.fill(); rr(230, 14, 30, 80, 4); ctx.fill();
  ctx.fillStyle = '#d9a066'; rr(-300, -2, 600, 20, 8); ctx.fill(); ctx.fillStyle = '#f2c98f'; rr(-300, -2, 600, 8, 6); ctx.fill();
  // chair & the little baker (scale cue at the end)
  drawKid();
}
function drawKid() {
  const jump = G.kidJump ? Math.sin(G.kidJump * Math.PI * 4) * 20 * G.kidJump : 0;
  ctx.save(); ctx.translate(-330, 90 - Math.abs(jump));
  const wave = Math.sin(G.t * 6) * 0.5;
  ctx.fillStyle = '#5aa9ff'; rr(-14, -46, 28, 30, 8); ctx.fill();            // body
  ctx.fillStyle = '#ffd6b0'; ctx.beginPath(); ctx.arc(0, -60, 15, 0, TAU); ctx.fill(); // head
  ctx.fillStyle = '#ff6b8a'; ctx.beginPath(); ctx.moveTo(-12, -70); ctx.lineTo(12, -70); ctx.lineTo(4, -96); ctx.closePath(); ctx.fill(); // party hat
  ctx.fillStyle = '#3a2a20'; ctx.beginPath(); ctx.arc(-5, -62, 2, 0, TAU); ctx.arc(5, -62, 2, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#3a2a20'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -56, 5, 0.2, Math.PI - .2); ctx.stroke();
  ctx.strokeStyle = '#ffd6b0'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-14, -40); ctx.lineTo(-28, -60 + wave * 10); ctx.moveTo(14, -40); ctx.lineTo(28, -60 - wave * 10); ctx.stroke(); // arms up
  ctx.strokeStyle = '#3d5a8a'; ctx.beginPath(); ctx.moveTo(-7, -16); ctx.lineTo(-7, 0); ctx.moveTo(7, -16); ctx.lineTo(7, 0); ctx.stroke();
  ctx.restore();
  // chair
  ctx.fillStyle = '#c98a55'; rr(300, 30, 60, 10, 3); ctx.fill(); rr(300, 40, 8, 50, 2); ctx.fill(); rr(352, 40, 8, 50, 2); ctx.fill(); rr(300, -20, 8, 50, 2); ctx.fill();
}


Object.assign(PART_DRAW, {
  dowel(p) {
    // standing like the holes it goes into
      ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.ellipse(0, 42, 18, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e9cd93'; ctx.strokeStyle = '#a8814d'; rr(-11, -38, 22, 78, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c7a46b'; rr(-11, -38, 22, 10, 6); ctx.fill();
  },
  board(p) {
    ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.ellipse(0, 22, p.w / 2, 8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e7e0d0'; ctx.strokeStyle = '#8f8878'; rr(-p.w / 2, -p.h / 2, p.w, p.h, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c9c0ad'; rr(-p.w / 2 + 14, -1, p.w - 28, 3, 2); ctx.fill();
  },
  strut(p) {
    const s = p.side === 'L' ? 1 : -1; ctx.rotate(s * 0.9);
      ctx.fillStyle = '#9fb3c8'; ctx.strokeStyle = '#4f6275'; rr(-9, -p.len / 2, 18, p.len, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4f6275'; ctx.beginPath(); ctx.arc(0, -p.len / 2 + 8, 5, 0, TAU); ctx.arc(0, p.len / 2 - 8, 5, 0, TAU); ctx.fill();
  },
  bucket(p) {
    const sq = 1 + (p.squish || 0) * 0.25; ctx.scale(1 + (p.squish || 0) * .2, 1 / sq);
      ctx.fillStyle = '#dfe6ea'; ctx.strokeStyle = '#7d8a94'; ctx.beginPath(); ctx.moveTo(-32, -20); ctx.lineTo(32, -20); ctx.lineTo(26, 34); ctx.lineTo(-26, 34); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = p.cream.c; ctx.beginPath(); ctx.ellipse(0, -20, 32, 12, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = p.cream.hi; ctx.beginPath(); ctx.arc(-8, -26, 8, 0, TAU); ctx.arc(6, -22, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = p.cream.c; ctx.beginPath(); ctx.arc(0, -34 - Math.sin(G.t * 3 + p.x) * 3, 12, 0, TAU); ctx.fill(); // a floating dollop invites a touch
      ctx.strokeStyle = p.cream.lo; ctx.beginPath(); ctx.ellipse(0, -20, 32, 12, 0, 0, TAU); ctx.stroke();
  },
  bowl(p) {
      const sq = 1 + (p.squish || 0) * 0.2; ctx.scale(sq, 1 / sq);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#a9a9b5'; ctx.beginPath(); ctx.moveTo(-40, -8); ctx.quadraticCurveTo(-30, 40, 0, 40); ctx.quadraticCurveTo(30, 40, 40, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
      const cols = ['#ff5c7a', '#ffd400', '#7bd1ff', '#8be37a', '#c58bff', '#ff9a3c'];
      for (let i = 0; i < 9; i++) { ctx.fillStyle = cols[i % 6]; ctx.beginPath(); ctx.arc(-28 + (i % 5) * 14 + (i > 4 ? 7 : 0), -14 - Math.floor(i / 5) * 12 - Math.sin(G.t * 3 + i) * 2, 7, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#e63946'; drawStrawberry(20, -34, .9);
  },
});

function drawInternal(it) {
  const o = it.owner; setCam(o.m);
  const d = it.drive === undefined ? 1 : it.drive; const y0 = it.y0, y1 = it.y1;
  ctx.save(); ctx.globalAlpha = o.alpha;
  const bob = it.head && it.hits < 6 && !it.busy ? Math.sin(G.t * 5) * 6 - 6 : 0;
  const top = y0 + (1 - d) * -50 + bob; // slides in from above during insertion; the head bobs to be struck
  ctx.fillStyle = it.c; ctx.strokeStyle = it.e; ctx.lineWidth = 3;
  rr(it.x - it.r, top, it.r * 2, y1 - top, it.r * .8); ctx.fill(); ctx.stroke();
  if (it.cap) { ctx.fillStyle = it.e; rr(it.x - it.r, top, it.r * 2, 9, it.r * .6); ctx.fill(); }
  if (it.head) { ctx.fillStyle = '#7d8b9a'; rr(it.x - it.r * 2.1, top - 14, it.r * 4.2, 18, 8); ctx.fill(); ctx.fillStyle = '#b7c3ce'; rr(it.x - it.r * 2.1, top - 14, it.r * 4.2, 7, 6); ctx.fill(); }
  ctx.restore();
}

function drawNodeBody(n) {
  setCam(n.m); const F = FLAVORS[n.flavor];
  const frosted = n.fill > 0;
  ctx.save();
  ctx.globalAlpha = n.alpha * (frosted ? 1 : 0.78);
  ctx.lineWidth = 3; ctx.lineJoin = 'round';
  bodyPath(n);
  if (n.kind === 'board') { ctx.fillStyle = '#e7e0d0'; ctx.fill(); ctx.strokeStyle = '#8f8878'; ctx.stroke(); }
  else if (n.kind === 'candle') { ctx.fillStyle = '#ff9fc6'; ctx.fill(); ctx.strokeStyle = '#d4638f'; ctx.stroke(); ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { rr(-n.w / 2, -n.h + 10 + i * 18, n.w, 6, 2); ctx.fill(); } }
  else {
    ctx.fillStyle = F.sponge; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = F.layer; const layers = Math.max(1, Math.floor(n.h / 42));
    for (let i = 1; i <= layers; i++) { const y = -n.h * i / (layers + 1); ctx.fillRect(-n.w / 2, y - 4, n.w, 8); }
    // frosting smears (partial) then full fill
    if (n.cells && !frosted) {
      ctx.globalAlpha = n.alpha; const cr = n.cream || CREAMS[0];
      for (let j = 0; j < n.rows; j++) for (let i = 0; i < n.cols; i++) { const k = j * n.cols + i; if (!n.cells[k]) continue;
        const cx = -n.w / 2 + i * CS + CS / 2 + ((k * 7) % 5 - 2), cy = -n.h + j * CS + CS / 2 + ((k * 3) % 5 - 2);
        ctx.fillStyle = cr.c; ctx.beginPath(); ctx.arc(cx, cy, CS * .78, 0, TAU); ctx.fill(); }
    }
    if (frosted) { ctx.globalAlpha = n.alpha * n.fill; ctx.fillStyle = n.cream.c; ctx.fillRect(-n.w / 2 - 5, -n.h - 5, n.w + 10, n.h + 10);
      ctx.fillStyle = n.cream.hi; ctx.globalAlpha = n.alpha * n.fill * .8; ctx.beginPath(); ctx.ellipse(-n.w * .22, -n.h * .78, n.w * .18, n.h * .07, -.2, 0, TAU); ctx.fill(); }
    ctx.restore();
    ctx.globalAlpha = n.alpha; bodyPath(n);
    ctx.strokeStyle = frosted ? n.cream.lo : F.edge; ctx.stroke();
    if (n.kind === 'tier' && n.holes && !frosted) { // holes on top (the invitation)
      n.holes.forEach((hx, i) => { const filled = n.holesFilled && n.holesFilled[i];
        ctx.fillStyle = filled ? '#c7a46b' : '#5a3b21'; ctx.beginPath(); ctx.ellipse(hx, -n.h, 13, 6, 0, 0, TAU); ctx.fill();
        if (!filled && G.dragKind === 'dowel') { const pulse = .5 + .5 * Math.sin(G.t * 5 + i); ctx.strokeStyle = `rgba(255,255,255,${.35 + .45 * pulse})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(hx, -n.h, 17 + pulse * 4, 8 + pulse * 2, 0, 0, TAU); ctx.stroke(); }
      });
    }
    if (frosted) { // drips over the edge
      ctx.fillStyle = n.cream.c; ctx.globalAlpha = n.alpha * n.fill; const k = Math.max(2, Math.floor(n.w / 46));
      for (let i = 0; i < k; i++) { const x = -n.w / 2 + n.w * (i + .5) / k + ((i * 13) % 7 - 3); const r = 7 + ((i * 5) % 4) * 2.5; ctx.beginPath(); ctx.arc(x, n.kind === 'ball' ? -n.r * .35 : -n.h * .12, r, 0, TAU); ctx.fill(); ctx.fillRect(x - r, n.kind === 'ball' ? -n.r * .35 - 20 : -n.h * .12 - 22, r * 2, 22); }
      // rope, struts, winch fade with the spire/slab
      for (const t of n.toppings) drawTopping(t);
    }
  }
  ctx.restore();
  if (n.kind === 'candle') drawFlame(n);
}

function drawFlame(c) {
  setCam(c.m); const x = 0, y = -c.h;
  ctx.strokeStyle = '#333'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 10); ctx.stroke();
  if (!c.lit) { const p = .5 + .5 * Math.sin(G.t * 6); ctx.fillStyle = `rgba(255,140,60,${.3 + .5 * p})`; ctx.beginPath(); ctx.arc(x, y - 12, 3 + p * 2, 0, TAU); ctx.fill(); return; }
  const f = 1 + Math.sin(G.t * 14) * .1, g = Math.sin(G.t * 9) * 3;
  ctx.fillStyle = 'rgba(255,200,80,.25)'; ctx.beginPath(); ctx.arc(x, y - 24, 40 * f, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ff7b3a'; ctx.beginPath(); ctx.moveTo(x - 10, y - 8); ctx.quadraticCurveTo(x - 12, y - 34, x + g, y - 48 * f); ctx.quadraticCurveTo(x + 12, y - 34, x + 10, y - 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.moveTo(x - 5, y - 8); ctx.quadraticCurveTo(x - 6, y - 24, x + g * .5, y - 32 * f); ctx.quadraticCurveTo(x + 6, y - 24, x + 5, y - 8); ctx.closePath(); ctx.fill();
}

function drawStructures() {
  const slab = G.slab, T2 = G.T2;
  // sockets + struts (slab frame)
  if (slab && !(slab.fill > 0)) {
    const st = stages.slab; const ghost = G.stage === 'slab' && st.ghostSide ? st.ghostSide() : null;
    for (const side of ['L', 'R']) {
      if (G.stage !== 'slab' || !st.sockets) break; if (st.done[side]) continue;
      const sk = st.sockets(side); const pulse = .5 + .5 * Math.sin(G.t * 5 + (side === 'L' ? 0 : 2));
      setCam(); ctx.lineWidth = 4; ctx.strokeStyle = `rgba(80,100,120,${.5 + .4 * pulse})`; ctx.fillStyle = '#3f5062';
      for (const p of [sk.upW, sk.loW]) { ctx.beginPath(); ctx.arc(p[0], p[1], 9 + pulse * 3, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, TAU); ctx.fill(); }
      if (ghost === side) { ctx.strokeStyle = 'rgba(120,150,180,.6)'; ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(...sk.upW); ctx.lineTo(...sk.loW); ctx.stroke(); }
    }
  }
  if (slab) {
    setCam(slab.m); const frosted = slab.fill > 0;
    for (const s of G.struts) {
      const a = s.a, b = s.b; const bx = lerp(a[0], b[0], s.grow), by = lerp(a[1], b[1], s.grow);
      ctx.lineCap = 'round'; ctx.lineWidth = 18; ctx.strokeStyle = frosted ? '#fff' : '#4f6275'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(bx, by); ctx.stroke();
      ctx.lineWidth = 12; ctx.strokeStyle = frosted ? '#ff6b8a' : '#9fb3c8';
      if (frosted) { ctx.setLineDash([10, 10]); } ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
      if (!frosted) { ctx.fillStyle = '#3f5062'; ctx.beginPath(); ctx.arc(a[0], a[1], 7, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(bx, by, 7, 0, TAU); ctx.fill(); }
    }
  }
  // winch + rope (slab frame / world)
  const w = G.rope, spire = G.spire;
  if (w && spire && !(spire.fill > 0)) {
    const drum = slab.world(w.x, w.y - 14); const top = spire.world(0, -spire.h + 8);
    setCam(); const slack = Math.max(0, -spire.lean) * 140;
    ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.quadraticCurveTo((top[0] + drum[0]) / 2 + slack * .3, Math.max(top[1], drum[1]) + slack, drum[0], drum[1]); ctx.stroke();
    setCam(slab.m); ctx.translate(w.x, w.y - 14);
    ctx.fillStyle = '#6b5a4a'; rr(-16, 8, 32, 8, 3); ctx.fill();
    ctx.rotate(w.ang); const pulse = w.locked ? 0 : .5 + .5 * Math.sin(G.t * 6);
    ctx.fillStyle = '#c98a55'; ctx.beginPath(); ctx.arc(0, 0, 14 + pulse * 2, 0, TAU); ctx.fill(); ctx.strokeStyle = '#7a4a2a'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#7a4a2a'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#7a4a2a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(22, -6); ctx.stroke(); ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.arc(22, -6, 7, 0, TAU); ctx.fill();
  }
}
function drawCrane() {
  const c = G.crane; if (!c) return; setCam();
  let hx = 0, hy = c.y;
  if (c.hookTo) { if (c.hookTo instanceof Node) { const p = c.hookTo.world(0, -c.hookTo.h); hx = p[0]; hy = p[1]; } else { const p = c.hookTo.owner.world(c.hookTo.x, c.hookTo.y0 - 14); hx = p[0]; hy = p[1]; } }
  else if (c.mode === 'leave') { hy = c.y; } else { hy = G.T2 ? G.T2.topWorld()[1] - 260 : c.y; }
  const v = viewRect();
  ctx.strokeStyle = '#6d6d6d'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(hx, Math.min(v.t - 10, hy - 3000)); ctx.lineTo(hx, hy - 26); ctx.stroke();
  ctx.fillStyle = '#ffbf3f'; ctx.strokeStyle = '#8a6a1a'; ctx.lineWidth = 3; rr(hx - 16, hy - 40, 32, 16, 5); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#4a4a4a'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(hx + 8, hy - 8, 12, Math.PI * .5, Math.PI * 1.6); ctx.stroke();
}
function drawBalloons(n, count, color) {
  setCam(n.m); const bob = Math.sin(G.t * 2 + n.phase) * 6;
  const top = -n.h; const bx = 0, by = top - 90 + bob;
  ctx.strokeStyle = '#7a7a7a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-n.w * .3, top); ctx.lineTo(bx - 20, by + 40); ctx.moveTo(n.w * .3, top); ctx.lineTo(bx + 20, by + 40); ctx.stroke();
  for (const dx of (count > 1 ? [-24, 24] : [0])) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(bx + dx, by, 30, 38, 0, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(bx + dx - 10, by - 14, 8, 12, -.4, 0, TAU); ctx.fill(); }
}
function drawGhostDowel() {
  const p = G.parts.find(q => q.kind === 'dowel' && q.state === 'drag'); if (!p || G.stage !== 'dowels') return;
  const T1 = G.T1; let best = null, bd = 90 / Math.min(1, G.cam.s * 1.2);
  T1.holes.forEach((hx, i) => { if (T1.holesFilled[i]) return; const [wx, wy] = T1.world(hx, -T1.h); const d = dist(wx, wy, p.x, p.y + 40); if (d < bd) { bd = d; best = hx; } });
  if (best === null) return; setCam(T1.m); ctx.globalAlpha = .45; ctx.fillStyle = '#e9cd93'; rr(best - 11, -T1.h - 6, 22, T1.h - 14, 8); ctx.fill(); ctx.globalAlpha = 1;
}

function cakeRender() {
  drawBackground();
  // pass 1: everything hidden inside the cake (x-ray while unfrosted)
  for (const it of G.internals) drawInternal(it);
  // pass 2: bodies (with skewer under the balls)
  const order = []; walk(G.root, n => order.push(n));
  for (const n of order) { if (n === G.balls[0] && G.skewer) { const s = G.slab; setCam(s.m); const h = G.skewer.h; ctx.fillStyle = '#d9d2c5'; ctx.strokeStyle = '#7b7568'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-5, -s.h); ctx.lineTo(-5, -s.h - h + 14); ctx.lineTo(0, -s.h - h); ctx.lineTo(5, -s.h - h + 14); ctx.lineTo(5, -s.h); ctx.closePath(); ctx.fill(); ctx.stroke(); } drawNodeBody(n); }
  drawStructures();
  if (G.slab && G.slab.balloons) drawBalloons(G.slab, 2, '#ff6b8a');
  if (G.spire && G.spire.balloon) drawBalloons(G.spire, 1, '#7fd3ff');
  drawCrane(); drawTray(); drawGhostDowel();
  for (const p of G.parts) drawPart(p);
  drawParticles(); drawFingerCream();
}

GAMES.cake = {
  start() { G.paintMode = false; setStage('dowels'); },
  update() { if (G.T1 && G.T1.squash) { G.T1.squash = 0; G.T1.sy = .93; tween(G.T1, { sy: 1 }, .3, easeBack); } },
  render: cakeRender,
  debugState() { return { dowels: G.T1 && G.T1.dowelsIn, rodHits: G.rod && G.rod.hits, struts: G.struts.length, balls: G.balls.filter(b => b.stacked).length, lean: G.spire && G.spire.lean, fills: frostables().map(n => [n.kind, n.fill, +n.coverage.toFixed(2)]), toppings: G.toppingsCount, candle: !!G.candle, lit: G.candle && G.candle.lit }; },
};
