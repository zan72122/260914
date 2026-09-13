import * as THREE from 'three';

export const TILE_T = 0.28;

export function lambert(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}

// 柱ブロック(base から h まで)。上面は別色。
export function makeBlock(x, z, h, base, sideMat, topMat) {
  const height = h - base;
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, height, 1), [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
  m.position.set(x, base + height / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// 道の中央の四角
export function makeRoadCenter(x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.62), mat);
  m.position.set(x, y + 0.02, z);
  m.receiveShadow = true;
  return m;
}

// 道の帯(セル中央から d 方向の縁まで)
export function makeRoadStub(x, y, z, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(d.x ? 0.5 : 0.62, 0.04, d.z ? 0.5 : 0.62), mat);
  m.position.set(x + d.x * 0.44, y + 0.02, z + d.z * 0.44);
  return m;
}

// 階段(4 段)。high 側が h、low 側が h-1。dir は低い側の向き。
export function makeStairs(x, z, h, base, dir, sideMat, topMat) {
  const g = new THREE.Group();
  const n = 4;
  for (let i = 0; i < n; i++) {
    // i=0 が低い側
    const top = h - 1 + ((i + 1) / n);
    const len = 1 / n;
    const along = -0.5 + len / 2 + i * len; // dir と逆向きに進むほど高い
    const cx = x - dir.x * along;
    const cz = z - dir.z * along;
    const height = top - base;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(dir.x ? len : 1, height, dir.z ? len : 1),
      [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]
    );
    m.position.set(cx, base + height / 2, cz);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}
