import * as THREE from 'three';

let gradient;
function gradientMap() {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 160, 235, 255]);
  gradient = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

export function toon(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...opts });
}

export const C = {
  cream: 0xfff3d6,
  creamDark: 0xf0dcb0,
  cheek: 0xc9e79a,
  eye: 0x2b2b3a,
  white: 0xffffff,
  pot: 0xd98a5c,
  soil: 0x6b4a34,
  soilWet: 0x3f2a1c,
  leaf: 0x7fcf6a,
  leafDark: 0x4f9e48,
  stem: 0x5cb85c,
  grass: 0xa9e08a,
  can: 0x7cc6e8,
  canDark: 0x5aa6cc,
  water: 0x8fd8ff,
  sky: 0xbfe3ff,
  skyWall: 0xcfeaff,
  cloud: 0xffffff,
  sun: 0xffd85c,
  sunRay: 0xffe9a0,
  moon: 0xfff6c8,
  trunk: 0x9c6b46,
  canopy: 0x8fd57a,
  cocoon: 0xd9c9a3,
  cocoonDark: 0xb8a67d,
  flowers: [0xff9ec4, 0xffd95c, 0x8fd3ff],
  flowerCenter: 0xffb347,
  string: 0xf0e2c2,
  bead: 0xff8c8c,
  handle: 0xffb347,
  mote: 0xfff2a8,
};

export function rounded(w, h, d, r, seg = 4) {
  // 角丸ボックス(RoundedBoxGeometry の簡易版)
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const cx = THREE.MathUtils.clamp(v.x, -hw, hw);
    const cy = THREE.MathUtils.clamp(v.y, -hh, hh);
    const cz = THREE.MathUtils.clamp(v.z, -hd, hd);
    const n = new THREE.Vector3(v.x - cx, v.y - cy, v.z - cz);
    if (n.lengthSq() > 0) n.normalize().multiplyScalar(r);
    pos.setXYZ(i, cx + n.x, cy + n.y, cz + n.z);
  }
  g.computeVertexNormals();
  return g;
}

// ばね的なイージング
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutElastic = (t) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
};
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
