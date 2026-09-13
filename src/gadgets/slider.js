import * as THREE from 'three';
import { lambert, makeBlock, makeRoadCenter, makeRoadStub } from '../engine/parts.js';

// 引き出しブロック。def: { id, cells:[{x,z}](引き切った位置), h, base?, axis:{x,z}(引く向き), travel, roadDirs? }
// t=0 が初期(奥に入っている)、t=1 が引き切った状態(歩ける)。
export function createSlider(root, def, palette) {
  const group = new THREE.Group();
  root.add(group);
  const H = def.h;
  const base = def.base ?? 0;
  const dragTargets = [];
  const tapMeshes = [];

  const sideMat = lambert(palette.drawerSide);
  const topMat = lambert(palette.drawerTop);
  const roadMat = lambert(palette.road);

  // 取っ手を付けるセル: 引く向きの先頭列のうち、中央に最も近いもの
  const along = (c) => c.x * def.axis.x + c.z * def.axis.z;
  const maxAlong = Math.max(...def.cells.map(along));
  const frontRow = def.cells.filter((c) => along(c) === maxAlong);
  const cx = def.cells.reduce((a, c) => a + c.x, 0) / def.cells.length;
  const cz = def.cells.reduce((a, c) => a + c.z, 0) / def.cells.length;
  const front = frontRow.reduce((best, c) =>
    Math.hypot(c.x - cx, c.z - cz) < Math.hypot(best.x - cx, best.z - cz) ? c : best
  );

  for (const c of def.cells) {
    if (c.x * def.axis.x + c.z * def.axis.z > front.x * def.axis.x + front.z * def.axis.z) front = c;
  }

  for (const c of def.cells) {
    const block = makeBlock(c.x, c.z, H, base, sideMat, topMat);
    block.userData.cellRef = { x: c.x, z: c.z };
    group.add(block);
    dragTargets.push(block);
    tapMeshes.push(block);
    const road = makeRoadCenter(c.x, H, c.z, roadMat);
    road.userData.cellRef = block.userData.cellRef;
    group.add(road);
    dragTargets.push(road);
    tapMeshes.push(road);
    for (const d of def.roadDirs ?? []) {
      const seg = makeRoadStub(c.x, H, c.z, d, roadMat);
      seg.userData.cellRef = block.userData.cellRef;
      group.add(seg);
      dragTargets.push(seg);
      tapMeshes.push(seg);
    }
  }

  // 取っ手: 引く向きの面に付いた大きな丸いノブ
  const knobMat = lambert(palette.handle, { emissive: palette.handleGlow, emissiveIntensity: 0 });
  const knob = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 12), knobMat);
  stem.rotation.z = Math.PI / 2;
  stem.rotation.y = Math.atan2(def.axis.x, def.axis.z) + Math.PI / 2;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 16), knobMat);
  ball.castShadow = true;
  stem.position.set(def.axis.x * 0.25, 0, def.axis.z * 0.25);
  ball.position.set(def.axis.x * 0.55, 0, def.axis.z * 0.55);
  knob.add(stem, ball);
  knob.position.set(front.x + def.axis.x * 0.5, base + (H - base) * 0.55, front.z + def.axis.z * 0.5);
  group.add(knob);
  dragTargets.push(ball, stem);

  const g = {
    id: def.id,
    type: 'slider',
    def,
    group,
    dragTargets,
    tapMeshes,
    t: 0,
    target: 0,
    snapping: false,
    dragging: false,
    hint: 0,
    onSnap: null,
  };

  const applyT = () => {
    const off = -(1 - g.t) * def.travel;
    group.position.set(def.axis.x * off, 0, def.axis.z * off);
  };
  applyT();

  g.busy = () => g.snapping || g.dragging;
  g.isDone = () => g.t === 1 && !g.snapping;
  g.cells = () => (g.isDone() ? def.cells.map((c) => ({ x: c.x, z: c.z, h: H, gadget: def.id })) : []);
  g.resolve = (ref) => ({ x: ref.x, z: ref.z });
  g.worldOf = (cell) => new THREE.Vector3(cell.x, H, cell.z);
  g.hintPoint = () => new THREE.Vector3(knob.position.x, knob.position.y, knob.position.z).add(group.position);

  g.beginDrag = () => {
    g.dragging = true;
    g.snapping = false;
    g.dragStartT = g.t;
    g.lastTick = g.t;
  };
  // ctx.axisPx: 引く向き(世界 1 単位)の画面ピクセルベクトル
  g.drag = (dx, dy, ctx) => {
    const ax = ctx.axisPx(def.axis);
    const len2 = ax.x * ax.x + ax.y * ax.y;
    const units = (dx * ax.x + dy * ax.y) / len2;
    g.t = Math.max(0, Math.min(1, g.dragStartT + units / def.travel));
    applyT();
    if (Math.abs(g.t - g.lastTick) > 0.15) {
      g.lastTick = g.t;
      return 'tick';
    }
    return null;
  };
  g.release = () => {
    g.dragging = false;
    g.target = g.t > 0.5 ? 1 : 0;
    g.snapping = true;
  };

  g.update = (dt, time) => {
    if (g.snapping) {
      const diff = g.target - g.t;
      if (Math.abs(diff) < 0.003) {
        g.t = g.target;
        g.snapping = false;
        applyT();
        if (g.onSnap) g.onSnap(g, true);
      } else {
        g.t += diff * Math.min(1, dt * 10);
        applyT();
      }
    }
    const idle = !g.isDone();
    const p = (Math.sin(time * 2.4) + 1) / 2;
    let target = idle ? 0.15 + p * 0.5 : 0;
    if (g.hint > 0) target = 0.5 + p * 0.9;
    knobMat.emissiveIntensity += (target - knobMat.emissiveIntensity) * Math.min(1, dt * 6);
    // 取っ手が引く向きに出たり戻ったりする
    const bob = idle && !g.dragging ? p * 0.12 * (1 + g.hint) : 0;
    knob.position.set(
      front.x + def.axis.x * (0.5 + bob),
      base + (H - base) * 0.55,
      front.z + def.axis.z * (0.5 + bob)
    );
  };

  return g;
}
