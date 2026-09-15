/**
 * Ball-pit physics. Pure maths, no Pixi and no DOM, so the unit tests can run
 * thousands of steps in node.
 *
 * The pit is an ellipse (a circle seen from three-quarters above). Balls fall
 * towards the bottom of the bowl, bounce off its wall, and softly push each
 * other apart. Everything is pooled: `balls` is allocated once and the hot
 * loop only touches scalars.
 */

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** World radius. */
  r: number;
  /** Index into the pastel ball palette. */
  color: number;
  /** Pooled balls that are not in play are inactive. */
  active: boolean;
  /**
   * Seconds this ball is allowed outside the pit wall. The idle hint uses it
   * to let one ball hop out over the rim and drop back in.
   */
  freeTime: number;
}

export interface PitShape {
  cx: number;
  cy: number;
  /** Horizontal radius of the pit mouth. */
  rx: number;
  /** Vertical radius (smaller: the pit is drawn in perspective). */
  ry: number;
}

/** How hard a ball bounces off the pit wall (0 = dead, 1 = perfectly elastic). */
export const RESTITUTION = 0.42;
/** Downward pull inside the pit, world units / s². */
export const GRAVITY = 900;
/** Velocity damping per second inside the pit. */
export const DAMPING = 1.9;
/** Below this speed a resting ball is snapped to rest, so the pile goes calm. */
export const SLEEP_SPEED = 3;

/** Signed "how far outside the ellipse", in normalised units (<=1 is inside). */
export function ellipseDepth(pit: PitShape, x: number, y: number, inset: number): number {
  const rx = Math.max(1, pit.rx - inset);
  const ry = Math.max(1, pit.ry - inset);
  const dx = (x - pit.cx) / rx;
  const dy = (y - pit.cy) / ry;
  return Math.sqrt(dx * dx + dy * dy);
}

/** True when (x, y) lies inside the pit mouth (with an optional margin). */
export function insidePit(pit: PitShape, x: number, y: number, margin = 0): boolean {
  return ellipseDepth(pit, x, y, -margin) <= 1;
}

export class BallPool {
  readonly balls: Ball[] = [];
  /** When true the pit has overflowed: balls spill out to the right. */
  spilling = false;

  constructor(
    public pit: PitShape,
    count: number,
    radius = 22,
    seed = 1,
  ) {
    let a = seed >>> 0;
    const rnd = () => {
      a = (a * 1664525 + 1013904223) >>> 0;
      return a / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      const ang = rnd() * Math.PI * 2;
      const rad = Math.sqrt(rnd());
      this.balls.push({
        x: pit.cx + Math.cos(ang) * pit.rx * 0.8 * rad,
        y: pit.cy + Math.sin(ang) * pit.ry * 0.8 * rad,
        vx: (rnd() - 0.5) * 60,
        vy: (rnd() - 0.5) * 60,
        r: radius * (0.85 + rnd() * 0.3),
        color: i % 6,
        active: true,
        freeTime: 0,
      });
    }
  }

