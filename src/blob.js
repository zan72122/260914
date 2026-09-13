// The blob: a fixed number of cells held together by short-range springs.
// Erasing cells makes the same number bud on the far side.
import { resolveCircle } from './terrain.js';

export const CELL_R = 7;
const D0 = CELL_R * 2;          // rest distance
const REACH = CELL_R * 3.0;     // attraction range
const K_REPEL = 5000;
const K_ATTRACT = 3200;
const K_CORE = 40;         // gentle pull toward the centroid beyond the rest radius
const VISC = 0.12;
const GRAVITY = 1100;
const FRICTION = 0.25;
const DRAG = 0.995;
const MAX_V = 900;

export class Blob {
  constructor(count = 96) {
    this.count = count;
    this.cells = [];
    this.cx = 0; this.cy = 0;
    this.groundedFrac = 0;
    this.events = [];          // {type, x, y}
    this.safe = null;          // last safe centroid
    this.safeTimer = 0;
    this.airTime = 0;
  }

  reset(x, y) {
    this.cells = [];
    // Pack into a rough disc.
    const n = this.count;
    let i = 0, ring = 0;
    while (i < n) {
      const m = ring === 0 ? 1 : Math.floor(ring * 6.5);
      for (let k = 0; k < m && i < n; k++, i++) {
        const a = (k / m) * Math.PI * 2 + ring * 0.4;
        const rr = ring * D0 * 0.95;
        this.cells.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr, vx: 0, vy: 0, g: false, age: 1 });
      }
      ring++;
    }
    this.updateCentroid();
    this.safe = { x, y };
    this.airTime = 0;
  }

  updateCentroid() {
    let sx = 0, sy = 0, gc = 0;
    for (const c of this.cells) { sx += c.x; sy += c.y; if (c.g) gc++; }
    const n = this.cells.length || 1;
    this.cx = sx / n; this.cy = sy / n;
    this.groundedFrac = gc / n;
  }

  step(dt, level, polys) {
    const cells = this.cells;
    const n = cells.length;
    // Pairwise springs + viscosity.
    for (let i = 0; i < n; i++) {
      const a = cells[i];
      for (let j = i + 1; j < n; j++) {
        const b = cells[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > REACH * REACH || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const ux = dx / d, uy = dy / d;
        let f;
        if (d < D0) f = -K_REPEL * (D0 - d);               // push apart
        else f = K_ATTRACT * (d - D0) * (1 - (d - D0) / (REACH - D0)); // pull, fading at reach
        // viscosity along the pair axis
        const rv = (b.vx - a.vx) * ux + (b.vy - a.vy) * uy;
        f += rv * VISC / dt * 0.5;
        const ax = ux * f * dt, ay = uy * f * dt;
        a.vx += ax; a.vy += ay;
        b.vx -= ax; b.vy -= ay;
      }
    }
    let grounded = 0;
    const restR = this.radiusEstimate() * 0.9;
    for (const c of cells) {
      c.vy += GRAVITY * dt;
      // shape retention: stray cells drift back toward the body
      const ddx = this.cx - c.x, ddy = this.cy - c.y;
      const dd = Math.hypot(ddx, ddy);
      if (dd > restR) {
        const f = K_CORE * (dd - restR);
        c.vx += (ddx / dd) * f * dt; c.vy += (ddy / dd) * f * dt;
      }
      c.vx *= DRAG; c.vy *= DRAG;
      const sp = Math.hypot(c.vx, c.vy);
      if (sp > MAX_V) { c.vx *= MAX_V / sp; c.vy *= MAX_V / sp; }
      c.x += c.vx * dt; c.y += c.vy * dt;
      c.g = false;
      for (const poly of polys) {
        const r = resolveCircle(poly, c.x, c.y, CELL_R);
        if (!r) continue;
        c.x = r.x; c.y = r.y;
        const vn = c.vx * r.nx + c.vy * r.ny;
        if (vn < 0) {
          c.vx -= r.nx * vn; c.vy -= r.ny * vn;
          if (vn < -260 && this.airTime > 0.25) this.events.push({ type: 'land', x: c.x, y: c.y, v: -vn });
        }
        c.vx *= (1 - FRICTION); c.vy *= (1 - FRICTION);
        if (r.ny < -0.3) c.g = true;
      }
      if (c.g) grounded++;
      if (c.age < 1) c.age = Math.min(1, c.age + dt * 4);
    }
    this.updateCentroid();
    if (this.groundedFrac > 0.15) this.airTime = 0; else this.airTime += dt;
    // Remember a safe spot when resting on ground.
    this.safeTimer += dt;
    if (this.groundedFrac > 0.4 && this.cy < level.deathY - 300 && this.safeTimer > 0.4) {
      this.safeTimer = 0;
      this.safe = { x: this.cx, y: this.cy - 40 };
    }
  }

  // Erase cells within `radius` of segment p0-p1 (world coords). Returns number erased.
  erase(p0, p1, radius, maxErase = 5) {
    const cells = this.cells;
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    const l2 = dx * dx + dy * dy;
    const hits = [];
    for (const c of cells) {
      let t = l2 > 0 ? ((c.x - p0.x) * dx + (c.y - p0.y) * dy) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = p0.x + dx * t, qy = p0.y + dy * t;
      const d = Math.hypot(c.x - qx, c.y - qy);
      if (d < radius) hits.push({ c, d });
    }
    if (hits.length === 0 || cells.length - Math.min(hits.length, maxErase) < 6) return 0;
    hits.sort((a, b) => a.d - b.d);
    const goneSet = new Set(hits.slice(0, maxErase).map((h) => h.c));
    const gone = [...goneSet];
    const keep = cells.filter((c) => !goneSet.has(c));
    this.cells = keep;
    for (const c of gone) this.events.push({ type: 'pop', x: c.x, y: c.y });
    // Bud on the far side, away from the finger.
    const ex = (p0.x + p1.x) / 2, ey = (p0.y + p1.y) / 2;
    this.updateCentroid();
    let ux = this.cx - ex, uy = this.cy - ey;
    const ul = Math.hypot(ux, uy);
    if (ul < 1e-3) { ux = 0; uy = -1; } else { ux /= ul; uy /= ul; }
    const ranked = keep
      .map((c) => ({ c, s: (c.x - this.cx) * ux + (c.y - this.cy) * uy }))
      .sort((a, b) => b.s - a.s);
    const topN = Math.max(3, Math.min(10, Math.floor(keep.length / 6)));
    for (let k = 0; k < gone.length; k++) {
      const host = ranked[k % topN].c;
      const jitter = (Math.random() - 0.5) * CELL_R * 2;
      const px = -uy, py = ux;
      const nx = host.x + ux * CELL_R * 1.2 + px * jitter * 0.6;
      const ny = host.y + uy * CELL_R * 1.2 + py * jitter * 0.6;
      this.cells.push({ x: nx, y: ny, vx: host.vx, vy: host.vy, g: false, age: 0 });
      this.events.push({ type: 'grow', x: nx, y: ny });
    }
    this.updateCentroid();
    return gone.length;
  }

  // Any cell within `r` of (x, y)?
  touches(x, y, r) {
    for (const c of this.cells) if (Math.hypot(c.x - x, c.y - y) < r) return true;
    return false;
  }

  radiusEstimate() {
    return Math.sqrt(this.cells.length) * CELL_R * 1.15;
  }
}
