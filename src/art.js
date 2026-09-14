// 手続き描画: 版画+水彩風の紙の世界。画像アセットは使わない。
export const INK = '#2b2420';
export const PAPER = '#f3e9d6';
export const PAPER_BACK = '#e8d8bf';

export const SCENES = {
  meadow:   { grass: '#a9cc6a', water: '#7cb8d8', forest: '#5f9a4c', rock: '#b9b1a0', road: '#e6cc92', flower: ['#f28fb1', '#f7d15c', '#ffffff'], paper: PAPER },
  forest:   { grass: '#8fb862', water: '#77b2cc', forest: '#4b7f43', rock: '#a9a394', road: '#dfc48c', flower: ['#f7d15c', '#ffffff'], paper: '#eee6cf' },
  stream:   { grass: '#a5cf74', water: '#86c6e6', forest: '#5d9a52', rock: '#b6b0a2', road: '#e8d097', flower: ['#f28fb1', '#ffffff'], paper: PAPER },
  flowers:  { grass: '#b4d67c', water: '#82bede', forest: '#5f9a4c', rock: '#b9b1a0', road: '#ebd39c', flower: ['#f28fb1', '#f7d15c', '#ffffff', '#b88ee6', '#ff9c6b'], paper: '#f6ecd8' },
  lake:     { grass: '#9fc56e', water: '#6fa9d2', forest: '#578f48', rock: '#b4ad9f', road: '#e2c88f', flower: ['#ffffff', '#f7d15c'], paper: PAPER },
  mountain: { grass: '#b3bf86', water: '#88bad5', forest: '#5c8b4d', rock: '#bfb7a8', road: '#dcc48f', flower: ['#ffffff'], paper: '#f0e7d6' },
  bridge:   { grass: '#9cc46b', water: '#6fb0d4', forest: '#55904a', rock: '#b7ae9e', road: '#e3c98e', flower: ['#f28fb1', '#f7d15c'], paper: PAPER },
  cave:     { grass: '#6d6674', water: '#557a9c', forest: '#4a4552', rock: '#7a7280', road: '#b0a8b6', flower: ['#9fd8ff'], paper: '#d9d1cf', dark: true },
  rain:     { grass: '#93b78e', water: '#7ea1b9', forest: '#54805a', rock: '#a7a49c', road: '#d6c294', flower: ['#ffffff', '#b88ee6'], paper: '#e9e4d8', rain: true },
  village:  { grass: '#b7d179', water: '#7cb8d8', forest: '#5f9a4c', rock: '#bcb3a4', road: '#e8cf95', flower: ['#f28fb1', '#f7d15c', '#ffffff'], paper: '#f5ecd9' },
};

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 紙の繊維テクスチャ。CanvasPattern を返す。
export function makePaperPattern(ctx, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = rng(1234);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(90,70,40,0.06)' : 'rgba(255,255,255,0.10)';
    const x = r() * size;
    const y = r() * size;
    g.fillRect(x, y, 1 + r() * 2, 1);
  }
  g.strokeStyle = 'rgba(90,70,40,0.05)';
  g.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    g.beginPath();
    const x = r() * size;
    const y = r() * size;
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30);
    g.stroke();
  }
  return ctx.createPattern(c, 'repeat');
}

function ink(ctx, T, w = 0.035) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = T * w;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

