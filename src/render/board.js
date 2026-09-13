// Draws the board: ground, empty roadbed, rocks, trees, rails, junctions, ghost hint, glow.
import { PIECES, OPP, effectiveCell, openSides } from '../sim/grid.js';
import { railPoints, sidePath } from './geom.js';

export const C = {
  grass: '#7fc96b', grassDark: '#6ab558', bed: '#e9d8a6', bedEdge: '#d9c48a', gravel: '#cbb37a',
  sleeper: '#8b5a2b', rail: '#6d6d75', railLight: '#9a9aa4', rock: '#9b9b93', rockDark: '#6f6f68',
  trunk: '#8b5a2b', leaf: '#3e9b4f', leafLight: '#63c46f', glow: 'rgba(255, 230, 120, 0.55)',
  ghost: 'rgba(80, 80, 90, 0.55)', sky1: '#bfe9ff', sky2: '#e8f7ff', hill: '#9ad48a',
};

// Layout: { ox, oy, cs, cols, rows }
export function cellCenter(L, x, y) {
  return { x: L.ox + (x + 0.5) * L.cs, y: L.oy + (y + 0.5) * L.cs };
}

export function drawGround(ctx, L, time) {
  const w = L.cols * L.cs, h = L.rows * L.cs, r = L.cs * 0.25;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  roundRect(ctx, L.ox + L.cs * 0.06, L.oy + L.cs * 0.1, w, h, r); ctx.fill();
  ctx.fillStyle = C.grass;
  roundRect(ctx, L.ox, L.oy, w, h, r); ctx.fill();
  // subtle grass tufts
  ctx.strokeStyle = C.grassDark; ctx.lineWidth = Math.max(1, L.cs * 0.03); ctx.lineCap = 'round';
  for (let y = 0; y < L.rows; y++) for (let x = 0; x < L.cols; x++) {
    const c = cellCenter(L, x, y);
    const k = (x * 7 + y * 13) % 5;
    for (let i = 0; i < 2; i++) {
      const gx = c.x + ((k + i * 2) % 4 - 1.5) * L.cs * 0.22, gy = c.y + ((k * 3 + i) % 3 - 1) * L.cs * 0.25;
      ctx.beginPath(); ctx.moveTo(gx, gy + L.cs * 0.05); ctx.lineTo(gx + L.cs * 0.03, gy - L.cs * 0.06); ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawCells(ctx, L, level, placed, time) {
  for (let y = 0; y < L.rows; y++) for (let x = 0; x < L.cols; x++) {
    const cell = level.cells[y][x];
    const c = cellCenter(L, x, y);
    if (cell.kind === 'empty') drawBed(ctx, c, L.cs, placed.has(`${x},${y}`));
  }
  for (let y = 0; y < L.rows; y++) for (let x = 0; x < L.cols; x++) {
    const cell = level.cells[y][x];
    const c = cellCenter(L, x, y);
    if (cell.kind === 'rock') drawRock(ctx, c, L.cs, x + y);
    if (cell.kind === 'tree') drawTree(ctx, c, L.cs, time, x * 3 + y);
  }
}

function drawBed(ctx, c, cs, hasTrack) {
  const s = cs * 0.86;
  ctx.save();
  ctx.fillStyle = C.bed;
  roundRect(ctx, c.x - s / 2, c.y - s / 2, s, s, cs * 0.12); ctx.fill();
  ctx.strokeStyle = C.bedEdge; ctx.lineWidth = Math.max(1, cs * 0.025); ctx.stroke();
  if (!hasTrack) {
    // gravel dots: "roadbed waiting for rails"
    ctx.fillStyle = C.gravel;
    for (let i = 0; i < 6; i++) {
      const a = i * 1.7, r = cs * (0.12 + (i % 3) * 0.08);
      ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, cs * 0.028, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

function drawRock(ctx, c, cs, seed) {
  ctx.save();
  ctx.translate(c.x, c.y + cs * 0.05);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath(); ctx.ellipse(0, cs * 0.22, cs * 0.34, cs * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.rock; ctx.strokeStyle = C.rockDark; ctx.lineWidth = Math.max(1.5, cs * 0.04);
  ctx.beginPath();
  ctx.moveTo(-cs * 0.32, cs * 0.18); ctx.lineTo(-cs * 0.28, -cs * 0.12); ctx.lineTo(-cs * 0.05, -cs * 0.3);
  ctx.lineTo(cs * 0.2, -cs * 0.26); ctx.lineTo(cs * 0.33, 0); ctx.lineTo(cs * 0.27, cs * 0.2); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.ellipse(-cs * 0.08, -cs * 0.14, cs * 0.1, cs * 0.05, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawTree(ctx, c, cs, time, seed) {
  const sway = Math.sin(time * 1.3 + seed) * cs * 0.015;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath(); ctx.ellipse(cs * 0.04, cs * 0.3, cs * 0.28, cs * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.trunk;
  roundRect(ctx, -cs * 0.06, cs * 0.05, cs * 0.12, cs * 0.28, cs * 0.04); ctx.fill();
  ctx.strokeStyle = '#2f7a3b'; ctx.lineWidth = Math.max(1.5, cs * 0.04);
  ctx.fillStyle = C.leaf;
  ctx.beginPath(); ctx.arc(sway, -cs * 0.08, cs * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.leafLight;
  ctx.beginPath(); ctx.arc(sway - cs * 0.08, -cs * 0.16, cs * 0.14, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ---- rails --------------------------------------------------------------
function railPairs(cell) {
  if (!cell) return [];
  if (cell.kind === 'track') return [PIECES[cell.piece]];
  if (cell.kind === 'junction') return cell.branches.map((b) => [b, cell.trunk]);
  return [];
}

export function drawTracks(ctx, L, level, placed, opts = {}) {
  const pairs = [];
  for (let y = 0; y < L.rows; y++) for (let x = 0; x < L.cols; x++) {
    const cell = effectiveCell(level, placed, x, y);
    for (const [a, b] of railPairs(cell)) pairs.push({ c: cellCenter(L, x, y), a, b, fixed: !!cell.fixed });
  }
  ctx.save();
  ctx.lineCap = 'round';
  // sleepers
  for (const p of pairs) drawSleepers(ctx, p.c, L.cs, p.a, p.b);
  // rails
  for (const p of pairs) drawRails(ctx, p.c, L.cs, p.a, p.b, C.rail, C.railLight);
  ctx.restore();
}

function drawSleepers(ctx, c, cs, a, b) {
  const pts = railPoints(a, b, 7);
  ctx.strokeStyle = C.sleeper; ctx.lineWidth = Math.max(2, cs * 0.075);
  const n = a === OPP[b] ? 4 : 5;
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5) / n;
    const p = sampleAt(pts, a, b, s);
    const nx = -Math.sin(p.ang), ny = Math.cos(p.ang);
    const half = cs * 0.24;
    ctx.beginPath();
    ctx.moveTo(c.x + (p.x - nx * half / cs) * cs, c.y + (p.y - ny * half / cs) * cs);
    ctx.lineTo(c.x + (p.x + nx * half / cs) * cs, c.y + (p.y + ny * half / cs) * cs);
    ctx.stroke();
  }
}

function sampleAt(pts, a, b, s) { return sidePath(a, b, s); }

export function drawRails(ctx, c, cs, a, b, color, light, dashed = false) {
  const gauge = cs * 0.16;
  const n = 14;
  ctx.lineWidth = Math.max(1.5, cs * 0.055);
  if (dashed) ctx.setLineDash([cs * 0.08, cs * 0.07]); else ctx.setLineDash([]);
  for (const off of [-gauge, gauge]) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const p = sidePath(a, b, i / n);
      const nx = -Math.sin(p.ang), ny = Math.cos(p.ang);
      const x = c.x + p.x * cs + nx * off, y = c.y + p.y * cs + ny * off;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

// Pulsing dotted rails on the cell where the train would get stuck.
export function drawGhost(ctx, L, x, y, piece, time) {
  const [a, b] = PIECES[piece];
  const c = cellCenter(L, x, y);
  const pulse = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(time * 5));
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.lineCap = 'round';
  drawRails(ctx, c, L.cs, a, b, '#3b3b46', '#3b3b46', true);
  ctx.restore();
}

// Soft glow along the connected path (rail cells the train will travel).
export function drawGlow(ctx, L, cells, time) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  let i = 0;
  for (const key of cells) {
    const [x, y] = key.split(',').map(Number);
    const c = cellCenter(L, x, y);
    const a = 0.25 + 0.25 * (0.5 + 0.5 * Math.sin(time * 4 - i * 0.6));
    ctx.fillStyle = `rgba(255, 235, 130, ${a})`;
    ctx.beginPath(); ctx.arc(c.x, c.y, L.cs * 0.5, 0, Math.PI * 2); ctx.fill();
    i++;
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
