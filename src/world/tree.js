import * as THREE from 'three';
import { toon, C, easeOutElastic, easeOutBack, easeInOut } from './materials.js';
import { tween } from '../tween.js';
import { state, count, setButterfly } from '../state.js';
import { sfx } from '../audio/synth.js';

// 面C: 蝶の木。蛹が3つ。花が咲いた後にタップすると割れて蝶が出る。
export function createTree(particles, boxGroup) {
  const group = new THREE.Group();
  const FLOOR = -0.9;

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.9, 10), toon(C.trunk));
  trunk.position.set(0, FLOOR + 0.45, -0.74);
  group.add(trunk);
  const branchGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.6, 8);
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(branchGeo, toon(C.trunk));
    b.position.set(s * 0.24, FLOOR + 0.82, -0.74);
    b.rotation.z = s * 1.1;
    group.add(b);
  }
  const canopyMat = toon(C.canopy);
  [[0, 1.0, -0.72, 0.3], [-0.36, 0.85, -0.7, 0.22], [0.36, 0.85, -0.7, 0.22], [-0.18, 1.12, -0.68, 0.2], [0.18, 1.12, -0.68, 0.2]].forEach(([x, y, z, r]) => {
    const c = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), canopyMat);
    c.position.set(x, FLOOR + y, z);
    c.userData.interactable = { id: 'canopy', onTap: () => { sfx.boop(); rustle = 1; } };
    group.add(c);
  });
  let rustle = 0;

  const cocoons = [];
  const butterflies = [];
  const xs = [-0.34, 0, 0.34];
  xs.forEach((x, i) => {
    const hang = new THREE.Group();
    hang.position.set(x, FLOOR + 0.8, -0.6 + (i === 1 ? 0.1 : 0));
    group.add(hang);
    const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 6), toon(C.string));
    thread.position.y = -0.1;
    hang.add(thread);
    const bodyWrap = new THREE.Group(); // ヒントの脈動専用
    bodyWrap.position.y = -0.28;
    hang.add(bodyWrap);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.12, 6, 12), toon(C.cocoon));
    bodyWrap.add(body);
    // 縞
    for (let k = 0; k < 3; k++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.076, 0.012, 6, 16), toon(C.cocoonDark));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.28 + (k - 1) * 0.06;
      hang.add(ring);
    }
    const CC = { i, hang, body, bodyWrap, taps: 0, opened: false, wob: 0, wobPhase: 0 };
    cocoons.push(CC);
    const inter = {
      id: 'cocoon',
      onTap: () => {
        if (CC.opened) return;
        CC.wob = 1;
        sfx.wobble();
        const ready = count(state.bloomed) === 3;
        if (ready) {
          CC.taps++;
          particles.puff(body.getWorldPosition(new THREE.Vector3()), 'spark', 4, 0.4);
          if (CC.taps >= 2) hatch(CC);
        }
      },
      getPulseNode: () => (CC.opened ? null : bodyWrap),
      worldAnchor: () => body.getWorldPosition(new THREE.Vector3()),
    };
    hang.traverse((m) => (m.userData.interactable = inter));
  });

  // ---- 蝶 ----
  function makeButterfly(i) {
    const b = new THREE.Group();
    const color = C.flowers[i];
    const wingGeo = new THREE.CircleGeometry(0.1, 16);
    const wingMat = toon(color, { side: THREE.DoubleSide });
    const wings = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      b.add(pivot);
      const w = new THREE.Mesh(wingGeo, wingMat);
      w.position.x = s * 0.1;
      w.scale.set(1, 1.3, 1);
      pivot.add(w);
      const w2 = new THREE.Mesh(wingGeo, wingMat);
      w2.position.set(s * 0.07, -0.1, 0);
      w2.scale.set(0.7, 0.8, 1);
      pivot.add(w2);
      wings.push({ pivot, s });
    }
    const bodyM = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.12, 4, 8), toon(C.eye));
    b.add(bodyM);
    // 翅は水平に(x-z平面)、上から見える
    b.rotation.x = -Math.PI / 2;
    const inter = { id: 'butterfly', onTap: () => { sfx.flutter(); BF.excite = 1; } };
    b.traverse((m) => (m.userData.interactable = inter));
    const BF = { i, group: b, wings, t: 0, mode: 'fly', path: null, home: null, excite: 0, phase: Math.random() * 10, target: null };
    return BF;
  }

  let flowerLocalGetter = null; // (i) => Object3D (花)
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();

  function hatch(CC) {
    CC.opened = true;
    sfx.crack();
    const body = CC.body;
    particles.puff(body.getWorldPosition(new THREE.Vector3()), 'spark', 10, 0.8);
    tween({ duration: 0.4, ease: easeInOut, onUpdate: (e) => { CC.hang.children.forEach((m) => { if (m !== CC.bodyWrap) m.scale.setScalar(Math.max(0.001, 1 - e)); }); body.scale.set(1 + e * 0.3, 1 - e, 1 + e * 0.3); }, onComplete: () => (CC.hang.visible = false) });

    const BF = makeButterfly(CC.i);
    boxGroup.add(BF.group);
    // 箱ローカルへ変換して出発
    const start = boxGroup.worldToLocal(body.getWorldPosition(new THREE.Vector3()));
    BF.group.position.copy(start);
    BF.group.scale.setScalar(0.001);
    tween({ duration: 0.6, ease: easeOutBack, onUpdate: (e) => BF.group.scale.setScalar(Math.max(0.001, e)) });
    sfx.flutter();
    butterflies.push(BF);
    tween({ duration: 0.7, onComplete: () => flyTo(BF, CC.i) });
    setButterfly(CC.i);
  }

  function flyTo(BF, flowerIndex) {
    if (!flowerLocalGetter) return;
    const flower = flowerLocalGetter(flowerIndex);
    const end = boxGroup.worldToLocal(flower.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0, 0.22, 0));
    const start = BF.group.position.clone();
    const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.7, (Math.random() - 0.5) * 0.4));
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    BF.mode = 'fly';
    BF.home = end;
    tween({ duration: 3.2, ease: easeInOut, onUpdate: (e) => { curve.getPoint(e, BF.group.position); }, onComplete: () => { BF.mode = 'hover'; sfx.flutter(); } });
  }

  // おもちゃ箱: 花をタップすると蝶がそこへ集まる
  function gatherTo(flowerIndex) {
    for (const BF of butterflies) {
      if (BF.mode !== 'hover') continue;
      flyTo(BF, flowerIndex);
    }
    // 数秒後、それぞれの花へ戻る
    tween({ duration: 5, onComplete: () => butterflies.forEach((BF) => BF.mode === 'hover' && flyTo(BF, BF.i)) });
  }

  function update(dt, t) {
    rustle = Math.max(0, rustle - dt);
    group.children.forEach((c) => { if (c.material === canopyMat) c.rotation.z = Math.sin(t * 14) * rustle * 0.08; });
    for (const CC of cocoons) {
      CC.wob = Math.max(0, CC.wob - dt * 1.2);
      CC.hang.rotation.z = Math.sin(t * 16) * CC.wob * 0.35 + Math.sin(t * 1.1 + CC.i) * 0.03;
    }
    for (const BF of butterflies) {
      BF.excite = Math.max(0, BF.excite - dt);
      const speed = BF.mode === 'fly' ? 22 : 9 + BF.excite * 14;
      const flap = Math.sin(t * speed + BF.phase);
      for (const w of BF.wings) w.pivot.rotation.y = w.s * (0.25 + flap * 0.55);
      if (BF.mode === 'hover' && BF.home) {
        const r = 0.12 + BF.excite * 0.15;
        BF.group.position.set(
          BF.home.x + Math.cos(t * 0.9 + BF.phase) * r,
          BF.home.y + Math.sin(t * 2.3 + BF.phase) * 0.05 + BF.excite * 0.2,
          BF.home.z + Math.sin(t * 0.9 + BF.phase) * r,
        );
        BF.group.rotation.z = t * 0.9 + BF.phase + Math.PI / 2;
      } else if (BF.mode === 'fly') {
        BF.group.rotation.z = t * 2;
      }
    }
  }

  return {
    group,
    cocoons,
    butterflies,
    update,
    setFlowerGetter: (fn) => (flowerLocalGetter = fn),
    gatherTo,
  };
}
