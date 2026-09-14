/** クラフト風(紙・木・フェルト)の描画ユーティリティ。 */

export type Ctx = CanvasRenderingContext2D;

export const SHADOW = 'rgba(70, 45, 20, 0.18)';

/** 影付きで塗る: draw() はパスを作るだけ。 */
export function paperFill(ctx: Ctx, color: string, draw: (c: Ctx) => void, shadow = 3, outline = true): void {
  ctx.save();
  ctx.translate(shadow, shadow);
  draw(ctx);
  ctx.fillStyle = SHADOW;
  ctx.fill();
  ctx.restore();
  draw(ctx);
  ctx.fillStyle = color;
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = 'rgba(60, 40, 20, 0.16)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function circle(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

export function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

/** 紙の繊維のような薄いノイズパターン(1 回生成して使い回す) */
let grain: CanvasPattern | null = null;
export function grainPattern(ctx: Ctx): CanvasPattern | null {
  if (grain) return grain;
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d');
  if (!g) return null;
  for (let i = 0; i < 700; i++) {
    const a = Math.random() * 0.07;
    g.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(80,60,30,${a})`;
    g.fillRect(Math.random() * 96, Math.random() * 96, 1 + Math.random() * 2, 1);
  }
  grain = ctx.createPattern(c, 'repeat');
  return grain;
}

export function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (n >> 16) + amt), g = Math.min(255, ((n >> 8) & 255) + amt), b = Math.min(255, (n & 255) + amt);
  return `rgb(${r},${g},${b})`;
}

export function darken(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (n >> 16) - amt), g = Math.max(0, ((n >> 8) & 255) - amt), b = Math.max(0, (n & 255) - amt);
  return `rgb(${r},${g},${b})`;
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}
