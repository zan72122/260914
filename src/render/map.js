// World map: stations joined by a winding railway. Cleared stations have a waving dog,
// the next station has the waiting locomotive, locked stations sit in fog.
import { drawLoco, drawDog } from './train.js';
import { roundRect, C } from './board.js';

export function layoutMap(W, H, safe, n) {
  const left = safe.l, w = W - safe.l - safe.r;
  const cols = w > (H - safe.t - safe.b) ? 5 : 3;
  const rows = Math.ceil(n / cols);
  const topMargin = (H - safe.t - safe.b) * 0.1, bottomMargin = (H - safe.t - safe.b) * 0.06;
  const top = safe.t + topMargin, h = H - safe.t - safe.b - topMargin - bottomMargin;
  const cw = w / cols, ch = h / rows;
  const stations = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    let col = i % cols;
    if (row % 2 === 1) col = cols - 1 - col;
    stations.push({ x: left + (col + 0.5) * cw, y: top + (row + 0.5) * ch, row, col });
  }
  const r = Math.min(cw, ch) * 0.3;
  const ML = { stations, r, cw, ch, cols, rows, W, H };
  ML.segments = stations.slice(0, -1).map((s, i) => segmentPoints(ML, i));
  return ML;
}

// Polyline from station i to station i+1. Row changes loop out sideways so the rails
// do not run through the next station's house.
function segmentPoints(ML, i) {
  const A = ML.stations[i], B = ML.stations[i + 1];
  if (A.row === B.row) return [{ x: A.x, y: A.y }, { x: B.x, y: B.y }];
  const dir = A.col === 0 ? -1 : 1; // which side of the screen we are on
  const off = Math.min(ML.cw * 0.42, ML.r * 1.6);
  const bx = A.x + dir * off;
  return [{ x: A.x, y: A.y }, { x: bx, y: A.y }, { x: bx, y: B.y }, { x: B.x, y: B.y }];
}

// Point along the rails between station a and a+1 at t in [0,1].
export function pathPoint(ML, a, t) {
  const pts = ML.segments[Math.min(a, ML.segments.length - 1)];
  const lens = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y); lens.push(l); total += l; }
  let d = t * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const k = lens[i] ? d / lens[i] : 0;
      const P = pts[i], Q = pts[i + 1];
      return { x: P.x + (Q.x - P.x) * k, y: P.y + (Q.y - P.y) * k, ang: Math.atan2(Q.y - P.y, Q.x - P.x) };
    }
    d -= lens[i];
  }
  return { x: pts[0].x, y: pts[0].y, ang: 0 };
}

export function hitStation(ML, x, y) {
  for (let i = 0; i < ML.stations.length; i++) {
    const s = ML.stations[i];
    if (Math.hypot(x - s.x, y - s.y) <= ML.r * 1.1) return i;
  }
  return -1;
}

// state: { cleared: Set(index), current: index|null, loco: {x,y,ang}, celebrate }
export function drawMap(ctx, ML, st, time) {
  const { stations, r } = ML;
  const unlocked = (i) => i === 0 || st.cleared.has(i - 1);
  // rails between stations
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < stations.length - 1; i++) {
    const pts = ML.segments[i];
    const open = unlocked(i + 1);
    for (let k = 0; k < pts.length - 1; k++) railSegment(ctx, pts[k].x, pts[k].y, pts[k + 1].x, pts[k + 1].y, r * 0.22, open);
  }
  ctx.restore();
  // stations
  stations.forEach((s, i) => {
    const cleared = st.cleared.has(i);
    const open = unlocked(i);
    drawStation(ctx, s.x, s.y, r, i, time, cleared, open);
  });
  // loco
  if (st.loco) {
    drawLoco(ctx, st.loco.x, st.loco.y, st.loco.ang, r * 1.0, { bob: st.loco.moving ? 0 : 1, time });
  }
  // fog on locked stations (drawn last so it covers rails too)
  stations.forEach((s, i) => { if (!unlocked(i)) drawFog(ctx, s.x, s.y, r, time, i); });
}

