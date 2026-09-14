'use strict';
// 玉入れ: two baskets (red / white). Balls lie on the ground. Swipe a ball upward and it flies into the basket of its colour.
class Tamaire extends Station {
  constructor() {
    super('tamaire');
    this.H = 5.2; // pole height
    this.baskets = [
      { c: 'r', u: -7, v: 0, tilt: 0, inCount: 0, pile: [], row: [] },
      { c: 'w', u: 7, v: 0, tilt: 0, inCount: 0, pile: [], row: [] }
    ];
    this.kids = []; this.teachers = [];
    for (const b of this.baskets) {
      for (let i = 0; i < 4; i++) {
        const a = -Math.PI * 0.15 + i * (Math.PI * 1.3 / 3) + (b.c === 'r' ? Math.PI * 0.5 : Math.PI * 0.5);
        const k = makeKid(b.u + Math.cos(a) * 4.2, b.v + Math.sin(a) * 2.6 + 1.2, b.c, { home: null, throwT: -1, aiT: rand(1.0, 4.0), bob: rand(0, TAU) });
        k.home = { u: k.u, v: k.v }; k.team = b;
        this.kids.push(k);
      }
      const tch = makeKid(b.u + (b.c === 'r' ? -1.6 : 1.6), b.v + 1.4, 't', { beatT: -1 });
      tch.team = b; this.teachers.push(tch);
    }
    this.balls = []; this.held = null; this.timer = 0; this.beat = 0; this.countIdx = 0; this.winner = null;
    this.phaseT = 0; this.whistleDone = false;
    this.resetBalls();
  }
  resetBalls() {
    this.balls.length = 0;
    for (const b of this.baskets) {
      b.inCount = 0; b.pile.length = 0; b.row.length = 0; b.tilt = 0;
      for (let i = 0; i < 14; i++) {
        let u, v, tries = 0;
        do { const a = rand(0, TAU), r = rand(1.6, 5.5); u = b.u + Math.cos(a) * r; v = b.v + Math.sin(a) * r * 0.6 + 1.5; tries++; }
        while (tries < 20 && this.kids.some(k => dist(k.u, k.v, u, v) < 0.9));
        this.balls.push({ c: b.c, u, v, h: 0, st: 'ground', vh: 0, vu: 0, vv: 0, t: 0 });
      }
    }
  }
  reset() {
    super.reset(); this.resetBalls(); this.timer = 0; this.held = null; this.phaseT = 0; this.winner = null; this.countIdx = 0;
    for (const k of this.kids) { k.u = k.home.u; k.v = k.home.v; k.sit = false; k.throwT = -1; k.armL = k.armR = null; k.smile = false; k.crouch = 0; }
    for (const t of this.teachers) { t.sit = false; t.armL = t.armR = null; t.beatT = -1; }
  }
  invite() {
    super.invite();
    const g = this.balls.filter(b => b.st === 'ground'); for (let i = 0; i < 3 && g.length; i++) { const b = g[randi(0, g.length - 1)]; b.vh = 5 + i; b.h = 0.05; }
    Audio2.pop(600);
  }
  basketOf(c) { return this.baskets[c === 'r' ? 0 : 1]; }
  ballIn(b) { b.st = 'in'; b.h = this.H; this.basketOf(b.c).inCount++; Audio2.ding(b.c === 'r' ? 1100 : 1400); }
  nearestGround(u, v, maxD) {
    let best = null, bd = maxD;
    for (const b of this.balls) if (b.st === 'ground') { const d = dist(b.u, b.v, u, v); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  hit(u, v) { if (this.phase === 'done' || this.sub) return false; return !!this.nearestGround(u, v, 4.5); }
  down(u, v) {
    const b = this.nearestGround(u, v, 4.5); if (!b) return;
    this.held = b; b.st = 'held'; b.h = 1.0; this.d0 = { u, v }; this.dT = 0; this.samples = [];
    b.hu = u; b.hv = v; Audio2.pop(500);
  }
  move(u, v, du, dv) {
    if (!this.held) return;
    this.held.hu = u; this.held.hv = v;
    this.samples.push({ u, v, t: this.t }); if (this.samples.length > 6) this.samples.shift();
  }
  up(u, v) {
    const b = this.held; if (!b) return; this.held = null;
    const len = dist(this.d0.u, this.d0.v, u, v);
    if (len < 0.7) { // tap: hop, invites a swipe
      b.st = 'ground'; b.vh = 4; b.h = 0.2; Audio2.pop(700); return;
    }
    // swipe speed from recent samples
    let sp = 0; if (this.samples.length >= 2) { const a = this.samples[0], z = this.samples[this.samples.length - 1]; const dt = Math.max(0.03, z.t - a.t); sp = dist(a.u, a.v, z.u, z.v) / dt; }
    const strength = clamp(Math.max(len / 7, sp / 40), 0.1, 1);
    this.throwBall(b, strength, u - this.d0.u, v - this.d0.v, true);
  }
  throwBall(b, strength, du, dv, byPlayer) {
    const bk = this.basketOf(b.c);
    const sw = { u: b.u, v: b.v, h: b.h };
    const dx = bk.u - b.u, dy = bk.v - b.v, d = Math.hypot(dx, dy) || 1;
    // lateral curve from the swipe's sideways component
    const side = (-(dy / d) * du + (dx / d) * dv);
    b.st = 'fly'; b.t = 0; b.from = sw; b.to = { u: bk.u, v: bk.v, h: this.H + 0.6 };
    b.peak = 4.5 + 5.5 * strength; b.dur = 0.75 + 0.35 * strength + d * 0.02; b.curve = clamp(side * 0.25, -2.2, 2.2);
    b.rim = strength < 0.4; b.miss = !byPlayer && Math.random() < 0.45; b.byPlayer = byPlayer;
    if (b.miss) { const a = rand(0, TAU); b.to = { u: bk.u + Math.cos(a) * rand(2, 4.5), v: bk.v + Math.sin(a) * rand(1.5, 3) + 1.2, h: 0 }; b.peak = this.H + 2.5; b.rim = false; }
    Audio2.swish();
    if (this.phase === 'idle' && byPlayer) { this.phase = 'play'; this.timer = 0; Audio2.whistle(false); }
  }
  update(dt) {
    super.update(dt);
    const t = this.t;
    // ---- balls
    for (const b of this.balls) {
      if (b.st === 'held') {
        b.u = lerp(b.u, b.hu, 0.5); b.v = lerp(b.v, b.hv, 0.5); b.h = lerp(b.h, 1.2, 0.2);
      } else if (b.st === 'ground') {
        if (b.vh !== 0 || b.h > 0) { b.vh -= 22 * dt; b.h += b.vh * dt; if (b.h <= 0) { b.h = 0; b.vh = Math.abs(b.vh) > 1.5 ? -b.vh * 0.4 : 0; } b.u += b.vu * dt; b.v += b.vv * dt; b.vu *= 0.95; b.vv *= 0.95; }
      } else if (b.st === 'fly') {
        b.t += dt; const k = Math.min(1, b.t / b.dur);
        b.u = lerp(b.from.u, b.to.u, k); b.v = lerp(b.from.v, b.to.v, k);
        const dx = b.to.u - b.from.u, dy = b.to.v - b.from.v, d = Math.hypot(dx, dy) || 1;
        b.u += -(dy / d) * b.curve * Math.sin(k * Math.PI); b.v += (dx / d) * b.curve * Math.sin(k * Math.PI);
        b.h = lerp(b.from.h, b.to.h, k) + b.peak * 4 * k * (1 - k);
        if (k >= 1) {
          if (b.miss) { b.st = 'ground'; b.vh = 3; b.vu = rand(-1, 1); b.vv = rand(-0.5, 0.5); Audio2.pop(300); }
          else if (b.rim) { b.st = 'rim'; b.t = 0; Audio2.pop(900); }
          else { this.ballIn(b); }
        }
      } else if (b.st === 'rim') {
        b.t += dt; const bk = this.basketOf(b.c);
        b.h = this.H + 0.6 + Math.sin(Math.min(1, b.t / 0.45) * Math.PI) * 1.3; b.u = bk.u + Math.sin(b.t * 12) * 0.5 * (1 - b.t / 0.45);
        if (b.t >= 0.45) this.ballIn(b);
      } else if (b.st === 'toss') {
        b.t += dt; const k = Math.min(1, b.t / 0.45);
        b.u = lerp(b.from.u, b.to.u, k); b.v = lerp(b.from.v, b.to.v, k); b.h = 3.2 * 4 * k * (1 - k);
        if (k >= 1) { b.st = 'row'; b.h = 0; }
      }
    }
    // ---- kids
    for (const k of this.kids) {
      tickJump(k, dt);
      const bk = k.team; const dx = bk.u - k.u, dy = bk.v - k.v, d = Math.hypot(dx, dy) || 1;
      if (this.phase === 'idle' || this.phase === 'play') {
        k.fu = dx / d; k.fv = dy / d;
        if (this.phase === 'play') {
          // AI throwing
          k.aiT -= dt;
          if (k.throwT < 0 && k.aiT <= 0) {
            const nb = this.nearestGround(k.u, k.v, 6);
            if (nb && nb.c === k.cap) { k.throwT = 0; k.ball = nb; nb.st = 'carried'; k.aiT = rand(2.6, 5.0); } else k.aiT = 1.5;
          }
          if (k.throwT >= 0) {
            k.throwT += dt;
            if (k.throwT < 0.45) { k.crouch = k.throwT / 0.45; k.armR = { u: k.u + k.fu * 0.6, v: k.v + k.fv * 0.3, h: 0.3 }; if (k.ball) { k.ball.u = k.u + k.fu * 0.6; k.ball.v = k.v + k.fv * 0.3 + 0.2; k.ball.h = 0.3; } }
            else if (k.throwT < 0.75) { k.crouch = 1 - (k.throwT - 0.45) / 0.3; k.armR = { u: k.u + k.fu * 0.4, v: k.v + k.fv * 0.2, h: 3.4 }; if (k.ball) { this.throwBall(k.ball, rand(0.5, 1), 0, 0, false); k.ball = null; } }
            else if (k.throwT < 1.3) { k.armR = { u: k.u + k.fu * 0.3, v: k.v + k.fv * 0.2, h: 3.6 }; }
            else { k.throwT = -1; k.armR = null; k.crouch = 0; }
          }
        } else {
          // idle: look up at the basket, dip down toward the balls now and then
          const s = Math.sin(t * 1.3 + k.bob);
          k.crouch = s > 0.6 ? (s - 0.6) * 2.2 : 0;
          if (this.inviteT >= 0) { k.armR = { u: k.u + k.fu * 0.4, v: k.v + k.fv * 0.2, h: 3.6 }; } else if (k.crouch > 0) { k.armR = { u: k.u + k.fu * 0.7, v: k.v + k.fv * 0.4, h: 0.1 }; } else k.armR = null;
        }
      } else if (this.phase === 'whistle') {
        k.armR = k.armL = null; k.crouch = 0; k.throwT = -1;
        if (k.ball) { k.ball.st = 'ground'; k.ball = null; }
      } else if (this.phase === 'lower' || this.phase === 'count') {
        // sit in an arc facing the count spot
        const cu = bk.u, cv = bk.v + 6.2; const i = this.kids.indexOf(k) % 4;
        const a = Math.PI * 1.05 + (i - 1.5) * 0.45 * (bk.c === 'r' ? 1 : 1);
        const tu = cu + Math.cos(a) * 5.2, tv = cv + Math.sin(a) * 3.2 + 0.4;
        if (kidGo(k, tu, tv, dt, 6)) { k.sit = true; k.fu = (cu - k.u) / 5; k.fv = (cv - k.v) / 5; }
      } else if (this.phase === 'result' || this.phase === 'done') {
        if (this.winner === bk.c) { k.sit = false; k.smile = true; banzai(this, k, 3.6); if (k.jumpT < 0 && Math.random() < 0.03) k.jumpT = 0; }
      }
    }
    for (const tc of this.teachers) {
      const bk = tc.team;
      if (this.phase === 'idle' || this.phase === 'play' || this.phase === 'whistle') {
        // hands on the pole
        tc.armL = { u: bk.u, v: bk.v, h: 2.2 }; tc.armR = { u: bk.u, v: bk.v, h: 1.4 }; tc.fu = bk.u - tc.u; tc.fv = 0.4;
      } else if (this.phase === 'lower') {
        const tip = { u: bk.u, v: bk.v + Math.sin(bk.tilt) * this.H, h: Math.cos(bk.tilt) * this.H };
        tc.armL = { u: tip.u, v: tip.v, h: tip.h + 0.2 }; tc.armR = { u: bk.u, v: bk.v + 1.5, h: 1.0 };
        kidGo(tc, bk.u + (bk.c === 'r' ? -1.6 : 1.6), bk.v + 5.0, dt, 4);
      } else if (this.phase === 'count') {
        kidGo(tc, bk.u + (bk.c === 'r' ? -1.8 : 1.8), bk.v + 6.6, dt, 4);
        tc.fu = 0.4 * (bk.c === 'r' ? 1 : -1); tc.fv = 0.9;
        if (tc.beatT >= 0) { tc.beatT += dt; const k = Math.min(1, tc.beatT / 0.4); tc.armR = { u: tc.u + (bk.c === 'r' ? 1 : -1) * 0.8, v: tc.v + 0.2, h: 0.2 + Math.sin(k * Math.PI) * 3.4 }; if (tc.beatT > 0.4) tc.beatT = -1; }
        else tc.armR = { u: tc.u + (bk.c === 'r' ? 1 : -1) * 0.9, v: tc.v + 0.4, h: 0.2 };
      } else { tc.armR = null; tc.armL = null; }
    }
    // ---- phases
    this.phaseT += dt;
    if (this.phase === 'play') {
      this.timer += dt;
      const groundLeft = this.balls.some(b => b.st === 'ground');
      if (this.timer > 26 || (!groundLeft && !this.balls.some(b => b.st === 'fly' || b.st === 'held'))) {
        if (this.held) { this.held.st = 'ground'; this.held = null; }
        this.phase = 'whistle'; this.phaseT = 0; Audio2.whistle(true);
      }
    } else if (this.phase === 'whistle') {
      if (this.phaseT > 1.6) { this.phase = 'lower'; this.phaseT = 0; }
    } else if (this.phase === 'lower') {
      const k = Math.min(1, this.phaseT / 2.2);
      for (const bk of this.baskets) bk.tilt = smooth(k) * Math.PI / 2;
      if (k >= 1) {
        // spill balls into piles
        for (const bk of this.baskets) {
          for (const b of this.balls) if (b.st === 'in' && b.c === bk.c) { b.st = 'pile'; const a = rand(0, TAU), r = rand(0, 1.3); b.u = bk.u + Math.cos(a) * r; b.v = bk.v + this.H + 0.8 + Math.sin(a) * r * 0.6; b.h = 0; bk.pile.push(b); }
          // balls never thrown also count as "not in" - they just stay on the ground
        }
        this.phase = 'count'; this.phaseT = 0; this.beat = 0; this.countIdx = 0; Audio2.thud();
      }
    } else if (this.phase === 'count') {
      this.beat += dt;
      if (this.beat >= 0.55) {
        this.beat = 0; let any = false;
        for (const bk of this.baskets) {
          if (bk.pile.length) {
            any = true; const b = bk.pile.pop(); const n = bk.row.length; bk.row.push(b);
            const dir = bk.c === 'r' ? 1 : -1;
            b.st = 'toss'; b.t = 0; b.from = { u: b.u, v: b.v }; b.to = { u: bk.u + dir * (0.6 + (n % 10) * 0.6), v: bk.v + this.H + 3.0 + Math.floor(n / 10) * 1.0 };
            const tc = this.teachers[this.baskets.indexOf(bk)]; tc.beatT = 0;
          }
        }
        if (any) { this.countIdx++; Audio2.drum(110 + this.countIdx * 6, 0.45); }
        else {
          const r = this.baskets[0].row.length, w = this.baskets[1].row.length;
          this.winner = r === w ? (Math.random() < 0.5 ? 'r' : 'w') : (r > w ? 'r' : 'w');
          this.phase = 'result'; this.phaseT = 0; Audio2.cheer(1, 3);
          const wb = this.basketOf(this.winner); const p = this.toWorld(wb.u, wb.v + 3); Particles.confetti(p.x, p.y, 40);
        }
      }
    } else if (this.phase === 'result') {
      if (this.phaseT > 3.0) this.finish();
    }
    if (this.phase === 'done' && this.awayT > 6) this.reset();
    if (this.inviteT >= 0) { this.inviteT += dt; if (this.inviteT > 1.6) this.inviteT = -1; }
  }
  drawGround(ctx) {
    // trodden circles around each basket
    for (const bk of this.baskets) {
      const p = this.toWorld(bk.u, bk.v + 1.2);
      ctx.fillStyle = 'rgba(0,0,0,0.035)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 7.5, 5, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = COL.line; ctx.lineWidth = 0.15; ctx.setLineDash([0.6, 0.6]); ctx.beginPath(); ctx.ellipse(p.x, p.y, 6.5, 4.2, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  draw(ctx) {
    for (const bk of this.baskets) {
      const base = this.toWorld(bk.u, bk.v);
      const tipL = { u: bk.u, v: bk.v + Math.sin(bk.tilt) * this.H }; const tipH = Math.cos(bk.tilt) * this.H;
      const tip = this.toWorld(tipL.u, tipL.v);
      const inv = this.inviteT >= 0 ? Math.sin(this.inviteT * 12) * 0.25 * (1 - this.inviteT / 1.6) : 0;
      Scene.add(this.depth(bk.u, bk.v) + 0.01, (c) => {
        drawShadow(c, base.x, base.y, 1.0, 0.4, 0.2);
        c.strokeStyle = '#8a7a66'; c.lineWidth = 0.35; c.beginPath(); c.moveTo(base.x, base.y); c.lineTo(tip.x + inv, tip.y - tipH); c.stroke();
        // net
        c.save(); c.translate(tip.x + inv, tip.y - tipH); c.rotate(bk.tilt * 0.9);
        c.fillStyle = bk.c === 'r' ? 'rgba(229,50,45,0.28)' : 'rgba(255,255,255,0.45)';
        c.beginPath(); c.moveTo(-1.5, -0.3); c.lineTo(1.5, -0.3); c.lineTo(1.1, 1.8); c.lineTo(-1.1, 1.8); c.closePath(); c.fill();
        c.strokeStyle = bk.c === 'r' ? '#b02520' : '#999'; c.lineWidth = 0.1; c.stroke();
        for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * 0.7, -0.3); c.lineTo(i * 0.5, 1.8); c.stroke(); }
        // balls inside
        c.fillStyle = bk.c === 'r' ? COL.red : '#fff';
        let n = 0; for (const b of this.balls) if (b.st === 'in') n++;
        for (let i = 0; i < Math.min(n, 14); i++) { const r = i % 4, row = Math.floor(i / 4); c.beginPath(); c.arc(-0.9 + r * 0.6, 1.3 - row * 0.5, 0.33, 0, TAU); c.fill(); }
        // rim
        c.strokeStyle = '#555'; c.lineWidth = 0.18; c.beginPath(); c.ellipse(0, -0.3, 1.55, 0.55, 0, 0, TAU); c.stroke();
        c.restore();
      });
    }
    for (const b of this.balls) {
      if (b.st === 'in' || b.st === 'carried') continue;
      const p = this.toWorld(b.u, b.v);
      Scene.add(p.y + (b.st === 'fly' ? 0.02 : 0), (c) => drawSmallBall(c, p.x, p.y, b.h, b.c));
    }
    for (const k of this.kids) Scene.add(kidLocalDepth(this, k), (c) => drawLocalKid(c, this, k));
    for (const k of this.teachers) Scene.add(kidLocalDepth(this, k), (c) => drawLocalKid(c, this, k));
  }
}
