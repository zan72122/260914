import * as THREE from 'three';
import { PALETTE } from './scene.js';
import { lambert, makeBlock, makeRoadCenter, makeRoadStub } from './engine/parts.js';
import { DIRS, key } from './engine/graph.js';
import { createRotator, rotateRel } from './gadgets/rotator.js';
import { createSlider } from './gadgets/slider.js';
import { createSwitch, createStairs } from './gadgets/switchFloor.js';
import { createDoor } from './effects.js';

// 面のデータから 3D の建物一式を組み立てる
export function buildLevel(level, scene) {
  const root = new THREE.Group();
  scene.add(root);
  const palette = { ...PALETTE, ...(level.palette ?? {}) };

  const gadgets = new Map();
  const tapMeshes = [];
  const bbox = new THREE.Box3();

  for (const def of level.gadgets ?? []) {
    let g;
    if (def.type === 'rotator') g = createRotator(root, def, palette);
    else if (def.type === 'slider') g = createSlider(root, def, palette);
    else if (def.type === 'switch') g = createSwitch(root, def, palette);
    else if (def.type === 'stairs') g = createStairs(root, def, palette);
    if (!g) continue;
    gadgets.set(def.id, g);
    tapMeshes.push(...g.tapMeshes);
  }
  // スイッチ → 階段のつなぎ
  for (const g of gadgets.values()) {
    if (g.type === 'switch') {
      const target = gadgets.get(g.def.target);
      g.onTrigger = () => target && target.rise();
    }
  }

  // 「いつか道になりうる場所」の集合(道の帯を切れ目まで伸ばすため)
  const union = new Map();
  const addU = (x, z, h) => union.set(key(x, z), { x, z, h });
  for (const c of level.cells) addU(c.x, c.z, c.h);
  for (const def of level.gadgets ?? []) {
    if (def.type === 'rotator') {
      for (let k = 0; k < 4; k++)
        for (const a of def.arms) {
          const r = rotateRel(a, k);
          addU(def.x + r.x, def.z + r.z, def.h);
        }
    } else if (def.type === 'slider') {
      for (const c of def.cells) addU(c.x, c.z, def.h);
    } else if (def.type === 'switch') {
      addU(def.x, def.z, def.h);
    } else if (def.type === 'stairs') {
      for (const c of def.cells) addU(c.x, c.z, c.h);
    }
  }
  const hasNeighbor = (c, d) => {
    const n = union.get(key(c.x + d.x, c.z + d.z));
    if (n && Math.abs(n.h - c.h) <= 1) return true;
    if (level.illusion) {
      for (const t of [1, -1]) {
        const m = union.get(key(c.x + d.x + t, c.z + d.z + t));
        if (m && m.h === c.h + t) return true;
      }
    }
    return false;
  };

  // 固定の足場
  const sideMat = lambert(palette.platformSide);
  const topMat = lambert(palette.platformTop);
  const roadMat = lambert(palette.road);
  const staticCells = [];
  for (const c of level.cells) {
    const cell = { x: c.x, z: c.z, h: c.h };
    staticCells.push(cell);
    const block = makeBlock(c.x, c.z, c.h, c.base ?? 0, sideMat, topMat);
    block.userData.cellRef = { x: c.x, z: c.z };
    root.add(block);
    tapMeshes.push(block);
    const road = makeRoadCenter(c.x, c.h, c.z, roadMat);
    road.userData.cellRef = block.userData.cellRef;
    root.add(road);
    tapMeshes.push(road);
    for (const d of DIRS) {
      if (hasNeighbor(cell, d)) {
        const seg = makeRoadStub(c.x, c.h, c.z, d, roadMat);
        seg.userData.cellRef = block.userData.cellRef;
        root.add(seg);
        tapMeshes.push(seg);
      }
    }
    bbox.expandByPoint(new THREE.Vector3(c.x - 0.5, 0, c.z - 0.5));
    bbox.expandByPoint(new THREE.Vector3(c.x + 0.5, c.h, c.z + 0.5));
  }
  for (const u of union.values()) {
    bbox.expandByPoint(new THREE.Vector3(u.x - 0.5, 0, u.z - 0.5));
    bbox.expandByPoint(new THREE.Vector3(u.x + 0.5, u.h, u.z + 0.5));
  }

  // 飾り
  const lights = [];
  for (const d of level.decor ?? []) {
    if (d.type === 'box') {
      const side = lambert(d.color);
      const top = lambert(d.top ?? d.color);
      const height = d.h - (d.base ?? 0);
      const m = new THREE.Mesh(new THREE.BoxGeometry(d.w, height, d.d), [side, side, top, side, side, side]);
      m.position.set(d.x, (d.base ?? 0) + height / 2, d.z);
      m.castShadow = true;
      m.receiveShadow = true;
      root.add(m);
      bbox.expandByPoint(new THREE.Vector3(d.x - d.w / 2, 0, d.z - d.d / 2));
      bbox.expandByPoint(new THREE.Vector3(d.x + d.w / 2, d.h, d.z + d.d / 2));
    } else if (d.type === 'lantern') {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8), lambert(0x8a7a9a));
      pole.position.set(d.x, d.h + 0.6, d.z);
      root.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), new THREE.MeshBasicMaterial({ color: 0xffd98a }));
      lamp.position.set(d.x, d.h + 1.25, d.z);
      root.add(lamp);
      const light = new THREE.PointLight(0xffc070, 1.6, 5, 2);
      light.position.copy(lamp.position);
      root.add(light);
      lights.push({ light, lamp });
    }
  }

  // 扉(ゴール)と入口
  const goalCell = level.cells.find((c) => c.x === level.goal.x && c.z === level.goal.z);
  const door = createDoor(root, goalCell, level.doorDir, palette, false);
  const startCell = level.cells.find((c) => c.x === level.start.x && c.z === level.start.z);
  const entry = createDoor(root, startCell, level.entryDir, palette, true);
  bbox.expandByPoint(new THREE.Vector3(goalCell.x, goalCell.h + 2.4, goalCell.z));
  bbox.expandByPoint(new THREE.Vector3(startCell.x, startCell.h + 2.4, startCell.z));

  const built = {
    level,
    root,
    palette,
    gadgets,
    tapMeshes,
    bbox,
    door,
    entry,
    lights,
    goalCell,
    startCell,
  };

  // 現在の歩けるセル
  built.cellsNow = () => {
    const cells = new Map();
    for (const c of staticCells) cells.set(key(c.x, c.z), c);
    for (const g of gadgets.values()) for (const c of g.cells()) cells.set(key(c.x, c.z), c);
    return cells;
  };

  built.dragTargets = () => {
    const out = [];
    for (const g of gadgets.values()) for (const m of g.dragTargets) out.push({ mesh: m, gadget: g });
    return out;
  };

  // メッシュの cellRef から現在のグリッド座標へ
  built.resolveRef = (ref) => {
    if (ref.gadget) return gadgets.get(ref.gadget).resolve(ref);
    return { x: ref.x, z: ref.z };
  };

  built.update = (dt, time) => {
    for (const g of gadgets.values()) g.update(dt, time);
    for (const l of lights) l.light.intensity = 1.4 + Math.sin(time * 5 + l.lamp.position.x) * 0.25;
  };

  built.dispose = () => {
    scene.remove(root);
    root.traverse((m) => {
      if (m.geometry) m.geometry.dispose();
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => mat.dispose());
    });
  };

  return built;
}
