// クラドニ図形の節線場（f）と、その |f| グリッド／勾配の生成。
// 粒子は毎フレーム解析式を解かず、ここで作ったグリッドをバイリニア補間で読む（モバイル軽量化）。

import { clamp, TAU } from './util.js';

export const MODE_COUNT = 12;

// 正方形板: 自由板クラドニの古典近似 cos(nPIx)cos(mPIy) -+ cos(mPIx)cos(nPIy)
const SQUARE_MODES = [
  [1, 2], [2, 3], [1, 3], [3, 4], [2, 5], [3, 5],
  [4, 5], [2, 6], [4, 6], [3, 7], [5, 7], [4, 8],
];

// 円形板: [角方向の次数 n, 半径方向の波数 k]
const CIRCLE_MODES = [
  [0, 1.3], [1, 1.6], [2, 1.9], [0, 2.4], [3, 2.1], [1, 2.9],
  [2, 3.2], [4, 2.6], [0, 3.8], [3, 3.6], [5, 3.0], [2, 4.4],
];

// 三角形板: 3方向平面波の対称和の波数
const TRI_MODES = [3.5, 4.4, 5.4, 6.4, 7.4, 8.5, 9.6, 10.8, 12.0, 13.2, 14.4, 15.6];

// 振動位置（ドライバ）の板ローカル座標。0:中央 1:角/端寄り 2:縁の中点
export const DRIVERS = {
  square:   [[0, 0], [-0.66, 0.66], [0, 0.74]],
  circle:   [[0, 0], [-0.47, 0.47], [0, 0.70]],
  triangle: [[0, 0.06], [-0.40, 0.30], [0, 0.42]],
};

// 三角形の3辺の法線方向（d_i <= 0.5 が内側）
const TRI_A = [Math.PI / 2, Math.PI / 2 + TAU / 3, Math.PI / 2 + 2 * TAU / 3];
const TRI_COS = TRI_A.map(Math.cos);
const TRI_SIN = TRI_A.map(Math.sin);

/** 板の形の内側判定（板ローカル -1..1） */
export function insideMask(kind, u, v) {
  if (kind === 'circle') return u * u + v * v <= 1;
  if (kind === 'triangle') {
    for (let i = 0; i < 3; i++) {
      if (u * TRI_COS[i] + v * TRI_SIN[i] > 0.5) return false;
    }
    return true;
  }
  return u >= -1 && u <= 1 && v >= -1 && v <= 1;
}

/**
 * 2つの基底関数 g1,g2 を返す。
 * ドライバ位置での (g1,g2) を係数に使うことで「その点が腹になるモード」が選ばれ、
 * ソケットを差し替えると模様が変わる（因果関係が見える）。
 */
function bases(kind, mi, u, v, out) {
  if (kind === 'square') {
    const m = SQUARE_MODES[mi];
    const x = (u + 1) * 0.5, y = (v + 1) * 0.5;
    const a = Math.cos(m[0] * Math.PI * x) * Math.cos(m[1] * Math.PI * y);
    const b = Math.cos(m[1] * Math.PI * x) * Math.cos(m[0] * Math.PI * y);
    out[0] = a - b;
    out[1] = (a + b) * 0.5;
  } else if (kind === 'circle') {
    const m = CIRCLE_MODES[mi];
    const n = m[0], k = m[1];
    const r = Math.sqrt(u * u + v * v);
    const th = (r < 1e-6) ? 0 : Math.atan2(v, u);
    // 中心では角方向モードは立たない（テーパーで 0 にする）
    const taper = n === 0 ? 1 : clamp(r * 3, 0, 1);
    out[0] = Math.cos(k * Math.PI * r - 0.35) * Math.cos(n * th) * taper;
    out[1] = Math.cos((k * 0.72 + 0.75) * Math.PI * r);
  } else {
    const k = TRI_MODES[mi];
    let s1 = 0, s2 = 0;
    for (let i = 0; i < 3; i++) {
      const d = u * TRI_COS[i] + v * TRI_SIN[i];
      s1 += Math.cos(k * d);
      s2 += Math.cos(2 * k * d);
    }
    out[0] = s1 / 3;
    out[1] = s2 / 3;
  }
}

const _tmp = [0, 0];
const _coefCache = new Map();

// ソケットごとの性格づけ。ドライバ位置がたまたま節に来ても
// 3つのソケットが必ず違う模様になるようにするためのバイアス。
// 0:中央=反対称（古典クラドニ） 1:角=対称 2:縁=その差
const SOCKET_BIAS = [[1.0, 0.15], [0.15, 1.0], [0.72, -0.72]];
const BIAS_W = 0.45;

/** ドライバ位置から基底の混合係数を決める */
function coefs(kind, mi, socket) {
  const key = kind + '|' + mi + '|' + socket;
  const hit = _coefCache.get(key);
  if (hit) return hit;
  const d = (DRIVERS[kind] || DRIVERS.square)[socket] || [0, 0];
  bases(kind, mi, d[0], d[1], _tmp);
  const bias = SOCKET_BIAS[socket] || SOCKET_BIAS[0];
  let a = _tmp[0] + bias[0] * BIAS_W;
  let b = _tmp[1] + bias[1] * BIAS_W;
  const norm = Math.sqrt(a * a + b * b) || 1;
  a /= norm; b /= norm;
  const out = [a, b];
  _coefCache.set(key, out);
  return out;
}

