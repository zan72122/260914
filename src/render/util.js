// 絵本っぽい「丸くて太い」描画のための小道具
export const PAL = {
  skyTop: '#ffe3b0',
  skyMid: '#ffc98c',
  skyLow: '#f4a86b',
  ground: '#cf9457',
  groundDark: '#b97a43',
  board: '#b3793f',
  boardDark: '#94602f',
  wood: '#d9a568',
  woodDark: '#b07c42',
  ink: '#5a3520',
  skin: '#f6d2ae',
  skinDark: '#e0b189',
  cloth: '#8fb9a8',
  clothDark: '#6f9c8b',
  hair: '#52392c',
  nest: '#e6c185',
  nestDark: '#c49a5c',
  ember: '#ff5a2b',
  emberHot: '#ffd07a',
};

export function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

// 太いやわらかい輪郭つきの塗り
export function blob(ctx, path, fill, s, outline = PAL.ink, lw = 3.2) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  path();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw * s;
  ctx.strokeStyle = outline;
  ctx.globalAlpha = 0.55;
  ctx.stroke();
  ctx.restore();
}

export function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

export function lerp(a, b, t) { return a + (b - a) * t; }

export function mixHex(a, b, t) {
  const ca = hex(a), cb = hex(b);
  return `rgb(${Math.round(lerp(ca[0], cb[0], t))},${Math.round(lerp(ca[1], cb[1], t))},${Math.round(lerp(ca[2], cb[2], t))})`;
}

function hex(h) {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// 木粉の色：茶 → こげ茶 → 黒
export function dustColor(level) {
  return level < 0.5
    ? mixHex('#b9823f', '#5c3a1d', level / 0.5)
    : mixHex('#5c3a1d', '#241a15', (level - 0.5) / 0.5);
}
