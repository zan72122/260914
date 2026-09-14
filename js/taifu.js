'use strict';
// 台風の目: four runners hold a long pole. Drag the pole; near the cone it pivots around it.
class Taifu extends Station {
  constructor() {
    super('taifu');
    this.cone = { u: 18, v: 0, wob: 0, done: false, spin: 0 };
    this.lane = -3; this.half = 3.0;
    this.pole = { u: 0, v: this.lane, phi: Math.PI / 2, h: 1.1, vu: 0, vv: 0 };
    this.target = { u: 0, v: this.lane };
    this.runners = [];
    for (let i = 0; i < 4; i++) { const k = makeKid(0, 0, 'w'); k.s = -2.25 + i * 1.5; k.pu = 0; k.pv = 0; this.runners.push(k); }
    this.column = [];
    for (let i = 0; i < 6; i++) { const k = makeKid(-3.5 - i * 2.0, this.lane, 'w', { bob: rand(0, TAU) }); k.fu = 1; k.fv = 0; this.column.push(k); }
    this.teacher = makeKid(-1, this.lane + 4.5, 't'); this.teacher.fu = 0.3; this.teacher.fv = -1;
    this.rail = false; this.acc = 0; this.railA = 0; this.railDir = 0;
    this.finale = null; this.dragging = false;
  }
  reset() {
    super.reset();
    Object.assign(this.pole, { u: 0, v: this.lane, phi: Math.PI / 2, h: 1.1 }); this.target = { u: 0, v: this.lane };
    this.cone.done = false; this.cone.spin = 0; this.rail = false; this.acc = 0; this.finale = null;
    for (const k of this.column) { k.crouch = 0; k.jumpT = -1; k.smile = false; }
    for (const k of this.runners) k.smile = false;
  }
  poleEnds() { const p = this.pole; const c = Math.cos(p.phi) * this.half, s = Math.sin(p.phi) * this.half; return [{ u: p.u - c, v: p.v - s }, { u: p.u + c, v: p.v + s }]; }
  hit(u, v) {
    if (this.phase === 'done' || this.finale) return false;
    const [a, b] = this.poleEnds(); // distance to segment
    const dx = b.u - a.u, dy = b.v - a.v, l2 = dx * dx + dy * dy; let t = ((u - a.u) * dx + (v - a.v) * dy) / l2; t = clamp(t, 0, 1);
    return dist(u, v, a.u + dx * t, a.v + dy * t) < 3.2;
  }
  down(u, v) { this.dragging = true; this.target = { u: this.pole.u, v: this.pole.v }; }
  move(u, v, du, dv) {
    if (!this.dragging || this.finale) return;
    if (this.phase === 'idle') { this.phase = 'play'; Audio2.whistle(false); }
    if (this.rail) {
      // the pole points from the cone toward the finger: wherever the finger circles, the runners circle
      const c = this.cone; const fd = dist(u, v, c.u, c.v);
      this.fingerFar = fd > 9.5;
      if (fd > 1.2) {
        const fa = Math.atan2(v - c.v, u - c.u); const da = angDiff(this.railA, fa) * 0.5;
        this.railA += da; this.acc += Math.abs(da);
        if (this.railDir === 0 && Math.abs(da) > 0.01) this.railDir = Math.sign(da);
      }
    } else {
      this.target.u = clamp(this.target.u + du, -2.5, 26); this.target.v = clamp(this.target.v + dv, -10, 8);
    }
  }
  up() { this.dragging = false; }
  update(dt) {
    super.update(dt);
    const p = this.pole, c = this.cone, t = this.t;
    const pu0 = p.u, pv0 = p.v;
    if (this.finale) {
      // automatic: pole runs down the column (kids jump), comes back over heads (kids duck), then done
      const f = this.finale; f.t += dt;
      const colEnd = this.column[this.column.length - 1].u - 2;
      if (f.stage === 0) { p.u = approach(p.u, colEnd, 1.6, dt); p.h = 0.5; p.phi = Math.PI / 2; p.v = this.lane; if (p.u < colEnd + 0.4) { f.stage = 1; f.t = 0; } }
      else if (f.stage === 1) { p.h = approach(p.h, 3.6, 6, dt); if (f.t > 0.7) { f.stage = 2; f.t = 0; } }
      else if (f.stage === 2) { p.u = approach(p.u, 0.5, 1.6, dt); p.h = 3.6; if (p.u > 0.1) { f.stage = 3; f.t = 0; p.h = 1.1; Audio2.whistle(true); Audio2.cheer(1, 3); const w = this.toWorld(0, this.lane); Particles.confetti(w.x, w.y, 40); for (const k of this.column) k.smile = true; for (const k of this.runners) k.smile = true; } }
      else if (f.stage === 3) { if (f.t > 3) this.finish(); }
      for (const k of this.column) {
        const near = Math.abs(p.u - k.u) < 1.3;
        if (f.stage === 0 && near && k.jumpT < 0 && !k.jumped) { k.jumpT = 0; k.jumped = true; Audio2.pop(650); }
        if (f.stage === 2) k.crouch = approach(k.crouch, Math.abs(p.u - k.u) < 2.6 ? 1 : 0, 10, dt); else k.crouch = approach(k.crouch, 0, 10, dt);
        if (f.stage === 3) { banzai(this, k, 3.6); if (k.jumpT < 0 && Math.random() < 0.04) k.jumpT = 0; }
      }
    } else {
      if (this.rail) {
        // ride around the cone at a fixed radius
        p.u = c.u + Math.cos(this.railA) * 4.0; p.v = c.v + Math.sin(this.railA) * 4.0; p.phi = this.railA;
        c.wob = Math.sin(t * 20) * 0.08 * Math.min(1, Math.abs(p.u - pu0) * 30 + Math.abs(p.v - pv0) * 30);
        // finger wandered off without finishing the lap: the runners finish it by themselves
        if (this.fingerFar || !this.dragging) { this.farT = (this.farT || 0) + dt; } else this.farT = 0;
        if (this.farT > 0.6) { const d = this.railDir || 1; this.railA += d * 3.5 * dt; this.acc += 3.5 * dt; }
        if (this.acc > Math.PI * 1.45) { this.rail = false; c.done = true; c.spin = 0; this.target = { u: p.u, v: p.v }; this.farT = 0; Audio2.ding(1600); Audio2.pop(400); }
      } else {
        const k = 1 - Math.exp(-9 * dt);
        p.u += (this.target.u - p.u) * k; p.v += (this.target.v - p.v) * k;
        const vu = p.u - pu0, vv = p.v - pv0, sp = Math.hypot(vu, vv) / Math.max(dt, 1e-3);
        if (sp > 0.6) { const want = Math.atan2(vv, vu) + Math.PI / 2; p.phi = angLerp(p.phi, want, 1 - Math.exp(-6 * dt)); }
        if (!c.done && dist(p.u, p.v, c.u, c.v) < 5.6 && this.dragging) {
          this.rail = true; this.railA = Math.atan2(p.v - c.v, p.u - c.u); this.acc = 0; this.railDir = 0; this.farT = 0; this.fingerFar = false;
        }
        if (c.done && p.u < 1.2 && Math.abs(p.v - this.lane) < 3) { this.finale = { stage: 0, t: 0 }; this.dragging = false; for (const kd of this.column) kd.jumped = false; }
        c.wob = approach(c.wob, 0, 8, dt);
      }
      if (c.done) c.spin += dt;
      // idle hint: pole bobs slightly in runners' hands; column looks at the cone
      if (this.phase === 'idle') { p.h = 1.1 + Math.sin(t * 2.5) * 0.08; if (this.inviteT >= 0) p.h += Math.abs(Math.sin(this.inviteT * 8)) * 0.9 * (1 - this.inviteT / 1.6); }
      for (const k of this.column) { k.fu = 1; k.fv = 0; const d = dist(p.u, p.v, k.u, k.v); if (d < 14 && this.phase === 'play') { k.fu = (p.u - k.u) / d; k.fv = (p.v - k.v) / d; } k.crouch = 0; }
    }
    // runners follow pole attachment points
    const cs = Math.cos(p.phi), sn = Math.sin(p.phi);
    for (const k of this.runners) {
      const tu = p.u + cs * k.s, tv = p.v + sn * k.s;
      const ou = k.u, ov = k.v;
      k.u = approach(k.u, tu, 22, dt); k.v = approach(k.v, tv, 22, dt);
      const sp = Math.hypot(k.u - ou, k.v - ov) / Math.max(dt, 1e-3);
      k.run = approach(k.run, clamp(sp / 6, 0, 1), 8, dt); k.phase += dt * (6 + sp * 1.6);
      if (sp > 0.5) { const l = Math.hypot(k.u - ou, k.v - ov); k.fu = lerp(k.fu, (k.u - ou) / l, 0.25); k.fv = lerp(k.fv, (k.v - ov) / l, 0.25); }
      else if (this.phase === 'idle') { k.fu = lerp(k.fu, 1, 0.1); k.fv = lerp(k.fv, 0, 0.1); }
      k.armL = { u: p.u + cs * (k.s - 0.4), v: p.v + sn * (k.s - 0.4), h: p.h }; k.armR = { u: p.u + cs * (k.s + 0.4), v: p.v + sn * (k.s + 0.4), h: p.h };
      if (sp > 4 && Math.random() < dt * 8) { const w = this.toWorld(k.u, k.v); Particles.dust(w.x, w.y, 1, 0.4); }
      tickJump(k, dt);
    }
    for (const k of this.column) tickJump(k, dt);
    // teacher watches the pole
    const tc = this.teacher; const d = dist(p.u, p.v, tc.u, tc.v); tc.fu = (p.u - tc.u) / d; tc.fv = (p.v - tc.v) / d;
    tc.armR = this.phase === 'idle' ? { u: tc.u + 0.4, v: tc.v, h: 3.5 } : null;
    if (this.phase === 'done' && this.awayT > 6) this.reset();
    if (this.inviteT >= 0) { this.inviteT += dt; if (this.inviteT > 1.6) this.inviteT = -1; }
  }
  drawGround(ctx) {
    // start line and a faint loop around the cone
    const a = this.toWorld(0, this.lane - 4.5), b = this.toWorld(0, this.lane + 4.5);
    ctx.strokeStyle = COL.line; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    const c = this.toWorld(this.cone.u, this.cone.v);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.15; ctx.beginPath(); ctx.arc(c.x, c.y, 4.2, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.035)'; ctx.beginPath(); ctx.arc(c.x, c.y, 6.5, 0, TAU); ctx.fill();
  }
  draw(ctx) {
    const c = this.toWorld(this.cone.u, this.cone.v);
    Scene.add(c.y, (x) => { drawCone(x, c.x, c.y, this.cone.wob); if (this.cone.done) { x.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { const a = this.cone.spin * 3 + i * TAU / 3; x.beginPath(); x.arc(c.x + Math.cos(a) * 1.4, c.y - 3.2 + Math.sin(a) * 0.5, 0.22, 0, TAU); x.fill(); } } });
    const [a, b] = this.poleEnds(); const wa = this.toWorld(a.u, a.v), wb = this.toWorld(b.u, b.v);
    Scene.add(Math.max(wa.y, wb.y) + 0.3, (x) => drawPole(x, wa.x, wa.y, wb.x, wb.y, this.pole.h));
    for (const k of this.runners) Scene.add(kidLocalDepth(this, k), (x) => drawLocalKid(x, this, k));
    for (const k of this.column) Scene.add(kidLocalDepth(this, k), (x) => drawLocalKid(x, this, k));
    Scene.add(kidLocalDepth(this, this.teacher), (x) => drawLocalKid(x, this, this.teacher));
  }
}