// ---------- 地形 ----------
export function fillTerrain(ctx, tile, x, y, T, pal, seed) {
  const ter = tile.ter;
  let col = pal.grass;
  if (ter === 'w' || ter === 'b') col = pal.water;
  else if (ter === 'f') col = pal.forest;
  else if (ter === 'm') col = pal.rock;
  else if (ter === 'd') col = pal.grass;
  else if (ter === 's') col = '#e9d9a4';
  ctx.fillStyle = col;
  ctx.fillRect(x - 0.5, y - 0.5, T + 1, T + 1);
  // 水彩の濃淡
  const r = rng(seed);
  ctx.globalAlpha = 0.07;
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff' : '#203020';
    ctx.beginPath();
    ctx.ellipse(x + r() * T, y + r() * T, T * (0.25 + r() * 0.3), T * (0.15 + r() * 0.25), r() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function decorateTerrain(ctx, tile, x, y, T, pal, seed) {
  const r = rng(seed * 7 + 3);
  const ter = tile.ter;
  if (ter === 'w' || ter === 'b') {
    ctx.strokeStyle = 'rgba(30,60,110,0.45)';
    ctx.lineWidth = T * 0.022;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const wy = y + T * (0.2 + i * 0.3) + r() * T * 0.08;
      const wx = x + r() * T * 0.3;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.quadraticCurveTo(wx + T * 0.12, wy - T * 0.06, wx + T * 0.24, wy);
      ctx.quadraticCurveTo(wx + T * 0.36, wy + T * 0.06, wx + T * 0.48, wy);
      ctx.stroke();
    }
  } else if (ter === 'f') {
    const n = 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) drawPine(ctx, x + T * (0.2 + r() * 0.6), y + T * (0.45 + r() * 0.5), T * (0.55 + r() * 0.3), pal, r);
  } else if (ter === 'm') {
    drawPeak(ctx, x + T * 0.5, y + T * 0.9, T * (0.8 + r() * 0.2), pal, r);
  } else if (ter === 'k') {
    for (let i = 0; i < 6; i++) drawFlower(ctx, x + T * (0.1 + r() * 0.8), y + T * (0.1 + r() * 0.8), T * 0.05, pal.flower[Math.floor(r() * pal.flower.length)]);
    drawTufts(ctx, x, y, T, r, 2);
  } else if (ter === 'g') {
    if (tile.walk) drawTufts(ctx, x, y, T, r, 2);
    else {
      drawTufts(ctx, x, y, T, r, 4);
      if (r() < 0.5) drawFlower(ctx, x + T * (0.2 + r() * 0.6), y + T * (0.2 + r() * 0.6), T * 0.05, pal.flower[0]);
    }
  } else if (ter === 'd') {
    // 洞窟: つらら
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 3; i++) {
      const sx = x + T * (0.1 + r() * 0.8);
      const h = T * (0.08 + r() * 0.16);
      ctx.beginPath();
      ctx.moveTo(sx - T * 0.05, y);
      ctx.lineTo(sx + T * 0.05, y);
      ctx.lineTo(sx, y + h);
      ctx.closePath();
      ctx.fill();
    }
    if (!tile.walk && r() < 0.6) drawRock(ctx, x + T * (0.3 + r() * 0.4), y + T * (0.5 + r() * 0.4), T * 0.22, pal, r);
  }
}

function drawTufts(ctx, x, y, T, r, n) {
  ctx.strokeStyle = 'rgba(30,70,20,0.5)';
  ctx.lineWidth = T * 0.02;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const tx = x + T * (0.1 + r() * 0.8);
    const ty = y + T * (0.1 + r() * 0.8);
    const s = T * 0.05;
    ctx.beginPath();
    ctx.moveTo(tx - s, ty + s);
    ctx.lineTo(tx - s * 0.6, ty - s);
    ctx.moveTo(tx, ty + s);
    ctx.lineTo(tx, ty - s * 1.3);
    ctx.moveTo(tx + s, ty + s);
    ctx.lineTo(tx + s * 0.6, ty - s);
    ctx.stroke();
  }
}

