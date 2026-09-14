/**
 * Pointer Events -> per-pointerId `Hand` objects in world space.
 * Multi-touch by construction: every finger is an independent hand,
 * effects add up and never conflict. No gestures, no long-press mode.
 */
import type { Viewport } from './viewport';

/** A tap is a press shorter than this (ms)... */
export const TAP_MAX_MS = 200;
/** ...that moved less than this (world units ~= px at safe-zone scale). */
export const TAP_MAX_MOVE = 12;
/** Radius of a hand's influence circle, in world units. */
export const HAND_RADIUS = 160;

export type HandPhase = 'down' | 'move' | 'up';

export interface Hand {
  id: number;
  /** World position. */
  x: number;
  y: number;
  /** Previous world position (last frame-ish sample). */
  px: number;
  py: number;
  /** World-units-per-second velocity, smoothed. */
  vx: number;
  vy: number;
  /** World position where the press started. */
  startX: number;
  startY: number;
  /** performance.now() at pointerdown. */
  downTime: number;
  /** performance.now() of the most recent sample (for velocity). */
  lastSample: number;
  /** Max distance travelled from the start point, in world units. */
  travel: number;
  /** Influence radius in world units. */
  radius: number;
  /** True while the pointer is still down. */
  active: boolean;
  /** Set on release when the gesture qualified as a tap. */
  wasTap: boolean;
}

export interface HandEvent {
  phase: HandPhase;
  hand: Hand;
  /** Only meaningful for phase === 'up'. */
  isTap: boolean;
}

export type HandHandler = (ev: HandEvent) => void;

/** Pure tap test, shared by the runtime and the unit tests. */
export function isTapGesture(durationMs: number, travel: number): boolean {
  return durationMs <= TAP_MAX_MS && travel < TAP_MAX_MOVE;
}

function makeHand(id: number, x: number, y: number, now: number): Hand {
  return {
    id,
    x,
    y,
    px: x,
    py: y,
    vx: 0,
    vy: 0,
    startX: x,
    startY: y,
    downTime: now,
    lastSample: now,
    travel: 0,
    radius: HAND_RADIUS,
    active: true,
    wasTap: false,
  };
}

/** Updates a hand with a new world sample. Allocation-free. */
export function updateHand(hand: Hand, x: number, y: number, now: number): void {
  const dt = Math.max(1, now - hand.lastSample) / 1000;
  hand.px = hand.x;
  hand.py = hand.y;
  hand.x = x;
  hand.y = y;
  const ivx = (x - hand.px) / dt;
  const ivy = (y - hand.py) / dt;
  // Light smoothing so a single jittery sample cannot spike the velocity.
  hand.vx += (ivx - hand.vx) * 0.5;
  hand.vy += (ivy - hand.vy) * 0.5;
  hand.lastSample = now;
  const dx = x - hand.startX;
  const dy = y - hand.startY;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > hand.travel) hand.travel = d;
}

export class InputManager {
  /** Live hands, keyed by pointerId. */
  readonly hands = new Map<number, Hand>();
  private handlers: HandHandler[] = [];
  private el: HTMLElement | null = null;
  private tmp = { x: 0, y: 0 };
  private firstDownHandlers: (() => void)[] = [];
  private gotFirstDown = false;

  constructor(private viewport: Viewport) {}

  onHand(fn: HandHandler): void {
    this.handlers.push(fn);
  }

  /** Runs once, on the very first pointerdown (used to unlock audio). */
  onFirstDown(fn: () => void): void {
    if (this.gotFirstDown) fn();
    else this.firstDownHandlers.push(fn);
  }

