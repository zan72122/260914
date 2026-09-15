import * as THREE from 'three';
import type { Board, Vec2 } from '../core/types';
import { tileAt } from '../core/board';
import { STEP_HEIGHT, TILE_THICKNESS } from './tileMesh';

/** 経路プレビュー線の光が端から端まで流れる時間(7.4) */
export const SWEEP_DURATION = 0.8;

const LINE_Y = 0.055;

export interface PathLine {
  readonly group: THREE.Group;
  /** path に合わせて線を張り直す。切れ目で途切れる(G5 / 3.3-(5)) */
  update(board: Board, path: readonly Vec2[]): void;
  /** 繋がった瞬間に呼ぶ。端から端へ光を流す(3.3-(6)) */
  startSweep(): void;
  tick(dt: number): void;
  /** 経路上の距離 s(0..1)における世界座標 */
  pointAt(u: number, out: THREE.Vector3): THREE.Vector3;
  readonly length: number;
}

function cellCenter(board: Board, p: Vec2): THREE.Vector3 {
  const t = tileAt(board, p);
  return new THREE.Vector3(p.x, (t?.height ?? 0) * STEP_HEIGHT + TILE_THICKNESS + LINE_Y, p.y);
}

export function createPathLine(color = 0xd94f3d): PathLine {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, depthWrite: false, depthTest: false });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff4c0, depthWrite: false, depthTest: false, transparent: true });
  const segGeo = new THREE.BoxGeometry(1, 0.03, 0.07);

  let points: THREE.Vector3[] = [];
  let cumulative: number[] = [];
  let total = 0;

  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), glowMat);
  glow.visible = false;
  glow.renderOrder = 7;
  group.add(glow);

  let sweep = -1;

  function clearSegments(): void {
    for (let i = group.children.length - 1; i >= 0; i--) {
      const c = group.children[i];
      if (c && c !== glow) group.remove(c);
    }
  }

  function update(board: Board, path: readonly Vec2[]): void {
    clearSegments();
    points = path.map((p) => cellCenter(board, p));
    cumulative = [0];
    total = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      total += a.distanceTo(b);
      cumulative.push(total);

      const seg = new THREE.Mesh(segGeo, mat);
      seg.position.copy(a).lerp(b, 0.5);
      const d = new THREE.Vector3().subVectors(b, a);
      seg.scale.set(Math.max(d.length(), 0.001), 1, 1);
      seg.rotation.y = Math.atan2(-d.z, d.x);
      seg.renderOrder = 6;
      group.add(seg);
    }
    // 経路が 1 タイルしかない場合も「ここまでは来ている」ことを小さな点で示す
    if (points.length === 1) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6), mat);
      dot.position.copy(points[0]!);
      dot.renderOrder = 6;
      group.add(dot);
    }
    sweep = -1;
    glow.visible = false;
  }

  function pointAt(u: number, out: THREE.Vector3): THREE.Vector3 {
    if (points.length === 0) return out.set(0, 0, 0);
    if (points.length === 1 || total <= 0) return out.copy(points[0]!);
    const s = Math.min(Math.max(u, 0), 1) * total;
    let i = 1;
    while (i < cumulative.length - 1 && cumulative[i]! < s) i++;
    const a = points[i - 1]!;
    const b = points[i]!;
    const segLen = cumulative[i]! - cumulative[i - 1]!;
    const f = segLen <= 0 ? 0 : (s - cumulative[i - 1]!) / segLen;
    return out.copy(a).lerp(b, f);
  }

  return {
    group,
    update,
    startSweep() {
      if (points.length < 2) return;
      sweep = 0;
      glow.visible = true;
    },
    tick(dt: number) {
      if (sweep < 0) return;
      sweep += dt / SWEEP_DURATION;
      if (sweep >= 1) {
        sweep = -1;
        glow.visible = false;
        return;
      }
      pointAt(sweep, glow.position);
      glowMat.opacity = Math.sin(sweep * Math.PI) * 0.9 + 0.1;
    },
    pointAt,
    get length() {
      return total;
    },
  };
}
