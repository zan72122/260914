// Terrain: closed polygons in world space. Cells are pushed out of them.

export function buildPolygon(points) {
  const n = points.length;
  const edges = [];
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    let nx = dy / len, ny = -dx / len;
    // Flip so that normal points outward.
    const mx = (a[0] + b[0]) / 2 + nx * 0.5, my = (a[1] + b[1]) / 2 + ny * 0.5;
    if (pointInPolygon(points, mx, my)) { nx = -nx; ny = -ny; }
    edges.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], dx, dy, len, nx, ny });
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
  }
  return { points, edges, minX, minY, maxX, maxY };
}

export function pointInPolygon(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Resolve one circle (x, y, r) against a polygon. Returns null or {x, y, nx, ny}.
export function resolveCircle(poly, x, y, r) {
  if (x < poly.minX - r || x > poly.maxX + r || y < poly.minY - r || y > poly.maxY + r) return null;
  let best = null, bestD = Infinity;
  for (const e of poly.edges) {
    let t = ((x - e.ax) * e.dx + (y - e.ay) * e.dy) / (e.len * e.len);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = e.ax + e.dx * t, qy = e.ay + e.dy * t;
    const d = Math.hypot(x - qx, y - qy);
    if (d < bestD) { bestD = d; best = { qx, qy, e, t }; }
  }
  const inside = pointInPolygon(poly.points, x, y);
  if (!inside && bestD >= r) return null;
  let nx, ny;
  if (inside || bestD < 1e-6) {
    nx = best.e.nx; ny = best.e.ny;
  } else {
    nx = (x - best.qx) / bestD; ny = (y - best.qy) / bestD;
  }
  return { x: best.qx + nx * r, y: best.qy + ny * r, nx, ny };
}
