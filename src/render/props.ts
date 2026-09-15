import * as THREE from 'three';
import type { Board, Vec2 } from '../core/types';
import { tileAt } from '../core/board';
import type { Level, Palette, PropKind } from '../levels/schema';
import { causticsTexture, windowTexture } from './textures';
import { topYOf } from './tileMesh';

/**
 * 装飾プロップ(6.3 / 7.2)。すべてコードで生成し、外部アセットは使わない。
 *
 * 3.3-(1) に従い「触れないもの」は操作対象より目立たせない:
 *  - 影を落とさない(castShadow なし)
 *  - 彩度と明度を地面に寄せる
 *  - 背は低く(おおむね 0.5 以下)、タイルの上面図形を隠さない
 * 同種のプロップは InstancedMesh にまとめる(R4)。
 */

export interface PropPlacement {
  readonly kind: PropKind;
  /** ワールド座標(タイル座標と同じ尺度) */
  readonly x: number;
  readonly z: number;
  /** 足元の高さ */
  readonly y: number;
  readonly rotY: number;
  readonly scale: number;
}

interface Part {
  readonly geo: THREE.BufferGeometry;
  readonly mat: THREE.Material;
}

export interface PropField {
  readonly group: THREE.Group;
  /** 蛍・灯りのゆらぎ。描画が要るときだけ true を返す */
  tick(t: number): boolean;
}

/** 決定的な擬似乱数(同じレベルなら毎回同じ配置になる) */
export function makeRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let s = h >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function mix(a: string, b: string, k: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), k);
}

function lambert(color: THREE.Color | string): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color: new THREE.Color(color as string), flatShading: true });
}

function glowMat(color: string): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });
}

/** 部品の形をローカル原点(足元)基準に整える */
function at(geo: THREE.BufferGeometry, y: number, x = 0, z = 0): THREE.BufferGeometry {
  geo.translate(x, y, z);
  return geo;
}

/**
 * プロップ 1 種類の部品一覧。
 * 部品はすべて同じインスタンス行列を共有するので、1 種 = 数個の InstancedMesh で済む。
 */
