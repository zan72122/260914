// All drawing. Everything is procedural; no images, no text.
import { CELL_R } from './blob.js';

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeScenery(level) {
  const rnd = mulberry(level.seed);
  const far = [], near = [], grass = [];
  const [x0, x1] = level.bounds;
  for (let i = 0; i < 26; i++) {
    far.push({ x: x0 + rnd() * (x1 - x0) * 1.4, h: 120 + rnd() * 220, w: 40 + rnd() * 60, tilt: (rnd() - 0.5) * 0.3 });
  }
  for (let i = 0; i < 14; i++) {
    near.push({ x: x0 + rnd() * (x1 - x0) * 1.2, h: 60 + rnd() * 120, w: 26 + rnd() * 40, tilt: (rnd() - 0.5) * 0.4, hue: 20 + rnd() * 30 });
  }
  for (let i = 0; i < 90; i++) {
    grass.push({ x: x0 + rnd() * (x1 - x0), h: 8 + rnd() * 18, lean: (rnd() - 0.5) * 0.8, ph: rnd() * 6.28 });
  }
  const fireflies = [];
  for (let i = 0; i < 24; i++) fireflies.push({ x: x0 + rnd() * (x1 - x0), y: -200 + rnd() * 700, ph: rnd() * 6.28, sp: 0.3 + rnd() * 0.5 });
  return { far, near, grass, fireflies };
}

// Y of the ground surface under x (topmost solid edge below y=-1000)
function groundYAt(polys, x) {
  let best = Infinity;
  for (const poly of polys) {
    for (const e of poly.edges) {
      if (e.ny > -0.2) continue; // only upward-facing edges
      const minx = Math.min(e.ax, e.bx), maxx = Math.max(e.ax, e.bx);
      if (x < minx || x > maxx) continue;
      const t = e.dx !== 0 ? (x - e.ax) / e.dx : 0;
      const y = e.ay + e.dy * t;
      if (y < best) best = y;
    }
  }
  return best === Infinity ? 0 : best;
}

