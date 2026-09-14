/** 紙吹雪・蒸気などの一時的なエフェクト。 */
import type { Ctx } from './paper';

export interface Confetti { x: number; y: number; vx: number; vy: number; rot: number; vr: number; color: string; born: number; life: number; w: number; h: number }
export interface Puff { x: number; y: number; born: number; r: number; drift: number }

export class Effects {
  confetti: Confetti[] = [];
  puffs: Puff[] = [];

  spawnConfetti(x: number, y: number, color: string, count: number, now: number, unit: number): void {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const sp = unit * (1.5 + Math.random() * 2.5);
      this.confetti.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 10,
        color, born: now, life: 0.9 + Math.random() * 0.5,
        w: unit * 0.16, h: unit * 0.1,
      });
    }
    if (this.confetti.length > 200) this.confetti.splice(0, this.confetti.length - 200);
  }

  spawnPuff(x: number, y: number, now: number, r: number): void {
    this.puffs.push({ x, y, born: now, r, drift: (Math.random() - 0.5) * r });
    if (this.puffs.length > 40) this.puffs.shift();
  }

  update(dt: number, now: number, gravity: number): void {
    for (const c of this.confetti) {
      c.vy += gravity * dt;
      c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
      c.vx *= 0.98;
    }
    this.confetti = this.confetti.filter((c) => now - c.born < c.life);
    this.puffs = this.puffs.filter((p) => now - p.born < 1.6);
  }

  draw(ctx: Ctx, now: number): void {
    for (const p of this.puffs) {
      const t = (now - p.born) / 1.6;
      ctx.globalAlpha = (1 - t) * 0.7;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x + p.drift * t, p.y - t * p.r * 4, p.r * (0.5 + t * 1.2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const c of this.confetti) {
      const t = (now - c.born) / c.life;
      ctx.save();
      ctx.globalAlpha = 1 - t * t;
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
