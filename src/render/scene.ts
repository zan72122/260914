/** ジオラマ(地面・飾り・線路・穴・トンネル・おもちゃ箱・駅)の描画。 */
import type { InstrumentId, Layer } from '../app/state';
import { STEPS, PITCHES, INSTRUMENT_KIND } from '../app/state';
import { type Layout, slotPos, boxItemPos } from './layout';
import { type Ctx, paperFill, circle, ellipse, roundRect, grainPattern, darken, lighten, clamp } from './paper';
import { type Theme } from './themes';
import { drawInstrument } from './instruments';

export function poleHeight(layout: Layout, pitch: number): number {
  return layout.unit * 0.3 + pitch * layout.unit * 0.24;
}

/** 置いた楽器の中心位置(ポール込み) */
export function placedInstrumentPos(layout: Layout, slot: number, inst: InstrumentId, pitch: number): { x: number; y: number } {
  const p = slotPos(layout, slot);
  if (INSTRUMENT_KIND[inst] === 'perc') return { x: p.x, y: p.y - layout.unit * 0.3 };
  return { x: p.x, y: p.y - poleHeight(layout, pitch) - layout.unit * 0.25 };
}

export function drawGround(ctx: Ctx, layout: Layout, theme: Theme, time: number): void {
  const { diorama, loop } = layout;
  ctx.fillStyle = theme.paper;
  ctx.fillRect(diorama.x, diorama.y, diorama.w, diorama.h);
  const g = grainPattern(ctx);
  if (g) { ctx.fillStyle = g; ctx.fillRect(diorama.x, diorama.y, diorama.w, diorama.h); }

  // 太陽
  if (theme.hasSun) {
    const sx = diorama.x + diorama.w * 0.85, sy = diorama.y + layout.safeTop + layout.unit * 0.9;
    paperFill(ctx, theme.sky, (c) => circle(c, sx, sy, layout.unit * 0.42), 2, false);
  }
  // 雲(ゆっくり漂う)
  for (let i = 0; i < 2; i++) {
    const cx = diorama.x + ((time * 6 + i * diorama.w * 0.55) % (diorama.w + layout.unit * 3)) - layout.unit * 1.5;
    const cy = diorama.y + layout.safeTop + layout.unit * (0.7 + i * 0.5);
    drawCloud(ctx, cx, cy, layout.unit * 0.5, theme.snow ? '#ffffff' : 'rgba(255,255,255,0.9)');
  }

  // 芝生(ループの内側)
  paperFill(ctx, theme.lawn, (c) => loop.path(c, -layout.unit * 0.05), 3, false);
  // 飾り
  drawDecor(ctx, layout, theme, time);
}

function drawCloud(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  paperFill(ctx, color, (c) => {
    c.beginPath();
    c.arc(x, y, r * 0.6, 0, Math.PI * 2);
    c.arc(x + r * 0.7, y + r * 0.1, r * 0.5, 0, Math.PI * 2);
    c.arc(x - r * 0.7, y + r * 0.15, r * 0.45, 0, Math.PI * 2);
  }, 2, false);
}

function drawDecor(ctx: Ctx, layout: Layout, theme: Theme, time: number): void {
  const { loop, unit } = layout;
  const inner = Math.min(loop.hw, loop.hh) - unit * 0.9;
  if (inner < unit * 0.8) return;
  const sway = Math.sin(time * 1.5) * 0.04;
  const spots = layout.portrait
    ? [[-0.55, -0.55], [0.5, -0.3], [-0.4, 0.4], [0.55, 0.6]]
    : [[-0.6, -0.4], [-0.2, 0.55], [0.35, -0.55], [0.65, 0.4]];
  spots.forEach(([fx, fy], i) => {
    const x = loop.cx + fx * (loop.hw - unit * 1.1);
    const y = loop.cy + fy * (loop.hh - unit * 1.1);
    if (i === 1) drawHouse(ctx, x, y, unit * 0.9, theme);
    else if (theme.snow && i === 3) drawSnowman(ctx, x, y, unit * 0.8);
    else drawTree(ctx, x, y, unit * 0.9, theme, sway * (i % 2 ? 1 : -1));
  });
}

