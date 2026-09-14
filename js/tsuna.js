'use strict';
// 綱引き: drag the rope toward your side (or just hold it). Tension, lean, dust and the centre ribbon tell the story.
class Tsuna extends Station {
  constructor() {
    super('tsuna');
    this.m = 0; this.tension = 0.25; this.pull = 0; this.rival = 1.6; this.elapsed = 0; this.holdT = -1; this.hold = false;
    this.ours = []; this.theirs = [];
    for (let i = 0; i < 6; i++) { this.ours.push(makeKid(3 + i * 2, (i % 2 ? 0.9 : -0.9), 'w', { bob: rand(0, TAU) })); this.theirs.push(makeKid(-3 - i * 2, (i % 2 ? 0.9 : -0.9), 'r', { bob: rand(0, TAU) })); }
    this.teacher = makeKid(0, -4.5, 't'); this.vel = 0; this.result = null; this.phaseT = 0;
  }
  reset() { super.reset(); this.m = 0; this.tension = 0.25; this.pull = 0; this.rival = 1.6; this.elapsed = 0; this.result = null; this.hold = false; for (const k of [...this.ours, ...this.theirs]) { k.sit = false; k.crouch = 0; k.smile = false; k.jumpT = -1; } }
  hit(u, v) { if (this.phase === 'done' || this.result) return false; return Math.abs(v) < 3.6 && Math.abs(u - this.m) < 16; }
  down(u, v) { this.hold = true; this.holdT = 0; if (this.phase === 'idle') { this.phase = 'play'; Audio2.whistle(false); } }
  move(u, v, du, dv) { if (!this.hold) return; this.pull += Math.max(-du * 0.35, du) * 1.1; this.holdT = 0; }
  up() { this.hold = false; }
  update(dt) {
    super.update(dt);
    const t = this.t;
    if (this.phase === 'play' && !this.result) {
      this.elapsed += dt;
      if (this.hold) { this.holdT += dt; if (this.holdT > 0.15) this.pull += 3.2 * dt; }
      this.pull = approach(this.pull, 0, 4, dt);
      this.rival = Math.max(0.5, 1.7 - this.elapsed * 0.05) + Math.sin(t * 1.7) * 0.5 + Math.sin(t * 5.3) * 0.2;
      const net = this.pull * 1.4 - this.rival * (this.m > -3.0 ? 1 : 0);
      this.vel = approach(this.vel, net * 0.9, 6, dt);
      this.m = clamp(this.m + this.vel * dt, -3.5, 5.2);
      this.tension = approach(this.tension, clamp(0.45 + this.pull * 0.4 + Math.abs(this.vel) * 0.1, 0.35, 1), 5, dt);
      if (Math.abs(this.vel) > 0.6 && Math.random() < dt * 20) {
        const list = this.vel > 0 ? this.theirs : this.ours; const k = list[randi(0, list.length - 1)]; const w = this.toWorld(k.u + this.m, k.v); Particles.dust(w.x, w.y, 2, 0.6);
      }
      if (this.m >= 5.0) { this.result = 'win'; this.phaseT = 0; Audio2.whistle(true); Audio2.cheer(1, 3.5); const w = this.toWorld(6, 0); Particles.confetti(w.x, w.y, 50); }
    } else if (this.result) {
      this.phaseT += dt; this.tension = approach(this.tension, 0.05, 3, dt); this.vel = 0;
      if (this.phaseT > 3.4) this.finish();
    } else {
      this.tension = 0.28 + Math.sin(t * 1.5) * 0.04;
      if (this.inviteT >= 0) this.tension += Math.abs(Math.sin(this.inviteT * 6)) * 0.45 * (1 - this.inviteT / 1.6);
    }
    const lean = 0.35 + this.tension * 0.7;
    for (const list of [this.ours, this.theirs]) {
      const dir = list === this.ours ? 1 : -1;
      for (const k of list) {
        tickJump(k, dt);
        const wob = Math.sin(t * 6 + k.bob) * 0.06 * this.tension;
        const ku = k.u + this.m; // world-local position of the kid (kids move with the rope)
        if (this.result) {
          const won = list === this.ours;
          if (won) { k.sit = true; k.lean = { u: -0.2 * dir, v: 0 }; k.crouch = 0; k.smile = true; k.fu = -dir; k.fv = 0.4; const kk = Object.assign({}, k, { u: ku }); banzai(this, kk, 3.2); k.armL = kk.armL; k.armR = kk.armR; if (k.jumpT < 0 && Math.random() < 0.02) k.jumpT = 0; }
          else { k.crouch = 1; k.lean = { u: 0.9 * -dir, v: 0 }; k.armL = { u: ku - dir * 1.2 - 0.5, v: k.v, h: 0.1 }; k.armR = { u: ku - dir * 1.2 + 0.5, v: k.v, h: 0.1 }; k.fu = -dir; k.fv = 0.5; }
        } else {
          k.sit = false; k.lean = { u: dir * lean + wob, v: 0 }; k.crouch = 0.2 + this.tension * 0.35; k.fu = -dir; k.fv = 0.35; k.shout = this.tension > 0.7;
          // hands on the rope
          k.armL = { u: ku - dir * 1.4, v: 0, h: 1.1 - this.ropeSag(ku - dir * 1.4) * 0.3 }; k.armR = { u: ku - dir * 0.6, v: 0, h: 1.1 - this.ropeSag(ku - dir * 0.6) * 0.3 };
          if (this.inviteT >= 0 && list === this.ours) k.lean.u += Math.sin(this.inviteT * 8) * 0.25;
        }
      }
    }
    const tc = this.teacher; tc.fu = 0; tc.fv = 1;
    if (this.phase === 'idle') tc.armR = { u: tc.u + 0.5, v: tc.v, h: 3.6 }; else if (this.result) { tc.armR = { u: tc.u + 1.6, v: tc.v + 0.3, h: 2.6 }; } else tc.armR = null;
    if (this.phase === 'done' && this.awayT > 6) this.reset();
    if (this.inviteT >= 0) { this.inviteT += dt; if (this.inviteT > 1.6) this.inviteT = -1; }
  }
  ropeSag(u) { const L = 30; const x = (u - this.m) / (L / 2); return (1 - this.tension) * 1.3 * Math.max(0, 1 - x * x); }
  drawGround(ctx) {
    const c1 = this.toWorld(0, -3.5), c2 = this.toWorld(0, 3.5);
    ctx.strokeStyle = COL.line; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.stroke();
    for (const s of [-5, 5]) { const a = this.toWorld(s, -2.5), b = this.toWorld(s, 2.5); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    // scuffed sand under the teams
    ctx.fillStyle = 'rgba(0,0,0,0.035)'; const p = this.toWorld(this.m, 0); const ang = Math.atan2(this.uy, this.ux);
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 16, 3.5, ang, 0, TAU); ctx.fill();
  }
  draw(ctx) {
    // rope with sag (drawn as polyline in world, sag applied on screen-vertical)
    const N = 30, L = 30; const pts = [];
    for (let i = 0; i <= N; i++) { const u = -L / 2 + (i / N) * L + this.m; const w = this.toWorld(u, 0); pts.push({ x: w.x, y: w.y, h: 1.1 - this.ropeSag(u) * 0.75 }); }
    const y0 = this.toWorld(this.m, 0).y;
    Scene.add(y0 + 0.4, (c) => {
      c.strokeStyle = 'rgba(60,40,20,0.15)'; c.lineWidth = 0.5; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke();
      c.strokeStyle = '#b48a5a'; c.lineWidth = 0.55; c.lineCap = 'round'; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p.x, p.y - p.h) : c.moveTo(p.x, p.y - p.h)); c.stroke();
      c.strokeStyle = 'rgba(90,60,30,0.55)'; c.lineWidth = 0.12; c.setLineDash([0.35, 0.35]); c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p.x, p.y - p.h) : c.moveTo(p.x, p.y - p.h)); c.stroke(); c.setLineDash([]);
      // centre ribbon
      const cw = this.toWorld(this.m, 0); const hh = 1.1 - this.ropeSag(this.m) * 0.75;
      c.fillStyle = COL.red; c.beginPath(); c.moveTo(cw.x - 0.3, cw.y - hh); c.lineTo(cw.x + 0.3, cw.y - hh); c.lineTo(cw.x + 0.45 + Math.sin(this.t * 5) * 0.15, cw.y - hh + 1.5); c.lineTo(cw.x - 0.45 + Math.sin(this.t * 5) * 0.15, cw.y - hh + 1.5); c.closePath(); c.fill();
    });
    for (const k of [...this.ours, ...this.theirs]) {
      const shifted = Object.assign({}, k, { u: k.u + this.m });
      Scene.add(kidLocalDepth(this, shifted), (c) => drawLocalKid(c, this, shifted));
    }
    Scene.add(kidLocalDepth(this, this.teacher), (c) => drawLocalKid(c, this, this.teacher));
  }
}
