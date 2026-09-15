/**
 * Lightweight crowd: separation + target following, over a uniform spatial
 * hash so 150 kids stay O(n). The hot loop allocates nothing: the hash reuses
 * its bucket arrays and all maths is on scalars.
 */
import { Kid } from './kid';

export const MAX_KIDS = 150;

export interface CrowdBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Uniform grid over the crowd, rebuilt every frame and allocating nothing
 * while it does it.
 *
 * The obvious implementation — a Map of cell key to an array of indices —
 * allocates on every single frame: emptying an array with `length = 0` lets
 * the engine shrink its backing store, so the next frame's pushes grow it
 * again, and a Map that is cleared and refilled reallocates too. At 150 kids
 * and 60fps that is a steady drip of garbage for as long as the game is open.
 *
 * So the grid is three Int32Arrays instead: an open-addressed table of cells
 * (`keys` + `stamps` + `heads`) and one singly-linked `next` chain over the
 * kid indices. Clearing is a single increment of the generation counter.
 * Nothing here allocates after construction.
 */
export class SpatialHash {
  readonly cell: number;
  private mask: number;
  private keys: Int32Array;
  private stamps: Int32Array;
  private heads: Int32Array;
  private next: Int32Array;
  private generation = 1;

  constructor(cell = 40, capacity = MAX_KIDS) {
    this.cell = cell;
    // At most one cell per kid, so a table of twice that never passes half
    // full and the linear probe stays short.
    let slots = 16;
    while (slots < capacity * 2) slots *= 2;
    this.mask = slots - 1;
    this.keys = new Int32Array(slots);
    this.stamps = new Int32Array(slots);
    this.heads = new Int32Array(slots);
    this.next = new Int32Array(capacity);
  }

  /**
   * Exact cell identity (not a hash): cells are paired into a single integer,
   * so two different cells can never be mistaken for one another.
   */
  private cellKey(cx: number, cy: number): number {
    return (cx + 8192) * 16384 + (cy + 8192);
  }

  /** Slot for a cell key, linear-probed within the current generation. */
  private slotOf(key: number, insert: boolean): number {
    let slot = (Math.imul(key, 2654435761) >>> 17) & this.mask;
    for (;;) {
      if (this.stamps[slot] !== this.generation) {
        if (!insert) return -1;
        this.stamps[slot] = this.generation;
        this.keys[slot] = key;
        this.heads[slot] = -1;
        return slot;
      }
      if (this.keys[slot] === key) return slot;
      slot = (slot + 1) & this.mask;
    }
  }

  clear(): void {
    this.generation++;
    if (this.generation === 0x7fffffff) {
      this.stamps.fill(0);
      this.generation = 1;
    }
  }

  insert(index: number, x: number, y: number): void {
    if (index >= this.next.length) {
      const grown = new Int32Array(index * 2 + 1);
      grown.set(this.next);
      this.next = grown;
    }
    const slot = this.slotOf(this.cellKey(Math.floor(x / this.cell), Math.floor(y / this.cell)), true);
    this.next[index] = this.heads[slot];
    this.heads[slot] = index;
  }

  /**
   * Writes every index in the 3x3 cell block around (x, y) into `out` and
   * returns how many there were.
   *
   * `out` is the caller's own reusable array, because this runs once per kid
   * per frame: the neighbour query must not allocate, not even a closure. (It
   * used to take a callback, which is one closure per kid per frame — nine
   * thousand short-lived objects a second at 60fps.)
   */
  near(x: number, y: number, out: number[]): number {
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const slot = this.slotOf(this.cellKey(cx + dx, cy + dy), false);
        if (slot < 0) continue;
        for (let i = this.heads[slot]; i >= 0; i = this.next[i]) out[n++] = i;
      }
    }
    return n;
  }

  /** Convenience wrapper over `near`, for tests and cold paths only. */
  forEachNear(x: number, y: number, fn: (index: number) => void): void {
    const found: number[] = [];
    const n = this.near(x, y, found);
    for (let i = 0; i < n; i++) fn(found[i]);
  }
}

export interface CrowdOptions {
  separationRadius?: number;
  separationForce?: number;
  followForce?: number;
  maxSpeed?: number;
  damping?: number;
  bounds?: CrowdBounds;
}

/**
 * Applies one separation step between two kids. Exported so the unit tests can
 * assert the rule directly: overlapping kids must end up further apart.
 */
export function separate(
  a: Kid,
  b: Kid,
  radius: number,
  force: number,
  dt: number,
): void {
  let dx = a.x - b.x;
  let dy = a.y - b.y;
  let d2 = dx * dx + dy * dy;
  if (d2 >= radius * radius) return;
  if (d2 < 1e-6) {
    // Exactly coincident: push apart along a deterministic axis instead of
    // dividing by zero (jitter derived from identity keeps it stable).
    dx = a.wanderPhase - b.wanderPhase || 1;
    dy = 0.5;
    d2 = dx * dx + dy * dy;
  }
  const d = Math.sqrt(d2);
  const push = ((radius - d) / radius) * force * dt;
  const nx = dx / d;
  const ny = dy / d;
  a.vx += nx * push;
  a.vy += ny * push;
  b.vx -= nx * push;
  b.vy -= ny * push;
}

export class Crowd {
  readonly kids: Kid[] = [];
  readonly hash: SpatialHash;
  separationRadius: number;
  separationForce: number;
  followForce: number;
  maxSpeed: number;
  damping: number;
  bounds: CrowdBounds;

