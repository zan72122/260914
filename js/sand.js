// 砂粒のシミュレーション。座標は「板ローカル (-1..1)」で持つので、
// 画面回転・レイアウト変更・板サイズ変更があっても模様はそのまま保たれる。

import { sampleField, insideMask } from './field.js';
import { clamp, TAU } from './util.js';

const ATTR = 5.0e-5;   // 節線への引き込み（勾配降下）の強さ
const JIT = 0.016;     // ランダム跳ね（振幅の2乗に比例＝節線の上ではほとんど跳ねない）
const DAMP = 0.86;     // 速度減衰（1フレームあたり）
const GRAV = 0.0026;   // こぼれ落ちる砂の加速度

export const sand = {
  max: 2000,
  n: 0,
  u: null, v: null, vu: null, vv: null,
  st: null,     // 0 = 板の上, 1 = こぼれ落ち中
  life: null,   // 落下中の残り寿命 / 着地エフェクト量
  bright: null, // 粒ごとの明度ばらつき
  onPlate: 0,
  meanAmp: 1,
};

export function initSand(max) {
  sand.max = max;
  sand.u = new Float32Array(max);
  sand.v = new Float32Array(max);
  sand.vu = new Float32Array(max);
  sand.vv = new Float32Array(max);
  sand.st = new Uint8Array(max);
  sand.life = new Float32Array(max);
  sand.bright = new Float32Array(max);
  sand.n = 0;
  sand.onPlate = 0;
  sand.meanAmp = 1;
}

/** 容量を変えても既存の粒はできるだけ残す（回転時のリサイズ用） */
export function resizeSand(max) {
  if (!sand.u) { initSand(max); return; }
  if (max === sand.max) return;
  const keep = Math.min(sand.n, max);
  const nu = new Float32Array(max), nv = new Float32Array(max);
  const nvu = new Float32Array(max), nvv = new Float32Array(max);
  const nst = new Uint8Array(max), nl = new Float32Array(max), nb = new Float32Array(max);
  nu.set(sand.u.subarray(0, keep)); nv.set(sand.v.subarray(0, keep));
  nvu.set(sand.vu.subarray(0, keep)); nvv.set(sand.vv.subarray(0, keep));
  nst.set(sand.st.subarray(0, keep)); nl.set(sand.life.subarray(0, keep));
  nb.set(sand.bright.subarray(0, keep));
  sand.u = nu; sand.v = nv; sand.vu = nvu; sand.vv = nvv;
  sand.st = nst; sand.life = nl; sand.bright = nb;
  sand.max = max; sand.n = keep;
}

function removeAt(i) {
  const last = sand.n - 1;
  if (i !== last) {
    sand.u[i] = sand.u[last]; sand.v[i] = sand.v[last];
    sand.vu[i] = sand.vu[last]; sand.vv[i] = sand.vv[last];
    sand.st[i] = sand.st[last]; sand.life[i] = sand.life[last];
    sand.bright[i] = sand.bright[last];
  }
  sand.n = last;
}

/** 砂を落とす。板の外なら即こぼれる。 */
export function pour(kind, u0, v0, count, spread) {
  let added = 0;
  for (let c = 0; c < count; c++) {
    if (sand.n >= sand.max) break;
    const a = Math.random() * TAU;
    const rr = Math.sqrt(Math.random()) * spread;
    const u = u0 + Math.cos(a) * rr;
    const v = v0 + Math.sin(a) * rr;
    const i = sand.n++;
    sand.u[i] = u; sand.v[i] = v;
    sand.vu[i] = (Math.random() - 0.5) * 0.004;
    sand.vv[i] = (Math.random() - 0.5) * 0.004;
    sand.bright[i] = 0.72 + Math.random() * 0.28;
    if (insideMask(kind, u, v)) {
      sand.st[i] = 0;
      sand.life[i] = 1;      // 着地きらめき
    } else {
      sand.st[i] = 1;
      sand.life[i] = 1;
      sand.vv[i] = 0.004;
    }
    added++;
  }
  return added;
}

