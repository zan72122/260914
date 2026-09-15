// 画面寸法と safe-area から器具の配置を毎回計算する（固定pxを使わない）。

import { clamp } from './util.js';

export const PLATE_KINDS = ['square', 'circle', 'triangle'];

export function computeLayout(w, h, insets) {
  const pad = clamp(Math.min(w, h) * 0.03, 8, 22);
  const left = insets.left + pad;
  const right = w - insets.right - pad;
  const top = insets.top + pad;
  const bottom = h - insets.bottom - pad;
  const availW = Math.max(60, right - left);
  const availH = Math.max(60, bottom - top);
  const gap = clamp(Math.min(availW, availH) * 0.035, 8, 20);
  const portrait = h >= w;

  const L = {
    w, h, portrait, insets,
    left, right, top, bottom, availW, availH, gap,
    plate: { cx: 0, cy: 0, r: 10 },
    knob: { cx: 0, cy: 0, r: 10, hit: 40 },
    bowl: { cx: 0, cy: 0, r: 10, hit: 40 },
    sockets: [],
    rack: [],
    rackRail: null,
    panels: [],
  };

  if (portrait) {
    const rackH = clamp(availH * 0.13, 54, 124);
    const bottomH = clamp(availH * 0.26, 120, 250);
    const midTop = top + rackH + gap;
    const midBot = bottom - bottomH - gap;
    const midH = Math.max(80, midBot - midTop);

    const socketR = clamp(availW * 0.055, 18, 40);
    const rowH = socketR * 2 + gap * 0.6;
    const plateR = Math.max(40, Math.min(availW * 0.44, (midH - rowH - gap) * 0.5));
    const blockH = plateR * 2 + gap + rowH;
    const blockTop = midTop + Math.max(0, (midH - blockH) * 0.5);
    const cx = (left + right) * 0.5;

    L.plate.cx = cx;
    L.plate.cy = blockTop + plateR;
    L.plate.r = plateR;

    const sy = blockTop + plateR * 2 + gap + socketR;
    const sSpan = Math.min(availW * 0.72, socketR * 7.2);
    for (let i = 0; i < 3; i++) {
      L.sockets.push({
        cx: cx + (i - 1) * (sSpan / 2),
        cy: sy,
        r: socketR,
        hit: Math.max(socketR * 1.5, 34),
      });
    }

    // 上部: 板ラック
    const rackR = Math.min(rackH * 0.34, availW * 0.11);
    const rackY = top + rackH * 0.5;
    const rSpan = Math.min(availW * 0.7, rackR * 7.6, Math.max(rackR * 2.4, availW - rackR * 3.4));
    L.rackRail = { x: cx - rSpan / 2 - rackR * 1.6, y: rackY - rackH * 0.46, w: rSpan + rackR * 3.2, h: rackH * 0.92 };
    for (let i = 0; i < 3; i++) {
      L.rack.push({
        kind: PLATE_KINDS[i],
        cx: cx + (i - 1) * (rSpan / 2),
        cy: rackY,
        r: rackR,
        hit: Math.max(rackR * 1.7, 36),
      });
    }

    // 下部: 左に砂入れ、右にノブ
    const by = bottom - bottomH * 0.5;
    const knobR = clamp(Math.min(availW * 0.21, bottomH * 0.38), 34, 96);
    L.knob.cx = right - knobR - clamp(availW * 0.04, 4, 22);
    // 台座（半径の1.3倍）が画面下に出ないように寄せる
    L.knob.cy = Math.min(by, bottom - knobR * 1.32);
    L.knob.r = knobR;
    L.knob.hit = knobR * 1.3;

    const bowlR = clamp(Math.min(availW * 0.17, bottomH * 0.34), 30, 84);
    L.bowl.cx = left + bowlR + clamp(availW * 0.05, 6, 26);
    L.bowl.cy = by;
    L.bowl.r = bowlR;
    L.bowl.hit = Math.max(bowlR * 1.35, 40);
  } else {
    const colW = clamp(availW * 0.20, 84, 200);
    const cw = Math.max(60, availW - colW * 2 - gap * 2);
    const plateR = Math.max(40, Math.min(availH * 0.40, cw * 0.46));
    L.plate.cx = (left + colW + right - colW) * 0.5;
    L.plate.cy = (top + bottom) * 0.5;
    L.plate.r = plateR;

    // 左列: 板ラック（縦）＋砂入れ
    const lcx = left + colW * 0.5;
    const rackBudget = availH * 0.62;
    const rackR = Math.max(14, Math.min(colW * 0.30, availH * 0.105, rackBudget / 7.4));
    const rackStep = Math.max(rackR * 2.35, Math.min(availH * 0.19, rackR * 2.7));
    const rackTop = top + rackR * 1.3;
    L.rackRail = { x: lcx - rackR * 1.65, y: rackTop - rackR * 1.45, w: rackR * 3.3, h: rackStep * 2 + rackR * 2.9 };
    for (let i = 0; i < 3; i++) {
      L.rack.push({
        kind: PLATE_KINDS[i],
        cx: lcx,
        cy: rackTop + i * rackStep,
        r: rackR,
        hit: Math.max(rackR * 1.7, 36),
      });
    }
    const bowlR = clamp(Math.min(colW * 0.42, availH * 0.19), 28, 80);
    L.bowl.cx = lcx;
    L.bowl.cy = bottom - bowlR - clamp(availH * 0.04, 4, 20);
    L.bowl.r = bowlR;
    L.bowl.hit = Math.max(bowlR * 1.35, 40);

    // 右列: ノブ＋ソケット
    const rcx = right - colW * 0.5;
    const knobR = clamp(Math.min(colW * 0.44, availH * 0.29), 36, 96);
    L.knob.cx = rcx;
    L.knob.cy = top + knobR * 1.35;
    L.knob.r = knobR;
    L.knob.hit = knobR * 1.3;

    const socketR = clamp(Math.min(colW * 0.15, availH * 0.085), 15, 34);
    const sy = bottom - socketR - clamp(availH * 0.06, 6, 30);
    const sSpan = Math.min(colW * 0.86, socketR * 6.4, Math.max(socketR * 2.4, colW - socketR * 2));
    for (let i = 0; i < 3; i++) {
      L.sockets.push({
        cx: rcx + (i - 1) * (sSpan / 2),
        cy: sy,
        r: socketR,
        hit: Math.max(socketR * 1.5, 34),
      });
    }
  }
  return L;
}
