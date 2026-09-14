/** 汽車と貨車。線路の接線に沿って回転させて描く(上から見た玩具の汽車)。 */
import type { Layer } from '../app/state';
import type { Layout } from './layout';
import { type Ctx, paperFill, roundRect, circle, darken } from './paper';
import { drawInstrument } from './instruments';

export interface TrainGeom {
  locoLen: number;
  wagonLen: number;
  spacing: number;  // 弧長での車両間隔
}

export function trainGeom(layout: Layout): TrainGeom {
  const u = layout.unit;
  return { locoLen: u * 1.5, wagonLen: u * 1.35, spacing: u * 1.65 };
}

/** 貨車 k の位相(機関車の位相から後ろへ) */
export function wagonPhase(layout: Layout, locoPhase: number, k: number): number {
  const g = trainGeom(layout);
  const s = locoPhase * layout.loop.length - g.spacing * (k + 1);
  return ((s / layout.loop.length) % 1 + 1) % 1;
}

export interface Steam { x: number; y: number; born: number; r: number }

export function drawLoco(ctx: Ctx, layout: Layout, phase: number, fire: number, time: number): void {
  const { loop, unit } = layout;
  const p = loop.pointAt(phase);
  const g = trainGeom(layout);
  const ang = Math.atan2(p.ty, p.tx);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);
  const L = g.locoLen, W = unit * 0.72;
  // 車輪
  ctx.fillStyle = '#3a2a1a';
  for (const fx of [-0.32, 0, 0.3]) {
    ctx.fillRect(fx * L - unit * 0.1, -W / 2 - unit * 0.06, unit * 0.2, unit * 0.1);
    ctx.fillRect(fx * L - unit * 0.1, W / 2 - unit * 0.04, unit * 0.2, unit * 0.1);
  }
  // 車体(赤)
  paperFill(ctx, '#d94f4f', (c) => roundRect(c, -L / 2, -W / 2, L, W, unit * 0.12));
  // ボイラー(前側、丸い)
  paperFill(ctx, '#3a3a3a', (c) => roundRect(c, -L * 0.05, -W * 0.36, L * 0.52, W * 0.72, W * 0.36), 2);
  // 運転席(後ろ側)
  paperFill(ctx, '#f2c744', (c) => roundRect(c, -L * 0.46, -W * 0.42, L * 0.34, W * 0.84, unit * 0.06), 2);
  // 火(テンポの見える化): 運転席の中
  const fr = unit * (0.09 + fire * 0.07) * (1 + 0.15 * Math.sin(time * 20));
  ctx.fillStyle = '#ff8a2a'; circle(ctx, -L * 0.29, 0, fr); ctx.fill();
  ctx.fillStyle = '#ffd24a'; circle(ctx, -L * 0.29, 0, fr * 0.55); ctx.fill();
  // 煙突
  paperFill(ctx, '#2b2b2b', (c) => circle(c, L * 0.32, 0, unit * 0.14), 1);
  // 顔(前面の丸)
  paperFill(ctx, '#fff3d6', (c) => circle(c, L * 0.44, 0, unit * 0.1), 1, false);
  ctx.restore();
}

export function chimneyPos(layout: Layout, phase: number): { x: number; y: number } {
  const p = layout.loop.pointAt(phase);
  const g = trainGeom(layout);
  return { x: p.x + p.tx * g.locoLen * 0.32, y: p.y + p.ty * g.locoLen * 0.32 };
}

/**
 * 貨車 k を描く。layer の楽器を上に載せる(直立で描く)。
 * hitAmount(slot): 鳴った直後の 0..1(0 で今鳴った)。
 */
export function drawWagon(
  ctx: Ctx, layout: Layout, phase: number, layer: Layer, color: string,
  hitAmount: (slot: number) => number, lidClosed: number,
): void {
  const { loop, unit } = layout;
  const p = loop.pointAt(phase);
  const g = trainGeom(layout);
  const ang = Math.atan2(p.ty, p.tx);
  const L = g.wagonLen, W = unit * 0.7;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);
  ctx.fillStyle = '#3a2a1a';
  for (const fx of [-0.3, 0.3]) {
    ctx.fillRect(fx * L - unit * 0.1, -W / 2 - unit * 0.06, unit * 0.2, unit * 0.1);
    ctx.fillRect(fx * L - unit * 0.1, W / 2 - unit * 0.04, unit * 0.2, unit * 0.1);
  }
  paperFill(ctx, color, (c) => roundRect(c, -L / 2, -W / 2, L, W, unit * 0.1));
  paperFill(ctx, darken(color, 30), (c) => roundRect(c, -L / 2 + unit * 0.08, -W / 2 + unit * 0.08, L - unit * 0.16, W - unit * 0.16, unit * 0.06), 0, false);
  // 連結器
  ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = unit * 0.06;
  ctx.beginPath(); ctx.moveTo(L / 2, 0); ctx.lineTo(L / 2 + (g.spacing - L) * 0.6, 0); ctx.stroke();
  ctx.restore();

  // 楽器(直立、貨車の上に並べる)
  const n = layer.placements.length;
  const small = unit * 0.5;
  layer.placements.forEach((pl, i) => {
    const along = n === 1 ? 0 : (i / (n - 1) - 0.5) * (L - small);
    const x = p.x + p.tx * along, y = p.y + p.ty * along - unit * 0.15;
    const hit = hitAmount(pl.slot);
    const wob = Math.sin(hit * Math.PI * 3) * (1 - hit);
    drawInstrument(ctx, pl.inst, x, y - Math.abs(wob) * unit * 0.2, small, wob);
  });
  // ふた(ミュート)
  if (lidClosed > 0) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.globalAlpha = Math.min(1, lidClosed);
    paperFill(ctx, '#b08a5c', (c) => roundRect(c, -L / 2 - unit * 0.04, -W / 2 - unit * 0.04 - (1 - lidClosed) * unit * 0.8, L + unit * 0.08, W + unit * 0.08, unit * 0.12), 3);
    ctx.restore();
  }
}

/** 汽車全体(機関車 + 貨車)の当たり判定用の位置一覧 */
export function trainHit(layout: Layout, locoPhase: number, wagonCount: number, x: number, y: number): { part: 'loco' | 'wagon'; index: number } | null {
  const { loop, unit } = layout;
  const r = unit * 0.95;
  for (let k = 0; k < wagonCount; k++) {
    const p = loop.pointAt(wagonPhase(layout, locoPhase, k));
    if (Math.hypot(x - p.x, y - p.y) < r) return { part: 'wagon', index: k };
  }
  const p = loop.pointAt(locoPhase);
  if (Math.hypot(x - p.x, y - p.y) < r * 1.1) return { part: 'loco', index: 0 };
  return null;
}
