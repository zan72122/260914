import * as THREE from 'three';
import type { Board, Vec2 } from '../core/types';
import { tileAt } from '../core/board';
import { topYOf } from './tileMesh';

/** 1 タイルあたりの走行時間(4.4 / 7.4) */
export const SECONDS_PER_TILE = 0.6;
/** スタートへ戻るのにかける時間(4.4) */
export const RETURN_SECONDS = 1.5;
/** 列車の客車が先頭の軌跡を遅れて追う量(タイル単位) */
export const CAR_SPACING = 0.5;

export type VehicleMode = 'idle' | 'driving' | 'stopped' | 'returning';

export interface Vehicle {
  readonly group: THREE.Group;
  /** 走らせる経路を設定して先頭に置く */
  place(board: Board, path: readonly Vec2[]): void;
  /** 走り出す。onArrive は終端に着いたとき 1 回だけ呼ばれる */
  drive(onArrive?: () => void): void;
  /** すぐスタートへ戻す(走行中の操作、ヒント後など) */
  returnToStart(): void;
  /** 首をかしげる傾き(3.4 のヒント演出) */
  setPuzzled(on: boolean): void;
  /**
   * タイルの上下アニメに追従させるための Y オフセット取得関数。
   * 乗り物はタイルの上に乗っているので、タイルが持ち上がれば一緒に上がる(4.2 T2)。
   */
  setLiftOffset(fn: (cellX: number, cellY: number) => number): void;
  tick(dt: number, t: number): void;
  readonly mode: VehicleMode;
}

/** 車 = 箱 2 つ + 円柱 4 輪(7.2) */
function buildCar(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.15, 0.28),
    new THREE.MeshLambertMaterial({ color: 0x2b2b30 }),
  );
  body.position.y = 0.14;
  body.castShadow = true;
  g.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.13, 0.24),
    new THREE.MeshLambertMaterial({ color: 0x3d4450 }),
  );
  cabin.position.set(-0.02, 0.27, 0);
  cabin.castShadow = true;
  g.add(cabin);

  addWheels(g, [0.15, -0.15]);
  return g;
}

function addWheels(g: THREE.Group, xs: readonly number[]): void {
  const wheelGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.06, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x17171a });
  for (const dx of xs) {
    for (const dz of [0.13, -0.13]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(dx, 0.075, dz);
      wheel.castShadow = true;
      g.add(wheel);
    }
  }
}

/** 列車の先頭 = 箱 + 円柱の煙突(7.2) */
function buildLocomotive(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xc0392b });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.3), mat);
  body.position.y = 0.19;
  body.castShadow = true;
  g.add(body);

  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.28), new THREE.MeshLambertMaterial({ color: 0x8e2b21 }));
  cab.position.set(-0.14, 0.37, 0);
  cab.castShadow = true;
  g.add(cab);

  const stack = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.07, 0.2, 10),
    new THREE.MeshLambertMaterial({ color: 0x2b2b30 }),
  );
  stack.position.set(0.16, 0.38, 0);
  stack.castShadow = true;
  g.add(stack);

  addWheels(g, [0.16, 0, -0.16]);
  return g;
}

/** 客車 = 箱 + 車輪 */
function buildCarriage(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.22, 0.28),
    new THREE.MeshLambertMaterial({ color: 0xe0b15a }),
  );
  body.position.y = 0.21;
  body.castShadow = true;
  g.add(body);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.05, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x6b4f2a }),
  );
  roof.position.y = 0.34;
  roof.castShadow = true;
  g.add(roof);

  addWheels(g, [0.11, -0.11]);
  return g;
}

interface Unit {
  /** ワールド座標に直接置かれる入れ物 */
  readonly root: THREE.Group;
  /** 傾き用の入れ子 */
  readonly pivot: THREE.Group;
  /** 先頭からの遅れ(タイル単位) */
  readonly lag: number;
}

