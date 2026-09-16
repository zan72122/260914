import type { Layout } from './layout';

export type PointerPhase = 'down' | 'move' | 'up';

export interface PointerEvt {
  type: PointerPhase;
  /** view coords */
  x: number;
  y: number;
  /** movement since the previous event, view units */
  dx: number;
  dy: number;
  /** smoothed velocity, view units / second */
  vx: number;
  vy: number;
  /** seconds since pointerdown */
  age: number;
  /** total distance travelled since pointerdown */
  travel: number;
}

/**
 * Single-finger input. The first pointer down wins; every other touch is
 * ignored until it is released. Pointer capture keeps the drag alive when the
 * finger slides off the canvas.
 */
export class Input {
  down = false;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;

  private id: number | null = null;
  private lastT = 0;
  private startT = 0;
  private travel = 0;
  private handler: (e: PointerEvt) => void = () => {};
  private firstDownCbs: Array<() => void> = [];
  private firstDownDone = false;

  constructor(private layout: Layout) {
    const c = layout.canvas;
    c.addEventListener('pointerdown', this.onDown, { passive: false });
    c.addEventListener('pointermove', this.onMove, { passive: false });
    c.addEventListener('pointerup', this.onUp, { passive: false });
    c.addEventListener('pointercancel', this.onUp, { passive: false });
    c.addEventListener('lostpointercapture', this.onUp, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  bind(fn: (e: PointerEvt) => void): void {
    this.handler = fn;
  }

  /** for AudioContext.resume() etc. */
  onFirstDown(fn: () => void): void {
    this.firstDownCbs.push(fn);
  }

  private emit(type: PointerPhase, x: number, y: number, dt: number): void {
    const dx = x - this.x;
    const dy = y - this.y;
    if (type !== 'down') {
      const k = dt > 0 ? Math.min(1, dt * 22) : 1;
      const ivx = dt > 0 ? dx / dt : 0;
      const ivy = dt > 0 ? dy / dt : 0;
      this.vx += (ivx - this.vx) * k;
      this.vy += (ivy - this.vy) * k;
      this.travel += Math.hypot(dx, dy);
    }
    this.x = x;
    this.y = y;
    this.handler({
      type,
      x,
      y,
      dx: type === 'down' ? 0 : dx,
      dy: type === 'down' ? 0 : dy,
      vx: this.vx,
      vy: this.vy,
      age: (performance.now() - this.startT) / 1000,
      travel: this.travel,
    });
  }

  private onDown = (ev: PointerEvent): void => {
    ev.preventDefault();
    if (this.id !== null) return; // ignore extra fingers
    this.id = ev.pointerId;
    try {
      this.layout.canvas.setPointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    const p = this.layout.toView(ev.clientX, ev.clientY);
    this.down = true;
    this.vx = 0;
    this.vy = 0;
    this.travel = 0;
    this.x = p.x;
    this.y = p.y;
    this.lastT = performance.now();
    this.startT = this.lastT;
    if (!this.firstDownDone) {
      this.firstDownDone = true;
      for (const fn of this.firstDownCbs) fn();
    }
    this.emit('down', p.x, p.y, 0);
  };

  private onMove = (ev: PointerEvent): void => {
    if (this.id !== ev.pointerId) return;
    ev.preventDefault();
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    const p = this.layout.toView(ev.clientX, ev.clientY);
    this.emit('move', p.x, p.y, dt);
  };

  private onUp = (ev: PointerEvent): void => {
    if (this.id !== ev.pointerId) return;
    ev.preventDefault();
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    const p = this.layout.toView(ev.clientX, ev.clientY);
    this.emit('up', p.x, p.y, dt);
    this.down = false;
    this.id = null;
    try {
      this.layout.canvas.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
  };

  /** Dev/automation: synthesize a pointer event in view coords. */
  synth(type: PointerPhase, x: number, y: number): void {
    if (type === 'down') {
      this.down = true;
      this.vx = 0;
      this.vy = 0;
      this.travel = 0;
      this.x = x;
      this.y = y;
      this.startT = performance.now();
      this.lastT = this.startT;
      this.emit('down', x, y, 0);
    } else {
      const now = performance.now();
      const dt = Math.max(0.001, Math.min(0.1, (now - this.lastT) / 1000));
      this.lastT = now;
      this.emit(type, x, y, dt);
      if (type === 'up') this.down = false;
    }
  }
}