function drawTree(ctx: Ctx, x: number, y: number, s: number, theme: Theme, sway: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sway);
  paperFill(ctx, theme.trunk, (c) => roundRect(c, -s * 0.08, -s * 0.2, s * 0.16, s * 0.5, s * 0.05), 2);
  if (theme.palm) {
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + (i - 1.5) * 0.7;
      paperFill(ctx, theme.tree, (c) => { c.beginPath(); c.ellipse(Math.cos(a) * s * 0.3, -s * 0.25 + Math.sin(a) * s * 0.3, s * 0.32, s * 0.12, a, 0, Math.PI * 2); }, 2);
    }
  } else {
    paperFill(ctx, theme.tree, (c) => circle(c, 0, -s * 0.3, s * 0.4));
    paperFill(ctx, lighten(theme.tree, 25), (c) => circle(c, -s * 0.15, -s * 0.42, s * 0.22), 1, false);
    if (theme.snow) paperFill(ctx, '#ffffff', (c) => ellipse(c, 0, -s * 0.6, s * 0.3, s * 0.1), 1, false);
  }
  ctx.restore();
}

function drawHouse(ctx: Ctx, x: number, y: number, s: number, theme: Theme): void {
  paperFill(ctx, theme.house, (c) => roundRect(c, x - s * 0.4, y - s * 0.2, s * 0.8, s * 0.55, s * 0.04));
  paperFill(ctx, theme.roof, (c) => { c.beginPath(); c.moveTo(x - s * 0.5, y - s * 0.18); c.lineTo(x, y - s * 0.6); c.lineTo(x + s * 0.5, y - s * 0.18); c.closePath(); });
  paperFill(ctx, '#f9e8a8', (c) => roundRect(c, x - s * 0.22, y - s * 0.05, s * 0.18, s * 0.18, s * 0.02), 1);
  paperFill(ctx, darken(theme.roof, 40), (c) => roundRect(c, x + s * 0.06, y, s * 0.2, s * 0.35, s * 0.04), 1);
}

function drawSnowman(ctx: Ctx, x: number, y: number, s: number): void {
  paperFill(ctx, '#ffffff', (c) => circle(c, x, y + s * 0.15, s * 0.32));
  paperFill(ctx, '#ffffff', (c) => circle(c, x, y - s * 0.28, s * 0.22));
  ctx.fillStyle = '#222';
  circle(ctx, x - s * 0.07, y - s * 0.32, s * 0.03); ctx.fill();
  circle(ctx, x + s * 0.07, y - s * 0.32, s * 0.03); ctx.fill();
  paperFill(ctx, '#f2a33a', (c) => { c.beginPath(); c.moveTo(x, y - s * 0.28); c.lineTo(x + s * 0.2, y - s * 0.24); c.lineTo(x, y - s * 0.2); c.closePath(); }, 1);
}

export function drawTrack(ctx: Ctx, layout: Layout, theme: Theme): void {
  const { loop, unit } = layout;
  // 砂利
  ctx.save();
  loop.path(ctx);
  ctx.strokeStyle = theme.bed;
  ctx.lineWidth = unit * 0.7;
  ctx.stroke();
  // 枕木(各ステップに 4 本)
  ctx.strokeStyle = theme.tie;
  ctx.lineWidth = unit * 0.12;
  ctx.lineCap = 'round';
  const nTies = STEPS * 4;
  ctx.beginPath();
  for (let i = 0; i < nTies; i++) {
    const p = loop.pointAt((i + 0.5) / nTies);
    ctx.moveTo(p.x - p.nx * unit * 0.22, p.y - p.ny * unit * 0.22);
    ctx.lineTo(p.x + p.nx * unit * 0.22, p.y + p.ny * unit * 0.22);
  }
  ctx.stroke();
  // レール 2 本
  ctx.strokeStyle = theme.rail;
  ctx.lineWidth = unit * 0.06;
  loop.path(ctx, unit * 0.13); ctx.stroke();
  loop.path(ctx, -unit * 0.13); ctx.stroke();
  ctx.restore();
}

/**
 * 穴と置かれた楽器。
 * highlightSlot: ドラッグ中に脈打たせる穴(-1 でなし)。dragging: 空き穴全体を淡く光らせる。
 */