/** 指のまわりの砂を散らす（こする／タップ） */
export function scatter(u0, v0, radius, power) {
  const r2 = radius * radius;
  for (let i = 0; i < sand.n; i++) {
    if (sand.st[i] !== 0) continue;
    const du = sand.u[i] - u0, dv = sand.v[i] - v0;
    const d2 = du * du + dv * dv;
    if (d2 > r2) continue;
    const d = Math.sqrt(d2) + 1e-5;
    const f = (1 - d / radius) * power;
    sand.vu[i] += (du / d) * f + (Math.random() - 0.5) * f * 0.8;
    sand.vv[i] += (dv / d) * f + (Math.random() - 0.5) * f * 0.8;
  }
}

/** 板全体の砂を吹き飛ばす */
export function scatterAll(power) {
  for (let i = 0; i < sand.n; i++) {
    if (sand.st[i] !== 0) continue;
    sand.vu[i] += (Math.random() - 0.5) * power;
    sand.vv[i] += (Math.random() - 0.5) * power;
  }
}

/** 板を載せ替えるとき: 一部を残して残りはこぼす */
export function spill(keepRatio) {
  for (let i = 0; i < sand.n; i++) {
    if (sand.st[i] !== 0) continue;
    if (Math.random() < keepRatio) continue;
    sand.st[i] = 1;
    sand.life[i] = 1;
    sand.vv[i] = 0.002 + Math.random() * 0.004;
    sand.vu[i] = (Math.random() - 0.5) * 0.01;
  }
}

/** 新しい板の形からはみ出した粒をこぼす */
export function clipToPlate(kind) {
  for (let i = 0; i < sand.n; i++) {
    if (sand.st[i] !== 0) continue;
    if (!insideMask(kind, sand.u[i], sand.v[i])) {
      sand.st[i] = 1;
      sand.life[i] = 1;
      sand.vv[i] = 0.003;
    }
  }
}

/**
 * 1ステップ進める。
 * @param {number} dt フレーム単位の時間（1 = 1/60秒）
 * @param {number} vib 振動の強さ 0..1（0なら砂は静止）
 * @param {number} shock 場が切り替わった直後の衝撃 0..1（模様が崩れて見える）
 */
export function updateSand(dt, vib, kind, shock) {
  const dampf = Math.pow(DAMP, dt);
  let sum = 0, cnt = 0;
  for (let i = 0; i < sand.n; i++) {
    if (sand.st[i] === 1) {
      sand.vv[i] += GRAV * dt;
      sand.u[i] += sand.vu[i] * dt;
      sand.v[i] += sand.vv[i] * dt;
      sand.life[i] -= 0.022 * dt;
      if (sand.life[i] <= 0) { removeAt(i); i--; }
      continue;
    }
    const u = sand.u[i], v = sand.v[i];
    const s = sampleField(u, v);
    let vu = sand.vu[i], vv = sand.vv[i];
    if (vib > 0) {
      vu += (-s.gx * ATTR * vib) * dt;
      vv += (-s.gy * ATTR * vib) * dt;
    }
    vu *= dampf; vv *= dampf;
    let nu = u + vu * dt;
    let nv = v + vv * dt;
    if (vib > 0) {
      const j = JIT * s.a * s.a * vib * (1 + shock * 4) * dt;
      nu += (Math.random() - 0.5) * j;
      nv += (Math.random() - 0.5) * j;
      if (shock > 0.01) {
        const kick = 0.0022 * shock * s.a * dt;
        sand.vu[i] += (Math.random() - 0.5) * kick;
        sand.vv[i] += (Math.random() - 0.5) * kick;
      }
    }
    sand.vu[i] = vu; sand.vv[i] = vv;
    sand.u[i] = nu; sand.v[i] = nv;
    if (sand.life[i] > 0) sand.life[i] = Math.max(0, sand.life[i] - 0.05 * dt);

    if (!insideMask(kind, nu, nv)) {
      // 板の縁からこぼれ落ちる
      sand.st[i] = 1;
      sand.life[i] = 1;
      sand.vv[i] = Math.max(0.002, vv);
      continue;
    }
    sum += s.a; cnt++;
  }
  sand.onPlate = cnt;
  sand.meanAmp = cnt > 0 ? sum / cnt : 1;
}
