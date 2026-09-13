// Tiny particle system: smoke, dust, confetti, sparkles.
export class FX {
  constructor() { this.ps = []; }
  smoke(x, y, size, dir = { x: 0, y: -1 }, n = 1) {
    for (let i = 0; i < n; i++) this.ps.push({
      k: 'smoke', x, y, vx: dir.x * size * 0.6 + (Math.random() - 0.5) * size * 0.4, vy: dir.y * size * 0.6 - size * 0.4,
      r: size * (0.25 + Math.random() * 0.15), life: 1, decay: 0.55 + Math.random() * 0.3,
    });
  }
  dust(x, y, size, n = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.ps.push({ k: 'dust', x, y, vx: Math.cos(a) * size * 1.2, vy: Math.sin(a) * size * 1.2 - size * 0.5, r: size * (0.1 + Math.random() * 0.12), life: 1, decay: 1.6 });
    }
  }
  sparkle(x, y, size, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      this.ps.push({ k: 'spark', x, y, vx: Math.cos(a) * size * 2, vy: Math.sin(a) * size * 2, r: size * 0.12, life: 1, decay: 1.8, rot: Math.random() * 6 });
    }
  }
  confetti(x, y, size, n = 40) {
    const cols = ['#e8503a', '#3a7be8', '#f2c230', '#63c46f', '#ff8fd6', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const sp = size * (3 + Math.random() * 5);
      this.ps.push({ k: 'conf', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: size * (0.08 + Math.random() * 0.08), life: 1, decay: 0.35 + Math.random() * 0.2, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, col: cols[i % cols.length], g: size * 8 });
    }
  }
  update(dt) {
    for (const p of this.ps) {
      p.life -= p.decay * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.k === 'smoke') { p.r += p.r * 0.9 * dt; p.vx *= 0.98; }
      if (p.k === 'conf') { p.vy += p.g * dt; p.vx *= 0.99; p.rot += p.vr * dt; }
      if (p.k === 'dust') { p.vx *= 0.9; p.vy *= 0.9; p.r += p.r * 0.8 * dt; }
      if (p.k === 'spark') { p.vx *= 0.93; p.vy *= 0.93; p.rot += 8 * dt; }
    }
    this.ps = this.ps.filter((p) => p.life > 0);
  }
  draw(ctx) {
    for (const p of this.ps) {
      const a = Math.max(0, Math.min(1, p.life));
      ctx.save();
      ctx.globalAlpha = a;
      if (p.k === 'smoke') {
        ctx.fillStyle = '#f4f4f8';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = a * 0.5; ctx.strokeStyle = '#c8c8d2'; ctx.lineWidth = 1.5; ctx.stroke();
      } else if (p.k === 'dust') {
        ctx.fillStyle = '#d8c690';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      } else if (p.k === 'spark') {
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = '#fff2a8';
        ctx.beginPath();
        for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.moveTo(0, 0); ctx.lineTo(p.r * 0.4, p.r * 0.4); ctx.lineTo(0, p.r * 2.2); ctx.lineTo(-p.r * 0.4, p.r * 0.4); }
        ctx.fill();
      } else if (p.k === 'conf') {
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.col;
        ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2);
      }
      ctx.restore();
    }
  }
}
