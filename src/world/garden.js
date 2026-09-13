import * as THREE from 'three';
import { toon, C, easeOutElastic, easeOutBack } from './materials.js';
import { tween } from '../tween.js';
import { state, setSprouted, setBloomed } from '../state.js';
import { sfx } from '../audio/synth.js';

// 面A: 花壇。植木鉢3つ、じょうろ、芽→蕾→花。
export function createGarden(particles) {
  const group = new THREE.Group(); // ローカル: 壁は -z、床は y=FLOOR
  const FLOOR = -0.9;
  const pots = [];

  // 壁の飾り: 柵
  const fence = new THREE.Group();
  fence.position.set(0, FLOOR, -0.88);
  group.add(fence);
  for (let i = -3; i <= 3; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.04), toon(0xf5e6c8));
    p.position.set(i * 0.26, 0.2, 0);
    fence.add(p);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.04), toon(0xf5e6c8));
  rail.position.y = 0.28;
  fence.add(rail);

  const potGeo = new THREE.CylinderGeometry(0.17, 0.13, 0.22, 16);
  const rimGeo = new THREE.TorusGeometry(0.17, 0.025, 8, 20);
  const soilGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.03, 16);

  const xs = [-0.42, 0, 0.42];
  xs.forEach((x, i) => {
    const pot = new THREE.Group();
    pot.position.set(x, FLOOR, -0.62);
    pot.scale.setScalar(0.9);
    group.add(pot);
    const body = new THREE.Mesh(potGeo, toon(C.pot));
    body.position.y = 0.11;
    pot.add(body);
    const rim = new THREE.Mesh(rimGeo, toon(C.pot));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.22;
    pot.add(rim);
    const soilMat = toon(C.soil);
    const soil = new THREE.Mesh(soilGeo, soilMat);
    soil.position.y = 0.2;
    pot.add(soil);
    // 乾いたひび(棒)
    const crack = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.005, 0.015), toon(0x3c2a1e));
    crack.position.y = 0.216;
    crack.rotation.y = 0.6 + i;
    pot.add(crack);

    // 植物
    const plant = new THREE.Group();
    plant.position.y = 0.21;
    pot.add(plant);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.028, 0.34, 8), toon(C.stem));
    stem.position.y = 0.17;
    plant.add(stem);
    const leafGeo = new THREE.SphereGeometry(0.07, 10, 8);
    for (const s of [-1, 1]) {
      const leaf = new THREE.Mesh(leafGeo, toon(C.leaf));
      leaf.scale.set(1.4, 0.35, 0.8);
      leaf.position.set(s * 0.08, 0.12, 0);
      leaf.rotation.z = s * 0.5;
      plant.add(leaf);
    }
    plant.scale.setScalar(0.001);

    const budWrap = new THREE.Group(); // ヒントの脈動専用
    budWrap.position.y = 0.36;
    plant.add(budWrap);
    const bud = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), toon(C.leafDark));
    bud.scale.set(1, 1.35, 1);
    bud.scale.multiplyScalar(0.001);
    budWrap.add(bud);

    const flower = new THREE.Group();
    flower.position.y = 0.36;
    flower.scale.setScalar(0.001);
    plant.add(flower);
    const petalGeo = new THREE.SphereGeometry(0.075, 12, 8);
    for (let k = 0; k < 6; k++) {
      const p = new THREE.Mesh(petalGeo, toon(C.flowers[i]));
      const a = (k / 6) * Math.PI * 2;
      p.position.set(Math.cos(a) * 0.095, 0.02, Math.sin(a) * 0.095);
      p.scale.set(1, 0.45, 1);
      flower.add(p);
    }
    const center = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), toon(C.flowerCenter));
    center.position.y = 0.03;
    flower.add(center);

    const P = { i, group: pot, soilMat, crack, plant, bud, flower, water: 0, sprouted: false, budded: false, bloomed: false, wiggle: 0, wobbleT: 0 };
    pots.push(P);

    const wobble = () => {
      P.wobbleT = 1;
      sfx.wobble();
    };

    const tapPot = () => {
      if (P.bloomed) {
        wobble();
        sfx.chime();
        particles.puff(worldOf(flower), 'spark', 6, 0.5);
        emitFlowerTap?.(i);
      } else if (P.budded) {
        if (state.sunny) bloom(P);
        else wobble();
      } else if (P.sprouted) {
        wobble();
      } else {
        // 空の鉢: 乾いた音。ひびが少し揺れる
        wobble();
        sfx.wobble();
      }
    };
    const inter = { id: P.bloomed ? 'flower' : 'pot', onTap: tapPot, getPulseNode: () => (P.budded && !P.bloomed ? budWrap : null), worldAnchor: () => worldOf(P.budded ? bud : soil), pot: P };
    for (const m of [body, rim, soil]) m.userData.interactable = inter;
    plant.traverse((m) => (m.userData.interactable = inter));
    flower.traverse((m) => (m.userData.interactable = inter));
    P.inter = inter;
  });

  let emitFlowerTap = null;
  const worldOf = (o) => o.getWorldPosition(new THREE.Vector3());

  function sprout(P) {
    P.sprouted = true;
    sfx.sprout(P.i);
    tween({ duration: 0.9, ease: easeOutElastic, onUpdate: (e) => P.plant.scale.setScalar(Math.max(0.001, e * 0.6)) });
    particles.puff(worldOf(P.plant), 'spark', 6, 0.4);
    setSprouted(P.i);
  }

  function budUp(P) {
    if (P.budded || !P.sprouted) return;
    P.budded = true;
    tween({ duration: 0.8, ease: easeOutBack, onUpdate: (e) => P.plant.scale.setScalar(0.6 + 0.4 * e) });
    tween({ duration: 0.8, ease: easeOutElastic, delay: 0.3, onUpdate: (e) => P.bud.scale.set(e, e * 1.35, e).multiplyScalar(Math.max(0.001, 1)) });
    // 蕾が花の色を帯びる
    const from = new THREE.Color(C.leafDark), to = new THREE.Color(C.flowers[P.i]);
    tween({ duration: 1.2, delay: 0.6, onUpdate: (e) => P.bud.material.color.copy(from).lerp(to, e * 0.85) });
  }

  function bloom(P) {
    if (P.bloomed) return;
    P.bloomed = true;
    P.inter.id = 'flower';
    sfx.bloom(P.i);
    tween({ duration: 0.25, onUpdate: (e) => P.bud.scale.setScalar(Math.max(0.001, 1 - e)) });
    tween({ duration: 1.0, ease: easeOutElastic, delay: 0.15, onUpdate: (e) => P.flower.scale.setScalar(Math.max(0.001, e)) });
    particles.puff(worldOf(P.flower), `petal${P.i}`, 10, 0.9);
    setBloomed(P.i);
  }

  // ---- じょうろ ----
  const can = new THREE.Group();
  const CAN_HOME = new THREE.Vector3(-0.3, FLOOR + 0.17, 0.4);
  can.position.copy(CAN_HOME);
  can.scale.setScalar(0.9);
  group.add(can);
  const canBody = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.24, 16), toon(C.can));
  can.add(canBody);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.3, 10), toon(C.canDark));
  spout.position.set(-0.17, 0.06, 0);
  spout.rotation.z = Math.PI / 2 - 0.5;
  can.add(spout);
  const spoutTip = new THREE.Object3D();
  spoutTip.position.set(-0.3, 0.14, 0);
  can.add(spoutTip);
  const rose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), toon(C.canDark));
  rose.position.copy(spoutTip.position);
  can.add(rose);
  const canHandle = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 8, 20, Math.PI), toon(C.canDark));
  canHandle.position.set(0.05, 0.12, 0);
  can.add(canHandle);
  const grip = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 8, 20, Math.PI), toon(C.canDark));
  grip.position.set(0.15, 0.0, 0);
  grip.rotation.z = -Math.PI / 2;
  can.add(grip);

  let dragging = false;
  let pouringOn = null;
  let dropTimer = 0;
  const canInter = {
    id: 'can',
    drag: 'floor', // 床面に沿って動く
    dragHeight: FLOOR + 0.5,
    onDragStart: () => {
      dragging = true;
      sfx.tap();
      tween({ duration: 0.3, ease: easeOutBack, onUpdate: (e) => can.scale.setScalar(0.9 + 0.15 * e) });
    },
    onDragMove: (world) => {
      // world: 床面(dragHeight)上の点。グループローカルへ変換
      const local = group.worldToLocal(world.clone());
      const x = THREE.MathUtils.clamp(local.x, -0.85, 0.85);
      const z = THREE.MathUtils.clamp(local.z, -0.75, 0.7);
      can.position.set(x, FLOOR + 0.5, z);
    },
    onDragEnd: () => {
      dragging = false;
      pouringOn = null;
      const from = can.position.clone();
      tween({ duration: 0.6, ease: easeOutBack, onUpdate: (e) => { can.position.lerpVectors(from, CAN_HOME, e); can.scale.setScalar(1.05 - 0.15 * e); } });
    },
    onTap: () => {
      sfx.water(0.6);
      // 持ち上げられることを見せる: ぴょこんと跳ねて数滴こぼれる
      tween({ duration: 0.5, ease: easeOutElastic, onUpdate: (e) => { can.position.y = CAN_HOME.y + 0.18 * (1 - e); can.rotation.z = -0.5 * (1 - e); } });
      for (let k = 0; k < 3; k++) particles.spawn({ kind: 'water', pos: worldOf(spoutTip), vel: new THREE.Vector3(-0.3, 0.3, 0), life: 0.6, size: 0.05, gravity: 3 });
    },
    getPulseNode: () => canBody,
    worldAnchor: () => worldOf(can),
  };
  can.traverse((m) => (m.userData.interactable = canInter));

  const tmp = new THREE.Vector3();
  function update(dt, t) {
    // じょうろの傾きと注水
    let over = null;
    if (dragging) {
      for (const P of pots) {
        tmp.copy(can.position).sub(P.group.position);
        tmp.y = 0;
        if (tmp.length() < 0.36) over = P;
      }
    }
    const targetTilt = over ? -0.9 : 0;
    can.rotation.z += (targetTilt - can.rotation.z) * (1 - Math.pow(0.001, dt));
    if (over && can.rotation.z < -0.4) {
      pouringOn = over;
      dropTimer -= dt;
      if (dropTimer <= 0) {
        dropTimer = 0.05;
        const p = worldOf(spoutTip);
        particles.spawn({ kind: 'water', pos: p, vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, -0.2, (Math.random() - 0.5) * 0.3), life: 0.45, size: 0.045 + Math.random() * 0.02, gravity: 4 });
        if (Math.random() < 0.3) sfx.water(0.5);
      }
      if (!over.sprouted) {
        over.water += dt;
        over.soilMat.color.lerp(new THREE.Color(C.soilWet), dt * 2);
        over.crack.scale.x = Math.max(0.001, 1 - over.water / 0.8);
        if (over.water > 0.8) sprout(over);
      } else {
        over.wiggle = 1;
      }
    } else {
      pouringOn = null;
    }
    // 植物のゆらぎ
    for (const P of pots) {
      P.wobbleT = Math.max(0, P.wobbleT - dt * 1.5);
      P.wiggle = Math.max(0, P.wiggle - dt);
      const sway = Math.sin(t * 1.5 + P.i) * 0.04 + Math.sin(t * 18) * P.wobbleT * 0.25 + Math.sin(t * 12) * P.wiggle * 0.12;
      P.plant.rotation.z = sway;
      P.group.rotation.z = Math.sin(t * 20) * P.wobbleT * 0.08;
      if (P.bloomed) P.flower.rotation.y = t * 0.3;
    }
  }

  function flowerPositionWorld(i) {
    return worldOf(pots[i].flower);
  }

  return {
    group,
    pots,
    can,
    update,
    budAll: () => pots.forEach((P, k) => setTimeout(() => budUp(P), k * 250)),
    flowerPositionWorld,
    flowerLocal: (i) => pots[i].flower,
    onFlowerTap: (fn) => (emitFlowerTap = fn),
    wiggleAll: () => pots.forEach((P) => (P.wobbleT = 1)),
  };
}
