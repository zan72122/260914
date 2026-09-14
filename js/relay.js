'use strict';
// リレー: the baton is the hero. Drag it from the tired incoming runner into the open hand of the next runner.
class Relay extends Station {
  constructor() {
    super('relay');
    this.lanes = [
      { v: 0, cap: 'w', player: true, col: '#f2b632' },
      { v: -3.2, cap: 'r', player: false, col: '#3aa3e0' }
    ];
    this.tapeU = 22; this.LEGS = 3;
    this.tape = { holders: [makeKid(this.tapeU, 4.5, 't'), makeKid(this.tapeU + 1.2, 6.0, 't')], state: 'aside', broken: 0, t: 0 };
    for (const L of this.lanes) this.setupLane(L, true);
    this.dragging = false; this.baton = null;
  }
  setupLane(L, first) {
    L.leg = first ? 1 : L.leg + 1;
    L.receiver = makeKid(first ? 0 : 3, first ? L.v : L.v + (L.player ? 7 : -7), L.cap); L.receiver.fu = 1; L.receiver.fv = 0; L.receiver.state = first ? 'wait' : 'enter';
    L.incoming = makeKid(first ? -22 : -34, L.v, L.cap); L.incoming.fu = 1; L.incoming.fv = 0; L.incoming.state = 'approach'; L.incoming.speed = 9;
    L.baton = { u: L.incoming.u + 1.0, v: L.v, h: 1.4, st: 'runner', ang: 0, t: 0 };
    L.runner = null; L.handT = 0; L.finishedT = -1;
  }
  reset() { super.reset(); for (const L of this.lanes) this.setupLane(L, true); this.tape = { holders: this.tape.holders, state: 'aside', broken: 0, t: 0 }; this.baton = null; }
  focusCenter() {
    const L = this.lanes[0]; let u = 1.5;
    if (L.runner && L.receiver.state === 'run') u = clamp(L.runner.u * 0.7, 1.5, L.leg === this.LEGS ? this.tapeU - 3 : 9);
    if (this.tape.state === 'broken') u = this.tapeU - 3;
    const w = this.toWorld(u, -1.2); return { x: w.x, y: w.y };
  }
  handPos(L) { const r = L.receiver; return { u: r.u - 1.05, v: r.v + 0.35, h: 1.25 }; }
  hit(u, v) { if (this.phase === 'done') return false; const b = this.lanes[0].baton; return b.st === 'runner' && dist(u, v, b.u, b.v) < 3.2; }
  down(u, v) { const L = this.lanes[0]; if (L.baton.st !== 'runner') return; this.dragging = true; L.baton.st = 'held'; L.baton.hu = u; L.baton.hv = v; Audio2.pop(520); if (this.phase === 'idle') { this.phase = 'play'; } }
  move(u, v, du, dv) { if (!this.dragging) return; const b = this.lanes[0].baton; b.hu = u; b.hv = v; b.vu = du; b.vv = dv; }
  up(u, v) {
    if (!this.dragging) return; this.dragging = false;
    const L = this.lanes[0], b = L.baton, hp = this.handPos(L); const d = dist(b.u, b.v, hp.u, hp.v);
    // generous: within reach, or released moving toward the hand -> glide into the hand
    const toward = (hp.u - b.u) * (b.vu || 0) + (hp.v - b.v) * (b.vv || 0) > 0;
    if (d < 3.4 || (d < 8 && toward)) { b.st = 'glide'; b.t = 0; b.from = { u: b.u, v: b.v, h: b.h }; }
    else { b.st = 'return'; b.t = 0; b.from = { u: b.u, v: b.v, h: b.h }; L.incoming.u += 0.8; }
  }
  handoff(L) {
    const b = L.baton, hp = this.handPos(L);
    b.st = 'receiver'; L.receiver.state = 'run'; L.receiver.speed = 0; L.incoming.state = 'stop'; L.runner = L.receiver; L.handT = 0;
    Audio2.pop(800); if (L.player) Audio2.steps(0.08);
    if (L.leg === this.LEGS && L.player) { this.tape.state = 'ready'; this.tape.t = 0; }
    if (L.player) { const r = this.lanes[1]; r.aiDelay = rand(0.8, 1.8); }
  }
  update(dt) {
    super.update(dt);
    const t = this.t;
    for (const L of this.lanes) {
      const inc = L.incoming, rec = L.receiver, b = L.baton;
      tickJump(inc, dt); tickJump(rec, dt);
      // incoming runner: sprint in, then jog in place just short of the receiver
      if (inc.state === 'approach') {
        const stopU = -2.4; const d = stopU - inc.u;
        const sp = d > 6 ? 9 : d > 0.3 ? 4 : 0;
        inc.u += Math.min(d, sp * dt); inc.run = approach(inc.run, sp > 0 ? 1 : 0.55, 6, dt); inc.phase += dt * (sp > 0 ? 14 : 9);
        inc.h = sp > 0 ? 0 : Math.abs(Math.sin(inc.phase * 0.5)) * 0.12;
        inc.fu = 1; inc.fv = 0; inc.lean = { u: 0.25, v: 0 };
        if (d <= 0.3 && !L.player && L.aiDelay !== undefined && b.st === 'runner') { L.aiDelay -= dt; if (L.aiDelay <= 0) { b.st = 'glide'; b.t = 0; b.from = { u: b.u, v: b.v, h: b.h }; L.aiDelay = undefined; } }
        if (sp > 4 && Math.random() < dt * 6) { const w = this.toWorld(inc.u, inc.v); Particles.dust(w.x, w.y, 1, 0.3); }
      } else if (inc.state === 'stop') {
        inc.run = approach(inc.run, 0, 4, dt); inc.phase += dt * 6; inc.lean = { u: 0, v: 0 }; inc.h = 0;
        inc.crouch = approach(inc.crouch, 0.35, 3, dt); inc.armL = { u: inc.u - 0.3, v: inc.v + 0.4, h: 0.9 }; inc.armR = { u: inc.u + 0.3, v: inc.v + 0.4, h: 0.9 }; // hands on knees
        inc.fu = 0.6; inc.fv = 0.8;
      }
      // baton
      if (b.st === 'runner') {
        b.u = inc.u + 1.0; b.v = inc.v + 0.25; b.h = 1.4 + (inc.h || 0); b.ang = 0.25;
        if (L.player && this.inviteT >= 0) { const s = Math.sin(Math.min(1, this.inviteT / 1.6) * Math.PI); b.h += s * 1.6; b.ang = 0.25 - s * 1.2; }
        inc.armR = { u: b.u, v: b.v, h: b.h }; inc.armL = null;
      } else if (b.st === 'held') {
        b.u = lerp(b.u, b.hu, 0.55); b.v = lerp(b.v, b.hv, 0.55); b.h = lerp(b.h, 1.4, 0.2);
        const d = dist(b.u, b.v, inc.u + 1.0, inc.v);
        inc.armR = d < 2.2 ? { u: b.u, v: b.v, h: b.h } : { u: inc.u + 1.5, v: inc.v + 0.3, h: 1.4 };
        b.ang = angLerp(b.ang, Math.atan2(b.hv - b.v, b.hu - b.u) * 0.3, 0.2);
      } else if (b.st === 'glide' || b.st === 'return') {
        b.t += dt; const k = smooth(Math.min(1, b.t / 0.35));
        const to = b.st === 'glide' ? this.handPos(L) : { u: inc.u + 1.0, v: inc.v + 0.25, h: 1.4 };
        b.u = lerp(b.from.u, to.u, k); b.v = lerp(b.from.v, to.v, k); b.h = lerp(b.from.h, to.h, k) + Math.sin(k * Math.PI) * 0.5;
        if (k >= 1) { if (b.st === 'glide') this.handoff(L); else { b.st = 'runner'; Audio2.pop(350); } }
      } else if (b.st === 'receiver') {
        const r = L.runner; b.u = r.u + 1.0 + Math.sin(r.phase) * 0.3 * r.run; b.v = r.v + 0.3; b.h = 1.4 + Math.abs(Math.sin(r.phase)) * 0.3 * r.run; b.ang = 0.4;
      }
      // receiver
      if (rec.state === 'enter') { rec.armL = rec.armR = null; if (kidGo(rec, 0, L.v, dt, 5)) rec.state = 'wait'; }
      else if (rec.state === 'wait') {
        rec.fu = 1; rec.fv = 0; rec.lean = { u: 0.3, v: 0 }; rec.crouch = 0.25;
        const hp = this.handPos(L);
        // the open hand reaches toward the approaching baton (IK)
        let reach = 0; if (b.st === 'held' || b.st === 'glide') { const d = dist(b.u, b.v, hp.u, hp.v); reach = clamp(1 - d / 6, 0, 1); }
        const w = Math.sin(t * 5) * 0.12 * (1 - reach);
        rec.armR = { u: hp.u - reach * 0.5 + (b.st === 'held' ? (b.u - hp.u) * reach * 0.4 : 0), v: hp.v + w + (b.st === 'held' ? (b.v - hp.v) * reach * 0.4 : 0), h: hp.h + reach * 0.2, open: true };
        rec.armL = { u: rec.u + 1.0, v: rec.v - 0.3, h: 1.6 };
        // glance back over the shoulder
        rec.fu = 0.2; rec.fv = 0.98; rec.run = 0.12; rec.phase += dt * 3;
        if (this.inviteT >= 0 && L.player) { rec.armR.v += Math.sin(this.inviteT * 14) * 0.35; }
      } else if (rec.state === 'run') {
        rec.speed = approach(rec.speed, L.player ? 10 : 9.2, 2.2, dt); rec.u += rec.speed * dt; rec.crouch = 0; rec.lean = { u: 0.3, v: 0 };
        rec.run = approach(rec.run, 1, 5, dt); rec.phase += dt * (8 + rec.speed * 0.9); rec.fu = 1; rec.fv = 0; rec.armL = rec.armR = null;
        if (rec.speed > 5 && Math.random() < dt * 6) { const w = this.toWorld(rec.u, rec.v); Particles.dust(w.x, w.y, 1, 0.3); }
        // final leg: through the tape
        if (L.player && L.leg === this.LEGS && this.tape.state === 'up' && rec.u > this.tapeU - 0.5) { this.tape.state = 'broken'; this.tape.t = 0; Audio2.whistle(true); Audio2.cheer(1, 3.5); const w = this.toWorld(this.tapeU, L.v); Particles.confetti(w.x, w.y, 50); rec.smile = true; this.phase = 'result'; this.phaseT = 0; }
        if (L.player && L.leg === this.LEGS && this.tape.state === 'broken') { banzai(this, rec, 3.6); rec.speed = approach(rec.speed, 0, 1.5, dt); rec.run = clamp(rec.speed / 6, 0, 1); }
        if (rec.u > 40 && L.leg < this.LEGS) { this.setupLane(L, false); if (!L.player) L.aiDelay = undefined; }
        if (rec.u > 40 && L.leg >= this.LEGS && !L.player) { rec.state = 'stop'; }
      }
    }
    // tape holders
    const T = this.tape;
    for (let i = 0; i < 2; i++) {
      const h = T.holders[i]; tickJump(h, dt);
      if (T.state === 'aside') { kidGo(h, this.tapeU + i * 1.2, 4.5 + i * 1.5, dt, 4); h.fu = -1; h.fv = 0; h.armL = { u: h.u - 0.6, v: h.v + 0.2, h: 1.2 }; h.armR = { u: h.u + 0.6, v: h.v + 0.2, h: 1.2 }; }
      else if (T.state === 'ready') { const arrived = kidGo(h, this.tapeU, i === 0 ? -2.0 : 2.4, dt, 5); if (arrived) { h.fu = i === 0 ? 0.0 : 0.0; h.fv = i === 0 ? 1 : -1; } h.armL = { u: this.tapeU, v: h.v + (i === 0 ? 1 : -1) * 0.8, h: 1.6 }; h.armR = { u: this.tapeU, v: h.v + (i === 0 ? 1 : -1) * 0.8, h: 1.6 }; if (i === 1 && arrived && T.state === 'ready') { T.t += dt; if (T.t > 0.2) T.state = 'up'; } }
      else if (T.state === 'up') { h.fu = i === 0 ? 0 : 0; h.fv = i === 0 ? 1 : -1; h.armL = { u: this.tapeU, v: h.v + (i === 0 ? 1 : -1) * 0.8, h: 1.6 }; h.armR = { u: this.tapeU, v: h.v + (i === 0 ? 1 : -1) * 0.8, h: 1.6 }; }
      else if (T.state === 'broken') { T.t += dt; h.armL = { u: this.tapeU + 0.3, v: h.v + (i === 0 ? 1 : -1) * 0.8, h: 3.4 }; h.armR = { u: this.tapeU - 0.4, v: h.v + (i === 0 ? 1 : -1) * 0.9, h: 3.2 }; h.smile = true; }
    }
    if (this.phase === 'result') { this.phaseT += dt; if (this.phaseT > 3.2) this.finish(); }
    if (this.phase === 'done' && this.awayT > 6) this.reset();
    if (this.inviteT >= 0) { this.inviteT += dt; if (this.inviteT > 1.6) this.inviteT = -1; }
  }
  drawGround(ctx) {
    // two lanes, takeover zone, finish line
    for (let i = 0; i < 3; i++) {
      const v = -4.8 + i * 3.2; const a = this.toWorld(-36, v), b = this.toWorld(36, v);
      ctx.strokeStyle = COL.line; ctx.lineWidth = 0.15; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (const u of [-6, 4]) { const a = this.toWorld(u, -4.8), b = this.toWorld(u, 1.6); ctx.strokeStyle = 'rgba(255,220,80,0.8)'; ctx.lineWidth = 0.2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    const fa = this.toWorld(this.tapeU, -4.8), fb = this.toWorld(this.tapeU, 1.6);
    ctx.strokeStyle = COL.line; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(fa.x, fa.y); ctx.lineTo(fb.x, fb.y); ctx.stroke();
  }
  draw(ctx) {
    for (const L of this.lanes) {
      const inc = L.incoming, rec = L.receiver, b = L.baton;
      Scene.add(kidLocalDepth(this, inc), (c) => drawLocalKid(c, this, inc));
      Scene.add(kidLocalDepth(this, rec) + (rec.state === 'run' ? 0.02 : 0), (c) => drawLocalKid(c, this, rec));
      const p = this.toWorld(b.u, b.v);
      Scene.add(p.y + 0.3, (c) => drawBaton(c, p.x, p.y, b.h, b.ang + Math.atan2(this.uy, this.ux), L.col));
    }
    const T = this.tape;
    for (const h of T.holders) Scene.add(kidLocalDepth(this, h), (c) => drawLocalKid(c, this, h));
    if (T.state === 'up' || T.state === 'ready') {
      const a = this.toWorld(this.tapeU, T.holders[0].v + 0.8), b = this.toWorld(this.tapeU, T.holders[1].v - 0.8);
      Scene.add(Math.max(a.y, b.y) + 0.5, (c) => { c.strokeStyle = '#fff'; c.lineWidth = 0.35; c.beginPath(); c.moveTo(a.x, a.y - 1.6); c.lineTo(b.x, b.y - 1.6); c.stroke(); c.strokeStyle = COL.red; c.lineWidth = 0.1; c.stroke(); });
    } else if (T.state === 'broken') {
      const k = Math.min(1, T.t / 0.8);
      for (let i = 0; i < 2; i++) {
        const h = T.holders[i]; const a = this.toWorld(this.tapeU + 0.3, h.v + (i === 0 ? 1 : -1) * 0.8); const e = this.toWorld(this.tapeU + 1.2 + k * 1.0, h.v + (i === 0 ? 1 : -1) * (0.8 + 1.6 * k));
        Scene.add(a.y + 0.5, (c) => { c.strokeStyle = '#fff'; c.lineWidth = 0.35; c.beginPath(); c.moveTo(a.x, a.y - 3.4); c.quadraticCurveTo(lerp(a.x, e.x, 0.5) + Math.sin(this.t * 7 + i) * 0.4, a.y - 2.2, e.x, e.y - 0.6 * (1 - k)); c.stroke(); });
      }
    }
  }
}
