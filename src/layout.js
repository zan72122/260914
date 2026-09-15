// 縦横レイアウト計算。状態はここに持たない（回転しても座標系だけ再計算する）。
import { clamp } from './util.js';

export function computeLayout(w, h) {
  const portrait = h >= w;
  const unit = Math.min(w, h);
  const L = { w, h, portrait, unit };

  if (portrait) {
    // 上=皿 / 中央=フライパン / 下=道具。下から上へ工程が進む。
    // 皿・フライパンは短辺の 6 割強（iPad でも余白が空きすぎないように）
    const pr = Math.min(w * 0.425, h * 0.210);
    L.plate = mkDisc(w * 0.5, h * 0.230, pr);
    const fr = Math.min(w * 0.345, h * 0.165);
    L.pan = mkDisc(w * 0.5, h * 0.545, fr, 0.70);
    L.pan.handleAngle = Math.PI * 0.30;  // 右下斜め（下の道具列に重ならない）
    L.toolY = h * 0.885;
    L.toolR = unit * 0.092;
    L.tools = {
      bottle: { x: w * 0.19, y: L.toolY },
      spatula: { x: w * 0.5, y: L.toolY },
      bowl: { x: w * 0.81, y: L.toolY },
    };
  } else {
    // 左=コンロ / 右=皿 / 下辺=道具。左から右へ料理が移る。
    const fr = Math.min(w * 0.180, h * 0.28);
    L.pan = mkDisc(w * 0.325, h * 0.44, fr, 0.70);
    L.pan.handleAngle = Math.PI;        // 左向き
    const pr = Math.min(w * 0.205, h * 0.30);
    L.plate = mkDisc(w * 0.72, h * 0.42, pr);
    L.toolY = h * 0.835;
    L.toolR = unit * 0.088;
    L.tools = {
      bottle: { x: w * 0.18, y: L.toolY },
      spatula: { x: w * 0.5, y: L.toolY },
      bowl: { x: w * 0.82, y: L.toolY },
    };
  }

  // 取っ手の先端（道具と重ならないことをテストで確かめる）
  L.pan.handleTip = handleTip(L.pan);

  // DRAW 中のボトル待機位置（皿の横）
  // 皿の右下の斜め外側に置く（描く面に重ならない）
  const bx = clamp(L.plate.cx + L.plate.r * 0.80 + L.toolR * 0.9, L.toolR * 1.1, w - L.toolR * 1.1);
  const by = clamp(L.plate.cy + L.plate.ry * 0.80 + L.toolR * 0.45, L.toolR * 1.2, h - L.toolR * 1.2);
  L.bottleDraw = { x: bx, y: by };

  // 絵だけのボタン（DRAW / DONE_MENU）。工程が終わった側＝フライパン跡地に並べる。
  const br = Math.max(unit * 0.078, 26);
  const gap = br * 2.55;
  const bcx = portrait ? w * 0.5 : L.pan.cx;
  const bcy = portrait ? L.pan.cy : L.toolY;   // 縦はフライパン跡地（下が空きすぎない）
  L.buttons = [
    { id: 'again', x: bcx - gap, y: bcy, r: br },
    { id: 'variant', x: bcx, y: bcy, r: br },
    { id: 'redraw', x: bcx + gap, y: bcy, r: br },
  ].map((b) => ({ ...b, x: clamp(b.x, br * 1.1, w - br * 1.1) }));

  return L;
}

// 傾いたフライパンが皿へ寄る量。tilt=1 で皿側の縁が皿の縁とほぼ接する。
// 描画（render/pan.js）と卵の位置（state.js）で同じ式を使う。
export const PAN_SQUASH = 0.85;          // drawPan の scale(1, 1 - 0.15*tilt) と対応
const PAN_GAP = 0.04;                    // 残す隙間（×unit）

export function panShift(L, tilt) {
  const P = L.plate, F = L.pan;
  const dx = P.cx - F.cx, dy = P.cy - F.cy;
  const dl = Math.hypot(dx, dy) || 1;
  const ux = dx / dl, uy = dy / dl;
  const ax = Math.abs(ux), ay = Math.abs(uy);
  const panEdge = ax * F.r + ay * F.ry * PAN_SQUASH;   // 傾いて縦につぶれた縁
  const plateEdge = ax * P.r + ay * P.ry;
  const gap = Math.max(0, dl - panEdge - plateEdge);
  const reach = Math.max(0, gap - L.unit * PAN_GAP) * clamp(tilt, 0, 1);
  return { x: ux * reach, y: uy * reach, ux, uy, reach };
}

// drawHandle と同じ式（r*0.6 から長さ r*1.05、y は squash+0.2 で潰す）
export function handleTip(P) {
  const a = P.handleAngle == null ? 0 : P.handleAngle;
  const d = P.r * 0.6 + P.r * 1.05;
  return {
    x: P.cx + Math.cos(a) * d,
    y: P.cy + Math.sin(a) * d * (P.squash + 0.2),
    w: Math.max(10, P.r * 0.24),
  };
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
