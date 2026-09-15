import * as THREE from 'three';

const _d = new THREE.Vector3();

export function approach(cur, target, dt, speed = 3.0) {
  return cur + (target - cur) * Math.min(1, dt * speed);
}

/**
 * 指が通った「線」を塗る。指が速く動いても跡が飛ばないよう、前フレームの位置から
 * 現在位置までを細かく分割して塗る。戻り値 = 塗れた量（0 なら石の外）
 */
export function rubPaint(g, m, channel, radius, rate, globalRate = 0, bandMix = 0, protBias = 0) {
  const dist = Math.max(0.0001, m.dist);
  const seg = Math.max(1, Math.min(10, Math.ceil(dist / 16)));
  const x0 = m.x - m.dx, y0 = m.y - m.dy;
  const per = Math.min(0.85, Math.max(0.05, (dist / seg) / 24));
  let added = 0;
  let lastHit = null;
  for (let i = 1; i <= seg; i++) {
    const t = i / seg;
    const hit = g.pick(x0 + (m.x - x0) * t, y0 + (m.y - y0) * t, 1.06);
    if (!hit) continue;
    lastHit = hit;
    added += g.stone.paint(channel, hit.local, radius, rate * per, bandMix, protBias);
  }
  if (lastHit && globalRate > 0) {
    added += g.stone.paintGlobal(channel, globalRate * Math.min(1.2, dist / 24));
  }
  return { added, hit: lastHit };
}

/** 石の上の「今カメラから見えている」ランダムな出っ張りを 1 つ返す */
export function pickProtrusion(g) {
  const s = g.stone;
  const v = g.viewDir(_d);
  const local = s.toLocalDir(v, new THREE.Vector3());
  let best = -1, bi = -1;
  for (let k = 0; k < 90; k++) {
    const i = (Math.random() * s.count) | 0;
    const d = s.dir[i * 3] * local.x + s.dir[i * 3 + 1] * local.y + s.dir[i * 3 + 2] * local.z;
    if (d < 0.05) continue;
    const res = s.aProt[i] * (1 - s.aMask[i * 3]) * (0.4 + 0.6 * d);
    if (res > best) { best = res; bi = i; }
  }
  if (bi < 0 || best < 0.04) return null;
  return new THREE.Vector3(s.dir[bi * 3], s.dir[bi * 3 + 1], s.dir[bi * 3 + 2]);
}

/** 星の中心（＝鏡面ハイライト点）あたりの world 座標 */
export function starCenter(g, out) {
  const cw = g.stone.worldCAxis(new THREE.Vector3());
  return out.copy(g.stone.group.position).addScaledVector(cw, g.stone.hitRadius() * 0.85);
}
