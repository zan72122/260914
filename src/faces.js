// 紙の「表面」と各辺の「裏面ストリップ」をオフスクリーンに描いてキャッシュする。
import { N, SIDES, SIDE_INFO } from './paper.js';
import { SCENES, fillTerrain, decorateTerrain, drawRoadInk, drawRoadFill, drawDeco, makePaperPattern, INK } from './art.js';

export const MARGIN_RATIO = 0.12;

let pattern = null;

function paperBg(g, w, h, col, dark) {
  g.fillStyle = col;
  g.fillRect(0, 0, w, h);
  if (!pattern) pattern = makePaperPattern(g);
  g.fillStyle = pattern;
  g.globalAlpha = dark ? 0.5 : 1;
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 1;
}

function drawTiles(g, tiles, T, pal, seedBase) {
  // tiles: [{tile, x, y, seed}]
  for (const t of tiles) if (t.tile) fillTerrain(g, t.tile, t.x, t.y, T, pal, seedBase + t.seed);
  for (const t of tiles) if (t.tile) drawRoadInk(g, t.tile, t.x, t.y, T);
  for (const t of tiles) if (t.tile) drawRoadFill(g, t.tile, t.x, t.y, T, pal, seedBase + t.seed);
  for (const t of tiles) if (t.tile) decorateTerrain(g, t.tile, t.x, t.y, T, pal, seedBase + t.seed);
  for (const t of tiles) if (t.tile) drawDeco(g, t.tile, t.x, t.y, T, pal, seedBase + t.seed);
}

function darken(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}

export function renderFaces(level, T) {
  const pal = SCENES[level.scene] || SCENES.meadow;
  const M = Math.round(T * MARGIN_RATIO);
  const P = N * T + 2 * M;
  const front = document.createElement('canvas');
  front.width = front.height = P;
  const g = front.getContext('2d');
  paperBg(g, P, P, pal.paper, pal.dark);
  const tiles = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) tiles.push({ tile: level.front[r][c], x: M + c * T, y: M + r * T, seed: r * 31 + c * 7 });
  drawTiles(g, tiles, T, pal, level.index * 1000);
  // 折り目(筋)
  for (const s of level.sides) {
    const info = SIDE_INFO[s];
    const p = M + info.crease * T;
    g.strokeStyle = 'rgba(60,40,20,0.22)';
    g.lineWidth = Math.max(1, T * 0.012);
    g.setLineDash([T * 0.06, T * 0.05]);
    g.beginPath();
    if (info.axis === 'x') {
      g.moveTo(p, 0);
      g.lineTo(p, P);
    } else {
      g.moveTo(0, p);
      g.lineTo(P, p);
    }
    g.stroke();
    g.setLineDash([]);
  }
  // 紙の縁
  g.strokeStyle = 'rgba(60,40,20,0.18)';
  g.lineWidth = Math.max(1, T * 0.01);
  g.strokeRect(0.5, 0.5, P - 1, P - 1);

  const backs = {};
  for (const s of SIDES) {
    const info = SIDE_INFO[s];
    const L = T + M;
    const c = document.createElement('canvas');
    if (info.axis === 'x') {
      c.width = L;
      c.height = P;
    } else {
      c.width = P;
      c.height = L;
    }
    const b = c.getContext('2d');
    paperBg(b, c.width, c.height, darken(pal.paper, 0.9), pal.dark);
    const tOff = info.out > 0 ? M : 0;
    const bt = [];
    for (let i = 0; i < N; i++) {
      const tile = level.flaps[s][i];
      if (info.axis === 'x') bt.push({ tile, x: tOff, y: M + i * T, seed: 500 + i });
      else bt.push({ tile, x: M + i * T, y: tOff, seed: 600 + i });
    }
    drawTiles(b, bt, T, pal, level.index * 1000 + 77);
    // 裏面は少し影がかる
    b.fillStyle = 'rgba(80,50,20,0.06)';
    b.fillRect(0, 0, c.width, c.height);
    b.strokeStyle = 'rgba(60,40,20,0.18)';
    b.lineWidth = Math.max(1, T * 0.01);
    b.strokeRect(0.5, 0.5, c.width - 1, c.height - 1);
    backs[s] = c;
  }
  return { front, backs, T, M, P, pal };
}

export { INK };
