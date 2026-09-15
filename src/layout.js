// 縦横レイアウト計算。状態はここに持たない（回転しても座標系だけ再計算する）。
import { clamp } from './util.js';

export function computeLayout(w, h) {
  const portrait = h >= w;
  const unit = Math.min(w, h);
  const L = { w, h, portrait, unit };

  if (portrait) {
    // 上=皿 / 中央=フライパン / 下=道具。下から上へ工程が進む。
    const pr = Math.min(w * 0.40, h * 0.165);
    L.plate = mkDisc(w * 0.5, h * 0.225, pr);
    const fr = Math.min(w * 0.34, h * 0.155);
    L.pan = mkDisc(w * 0.5, h * 0.555, fr, 0.70);
    L.pan.handleAngle = Math.PI * 0.5;  // 下向き（手前）
    L.toolY = h * 0.87;
    L.toolR = unit * 0.095;
    L.tools = {
      bottle: { x: w * 0.19, y: L.toolY },
      spatula: { x: w * 0.5, y: L.toolY },
      bowl: { x: w * 0.81, y: L.toolY },
    };
  } else {
    // 左=コンロ / 右=皿 / 下辺=道具。左から右へ料理が移る。
    const fr = Math.min(w * 0.20, h * 0.29);
    L.pan = mkDisc(w * 0.29, h * 0.44, fr, 0.70);
    L.pan.handleAngle = Math.PI;        // 左向き
    const pr = Math.min(w * 0.21, h * 0.30);
    L.plate = mkDisc(w * 0.71, h * 0.42, pr);
    L.toolY = h * 0.835;
    L.toolR = unit * 0.088;
    L.tools = {
      bottle: { x: w * 0.18, y: L.toolY },
      spatula: { x: w * 0.5, y: L.toolY },
      bowl: { x: w * 0.82, y: L.toolY },
    };
  }

  // DRAW 中のボトル待機位置（皿の横）
  const bx = clamp(L.plate.cx + L.plate.r + L.toolR * 0.95, L.toolR * 1.1, w - L.toolR * 1.1);
  const by = clamp(L.plate.cy, L.toolR * 1.2, h - L.toolR * 1.2);
  L.bottleDraw = { x: bx, y: by };

  // 絵だけのボタン（DRAW / DONE_MENU）。工程が終わった側＝フライパン跡地に並べる。
  const br = Math.max(unit * 0.078, 26);
  const gap = br * 2.55;
  const bcx = portrait ? w * 0.5 : L.pan.cx;
  const bcy = portrait ? L.toolY : L.toolY;
  L.buttons = [
    { id: 'again', x: bcx - gap, y: bcy, r: br },
    { id: 'variant', x: bcx, y: bcy, r: br },
    { id: 'redraw', x: bcx + gap, y: bcy, r: br },
  ].map((b) => ({ ...b, x: clamp(b.x, br * 1.1, w - br * 1.1) }));

  return L;
}

function mkDisc(cx, cy, r, squash = 0.72) {
  return { cx, cy, r, ry: r * squash, squash };
}

// --- 皿ローカル（正規化）座標 <-> 画面座標 ---
export const toScreen = (d, u, v) => ({ x: d.cx + u * d.r, y: d.cy + v * d.ry });
export const toLocal = (d, x, y) => ({ u: (x - d.cx) / d.r, v: (y - d.cy) / d.ry });
export const inDisc = (d, x, y, k = 1) => {
  const p = toLocal(d, x, y);
  return p.u * p.u + p.v * p.v <= k * k;
};
