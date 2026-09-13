import * as THREE from 'three';
import { smoothstep } from '../../util/math';

export const ISLAND_RADIUS = 2.6;
export const ISLAND_PEAK = 1.8;
export const DISC_RADIUS = 4.0;

/** 島の高さプロファイル(中心からの距離 → 高さ) */
export function islandHeightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);
  if (r >= ISLAND_RADIUS) return 0;
  const u = r / ISLAND_RADIUS;
  return ISLAND_PEAK * (1 - u * u);
}

const DRY = new THREE.Color(0xf2dca4);
const WET = new THREE.Color(0xc9a978);
const BED = new THREE.Color(0x8fb7a0);

/** ローポリの島。海面の高さに応じて濡れた砂の色を塗り分ける */
export class Island extends THREE.Mesh {
  private readonly heights: Float32Array;
  private lastLevel = -1;

  constructor() {
    // 外側の裾 → 頂上の順(法線が外向きになる)
    const pts: THREE.Vector2[] = [new THREE.Vector2(ISLAND_RADIUS + 0.4, -0.05)];
    const n = 16;
    for (let i = n; i >= 0; i--) {
      const r = (i / n) * ISLAND_RADIUS;
      pts.push(new THREE.Vector2(r, islandHeightAt(r, 0)));
    }
    const geo = new THREE.LatheGeometry(pts, 30).toNonIndexed();
    const pos = geo.attributes.position as THREE.BufferAttribute;
    // ざらつき(ローポリ感)。同じ位置の頂点は同じだけ動かして隙間を作らない
    const jitter = (x: number, y: number, z: number, k: number): number => {
      const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + k * 19.19) * 43758.5453;
      return (h - Math.floor(h)) - 0.5;
    };
    for (let i = 0; i < pos.count; i++) {
      const x = Math.round(pos.getX(i) * 1000) / 1000;
      const y = Math.round(pos.getY(i) * 1000) / 1000;
      const z = Math.round(pos.getZ(i) * 1000) / 1000;
      if (y > 0.05 && y < ISLAND_PEAK - 0.05) {
        pos.setXYZ(i, x + jitter(x, y, z, 1) * 0.06, y + jitter(x, y, z, 2) * 0.09, z + jitter(x, y, z, 3) * 0.06);
      }
    }
    geo.computeVertexNormals();
    const colors = new Float32Array(pos.count * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    super(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }),
    );
    this.heights = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) this.heights[i] = pos.getY(i);
    this.receiveShadow = true;
    this.castShadow = false;
    this.setSeaLevel(0.8);
  }

  setSeaLevel(level: number): void {
    if (Math.abs(level - this.lastLevel) < 0.002) return;
    this.lastLevel = level;
    const col = this.geometry.attributes.color as THREE.BufferAttribute;
    const tmp = new THREE.Color();
    for (let i = 0; i < col.count; i++) {
      const h = this.heights[i];
      // 水面下=海底色, 水際=濡れた砂, 上=乾いた砂
      const under = smoothstep(level + 0.02, level - 0.25, h);
      const wet = smoothstep(level + 0.22, level - 0.02, h);
      tmp.copy(DRY).lerp(WET, wet).lerp(BED, under);
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    col.needsUpdate = true;
  }
}

/** 柱が立つ岩棚 */
export function makeShelf(): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(0.75, 1.1, 0.2, 7),
    new THREE.MeshStandardMaterial({ color: 0x7f8c8d, flatShading: true, roughness: 0.9 }),
  );
  m.position.y = 0.1;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** 回転する円盤(土台) */
export function makeDisc(): THREE.Mesh {
  const side = new THREE.MeshStandardMaterial({ color: 0x8b5e3c, flatShading: true, roughness: 0.9 });
  const top = new THREE.MeshStandardMaterial({ color: 0x86b3a2, flatShading: true, roughness: 0.9 });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(DISC_RADIUS, DISC_RADIUS * 0.9, 0.9, 40), [side, top, side]);
  m.position.y = -0.45;
  m.receiveShadow = true;
  return m;
}