function partsOf(kind: PropKind, palette: Palette): Part[] {
  const g = palette.ground;
  const acc = palette.accent;
  const trunk = lambert(mix(g, '#6B4A2E', 0.75));
  switch (kind) {
    case 'palm':
      return [
        { geo: at(new THREE.CylinderGeometry(0.035, 0.055, 0.46, 6), 0.23), mat: trunk },
        { geo: at(new THREE.ConeGeometry(0.26, 0.16, 6), 0.5), mat: lambert(mix(g, '#4E8F3C', 0.7)) },
        { geo: at(new THREE.ConeGeometry(0.17, 0.12, 6), 0.58), mat: lambert(mix(g, '#3F7A30', 0.7)) },
      ];
    case 'drygrass':
      return [
        { geo: at(new THREE.ConeGeometry(0.09, 0.2, 4), 0.1), mat: lambert(mix(g, acc, 0.5)) },
        { geo: at(new THREE.ConeGeometry(0.06, 0.14, 4), 0.07, 0.11, 0.08), mat: lambert(mix(g, acc, 0.35)) },
      ];
    case 'lighthouse':
      return [
        { geo: at(new THREE.CylinderGeometry(0.11, 0.16, 0.6, 8), 0.3), mat: lambert(mix(acc, '#FFFFFF', 0.5)) },
        { geo: at(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 8), 0.64), mat: lambert(mix(g, '#B0453A', 0.7)) },
        { geo: at(new THREE.ConeGeometry(0.15, 0.16, 8), 0.76), mat: lambert(mix(g, '#B0453A', 0.7)) },
        { geo: at(new THREE.SphereGeometry(0.06, 8, 6), 0.64), mat: glowMat(palette.glow) },
      ];
    case 'rock':
      return [
        { geo: at(new THREE.IcosahedronGeometry(0.17, 0), 0.12), mat: lambert(mix(g, '#6E6A63', 0.6)) },
        { geo: at(new THREE.IcosahedronGeometry(0.1, 0), 0.07, 0.17, 0.12), mat: lambert(mix(g, '#5E5A54', 0.6)) },
      ];
    case 'tree':
      return [
        { geo: at(new THREE.CylinderGeometry(0.04, 0.05, 0.22, 6), 0.11), mat: trunk },
        { geo: at(new THREE.IcosahedronGeometry(0.21, 0), 0.36), mat: lambert(mix(g, '#3E7F34', 0.65)) },
      ];
    case 'darktree':
      return [
        { geo: at(new THREE.CylinderGeometry(0.03, 0.04, 0.26, 6), 0.13), mat: lambert(mix(g, '#2B3B3A', 0.7)) },
        { geo: at(new THREE.ConeGeometry(0.13, 0.36, 6), 0.42), mat: lambert(mix(g, '#2F4A44', 0.7)) },
      ];
    case 'reed':
      return [
        { geo: at(new THREE.CylinderGeometry(0.018, 0.024, 0.36, 5), 0.18), mat: lambert(mix(g, acc, 0.6)) },
        { geo: at(new THREE.CylinderGeometry(0.016, 0.022, 0.28, 5), 0.14, 0.08, 0.06), mat: lambert(mix(g, acc, 0.45)) },
        { geo: at(new THREE.CylinderGeometry(0.016, 0.022, 0.31, 5), 0.155, -0.07, 0.07), mat: lambert(mix(g, acc, 0.5)) },
      ];
    case 'flower':
      return [
        { geo: at(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 4), 0.07), mat: lambert(mix(g, '#3E7F34', 0.5)) },
        { geo: at(new THREE.SphereGeometry(0.055, 6, 5), 0.16), mat: lambert(mix(g, '#D9453E', 0.85)) },
      ];
    case 'duck':
      return [
        { geo: at(new THREE.SphereGeometry(0.1, 8, 6), 0.08), mat: lambert('#F2D857') },
        { geo: at(new THREE.SphereGeometry(0.06, 8, 6), 0.19, 0.07), mat: lambert('#F2D857') },
        { geo: at(new THREE.ConeGeometry(0.03, 0.07, 5).rotateZ(-Math.PI / 2), 0.19, 0.14), mat: lambert('#E8873F') },
      ];
    case 'wheat':
      return [
        { geo: at(new THREE.ConeGeometry(0.05, 0.3, 5), 0.15), mat: lambert(mix(g, '#D9B14A', 0.8)) },
        { geo: at(new THREE.ConeGeometry(0.04, 0.24, 5), 0.12, 0.1, 0.07), mat: lambert(mix(g, '#C9A040', 0.8)) },
        { geo: at(new THREE.ConeGeometry(0.04, 0.26, 5), 0.13, -0.09, 0.08), mat: lambert(mix(g, '#D9B14A', 0.7)) },
      ];
    case 'house':
      return [
        { geo: at(new THREE.BoxGeometry(0.3, 0.2, 0.28), 0.1), mat: lambert(mix(g, '#E4DCC8', 0.7)) },
        { geo: at(new THREE.ConeGeometry(0.26, 0.16, 4), 0.28), mat: lambert(mix(g, '#D97B3F', 0.85)) },
      ];
    case 'building': {
      const wall = `#${mix(g, '#9BA4AE', 0.55).getHexString()}`;
      const tex = windowTexture(wall, palette.glow, palette.night);
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      if (palette.night) {
        mat.emissive = new THREE.Color(0xffffff);
        mat.emissiveMap = tex;
        mat.emissiveIntensity = 0.55;
      }
      return [
        { geo: at(new THREE.BoxGeometry(0.28, 0.62, 0.28), 0.31), mat },
        { geo: at(new THREE.BoxGeometry(0.3, 0.04, 0.3), 0.64), mat: lambert(mix(g, '#6E7680', 0.7)) },
      ];
    }
    case 'fence':
      return [
        { geo: at(new THREE.BoxGeometry(0.44, 0.02, 0.02), 0.16), mat: lambert(mix(g, '#3A3F44', 0.8)) },
        { geo: at(new THREE.BoxGeometry(0.02, 0.22, 0.02), 0.11, -0.2), mat: lambert(mix(g, '#3A3F44', 0.8)) },
        { geo: at(new THREE.BoxGeometry(0.02, 0.22, 0.02), 0.11, 0), mat: lambert(mix(g, '#3A3F44', 0.8)) },
        { geo: at(new THREE.BoxGeometry(0.02, 0.22, 0.02), 0.11, 0.2), mat: lambert(mix(g, '#3A3F44', 0.8)) },
        // 墓石
        { geo: at(new THREE.BoxGeometry(0.1, 0.16, 0.05), 0.08, 0.1, 0.16), mat: lambert(mix(g, '#C4C7CC', 0.6)) },
      ];
    case 'mushroom':
      return [
        { geo: at(new THREE.CylinderGeometry(0.07, 0.09, 0.22, 7), 0.11), mat: lambert(mix(g, '#EDE3D0', 0.7)) },
        { geo: at(new THREE.SphereGeometry(0.17, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0.2), mat: lambert(mix(g, '#C94A42', 0.85)) },
        { geo: at(new THREE.SphereGeometry(0.03, 6, 5), 0.28, 0.08, 0.06), mat: glowMat(palette.glow) },
      ];
    case 'firefly':
      return [{ geo: at(new THREE.SphereGeometry(0.045, 6, 5), 0), mat: glowMat(palette.glow) }];
    case 'streetlamp':
      return [
        { geo: at(new THREE.CylinderGeometry(0.02, 0.028, 0.5, 6), 0.25), mat: lambert(mix(g, '#4A4F55', 0.75)) },
        { geo: at(new THREE.SphereGeometry(0.055, 8, 6), 0.53), mat: glowMat(palette.glow) },
      ];
    case 'bricktower':
      return [
        { geo: at(new THREE.CylinderGeometry(0.14, 0.18, 0.5, 8), 0.25), mat: lambert(mix(g, '#A34E3C', 0.8)) },
        { geo: at(new THREE.ConeGeometry(0.2, 0.18, 8), 0.59), mat: lambert(mix(g, '#7A3428', 0.8)) },
        { geo: at(new THREE.SphereGeometry(0.04, 6, 5), 0.36, 0.15), mat: glowMat(palette.glow) },
      ];
  }
}