export function createVehicle(kind: 'car' | 'train'): Vehicle {
  const group = new THREE.Group();
  const units: Unit[] = [];

  const addUnit = (body: THREE.Group, lag: number): void => {
    const root = new THREE.Group();
    const pivot = new THREE.Group();
    pivot.add(body);
    root.add(pivot);
    group.add(root);
    units.push({ root, pivot, lag });
  };

  if (kind === 'train') {
    // 先頭 + 客車 2 両。後続は先頭の軌跡を遅延追従する(4.4)
    addUnit(buildLocomotive(), 0);
    addUnit(buildCarriage(), CAR_SPACING);
    addUnit(buildCarriage(), CAR_SPACING * 2);
  } else {
    addUnit(buildCar(), 0);
  }

  let points: THREE.Vector3[] = [];
  let mode: VehicleMode = 'idle';
  let progress = 0; // 0..points.length-1 のタイル単位
  let onArrive: (() => void) | undefined;
  let returnT = 0;
  let tilt = 0;
  let puzzled = 0;
  let puzzledTarget = 0;
  let liftOffset: (x: number, y: number) => number = () => 0;

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();
  /** スタートへ戻るときの各車両の出発位置 */
  const returnFroms: THREE.Vector3[] = units.map(() => new THREE.Vector3());

  function cellCenter(board: Board, p: Vec2): THREE.Vector3 {
    const t = tileAt(board, p);
    return new THREE.Vector3(p.x, topYOf(t?.height ?? 0), p.y);
  }

  /**
   * 経路上の位置。u が 0 未満のときは先頭区間の向きへ真っ直ぐ延長する。
   * 待機中の列車の客車がスタートの手前に並ぶため(高さは始点のまま保つ)。
   */
  function sample(u: number, out: THREE.Vector3): void {
    if (points.length === 0) {
      out.set(0, 0, 0);
      return;
    }
    if (u < 0 && points.length >= 2) {
      const a = points[0]!;
      const b = points[1]!;
      out.copy(a).addScaledVector(tmpDir.copy(b).sub(a).setY(0).normalize(), u);
      out.y = a.y;
      return;
    }
    const clamped = Math.min(Math.max(u, 0), points.length - 1);
    const i = Math.floor(clamped);
    const f = clamped - i;
    const a = points[i]!;
    const b = points[Math.min(i + 1, points.length - 1)]!;
    out.copy(a).lerp(b, f);
    // 乗っているタイルが上下アニメ中なら一緒に動く
    out.y += liftOffset(Math.round(out.x), Math.round(out.z));
  }

  function poseUnit(unit: Unit, u: number): void {
    sample(u, tmpA);
    unit.root.position.copy(tmpA);
    sample(Math.min(u + 0.08, points.length - 1), tmpB);
    if (tmpB.distanceToSquared(tmpA) > 1e-6) {
      const dir = tmpB.clone().sub(tmpA);
      unit.root.rotation.y = Math.atan2(-dir.z, dir.x);
    }
    unit.pivot.rotation.z = tilt + puzzled;
  }

  function applyPose(): void {
    for (const unit of units) poseUnit(unit, progress - unit.lag);
  }

  return {
    group,
    place(board, path) {
      points = path.map((p) => cellCenter(board, p));
      progress = 0;
      mode = 'idle';
      tilt = 0;
      puzzled = 0;
      puzzledTarget = 0;
      onArrive = undefined;
      group.visible = points.length > 0;
      applyPose();
    },
    drive(cb) {
      if (points.length < 2) return;
      onArrive = cb;
      mode = 'driving';
    },
    setPuzzled(on: boolean) {
      puzzledTarget = on ? 0.22 : 0;
    },
    setLiftOffset(fn) {
      liftOffset = fn;
    },
    returnToStart() {
      if (points.length === 0) return;
      if (mode === 'returning') return;
      units.forEach((u, i) => returnFroms[i]!.copy(u.root.position));
      returnT = 0;
      puzzledTarget = 0;
      mode = 'returning';
    },
    tick(dt, t) {
      if (points.length === 0) return;
      puzzled += (puzzledTarget - puzzled) * Math.min(1, dt * 6);
      if (mode === 'driving') {
        const before = units[0]!.root.rotation.y;
        progress += dt / SECONDS_PER_TILE;
        if (progress >= points.length - 1) {
          progress = points.length - 1;
          mode = 'stopped';
          applyPose();
          const cb = onArrive;
          onArrive = undefined;
          cb?.();
          return;
        }
        applyPose();
        // カーブで車体が傾く(4.4)
        let delta = units[0]!.root.rotation.y - before;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        tilt = THREE.MathUtils.clamp(tilt * 0.85 + delta * 1.2, -0.28, 0.28);
        for (const unit of units) unit.pivot.rotation.z = tilt;
      } else if (mode === 'returning') {
        returnT += dt / RETURN_SECONDS;
        if (returnT >= 1) {
          returnT = 1;
          progress = 0;
          mode = 'idle';
        }
        const e = returnT < 0.5 ? 2 * returnT * returnT : 1 - Math.pow(-2 * returnT + 2, 2) / 2;
        tilt *= 0.9;
        units.forEach((unit, i) => {
          sample(-unit.lag, tmpB);
          unit.root.position.copy(returnFroms[i]!).lerp(tmpB, e);
          unit.pivot.rotation.z = tilt + puzzled;
        });
      } else {
        // 待機中は軽く振動して「エンジンをかけて待っている」ことを示す(3.3-(5))
        tilt *= 0.9;
        const idle = mode === 'idle' ? Math.sin(t * 34) * 0.004 : 0;
        applyPose();
        for (const unit of units) {
          unit.pivot.position.y = idle;
          unit.pivot.rotation.z = tilt + puzzled;
        }
      }
    },
    get mode() {
      return mode;
    },
  };
}
