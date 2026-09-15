import * as THREE from 'three';
import type { Tile } from '../core/types';
import type { Palette } from '../levels/schema';
import { bridgeTexture, goalTexture, railTexture, roadTexture, rubbleTexture } from './textures';

/** タイルの厚み(4.1 / G1) */
export const TILE_THICKNESS = 0.3;
/** 高さ 1 段ぶんの世界座標(4.1) */
export const STEP_HEIGHT = 0.5;
/**
 * タイルどうしの隙間(G1)。
 * 盤面が 1 枚の大きな板に見えないよう、1 枚 1 枚を独立したスラブとして切り離す。
 */
export const TILE_GAP = 0.04;
/** スラブ 1 枚の一辺 */
export const SLAB_SIZE = 1 - TILE_GAP;

/** 側面は上面より約 20% 暗くする(7.1 / G1) */
export function darken(hex: string, amount = 0.2): THREE.Color {
  const c = new THREE.Color(hex);
  c.multiplyScalar(1 - amount);
  return c;
}

/** 高さ(0..1 の連続値でよい)に対するスラブの上面 Y */
export function topYOf(lift: number): number {
  return TILE_THICKNESS + lift * STEP_HEIGHT;
}

/** タイル上面の世界 Y 座標 */
export function tileTopY(tile: Tile): number {
  return topYOf(tile.height);
}

/** Y 方向は scale で伸ばす前提の単位ボックス(高さ 1) */
const geometry = new THREE.BoxGeometry(SLAB_SIZE, 1, SLAB_SIZE);

function topMaterial(tile: Tile, palette: Palette): THREE.Material {
  switch (tile.kind) {
    case 'empty':
      return new THREE.MeshLambertMaterial({ color: new THREE.Color(palette.ground) });
    case 'block':
      return new THREE.MeshLambertMaterial({ map: rubbleTexture(palette.ground) });
    case 'goal':
      return new THREE.MeshLambertMaterial({ map: goalTexture(palette.road, palette.ground, tile.layer) });
    default:
      // 橋バリアント: 水上テーマの直線だけ «橋» として描く。接続規則は同じ(4.1)
      if (palette.bridge && tile.kind === 'straight') {
        return new THREE.MeshLambertMaterial({ map: bridgeTexture(palette.road, palette.water) });
      }
      return new THREE.MeshLambertMaterial({
        map:
          tile.layer === 'rail'
            ? railTexture(tile.kind, palette.road, palette.ground)
            : roadTexture(tile.kind, palette.road, palette.ground),
      });
  }
}

/**
 * 厚みのあるタイルスラブ 1 枚。
 * BoxGeometry のマテリアル配列は [+x, -x, +y(上面), -y(底), +z, -z] の順。
 */
export function createTileMesh(tile: Tile, palette: Palette): THREE.Mesh {
  const side = new THREE.MeshLambertMaterial({ color: darken(palette.ground, palette.sideDarken) });
  const bottom = new THREE.MeshLambertMaterial({ color: darken(palette.ground, palette.sideDarken + 0.16) });
  const mesh = new THREE.Mesh(geometry, [side, side, topMaterial(tile, palette), bottom, side, side]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * スラブの高さを lift(0..1)に合わせる。
 * 底は地面に着いたまま上面だけが上がるので、持ち上がったタイルは側面が長く見える(G1)。
 */
export function setTileLift(mesh: THREE.Mesh, lift: number): void {
  const top = topYOf(lift);
  mesh.scale.y = top;
  mesh.position.y = top / 2;
}

/** タイル 1 枚の見た目を board の内容に合わせる(高さは setTileLift で別に反映する) */
export function updateTileMesh(mesh: THREE.Mesh, tile: Tile, palette: Palette, x: number, y: number): void {
  const mats = mesh.material as THREE.Material[];
  const old = mats[2];
  mats[2] = topMaterial(tile, palette);
  if (old && old !== mats[2]) old.dispose();
  mesh.position.x = x;
  mesh.position.z = y;
  // 時計回りの回転は Y 軸まわりの負の角に対応する
  mesh.rotation.y = -tile.rot * (Math.PI / 2);
  mesh.visible = true;
}

/**
 * block タイルの上に乗る岩・廃屋(4.1)。
 * 箱と円錐の組み合わせだけで作る(7.2: 外部アセットを使わない)。
 * 位置や大きさは乱数を使わず、セル座標から決める(毎回同じ見た目にする)。
 */
export function createBlockProp(palette: Palette, x: number, y: number): THREE.Group {
  const g = new THREE.Group();
  const rock = new THREE.MeshLambertMaterial({ color: darken(palette.ground, 0.58), flatShading: true });
  const wood = new THREE.MeshLambertMaterial({ color: darken(palette.accent, 0.6), flatShading: true });

  // 廃屋: 傾いた箱 + 円錐の屋根
  const hut = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.26), wood);
  hut.position.set(-0.19, 0.12, 0.17);
  hut.rotation.z = 0.12;
  hut.castShadow = true;
  g.add(hut);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.22, 4), wood);
  roof.position.set(-0.19, 0.32, 0.17);
  roof.rotation.set(0.1, Math.PI / 4, 0.12);
  roof.castShadow = true;
  g.add(roof);

  // 岩: 大小 2 つの箱を傾けて重ねる
  const big = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), rock);
  big.position.set(0.19, 0.14, -0.17);
  big.rotation.set(0.25, 0.6, 0.18);
  big.castShadow = true;
  g.add(big);

  const small = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), rock);
  small.position.set(0.24, 0.3, 0.2);
  small.rotation.set(0.5, 0.2, 0.35);
  small.castShadow = true;
  g.add(small);

  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 5), rock);
  spike.position.set(-0.13, 0.15, -0.24);
  spike.rotation.z = -0.15;
  spike.castShadow = true;
  g.add(spike);

  // セルごとに向きを少し変えて、同じ形の繰り返しに見せない
  g.rotation.y = ((x * 7 + y * 13) % 8) * (Math.PI / 8);
  // 破壊アイコン(💣)がタイル中央に大きく出るので、瓦礫は一回り小さくして譲る
  g.scale.setScalar(0.82);
  return g;
}

/** 破片・土煙の色(fx から使う) */
export function rubbleColor(palette: Palette): THREE.Color {
  return darken(palette.ground, 0.5);
}