export function drawSlots(
  ctx: Ctx, layout: Layout, layer: Layer, theme: Theme, time: number,
  dragging: boolean, highlightSlot: number, hitAmount: (slot: number) => number,
): void {
  const { unit } = layout;
  for (let i = 0; i < STEPS; i++) {
    const p = slotPos(layout, i);
    const placed = layer.placements.find((pl) => pl.slot === i);
    // 穴(へこみ)
    ctx.save();
    ellipse(ctx, p.x, p.y, unit * 0.36, unit * 0.16);
    ctx.fillStyle = darken(theme.paper, 45);
    ctx.fill();
    ellipse(ctx, p.x, p.y + unit * 0.03, unit * 0.32, unit * 0.12);
    ctx.fillStyle = darken(theme.paper, 80);
    ctx.fill();
    if (!placed && dragging) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 6 + i);
      const strong = i === highlightSlot;
      ctx.globalAlpha = strong ? 0.85 : 0.25 + pulse * 0.3;
      ctx.strokeStyle = '#fff6c8';
      ctx.lineWidth = unit * (strong ? 0.12 : 0.07);
      ellipse(ctx, p.x, p.y, unit * (0.42 + (strong ? pulse * 0.1 : 0)), unit * (0.2 + (strong ? pulse * 0.05 : 0)));
      ctx.stroke();
    }
    ctx.restore();
    if (placed) {
      const hit = hitAmount(i);
      const wobble = Math.sin(hit * Math.PI * 3) * (1 - hit);
      const pos = placedInstrumentPos(layout, i, placed.inst, placed.pitch);
      if (INSTRUMENT_KIND[placed.inst] === 'melody') {
        drawPole(ctx, p.x, p.y, pos.y + unit * 0.2, unit, placed.pitch);
      }
      drawInstrument(ctx, placed.inst, pos.x, pos.y - Math.abs(wobble) * unit * 0.15, unit, wobble);
    }
  }
}

export function drawPole(ctx: Ctx, x: number, baseY: number, topY: number, unit: number, pitch: number): void {
  paperFill(ctx, '#b08a5c', (c) => roundRect(c, x - unit * 0.05, topY, unit * 0.1, baseY - topY, unit * 0.04), 2, false);
  // 高さの目盛り(見て「上に行ける」と分かる)
  ctx.fillStyle = 'rgba(90,60,30,0.35)';
  for (let k = 0; k < PITCHES; k++) {
    const y = baseY - unit * 0.3 - k * unit * 0.24;
    if (k > pitch) { circle(ctx, x, y, unit * 0.035); ctx.fill(); }
  }
}

/** トンネル。open: 0=閉, 0.25=少し開く(光が漏れる), 1=全開 */
export function drawTunnel(ctx: Ctx, layout: Layout, theme: Theme, open: number, time: number): void {
  const { loop, unit } = layout;
  const p = loop.pointAt(0);
  const ang = Math.atan2(p.ty, p.tx);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);
  const w = unit * 1.1, h = unit * 1.2;
  // 山
  paperFill(ctx, darken(theme.lawn, 40), (c) => {
    c.beginPath();
    c.moveTo(-w, h * 0.55);
    c.quadraticCurveTo(-w * 0.9, -h * 0.9, 0, -h * 0.95);
    c.quadraticCurveTo(w * 0.9, -h * 0.9, w, h * 0.55);
    c.closePath();
  });
  if (theme.snow) paperFill(ctx, '#ffffff', (c) => ellipse(c, 0, -h * 0.75, w * 0.4, h * 0.14), 1, false);
  // 穴
  ctx.fillStyle = '#2b1d12';
  ctx.beginPath();
  ctx.moveTo(-w * 0.55, h * 0.55);
  ctx.lineTo(-w * 0.55, -h * 0.1);
  ctx.arc(0, -h * 0.1, w * 0.55, Math.PI, 0);
  ctx.lineTo(w * 0.55, h * 0.55);
  ctx.closePath();
  ctx.fill();
  // 漏れる光
  if (open > 0.05) {
    const glow = 0.35 + 0.25 * Math.sin(time * 4);
    ctx.save();
    ctx.globalAlpha = clamp(open, 0, 1) * glow + 0.15;
    ctx.fillStyle = '#ffe9a0';
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, h * 0.55);
    ctx.lineTo(-w * 0.5, -h * 0.1);
    ctx.arc(0, -h * 0.1, w * 0.5, Math.PI, 0);
    ctx.lineTo(w * 0.5, h * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // 扉(左右に開く)
  const doorW = w * 0.55;
  const slide = doorW * clamp(open, 0, 1);
  for (const side of [-1, 1]) {
    const dx = side * slide;
    paperFill(ctx, '#a2643a', (c) => {
      c.beginPath();
      c.rect(side < 0 ? -doorW + dx : dx, -h * 0.1 - w * 0.5, doorW, h * 0.55 + h * 0.1 + w * 0.5);
    }, 2);
    ctx.fillStyle = 'rgba(60,35,10,0.35)';
    ctx.fillRect(side < 0 ? -doorW + dx + doorW * 0.15 : dx + doorW * 0.15, -h * 0.3, doorW * 0.1, h * 0.6);
    ctx.fillRect(side < 0 ? -doorW + dx + doorW * 0.6 : dx + doorW * 0.6, -h * 0.3, doorW * 0.1, h * 0.6);
  }
  ctx.restore();
}

