import * as THREE from 'three';
import { TILE_T, lambert, makeRoadCenter, makeRoadStub } from '../engine/parts.js';

// y 軸まわりに k*90 度回転: (x, z) -> (z, -x) を k 回
export function rotateRel(rel, k) {
  let { x, z } = rel;
  const n = ((k % 4) + 4) % 4;
  for (let i = 0; i < n; i++) {
    const nx = z;
    const nz = -x;
    x = nx;
    z = nz;
  }
  return { x, z };
}

// 回転塔。def: { id, x, z, h, arms:[{x,z}], initial, solution:[k], radius?, ring? }
export function createRotator(root, def, palette) {
  const group = new THREE.Group();
  group.position.set(def.x, 0, def.z);
  root.add(group);

  const R = def.radius ?? 1.15;
  const RING = def.ring ?? R + 0.25;
  const H = def.h;
  const dragTargets = [];
  const tapMeshes = [];

  const bodyMat = lambert(palette.towerBody);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H - TILE_T, 40), bodyMat);
  body.position.y = (H - TILE_T) / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  dragTargets.push(body);

  const stripeMat = lambert(palette.towerBodyDark);
  const stripes = R > 0.9 ? 8 : 5;
  for (let i = 0; i < stripes; i++) {
    const a = (i / stripes) * Math.PI * 2;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.14, Math.max(0.6, H - TILE_T - 0.8), 0.12), stripeMat);
    stripe.position.set(Math.cos(a) * (R - 0.02), (H - TILE_T) / 2, Math.sin(a) * (R - 0.02));
    stripe.rotation.y = -a;
    group.add(stripe);
    dragTargets.push(stripe);
  }

  // ハンドル(根元のリング)
  const handleMat = lambert(palette.handle, { emissive: palette.handleGlow, emissiveIntensity: 0 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(RING, RING * 1.03, 0.42, 48), handleMat);
  handle.position.y = 0.21;
  handle.castShadow = true;
  handle.receiveShadow = true;
  group.add(handle);
  dragTargets.push(handle);

  const notchMat = lambert(0xfff1e2);
  const notches = Math.round(RING * 11);
  for (let i = 0; i < notches; i++) {
    const a = (i / notches) * Math.PI * 2;
    const notch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.2), notchMat);
    notch.position.set(Math.cos(a) * RING, 0.21, Math.sin(a) * RING);
    notch.rotation.y = -a;
    group.add(notch);
    dragTargets.push(notch);
  }
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 16), lambert(0xfff1e2));
  knob.position.set(RING + 0.1, 0.36, 0);
  knob.castShadow = true;
  group.add(knob);
  dragTargets.push(knob);

  // 上面の道タイル
  const topMat = lambert(palette.towerTop);
  const roadMat = lambert(palette.road);
  const armSet = new Set(def.arms.map((a) => `${a.x},${a.z}`));
  for (const arm of def.arms) {
    const tile = new THREE.Mesh(new THREE.BoxGeometry(1, TILE_T, 1), topMat);
    tile.position.set(arm.x, H - TILE_T / 2, arm.z);
    tile.castShadow = true;
    tile.receiveShadow = true;
    tile.userData.cellRef = { gadget: def.id, rel: { ...arm } };
    group.add(tile);
    tapMeshes.push(tile);
    dragTargets.push(tile);

    const road = makeRoadCenter(arm.x, H, arm.z, roadMat);
    road.userData.cellRef = tile.userData.cellRef;
    group.add(road);
    tapMeshes.push(road);
    dragTargets.push(road);

    // 隣の腕へ、または腕の外側へ帯を伸ばす(切れた道に見せる)
    for (const d of [
      { x: 1, z: 0 },
      { x: -1, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: -1 },
    ]) {
      const nk = `${arm.x + d.x},${arm.z + d.z}`;
      const outward = arm.x * d.x + arm.z * d.z > 0;
      if (armSet.has(nk) || outward) {
        const seg = makeRoadStub(arm.x, H, arm.z, d, roadMat);
        seg.userData.cellRef = tile.userData.cellRef;
        group.add(seg);
        tapMeshes.push(seg);
        dragTargets.push(seg);
      }
    }
  }

  const g = {
    id: def.id,
    type: 'rotator',
    def,
    group,
    dragTargets,
    tapMeshes,
    handleMat,
    snapIndex: def.initial,
    angle: def.initial * (Math.PI / 2),
    targetAngle: 0,
    snapping: false,
    dragging: false,
    hint: 0,
    onSnap: null,
  };
  group.rotation.y = g.angle;

  g.busy = () => g.snapping || g.dragging;
  g.isDone = () => def.solution.includes(g.snapIndex);

  g.cells = () => {
    const out = [];
    for (const arm of def.arms) {
      const r = rotateRel(arm, g.snapIndex);
      out.push({ x: def.x + r.x, z: def.z + r.z, h: H, gadget: def.id, rel: arm });
    }
    return out;
  };

  g.resolve = (ref) => {
    const r = rotateRel(ref.rel, g.snapIndex);
    return { x: def.x + r.x, z: def.z + r.z };
  };

  g.worldOf = (cell) => {
    const v = new THREE.Vector3(cell.rel.x, H, cell.rel.z);
    v.applyAxisAngle(new THREE.Vector3(0, 1, 0), g.angle);
    v.x += def.x;
    v.z += def.z;
    return v;
  };

  g.hintPoint = () => new THREE.Vector3(def.x, H, def.z);

  g.beginDrag = () => {
    g.dragging = true;
    g.snapping = false;
    g.dragStartAngle = g.angle;
    g.lastTick = g.angle;
  };
  // dx, dy: 画面ピクセルの移動量。ctx.minSide: 画面の短辺
  g.drag = (dx, dy, ctx) => {
    const scale = (Math.PI * 1.15) / ctx.minSide;
    g.angle = g.dragStartAngle + dx * scale;
    group.rotation.y = g.angle;
    if (Math.abs(g.angle - g.lastTick) > Math.PI / 16) {
      g.lastTick = g.angle;
      return 'tick';
    }
    return null;
  };
  g.release = () => {
    g.dragging = false;
    const step = Math.PI / 2;
    const k = Math.round(g.angle / step);
    g.targetAngle = k * step;
    g.pendingIndex = ((k % 4) + 4) % 4;
    g.snapping = true;
  };

  g.update = (dt, time) => {
    if (g.snapping) {
      const diff = g.targetAngle - g.angle;
      if (Math.abs(diff) < 0.004) {
        g.angle = g.targetAngle;
        g.snapping = false;
        const changed = g.pendingIndex !== g.snapIndex;
        g.snapIndex = g.pendingIndex;
        group.rotation.y = g.angle;
        if (g.onSnap) g.onSnap(g, changed);
      } else {
        g.angle += diff * Math.min(1, dt * 12);
        group.rotation.y = g.angle;
      }
    }
    const idle = !g.isDone();
    const p = (Math.sin(time * 2.4) + 1) / 2;
    let target = idle ? 0.15 + p * 0.5 : 0;
    if (g.hint > 0) target = 0.5 + p * 0.9;
    handleMat.emissiveIntensity += (target - handleMat.emissiveIntensity) * Math.min(1, dt * 6);
    const s = idle ? 1 + p * 0.03 * (1 + g.hint) : 1;
    group.scale.set(s, 1, s);
  };

  return g;
}
