'use strict';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const smooth = (t) => t * t * (3 - 2 * t);
const ease = (t) => 1 - Math.pow(1 - t, 3);
function angLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * t;
}
function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}
// exponential approach helper (frame-rate independent)
const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

// Scene: painter's list sorted by world y (depth)
const Scene = {
  items: [],
  add(y, fn) { this.items.push({ y, fn }); },
  flush(ctx) {
    this.items.sort((a, b) => a.y - b.y);
    for (const it of this.items) it.fn(ctx);
    this.items.length = 0;
  }
};

// small particle system for dust / confetti
const Particles = {
  list: [],
  dust(x, y, n, spread) {
    for (let i = 0; i < n; i++) this.list.push({
      x: x + rand(-spread, spread), y: y + rand(-spread * 0.4, spread * 0.4), h: rand(0, 0.3),
      vx: rand(-1.5, 1.5), vy: rand(-0.5, 0.5), vh: rand(1, 3), r: rand(0.25, 0.55), t: 0, life: rand(0.4, 0.8), kind: 'dust'
    });
  },
  confetti(x, y, n) {
    for (let i = 0; i < n; i++) this.list.push({
      x: x + rand(-3, 3), y: y + rand(-1, 1), h: rand(2, 6), vx: rand(-2, 2), vy: rand(-0.5, 0.5), vh: rand(2, 6), r: rand(0.18, 0.3),
      t: 0, life: rand(1.5, 2.6), kind: 'conf', col: ['#ff5252', '#fff', '#ffd54f', '#4fc3f7', '#ff8a65'][randi(0, 4)], spin: rand(0, TAU)
    });
  },
  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.t += dt;
      if (p.t > p.life) { L.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.h += p.vh * dt;
      if (p.kind === 'dust') { p.vh -= 6 * dt; if (p.h < 0) { p.h = 0; p.vh = 0; } }
      else { p.vh -= 4 * dt; if (p.vh < -1.5) p.vh = -1.5; p.spin += dt * 4; if (p.h < 0) { p.h = 0; } }
    }
  },
  draw(ctx) {
    for (const p of this.list) {
      const a = 1 - p.t / p.life;
      if (p.kind === 'dust') {
        ctx.fillStyle = `rgba(214,194,150,${0.7 * a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y - p.h, p.r * (1 + p.t * 1.5), 0, TAU); ctx.fill();
      } else {
        ctx.fillStyle = p.col; ctx.globalAlpha = Math.min(1, a * 2);
        ctx.save(); ctx.translate(p.x, p.y - p.h); ctx.rotate(p.spin);
        ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r); ctx.restore();
        ctx.globalAlpha = 1;
      }
    }
  }
};