// ---- グリッド ----
export const N = 113;
export const field = {
  n: N,
  amp: new Float32Array(N * N),   // |f| を 0..1 に正規化（板外は 1.2）
  gx: new Float32Array(N * N),    // d|f|/du
  gy: new Float32Array(N * N),    // d|f|/dv
  key: '',
  kind: 'square',
  modeIndex: 0,
  blend: 0,
};

const _raw = new Float32Array(N * N);
const _in = new Uint8Array(N * N);

/**
 * ノブ値(0..1)からモード番号とブレンド量を得る。
 * 段の終わり四半分でつぎのモードへ混ざる → 崩壊して再構成する様子が見える。
 */
export function modeFromKnob(knob) {
  const t = clamp((knob - 0.045) / 0.955, 0, 1) * (MODE_COUNT - 1);
  const i = Math.min(MODE_COUNT - 1, Math.floor(t));
  const frac = t - i;
  const blend = frac > 0.72 && i < MODE_COUNT - 1 ? (frac - 0.72) / 0.28 : 0;
  return { index: i, blend, step: i };
}

/** 必要なときだけグリッドを作り直す。戻り値: 作り直したら true */
export function rebuildField(kind, knob, socket) {
  const m = modeFromKnob(knob);
  const bq = Math.round(m.blend * 12) / 12; // ブレンドは量子化して再構築回数を抑える
  const key = kind + '|' + socket + '|' + m.index + '|' + bq;
  if (key === field.key) return false;
  field.key = key;
  field.kind = kind;
  field.modeIndex = m.index;
  field.blend = bq;

  const i2 = Math.min(MODE_COUNT - 1, m.index + 1);
  const c1 = coefs(kind, m.index, socket);
  const c2 = coefs(kind, i2, socket);
  const w = bq;

  let maxAbs = 1e-6;
  for (let j = 0; j < N; j++) {
    const v = -1 + 2 * j / (N - 1);
    for (let i = 0; i < N; i++) {
      const u = -1 + 2 * i / (N - 1);
      const idx = j * N + i;
      const inside = insideMask(kind, u, v);
      _in[idx] = inside ? 1 : 0;
      bases(kind, m.index, u, v, _tmp);
      let f = (c1[0] * _tmp[0] + c1[1] * _tmp[1]) * (1 - w);
      if (w > 0) {
        bases(kind, i2, u, v, _tmp);
        f += (c2[0] * _tmp[0] + c2[1] * _tmp[1]) * w;
      }
      _raw[idx] = f;
      if (inside) {
        const a = Math.abs(f);
        if (a > maxAbs) maxAbs = a;
      }
    }
  }

  // |f| をそのまま使うと節線のまわりが平坦で砂が帯状に散らばるため、
  // べき圧縮して節線付近の勾配を強くする（模様がくっきり出る）。
  const inv = 1 / maxAbs;
  const amp = field.amp;
  for (let idx = 0; idx < N * N; idx++) {
    amp[idx] = _in[idx] ? Math.pow(Math.min(1, Math.abs(_raw[idx]) * inv), 0.6) : 1.25;
  }

  // 勾配（中心差分）
  const h = 2 / (N - 1);
  const inv2h = 1 / (2 * h);
  const gx = field.gx, gy = field.gy;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const idx = j * N + i;
      const xm = amp[j * N + (i > 0 ? i - 1 : i)];
      const xp = amp[j * N + (i < N - 1 ? i + 1 : i)];
      const ym = amp[(j > 0 ? j - 1 : j) * N + i];
      const yp = amp[(j < N - 1 ? j + 1 : j) * N + i];
      gx[idx] = (xp - xm) * inv2h;
      gy[idx] = (yp - ym) * inv2h;
    }
  }
  return true;
}

const _s = { a: 0, gx: 0, gy: 0 };

/** 板ローカル(u,v)でのバイリニア補間サンプル */
export function sampleField(u, v) {
  const fx = clamp((u + 1) * 0.5, 0, 1) * (N - 1);
  const fy = clamp((v + 1) * 0.5, 0, 1) * (N - 1);
  let i0 = fx | 0, j0 = fy | 0;
  if (i0 > N - 2) i0 = N - 2;
  if (j0 > N - 2) j0 = N - 2;
  const tx = fx - i0, ty = fy - j0;
  const i1 = i0 + 1, j1 = j0 + 1;
  const a = field.amp, gx = field.gx, gy = field.gy;
  const k00 = j0 * N + i0, k10 = j0 * N + i1, k01 = j1 * N + i0, k11 = j1 * N + i1;
  const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
  _s.a = a[k00] * w00 + a[k10] * w10 + a[k01] * w01 + a[k11] * w11;
  _s.gx = gx[k00] * w00 + gx[k10] * w10 + gx[k01] * w01 + gx[k11] * w11;
  _s.gy = gy[k00] * w00 + gy[k10] * w10 + gy[k01] * w01 + gy[k11] * w11;
  return _s;
}
