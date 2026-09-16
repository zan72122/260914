export type Orientation = 'portrait' | 'landscape';

export interface SafeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Owns the canvas size. The game always draws in "view" coordinates
 * (CSS pixels of the playfield). Normally the view *is* the canvas.
 *
 * Dev Mode can force a fake viewport (e.g. 390x844) which is letterboxed
 * inside the real canvas; the game is unaware, it just gets a different w/h.
 */
export class Layout {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;

  /** playfield size in view units */
  w = 1;
  h = 1;
  orientation: Orientation = 'portrait';
  dpr = 1;
  /** view -> css transform */
  scale = 1;
  ox = 0;
  oy = 0;
  safe: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

  /** css pixel size of the real canvas */
  cssW = 1;
  cssH = 1;

  private override: { w: number; h: number } | null = null;
  private listeners: Array<(o: Orientation, w: number, h: number) => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 60));
    this.resize();
  }

  onResize(fn: (o: Orientation, w: number, h: number) => void): void {
    this.listeners.push(fn);
  }

  /** Dev: fake a device viewport, letterboxed inside the real canvas. */
  forceViewport(size: { w: number; h: number } | null): void {
    this.override = size;
    this.resize();
  }

  forcedViewport(): { w: number; h: number } | null {
    return this.override;
  }

  setOrientation(o: Orientation | null): void {
    if (o === null) this.forceViewport(null);
    else this.forceViewport(o === 'portrait' ? { w: 390, h: 844 } : { w: 844, h: 390 });
  }

  private readSafeInsets(): void {
    const probe = document.getElementById('safe-probe');
    if (!probe) return;
    const cs = getComputedStyle(probe);
    this.safe = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
  }

  resize(): void {
    this.readSafeInsets();
    const cssW = Math.max(1, Math.round(this.canvas.clientWidth || window.innerWidth));
    const cssH = Math.max(1, Math.round(this.canvas.clientHeight || window.innerHeight));
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);

    if (this.override) {
      this.w = this.override.w;
      this.h = this.override.h;
      this.scale = Math.min(cssW / this.w, cssH / this.h);
      this.ox = (cssW - this.w * this.scale) / 2;
      this.oy = (cssH - this.h * this.scale) / 2;
    } else {
      this.w = cssW;
      this.h = cssH;
      this.scale = 1;
      this.ox = 0;
      this.oy = 0;
    }
    this.orientation = this.w >= this.h ? 'landscape' : 'portrait';
    for (const fn of this.listeners) fn(this.orientation, this.w, this.h);
  }

  /** Clear the whole backing store and set the view transform. Call each frame. */
  begin(): CanvasRenderingContext2D {
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#05070b';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const s = this.dpr * this.scale;
    g.setTransform(s, 0, 0, s, this.dpr * this.ox, this.dpr * this.oy);
    g.save();
    g.beginPath();
    g.rect(0, 0, this.w, this.h);
    g.clip();
    return g;
  }

  end(): void {
    this.ctx.restore();
  }

  /** client (page) coords -> view coords */
  toView(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left - this.ox) / this.scale,
      y: (clientY - r.top - this.oy) / this.scale,
    };
  }
}
