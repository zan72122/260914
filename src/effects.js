import * as THREE from 'three';
import { PALETTE } from './scene.js';

// ゴールの扉と光
// 扉。cell の dir 側の縁に置く。plain=true は入口用(光の粒子なし)。
export function createDoor(parent, cell, dir, palette, plain = false) {
  const group = new THREE.Group();
  group.position.set(cell.x + dir.x * 0.5, cell.h, cell.z + dir.z * 0.5);
  // 扉の正面は -dir 側(セルの内側)を向く
  group.rotation.y = Math.atan2(-dir.x, -dir.z);
  parent.add(group);

  const frameMat = new THREE.MeshLambertMaterial({ color: palette.door });
  const w = 0.9;
  const h = 1.5;
  const t = 0.16;
  const left = new THREE.Mesh(new THREE.BoxGeometry(t, h, t), frameMat);
  left.position.set(-w / 2, h / 2, 0);
  const right = left.clone();
  right.position.x = w / 2;
  const top = new THREE.Mesh(new THREE.BoxGeometry(w + t, t, t), frameMat);
  top.position.set(0, h + t / 2, 0);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.5, 4), frameMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.set(0, h + t + 0.25, 0);
  for (const m of [left, right, top, roof]) {
    m.castShadow = true;
    group.add(m);
  }

  // 光る面(奥にあふれる光)
  const glowMat = new THREE.MeshBasicMaterial({ color: palette.light, transparent: true, opacity: 0.95 });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(w - t, h), glowMat);
  glow.position.set(0, h / 2, -0.05);
  group.add(glow);

  // 扉の板(左右に開く)
  const panelMat = new THREE.MeshLambertMaterial({ color: 0xe9d3f0 });
  const pw = (w - t) / 2;
  const panelL = new THREE.Group();
  panelL.position.set(-pw, 0, 0.02);
  const pl = new THREE.Mesh(new THREE.BoxGeometry(pw, h - 0.02, 0.06), panelMat);
  pl.position.set(pw / 2, h / 2, 0);
  panelL.add(pl);
  const panelR = new THREE.Group();
  panelR.position.set(pw, 0, 0.02);
  const pr = new THREE.Mesh(new THREE.BoxGeometry(pw, h - 0.02, 0.06), panelMat);
  pr.position.set(-pw / 2, h / 2, 0);
  panelR.add(pr);
  group.add(panelL, panelR);

  // 扉の前にこぼれる光(床の上)
  const spillMat = new THREE.MeshBasicMaterial({
    color: palette.light,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.1), spillMat);
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(0, 0.06, 0.6);
  group.add(spill);

  // 光の粒子
  const sparkGeo = new THREE.BufferGeometry();
  const N = 24;
  const positions = new Float32Array(N * 3);
  const seeds = [];
  for (let i = 0; i < N; i++) {
    seeds.push({ a: Math.random() * Math.PI * 2, r: 0.2 + Math.random() * 0.5, s: 0.4 + Math.random() * 0.8, p: Math.random() });
  }
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const sparkMat = new THREE.PointsMaterial({ color: 0xfff8d6, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  group.add(sparks);

  const light = new THREE.PointLight(palette.light, 0.8, 5, 2);
  light.position.set(0, 0.8, 0.5);
  group.add(light);
  if (plain) {
    // 入口: 光らない暗い扉(ゴールと区別する)
    sparks.visible = false;
    spill.visible = false;
    light.intensity = 0;
    glowMat.color.setHex(0x3b3050);
    glowMat.opacity = 1;
  }

  return { group, panelL, panelR, glowMat, spillMat, sparks, seeds, light, plain, open: 0, targetOpen: 0, excite: 0 };
}

export function updateDoor(d, dt, time) {
  d.open += (d.targetOpen - d.open) * Math.min(1, dt * 3);
  d.panelL.rotation.y = -d.open * 1.9;
  d.panelR.rotation.y = d.open * 1.9;

  if (d.plain) return;
  const breathe = 0.5 + 0.5 * Math.sin(time * 2.2);
  const e = d.excite;
  d.spillMat.opacity = 0.25 + breathe * 0.15 + e * 0.35;
  d.light.intensity = 0.6 + breathe * 0.4 + e * 2.5 + d.open * 4;

  const pos = d.sparks.geometry.attributes.position.array;
  for (let i = 0; i < d.seeds.length; i++) {
    const s = d.seeds[i];
    const t = (time * s.s * 0.25 + s.p) % 1;
    pos[i * 3] = Math.cos(s.a + time * 0.4) * s.r * (0.6 + e * 0.8);
    pos[i * 3 + 1] = 0.1 + t * (1.4 + e);
    pos[i * 3 + 2] = 0.3 + Math.sin(s.a + time * 0.4) * 0.3;
  }
  d.sparks.geometry.attributes.position.needsUpdate = true;
  d.sparks.material.opacity = 0.5 + e * 0.5;
}

// 紙吹雪
export function createConfetti(scene) {
  const N = 140;
  const colors = [0xffc7d3, 0xfff0a8, 0xb8e4e0, 0xd7c4ee, 0xffd9b0, 0xffffff];
  const geo = new THREE.PlaneGeometry(0.14, 0.09);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true }), N);
  mesh.visible = false;
  const color = new THREE.Color();
  for (let i = 0; i < N; i++) {
    color.setHex(colors[i % colors.length]);
    mesh.setColorAt(i, color);
  }
  mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
  const parts = [];
  return { mesh, parts, active: false, dummy: new THREE.Object3D(), N };
}

export function burstConfetti(c, origin) {
  c.parts.length = 0;
  for (let i = 0; i < c.N; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1.5 + Math.random() * 2.5;
    c.parts.push({
      p: origin.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.4, (Math.random() - 0.5) * 0.4)),
      v: new THREE.Vector3(Math.cos(a) * sp * 0.6, 2.5 + Math.random() * 3, Math.sin(a) * sp * 0.6),
      r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      rv: new THREE.Vector3(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3),
      life: 2.6 + Math.random() * 1.2,
    });
  }
  c.active = true;
  c.mesh.visible = true;
  c.time = 0;
}

export function updateConfetti(c, dt) {
  if (!c.active) return;
  c.time += dt;
  let alive = 0;
  for (let i = 0; i < c.parts.length; i++) {
    const q = c.parts[i];
    q.life -= dt;
    q.v.y -= 3.8 * dt;
    q.v.multiplyScalar(1 - dt * 1.2);
    q.p.addScaledVector(q.v, dt);
    q.r.x += q.rv.x * dt;
    q.r.y += q.rv.y * dt;
    q.r.z += q.rv.z * dt;
    c.dummy.position.copy(q.p);
    c.dummy.rotation.copy(q.r);
    const s = q.life > 0 ? Math.min(1, q.life) : 0;
    c.dummy.scale.setScalar(s);
    c.dummy.updateMatrix();
    c.mesh.setMatrixAt(i, c.dummy.matrix);
    if (q.life > 0) alive++;
  }
  c.mesh.instanceMatrix.needsUpdate = true;
  if (!alive) {
    c.active = false;
    c.mesh.visible = false;
  }
}
