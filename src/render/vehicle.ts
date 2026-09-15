import * as THREE from 'three';
import type { Board, Vec2 } from '../core/types';
import { tileAt } from '../core/board';
import { STEP_HEIGHT, TILE_THICKNESS } from './tileMesh';

/** 1 タイルあたりの走行時間(4.4 / 7.4) */
export const SECONDS_PER_TILE = 0.6;
/** スタートへ戻るのにかける時間(4.4) */
export const RETURN_SECONDS = 1.5;

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

  const wheelGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.06, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x17171a });
  for (const [dx, dz] of [
    [0.15, 0.15],
    [0.15, -0.15],
    [-0.15, 0.15],
    [-0.15, -0.15],
  ] as const) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(dx, 0.075, dz);
    wheel.castShadow = true;
    g.add(wheel);
  }
  return g;
}

export function createVehicle(kind: 'car' | 'train'): Vehicle {
  const group = new THREE.Group();
  // M2 では車のみ。列車は M3 で追加する
  const bodyPivot = new THREE.Group();
  bodyPivot.add(buildCar());
  group.add(bodyPivot);
  void kind;

  let points: THREE.Vector3[] = [];
  let mode: VehicleMode = 'idle';
  let progress = 0; // 0..points.length-1 のタイル単位
  let onArrive: (() => void) | undefined;
  const returnFrom = new THREE.Vector3();
  let returnT = 0;
  let tilt = 0;
  let puzzled = 0;
  let puzzledTarget = 0;

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  function cellCenter(board: Board, p: Vec2): THREE.Vector3 {
    const t = tileAt(board, p);
    return new THREE.Vector3(p.x, (t?.height ?? 0) * STEP_HEIGHT + TILE_THICKNESS, p.y);
  }

  function sample(u: number, out: THREE.Vector3): void {
    if (points.length === 0) {
      out.set(0, 0, 0);
      return;
    }
    const clamped = Math.min(Math.max(u, 0), points.length - 1);
    const i = Math.floor(clamped);
    const f = clamped - i;
    const a = points[i]!;
    const b = points[Math.min(i + 1, points.length - 1)]!;
    out.copy(a).lerp(b, f);
  }

  function applyPose(): void {
    sample(progress, tmpA);
    group.position.copy(tmpA);
    sample(Math.min(progress + 0.08, points.length - 1), tmpB);
    if (tmpB.distanceToSquared(tmpA) > 1e-6) {
      const dir = tmpB.clone().sub(tmpA);
      group.rotation.y = Math.atan2(-dir.z, dir.x);
    }
    bodyPivot.rotation.z = tilt + puzzled;
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
    returnToStart() {
      if (points.length === 0) return;
      if (mode === 'returning') return;
      returnFrom.copy(group.position);
      returnT = 0;
      puzzledTarget = 0;
      mode = 'returning';
    },
    tick(dt, t) {
      if (points.length === 0) return;
      puzzled += (puzzledTarget - puzzled) * Math.min(1, dt * 6);
      if (mode === 'driving') {
        const before = group.rotation.y;
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
        let delta = group.rotation.y - before;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        tilt = THREE.MathUtils.clamp(tilt * 0.85 + delta * 1.2, -0.28, 0.28);
        bodyPivot.rotation.z = tilt;
      } else if (mode === 'returning') {
        returnT += dt / RETURN_SECONDS;
        if (returnT >= 1) {
          returnT = 1;
          progress = 0;
          mode = 'idle';
        }
        const e = returnT < 0.5 ? 2 * returnT * returnT : 1 - Math.pow(-2 * returnT + 2, 2) / 2;
        sample(0, tmpA);
        group.position.copy(returnFrom).lerp(tmpA, e);
        tilt *= 0.9;
        bodyPivot.rotation.z = tilt + puzzled;
      } else {
        // 待機中は軽く振動して「エンジンをかけて待っている」ことを示す(3.3-(5))
        tilt *= 0.9;
        const idle = mode === 'idle' ? Math.sin(t * 34) * 0.004 : 0;
        bodyPivot.position.y = idle;
        bodyPivot.rotation.z = tilt + puzzled;
      }
    },
    get mode() {
      return mode;
    },
  };
}
