// ボウルから板へ飛んでいく砂（スクリーン座標）。
// 指がボウルの上（＝板の外）にあるときでも、砂がちゃんと板に届くようにするための演出兼ロジック。
// 着地した瞬間に板ローカル座標の粒へ変換して pour する。

import { state } from './state.js';
import { pour, sand } from './sand.js';
import { insideMask } from './field.js';
import { TAU } from './util.js';

const MAX_FLIGHT = 420;
const SPREAD = 0.75;   // 板全体にちらばるように落とす（板ローカル単位）

/** 板の上のランダムな着地点（板ローカル）を選ぶ */
function pickTarget(kind) {
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * TAU;
    const r = Math.sqrt(Math.random()) * SPREAD;
    const u = Math.cos(a) * r;
    const v = Math.sin(a) * r + (kind === 'triangle' ? 0.05 : 0);
    if (insideMask(kind, u, v)) return [u, v];
  }
  return [0, kind === 'triangle' ? 0.05 : 0];
}

/** ボウル（指の位置）から板へ砂を飛ばす */
export function spawnFlight(kind, sx, sy, count) {
  let added = 0;
  for (let i = 0; i < count; i++) {
    if (state.flight.length >= MAX_FLIGHT) break;
    if (sand.n + state.flight.length >= sand.max) break;
    const t = pickTarget(kind);
    state.flight.push({
      x0: sx + (Math.random() - 0.5) * 14,
      y0: sy + (Math.random() - 0.5) * 10,
      tu: t[0], tv: t[1],
      t: 0,
      dur: 21 + Math.random() * 9,   // 0.35〜0.5秒（フレーム単位）
      arc: 0.18 + Math.random() * 0.14,
      x: sx, y: sy,
    });
    added++;
  }
  return added;
}

/** 飛翔中の砂を進め、着地したら板の上の粒にする */
export function updateFlight(L, dt, kind) {
  const f = state.flight;
  if (!f.length || !L) return;
  const p = L.plate;
  for (let i = f.length - 1; i >= 0; i--) {
    const g = f[i];
    g.t += dt;
    const k = g.t / g.dur;
    const tx = p.cx + g.tu * p.r;
    const ty = p.cy + g.tv * p.r;
    if (k >= 1) {
      pour(kind, g.tu, g.tv, 1, 0.03);
      f.splice(i, 1);
      continue;
    }
    const d = Math.abs(tx - g.x0) + Math.abs(ty - g.y0);
    g.x = g.x0 + (tx - g.x0) * k;
    g.y = g.y0 + (ty - g.y0) * k - Math.sin(k * Math.PI) * d * g.arc;
  }
}
