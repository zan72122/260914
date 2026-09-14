/**
 * One kid: position, facing, and a small state machine.
 * No allocations happen in `update` — it is called 150x per frame.
 */
import { POSE_FRAMES } from '../art/kidSheet';
import type { PoseName } from '../art/kidSheet';

export type KidState = 'idle' | 'walk' | 'run' | 'laugh' | 'jump' | 'fall' | 'clap' | 'sleep';

/** Which atlas pose renders a given state ('fall' reuses the jump drawing). */
export const STATE_POSE: Record<KidState, PoseName> = {
  idle: 'idle',
  walk: 'walk',
  run: 'run',
  laugh: 'laugh',
  jump: 'jump',
  fall: 'jump',
  clap: 'clap',
  sleep: 'sleep',
};

/** Frames per second of the pose animation, per state. */
const STATE_FPS: Record<KidState, number> = {
  idle: 3,
  walk: 8,
  run: 13,
  laugh: 7,
  jump: 6,
  fall: 6,
  clap: 8,
  sleep: 1.5,
};

/** How long a transient state lasts, in seconds (0 = until told otherwise). */
const STATE_DURATION: Record<KidState, number> = {
  idle: 0,
  walk: 0,
  run: 0,
  laugh: 1.6,
  jump: 0.55,
  fall: 0.9,
  clap: 1.4,
  sleep: 0,
};

/** Transient states resolve back to this. Nobody ever ends sad or stuck. */
const STATE_NEXT: Partial<Record<KidState, KidState>> = {
  laugh: 'idle',
  jump: 'idle',
  // Falling always ends by getting up and laughing — never a failure.
  fall: 'laugh',
  clap: 'idle',
};

/** True when `to` may be entered from `from`. */
export function canTransition(from: KidState, to: KidState): boolean {
  if (from === to) return true;
  // A sleeping kid wakes only into idle (no teleporting into a run).
  if (from === 'sleep') return to === 'idle';
  // Falling has to finish; it resolves into a laugh on its own.
  if (from === 'fall') return to === 'fall' || to === 'laugh';
  return true;
}

/** The state a transient state resolves into when its timer runs out. */
export function resolvedState(state: KidState): KidState {
  return STATE_NEXT[state] ?? state;
}

export function stateDuration(state: KidState): number {
  return STATE_DURATION[state];
}

export class Kid {
  /** World position. */
  x = 0;
  y = 0;
  /** Velocity, world units / second. */
  vx = 0;
  vy = 0;
  /** Steering target. */
  targetX = 0;
  targetY = 0;
  hasTarget = false;
  /** -1 facing left, +1 facing right. */
  facing: 1 | -1 = 1;
  /** Head-turn bias towards a finger, 0..1, purely cosmetic. */
  attention = 0;
  /** Sprite variant (shirt colour). */
  variant = 0;
  /** Current pose frame index. */
  frame = 0;

  state: KidState = 'idle';
  /** Seconds left in a transient state; 0 for steady states. */
  stateTimer = 0;
  /** Seconds accumulated for animation stepping. */
  private animTime = 0;
  /** Per-kid speed multiplier, for a naturally uneven crowd. */
  speedScale = 1;
  /** Per-kid wander phase so nobody moves in lockstep. */
  wanderPhase = 0;
  /** True when the kid stepped this frame (used for footstep audio). */
  stepped = false;

  setState(next: KidState, force = false): boolean {
    if (!force && !canTransition(this.state, next)) return false;
    if (next === this.state && STATE_DURATION[next] === 0) return true;
    this.state = next;
    this.stateTimer = STATE_DURATION[next];
    this.animTime = 0;
    this.frame = 0;
    return true;
  }

  get pose(): PoseName {
    return STATE_POSE[this.state];
  }

  /** Advances timers and animation. Pure bookkeeping, no steering. */
  update(dt: number): void {
    this.stepped = false;
    if (this.stateTimer > 0) {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.stateTimer = 0;
        const next = resolvedState(this.state);
        if (next !== this.state) this.setState(next, true);
      }
    }
    const pose = this.pose;
    const count = POSE_FRAMES[pose];
    const prev = this.frame;
    this.animTime += dt * STATE_FPS[this.state];
    if (this.animTime >= 1) {
      const advance = Math.floor(this.animTime);
      this.animTime -= advance;
      this.frame = (this.frame + advance) % count;
    }
    if ((this.state === 'walk' || this.state === 'run') && this.frame !== prev && this.frame % 2 === 0) {
      this.stepped = true;
    }
    if (this.attention > 0) this.attention = Math.max(0, this.attention - dt * 1.2);
    if (Math.abs(this.vx) > 4) this.facing = this.vx > 0 ? 1 : -1;
  }
}
