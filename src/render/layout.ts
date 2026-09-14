/** 画面サイズ・向きからジオラマ / おもちゃ箱 / 線路の配置を決める。 */
import { RoundedLoop } from './track';
import { STEPS } from '../app/state';

export interface Rect { x: number; y: number; w: number; h: number }

export interface Layout {
  w: number; h: number;
  portrait: boolean;
  diorama: Rect;
  box: Rect;
  loop: RoundedLoop;
  unit: number;         // 楽器の基準サイズ(px)
  slotOffset: number;   // 線路から穴までの距離
  safeTop: number;
  safeBottom: number;
}

export function computeLayout(w: number, h: number, safeTop = 0, safeBottom = 0): Layout {
  const portrait = h >= w;
  let diorama: Rect, box: Rect;
  if (portrait) {
    const boxH = Math.max(120, Math.min(h * 0.3, 220)) + safeBottom;
    diorama = { x: 0, y: 0, w, h: h - boxH };
    box = { x: 0, y: h - boxH, w, h: boxH };
  } else {
    const boxW = Math.max(140, Math.min(w * 0.24, 260));
    diorama = { x: 0, y: 0, w: w - boxW, h };
    box = { x: w - boxW, y: 0, w: boxW, h };
  }
  const unit = Math.max(44, Math.min(80, Math.min(diorama.w, diorama.h) * 0.12));
  const slotOffset = unit * 0.78;
  // 線路は穴・トンネルの分だけ内側に寄せる
  const marginX = unit * 1.6;
  const marginTop = unit * 2.4 + safeTop; // ポール(最大 1.3u)+ 楽器の分
  const marginBottom = unit * 1.4;
  const hw = (diorama.w - marginX * 2) / 2;
  const hh = (diorama.h - marginTop - marginBottom) / 2;
  const cx = diorama.x + diorama.w / 2;
  const cy = diorama.y + marginTop + hh;
  const r = Math.min(hw, hh) * 0.6;
  const loop = new RoundedLoop(cx, cy, hw, hh, r, portrait ? 'top' : 'right');
  return { w, h, portrait, diorama, box, loop, unit, slotOffset, safeTop, safeBottom };
}

/** スロット i の位相(枕木の中央) */
export function slotPhase(i: number): number {
  return (i + 0.5) / STEPS;
}

export function slotPos(layout: Layout, i: number): { x: number; y: number } {
  return layout.loop.offsetPoint(slotPhase(i), layout.slotOffset);
}

/** おもちゃ箱の中の楽器 i の位置 */
export function boxItemPos(layout: Layout, i: number, count: number): { x: number; y: number } {
  const { box, unit } = layout;
  if (layout.portrait) {
    const gap = Math.min(unit * 2.2, box.w / (count + 0.5));
    const x0 = box.x + box.w / 2 - (gap * (count - 1)) / 2;
    return { x: x0 + gap * i, y: box.y + (box.h - layout.safeBottom) / 2 + unit * 0.1 };
  }
  const gap = Math.min(unit * 2.2, box.h / (count + 0.5));
  const y0 = box.y + box.h / 2 - (gap * (count - 1)) / 2;
  return { x: box.x + box.w / 2, y: y0 + gap * i };
}
