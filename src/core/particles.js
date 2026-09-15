/**
 * particles.js — pooled particle system (max 600, DESIGN §5.5.9 perf rules).
 *
 * The SHARED system (engine.particles) lives in SCREEN SPACE (css px) and is drawn by the
 * engine AFTER the current scene(s), so particles survive scene transitions unchanged.
 * `snapshot()` / `inject()` implement the handoff continuity contract (§5.5.4).
 *
 *   engine.particles.emit({x,y,vx,vy,r,life,color,shape:'dot'|'spark'|'square'|'star',glow:true});
 *   engine.particles.burst(x, y, 40, {speed:[60,260], life:[0.4,1.2], color:'#ff0'});
 */

export const MAX_PARTICLES = 600;

function makeParticle() {
  return {
    active: false, x: 0, y: 0, vx: 0, vy: 0, r: 2, life: 0, maxLife: 1,
    color: '#ffffff', gravity: 0, drag: 0.0, glow: true, shape: 'dot',
    rot: 0, vrot: 0, fade: 1, born: 0
  };
}

export class ParticleSystem {
  constructor(max = MAX_PARTICLES, rng = null) {
    this.max = max;
    this.pool = new Array(max);
    for (let i = 0; i < max; i++) this.pool[i] = makeParticle();
    this.count = 0;
    this.rng = rng;
    this._cursor = 0;
  }

  _rand() { return this.rng ? this.rng.next() : Math.random(); }

  _acquire() {
    // free slot first
    for (let i = 0; i < this.max; i++) {
      const idx = (this._cursor + i) % this.max;
      if (!this.pool[idx].active) { this._cursor = (idx + 1) % this.max; return this.pool[idx]; }
    }
    // full: recycle the one with least remaining life
    let worst = this.pool[0];
    for (let i = 1; i < this.max; i++) if (this.pool[i].life < worst.life) worst = this.pool[i];
    return worst;
  }

  /**
   * @param {Object} o {x,y,vx,vy,r,life,color,gravity,drag,glow,shape,rot,vrot,fade}
   */
  emit(o) {
    const p = this._acquire();
    if (!p.active) this.count++;
    p.active = true;
    p.x = o.x || 0; p.y = o.y || 0;
    p.vx = o.vx || 0; p.vy = o.vy || 0;
    p.r = o.r == null ? 2 : o.r;
    p.life = o.life == null ? 1 : o.life;
    p.maxLife = o.maxLife || p.life;
    p.color = o.color || '#ffffff';
    p.gravity = o.gravity || 0;
    p.drag = o.drag || 0;
    p.glow = o.glow !== false;
    p.shape = o.shape || 'dot';
    p.rot = o.rot || 0;
    p.vrot = o.vrot || 0;
    p.fade = o.fade == null ? 1 : o.fade;
    return p;
  }

  /**
   * Radial burst.
   * @param {number} n
   * @param {{speed?:number[],life?:number[],r?:number[],color?:string|string[],spread?:number,angle?:number,gravity?:number,drag?:number,shape?:string}} o
   */
  burst(x, y, n, o = {}) {
    const sp = o.speed || [40, 200];
    const lf = o.life || [0.4, 1.1];
    const rr = o.r || [1.5, 4];
    const spread = o.spread == null ? Math.PI * 2 : o.spread;
    const base = o.angle == null ? 0 : o.angle;
    for (let i = 0; i < n; i++) {
      const a = base + (this._rand() - 0.5) * spread;
      const s = sp[0] + this._rand() * (sp[1] - sp[0]);
      const col = Array.isArray(o.color) ? o.color[Math.floor(this._rand() * o.color.length)] : (o.color || '#ffffff');
      this.emit({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        r: rr[0] + this._rand() * (rr[1] - rr[0]),
        life: lf[0] + this._rand() * (lf[1] - lf[0]),
        color: col, gravity: o.gravity || 0, drag: o.drag == null ? 0.9 : o.drag,
        shape: o.shape || 'dot', glow: o.glow !== false,
        vrot: (this._rand() - 0.5) * 6
      });
    }
  }

  update(dt) {
    let n = 0;
    for (let i = 0; i < this.max; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      if (p.drag) {
        const k = Math.pow(p.drag, dt * 60);
        p.vx *= k; p.vy *= k;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      n++;
    }
    this.count = n;
  }

  /** Nudge every live particle (used when a scene wants to pull particles somewhere). */
  attract(x, y, strength, dt) {
    for (let i = 0; i < this.max; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      const dx = x - p.x, dy = y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      p.vx += (dx / d) * strength * dt;
      p.vy += (dy / d) * strength * dt;
    }
  }

  draw(g) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.max; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      const a = Math.max(0, Math.min(1, (p.life / p.maxLife) * p.fade));
      g.globalAlpha = a;
      g.fillStyle = p.color;
      if (p.shape === 'square') {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
        g.restore();
      } else if (p.shape === 'spark') {
        g.save(); g.translate(p.x, p.y); g.rotate(Math.atan2(p.vy, p.vx));
        g.beginPath();
        g.ellipse(0, 0, p.r * 2.6, p.r * 0.7, 0, 0, Math.PI * 2);
        g.fill(); g.restore();
      } else {
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        g.fill();
        if (p.glow && p.r > 1.2) {
          g.globalAlpha = a * 0.28;
          g.beginPath(); g.arc(p.x, p.y, p.r * 2.6, 0, Math.PI * 2); g.fill();
        }
      }
    }
    g.restore();
  }

  /** Live snapshot for Handoff.particles (plain data, css px). */
  snapshot() {
    const out = [];
    for (let i = 0; i < this.max; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      out.push({
        x: p.x, y: p.y, vx: p.vx, vy: p.vy, r: p.r, life: p.life, maxLife: p.maxLife,
        color: p.color, gravity: p.gravity, drag: p.drag, shape: p.shape, glow: p.glow, fade: p.fade
      });
    }
    return out;
  }

  /** Re-inject a snapshot (world enter()). Coordinates stay css px. */
  inject(arr) {
    if (!arr || !arr.length) return;
    for (const o of arr) this.emit(o);
  }

  clear() {
    for (let i = 0; i < this.max; i++) this.pool[i].active = false;
    this.count = 0;
  }
}
