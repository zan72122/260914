// 木目テーブル背景（サイズ変化時だけオフスクリーンへ焼き直す）
import { noise1, TAU } from '../util.js';

let cache = null;

export function drawTable(ctx, w, h, variantId = 0) {
  if (!cache || cache.w !== w || cache.h !== h || cache.v !== variantId) {
    cache = { w, h, v: variantId, cv: bake(w, h, variantId) };
  }
  ctx.drawImage(cache.cv, 0, 0, w, h);
}

function bake(w, h, v) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w));
  cv.height = Math.max(1, Math.round(h));
  const c = cv.getContext('2d');
  const tones = [
    ['#b0793f', '#8a5628', '#6d4020'],
    ['#bb8850', '#96632f', '#754622'],
    ['#a97544', '#855128', '#663c1e'],
  ][v % 3];

  const g = c.createLinearGradient(0, 0, w * 0.35, h);
  g.addColorStop(0, tones[0]);
  g.addColorStop(0.55, tones[1]);
  g.addColorStop(1, tones[2]);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);

  // 板の継ぎ目（長辺方向に走らせる）
  const horiz = w >= h;
  const span = horiz ? h : w;
  const planks = 5;
  const pw = span / planks;
  c.save();
  for (let i = 0; i <= planks; i++) {
    const p = i * pw;
    c.globalAlpha = 0.22;
    c.strokeStyle = '#4e2c14';
    c.lineWidth = Math.max(1.5, span * 0.006);
    c.beginPath();
    if (horiz) { c.moveTo(0, p); c.lineTo(w, p); } else { c.moveTo(p, 0); c.lineTo(p, h); }
    c.stroke();
    c.globalAlpha = 0.16;
    c.strokeStyle = '#d8a468';
    c.beginPath();
    const o = Math.max(1, span * 0.004);
    if (horiz) { c.moveTo(0, p + o); c.lineTo(w, p + o); } else { c.moveTo(p + o, 0); c.lineTo(p + o, h); }
    c.stroke();
  }
  c.restore();

  // 木目の筋
  const lines = Math.round(span / 7);
  c.save();
  c.lineWidth = Math.max(1, span * 0.0035);
  for (let i = 0; i < lines; i++) {
    const base = (i / lines) * span;
    const dark = i % 3 === 0;
    c.globalAlpha = dark ? 0.13 : 0.07;
    c.strokeStyle = dark ? '#4a2a12' : '#e0b075';
    c.beginPath();
    const len = horiz ? w : h;
    for (let s = 0; s <= len; s += Math.max(6, len / 60)) {
      const wob = (noise1(s / (len * 0.16) + i * 3.1, v + 1) - 0.5) * pw * 0.55;
      const q = base + wob;
      if (s === 0) { horiz ? c.moveTo(0, q) : c.moveTo(q, 0); }
      else { horiz ? c.lineTo(s, q) : c.lineTo(q, s); }
    }
    c.stroke();
  }
  c.restore();

  // 節
  c.save();
  for (let i = 0; i < 4; i++) {
    const kx = w * (0.13 + 0.24 * i + noise1(i * 7.7, v) * 0.08);
    const ky = h * (0.18 + noise1(i * 3.3 + 11, v) * 0.66);
    const kr = span * (0.02 + noise1(i * 5.5, v) * 0.02);
    for (let r = kr; r > kr * 0.25; r -= kr * 0.22) {
      c.globalAlpha = 0.10;
      c.strokeStyle = '#523015';
      c.lineWidth = Math.max(1, kr * 0.13);
      c.beginPath();
      c.ellipse(kx, ky, r, r * 0.62, 0.5, 0, TAU);
      c.stroke();
    }
  }
  c.restore();

  // 周辺減光＋上からの光
  const vg = c.createRadialGradient(w * 0.5, h * 0.42, Math.min(w, h) * 0.18, w * 0.5, h * 0.5, Math.max(w, h) * 0.78);
  vg.addColorStop(0, 'rgba(255,240,210,0.16)');
  vg.addColorStop(0.58, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(40,18,4,0.42)');
  c.fillStyle = vg;
  c.fillRect(0, 0, w, h);
  return cv;
}

export function invalidateTable() { cache = null; }
