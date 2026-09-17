import { TAU, clamp, lerp, smoothstep } from '../core/math.js';

/**
 * The bin: a small open-topped tub that stands near the entrance of every room
 * and in the hall.
 *
 * It is the other half of the cup-capacity mechanic, and the whole teaching
 * chain is wordless:
 *
 *   the cup is visibly full (contents pressing on the lid, tufts out of the
 *   seam, motor labouring)  ->  things stop going in (they are pulled to the
 *   mouth and puffed back out)  ->  the only open thing in the room is this
 *   bin, and its lid is standing up  ->  bring the head to it and everything
 *   pours out in one rush.
 *
 * A scene owns one:
 *
 *   this.bin = new Bin({ x, y });        // in layout()
 *
 * and `main.js` does the rest: it ticks the bin after the scene, draws its body
 * BEHIND the vacuum and its pour arcs and lid IN FRONT of it. A scene that
 * wants to drive the pour itself (the carpet finale) calls
 * `bin.beginPour(vac, ctx, {pad})` directly.
 */
export class Bin {
  constructor(opts = {}) {
    this.x = opts.x || 0;
    this.y = opts.y || 0;
    this.w = opts.w || 74;
    this.h = opts.h || 82;
    this.color = opts.color || '#4a6f8c';
    this.rim = opts.rim || '#6d94b4';
    /** How close the MOUTH has to come before the cup opens, in design px. */
    this.reach = opts.reach === undefined ? 92 : opts.reach;
    this.rng = opts.rng || null;
    /** Set false while a scene does not want the bin to trigger. */
    this.armed = opts.armed === undefined ? true : opts.armed;
    /**
     * How full the cup has to be before brushing past the bin empties it.
     * Without this the bin would swallow the child's first three crumbs every
     * time they walked past the door, and the cup is the only progress display
     * in the game — it has to be allowed to fill up and be enjoyed.
     */
    this.armFill = opts.armFill === undefined ? 0.5 : opts.armFill;

    this.heap = [];          // what has landed in it, and stays
    this.items = [];         // what is in the air right now
    this.pouring = false;
    this.lid = 0;            // 0 shut, 1 fully open
    this.t = 0;
    this.pourEnd = 0;
    this.invite = 0;         // 0..1 how much it is asking to be used
    this._cool = 0;
    this._appear = 1;
  }

  /** Is the mouth close enough for the cup to open over the bin? */
  inReach(vac) {
    const d = Math.hypot(vac.mouthX - this.x, vac.mouthY - this.y);
    return d < this.reach + this.w * 0.3;
  }

