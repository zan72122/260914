'use strict';
// 大玉送り: a giant ball rides over a line of raised hands. Drag it to the far end of the line.
class Oodama extends Station {
  constructor() {
    super('oodama');
    this.R = 3.0; this.L = 30; this.N = 11;
    this.lines = [
      { v: 0, cap: 'w', kids: [], ball: { u: -1.5, v: 0, h: 3.0, rot: 0, st: 'up', t: 0 }, player: true, done: false },
      { v: 8, cap: 'r', kids: [], ball: { u: -1.5, v: 8, h: 3.0, rot: 0, st: 'up', t: 0 }, player: false, done: false }
    ];
    for (const L of this.lines) {
      for (let i = 0; i < this.N; i++) { const k = makeKid(i * (this.L / (this.N - 1)), L.v, L.cap, { bob: rand(0, TAU) }); k.home = { u: k.u, v: k.v }; k.fu = 1; k.fv = 0; L.kids.push(k); }
      L.teacher = makeKid(this.L + 3.5, L.v, 't'); L.teacher.fu = -1; L.teacher.fv = 0; L.teacher.flag = 0;
    }
    this.idleT = 0; this.rivalV = 0; this.dragging = false;
  }
  reset() {
    super.reset();
    for (const L of this.lines) { Object.assign(L.ball, { u: -1.5, v: L.v, h: 3.0, rot: 0, st: 'up', t: 0 }); L.done = false; L.teacher.flag = 0; for (const k of L.kids) { k.smile = false; k.jumpT = -1; } }
    this.idleT = 0;
  }
  get ball() { return this.lines[0].ball; }
  hit(u, v) { if (this.phase === 'done') return false; const b = this.ball; return b.st === 'up' && dist(u, v, b.u, b.v) < this.R + 2.5; }
  down(u, v) { this.dragging = true; this.idleT = 0; this.lastU = u; }
  move(u, v, du, dv) {
    if (!this.dragging) return; const b = this.ball; if (b.st !== 'up') return;
    b.u = clamp(b.u + du, -2.5, this.L + 3.2); b.v += dv * 0.6; b.rot += du / this.R;
    this.idleT = 0;
    if (this.phase === 'idle') { this.phase = 'play'; Audio2.whistle(false); }
    if (Math.abs(b.v - this.lines[0].v) > 3.4) this.drop(this.lines[0]);
  }
  up() { this.dragging = false; }
  drop(L) {
    const b = L.ball; b.st = 'fall'; b.t = 0; b.vh = 1.5; b.vv = Math.sign(b.v - L.v) * 3; Audio2.pop(250);
    // three nearest kids will chase it
    const near = [...L.kids].sort((a, c) => Math.abs(a.u - b.u) - Math.abs(c.u - b.u)).slice(0, 3);
    for (const k of near) k.chase = true;
  }
  update(dt) {
    super.update(dt);
    const t = this.t;
    this.idleT += dt;
    for (const L of this.lines) {
      const b = L.ball;
      if (b.st === 'up') {
        if (!(L.player && this.dragging)) b.v = approach(b.v, L.v, 6, dt);
        b.h = approach(b.h, 3.0 + Math.sin(t * 3) * 0.1, 8, dt);
        if (L.done) b.h = approach(b.h, 1.2, 4, dt);
        if (L.player && this.inviteT >= 0) b.h = 3.0 + Math.abs(Math.sin(this.inviteT * 7)) * 0.8 * (1 - this.inviteT / 2);
        if (!L.player && this.phase === 'play' && !L.done) {
          // rival line: steady but a little slower than a dragging finger; stumbles now and then
          const pace = this.lines[0].done ? 0 : 2.6;
          b.u += pace * dt; b.rot += pace * dt / this.R;
          if (this.idleT < 5 && Math.random() < dt * 0.05 && b.u > 4 && b.u < this.L - 4) { b.v = L.v + 3.6; this.drop(L); }
        }
        if (!L.done && b.u >= this.L + 0.5) {
          L.done = true; b.u = this.L + 1.2; L.teacher.flag = 1; Audio2.whistle(false); Audio2.cheer(0.8, 2.5);
          const p = this.toWorld(this.L, L.v); Particles.confetti(p.x, p.y, 30);
          for (const k of L.kids) { k.smile = true; }
          if (L.player) { this.phase = 'result'; this.phaseT = 0; }
        }
      } else if (b.st === 'fall') {
        b.t += dt; b.vh -= 12 * dt; b.h += b.vh * dt; b.v += b.vv * dt; b.vv *= 0.97; b.rot += b.vv * dt / this.R;
        if (b.h <= 0) { b.h = 0; if (Math.abs(b.vh) > 2) { b.vh = -b.vh * 0.35; Audio2.thud(); Particles.dust(this.toWorld(b.u, b.v).x, this.toWorld(b.u, b.v).y, 6, 2); } else b.vh = 0; }
        if (b.t > 1.5) { b.st = 'lift'; b.t = 0; b.fromV = b.v; b.fromH = b.h; }
      } else if (b.st === 'lift') {
        b.t += dt; const k = smooth(Math.min(1, b.t / 0.8));
        b.v = lerp(b.fromV, L.v, k); b.h = lerp(b.fromH, 3.0, k);
        if (k >= 1) { b.st = 'up'; for (const kd of L.kids) kd.chase = false; }
      }
      // kids
      for (let i = 0; i < L.kids.length; i++) {
        const k = L.kids[i]; tickJump(k, dt);
        const du = b.u - k.u; const near = Math.abs(du) < 3.6;
        if (k.chase && (b.st === 'fall' || b.st === 'lift')) {
          // run to the ball and lift
          const side = i % 2 ? 1 : -1; const tu = b.u + side * 1.6 * ((i % 3) - 1) , tv = b.v + (b.v > L.v ? -1.4 : 1.4);
          const arrived = kidGo(k, tu, tv, dt, 8);
          if (arrived) { k.fu = 0; k.fv = b.v > L.v ? 1 : -1; const o = xOff(this, 0.9); k.armL = { u: b.u - o.u, v: b.v - o.v, h: b.h + 0.8 }; k.armR = { u: b.u + o.u, v: b.v + o.v, h: b.h + 0.8 }; k.crouch = b.st === 'fall' ? 0.6 : 0.6 * (1 - Math.min(1, b.t / 0.8)); }
        } else {
          const home = kidGo(k, k.home.u, k.home.v, dt, 7);
          if (home) {
            k.fu = 1; k.fv = 0; k.crouch = 0;
            if (Math.abs(du) < 6 && b.st === 'up') { const s = (du) / 6; k.fu = lerp(1, s, 0.6); k.fv = 0; }
          }
          // arms up; hands touch the ball when it is above them
          if (near && b.st === 'up') {
            const bh = b.h - 0.2; const o = xOff(this, 1.1); const cu = b.u + (k.u - b.u) * 0.5; k.armL = { u: cu - o.u, v: b.v - o.v, h: bh }; k.armR = { u: cu + o.u, v: b.v + o.v, h: bh };
            k.h = Math.max(0, 0.25 - Math.abs(du) * 0.1);
          } else {
            const w = Math.sin(t * 2.2 + k.bob) * 0.25;
            banzai(this, k, 3.3 + w, 1.0); k.h = 0;
            if (this.inviteT >= 0 && L.player) { k.h = Math.max(0, Math.sin(this.inviteT * 6 - i * 0.5)) * 0.35; }
          }
          if (L.done) { banzai(this, k, 3.6); if (k.jumpT < 0 && Math.random() < 0.04) k.jumpT = 0; }
        }
      }
      const tc = L.teacher;
      if (L.done) { tc.armR = { u: tc.u + Math.sin(t * 8) * 0.5, v: tc.v + 0.3, h: 3.8 }; tc.armL = { u: b.u, v: b.v, h: b.h + 0.5 }; tc.fu = -1; }
      else { tc.armR = { u: tc.u + 0.3, v: tc.v + 0.3, h: 3.6 }; tc.armL = { u: tc.u - 0.6, v: tc.v + 0.1, h: 1.0 }; tc.fu = -1; tc.fv = 0; }
    }
    if (this.phase === 'result') { this.phaseT += dt; if (this.phaseT > 2.8) this.finish(); }
    if (this.phase === 'done' && this.awayT > 6) this.reset();
    if (this.inviteT >= 0) { this.inviteT += dt; if (this.inviteT > 2.0) this.inviteT = -1; }
  }
  drawGround(ctx) {
    for (const L of this.lines) {
      const a = this.toWorld(-3, L.v), b = this.toWorld(this.L + 2, L.v);
      ctx.strokeStyle = COL.line; ctx.lineWidth = 0.18; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      const g = this.toWorld(this.L + 0.5, L.v);
      ctx.strokeStyle = COL.line; ctx.lineWidth = 0.35; ctx.beginPath(); const p1 = this.toWorld(this.L + 0.5, L.v - 2.5), p2 = this.toWorld(this.L + 0.5, L.v + 2.5); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
  }
  draw(ctx) {
    for (const L of this.lines) {
      const b = L.ball; const p = this.toWorld(b.u, b.v);
      // teacher's flag
      const tp = this.toWorld(L.teacher.u, L.teacher.v);
      Scene.add(tp.y + 0.01, (c) => { drawLocalKid(c, this, L.teacher); drawFlagPole(c, tp.x + 0.35 + (L.done ? Math.sin(this.t * 8) * 0.5 : 0.3), tp.y - 3.5, 1.8, L.cap === 'r' ? COL.red : '#fff', this.t * 3); });
      Scene.add(p.y + this.R * 0.3, (c) => drawBigBall(c, p.x, p.y, b.h, this.R, b.rot, L.cap === 'r' ? COL.red : '#f2f2ee'));
      for (const k of L.kids) Scene.add(kidLocalDepth(this, k), (c) => drawLocalKid(c, this, k));
    }
  }
}
