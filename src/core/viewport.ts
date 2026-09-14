/**
 * Fixed world coordinates with a square "safe zone" that always fits,
 * in portrait and in landscape. The extra area around the safe zone is
 * *visible world* (extra playground), never letterbox bars.
 */

/** Side length of the square safe zone in world units. */
export const SAFE = 1000;

export interface ViewportLayout {
  /** Device-pixel-independent CSS size of the canvas. */
  screenWidth: number;
  screenHeight: number;
  /** Uniform world->screen scale. */
  scale: number;
  /** World-space rectangle actually visible on screen. */
  worldLeft: number;
  worldTop: number;
  worldRight: number;
  worldBottom: number;
  worldWidth: number;
  worldHeight: number;
  /** Screen-space offset of world origin (world 0,0 is the safe-zone centre). */
  offsetX: number;
  offsetY: number;
}

/**
 * Computes the layout for a screen size. The safe zone is centred on world
 * origin and spans [-SAFE/2, SAFE/2] on both axes.
 */
export function computeLayout(screenWidth: number, screenHeight: number): ViewportLayout {
  const w = Math.max(1, screenWidth);
  const h = Math.max(1, screenHeight);
  // Contain the square: the smaller screen axis maps to exactly SAFE units.
  const scale = Math.min(w, h) / SAFE;
  const worldWidth = w / scale;
  const worldHeight = h / scale;
  return {
    screenWidth: w,
    screenHeight: h,
    scale,
    worldWidth,
    worldHeight,
    worldLeft: -worldWidth / 2,
    worldTop: -worldHeight / 2,
    worldRight: worldWidth / 2,
    worldBottom: worldHeight / 2,
    offsetX: w / 2,
    offsetY: h / 2,
  };
}

/** True when the full square safe zone is inside the visible world rect. */
export function safeZoneFits(layout: ViewportLayout): boolean {
  const half = SAFE / 2;
  const eps = 1e-6;
  return (
    layout.worldLeft <= -half + eps &&
    layout.worldRight >= half - eps &&
    layout.worldTop <= -half + eps &&
    layout.worldBottom >= half - eps
  );
}

/** Screen (CSS px) -> world coordinates. */
export function screenToWorld(
  layout: ViewportLayout,
  sx: number,
  sy: number,
  out: { x: number; y: number },
): { x: number; y: number } {
  out.x = (sx - layout.offsetX) / layout.scale;
  out.y = (sy - layout.offsetY) / layout.scale;
  return out;
}

/** World -> screen (CSS px). */
export function worldToScreen(
  layout: ViewportLayout,
  wx: number,
  wy: number,
  out: { x: number; y: number },
): { x: number; y: number } {
  out.x = wx * layout.scale + layout.offsetX;
  out.y = wy * layout.scale + layout.offsetY;
  return out;
}

export type ViewportListener = (layout: ViewportLayout) => void;

/**
 * Live viewport bound to the window. Recomputes on resize / orientation
 * change; the scene is expected to continue uninterrupted.
 */
export class Viewport {
  layout: ViewportLayout;
  private listeners: ViewportListener[] = [];
  private readonly onResize = () => this.refresh();

  constructor(width = 1, height = 1) {
    this.layout = computeLayout(width, height);
  }

  attach(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    window.visualViewport?.addEventListener('resize', this.onResize);
    this.refresh();
  }

  detach(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    window.visualViewport?.removeEventListener('resize', this.onResize);
    this.listeners.length = 0;
  }

  onChange(fn: ViewportListener): void {
    this.listeners.push(fn);
  }

  /** Re-measures the window and notifies listeners. */
  refresh(): ViewportLayout {
    const w = typeof window === 'undefined' ? this.layout.screenWidth : window.innerWidth;
    const h = typeof window === 'undefined' ? this.layout.screenHeight : window.innerHeight;
    this.set(w, h);
    return this.layout;
  }

  /** Explicit sizing (used by tests and by the Pixi resize hook). */
  set(width: number, height: number): ViewportLayout {
    this.layout = computeLayout(width, height);
    for (const fn of this.listeners) fn(this.layout);
    return this.layout;
  }

  toWorld(sx: number, sy: number, out: { x: number; y: number }): { x: number; y: number } {
    return screenToWorld(this.layout, sx, sy, out);
  }
}
