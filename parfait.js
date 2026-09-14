/* Jumbo Parfait — build a towering parfait inside a glass. Turns out it is a giant sign on a rooftop. */
'use strict';

// ---------------- glass geometry (world units; the glass stands on the ledge at y = 0)
const GLASS = { rim: -560, bottom: -72, halfBot: 65, halfTop: 150 };
function glassHalf(y) { if (y > -110) return GLASS.halfBot; return GLASS.halfBot + clamp((-y - 110) / 450, 0, 1.4) * (GLASS.halfTop - GLASS.halfBot); }
function glassInnerPath() { ctx.beginPath(); ctx.moveTo(-GLASS.halfTop, GLASS.rim); ctx.lineTo(-GLASS.halfBot, -110); ctx.quadraticCurveTo(-GLASS.halfBot, GLASS.bottom, 0, GLASS.bottom); ctx.quadraticCurveTo(GLASS.halfBot, GLASS.bottom, GLASS.halfBot, -110); ctx.lineTo(GLASS.halfTop, GLASS.rim); ctx.closePath(); }
function drawGlassBack() {
  ctx.lineWidth = 6; ctx.lineJoin = 'round';
  // foot and stem
  ctx.fillStyle = 'rgba(210,235,250,.85)'; ctx.strokeStyle = 'rgba(120,160,190,.9)';
  ctx.beginPath(); ctx.ellipse(0, -4, 80, 14, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-14, -8); ctx.lineTo(-10, -72); ctx.lineTo(10, -72); ctx.lineTo(14, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
  // bowl (back wall)
  glassInnerPath(); ctx.fillStyle = 'rgba(215,238,250,.55)'; ctx.fill();
}
function drawGlassFront() {
  ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(120,160,190,.9)';
  glassInnerPath(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.moveTo(-GLASS.halfTop + 26, GLASS.rim + 30); ctx.lineTo(-GLASS.halfBot + 14, -150); ctx.lineTo(-GLASS.halfBot + 30, -150); ctx.lineTo(-GLASS.halfTop + 44, GLASS.rim + 30); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(160,200,225,.9)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(0, GLASS.rim, GLASS.halfTop, 16, 0, 0, TAU); ctx.stroke();
}

// ---------------- helpers
function pfNodes() { return [G.flakes, G.jelly, G.cookie, G.soft].filter(Boolean); }
function softTopWorld() { return G.soft.world(0, -G.soft.h); }
function pfFrostables() { return [G.soft].filter(Boolean); }
function pfSpan() { return { cx: 0, w: 470 }; }
function pourSound() { if (!G.pourSndT || G.t - G.pourSndT > .09) { G.pourSndT = G.t; audio.click(); } }

// ---------------- stage 1: pour the cornflakes (hold the box, let go when it looks right)
stages.pour = {
  enter() {
    clearWorld();
    G.root = new Node('base', { w: 0, h: 0 }); G.nodes.push(G.root); G.rootM = T(0, GLASS.bottom);
    G.flakes = G.root.add(new Node('flakes', { w: 320, h: 0.01 })); G.jelly = null; G.cookie = null; G.soft = null; G.plates = []; G.fruits = []; G.pockys = []; G.stick = null; G.nozzle = null; G.cherry = null; G.evening = 0; G.toppingsCount = 0; G.paintMode = false; G.revealMix = 0;
    G.pouring = false; G.poured = false;
    later(.5, () => {
      const box = addPart({ kind: 'box', tilt: 0 }); G.box = box;
      box.hit = addHit({ r: 70, big: 1.3, pos: () => [box.x, box.y], down: () => { if (G.poured) return; G.pouring = true; tween(box, { tilt: 1 }, .25, easeOut); }, move: () => {}, up: () => { G.pouring = false; tween(box, { tilt: 0 }, .3, easeBack); if (G.flakes.h >= 50 && !G.poured) later(.6, () => this.finish()); } });
    });
  },
  finish() {
    if (G.poured) return; G.poured = true; G.pouring = false; removeHit(G.box.hit); const b = G.box; b.state = 'done';
    const tw = { x: b.x, y: b.y }; b.fly = tw; tween(tw, { y: b.y - 700 }, .6, easeIn, () => removePart(b));
    audio.kachon(); sparkle(...G.flakes.topWorld(), 10); later(.5, () => setStage('fruit'));
  },
  downAny(wp) { jiggleAt(wp); },
  update(dt) {
    const f = G.flakes;
    if (G.pouring && !G.poured) {
      f.h = Math.min(150, f.h + dt * 55); pourSound();
      for (let i = 0; i < 3; i++) { const top = f.topWorld(); G.particles.push({ x: rnd(-40, 40), y: top[1] - 330 + rnd(-20, 20), vx: rnd(-20, 20), vy: rnd(150, 260), life: 330 / 300 + .05, max: 1, grav: 200, c: ['#e8b054', '#f6cd7b', '#d9963d'][i], s: 7, shape: 1 }); }
      if (f.h >= 150) this.finish();
    }
  },
  focus() { return { cx: 0, top: GLASS.bottom - 300, bottom: 30, w: 400, tray: true }; },
  draw() {},
};

// ---------------- stage 2: throw fruit in; it keeps rolling until the jelly sets
const FRUITS = ['strawberry', 'banana', 'kiwi'];
stages.fruit = {
  enter() {
    let inCount = 0;
    FRUITS.forEach((k, i) => later(i * .2, () => {
      const p = addPart({ kind: 'fruit', fruit: k });
      p.hit = addHit({ r: 55, pos: () => [p.x, p.y], down: () => { p.state = 'drag'; audio.plip(); }, move: wp => { p.x = wp[0]; p.y = wp[1] - 30; }, up: wp => throwIn(p, wp) });
    }));
    const throwIn = (p, wp) => {
      p.state = 'done'; removeHit(p.hit); audio.whistle();
      const f = G.flakes; const top = f.topWorld();
      const hw = glassHalf(top[1] - 30) - 34; const tx = clamp(wp ? wp[0] : rnd(-hw, hw), -hw, hw);
      const arc = { t: 0 }, sx = p.x, sy = p.y; p.fly = { x: sx, y: sy };
      tween(arc, { t: 1 }, .55, easeInOut, () => {
        removePart(p); audio.boing();
        const n = f.add(new Node('fruit', { w: 44, h: 44, fruit: p.fruit, x: tx, cx: tx, rolling: 1, r: 22 })); G.fruits.push(n); inCount++;
        burst(...n.world(0, -22), 6, ['#fff', '#ffe0a0'], 120, .4, 300, 4);
        if (inCount === FRUITS.length) later(.6, () => pourJelly());
      });
      G.arcs = G.arcs || []; arc.update = () => { p.fly.x = lerp(sx, tx, arc.t); p.fly.y = lerp(sy, top[1] - 22, arc.t) - Math.sin(arc.t * Math.PI) * 220; }; G.arcs.push(arc);
    };
    function pourJelly() {
      const j = G.flakes.add(new Node('jelly', { w: 320, h: 0.01, liquid: 1 })); G.jelly = j; G.ladle = { t: 0 };
      tween(G.ladle, { t: 1 }, .4, easeOut);
      tween(j, { h: 130 }, 1.3, easeInOut, () => {
        later(1.1, () => { j.liquid = 0; j.sy = 1.12; tween(j, { sy: 1 }, .5, easeBack); audio.boing(); for (const fr of G.fruits) fr.rolling = 0; sparkle(...j.topWorld(), 10); tween(G.ladle, { t: 0 }, .4, easeIn, () => { G.ladle = null; }); later(.7, () => setStage('cookie')); });
      });
    }
  },
  downAny(wp) { if (!tapWithTrayPart(wp)) jiggleAt(wp); },
  update(dt) {
    if (G.arcs) { G.arcs = G.arcs.filter(a => a.t < 1); G.arcs.forEach(a => a.update()); }
    for (const fr of G.fruits) { if (fr.rolling) { fr.x = fr.cx + Math.sin(G.t * 3 + fr.phase) * 26; fr.rot = Math.sin(G.t * 3 + fr.phase) * 1.2; } }
    if (G.jelly && G.jelly.liquid) { pourSound(); for (const fr of G.fruits) fr.lift = -Math.abs(Math.sin(G.t * 4 + fr.phase)) * 8; }
    else for (const fr of G.fruits) fr.lift = 0;
  },
  focus() { const f = G.flakes; return { cx: 0, top: f.topWorld()[1] - 300, bottom: 20, w: 400, tray: true }; },
  draw() {},
};

// ---------------- stage 3: a cookie shelf that tips; pocky struts against the glass wall
stages.cookie = {
  enter() {
    const j = G.jelly;
    const ck = addPart({ kind: 'cookie', w: 210, h: 22, scale: .7 }); G.cookiePart = ck;
    ck.hit = addHit({ r: 80, pos: () => [ck.x, ck.y], down: () => { ck.state = 'drag'; tween(ck, { scale: 1 }, .2); audio.plip(); }, move: wp => { ck.x = wp[0]; ck.y = wp[1] - 30; }, up: () => {
      const top = j.topWorld();
      if (dist(ck.x, ck.y, top[0], top[1] - 20) < 150 / Math.min(1, G.cam.s * 1.2)) place(clamp(ck.x - top[0], -30, 30)); else { ck.state = 'tray'; tween(ck, { scale: .7 }, .2); }
    } });
    const done = { L: false, R: false };
    function place(x) {
      ck.state = 'done'; removeHit(ck.hit); const top = j.topWorld();
      const tw = { x: ck.x, y: ck.y }; ck.fly = tw; tween(tw, { x: top[0] + x, y: top[1] - 30 }, .15, easeOut, () => {
        removePart(ck); const c = j.add(new Node('cookie', { w: 210, h: 22, x, lift: -20 })); G.cookie = c;
        tween(c, { lift: 0 }, .15, easeIn, () => { audio.thud(); G.shake = 5; c.wob = 1; later(.5, () => { spawnPocky('L'); spawnPocky('R'); }); });
      });
    }
    function sockets(side) {
      const c = G.cookie; const sgn = side === 'L' ? -1 : 1;
      const up = [sgn * (c.w / 2 - 12), 0]; const upW = c.world(...up);
      const wy = upW[1] + 70; const loW = [sgn * glassHalf(wy), wy];
      return { up, upW, loW, sgn };
    }
    function spawnPocky(side) {
      const p = addPart({ kind: 'pocky', side, len: 110 });
      p.hit = addHit({ r: 55, pos: () => [p.x, p.y], down: () => { p.state = 'drag'; audio.plip(); }, move: wp => { p.x = wp[0]; p.y = wp[1] - 30; }, up: () => {
        const s = best(p); if (!s) { p.state = 'tray'; return; }
        p.state = 'done'; removeHit(p.hit); const sk = sockets(s); const mid = [(sk.upW[0] + sk.loW[0]) / 2, (sk.upW[1] + sk.loW[1]) / 2];
        const tw = { x: p.x, y: p.y }; p.fly = tw; tween(tw, { x: mid[0], y: mid[1] }, .15, easeOut, () => { removePart(p); attach(s); });
      } });
    }
    function best(p) {
      let bs = null, bd = 150 / Math.min(1, G.cam.s * 1.2);
      for (const s of ['L', 'R']) { if (done[s]) continue; const sk = sockets(s); const d = dist((sk.upW[0] + sk.loW[0]) / 2, (sk.upW[1] + sk.loW[1]) / 2, p.x, p.y + 30); if (d < bd) { bd = d; bs = s; } }
      return bs;
    }
    function attach(s) {
      done[s] = true; const c = G.cookie; const sk = sockets(s); const lo = c.local(...sk.loW);
      const st = { side: s, a: sk.up, b: lo, grow: 0 }; G.pockys.push(st);
      tween(st, { grow: 1 }, .18, easeOut, () => { snapFx(...sk.upW); c.wob = done.L && done.R ? 0 : .4; if (done.L && done.R) later(.6, () => setStage('soft')); });
    }
    this.sockets = sockets; this.done = done;
    this.ghostSide = () => { const p = G.parts.find(q => q.kind === 'pocky' && q.state === 'drag'); return p ? best(p) : null; };
  },
  downAny(wp) { if (!tapWithTrayPart(wp)) jiggleAt(wp); },
  update() {},
  focus() { const j = G.jelly; return { cx: 0, top: j.topWorld()[1] - 220, bottom: G.flakes.topWorld()[1] + 30, w: 420, tray: true }; },
  draw() {},
};

// ---------------- stage 4: swirl soft-serve by circling; it grows past the rim and leans, so prop it with a wafer stick
stages.soft = {
  enter() {
    const c = G.cookie;
    const s = c.add(new Node('soft', { w: 92, h: 8, x: 0 })); G.soft = s; s.turns = 0;
    G.nozzle = { active: false, lastA: null, wiggle: 1, gone: 0 };
    const hit = addHit({ r: 120, big: 1.5, pos: () => s.world(0, -s.h - 44), down: wp => { if (G.nozzle.gone) return; G.nozzle.active = true; G.nozzle.lastA = ang(wp); audio.plip(); }, move: wp => { if (!G.nozzle.active) return; const a = ang(wp); let d = a - G.nozzle.lastA; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; d = clamp(Math.abs(d), 0, .5); G.nozzle.lastA = a; grow(d); }, up: () => { G.nozzle.active = false; if (s.h >= 100 && !G.nozzle.gone) leave(); } });
    function ang(wp) { const t = s.world(0, -s.h); return Math.atan2(wp[1] - t[1], wp[0] - t[0]); }
    function grow(d) {
      if (s.h >= 300) return; const before = s.h; s.h = Math.min(300, s.h + d * 7.5); s.turns += d / TAU;
      if (Math.floor(s.h / 22) !== Math.floor(before / 22)) audio.click();
      s.lean = -Math.max(0, s.h - 130) / 170 * 0.35; s.wob = s.h > 130 ? 1 : 0;
      if (s.h >= 300) leave();
    }
    function leave() {
      G.nozzle.gone = 1; removeHit(hit); audio.shing(); tween(G.nozzle, { wiggle: 0 }, .2);
      later(.4, () => {
        const p = addPart({ kind: 'stick', len: 150 });
        p.hit = addHit({ r: 60, pos: () => [p.x, p.y], down: () => { p.state = 'drag'; audio.plip(); }, move: wp => { p.x = wp[0]; p.y = wp[1] - 40; }, up: () => {
          const mid = s.world(0, -s.h * .5); if (dist(p.x, p.y, mid[0], mid[1]) < 170 / Math.min(1, G.cam.s * 1.2)) plant(p, p.x >= mid[0] ? 1 : -1); else p.state = 'tray';
        } });
      });
    }
    function plant(p, side) {
      p.state = 'done'; removeHit(p.hit); const tw = { x: p.x, y: p.y }; p.fly = tw; const target = c.world(side * 62, -c.h - 70);
      tween(tw, { x: target[0], y: target[1] }, .15, easeOut, () => {
        removePart(p); G.stick = { side, grow: 0, hTouch: Math.min(150, s.h * .65 + 10) }; tween(G.stick, { grow: 1 }, .2, easeOut, () => { snapFx(...c.world(side * 62, -c.h - G.stick.hTouch)); tween(s, { lean: 0 }, .4, easeBack); s.wob = 0; later(.7, () => setStage('plates')); });
      });
    }
  },
  downAny(wp) { if (!tapWithTrayPart(wp)) jiggleAt(wp); },
  update() { const n = G.nozzle; if (n && !n.gone && !n.active && G.soft.h < 100) n.wiggle = 1; },
  focus() { const s = G.soft; const top = s.world(0, -s.h)[1]; return { cx: 0, top: Math.min(top - 140, GLASS.rim - 220), bottom: G.cookie.bottomWorld()[1] + 40, w: 420, tray: true }; },
  draw() {},
};

// ---------------- stage 5: chocolate plates as a balance toy; the second one must counter the first
stages.plates = {
  enter() {
    const s = G.soft; const st = G.stick; const side = -st.side; // first plate goes away from the stick
    const p1 = { x: side * 30, ang: side * .5, s: 0, side }; G.plates.push(p1);
    const fly = { t: 0 }; G.plateFly = { p: p1, x: side * 900, y: -1200, t: 0 };
    tween(G.plateFly, { t: 1 }, .8, easeInOut, () => { G.plateFly = null; p1.s = 1; audio.shuk(); G.shake = 4; tween(s, { lean: side * 0.32 }, .9, easeInOut, () => { s.wob = .8; spawn(); }); });
    const p2side = -side;
    function spawn() {
      const p = addPart({ kind: 'plate' });
      p.hit = addHit({ r: 70, pos: () => [p.x, p.y], down: () => { p.state = 'drag'; audio.plip(); }, move: wp => { p.x = wp[0]; p.y = wp[1] - 30; preview(); }, up: () => {
        const tgt = s.world(p2side * 30, -s.h - 10); if (dist(p.x, p.y, tgt[0], tgt[1]) < 110 / Math.min(1, G.cam.s * 1.2)) settle(p); else { p.state = 'tray'; tween(s, { lean: side * 0.32 }, .4); }
      } });
      function preview() {
        const top = s.world(0, -s.h); const dx = (p.x - top[0]) * p2side; const dy = p.y - top[1];
        if (Math.abs(dx) < 160 && dy > -220 && dy < 80) { const k = clamp(dx / 30, 0, 1); s.lean = side * 0.32 * (1 - k); }
      }
      function settle(p) {
        p.state = 'done'; removeHit(p.hit); const tgt = s.world(p2side * 30, -s.h - 10); const tw = { x: p.x, y: p.y }; p.fly = tw;
        tween(tw, { x: tgt[0], y: tgt[1] }, .15, easeOut, () => { removePart(p); const pl = { x: p2side * 30, ang: p2side * .5, s: 0, side: p2side }; G.plates.push(pl); tween(pl, { s: 1 }, .25, easeBack); tween(s, { lean: 0 }, .35, easeBack, () => { s.wob = 0; snapFx(...s.world(0, -s.h)); later(.7, () => setStage('whip')); }); });
      }
    }
  },
  downAny(wp) { if (!tapWithTrayPart(wp)) jiggleAt(wp); },
  update() { if (G.plateFly) { const f = G.plateFly; const tgt = G.soft.world(f.p.x, -G.soft.h - 10); f.cx = lerp(f.x, tgt[0], f.t); f.cy = lerp(f.y, tgt[1], f.t); } },
  focus() { const s = G.soft; return { cx: 0, top: s.world(0, -s.h)[1] - 200, bottom: G.cookie.topWorld()[1] + 40, w: 460, tray: true }; },
  draw() {},
};

// ---------------- stage 6: whipped cream over everything that sticks out
stages.whip = {
  enter() {
    G.brush = null; G.lastP = null; G.paintMode = true; initFrost(G.soft);
    CREAMS.forEach(c => { const b = addPart({ kind: 'bag', cream: c, squish: 0 }); G.buckets.push(b); b.hit = addHit({ r: 55, pos: () => [b.x, b.y], down: () => pick(b), move: wp => { G.lastP = null; this.moveAny(wp); }, up: () => {} }); });
    function pick(b) { G.brush = b.cream; b.squish = 1; tween(b, { squish: 0 }, .35, easeBack); audio.plip(); G.lastP = null; }
    this.pick = pick;
  },
  downAny(wp) { if (!G.brush) this.pick(G.buckets[0]); G.lastP = wp; this.paintAt(wp); },
  moveAny(wp) { if (!G.brush) this.pick(G.buckets[0]); const lp = G.lastP || wp; const d = dist(lp[0], lp[1], wp[0], wp[1]); const n = Math.max(1, Math.ceil(d / 14)); for (let i = 1; i <= n; i++) this.paintAt([lerp(lp[0], wp[0], i / n), lerp(lp[1], wp[1], i / n)]); G.lastP = wp; },
  upAny() { G.lastP = null; },
  paintAt(wp) {
    const n = G.soft; if (n.fill > 0) return; const l = n.local(wp[0], wp[1]);
    if (paintFrost(n, l[0], l[1], 46)) { n.cream = G.brush; if (n.coverage >= 0.5) { n.fill = 0.01; tween(n, { fill: 1 }, .4, easeOut); audio.fwoosh(); n.sy = 1.08; tween(n, { sy: 1 }, .4, easeBack); burst(...n.world(0, -n.h / 2), 16, [n.cream.hi, n.cream.c, '#fff'], 220, .6, 200, 6); later(.5, () => { audio.chime(); setStage('garnish'); }); } }
  },
  update() {},
  focus() { return { cx: 0, top: softTopWorld()[1] - 80, bottom: GLASS.rim + 120, w: 440, tray: true }; },
  draw() {},
};

// ---------------- stage 7: garnish by tapping, then the cherry parachutes in
stages.garnish = {
  enter() {
    G.parts.length = 0; G.hits.length = 0; G.buckets = []; G.paintMode = false; G.idle = 0; G.toppingsCount = 0;
    const bowl = addPart({ kind: 'bowl' }); bowl.hit = addHit({ r: 60, pos: () => [bowl.x, bowl.y], down: () => { bowl.squish = 1; tween(bowl, { squish: 0 }, .3, easeBack); audio.plip(); burst(bowl.x, bowl.y - 30, 6, ['#ff5c7a', '#ffd400', '#7bd1ff'], 160, .5, 500, 5); } });
  },
  downAny(wp) {
    const s = G.soft; const l = s.local(wp[0], wp[1]);
    if (l[1] > -s.h - 60 && l[1] < 30 && Math.abs(l[0]) < s.w + 40) {
      const t = { x: clamp(l[0], -s.w / 2 + 6, s.w / 2 - 6), y: clamp(l[1], -s.h + 6, -8), kind: TOPPINGS[(G.toppingsCount + Math.floor(Math.random() * 2)) % TOPPINGS.length], s: 0, rot: rnd(-.3, .3) };
      s.toppings.push(t); tween(t, { s: 1 }, .25, easeBack); audio.pon(1 + Math.random() * .3); G.toppingsCount++; G.idle = 0; sparkle(wp[0], wp[1], 4);
      if (G.toppingsCount >= 5 && !G.cherry) this.cherry();
    } else jiggleAt(wp);
  },
  cherry() {
    G.parts.length = 0; G.hits.length = 0; const s = G.soft;
    const c = s.add(new Node('cherry', { w: 30, h: 30, r: 15, lift: -600, chute: 1 })); G.cherry = c;
    tween(c, { lift: -70 }, 2.2, easeOut, () => { c.hover = true; });
    addHit({ r: 80, big: 1.4, pos: () => c.world(0, -c.r - 40), down: () => { if (!c.hover) return; c.hover = false; G.hits.length = 0; c.chute = 0; audio.pop(); burst(...c.world(0, -60), 10, ['#fff', '#ffd1dc'], 200, .5, 200, 5); tween(c, { lift: 0 }, .25, easeIn, () => { audio.pon(.8); G.shake = 5; sparkle(...c.world(0, -c.r), 10); later(.8, () => setStage('sign')); }); } });
  },
  update(dt) { G.idle += dt; if (G.idle > 9 && !G.cherry) this.cherry(); if (G.cherry && G.cherry.hover) G.cherry.lift = -70 + Math.sin(G.t * 2) * 6; },
  focus() { const c = G.cherry; if (c && c.chute) { const t = c.world(0, -c.r)[1]; return { cx: 0, top: t - 130, bottom: softTopWorld()[1] + 120, w: 280, slow: true }; } return { cx: 0, top: softTopWorld()[1] - 100, bottom: GLASS.rim + 140, w: 440, tray: true }; },
  draw() {},
};

// ---------------- stage 8: pull back — it was a giant sign on a rooftop all along; night falls, neon lights, begin again
stages.sign = {
  enter() {
    G.parts.length = 0; G.hits.length = 0; G.revealT = 0; G.evening = 0; G.neonOn = false; G.done = false; G.revealMix = 0; tween(G, { revealMix: 1 }, 2.4, easeInOut);
    later(1.8, () => { audio.fanfare(); G.confettiOn = true; });
    later(3.2, () => { G.confettiOn = false; });
  },
  downAny() { this.night(); },
  night() {
    if (G.done || G.revealT < 2.4) return; G.done = true; audio.chime();
    tween(G, { evening: 1 }, 2.2, easeInOut, () => { G.neonOn = true; audio.shing(); later(2.6, () => { G.fade = 0; tween(G, { fade: 1 }, 1.2, easeInOut, () => { G.round++; setGame('start'); tween(G, { fade: 0 }, .8, easeInOut); }); }); });
  },
  update(dt) {
    G.revealT += dt;
    if (G.confettiOn && G.confetti.length < 160 && Math.random() < .6) { const v = toWorld(rnd(0, W), -20); G.confetti.push({ x: v[0], y: v[1], vx: rnd(-40, 40), vy: rnd(40, 120), r: rnd(0, TAU), c: ['#ff5c7a', '#ffd400', '#7bd1ff', '#8be37a', '#c58bff'][Math.floor(rnd(0, 5))], s: rnd(6, 11) / G.cam.s, life: 6 }); }
    for (let i = G.confetti.length - 1; i >= 0; i--) { const c = G.confetti[i]; c.life -= dt; c.x += (c.vx + Math.sin(G.t * 3 + c.r) * 30) * dt / G.cam.s; c.y += c.vy * dt / G.cam.s; c.r += dt * 4; if (c.life <= 0) G.confetti.splice(i, 1); }
  },
  focus() { return { cx: 0, top: -960, bottom: 1180, w: portrait ? 860 : 1400, slow: true, veryslow: G.revealT < 4 }; },
  draw() {},
};

// ============================================================ rendering
function mixc(a, b, t) { const p = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; const x = p(a), y = p(b); return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], t))).join(',')})`; }
function drawSkyCity() {
  const v = viewRect(); setCam(); const e = G.evening || 0;
  ctx.fillStyle = mixc('#bfe6ff', '#2b2a5e', e); ctx.fillRect(v.l, v.t, v.r - v.l, v.b - v.t);
  ctx.fillStyle = mixc('#e9f6ff', '#5a3d6e', e); ctx.fillRect(v.l, -300, v.r - v.l, Math.max(0, v.b + 300));
  // sun / moon and drifting clouds
  ctx.fillStyle = e < .5 ? '#fff2a8' : '#fff7d6'; ctx.beginPath(); ctx.arc(-700 + e * 300, -1400 + e * 200, 70, 0, TAU); ctx.fill();
  ctx.fillStyle = `rgba(255,255,255,${.9 - e * .6})`;
  for (let i = 0; i < 5; i++) { const cx = ((i * 530 + G.t * 12) % 2600) - 1300, cy = -1500 + i * 190; ctx.beginPath(); ctx.arc(cx, cy, 46, 0, TAU); ctx.arc(cx + 50, cy - 18, 60, 0, TAU); ctx.arc(cx + 110, cy, 44, 0, TAU); ctx.fill(); }
  if (e > .3) { ctx.fillStyle = `rgba(255,255,255,${(e - .3) * .9})`; for (let i = 0; i < 40; i++) { const sx = ((i * 373) % 2400) - 1200, sy = -1900 + ((i * 197) % 900); ctx.beginPath(); ctx.arc(sx, sy, 2 + (i % 3), 0, TAU); ctx.fill(); } }
  // the building only matters once the camera pulls back
  if (v.b > 40) {
    ctx.fillStyle = mixc('#c7b8a8', '#4a3f4e', e); ctx.fillRect(-400, 30, 800, 900);
    ctx.fillStyle = mixc('#a99684', '#3a3040', e); ctx.fillRect(-400, 30, 800, 26);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const lit = e > .5 && ((r * 7 + c * 3) % 5 < 3); ctx.fillStyle = lit ? '#ffe9a0' : mixc('#e8f4ff', '#26243a', e); ctx.fillRect(-365 + c * 100, 90 + r * 100, 56, 64); }
    ctx.fillStyle = mixc('#8a8f96', '#2a2c36', e); ctx.fillRect(v.l, 930, v.r - v.l, 260);
    ctx.fillStyle = mixc('#e2e4e8', '#3d404a', e); ctx.fillRect(v.l, 930, v.r - v.l, 40);
    ctx.fillStyle = '#fff'; for (let x = Math.floor(v.l / 120) * 120; x < v.r; x += 120) ctx.fillRect(x, 1060, 60, 8);
    // cars and people, tiny
    for (let i = 0; i < 6; i++) { const cx = ((i * 410 + G.t * (60 + i * 15)) % 2400) - 1200; ctx.fillStyle = ['#e63946', '#4b8bff', '#ffd400', '#8be37a', '#fff', '#ff9a3c'][i]; rr(cx, 1020, 52, 22, 6); ctx.fill(); ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(cx + 12, 1044, 6, 0, TAU); ctx.arc(cx + 40, 1044, 6, 0, TAU); ctx.fill(); }
    for (let i = 0; i < 9; i++) { const px = -420 + i * 105 + Math.sin(G.t * 2 + i) * 4; ctx.fillStyle = ['#5aa9ff', '#ff6b8a', '#8be37a', '#ffd400'][i % 4]; rr(px, 948, 10, 16, 3); ctx.fill(); ctx.fillStyle = '#ffd6b0'; ctx.beginPath(); ctx.arc(px + 5, 943, 5, 0, TAU); ctx.fill(); }
  }
  // sign board with a neon tube border (dull until night)
  const neon = G.neonOn ? .6 + .4 * Math.sin(G.t * 9) : 0;
  ctx.fillStyle = mixc('#fff6e8', '#3b2f4a', e); rr(-330, -760, 660, 800, 40); ctx.fill();
  ctx.lineWidth = 12; ctx.strokeStyle = neon ? `rgba(255,${120 + neon * 100},${200},${.6 + neon * .4})` : mixc('#e4d4c2', '#5a4a66', e); rr(-330, -760, 660, 800, 40); ctx.stroke();
  if (neon) { ctx.shadowColor = '#ff8fd0'; ctx.shadowBlur = 40; ctx.stroke(); ctx.shadowBlur = 0; }
  // ledge
  ctx.fillStyle = mixc('#d9a066', '#6b4a3a', e); rr(-280, -2, 560, 34, 10); ctx.fill(); ctx.fillStyle = mixc('#f2c98f', '#8a6a55', e); rr(-280, -2, 560, 10, 6); ctx.fill();
  // support legs
  ctx.fillStyle = mixc('#b5773f', '#4a3a30', e); ctx.fillRect(-300, 30, 22, 16); ctx.fillRect(278, 30, 22, 16);
  // until the camera pulls back, all you see is a cream backdrop and a shelf
  const mix = G.revealMix === undefined ? 0 : G.revealMix;
  if (mix < 1) { ctx.globalAlpha = 1 - mix; ctx.fillStyle = '#fff6e8'; ctx.fillRect(v.l, v.t, v.r - v.l, v.b - v.t); ctx.fillStyle = '#d9a066'; rr(v.l, -2, v.r - v.l, 34, 0); ctx.fill(); ctx.fillStyle = '#f2c98f'; rr(v.l, -2, v.r - v.l, 10, 0); ctx.fill(); ctx.globalAlpha = 1; }
}

function pfBody(n) {
  setCam(n.m); ctx.lineWidth = 3; ctx.lineJoin = 'round';
  switch (n.kind) {
    case 'flakes': {
      ctx.fillStyle = '#e8b054'; ctx.fillRect(-n.w / 2, -n.h, n.w, n.h + 10);
      ctx.fillStyle = '#c9862f'; for (let i = 0; i < 40; i++) { const x = ((i * 53) % 300) - 150, y = -((i * 37) % Math.max(1, Math.floor(n.h))); ctx.beginPath(); ctx.ellipse(x, y - 4, 9, 6, i, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#f6cd7b'; for (let i = 0; i < 30; i++) { const x = ((i * 71 + 20) % 300) - 150, y = -((i * 29 + 7) % Math.max(1, Math.floor(n.h))); ctx.beginPath(); ctx.ellipse(x, y - 4, 7, 5, i * 2, 0, TAU); ctx.fill(); }
      break;
    }
    case 'fruit': {
      ctx.save(); ctx.translate(0, -n.r); ctx.rotate(n.rot || 0); ctx.scale(1.4, 1.4);
      if (n.fruit === 'strawberry') drawStrawberry(0, 0, 1.2);
      else if (n.fruit === 'banana') { ctx.fillStyle = '#fff1a3'; ctx.strokeStyle = '#d9b957'; ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#e8d27a'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill(); }
      else { ctx.fillStyle = '#9bd35c'; ctx.strokeStyle = '#6a4a2a'; ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#e9f7d0'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill(); ctx.fillStyle = '#333'; for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(Math.cos(i) * 9, Math.sin(i) * 9, 1.3, 0, TAU); ctx.fill(); } }
      ctx.restore(); break;
    }
    case 'jelly': {
      const wave = n.liquid ? Math.sin(G.t * 6) * 4 : 0;
      ctx.fillStyle = n.liquid ? 'rgba(255,90,110,.45)' : 'rgba(255,90,110,.6)';
      ctx.beginPath(); ctx.moveTo(-n.w / 2, 12); ctx.lineTo(-n.w / 2, -n.h); ctx.quadraticCurveTo(-n.w / 4, -n.h - wave, 0, -n.h); ctx.quadraticCurveTo(n.w / 4, -n.h + wave, n.w / 2, -n.h); ctx.lineTo(n.w / 2, 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(-60, -n.h * .6, 14, 30, .3, 0, TAU); ctx.fill();
      break;
    }
    case 'cookie': {
      ctx.fillStyle = '#c98a55'; ctx.strokeStyle = '#7a4a2a'; rr(-n.w / 2, -n.h, n.w, n.h, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4a2a1a'; for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(-n.w / 2 + 18 + i * 29, -n.h / 2 + ((i % 2) * 4 - 2), 4, 0, TAU); ctx.fill(); }
      // pocky struts, in this frame
      for (const s of G.pockys) { const bx = lerp(s.a[0], s.b[0], s.grow), by = lerp(s.a[1], s.b[1], s.grow); ctx.lineCap = 'round'; ctx.lineWidth = 11; ctx.strokeStyle = '#5a2e14'; ctx.beginPath(); ctx.moveTo(s.a[0], s.a[1]); ctx.lineTo(bx, by); ctx.stroke(); ctx.lineWidth = 7; ctx.strokeStyle = '#e8c48a'; ctx.beginPath(); ctx.moveTo(lerp(s.a[0], bx, .55), lerp(s.a[1], by, .55)); ctx.lineTo(bx, by); ctx.stroke(); }
      // wafer stick, behind the soft-serve
      const st = G.stick; if (st) { const x = st.side * 62; const y1 = -n.h - st.hTouch * st.grow; ctx.lineCap = 'round'; ctx.lineWidth = 14; ctx.strokeStyle = G.soft && G.soft.fill > 0 ? '#5a2e14' : '#e2b56b'; ctx.beginPath(); ctx.moveTo(x, -n.h); ctx.lineTo(x, y1); ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = G.soft && G.soft.fill > 0 ? '#3a1a08' : '#a8814d'; for (let k = 0; k < 4; k++) { const yy = -n.h - (st.hTouch * st.grow) * (k + .5) / 4; ctx.beginPath(); ctx.moveTo(x - 6, yy); ctx.lineTo(x + 6, yy); ctx.stroke(); } }
      break;
    }
    case 'soft': {
      const h = n.h, w = n.w; const frosted = n.fill > 0; const cr = n.cream || CREAMS[0];
      // ridged swirl body
      pfSoftPath(n); ctx.fillStyle = frosted ? cr.c : '#fff7ea'; ctx.fill(); ctx.strokeStyle = frosted ? cr.lo : '#d9c3a0'; ctx.stroke();
      ctx.save(); pfSoftPath(n); ctx.clip();
      if (!frosted) { ctx.strokeStyle = 'rgba(200,170,130,.5)'; ctx.lineWidth = 2; for (let y = -12; y > -h; y -= 22) { ctx.beginPath(); ctx.moveTo(-w / 2, y); ctx.quadraticCurveTo(0, y - 8, w / 2, y); ctx.stroke(); } }
      if (n.cells && !frosted) { ctx.fillStyle = cr.c; for (let j = 0; j < n.rows; j++) for (let i = 0; i < n.cols; i++) { const k = j * n.cols + i; if (!n.cells[k]) continue; const cx = -w / 2 + i * CS + CS / 2 + ((k * 7) % 5 - 2), cy = -h + j * CS + CS / 2 + ((k * 3) % 5 - 2); ctx.beginPath(); ctx.arc(cx, cy, CS * .8, 0, TAU); ctx.fill(); } }
      if (frosted) { ctx.globalAlpha = n.fill; ctx.fillStyle = cr.c; ctx.fillRect(-w, -h - 10, w * 2, h + 20); ctx.strokeStyle = cr.hi; ctx.lineWidth = 6; for (let y = -10; y > -h; y -= 24) { ctx.beginPath(); ctx.moveTo(-w / 2, y); ctx.quadraticCurveTo(0, y - 12, w / 2, y); ctx.stroke(); } ctx.globalAlpha = 1; }
      ctx.restore();
      if (frosted) { pfSoftPath(n); ctx.strokeStyle = cr.lo; ctx.lineWidth = 3; ctx.stroke(); for (const t of n.toppings) drawTopping(t); }
      // chocolate plates stuck in the top
      for (const p of G.plates) { if (!p.s) continue; ctx.save(); ctx.translate(p.x, -h + 4); ctx.rotate(p.ang); ctx.scale(p.s, p.s); ctx.fillStyle = '#5a2e14'; ctx.strokeStyle = '#3a1a08'; ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(26, 0); ctx.lineTo(0, -96); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#8a5a3a'; ctx.beginPath(); ctx.moveTo(-10, -10); ctx.lineTo(10, -10); ctx.lineTo(0, -60); ctx.closePath(); ctx.fill(); ctx.restore(); }
      break;
    }
    case 'cherry': {
      ctx.strokeStyle = '#4b7b2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -n.r * 1.6); ctx.quadraticCurveTo(8, -n.r * 2.6, 16, -n.r * 2.8); ctx.stroke();
      ctx.fillStyle = '#d62839'; ctx.beginPath(); ctx.arc(0, -n.r, n.r, 0, TAU); ctx.fill(); ctx.fillStyle = '#ff8fa0'; ctx.beginPath(); ctx.arc(-5, -n.r - 5, 4, 0, TAU); ctx.fill();
      if (n.chute) { ctx.strokeStyle = '#999'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -n.r); ctx.lineTo(-40, -n.r - 60); ctx.moveTo(0, -n.r); ctx.lineTo(40, -n.r - 60); ctx.stroke(); ctx.fillStyle = '#ff9fc6'; ctx.beginPath(); ctx.arc(0, -n.r - 60, 44, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -n.r - 60, 44, Math.PI * 1.25, Math.PI * 1.5); ctx.lineTo(0, -n.r - 60); ctx.closePath(); ctx.fill(); }
      break;
    }
  }
}
function pfSoftPath(n) { const h = n.h, w = n.w; ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(-w / 2, -h + 30); ctx.quadraticCurveTo(-w / 2, -h - 6, -14, -h - 8); ctx.quadraticCurveTo(-4, -h - 30, 14, -h - 26); ctx.quadraticCurveTo(10, -h - 12, 22, -h - 6); ctx.quadraticCurveTo(w / 2, -h - 4, w / 2, -h + 30); ctx.lineTo(w / 2, 0); ctx.closePath(); }
BODY_PATHS.soft = pfSoftPath;

function drawContents() { walk(G.root, n => { if (n.kind !== 'base') pfBody(n); }); }
function drawNozzle() {
  const nz = G.nozzle; if (!nz || nz.gone) return; const s = G.soft; setCam(s.m);
  const wig = nz.active ? 0 : nz.wiggle; const ox = Math.cos(G.t * 4) * 14 * wig, oy = Math.sin(G.t * 4) * 8 * wig;
  ctx.save(); ctx.translate(ox, -s.h - 40 + oy);
  ctx.fillStyle = '#d9dde3'; ctx.strokeStyle = '#7d8a94'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-22, -30); ctx.lineTo(22, -30); ctx.lineTo(8, 10); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#c9c0ad'; ctx.beginPath(); ctx.moveTo(-40, -30); ctx.lineTo(40, -30); ctx.lineTo(60, -400); ctx.lineTo(-60, -400); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff7ea'; ctx.beginPath(); ctx.arc(0, 14, 10 + Math.sin(G.t * 6) * 2, 0, TAU); ctx.fill();
  ctx.restore();
}
function drawLadle() { const l = G.ladle; if (!l) return; setCam(); const y = GLASS.rim - 200 + (1 - l.t) * -500; ctx.fillStyle = '#c0c8d0'; ctx.strokeStyle = '#6d7b8a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(-60, y, 60, 26, -.2, 0, TAU); ctx.fill(); ctx.stroke(); ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(-110, y - 10); ctx.lineTo(-420, y - 60); ctx.stroke(); ctx.fillStyle = 'rgba(255,90,110,.75)'; ctx.beginPath(); ctx.ellipse(-50, y - 4, 40, 12, -.2, 0, TAU); ctx.fill(); if (G.jelly && G.jelly.liquid && G.jelly.h < 129) { ctx.fillStyle = 'rgba(255,90,110,.7)'; ctx.beginPath(); ctx.moveTo(-8, y + 6); ctx.quadraticCurveTo(0, y + 120, 6, G.jelly.topWorld()[1]); ctx.lineTo(-6, G.jelly.topWorld()[1]); ctx.quadraticCurveTo(-4, y + 120, -18, y + 6); ctx.closePath(); ctx.fill(); } }
function drawSockets() {
  if (G.stage !== 'cookie' || !G.cookie) return; const st = stages.cookie; const ghost = st.ghostSide();
  for (const side of ['L', 'R']) { if (st.done[side]) continue; const sk = st.sockets(side); const pulse = .5 + .5 * Math.sin(G.t * 5 + (side === 'L' ? 0 : 2)); setCam(); ctx.lineWidth = 4; ctx.strokeStyle = `rgba(90,46,20,${.5 + .4 * pulse})`; ctx.fillStyle = '#5a2e14'; for (const p of [sk.upW, sk.loW]) { ctx.beginPath(); ctx.arc(p[0], p[1], 9 + pulse * 3, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, TAU); ctx.fill(); } if (ghost === side) { ctx.strokeStyle = 'rgba(120,80,40,.5)'; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(...sk.upW); ctx.lineTo(...sk.loW); ctx.stroke(); } }
}
function drawPlateFly() { const f = G.plateFly; if (!f || f.cx === undefined) return; setCam(); ctx.save(); ctx.translate(f.cx, f.cy); ctx.rotate(f.p.ang + (1 - f.t) * 6); ctx.fillStyle = '#5a2e14'; ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(26, 0); ctx.lineTo(0, -96); ctx.closePath(); ctx.fill(); ctx.restore(); }

Object.assign(PART_DRAW, {
  box(p) { ctx.rotate(-p.tilt * 1.9); ctx.fillStyle = '#ffb347'; ctx.strokeStyle = '#b8651a'; rr(-30, -48, 60, 90, 6); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, -10, 20, 24, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#e8b054'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(-10 + (i % 3) * 10, -18 + Math.floor(i / 3) * 14, 6, 4, i, 0, TAU); ctx.fill(); } ctx.fillStyle = '#b8651a'; rr(-30, -48, 60, 10, 4); ctx.fill(); },
  fruit(p) { ctx.scale(1.4, 1.4); ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.ellipse(0, 22, 18, 5, 0, 0, TAU); ctx.fill(); if (p.fruit === 'strawberry') drawStrawberry(0, 0, 1.2); else if (p.fruit === 'banana') { ctx.fillStyle = '#fff1a3'; ctx.strokeStyle = '#d9b957'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#e8d27a'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill(); } else { ctx.fillStyle = '#9bd35c'; ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#e9f7d0'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill(); } },
  cookie(p) { ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.ellipse(0, 24, p.w / 2, 8, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#c98a55'; ctx.strokeStyle = '#7a4a2a'; rr(-p.w / 2, -p.h / 2, p.w, p.h, 8); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#4a2a1a'; for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(-p.w / 2 + 18 + i * 29, (i % 2) * 4 - 2, 4, 0, TAU); ctx.fill(); } },
  pocky(p) { const s = p.side === 'L' ? 1 : -1; ctx.rotate(s * 0.7); ctx.lineCap = 'round'; ctx.lineWidth = 11; ctx.strokeStyle = '#5a2e14'; ctx.beginPath(); ctx.moveTo(0, -p.len / 2); ctx.lineTo(0, p.len / 2); ctx.stroke(); ctx.lineWidth = 7; ctx.strokeStyle = '#e8c48a'; ctx.beginPath(); ctx.moveTo(0, p.len / 2 - 40); ctx.lineTo(0, p.len / 2); ctx.stroke(); },
  stick(p) { ctx.lineCap = 'round'; ctx.lineWidth = 14; ctx.strokeStyle = '#e2b56b'; ctx.beginPath(); ctx.moveTo(0, -p.len / 2); ctx.lineTo(0, p.len / 2); ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = '#a8814d'; for (let k = 0; k < 5; k++) { const yy = -p.len / 2 + p.len * (k + .5) / 5; ctx.beginPath(); ctx.moveTo(-6, yy); ctx.lineTo(6, yy); ctx.stroke(); } },
  plate(p) { ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.ellipse(0, 40, 30, 6, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#5a2e14'; ctx.strokeStyle = '#3a1a08'; ctx.beginPath(); ctx.moveTo(-26, 36); ctx.lineTo(26, 36); ctx.lineTo(0, -60); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#8a5a3a'; ctx.beginPath(); ctx.moveTo(-10, 26); ctx.lineTo(10, 26); ctx.lineTo(0, -24); ctx.closePath(); ctx.fill(); },
  bag(p) { const sq = 1 + (p.squish || 0) * .25; ctx.scale(1 + (p.squish || 0) * .2, 1 / sq); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#c9c0ad'; ctx.beginPath(); ctx.moveTo(-30, -44); ctx.lineTo(30, -44); ctx.lineTo(8, 22); ctx.lineTo(-8, 22); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = p.cream.c; ctx.beginPath(); ctx.moveTo(-26, -40); ctx.lineTo(26, -40); ctx.lineTo(7, 18); ctx.lineTo(-7, 18); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#d9dde3'; ctx.strokeStyle = '#7d8a94'; ctx.beginPath(); ctx.moveTo(-10, 18); ctx.lineTo(10, 18); ctx.lineTo(5, 36); ctx.lineTo(-5, 36); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = p.cream.c; ctx.beginPath(); ctx.arc(0, 42 + Math.sin(G.t * 3 + p.x) * 3, 9, 0, TAU); ctx.fill(); },
});

function parfaitRender() {
  drawSkyCity();
  setCam(); drawGlassBack();
  ctx.save(); setCam(); glassInnerPath(); ctx.clip(); drawContents(); ctx.restore();
  ctx.save(); setCam(); ctx.beginPath(); ctx.rect(-3000, -5000, 6000, 5000 + GLASS.rim - 4); ctx.clip(); drawContents(); ctx.restore();
  setCam(); drawGlassFront();
  drawSockets(); drawNozzle(); drawLadle(); drawPlateFly(); drawTray();
  for (const p of G.parts) drawPart(p);
  drawParticles(); drawFingerCream();
}
GAMES.parfait = {
  start() { G.paintMode = false; setStage('pour'); },
  update() {},
  render: parfaitRender,
  debugState() { return { flakes: G.flakes && +G.flakes.h.toFixed(1), fruits: G.fruits ? G.fruits.length : 0, jelly: G.jelly && G.jelly.liquid, cookie: !!G.cookie, pockys: G.pockys ? G.pockys.length : 0, soft: G.soft && +G.soft.h.toFixed(1), lean: G.soft && +G.soft.lean.toFixed(2), stick: !!G.stick, plates: G.plates ? G.plates.length : 0, fill: G.soft && G.soft.fill, coverage: G.soft && G.soft.coverage, toppings: G.toppingsCount, cherry: !!G.cherry, evening: G.evening }; },
};