export function tunnelHit(layout: Layout, x: number, y: number): boolean {
  const p = layout.loop.pointAt(0);
  return Math.hypot(x - p.x, y - p.y) < layout.unit * 1.3;
}

/** おもちゃ箱(現在レベルの楽器見本)。 */
export function drawToyBox(ctx: Ctx, layout: Layout, instruments: InstrumentId[], time: number): void {
  const { box, unit } = layout;
  ctx.fillStyle = '#d9b98a';
  ctx.fillRect(box.x, box.y, box.w, box.h);
  const g = grainPattern(ctx);
  if (g) { ctx.fillStyle = g; ctx.fillRect(box.x, box.y, box.w, box.h); }
  // 箱の縁
  const pad = unit * 0.2;
  const innerH = layout.portrait ? box.h - layout.safeBottom : box.h;
  paperFill(ctx, '#b08a5c', (c) => roundRect(c, box.x + pad, box.y + pad, box.w - pad * 2, innerH - pad * 2, unit * 0.2), 3);
  paperFill(ctx, '#8b5a2b', (c) => roundRect(c, box.x + pad * 1.6, box.y + pad * 1.6, box.w - pad * 3.2, innerH - pad * 3.2, unit * 0.15), 0, false);
  instruments.forEach((id, i) => {
    const p = boxItemPos(layout, i, instruments.length);
    // 時々ぴょんと跳ねる
    const ph = ((time * 0.45 + i * 0.29) % 1);
    const hop = ph < 0.22 ? Math.sin((ph / 0.22) * Math.PI) * unit * 0.22 : 0;
    ellipse(ctx, p.x, p.y + unit * 0.45, unit * 0.32, unit * 0.1);
    ctx.fillStyle = 'rgba(60,35,10,0.25)'; ctx.fill();
    drawInstrument(ctx, id, p.x, p.y - hop, unit);
  });
}

/** 駅のホーム(フィナーレ)。 */
export function drawStation(ctx: Ctx, layout: Layout, theme: Theme, parkPhase: number, time: number): void {
  const { loop, unit } = layout;
  const p = loop.pointAt(parkPhase);
  const ang = Math.atan2(p.tx, -p.ty); // 法線方向
  ctx.save();
  ctx.translate(p.x + p.nx * unit * 0.75, p.y + p.ny * unit * 0.75);
  ctx.rotate(ang - Math.PI / 2);
  const len = unit * 5.2;
  paperFill(ctx, '#e0cfae', (c) => roundRect(c, -len / 2, -unit * 0.25, len, unit * 0.5, unit * 0.1));
  // 屋根と柱
  paperFill(ctx, theme.roof, (c) => roundRect(c, -len * 0.35, -unit * 0.95, len * 0.7, unit * 0.22, unit * 0.06));
  for (const fx of [-0.3, 0.3]) {
    paperFill(ctx, '#8b5a2b', (c) => roundRect(c, len * fx - unit * 0.05, -unit * 0.8, unit * 0.1, unit * 0.6, unit * 0.03), 1);
  }
  // 光る窓(リズムに合わせて明滅)
  const blink = 0.6 + 0.4 * Math.max(0, Math.sin(time * 8));
  ctx.fillStyle = `rgba(255,233,160,${blink})`;
  for (let i = -2; i <= 2; i++) circle(ctx, i * len * 0.12, -unit * 0.55, unit * 0.06), ctx.fill();
  ctx.restore();
}