  attach(el: HTMLElement): void {
    this.el = el;
    el.addEventListener('pointerdown', this.handleDown, { passive: false });
    el.addEventListener('pointermove', this.handleMove, { passive: false });
    el.addEventListener('pointerup', this.handleUp, { passive: false });
    el.addEventListener('pointercancel', this.handleUp, { passive: false });
    el.addEventListener('lostpointercapture', this.handleUp, { passive: false });
    // Belt and braces against iOS Safari gestures: scrolling, pinch zoom,
    // double-tap zoom, text selection and the long-press callout.
    for (const type of ['touchstart', 'touchmove', 'touchend'] as const) {
      el.addEventListener(type, this.blockTouch, { passive: false });
    }
    for (const type of ['gesturestart', 'gesturechange', 'gestureend'] as const) {
      el.addEventListener(type, this.block as EventListener, { passive: false });
    }
    el.addEventListener('contextmenu', this.block, { passive: false });
    el.addEventListener('dblclick', this.block, { passive: false });
    document.addEventListener('dblclick', this.block, { passive: false });
    document.addEventListener('gesturestart', this.block as EventListener, { passive: false });
  }

  detach(): void {
    const el = this.el;
    if (!el) return;
    el.removeEventListener('pointerdown', this.handleDown);
    el.removeEventListener('pointermove', this.handleMove);
    el.removeEventListener('pointerup', this.handleUp);
    el.removeEventListener('pointercancel', this.handleUp);
    el.removeEventListener('lostpointercapture', this.handleUp);
    for (const type of ['touchstart', 'touchmove', 'touchend'] as const) {
      el.removeEventListener(type, this.blockTouch);
    }
    document.removeEventListener('dblclick', this.block);
    document.removeEventListener('gesturestart', this.block as EventListener);
    this.el = null;
    this.hands.clear();
    this.handlers.length = 0;
  }

  private block = (e: Event) => {
    e.preventDefault();
  };

  private blockTouch = (e: Event) => {
    // preventDefault on touchstart/touchmove kills scroll, pinch and the
    // 300ms double-tap-to-zoom path while leaving Pointer Events intact.
    if (e.cancelable) e.preventDefault();
  };

  private now(): number {
    return typeof performance === 'undefined' ? Date.now() : performance.now();
  }

  private handleDown = (e: PointerEvent) => {
    if (e.cancelable) e.preventDefault();
    this.el?.setPointerCapture?.(e.pointerId);
    const now = this.now();
    const p = this.viewport.toWorld(e.clientX, e.clientY, this.tmp);
    const hand = makeHand(e.pointerId, p.x, p.y, now);
    this.hands.set(e.pointerId, hand);
    if (!this.gotFirstDown) {
      this.gotFirstDown = true;
      for (const fn of this.firstDownHandlers) fn();
      this.firstDownHandlers.length = 0;
    }
    this.emit('down', hand, false);
  };

  private handleMove = (e: PointerEvent) => {
    const hand = this.hands.get(e.pointerId);
    if (!hand) return;
    if (e.cancelable) e.preventDefault();
    const p = this.viewport.toWorld(e.clientX, e.clientY, this.tmp);
    updateHand(hand, p.x, p.y, this.now());
    this.emit('move', hand, false);
  };

  private handleUp = (e: PointerEvent) => {
    const hand = this.hands.get(e.pointerId);
    if (!hand) return;
    if (e.cancelable) e.preventDefault();
    const now = this.now();
    const p = this.viewport.toWorld(e.clientX, e.clientY, this.tmp);
    updateHand(hand, p.x, p.y, now);
    hand.active = false;
    hand.wasTap = isTapGesture(now - hand.downTime, hand.travel);
    this.hands.delete(e.pointerId);
    this.emit('up', hand, hand.wasTap);
  };

  private emit(phase: HandPhase, hand: Hand, isTap: boolean): void {
    for (const fn of this.handlers) fn({ phase, hand, isTap });
  }

  /** Decays velocity of held-still hands; call once per frame. */
  update(dt: number): void {
    const decay = Math.exp(-dt * 6);
    for (const hand of this.hands.values()) {
      hand.vx *= decay;
      hand.vy *= decay;
    }
  }
}
