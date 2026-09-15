// 縦横レイアウト計算。状態はここに持たない（回転しても座標系だけ再計算する）。
import { clamp } from './util.js';

export function computeLayout(w, h, safe) {
  const portrait = h >= w;
  const unit = Math.min(w, h);
  const L = { w, h, portrait, unit };
  // セーフエリア（ノッチ／ホームバー）。未指定なら 0。
  L.safe = {
    top: (safe && safe.top) || 0,
    right: (safe && safe.right) || 0,
    bottom: (safe && safe.bottom) || 0,
    left: (safe && safe.left) || 0,
  };

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

  // 定位置も「描画バウンディングごと画面内」に収める（ノズルや柄の先が切れない）
  for (const [kind, t] of Object.entries(L.tools)) {
    const c = clampTool(L, kind, t.x, t.y);
    t.x = c.x; t.y = c.y;
  }

  // DRAW 中のボトル待機位置（皿の横）
  // 皿の右下の斜め外側に置く（描く面に重ならない）
  L.bottleDraw = clampTool(
    L, 'bottle',
    L.plate.cx + L.plate.r * 0.80 + L.toolR * 0.9,
    L.plate.cy + L.plate.ry * 0.80 + L.toolR * 0.45,
  );

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

// --- 道具が画面から切れないようにするクランプ ---------------------------------
// 道具の描画バウンディング（道具ローカル、r=1 のときの中心からの広がり）。
// 実際に描いたピクセルから測った値（影・ノズル・柄の先を含む）に少し余裕を足してある。
export const TOOL_BOX = {
  bottle: { l: 0.52, r: 0.71, t: 1.09, b: 1.85 },    // 下に長いノズル
  spatula: { l: 0.56, r: 0.62, t: 1.25, b: 1.41 },   // 上に伸びる柄
  bowl: { l: 0.91, r: 1.00, t: 0.55, b: 0.88 },
};

export const SAFE_PAD = 8;   // 画面（セーフエリア）の内側に必ず残す余白 px

// 回転後の外接箱（中心からの上下左右の広がり、px）
export function toolExtent(kind, r, angle = 0, scale = 1) {
  const b = TOOL_BOX[kind] || TOOL_BOX.spatula;
  const c = Math.cos(angle), s = Math.sin(angle);
  const k = r * scale;
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (const [ox, oy] of [[-b.l, -b.t], [b.r, -b.t], [b.r, b.b], [-b.l, b.b]]) {
    const x = (ox * c - oy * s) * k;
    const y = (ox * s + oy * c) * k;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { left: -minX, right: maxX, top: -minY, bottom: maxY };
}

// 道具の中心が取りうる範囲。この矩形に収めれば、描画全体が
// セーフエリアの内側に SAFE_PAD(+pad) 以上の余白を残して入る。
export function toolBounds(L, kind, angle = 0, opt = {}) {
  const e = toolExtent(kind, L.toolR, angle, opt.scale || 1);
  const S = L.safe || { top: 0, right: 0, bottom: 0, left: 0 };
  const p = SAFE_PAD + (opt.pad || 0);
  const pt = p + (opt.padTop || 0);
  return {
    minX: S.left + p + e.left,
    maxX: L.w - S.right - p - e.right,
    minY: S.top + pt + e.top,
    maxY: L.h - S.bottom - p - e.bottom,
  };
}

// 描画バウンディング全体が画面内に入る位置へ寄せる
export function clampTool(L, kind, x, y, angle = 0, opt = {}) {
  const b = toolBounds(L, kind, angle, opt);
  return {
    x: b.minX <= b.maxX ? clamp(x, b.minX, b.maxX) : (b.minX + b.maxX) / 2,
    y: b.minY <= b.maxY ? clamp(y, b.minY, b.maxY) : (b.minY + b.maxY) / 2,
  };
}

// そのままの位置で画面内に収まっているか
export function toolFits(L, kind, x, y, angle = 0, opt = {}) {
  const b = toolBounds(L, kind, angle, opt);
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
}