/** 盤面の外周にだけ置きたい «大きい» プロップ */
const BIG: ReadonlySet<PropKind> = new Set(['lighthouse', 'bricktower', 'building']);

/** 水の上に置いてよいプロップ(岸の外側に浮かぶ) */
const ON_WATER: readonly PropKind[] = ['duck', 'reed', 'rock'];

/** 盤面の外に敷く «島の岸» の広さ(タイル数)。外周のプロップはこの上に立つ */
export const APRON_MARGIN = 1.3;
/** 岸の上面の高さ */
export const APRON_TOP = 0.04;
/** 海面の高さ */
export const SEA_Y = -0.34;

function isFree(board: Board, p: Vec2, blocked: ReadonlySet<number>): boolean {
  const t = tileAt(board, p);
  if (!t) return false;
  if (t.kind !== 'empty') return false;
  return !blocked.has(p.y * board.w + p.x);
}

/**
 * テーマごとの装飾を、盤面の空地と «島の岸» へ決定的に配置する(6.3)。
 * ツールの範囲・道・start / goal の上には置かない。当たり判定にも含めない。
 * 触れないものなので、数は控えめ・背は低く・色は地面寄りにする(3.3-(1))。
 */
export function planProps(level: Level, board: Board, palette: Palette): PropPlacement[] {
  const kinds = palette.props;
  if (kinds.length === 0) return [];
  const rng = makeRng(`${level.id}:props`);
  const { w, h } = level.size;

  const blocked = new Set<number>();
  for (const tool of level.tools) for (const c of tool.cells) blocked.add(c.y * w + c.x);

  const out: PropPlacement[] = [];
  const small = kinds.filter((k) => !BIG.has(k) && k !== 'firefly');
  const big = kinds.filter((k) => BIG.has(k));

  // 盤面の空地。まばらに、小さいものだけ
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isFree(board, { x, y }, blocked)) continue;
      if (rng() > 0.3) continue;
      const kind = small[Math.floor(rng() * small.length)];
      if (!kind) continue;
      const t = tileAt(board, { x, y });
      out.push({
        kind,
        x: x + (rng() - 0.5) * 0.36,
        z: y + (rng() - 0.5) * 0.36,
        y: topYOf(t?.height ?? 0),
        rotY: rng() * Math.PI * 2,
        scale: 0.6 + rng() * 0.18,
      });
    }
  }

  // 島の岸(盤面の外周 1 マス)。ここには大きいものも置ける
  let bigLeft = 2;
  for (let y = -1; y <= h; y++) {
    for (let x = -1; x <= w; x++) {
      if (x >= 0 && y >= 0 && x < w && y < h) continue;
      if (rng() > 0.42) continue;
      const useBig = big.length > 0 && bigLeft > 0 && rng() < 0.2;
      const pool = useBig ? big : small;
      const kind = pool[Math.floor(rng() * pool.length)];
      if (!kind) continue;
      if (useBig) bigLeft--;
      out.push({
        kind,
        x: x + (rng() - 0.5) * 0.4,
        z: y + (rng() - 0.5) * 0.4,
        y: APRON_TOP,
        rotY: rng() * Math.PI * 2,
        scale: useBig ? 0.8 : 0.66 + rng() * 0.2,
      });
    }
  }

  // 水辺テーマは岸の外の «水の上» にアヒル・葦・岩が浮かぶ(2.4 / 6.3)
  if (palette.caustics) {
    const pool = ON_WATER.filter((k) => kinds.includes(k));
    for (let i = 0; i < 12 && pool.length > 0; i++) {
      const kind = pool[Math.floor(rng() * pool.length)]!;
      const side = Math.floor(rng() * 4);
      const along = rng() * (side % 2 === 0 ? w + 4 : h + 4) - 2;
      const off = 1.7 + rng() * 1.8;
      const pos =
        side === 0
          ? { x: along, z: -0.5 - off }
          : side === 1
            ? { x: w - 0.5 + off, z: along }
            : side === 2
              ? { x: along, z: h - 0.5 + off }
              : { x: -0.5 - off, z: along };
      out.push({
        kind,
        x: pos.x,
        z: pos.z,
        y: SEA_Y + 0.04,
        rotY: rng() * Math.PI * 2,
        scale: 0.68 + rng() * 0.2,
      });
    }
  }

  // 蛍は宙に浮く(6.3 の 8 面「蛍の光の粒」)
  if (kinds.includes('firefly')) {
    for (let i = 0; i < 12; i++) {
      out.push({
        kind: 'firefly',
        x: -1.5 + rng() * (w + 3),
        z: -1.5 + rng() * (h + 3),
        y: 0.7 + rng() * 0.9,
        rotY: 0,
        scale: 0.8 + rng() * 0.6,
      });
    }
  }

  // レベル定義で明示された装飾も足す
  for (const p of level.props ?? []) {
    out.push({ kind: p.kind, x: p.x, z: p.y, y: topYOf(0), rotY: 0, scale: 0.8 });
  }
  return out;
}