function railSegment(ctx, x1, y1, x2, y2, gauge, open) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const alpha = open ? 1 : 0.35;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = C.sleeper; ctx.lineWidth = gauge * 0.35;
  const n = Math.max(2, Math.floor(len / (gauge * 1.6)));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, px = x1 + dx * t, py = y1 + dy * t;
    ctx.beginPath(); ctx.moveTo(px - nx * gauge * 0.8, py - ny * gauge * 0.8); ctx.lineTo(px + nx * gauge * 0.8, py + ny * gauge * 0.8); ctx.stroke();
  }
  ctx.strokeStyle = C.rail; ctx.lineWidth = gauge * 0.28;
  if (!open) ctx.setLineDash([gauge * 0.6, gauge * 0.6]);
  for (const off of [-gauge * 0.5, gauge * 0.5]) {
    ctx.beginPath(); ctx.moveTo(x1 + nx * off, y1 + ny * off); ctx.lineTo(x2 + nx * off, y2 + ny * off); ctx.stroke();
  }
  ctx.restore();
}

const HOUSE_COLS = ['#f7b267', '#8ecae6', '#f4a4c0', '#b5e48c', '#ffd166', '#cdb4db', '#90dbf4'];

function drawStation(ctx, x, y, r, i, time, cleared, open) {
  ctx.save();
  ctx.translate(x, y);
  // house sits above the rails, platform just below them
  const hy = -r * 0.95;
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath(); ctx.ellipse(r * 0.05, r * 0.5, r * 0.85, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#3a2e2a'; ctx.lineWidth = Math.max(1.5, r * 0.06);
  const col = HOUSE_COLS[i % HOUSE_COLS.length];
  ctx.fillStyle = col;
  roundRect(ctx, -r * 0.42, hy - r * 0.3, r * 0.84, r * 0.62, r * 0.08); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#d9534f';
  ctx.beginPath(); ctx.moveTo(-r * 0.55, hy - r * 0.28); ctx.lineTo(0, hy - r * 0.75); ctx.lineTo(r * 0.55, hy - r * 0.28); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff6d6';
  roundRect(ctx, -r * 0.14, hy - r * 0.12, r * 0.28, r * 0.26, r * 0.05); ctx.fill(); ctx.stroke();
  // platform (below rails)
  ctx.fillStyle = '#e9d8a6';
  roundRect(ctx, -r * 0.8, r * 0.28, r * 1.6, r * 0.26, r * 0.08); ctx.fill(); ctx.stroke();
  if (cleared) {
    const wave = Math.sin(time * 8 + i) * 0.5;
    ctx.save();
    ctx.translate(r * 0.72, hy + r * 0.15);
    drawDog(ctx, 0, 0, r * 0.22, 'joy', time);
    ctx.strokeStyle = '#3a2e2a'; ctx.lineWidth = Math.max(1.5, r * 0.07); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(r * 0.2, r * 0.05); ctx.lineTo(r * 0.42, -r * 0.25 + wave * r * 0.15); ctx.stroke();
    ctx.fillStyle = '#f5d9a8'; ctx.beginPath(); ctx.arc(r * 0.42, -r * 0.25 + wave * r * 0.15, r * 0.07, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#3a2e2a'; ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.beginPath(); ctx.moveTo(-r * 0.7, hy + r * 0.3); ctx.lineTo(-r * 0.7, hy - r * 0.5); ctx.stroke();
    ctx.fillStyle = '#e8503a';
    ctx.beginPath(); ctx.moveTo(-r * 0.7, hy - r * 0.5); ctx.lineTo(-r * 0.4 + Math.sin(time * 6) * r * 0.04, hy - r * 0.4); ctx.lineTo(-r * 0.7, hy - r * 0.3); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawFog(ctx, x, y, r, time, seed) {
  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = '#e6ecf0';
  for (let k = 0; k < 6; k++) {
    const a = k * 1.05 + seed, dx = Math.cos(a) * r * 0.6 + Math.sin(time * 0.7 + k) * r * 0.05, dy = Math.sin(a) * r * 0.6 - r * 0.4;
    ctx.beginPath(); ctx.arc(x + dx, y + dy, r * (0.45 + (k % 3) * 0.08), 0, Math.PI * 2); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(x, y - r * 0.5, r * 0.75, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