function mushroom(ctx, x, y, w, h, tilt, capColor, stemColor, spots) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.fillStyle = stemColor;
  ctx.beginPath();
  ctx.moveTo(-w * 0.22, 0);
  ctx.quadraticCurveTo(-w * 0.3, -h * 0.5, -w * 0.18, -h * 0.72);
  ctx.lineTo(w * 0.18, -h * 0.72);
  ctx.quadraticCurveTo(w * 0.3, -h * 0.5, w * 0.22, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = capColor;
  ctx.beginPath();
  ctx.moveTo(-w * 0.5, -h * 0.66);
  ctx.quadraticCurveTo(-w * 0.55, -h * 1.05, 0, -h * 1.05);
  ctx.quadraticCurveTo(w * 0.55, -h * 1.05, w * 0.5, -h * 0.66);
  ctx.quadraticCurveTo(0, -h * 0.58, -w * 0.5, -h * 0.66);
  ctx.closePath();
  ctx.fill();
  if (spots) {
    ctx.fillStyle = spots;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc((i - 1) * w * 0.25, -h * (0.82 + (i % 2) * 0.08), w * 0.07, 0, 6.28);
      ctx.fill();
    }
  }
  ctx.restore();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.w = 1; this.h = 1; this.dpr = 1;
  }

  resize(w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  }

  spawnParticles(x, y, color, n, speed, life = 0.6, size = 3, grav = 300) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, s = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.3, life, t: life, color, size: size * (0.6 + Math.random() * 0.8), grav });
    }
  }

  updateParticles(dt) {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.t -= dt;
      if (p.t <= 0) { ps.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.vx *= 0.97; p.vy *= 0.97;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  // cam: {x, y, scale}. Returns world->screen helpers.
  begin(cam) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.cam = cam;
  }

  toScreen(x, y) {
    const c = this.cam;
    return { x: (x - c.x) * c.scale + this.w / 2, y: (y - c.y) * c.scale + this.h / 2 };
  }

  toWorld(sx, sy) {
    const c = this.cam;
    return { x: (sx - this.w / 2) / c.scale + c.x, y: (sy - this.h / 2) / c.scale + c.y };
  }

  worldTransform(parallax = 1) {
    const ctx = this.ctx, c = this.cam;
    ctx.setTransform(this.dpr * c.scale, 0, 0, this.dpr * c.scale,
      this.dpr * (this.w / 2 - c.x * parallax * c.scale), this.dpr * (this.h / 2 - c.y * c.scale));
  }

  drawBackground(t, scenery, polys, glowAmt = 0) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    const lift = glowAmt * 40;
    g.addColorStop(0, `rgb(${14 + lift},${42 + lift},${38 + lift})`);
    g.addColorStop(0.6, `rgb(${22 + lift},${70 + lift},${52 + lift})`);
    g.addColorStop(1, `rgb(${30 + lift},${88 + lift},${56 + lift})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);

    // Soft light shafts
    ctx.globalAlpha = 0.07;
    for (let i = 0; i < 4; i++) {
      const x = ((i * 0.27 + t * 0.01) % 1) * this.w;
      const sg = ctx.createLinearGradient(x, 0, x + 120, this.h);
      sg.addColorStop(0, '#ffffcc'); sg.addColorStop(1, 'rgba(255,255,200,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 90, 0); ctx.lineTo(x + 260, this.h); ctx.lineTo(x + 100, this.h); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Far mushrooms (parallax 0.4)
    this.worldTransform(0.4);
    const baseY = groundYAt(polys, this.cam.x) + 40;
    for (const m of scenery.far) {
      mushroom(ctx, m.x, baseY + 60, m.w, m.h, m.tilt, 'rgba(20,60,50,0.9)', 'rgba(16,52,44,0.9)', null);
    }
    // Near mushrooms (parallax 0.7)
    this.worldTransform(0.7);
    for (const m of scenery.near) {
      mushroom(ctx, m.x, baseY + 30, m.w, m.h, m.tilt, `hsl(${m.hue},45%,30%)`, 'hsl(40,25%,35%)', 'rgba(255,240,200,0.35)');
    }
    // Fireflies
    this.worldTransform(0.85);
    for (const f of scenery.fireflies) {
      const a = 0.35 + 0.35 * Math.sin(t * f.sp * 2 + f.ph);
      const fx = f.x + Math.sin(t * f.sp + f.ph) * 30, fy = f.y + Math.cos(t * f.sp * 0.7 + f.ph) * 20;
      ctx.fillStyle = `rgba(230,255,160,${a})`;
      ctx.beginPath(); ctx.arc(fx, fy, 3, 0, 6.28); ctx.fill();
    }
  }

  drawTerrain(t, polys, scenery) {
    const ctx = this.ctx;
    this.worldTransform(1);
    for (const poly of polys) {
      ctx.beginPath();
      poly.points.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.fillStyle = '#3a2a1e';
      ctx.fill();
      // mossy top edge: a thick soft stroke in green, clipped to polygon
      ctx.save();
      ctx.clip();
      ctx.lineWidth = 26;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#4f8a3a';
      ctx.stroke();
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#8fd15f';
      ctx.stroke();
      ctx.restore();
    }
    // Grass tufts on upward edges
    ctx.strokeStyle = '#a9e56f';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const gr of scenery.grass) {
      const y = groundYAt(polys, gr.x);
      if (y === 0) continue;
      const sway = Math.sin(t * 1.5 + gr.ph) * 0.25;
      ctx.beginPath();
      ctx.moveTo(gr.x, y + 2);
      ctx.quadraticCurveTo(gr.x + (gr.lean + sway) * gr.h, y - gr.h * 0.6, gr.x + (gr.lean + sway) * gr.h * 1.6, y - gr.h);
      ctx.stroke();
    }
  }

  drawGoal(t, goal, bloom) {
    // A glowing flower. `bloom` 0..1 opens it fully when reached.
    const ctx = this.ctx;
    this.worldTransform(1);
    const [gx, gy] = goal;
    const pulse = 0.85 + 0.15 * Math.sin(t * 2.2);
    const glowR = (60 + bloom * 120) * pulse;
    const rg = ctx.createRadialGradient(gx, gy - 30, 4, gx, gy - 30, glowR);
    rg.addColorStop(0, `rgba(255,230,140,${0.55 + bloom * 0.3})`);
    rg.addColorStop(0.5, 'rgba(255,190,120,0.18)');
    rg.addColorStop(1, 'rgba(255,190,120,0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(gx, gy - 30, glowR, 0, 6.28); ctx.fill();
    // stem
    ctx.strokeStyle = '#8fd15f'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(gx, gy + 2); ctx.quadraticCurveTo(gx + 6, gy - 14, gx, gy - 28); ctx.stroke();
    // petals
    const petals = 6, open = 0.55 + 0.45 * bloom + 0.05 * Math.sin(t * 2.2);
    ctx.save();
    ctx.translate(gx, gy - 30);
    ctx.rotate(t * 0.3);
    for (let i = 0; i < petals; i++) {
      ctx.rotate((Math.PI * 2) / petals);
      ctx.fillStyle = `rgba(255,${200 + bloom * 40},${140 + bloom * 60},0.95)`;
      ctx.beginPath();
      const ps = 1 + bloom * 0.9;
      ctx.ellipse(12 * open * ps, 0, 12 * open * ps, 6.5 * open * ps, 0, 0, 6.28);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#fff4b0';
    ctx.beginPath(); ctx.arc(gx, gy - 30, 6 + bloom * 3, 0, 6.28); ctx.fill();
  }

  drawBlob(t, blob, lookX, lookY, alpha = 1) {
    const ctx = this.ctx;
    this.worldTransform(1);
    ctx.globalAlpha = alpha;
    const breathe = 1 + 0.035 * Math.sin(t * 2.4);
    const rr = CELL_R * 1.75 * breathe;
    // Outline pass
    ctx.fillStyle = '#4c8f2c';
    for (const c of blob.cells) {
      const r = rr * (0.5 + 0.5 * c.age) + 4;
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, 6.28); ctx.fill();
    }
    // Body pass
    ctx.fillStyle = '#9ee450';
    for (const c of blob.cells) {
      const r = rr * (0.5 + 0.5 * c.age);
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, 6.28); ctx.fill();
    }
    // Inner glow highlights
    ctx.fillStyle = 'rgba(230,255,190,0.35)';
    for (const c of blob.cells) {
      const r = rr * 0.45 * c.age;
      ctx.beginPath(); ctx.arc(c.x - 3, c.y - 3, r, 0, 6.28); ctx.fill();
    }
    // Eyes near the centroid, looking toward lookX/lookY
    const n = blob.cells.length;
    if (n > 0) {
      let ex = blob.cx, ey = blob.cy;
      // choose eye anchor: a cell close to the centroid so eyes stay inside the body
      let best = null, bd = Infinity;
      for (const c of blob.cells) {
        const d = Math.hypot(c.x - blob.cx, c.y - (blob.cy - 6));
        if (d < bd) { bd = d; best = c; }
      }
      if (best) { ex = best.x; ey = best.y; }
      let dx = lookX - ex, dy = lookY - ey;
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl; dy /= dl;
      const blink = (Math.sin(t * 1.3) > 0.985) ? 0.15 : 1;
      for (const s of [-1, 1]) {
        const ox = ex + s * 9, oy = ey - 2;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(ox, oy, 5.5, 5.5 * blink, 0, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#1e2a20';
        ctx.beginPath(); ctx.ellipse(ox + dx * 2.2, oy + dy * 2.2, 3, 3 * blink, 0, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(ox + dx * 1.2 - 1, oy + dy * 1.2 - 1.2, 1.1, 0, 6.28); ctx.fill();
      }
      // cheeks
      ctx.fillStyle = 'rgba(255,170,150,0.35)';
      ctx.beginPath(); ctx.arc(ex - 15, ey + 5, 3.5, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.arc(ex + 15, ey + 5, 3.5, 0, 6.28); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawParticles() {
    const ctx = this.ctx;
    this.worldTransform(1);
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.t / p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.28); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Warm glow at the screen edge when the goal is off screen.
  drawEdgeGlow(t, goal) {
    const s = this.toScreen(goal[0], goal[1] - 30);
    const m = 40;
    if (s.x > -m && s.x < this.w + m && s.y > -m && s.y < this.h + m) return;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const cx = Math.max(0, Math.min(this.w, s.x)), cy = Math.max(0, Math.min(this.h, s.y));
    const pulse = 0.7 + 0.3 * Math.sin(t * 2.2);
    const r = 140 * pulse;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,225,140,0.55)');
    g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.28); ctx.fill();
  }

  // A silent demonstration: a light streak brushing the blob's back.
  drawHint(t, blob, phase) {
    if (phase < 0 || phase > 1) return;
    const ctx = this.ctx;
    this.worldTransform(1);
    const R = blob.radiusEstimate() + 14;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 1.35; // left side, top-left to bottom-left
    for (let i = 0; i < 10; i++) {
      const ph = Math.max(0, phase - i * 0.035);
      const a = a0 + (a1 - a0) * ph;
      const x = blob.cx + Math.cos(a) * R, y = blob.cy + Math.sin(a) * R;
      const alpha = (1 - i / 10) * Math.sin(phase * Math.PI);
      ctx.fillStyle = `rgba(255,255,220,${alpha * 0.8})`;
      ctx.beginPath(); ctx.arc(x, y, 10 - i * 0.6, 0, 6.28); ctx.fill();
    }
  }

  drawFingerHalo(points) {
    const ctx = this.ctx;
    this.worldTransform(1);
    for (const p of points) {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 34);
      g.addColorStop(0, 'rgba(255,255,230,0.35)');
      g.addColorStop(1, 'rgba(255,255,230,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, 34, 0, 6.28); ctx.fill();
    }
  }

  drawFade(alpha, color = '#0f2a22') {
    if (alpha <= 0) return;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalAlpha = 1;
  }
}
