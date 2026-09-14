/**
 * Reusable crowd behaviours: attention (everyone near a finger turns to look
 * at it — the minimum feedback that must ALWAYS happen), simple push/pull from
 * a dragging hand, wandering, and a generic contagion spreader used by the
 * tickle scene later.
 */
import type { Hand } from '../core/input';
import type { Crowd } from './crowd';
import type { Kid } from './kid';

/**
 * Every kid inside the hand's influence circle turns to face the finger and
 * gets an `attention` pulse. Returns how many kids reacted.
 */
export function applyAttention(crowd: Crowd, hand: Hand): number {
  const r2 = hand.radius * hand.radius;
  let n = 0;
  const kids = crowd.kids;
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i];
    const dx = hand.x - k.x;
    const dy = hand.y - k.y;
    if (dx * dx + dy * dy > r2) continue;
    k.attention = 1;
    if (Math.abs(dx) > 1) k.facing = dx > 0 ? 1 : -1;
    n++;
  }
  return n;
}

/**
 * A moving finger nudges nearby kids: slow drags gently attract (kids follow
 * the finger), fast drags push them along the swipe. Never hurts anybody.
 */
export function applyDragForce(crowd: Crowd, hand: Hand, dt: number): void {
  const speed = Math.sqrt(hand.vx * hand.vx + hand.vy * hand.vy);
  const pushing = speed > 260;
  const r = hand.radius;
  const r2 = r * r;
  const kids = crowd.kids;
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i];
    const dx = hand.x - k.x;
    const dy = hand.y - k.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2 || d2 < 1e-6) continue;
    const d = Math.sqrt(d2);
    const falloff = 1 - d / r;
    if (pushing) {
      // Shove along the finger's direction of travel.
      k.vx += (hand.vx / speed) * 520 * falloff * dt;
      k.vy += (hand.vy / speed) * 520 * falloff * dt;
    } else {
      // Gather towards the finger.
      k.vx += (dx / d) * 300 * falloff * dt;
      k.vy += (dy / d) * 300 * falloff * dt;
    }
  }
}

/** Points nearby kids at a world position (used by taps and by hints). */
export function gatherTowards(crowd: Crowd, x: number, y: number, radius: number): number {
  const r2 = radius * radius;
  let n = 0;
  const kids = crowd.kids;
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i];
    const dx = x - k.x;
    const dy = y - k.y;
    if (dx * dx + dy * dy > r2) continue;
    k.targetX = x;
    k.targetY = y;
    k.hasTarget = true;
    n++;
  }
  return n;
}

/** Gentle idle wandering so a crowd is never statue-still. */
export function wander(crowd: Crowd, time: number, dt: number, strength = 28): void {
  const kids = crowd.kids;
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i];
    if (k.state === 'sleep' || k.hasTarget) continue;
    const p = k.wanderPhase;
    k.vx += Math.cos(time * 0.6 + p) * strength * dt;
    k.vy += Math.sin(time * 0.47 + p * 1.7) * strength * dt;
  }
}

/** Reused between calls so contagion never allocates. */
const HOT_SCRATCH: number[] = [];

/**
 * Generic contagion: a "hot" kid infects neighbours within `radius`.
 * `isHot` / `infect` keep this reusable (laughter, clapping, waking up...).
 * Returns the number of newly infected kids.
 */
export function spreadContagion(
  crowd: Crowd,
  radius: number,
  isHot: (k: Kid) => boolean,
  infect: (k: Kid) => void,
  chance = 1,
  rand: () => number = Math.random,
): number {
  const kids = crowd.kids;
  const r2 = radius * radius;
  let infected = 0;
  // Snapshot of who was hot *before* this step, so infection spreads one ring
  // per call instead of racing across the whole crowd in a single frame.
  // The scratch array is module-level: no allocation in the hot loop.
  const hot = HOT_SCRATCH;
  hot.length = 0;
  for (let i = 0; i < kids.length; i++) if (isHot(kids[i])) hot.push(i);
  for (let h = 0; h < hot.length; h++) {
    const a = kids[hot[h]];
    crowd.hash.forEachNear(a.x, a.y, (j) => {
      const b = kids[j];
      if (isHot(b)) return;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (dx * dx + dy * dy > r2) return;
      if (rand() > chance) return;
      infect(b);
      infected++;
    });
  }
  return infected;
}