  constructor(opts: CrowdOptions = {}) {
    // Scales with KID_WORLD_H (150 units): kids keep the same visual spacing.
    this.separationRadius = opts.separationRadius ?? 62;
    this.separationForce = opts.separationForce ?? 900;
    this.followForce = opts.followForce ?? 340;
    this.maxSpeed = opts.maxSpeed ?? 190;
    this.damping = opts.damping ?? 2.4;
    this.bounds = opts.bounds ?? { left: -600, top: -600, right: 600, bottom: 600 };
    this.hash = new SpatialHash(Math.max(24, this.separationRadius * 1.5));
  }

  /**
   * Appends `count` kids without moving anybody who is already here. Returns
   * how many were actually added (the crowd is capped at MAX_KIDS).
   */
  add(count: number): number {
    const n = Math.min(count, MAX_KIDS - this.kids.length);
    for (let i = 0; i < n; i++) {
      const kid = new Kid();
      const idx = this.kids.length;
      kid.variant = idx % 6;
      kid.speedScale = 0.75 + ((idx * 37) % 50) / 100;
      kid.wanderPhase = ((idx * 61) % 628) / 100;
      kid.setState('idle');
      this.kids.push(kid);
    }
    return n;
  }

  spawn(count: number): void {
    this.add(count);
    this.scatter(420, 360);
  }

  /**
   * Lays the crowd out inside an ellipse. Golden-angle spacing keeps it even,
   * a deterministic per-kid jitter keeps it from reading as a spiral.
   */
  scatter(rx: number, ry: number): void {
    const n = this.kids.length;
    for (let i = 0; i < n; i++) {
      const kid = this.kids[i];
      const a = i * 2.399963;
      const t = Math.sqrt((i + 0.5) / n);
      const jr = (((i * 73) % 100) / 100 - 0.5) * 0.14;
      const ja = (((i * 131) % 100) / 100 - 0.5) * 0.9;
      kid.x = Math.cos(a + ja) * rx * (t + jr);
      kid.y = Math.sin(a + ja) * ry * (t + jr);
    }
  }

  /** Reused neighbour buffer, so `update` allocates nothing. */
  private nearBuffer: number[] = new Array(MAX_KIDS).fill(0);

  private rebuildHash(): void {
    this.hash.clear();
    for (let i = 0; i < this.kids.length; i++) {
      const k = this.kids[i];
      this.hash.insert(i, k.x, k.y);
    }
  }

  /** One simulation step. Allocation-free. */
  update(dt: number): void {
    const kids = this.kids;
    this.rebuildHash();

    // Separation (each unordered pair handled once, via index ordering).
    // Written as flat loops over the reused bucket buffer: nothing in here
    // allocates, including no per-kid callback.
    const sr = this.separationRadius;
    const sf = this.separationForce;
    const near = this.nearBuffer;
    for (let i = 0; i < kids.length; i++) {
      const a = kids[i];
      if (a.frozen) continue;
      const count = this.hash.near(a.x, a.y, near);
      for (let c = 0; c < count; c++) {
        const j = near[c];
        if (j <= i) continue;
        const b = kids[j];
        if (b.frozen) continue;
        separate(a, b, sr, sf, dt);
      }
    }

    // Target following + integration.
    const maxSpeed = this.maxSpeed;
    const b = this.bounds;
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      if (k.frozen) {
        k.update(dt);
        continue;
      }
      if (k.hasTarget && k.state !== 'sleep') {
        const dx = k.targetX - k.x;
        const dy = k.targetY - k.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 2) {
          // Ease off close to the target so nobody vibrates on arrival.
          const gain = Math.min(1, d / 60);
          k.vx += (dx / d) * this.followForce * gain * dt;
          k.vy += (dy / d) * this.followForce * gain * dt;
        }
      }

      const damp = Math.exp(-this.damping * dt);
      k.vx *= damp;
      k.vy *= damp;

      const speedCap = maxSpeed * k.speedScale * (k.state === 'run' ? 1.8 : 1);
      const sp = Math.sqrt(k.vx * k.vx + k.vy * k.vy);
      if (sp > speedCap) {
        const s = speedCap / sp;
        k.vx *= s;
        k.vy *= s;
      }

      if (k.state !== 'sleep' && k.state !== 'fall') {
        k.x += k.vx * dt;
        k.y += k.vy * dt;
      }

      // Soft bounds: the crowd drifts back instead of hitting a wall.
      if (k.x < b.left) {
        k.x = b.left;
        k.vx = Math.abs(k.vx) * 0.4;
      } else if (k.x > b.right) {
        k.x = b.right;
        k.vx = -Math.abs(k.vx) * 0.4;
      }
      if (k.y < b.top) {
        k.y = b.top;
        k.vy = Math.abs(k.vy) * 0.4;
      } else if (k.y > b.bottom) {
        k.y = b.bottom;
        k.vy = -Math.abs(k.vy) * 0.4;
      }

      // Steady states follow the actual speed, so the pose always matches.
      if (k.stateTimer === 0 && k.state !== 'sleep' && !k.locked) {
        const s = Math.sqrt(k.vx * k.vx + k.vy * k.vy);
        if (s > maxSpeed * 1.1) k.setState('run');
        else if (s > 8) k.setState('walk');
        else k.setState('idle');
      }

      k.update(dt);
    }
  }
}
