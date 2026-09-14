// 紙モデル: 4x4 タイルの表面と、4辺それぞれの「折ったときに現れる裏面」を持つ。
// 折りは同時に1辺のみ。折ると flap 列(行)は消え、その内側の landing 列(行)が裏面で覆われる。

export const N = 4;
export const SIDES = ['L', 'R', 'T', 'B'];

// axis: 折りが動く軸。crease: 折り目のタイル座標。out: 紙の外側方向の符号。
export const SIDE_INFO = {
  R: { axis: 'x', flapIdx: 3, landIdx: 2, crease: 3, out: +1 },
  L: { axis: 'x', flapIdx: 0, landIdx: 1, crease: 1, out: -1 },
  B: { axis: 'y', flapIdx: 3, landIdx: 2, crease: 3, out: +1 },
  T: { axis: 'y', flapIdx: 0, landIdx: 1, crease: 1, out: -1 },
};

const BITS = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] };
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };

// "g NS house" → { ter:'g', road:{N,E,S,W}, deco:'house', walk:true }
export function parseTile(s) {
  if (!s) return null;
  const parts = s.trim().split(/\s+/);
  const t = { ter: parts[0], road: { N: false, E: false, S: false, W: false }, deco: null, walk: false };
  for (const p of parts.slice(1)) {
    if (/^[NESW]+$/.test(p)) {
      for (const ch of p) t.road[ch] = true;
      t.walk = true;
    } else {
      t.deco = p;
    }
  }
  return t;
}

export function parseLevel(def, index = 0) {
  const front = def.front.map((row) => row.map(parseTile));
  const flaps = {};
  for (const s of SIDES) flaps[s] = (def.flaps[s] || ['x', 'x', 'x', 'x']).map(parseTile);
  let start = null;
  let goal = null;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const t = front[r][c];
      if (!t) continue;
      if (t.deco === 'house' || t.deco === 'start') start = { r, c };
      if (t.deco === 'goal' || t.deco === 'ghouse') goal = { r, c };
    }
  }
  if (!start || !goal) throw new Error(`level ${index}: start/goal missing`);
  return { index, scene: def.scene || 'meadow', front, flaps, start, goal, sides: def.sides || SIDES };
}

export function lineIndex(side, r, c) {
  return SIDE_INFO[side].axis === 'x' ? c : r;
}
export function onFlap(side, r, c) {
  return lineIndex(side, r, c) === SIDE_INFO[side].flapIdx;
}
export function onLanding(side, r, c) {
  return lineIndex(side, r, c) === SIDE_INFO[side].landIdx;
}
export function inZone(side, r, c) {
  return onFlap(side, r, c) || onLanding(side, r, c);
}

// 現在見えている 4x4 の合成グリッド。消えたタイルは null。
export function composite(level, fold) {
  const g = level.front.map((row) => row.slice());
  if (fold) {
    const info = SIDE_INFO[fold];
    for (let i = 0; i < N; i++) {
      const back = level.flaps[fold][i];
      if (info.axis === 'x') {
        g[i][info.landIdx] = back;
        g[i][info.flapIdx] = null;
      } else {
        g[info.landIdx][i] = back;
        g[info.flapIdx][i] = null;
      }
    }
  }
  return g;
}

export function canFold(level, fold, side, hana) {
  if (fold !== null) return false;
  if (!level.sides.includes(side)) return false;
  return !inZone(side, hana.r, hana.c);
}
export function canUnfold(fold, hana) {
  if (fold === null) return false;
  return !onLanding(fold, hana.r, hana.c);
}

export function neighbors(grid, r, c) {
  const t = grid[r] && grid[r][c];
  const out = [];
  if (!t || !t.walk) return out;
  for (const d of ['N', 'E', 'S', 'W']) {
    if (!t.road[d]) continue;
    const nr = r + BITS[d][0];
    const nc = c + BITS[d][1];
    if (nr < 0 || nc < 0 || nr >= N || nc >= N) continue;
    const u = grid[nr][nc];
    if (u && u.walk && u.road[OPP[d]]) out.push({ r: nr, c: nc, dir: d });
  }
  return out;
}

// from から到達可能な全タイルと、経路復元用の親表。
export function bfs(grid, from) {
  const key = (r, c) => r * N + c;
  const prev = new Map();
  prev.set(key(from.r, from.c), null);
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    for (const nb of neighbors(grid, cur.r, cur.c)) {
      const k = key(nb.r, nb.c);
      if (prev.has(k)) continue;
      prev.set(k, key(cur.r, cur.c));
      q.push(nb);
    }
  }
  return {
    has: (r, c) => prev.has(key(r, c)),
    pathTo: (r, c) => {
      if (!prev.has(key(r, c))) return null;
      const path = [];
      let k = key(r, c);
      while (k !== null) {
        path.push({ r: Math.floor(k / N), c: k % N });
        k = prev.get(k);
      }
      return path.reverse();
    },
    all: () => [...prev.keys()].map((k) => ({ r: Math.floor(k / N), c: k % N })),
  };
}

// タップ先に届かないとき、最も近づける到達可能タイル。
export function nearestReachable(reach, target) {
  let best = null;
  let bestD = Infinity;
  for (const p of reach.all()) {
    const d = Math.abs(p.r - target.r) + Math.abs(p.c - target.c);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
