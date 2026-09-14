'use strict';
// A Station is one spot of the playground. It owns local coordinates (u along its axis, v perpendicular).
// Everything about an event's state lives in local coordinates, so rotating the device only moves the anchor.
class Station {
  constructor(name) {
    this.name = name;
    this.ax = 0; this.ay = 0; this.ux = 1; this.uy = 0; // anchor + axis
    this.bounds = { cx: 0, cy: 0, hw: 10, hh: 10 };
    this.phase = 'idle';   // idle | play | done
    this.doneT = 0;        // seconds since done
    this.awayT = 0;        // seconds since camera left after finishing
    this.inviteT = -1;     // >=0 while performing an invitation gesture
    this.t = 0;
    this.active = false;   // pointer engaged
    this.focused = false;  // camera is on this station
  }
  // orientation layout: set anchor/axis/bounds
  setLayout(ax, ay, ux, uy, hw, hh, cx, cy) {
    this.ax = ax; this.ay = ay; this.ux = ux; this.uy = uy;
    this.px = -uy; this.py = ux;
    this.bounds = { cx: cx === undefined ? ax : cx, cy: cy === undefined ? ay : cy, hw, hh };
  }
  toWorld(u, v) { return { x: this.ax + this.ux * u + this.px * v, y: this.ay + this.uy * u + this.py * v }; }
  toLocal(x, y) { const dx = x - this.ax, dy = y - this.ay; return { u: dx * this.ux + dy * this.uy, v: dx * this.px + dy * this.py }; }
  worldDir(du, dv) { return { x: this.ux * du + this.px * dv, y: this.uy * du + this.py * dv }; }
  // facing vector in world from local direction
  face(du, dv) { const d = this.worldDir(du, dv); const l = Math.hypot(d.x, d.y) || 1; return { fx: d.x / l, fy: d.y / l }; }
  // world y of a local point (for depth sorting)
  depth(u, v) { return this.ay + this.uy * u + this.py * v; }
  hit(u, v, zoom) { return false; } // override: returns true if the pointer at local u,v should engage this station
  down(u, v) {} move(u, v, du, dv) {} up(u, v, vel) {}
  update(dt) { this.t += dt; if (this.phase === 'done') this.doneT += dt; if (this.phase === 'done' && !this.focused) this.awayT += dt; }
  drawGround(ctx) {}
  draw(ctx, cam) {}
  invite() { this.inviteT = 0; }
  finish() { if (this.phase !== 'done') { this.phase = 'done'; this.doneT = 0; this.awayT = 0; } }
  reset() { this.phase = 'idle'; this.doneT = 0; this.awayT = 0; }
  isBusy() { return this.phase === 'play'; }
}

// helper: a kid record with simple "go to" locomotion, shared by stations
function makeKid(u, v, cap, opts = {}) {
  return Object.assign({ u, v, hu: u, hv: v, cap, h: 0, phase: rand(0, TAU), run: 0, crouch: 0, fu: 1, fv: 0, lean: { u: 0, v: 0 }, armL: null, armR: null, speed: 7, smile: false, shout: false, jumpT: -1 }, opts);
}
// move a kid toward (tu,tv); returns true if arrived
function kidGo(k, tu, tv, dt, speed) {
  const dx = tu - k.u, dy = tv - k.v, d = Math.hypot(dx, dy);
  const sp = speed || k.speed;
  if (d < 0.05) { k.run = approach(k.run, 0, 12, dt); return true; }
  const step = Math.min(d, sp * dt);
  k.u += dx / d * step; k.v += dy / d * step;
  k.fu = lerp(k.fu, dx / d, 0.3); k.fv = lerp(k.fv, dy / d, 0.3);
  k.run = approach(k.run, 1, 10, dt); k.phase += dt * 14;
  return d < 0.2;
}
// kid draw wrapper: local -> world
function drawLocalKid(ctx, st, k, extra) {
  const w = st.toWorld(k.u, k.v);
  const f = st.face(k.fu, k.fv);
  let armL = null, armR = null;
  if (k.armL) { const p = st.toWorld(k.armL.u, k.armL.v); armL = { x: p.x, y: p.y - (k.armL.h || 0), open: k.armL.open }; }
  if (k.armR) { const p = st.toWorld(k.armR.u, k.armR.v); armR = { x: p.x, y: p.y - (k.armR.h || 0), open: k.armR.open }; }
  const lw = st.worldDir(k.lean.u, k.lean.v);
  let jumpH = 0;
  if (k.jumpT >= 0) { jumpH = Math.sin(Math.min(1, k.jumpT / 0.5) * Math.PI) * 1.4; }
  drawKid(ctx, Object.assign({ x: w.x, y: w.y, h: (k.h || 0) + jumpH, fx: f.fx, fy: f.fy, lean: { x: lw.x, y: lw.y - Math.abs(k.lean.u) * 0.2 - Math.abs(k.lean.v) * 0.2 }, crouch: k.crouch, run: k.run, phase: k.phase, cap: k.cap, armL, armR, sit: k.sit, smile: k.smile, shout: k.shout }, extra || {}));
}
// raise both hands in a V (perpendicular to facing), the classic banzai
// A screen-horizontal offset expressed in station-local coordinates (bodies are always upright on screen).
function xOff(st, dx) { return { u: dx * st.ux, v: dx * st.px }; }
function banzai(st, k, h = 3.5, spread = 0.95) {
  const o = xOff(st, spread);
  k.armL = { u: k.u - o.u, v: k.v - o.v, h }; k.armR = { u: k.u + o.u, v: k.v + o.v, h };
}
function tickJump(k, dt) { if (k.jumpT >= 0) { k.jumpT += dt; if (k.jumpT > 0.5) k.jumpT = -1; } }
function kidLocalDepth(st, k) { return st.depth(k.u, k.v); }