  /** Kicks balls away from an impact point (a kid landing in the pit). */
  splash(x: number, y: number, strength = 420): void {
    const balls = this.balls;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (!b.active) continue;
      const dx = b.x - x;
      const dy = b.y - y;
      const d2 = dx * dx + dy * dy;
      const reach = 230;
      if (d2 > reach * reach) continue;
      const d = Math.max(8, Math.sqrt(d2));
      const f = (1 - d / reach) * strength;
      b.vx += (dx / d) * f;
      b.vy += (dy / d) * f - f * 0.5;
    }
  }

  /** The pit overflows: balls stop being contained and roll away right. */
  spill(): void {
    if (this.spilling) return;
    this.spilling = true;
    const balls = this.balls;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      b.vx += 120 + (i % 7) * 30;
      b.vy -= 160 + (i % 5) * 40;
    }
  }

  /** One physics step. Allocation-free. */
  step(dt: number): void {
    if (dt <= 0) return;
    // A very large frame step (a backgrounded tab) must not blow the solver up.
    const h = Math.min(dt, 1 / 30);
    const balls = this.balls;
    const n = balls.length;

    // Soft mutual repulsion.
    for (let i = 0; i < n; i++) {
      const a = balls[i];
      if (!a.active) continue;
      for (let j = i + 1; j < n; j++) {
        const b = balls[j];
        if (!b.active) continue;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const min = a.r + b.r;
        let d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        if (d2 < 1e-4) {
          // Perfectly coincident: separate along a deterministic axis.
          dx = (i - j) || 1;
          dy = 0.37;
          d2 = dx * dx + dy * dy;
        }
        const d = Math.sqrt(d2);
        const overlap = (min - d) * 0.5;
        const nx = dx / d;
        const ny = dy / d;
        // Positional correction keeps the pile from sinking into itself...
        a.x += nx * overlap;
        a.y += ny * overlap;
        b.x -= nx * overlap;
        b.y -= ny * overlap;
        // ...and a gentle impulse makes it look bouncy rather than glued.
        const push = overlap * 12;
        a.vx += nx * push;
        a.vy += ny * push;
        b.vx -= nx * push;
        b.vy -= ny * push;
      }
    }

    const damp = Math.exp(-DAMPING * h);
    for (let i = 0; i < n; i++) {
      const b = balls[i];
      if (!b.active) continue;
      b.vy += GRAVITY * h * (this.spilling ? 0.8 : 1);
      if (this.spilling) b.vx += 260 * h; // everything drifts off to the right
      b.vx *= damp;
      b.vy *= damp;
      b.x += b.vx * h;
      b.y += b.vy * h;

      if (b.freeTime > 0) b.freeTime = Math.max(0, b.freeTime - h);

      if (!this.spilling && b.freeTime <= 0) {
        // Keep the ball inside the bowl: push back along the ellipse normal.
        const u = ellipseDepth(this.pit, b.x, b.y, b.r);
        if (u > 1) {
          const dx = (b.x - this.pit.cx) / u;
          const dy = (b.y - this.pit.cy) / u;
          b.x = this.pit.cx + dx;
          b.y = this.pit.cy + dy;
          // Reflect the velocity about the (approximate) inward normal.
          const rx = Math.max(1, this.pit.rx - b.r);
          const ry = Math.max(1, this.pit.ry - b.r);
          let nx = (b.x - this.pit.cx) / (rx * rx);
          let ny = (b.y - this.pit.cy) / (ry * ry);
          const nl = Math.hypot(nx, ny) || 1;
          nx /= nl;
          ny /= nl;
          const vn = b.vx * nx + b.vy * ny;
          if (vn > 0) {
            b.vx -= (1 + RESTITUTION) * vn * nx;
            b.vy -= (1 + RESTITUTION) * vn * ny;
            // Tangential friction, so balls settle instead of orbiting.
            b.vx *= 0.9;
            b.vy *= 0.9;
          }
          if (Math.hypot(b.vx, b.vy) < SLEEP_SPEED) {
            b.vx = 0;
            b.vy = 0;
          }
        }
      }
    }
  }

  /**
   * Sends one ball hopping over the rim and back in (the idle hint).
   * Always the topmost ball: one buried under the pile would just be squeezed
   * back down by its neighbours instead of clearing the rim.
   */
  hop(side = 1, strength = 2100): number {
    let top = -1;
    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      if (!b.active) continue;
      if (top < 0 || b.y < this.balls[top].y) top = i;
    }
    if (top < 0) return -1;
    const b = this.balls[top];
    b.vy = -strength;
    b.vx = (side >= 0 ? 1 : -1) * 90;
    // Long enough for the whole arc, so the ball drops back in instead of
    // being snapped to the wall half way through the hop.
    b.freeTime = 1.8;
    return top;
  }

  /** True when every active ball sits inside the pit (used by the tests). */
  allInside(tolerance = 1.02): boolean {
    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      if (!b.active) continue;
      if (ellipseDepth(this.pit, b.x, b.y, b.r) > tolerance) return false;
    }
    return true;
  }

  /** True when nothing in the pool has gone non-finite. */
  isFinite(): boolean {
    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) return false;
      if (!Number.isFinite(b.vx) || !Number.isFinite(b.vy)) return false;
    }
    return true;
  }
}
