import * as THREE from 'three';
import type { Tile } from '../core/types';
import type { Palette } from '../levels/schema';
import { goalTexture, roadTexture } from './textures';

/** タイルの厚み(4.1 / G1) */
export const TILE_THICKNESS = 0.3;
/** 高さ 1 段ぶんの世界座標(4.1) */
export const STEP_HEIGHT = 0.5;

/** 側面は上面より約 20% 暗くする(7.1 / G1) */
export function darken(hex: string, amount = 0.2): THREE.Color {
  const c = new THREE.Color(hex);
  c.multiplyScalar(1 - amount);
  return c;
}

/** タイル上面の世界 Y 座標 */
export function tileTopY(tile: Tile): number {
  return tile.height * STEP_HEIGHT + TILE_THICKNESS;
}

const geometry = new THREE.BoxGeometry(1, TILE_THICKNESS, 1);

function topMaterial(tile: Tile, palette: Palette): THREE.Material {
  switch (tile.kind) {
    case 'empty':
      return new THREE.MeshLambertMaterial({ color: new THREE.Color(palette.ground) });
    case 'block':
      return new THREE.MeshLambertMaterial({ color: darken(palette.ground, 0.45) });
    case 'goal':
      return new THREE.MeshLambertMaterial({ map: goalTexture(palette.road, palette.ground) });
    default:
      return new THREE.MeshLambertMaterial({ map: roadTexture(tile.kind, palette.road, palette.ground) });
  }
}

/**
 * 厚みのあるタイルスラブ 1 枚。
 * BoxGeometry のマテリアル配列は [+x, -x, +y(上面), -y(底), +z, -z] の順。
 */
export function createTileMesh(tile: Tile, palette: Palette): THREE.Mesh {
  const side = new THREE.MeshLambertMaterial({ color: darken(palette.ground, 0.2) });
  const bottom = new THREE.MeshLambertMaterial({ color: darken(palette.ground, 0.35) });
  const mesh = new THREE.Mesh(geometry, [side, side, topMaterial(tile, palette), bottom, side, side]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** タイル 1 枚の見た目を board の内容に合わせる */
export function updateTileMesh(mesh: THREE.Mesh, tile: Tile, palette: Palette, x: number, y: number): void {
  const mats = mesh.material as THREE.Material[];
  const old = mats[2];
  mats[2] = topMaterial(tile, palette);
  if (old && old !== mats[2]) old.dispose();
  mesh.position.set(x, tile.height * STEP_HEIGHT + TILE_THICKNESS / 2, y);
  // 時計回りの回転は Y 軸まわりの負の角に対応する
  mesh.rotation.y = -tile.rot * (Math.PI / 2);
  mesh.visible = true;
}

/** block タイルの上に乗せる岩(壊せるもの)。M4 で作り込む */
export function createBlockProp(palette: Palette): THREE.Mesh {
  const geo = new THREE.SphereGeometry(0.33, 6, 4);
  const mat = new THREE.MeshLambertMaterial({ color: darken(palette.ground, 0.55), flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.scale.set(1, 0.8, 1);
  return mesh;
}