export function drawFlower(ctx, x, y, s, col) {
  ctx.fillStyle = col;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * s, y + Math.sin(a) * s, s * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#f2b422';
  ctx.beginPath();
  ctx.arc(x, y, s * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

function drawPine(ctx, x, y, h, pal, r) {
  const w = h * 0.6;
  ctx.fillStyle = '#7a4a2a';
  ctx.fillRect(x - w * 0.08, y - h * 0.18, w * 0.16, h * 0.2);
  const off = h * 0.03;
  for (let i = 0; i < 3; i++) {
    const ty = y - h * 0.15 - i * h * 0.26;
    const tw = w * (1 - i * 0.22);
    ctx.fillStyle = i % 2 ? '#3f7a3c' : '#4f8f47';
    ctx.beginPath();
    ctx.moveTo(x + off, ty + off);
    ctx.lineTo(x + tw / 2 + off, ty + off);
    ctx.lineTo(x + off, ty - h * 0.36 + off);
    ctx.lineTo(x - tw / 2 + off, ty + off);
    ctx.closePath();
    ctx.fill();
    ink(ctx, h, 0.045);
    ctx.beginPath();
    ctx.moveTo(x - tw / 2, ty);
    ctx.lineTo(x, ty - h * 0.36);
    ctx.lineTo(x + tw / 2, ty);
    ctx.stroke();
  }
}

export function drawTree(ctx, x, y, h) {
  ctx.fillStyle = '#7a4a2a';
  ctx.fillRect(x - h * 0.06, y - h * 0.35, h * 0.12, h * 0.36);
  const off = h * 0.03;
  ctx.fillStyle = '#5da54a';
  ctx.beginPath();
  ctx.arc(x + off, y - h * 0.6 + off, h * 0.32, 0, Math.PI * 2);
  ctx.arc(x - h * 0.22 + off, y - h * 0.45 + off, h * 0.22, 0, Math.PI * 2);
  ctx.arc(x + h * 0.22 + off, y - h * 0.45 + off, h * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ink(ctx, h, 0.04);
  ctx.beginPath();
  ctx.arc(x, y - h * 0.6, h * 0.32, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x - h * 0.22, y - h * 0.45, h * 0.22, Math.PI * 0.7, Math.PI * 1.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + h * 0.22, y - h * 0.45, h * 0.22, Math.PI * 1.5, Math.PI * 2.3);
  ctx.stroke();
}

function drawBush(ctx, x, y, s) {
  ctx.fillStyle = '#6fae55';
  ctx.beginPath();
  ctx.arc(x, y, s, 0, Math.PI * 2);
  ctx.arc(x - s * 0.8, y + s * 0.2, s * 0.7, 0, Math.PI * 2);
  ctx.arc(x + s * 0.8, y + s * 0.2, s * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ink(ctx, s, 0.12);
  ctx.beginPath();
  ctx.arc(x, y, s, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
}

function drawRock(ctx, x, y, s, pal, r) {
  const off = s * 0.08;
  ctx.fillStyle = '#a49b8c';
  ctx.beginPath();
  ctx.moveTo(x - s + off, y + off);
  ctx.lineTo(x - s * 0.6 + off, y - s * 0.7 + off);
  ctx.lineTo(x + s * 0.5 + off, y - s * 0.8 + off);
  ctx.lineTo(x + s + off, y - s * 0.1 + off);
  ctx.lineTo(x + s * 0.6 + off, y + s * 0.4 + off);
  ctx.lineTo(x - s * 0.7 + off, y + s * 0.4 + off);
  ctx.closePath();
  ctx.fill();
  ink(ctx, s, 0.1);
  ctx.beginPath();
  ctx.moveTo(x - s, y);
  ctx.lineTo(x - s * 0.6, y - s * 0.7);
  ctx.lineTo(x + s * 0.5, y - s * 0.8);
  ctx.lineTo(x + s, y - s * 0.1);
  ctx.stroke();
}

function drawPeak(ctx, x, y, h, pal, r) {
  const w = h * 0.9;
  const off = h * 0.02;
  ctx.fillStyle = '#9a9184';
  ctx.beginPath();
  ctx.moveTo(x - w / 2 + off, y + off);
  ctx.lineTo(x + off, y - h + off);
  ctx.lineTo(x + w / 2 + off, y + off);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + w * 0.16, y - h * 0.7);
  ctx.lineTo(x + w * 0.06, y - h * 0.66);
  ctx.lineTo(x - w * 0.04, y - h * 0.74);
  ctx.lineTo(x - w * 0.14, y - h * 0.68);
  ctx.closePath();
  ctx.fill();
  ink(ctx, h, 0.035);
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x, y - h);
  ctx.lineTo(x + w / 2, y);
  ctx.stroke();
}

// ---------- 道 ----------
function roadSegments(tile, x, y, T) {
  const cx = x + T / 2;
  const cy = y + T / 2;
  const segs = [];
  if (tile.road.N) segs.push([cx, cy, cx, y]);
  if (tile.road.S) segs.push([cx, cy, cx, y + T]);
  if (tile.road.E) segs.push([cx, cy, x + T, cy]);
  if (tile.road.W) segs.push([cx, cy, x, cy]);
  return segs;
}

export function drawRoadInk(ctx, tile, x, y, T) {
  if (!tile.walk) return;
  ctx.strokeStyle = INK;
  ctx.lineCap = 'butt';
  ctx.lineWidth = T * 0.44;
  for (const [a, b, c, d] of roadSegments(tile, x, y, T)) {
    ctx.beginPath();
    ctx.moveTo(a, b);
    ctx.lineTo(c, d);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x + T / 2, y + T / 2, T * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
}

export function drawRoadFill(ctx, tile, x, y, T, pal, seed) {
  if (!tile.walk) return;
  const bridge = tile.ter === 'b';
  const col = bridge ? '#c4915c' : tile.ter === 'd' ? pal.road : pal.road;
  ctx.strokeStyle = col;
  ctx.lineCap = 'butt';
  ctx.lineWidth = T * 0.36;
  const segs = roadSegments(tile, x, y, T);
  for (const [a, b, c, d] of segs) {
    ctx.beginPath();
    ctx.moveTo(a, b);
    ctx.lineTo(c, d);
    ctx.stroke();
  }
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(x + T / 2, y + T / 2, T * 0.18, 0, Math.PI * 2);
  ctx.fill();
  if (bridge) {
    // 板
    ctx.strokeStyle = 'rgba(60,30,10,0.5)';
    ctx.lineWidth = T * 0.02;
    for (const [a, b, c, d] of segs) {
      const dx = c - a;
      const dy = d - b;
      const len = Math.hypot(dx, dy);
      const nx = -dy / len;
      const ny = dx / len;
      for (let t = 0.12; t < 1; t += 0.14) {
        const px = a + dx * t;
        const py = b + dy * t;
        ctx.beginPath();
        ctx.moveTo(px - nx * T * 0.16, py - ny * T * 0.16);
        ctx.lineTo(px + nx * T * 0.16, py + ny * T * 0.16);
        ctx.stroke();
      }
    }
  } else {
    const r = rng(seed + 99);
    ctx.fillStyle = 'rgba(80,60,30,0.28)';
    for (const [a, b, c, d] of segs) {
      for (let i = 0; i < 2; i++) {
        const t = 0.25 + r() * 0.6;
        ctx.beginPath();
        ctx.arc(a + (c - a) * t + (r() - 0.5) * T * 0.14, b + (d - b) * t + (r() - 0.5) * T * 0.14, T * 0.02, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// ---------- 装飾物 ----------
export function drawDeco(ctx, tile, x, y, T, pal, seed) {
  const r = rng(seed + 17);
  switch (tile.deco) {
    case 'tree':
      drawTree(ctx, x + T * 0.5, y + T * 0.85, T * 0.8);
      break;
    case 'bush':
      drawBush(ctx, x + T * 0.5, y + T * 0.6, T * 0.2);
      break;
    case 'rock':
      drawRock(ctx, x + T * 0.5, y + T * 0.6, T * 0.25, pal, r);
      break;
    case 'house':
      drawHouse(ctx, x + T * 0.5, y + T * 0.24, T * 0.62, '#d9584a');
      break;
    case 'ghouse':
      drawHouse(ctx, x + T * 0.5, y + T * 0.24, T * 0.62, '#5b8bd6');
      break;
    case 'lantern':
      drawLantern(ctx, x + T * 0.5, y + T * 0.35, T * 0.3);
      break;
    default:
      break;
  }
}

function drawHouse(ctx, x, y, s, roof) {
  const off = s * 0.03;
  // 壁
  ctx.fillStyle = '#f7efdc';
  ctx.fillRect(x - s * 0.4 + off, y - s * 0.1 + off, s * 0.8, s * 0.55);
  // 屋根
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.5 + off, y - s * 0.08 + off);
  ctx.lineTo(x + off, y - s * 0.5 + off);
  ctx.lineTo(x + s * 0.5 + off, y - s * 0.08 + off);
  ctx.closePath();
  ctx.fill();
  // 戸(開いている)
  ctx.fillStyle = '#6b4a2a';
  ctx.fillRect(x - s * 0.12, y + s * 0.1, s * 0.24, s * 0.35);
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(x - s * 0.06, y + s * 0.13, s * 0.15, s * 0.32);
  // 窓
  ctx.fillStyle = '#9fd3ef';
  ctx.fillRect(x + s * 0.18, y + s * 0.02, s * 0.16, s * 0.16);
  ink(ctx, s, 0.045);
  ctx.strokeRect(x - s * 0.4, y - s * 0.1, s * 0.8, s * 0.55);
  ctx.beginPath();
  ctx.moveTo(x - s * 0.5, y - s * 0.08);
  ctx.lineTo(x, y - s * 0.5);
  ctx.lineTo(x + s * 0.5, y - s * 0.08);
  ctx.stroke();
  ctx.strokeRect(x + s * 0.18, y + s * 0.02, s * 0.16, s * 0.16);
  ctx.strokeRect(x - s * 0.12, y + s * 0.1, s * 0.24, s * 0.35);
}

function drawLantern(ctx, x, y, s) {
  ctx.fillStyle = '#5a4630';
  ctx.fillRect(x - s * 0.05, y, s * 0.1, s * 0.9);
  ctx.fillStyle = '#ffd36b';
  ctx.beginPath();
  ctx.arc(x, y - s * 0.1, s * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ink(ctx, s, 0.08);
  ctx.beginPath();
  ctx.arc(x, y - s * 0.1, s * 0.22, 0, Math.PI * 2);
  ctx.stroke();
}

// ---------- キャラクター ----------
// x,y = 足元。facing: 1 右向き / -1 左向き。
export function drawHana(ctx, x, y, T, o) {
  const s = T * 0.5;
  const { facing = 1, phase = 0, pose = 'stand' } = o;
  const bob = pose === 'walk' ? Math.abs(Math.sin(phase * Math.PI * 2)) * s * 0.06 : 0;
  const squat = pose === 'duck' ? s * 0.25 : 0;
  ctx.save();
  ctx.translate(x, y - bob + squat);
  ctx.scale(facing, 1);
  // 影
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(0, bob - squat, s * 0.32, s * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  // 脚
  const leg = pose === 'walk' ? Math.sin(phase * Math.PI * 2) * s * 0.16 : 0;
  ink(ctx, s, 0.09);
  ctx.beginPath();
  ctx.moveTo(-s * 0.1, -s * 0.3);
  ctx.lineTo(-s * 0.1 + leg, 0);
  ctx.moveTo(s * 0.1, -s * 0.3);
  ctx.lineTo(s * 0.1 - leg, 0);
  ctx.stroke();
  // 靴
  ctx.fillStyle = '#8b3a2a';
  ctx.beginPath();
  ctx.ellipse(-s * 0.1 + leg, 0, s * 0.11, s * 0.06, 0, 0, Math.PI * 2);
  ctx.ellipse(s * 0.1 - leg, 0, s * 0.11, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  // ワンピース
  const off = s * 0.025;
  ctx.fillStyle = '#f2a03d';
  ctx.beginPath();
  ctx.moveTo(-s * 0.18 + off, -s * 0.75 + off);
  ctx.lineTo(s * 0.18 + off, -s * 0.75 + off);
  ctx.lineTo(s * 0.32 + off, -s * 0.28 + off);
  ctx.lineTo(-s * 0.32 + off, -s * 0.28 + off);
  ctx.closePath();
  ctx.fill();
  ink(ctx, s, 0.07);
  ctx.beginPath();
  ctx.moveTo(-s * 0.18, -s * 0.75);
  ctx.lineTo(s * 0.18, -s * 0.75);
  ctx.lineTo(s * 0.32, -s * 0.28);
  ctx.lineTo(-s * 0.32, -s * 0.28);
  ctx.closePath();
  ctx.stroke();
  // かばん
  ctx.fillStyle = '#f5d341';
  ctx.fillRect(-s * 0.38, -s * 0.5, s * 0.2, s * 0.18);
  ink(ctx, s, 0.06);
  ctx.strokeRect(-s * 0.38, -s * 0.5, s * 0.2, s * 0.18);
  // 腕
  ink(ctx, s, 0.09);
  const armSwing = pose === 'walk' ? Math.sin(phase * Math.PI * 2) * s * 0.12 : 0;
  ctx.beginPath();
  if (pose === 'look') {
    ctx.moveTo(s * 0.2, -s * 0.7);
    ctx.lineTo(s * 0.34, -s * 0.95);
    ctx.lineTo(s * 0.2, -s * 1.02);
  } else if (pose === 'hug') {
    ctx.moveTo(s * 0.2, -s * 0.7);
    ctx.lineTo(s * 0.5, -s * 0.72);
    ctx.moveTo(-s * 0.2, -s * 0.7);
    ctx.lineTo(s * 0.45, -s * 0.62);
  } else {
    ctx.moveTo(s * 0.2, -s * 0.7);
    ctx.lineTo(s * 0.28 + armSwing, -s * 0.45);
    ctx.moveTo(-s * 0.2, -s * 0.7);
    ctx.lineTo(-s * 0.28 - armSwing, -s * 0.45);
  }
  ctx.stroke();
  // 頭
  ctx.fillStyle = '#fbe0c4';
  ctx.beginPath();
  ctx.arc(off, -s * 0.98 + off, s * 0.28, 0, Math.PI * 2);
  ctx.fill();
  // 髪
  ctx.fillStyle = '#5a3a26';
  ctx.beginPath();
  ctx.arc(0, -s * 1.02, s * 0.29, Math.PI * 0.95, Math.PI * 2.05);
  ctx.lineTo(s * 0.29, -s * 0.9);
  ctx.lineTo(s * 0.2, -s * 0.98);
  ctx.lineTo(-s * 0.2, -s * 0.98);
  ctx.lineTo(-s * 0.29, -s * 0.85);
  ctx.closePath();
  ctx.fill();
  ink(ctx, s, 0.06);
  ctx.beginPath();
  ctx.arc(0, -s * 0.98, s * 0.28, 0, Math.PI * 2);
  ctx.stroke();
  // 目・口
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(s * 0.1, -s * 0.97, s * 0.035, 0, Math.PI * 2);
  ctx.arc(s * 0.22, -s * 0.97, s * 0.035, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f0a0a0';
  ctx.beginPath();
  ctx.arc(s * 0.05, -s * 0.9, s * 0.04, 0, Math.PI * 2);
  ctx.fill();
  ink(ctx, s, 0.05);
  ctx.beginPath();
  ctx.arc(s * 0.16, -s * 0.9, s * 0.05, 0.2, Math.PI - 0.2);
  ctx.stroke();
  // 赤い帽子
  ctx.fillStyle = '#d9483b';
  ctx.beginPath();
  ctx.arc(off, -s * 1.12 + off, s * 0.3, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(s * 0.02 + off, -s * 1.12 + off, s * 0.4, s * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ink(ctx, s, 0.06);
  ctx.beginPath();
  ctx.arc(0, -s * 1.12, s * 0.3, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(s * 0.02, -s * 1.12, s * 0.4, s * 0.07, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// おばあちゃん: 常に手を振っている。
export function drawGrandma(ctx, x, y, T, time, pose = 'wave', facing = -1) {
  const s = T * 0.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.34, s * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  // ワンピース(紫)
  const off = s * 0.025;
  ctx.fillStyle = '#9a6fc4';
  ctx.beginPath();
  ctx.moveTo(-s * 0.2 + off, -s * 0.85 + off);
  ctx.lineTo(s * 0.2 + off, -s * 0.85 + off);
  ctx.lineTo(s * 0.36 + off, off);
  ctx.lineTo(-s * 0.36 + off, off);
  ctx.closePath();
  ctx.fill();
  ink(ctx, s, 0.07);
  ctx.beginPath();
  ctx.moveTo(-s * 0.2, -s * 0.85);
  ctx.lineTo(s * 0.2, -s * 0.85);
  ctx.lineTo(s * 0.36, 0);
  ctx.lineTo(-s * 0.36, 0);
  ctx.closePath();
  ctx.stroke();
  // エプロン
  ctx.fillStyle = '#fff6e5';
  ctx.beginPath();
  ctx.moveTo(-s * 0.14, -s * 0.55);
  ctx.lineTo(s * 0.14, -s * 0.55);
  ctx.lineTo(s * 0.22, -s * 0.05);
  ctx.lineTo(-s * 0.22, -s * 0.05);
  ctx.closePath();
  ctx.fill();
  // 腕
  ink(ctx, s, 0.09);
  ctx.beginPath();
  if (pose === 'hug') {
    ctx.moveTo(s * 0.2, -s * 0.75);
    ctx.lineTo(s * 0.55, -s * 0.7);
    ctx.moveTo(-s * 0.2, -s * 0.75);
    ctx.lineTo(s * 0.5, -s * 0.55);
  } else {
    const wave = Math.sin(time * 6) * 0.5;
    ctx.moveTo(s * 0.2, -s * 0.75);
    ctx.lineTo(s * 0.42, -s * 0.95);
    ctx.lineTo(s * 0.42 + Math.sin(wave) * s * 0.2, -s * 1.25 + Math.cos(wave) * s * 0.05);
    ctx.moveTo(-s * 0.2, -s * 0.75);
    ctx.lineTo(-s * 0.3, -s * 0.45);
  }
  ctx.stroke();
  // 頭
  ctx.fillStyle = '#f8ddc3';
  ctx.beginPath();
  ctx.arc(off, -s * 1.08 + off, s * 0.28, 0, Math.PI * 2);
  ctx.fill();
  // 白髪とおだんご
  ctx.fillStyle = '#e9e4dc';
  ctx.beginPath();
  ctx.arc(0, -s * 1.12, s * 0.29, Math.PI * 0.95, Math.PI * 2.05);
  ctx.lineTo(s * 0.29, -s * 1.0);
  ctx.lineTo(-s * 0.29, -s * 1.0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-s * 0.2, -s * 1.38, s * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ink(ctx, s, 0.06);
  ctx.beginPath();
  ctx.arc(0, -s * 1.08, s * 0.28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-s * 0.2, -s * 1.38, s * 0.14, 0, Math.PI * 2);
  ctx.stroke();
  // めがね・笑顔
  ink(ctx, s, 0.05);
  ctx.beginPath();
  ctx.arc(s * 0.08, -s * 1.06, s * 0.08, 0, Math.PI * 2);
  ctx.moveTo(s * 0.33, -s * 1.06);
  ctx.arc(s * 0.25, -s * 1.06, s * 0.08, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(s * 0.16, -s * 0.97, s * 0.06, 0.2, Math.PI - 0.2);
  ctx.stroke();
  ctx.fillStyle = '#f0a0a0';
  ctx.beginPath();
  ctx.arc(s * 0.0, -s * 0.98, s * 0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// お母さん: 1面の家の前で手を振る。
export function drawMom(ctx, x, y, T, time) {
  const s = T * 0.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#5a9fd4';
  const off = s * 0.025;
  ctx.beginPath();
  ctx.moveTo(-s * 0.18 + off, -s * 0.9 + off);
  ctx.lineTo(s * 0.18 + off, -s * 0.9 + off);
  ctx.lineTo(s * 0.3 + off, off);
  ctx.lineTo(-s * 0.3 + off, off);
  ctx.closePath();
  ctx.fill();
  ink(ctx, s, 0.07);
  ctx.beginPath();
  ctx.moveTo(-s * 0.18, -s * 0.9);
  ctx.lineTo(s * 0.18, -s * 0.9);
  ctx.lineTo(s * 0.3, 0);
  ctx.lineTo(-s * 0.3, 0);
  ctx.closePath();
  ctx.stroke();
  ink(ctx, s, 0.09);
  const wave = Math.sin(time * 5) * 0.5;
  ctx.beginPath();
  ctx.moveTo(s * 0.18, -s * 0.8);
  ctx.lineTo(s * 0.4, -s * 1.0);
  ctx.lineTo(s * 0.4 + Math.sin(wave) * s * 0.2, -s * 1.3);
  ctx.moveTo(-s * 0.18, -s * 0.8);
  ctx.lineTo(-s * 0.28, -s * 0.5);
  ctx.stroke();
  ctx.fillStyle = '#fbe0c4';
  ctx.beginPath();
  ctx.arc(off, -s * 1.13 + off, s * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a3a26';
  ctx.beginPath();
  ctx.arc(0, -s * 1.17, s * 0.27, Math.PI * 0.95, Math.PI * 2.05);
  ctx.lineTo(s * 0.27, -s * 1.0);
  ctx.lineTo(-s * 0.27, -s * 1.0);
  ctx.closePath();
  ctx.fill();
  ink(ctx, s, 0.06);
  ctx.beginPath();
  ctx.arc(0, -s * 1.13, s * 0.26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(s * 0.08, -s * 1.12, s * 0.03, 0, Math.PI * 2);
  ctx.arc(s * 0.2, -s * 1.12, s * 0.03, 0, Math.PI * 2);
  ctx.fill();
  ink(ctx, s, 0.05);
  ctx.beginPath();
  ctx.arc(s * 0.14, -s * 1.06, s * 0.05, 0.2, Math.PI - 0.2);
  ctx.stroke();
  ctx.restore();
}

export function drawSparkle(ctx, x, y, s, col, a) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
  ctx.restore();
}

// 机(木目)
export function drawDesk(ctx, w, h) {
  ctx.fillStyle = '#b8845a';
  ctx.fillRect(0, 0, w, h);
  const r = rng(77);
  ctx.strokeStyle = 'rgba(70,35,10,0.13)';
  const n = Math.ceil(h / 18);
  for (let i = 0; i < n; i++) {
    ctx.lineWidth = 1 + r() * 2;
    ctx.beginPath();
    let y = i * 18 + r() * 10;
    ctx.moveTo(0, y);
    for (let x = 0; x <= w; x += 40) {
      y += (r() - 0.5) * 6;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}
