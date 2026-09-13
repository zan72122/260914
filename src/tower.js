import * as THREE from 'three';
import { H, TOWER_CENTER, TOWER_ARMS } from './level.js';
import { PALETTE } from './scene.js';

const BODY_R = 1.15;
const HANDLE_R = 1.4;
const TILE_T = 0.28;

// 回転する塔。group.rotation.y が連続角度、snapIndex が 90 度単位の論理回転。
export function createTower(scene) {
  const group = new THREE.Group();
  group.position.set(TOWER_CENTER.x, 0, TOWER_CENTER.z);
  scene.add(group);

  const dragTargets = [];

  // 本体(円柱)
  const bodyMat = new THREE.MeshLambertMaterial({ color: PALETTE.towerBody });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(BODY_R, BODY_R, H - TILE_T, 40), bodyMat);
  body.position.y = (H - TILE_T) / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  dragTargets.push(body);

  // 本体に縦縞(回転が見えるように)
  const stripeMat = new THREE.MeshLambertMaterial({ color: PALETTE.towerBodyDark });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, H - TILE_T - 0.8, 0.12), stripeMat);
    stripe.position.set(Math.cos(a) * (BODY_R - 0.02), (H - TILE_T) / 2, Math.sin(a) * (BODY_R - 0.02));
    stripe.rotation.y = -a;
    group.add(stripe);
    dragTargets.push(stripe);
  }

  // ハンドル(根元のリング)。他のブロックと違う色と溝で「回るもの」に見せる。
  const handleMat = new THREE.MeshLambertMaterial({ color: PALETTE.handle, emissive: PALETTE.handleGlow, emissiveIntensity: 0 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(HANDLE_R, HANDLE_R * 1.03, 0.42, 48), handleMat);
  handle.position.y = 0.21;
  handle.castShadow = true;
  handle.receiveShadow = true;
  group.add(handle);
  dragTargets.push(handle);

  // 溝(ノッチ)
  const notchMat = new THREE.MeshLambertMaterial({ color: 0xfff1e2 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const notch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.2), notchMat);
    notch.position.set(Math.cos(a) * HANDLE_R, 0.21, Math.sin(a) * HANDLE_R);
    notch.rotation.y = -a;
    group.add(notch);
    dragTargets.push(notch);
  }

  // 突起(取っ手)。回転方向が一目で分かる目印。
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 16), new THREE.MeshLambertMaterial({ color: 0xfff1e2 }));
  knob.position.set(HANDLE_R + 0.1, 0.36, 0);
  knob.castShadow = true;
  group.add(knob);
  dragTargets.push(knob);

  // 上面の L 字の道
  const tiles = [];
  const topMat = new THREE.MeshLambertMaterial({ color: PALETTE.towerTop });
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  for (const arm of TOWER_ARMS) {
    const tile = new THREE.Mesh(new THREE.BoxGeometry(1, TILE_T, 1), topMat);
    tile.position.set(arm.x, H - TILE_T / 2, arm.z);
    tile.castShadow = true;
    tile.receiveShadow = true;
    tile.userData.cell = { tower: true, rel: { ...arm } };
    group.add(tile);
    tiles.push(tile);
    dragTargets.push(tile);

    const road = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.62), roadMat);
    road.position.set(arm.x, H + 0.02, arm.z);
    road.receiveShadow = true;
    group.add(road);
    dragTargets.push(road);
  }
  // 道の連結部分(腕の間を埋める帯)
  for (const arm of TOWER_ARMS) {
    if (arm.x === 0 && arm.z === 0) continue;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(arm.x ? 0.5 : 0.62, 0.04, arm.z ? 0.5 : 0.62), roadMat);
    seg.position.set(arm.x / 2, H + 0.02, arm.z / 2);
    group.add(seg);
    dragTargets.push(seg);
  }

  const state = {
    group,
    tiles,
    dragTargets,
    handleMat,
    snapIndex: 0,
    angle: 0, // 連続角度(rad)
    targetAngle: 0,
    snapping: false,
    pulse: true, // 未解決のあいだハンドルを脈打たせる
    onSnap: null,
  };

  return state;
}

// 塔の回転を初期値に設定
export function setTowerIndex(t, k) {
  t.snapIndex = k;
  t.angle = k * (Math.PI / 2);
  t.targetAngle = t.angle;
  t.snapping = false;
  t.group.rotation.y = t.angle;
}

export function beginTowerDrag(t) {
  t.snapping = false;
  t.dragStartAngle = t.angle;
}

export function dragTower(t, deltaAngle) {
  t.angle = t.dragStartAngle + deltaAngle;
  t.group.rotation.y = t.angle;
}

export function releaseTower(t) {
  const step = Math.PI / 2;
  const k = Math.round(t.angle / step);
  t.targetAngle = k * step;
  t.snapping = true;
  t.pendingIndex = ((k % 4) + 4) % 4;
}

export function updateTower(t, dt, time) {
  if (t.snapping) {
    const diff = t.targetAngle - t.angle;
    if (Math.abs(diff) < 0.004) {
      t.angle = t.targetAngle;
      t.snapping = false;
      const changed = t.pendingIndex !== t.snapIndex;
      t.snapIndex = t.pendingIndex;
      t.group.rotation.y = t.angle;
      if (t.onSnap) t.onSnap(t.snapIndex, changed);
    } else {
      t.angle += diff * Math.min(1, dt * 12);
      t.group.rotation.y = t.angle;
    }
  }
  // ハンドルの脈動
  if (t.pulse) {
    const p = (Math.sin(time * 2.4) + 1) / 2;
    t.handleMat.emissiveIntensity = 0.15 + p * 0.5;
    const s = 1 + p * 0.03;
    t.group.scale.set(s, 1, s);
  } else {
    t.handleMat.emissiveIntensity += (0 - t.handleMat.emissiveIntensity) * Math.min(1, dt * 6);
    t.group.scale.set(1, 1, 1);
  }
}
