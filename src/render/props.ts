import * as THREE from 'three';
import type { Palette } from '../levels/schema';

/** ゴールマーカーの旗(G4)。ゆっくり上下に揺れる */
export function createGoalFlag(): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.62, 8),
    new THREE.MeshLambertMaterial({ color: 0x23201c }),
  );
  pole.position.y = 0.31;
  pole.castShadow = true;
  g.add(pole);

  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.17),
    new THREE.MeshLambertMaterial({ color: 0x23201c, side: THREE.DoubleSide }),
  );
  flag.position.set(0.13, 0.52, 0);
  flag.castShadow = true;
  g.add(flag);
  return g;
}

/** 盤面の外に広がる海 / 地面。5.3 の「向こうにまだ世界がある」 */
export function createSurroundings(w: number, h: number, palette: Palette): THREE.Group {
  const g = new THREE.Group();
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(w + 24, h + 24),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(palette.sky).multiplyScalar(0.92) }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set((w - 1) / 2, -0.12, (h - 1) / 2);
  sea.receiveShadow = true;
  g.add(sea);

  // 隣の島の端が少しだけ覗く(perceptual incompleteness)
  const islandMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(palette.ground).multiplyScalar(0.9) });
  for (const [dx, dz] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const) {
    const island = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.26, 2.2), islandMat);
    island.position.set((w - 1) / 2 + dx * (w / 2 + 2.3), -0.05, (h - 1) / 2 + dz * (h / 2 + 2.3));
    island.receiveShadow = true;
    g.add(island);
  }
  return g;
}