const MTX = new THREE.Matrix4();
const QUAT = new THREE.Quaternion();
const POS = new THREE.Vector3();
const SCL = new THREE.Vector3();

/** 配置一覧から InstancedMesh 群を作る */
export function createPropField(placements: readonly PropPlacement[], palette: Palette): PropField {
  const group = new THREE.Group();
  const byKind = new Map<PropKind, PropPlacement[]>();
  for (const p of placements) {
    const list = byKind.get(p.kind);
    if (list) list.push(p);
    else byKind.set(p.kind, [p]);
  }

  const fireflyItems = byKind.get('firefly') ?? [];
  let fireflyMesh: THREE.InstancedMesh | undefined;

  for (const [kind, items] of byKind) {
    const parts = partsOf(kind, palette);
    for (const part of parts) {
      const inst = new THREE.InstancedMesh(part.geo, part.mat, items.length);
      // 触れないものは影を落とさない(3.3-(1))
      inst.castShadow = false;
      inst.receiveShadow = false;
      items.forEach((p, i) => {
        QUAT.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY);
        POS.set(p.x, p.y, p.z);
        SCL.setScalar(p.scale);
        inst.setMatrixAt(i, MTX.compose(POS, QUAT, SCL));
      });
      inst.instanceMatrix.needsUpdate = true;
      group.add(inst);
      if (kind === 'firefly') fireflyMesh = inst;
    }
  }

  return {
    group,
    tick(t: number): boolean {
      const mesh = fireflyMesh;
      if (!mesh) return false;
      fireflyItems.forEach((p, i) => {
        QUAT.identity();
        POS.set(
          p.x + Math.sin(t * 0.6 + i) * 0.25,
          p.y + Math.sin(t * 0.9 + i * 2.1) * 0.18,
          p.z + Math.cos(t * 0.5 + i * 1.3) * 0.25,
        );
        SCL.setScalar(p.scale * (0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2 + i))));
        mesh.setMatrixAt(i, MTX.compose(POS, QUAT, SCL));
      });
      mesh.instanceMatrix.needsUpdate = true;
      return true;
    },
  };
}

