import * as THREE from 'three';
import { lambert, makeBlock, makeStairs } from '../engine/parts.js';

// スイッチ床。def: { id, x, z, h, target }(target: stairs の id)
export function createSwitch(root, def, palette) {
  const group = new THREE.Group();
  root.add(group);
  const H = def.h;
  const tapMeshes = [];

  const sideMat = lambert(palette.platformSide);
  const topMat = lambert(palette.platformTop);
  const block = makeBlock(def.x, def.z, H - 0.18, 0, sideMat, topMat);
  block.userData.cellRef = { x: def.x, z: def.z };
  group.add(block);
  tapMeshes.push(block);

  const discMat = lambert(palette.handle, { emissive: palette.handleGlow, emissiveIntensity: 0 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.16, 32), discMat);
  disc.position.set(def.x, H - 0.1, def.z);
  disc.castShadow = true;
  disc.userData.cellRef = block.userData.cellRef;
  group.add(disc);
  tapMeshes.push(disc);

  // 上に浮かぶ小さな光
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfff6c8 }));
  orb.position.set(def.x, H + 0.6, def.z);
  group.add(orb);

  const g = {
    id: def.id,
    type: 'switch',
    def,
    group,
    dragTargets: [],
    tapMeshes,
    triggered: false,
    hint: 0,
    press: 0,
    onTrigger: null,
  };
  g.busy = () => false;
  g.isDone = () => g.triggered;
  g.cells = () => [{ x: def.x, z: def.z, h: H, switch: def.id }];
  g.resolve = (ref) => ({ x: ref.x, z: ref.z });
  g.hintPoint = () => new THREE.Vector3(def.x, H, def.z);
  g.trigger = () => {
    if (g.triggered) return;
    g.triggered = true;
    if (g.onTrigger) g.onTrigger(g);
  };
  g.update = (dt, time) => {
    const p = (Math.sin(time * 2.4) + 1) / 2;
    let target = g.triggered ? 0 : 0.15 + p * 0.5;
    if (g.hint > 0) target = 0.5 + p * 0.9;
    discMat.emissiveIntensity += (target - discMat.emissiveIntensity) * Math.min(1, dt * 6);
    g.press += ((g.triggered ? 1 : 0) - g.press) * Math.min(1, dt * 8);
    disc.position.y = H - 0.1 - g.press * 0.12;
    orb.visible = !g.triggered;
    orb.position.y = H + 0.55 + Math.sin(time * 3) * 0.08 * (1 + g.hint);
    orb.scale.setScalar(1 + p * 0.4 * (1 + g.hint));
  };
  return g;
}

// せり上がる階段群。def: { id, cells:[{x,z,h,stair:{x,z}}], base? }
export function createStairs(root, def, palette) {
  const group = new THREE.Group();
  root.add(group);
  const parts = [];
  const sideMat = lambert(palette.platformSide);
  const topMat = lambert(palette.platformTop);
  for (const c of def.cells) {
    const pg = new THREE.Group();
    const mesh = c.stair
      ? makeStairs(c.x, c.z, c.h, def.base ?? 0, c.stair, sideMat, topMat)
      : makeBlock(c.x, c.z, c.h, def.base ?? 0, sideMat, topMat);
    mesh.traverse((m) => {
      if (m.isMesh) m.userData.cellRef = { x: c.x, z: c.z };
    });
    pg.add(mesh);
    pg.position.y = -(c.h + 1.5);
    group.add(pg);
    parts.push({ group: pg, cell: c, delay: 0, t: 0 });
  }
  const tapMeshes = [];
  group.traverse((m) => {
    if (m.isMesh) tapMeshes.push(m);
  });

  const g = {
    id: def.id,
    type: 'stairs',
    def,
    group,
    dragTargets: [],
    tapMeshes,
    risen: false,
    rising: false,
    hint: 0,
    onRisen: null,
    onStep: null,
  };
  g.busy = () => g.rising;
  g.isDone = () => g.risen;
  g.cells = () => (g.risen ? def.cells.map((c) => ({ x: c.x, z: c.z, h: c.h, stair: c.stair, gadget: def.id })) : []);
  g.resolve = (ref) => ({ x: ref.x, z: ref.z });
  g.worldOf = (cell) => new THREE.Vector3(cell.x, cell.stair ? cell.h - 0.5 : cell.h, cell.z);
  g.hintPoint = () => new THREE.Vector3(def.cells[0].x, def.cells[0].h, def.cells[0].z);
  g.rise = () => {
    if (g.risen || g.rising) return;
    g.rising = true;
    parts.forEach((p, i) => {
      p.delay = 0.25 + i * 0.35;
      p.t = 0;
    });
  };
  g.update = (dt) => {
    if (!g.rising) return;
    let done = true;
    for (const p of parts) {
      if (p.delay > 0) {
        p.delay -= dt;
        done = false;
        continue;
      }
      if (p.t < 1) {
        const was = p.t;
        p.t = Math.min(1, p.t + dt / 0.55);
        if (was === 0 && g.onStep) g.onStep();
        const e = 1 - Math.pow(1 - p.t, 3);
        p.group.position.y = -(p.cell.h + 1.5) * (1 - e);
        if (p.t < 1) done = false;
      }
    }
    if (done) {
      g.rising = false;
      g.risen = true;
      if (g.onRisen) g.onRisen(g);
    }
  };
  return g;
}
