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

/** Uniform grid bucket index map, reused frame to frame. */
export class SpatialHash {
  readonly cell: number;
  private buckets = new Map<number, number[]>();

  constructor(cell = 40) {
    this.cell = cell;
  }

  private key(cx: number, cy: number): number {
    // Cantor-ish pairing on signed cell coords; collisions are harmless here
    // because neighbour queries re-check real distances.
    return (cx + 4096) * 8192 + (cy + 4096);
  }

  clear(): void {
    for (const arr of this.buckets.values()) arr.length = 0;
  }

  insert(index: number, x: number, y: number): void {
    const k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell));
    let arr = this.buckets.get(k);
    if (!arr) {
      arr = [];
      this.buckets.set(k, arr);
    }
    arr.push(index);
  }

  /** Calls `fn` for every index in the 3x3 cell block around (x, y). */
  forEachNear(x: number, y: number, fn: (index: number) => void): void {
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const arr = this.buckets.get(this.key(cx + dx, cy + dy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) fn(arr[i]);
      }
    }
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
    this.separationRadius = opts.separationRadius ?? 46;
    this.separationForce = opts.separationForce ?? 900;
    this.followForce = opts.followForce ?? 260;
    this.maxSpeed = opts.maxSpeed ?? 150;
    this.damping = opts.damping ?? 2.4;
    this.bounds = opts.bounds ?? { left: -600, top: -600, right: 600, bottom: 600 };
    this.hash = new SpatialHash(Math.max(24, this.separationRadius * 1.5));
  }

  spawn(count: number): void {
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
    const sr = this.separationRadius;
    const sf = this.separationForce;
    for (let i = 0; i < kids.length; i++) {
      const a = kids[i];
      this.hash.forEachNear(a.x, a.y, (j) => {
        if (j <= i) return;
        separate(a, kids[j], sr, sf, dt);
      });
    }

    // Target following + integration.
    const maxSpeed = this.maxSpeed;
    const b = this.bounds;
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
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
      if (k.stateTimer === 0 && k.state !== 'sleep') {
        const s = Math.sqrt(k.vx * k.vx + k.vy * k.vy);
        if (s > maxSpeed * 1.1) k.setState('run');
        else if (s > 8) k.setState('walk');
        else k.setState('idle');
      }

      k.update(dt);
    }
  }
}