/** ゴールマーカーの旗(G4)。夜は明るい旗にする(暗いと «行き先» が見えない) */
export function createGoalFlag(palette: Palette): THREE.Group {
  const g = new THREE.Group();
  const poleColor = palette.night ? 0xe8eef5 : 0x23201c;
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.62, 8),
    new THREE.MeshLambertMaterial({ color: poleColor }),
  );
  pole.position.y = 0.31;
  pole.castShadow = true;
  g.add(pole);

  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.17),
    palette.night
      ? new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.flag), side: THREE.DoubleSide })
      : new THREE.MeshLambertMaterial({ color: new THREE.Color(palette.flag), side: THREE.DoubleSide }),
  );
  flag.position.set(0.13, 0.52, 0);
  flag.castShadow = true;
  g.add(flag);
  return g;
}

export interface Surroundings {
  readonly group: THREE.Group;
  /** コースティクスのスクロール。描画が要るときだけ true を返す */
  tick(dt: number): boolean;
}

/**
 * 盤面の外に広がる水 / 地面。5.3 の「向こうにまだ世界がある」。
 * 水辺テーマではコースティクス(2.4)をゆっくりスクロールさせる。
 */
export function createSurroundings(w: number, h: number, palette: Palette): Surroundings {
  const group = new THREE.Group();
  const cx = (w - 1) / 2;
  const cz = (h - 1) / 2;

  // 海(砂漠・都市では砂や草地)。ここから先は «向こうの世界»(5.3)
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(w + 40, h + 40),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(palette.water) }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(cx, SEA_Y, cz);
  sea.receiveShadow = true;
  group.add(sea);

  let tex: THREE.CanvasTexture | undefined;
  if (palette.caustics) {
    tex = causticsTexture().clone();
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set((w + 40) / 3, (h + 40) / 3);
    const caustics = new THREE.Mesh(
      new THREE.PlaneGeometry(w + 40, h + 40),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    caustics.rotation.x = -Math.PI / 2;
    caustics.position.set(cx, SEA_Y + 0.02, cz);
    group.add(caustics);
  }

  // 島の岸。タイルの外に少しだけ «陸» を出し、外周の装飾はこの上に立つ
  const top = new THREE.MeshLambertMaterial({
    color: mix(palette.ground, '#F2E3B0', palette.night ? 0.12 : 0.3),
  });
  const side = new THREE.MeshLambertMaterial({
    color: new THREE.Color(palette.ground).multiplyScalar(Math.max(0.35, 1 - palette.sideDarken - 0.12)),
  });
  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(w + APRON_MARGIN * 2, 0.5, h + APRON_MARGIN * 2),
    [side, side, top, side, side, side],
  );
  apron.position.set(cx, APRON_TOP - 0.25, cz);
  apron.receiveShadow = true;
  group.add(apron);

  return {
    group,
    tick(dt: number): boolean {
      if (!tex) return false;
      tex.offset.x = (tex.offset.x + dt * 0.03) % 1;
      tex.offset.y = (tex.offset.y + dt * 0.017) % 1;
      return true;
    },
  };
}

/**
 * 橋の欄干と橋げた(6.3 の 9 面)。
 * 橋バリアントの直線タイルの上に乗せる。上から見て «橋を渡っている» ことが分かる。
 * 当たり判定には含めない。
 */
export function createBridgeRails(palette: Palette): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: mix(palette.road, '#FFFFFF', 0.45) });
  // 欄干(基準形の直線は南北に走るので、東西の縁に置く)
  for (const dx of [-0.3, 0.3]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.94), mat);
    rail.position.set(dx, 0.05, 0);
    rail.castShadow = true;
    g.add(rail);
    // 橋げたの柱頭。欄干の両端に少し太い柱を立てる
    for (const dz of [-0.4, 0.4]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.1), mat);
      post.position.set(dx, 0.08, dz);
      post.castShadow = true;
      g.add(post);
    }
  }
  return g;
}