  /**
   * Tip the dust cup in. Returns false if there was nothing to pour.
   * `opts.pad` adds that many extra invented blobs, so a finale pour is a rush
   * rather than a trickle even when the cup happens to be half empty.
   */
  beginPour(vac, ctx, opts) {
    if (this.pouring) return false;
    const src = vac.emptyCup();
    const rng = this.rng || (ctx && ctx.rng) || null;
    const rnd = (a, b) => (rng ? rng.range(a, b) : a + (b - a) * Math.random());
    const pad = (opts && opts.pad) || 0;
    for (let i = src.length; i < pad; i++) {
      const p = { x: 0, y: 0 };
      const lx = rnd(-18, 18), ly = rnd(-14, 16);
      vac.cupToWorld(lx, ly, p);
      src.push({
        x: lx, y: ly, wx: p.x, wy: p.y, r: rnd(2.2, 5),
        kind: rnd(0, 1) < 0.4 ? 'crumb' : 'fluff',
        color: ['#b7ada0', '#cfc6b8', '#d7a866', '#e8dcc6', '#a9a094'][Math.floor(rnd(0, 4.999))],
        seed: rnd(0, 100), rot: rnd(0, TAU),
      });
    }
    if (!src.length) return false;
    this.pouring = true;
    this.t = 0;
    this.items.length = 0;
    const p = { x: 0, y: 0 };
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (c.wx === undefined) vac.cupToWorld(c.x, c.y, p);
      else { p.x = c.wx; p.y = c.wy; }
      this.items.push({
        lx: c.x, ly: c.y, x: p.x, y: p.y, r: c.r, kind: c.kind, color: c.color,
        rot: c.rot || 0, spin: rnd(-9, 9),
        t0: i * 0.012, t: 0, dur: 0.5 + rnd(0, 0.12),
        ox: 0, oy: 0, sx: 0, sy: 0, started: false, landed: false,
      });
    }
    this.pourEnd = src.length * 0.012 + 0.62;
    this._vac = vac;
    if (ctx && ctx.audio) ctx.audio.pop('whoosh', 1);
    return true;
  }

  /**
   * Tick. Opens the cup and starts the pour by itself whenever the mouth comes
   * within reach and there is anything to empty — that IS the interaction.
   */
  update(dt, ctx) {
    const vac = ctx && ctx.vacuum;
    this.t += dt;
    this._cool = Math.max(0, this._cool - dt);
    if (!vac) return;

    if (!this.pouring && this.armed && this._cool <= 0 && vac.cup.length
        && vac.cupFill >= this.armFill && this.inReach(vac)) {
      this.beginPour(vac, ctx);
    }

    // an open top invites more loudly the fuller the cup gets
    const want = this.pouring ? 1 : smoothstep(0.55, 0.98, vac.cupFill);
    this.invite += (want - this.invite) * (1 - Math.exp(-3 * dt));

    if (!this.pouring) {
      this.lid += (0 - this.lid) * (1 - Math.exp(-9 * dt));
      vac.cupOpen += (0 - vac.cupOpen) * (1 - Math.exp(-9 * dt));
      return;
    }

    // cup bottom swings open, everything arcs across, lid claps shut
    const open = clamp(this.t / 0.22, 0, 1) * (1 - smoothstep(this.pourEnd + 0.25, this.pourEnd + 0.55, this.t));
    this.lid = open;
    vac.cupOpen = open;
    this._fly(dt, vac, ctx);

    if (ctx && ctx.audio) {
      ctx.audio.setStream(clamp(1 - this.t / Math.max(0.25, this.pourEnd), 0, 1));
    }
    if (this.t > this.pourEnd + 0.55) {
      this.pouring = false;
      this.items.length = 0;
      this.lid = 0;
      vac.cupOpen = 0;
      this._cool = 0.8;
      if (ctx && ctx.audio) { ctx.audio.setStream(0); ctx.audio.pop('tick', 0.9); }
      if (ctx && ctx.camera) ctx.camera.kick(4);
    }
  }

  _fly(dt, vac, ctx) {
    const p = { x: 0, y: 0 };
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.landed) continue;
      if (this.t < it.t0) {                       // still in the cup, waiting
        vac.cupToWorld(it.lx, it.ly, p);
        it.x = p.x; it.y = p.y;
        continue;
      }
      if (!it.started) {
        it.started = true;
        vac.cupToWorld(it.lx, it.ly, p);
        it.sx = p.x; it.sy = p.y;
        const r = this.rng;
        it.ox = (r ? r.range(-1, 1) : Math.random() * 2 - 1) * this.w * 0.28;
        it.oy = (r ? r.range(-1, 1) : Math.random() * 2 - 1) * this.h * 0.12;
      }
      it.t += dt / it.dur;
      const u = clamp(it.t, 0, 1);
      it.x = lerp(it.sx, this.x + it.ox, u);
      it.y = lerp(it.sy, this.y + it.oy, u) - Math.sin(u * Math.PI) * 52;
      it.rot += it.spin * dt;
      if (u >= 1) {
        it.landed = true;
        this.heap.push({ x: it.ox, y: it.oy, r: it.r, color: it.color, kind: it.kind, rot: it.rot });
        if (this.heap.length > 260) this.heap.shift();
        if (ctx && ctx.audio && (i % 5) === 0) ctx.audio.pop('tick', 0.22);
      }
    }
  }

  // ------------------------------------------------------------------ draw

  /** Body, mouth and heap. Drawn BEHIND the vacuum, in world coordinates. */
  draw(ctx) {
    const b = this;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.globalAlpha = this._appear;
    ctx.fillStyle = 'rgba(30,20,8,0.28)';
    ctx.beginPath(); ctx.ellipse(4, b.h * 0.46, b.w * 0.62, b.h * 0.18, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = b.color;
    round(ctx, -b.w / 2, -b.h / 2, b.w, b.h, 12); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    round(ctx, -b.w / 2 + 6, -b.h / 2 + 8, 12, b.h - 22, 6); ctx.fill();
    // the open top: a dark hole the same shape as the vacuum's own mouth
    ctx.fillStyle = '#20262e';
    ctx.beginPath(); ctx.ellipse(0, -b.h * 0.34, b.w * 0.42, b.h * 0.19, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = b.rim; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(0, -b.h * 0.34, b.w * 0.42, b.h * 0.19, 0, 0, TAU); ctx.stroke();
    // it brightens as the cup fills: the one open thing in the room
    if (this.invite > 0.02) {
      ctx.globalAlpha = this._appear * this.invite * (0.4 + 0.25 * Math.sin(this.t * 3.4));
      ctx.strokeStyle = '#ffe6a6'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(0, -b.h * 0.34, b.w * 0.46, b.h * 0.22, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = this._appear;
    }
    // what is already in it
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, -b.h * 0.34, b.w * 0.40, b.h * 0.18, 0, 0, TAU); ctx.clip();
    for (let i = 0; i < this.heap.length; i++) {
      const c = this.heap[i];
      ctx.save();
      ctx.translate(clamp(c.x, -b.w * 0.36, b.w * 0.36), -b.h * 0.34 + clamp(c.y * 0.2, -6, 6));
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      if (c.kind === 'crumb') ctx.fillRect(-c.r, -c.r * 0.7, c.r * 2, c.r * 1.4);
      else { ctx.beginPath(); ctx.ellipse(0, 0, c.r * 1.1, c.r, 0, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    ctx.restore();
    ctx.restore();
  }

  /** The arcing contents and the lid. Drawn IN FRONT of the vacuum. */
  drawOver(ctx) {
    const b = this;
    if (this.pouring) {
      for (let i = 0; i < this.items.length; i++) {
        const it = this.items[i];
        if (it.landed || !it.started) continue;
        ctx.save();
        ctx.translate(it.x, it.y);
        ctx.rotate(it.rot);
        ctx.scale(1.35, 1.35);
        ctx.fillStyle = it.color;
        if (it.kind === 'crumb') ctx.fillRect(-it.r, -it.r * 0.7, it.r * 2, it.r * 1.4);
        else { ctx.beginPath(); ctx.ellipse(0, 0, it.r * 1.15, it.r, 0, 0, TAU); ctx.fill(); }
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath(); ctx.ellipse(-it.r * 0.25, -it.r * 0.3, it.r * 0.4, it.r * 0.3, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }
    // lid, hinged at the far edge
    ctx.save();
    ctx.translate(b.x, b.y - b.h * 0.34);
    ctx.globalAlpha = this._appear;
    ctx.translate(0, -b.h * 0.17);
    ctx.rotate(-this.lid * 1.45);
    ctx.fillStyle = '#5b86a6';
    round(ctx, -b.w * 0.46, -b.h * 0.16, b.w * 0.92, b.h * 0.2, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    round(ctx, -b.w * 0.40, -b.h * 0.13, b.w * 0.8, b.h * 0.06, 3); ctx.fill();
    ctx.restore();
  }

  snapshot() {
    return {
      x: Math.round(this.x), y: Math.round(this.y),
      pouring: this.pouring, heap: this.heap.length, lid: +this.lid.toFixed(2),
    };
  }
}

function round(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
