import * as THREE from 'three';
import { tween, ease } from './tween.js';
import { sfx } from './audio.js';

// 足元のボール置き場とパチンコ。カメラに固定した Group に置き、縦横どちらでも画面下中央に来る。
// W=しろ I=てつ B=ばくはつ
export function createBalls({ scene, camera, phys, fx, onLaunch, onBallGone }) {
  const { CANNON, world } = phys;
  const shelf = new THREE.Group();
  camera.add(shelf);

  const R = { W: 0.45, I: 0.5, B: 0.45 };
  const RACK_R = 0.33;
  const MASS = { W: 1, I: 4, B: 1 };
  const sphereGeo = new THREE.SphereGeometry(1, 24, 18);
  const mats = {
    W: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05, emissive: 0xffffff, emissiveIntensity: 0.12 }),
    I: new THREE.MeshStandardMaterial({ color: 0x8b93a5, roughness: 0.22, metalness: 0.9 }),
    B: new THREE.MeshStandardMaterial({ color: 0xff4a3d, roughness: 0.4, metalness: 0.1, emissive: 0xff2200, emissiveIntensity: 0.5 }),
  };
  const ballMesh = (t, r) => { const m = new THREE.Mesh(sphereGeo, mats[t]); m.scale.setScalar(r); return m; };

  // 台とパチンコ
  const woodMat = new THREE.MeshStandardMaterial({ color: 0xc98a52, roughness: 0.8 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1, 0.22, 1.7), new THREE.MeshStandardMaterial({ color: 0x4a3f7a, roughness: 0.9 }));
  shelf.add(slab);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1, 10), woodMat);
  const forkL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1, 10), woodMat);
  const forkR = forkL.clone();
  shelf.add(post, forkL, forkR);
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xffd08a, roughness: 0.6 });
  const bandGeo = new THREE.CylinderGeometry(0.045, 0.045, 1, 8);
  const bandL = new THREE.Mesh(bandGeo, bandMat), bandR = new THREE.Mesh(bandGeo, bandMat);
  shelf.add(bandL, bandR);
  // 指の影（誘いのデモ用）
  const ghost = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  shelf.add(ghost);

  // 軌跡の点
  const TRAJ_N = 18;
  const trajPos = new Float32Array(TRAJ_N * 3);
  const trajGeo = new THREE.BufferGeometry();
  trajGeo.setAttribute('position', new THREE.BufferAttribute(trajPos, 3));
  const dotTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const trajMat = new THREE.PointsMaterial({ size: 0.35, map: dotTex, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true });
  const traj = new THREE.Points(trajGeo, trajMat);
  traj.frustumCulled = false;
  scene.add(traj);

  // レイアウト（アスペクトに応じて奥行きを変え、台が画面幅に収まるようにする）
  const L = { depth: 7.5, y: -3, anchor: new THREE.Vector3(), maxPull: 2, rackStep: 0.76 };
  function layout() {
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const aspect = camera.aspect;
    L.depth = Math.max(7.5, 2.9 / (t * aspect));
    const halfH = L.depth * t;
    L.y = -halfH * 0.86;
    L.maxPull = halfH * 0.24;
    const halfW = halfH * aspect;
    slab.position.set(0, L.y, -L.depth);
    slab.scale.x = Math.min(halfW * 1.9, 6.4);
    L.anchor.set(0, L.y + 0.11 + 1.25, -L.depth + 0.15);
    post.position.set(0, L.y + 0.11 + 0.5, -L.depth);
    forkL.position.set(-0.36, L.y + 0.11 + 1.32, -L.depth);
    forkL.rotation.z = 0.35; forkL.scale.y = 0.8;
    forkR.position.set(0.36, L.y + 0.11 + 1.32, -L.depth);
    forkR.rotation.z = -0.35; forkR.scale.y = 0.8;
    L.rackStep = 0.76;
    layoutRack(true);
  }

  // ---- 状態
  let rack = [];        // 台に置かれたボール {type, mesh}
  let current = null;   // パチンコに乗っているボール {type, mesh}
  let dragging = false;
  let pull = new THREE.Vector3();
  let virtualPull = null; // 誘いデモ用
  const flying = [];
  let enabled = false;
  let aimBox = new THREE.Box3(new THREE.Vector3(-3, 3, -1), new THREE.Vector3(3, 10, 1));
  let hopT = -1;
  let time = 0;
  let everLaunched = false;

  // 台の左側から並べ、パチンコの周り(|x|<1.0)は空ける。あふれたら右側へ。
  const rackSlot = (i) => {
    const step = L.rackStep;
    const perSide = Math.max(1, Math.floor((slab.scale.x * 0.5 - 1.0) / step + 0.001));
    let x;
    if (i < perSide) x = -1.0 - RACK_R - (perSide - 1 - i) * step;
    else x = 1.0 + RACK_R + (i - perSide) * step;
    return new THREE.Vector3(x, L.y + 0.11 + RACK_R, -L.depth + 0.35);
  };
  function layoutRack(immediate = false) {
    rack.forEach((b, i) => {
      const p = rackSlot(i);
      if (immediate) b.mesh.position.copy(p);
      else { const from = b.mesh.position.clone(); tween({ dur: 0.35, ease: ease.outCubic, update: (k) => b.mesh.position.lerpVectors(from, p, k) }); }
    });
    if (current && !dragging && !virtualPull) current.mesh.position.copy(L.anchor);
  }

  function setRack(types) {
    for (const b of rack) shelf.remove(b.mesh);
    if (current) shelf.remove(current.mesh);
    rack = []; current = null;
    types.forEach((t) => { const m = ballMesh(t, RACK_R); shelf.add(m); rack.push({ type: t, mesh: m }); });
    layoutRack(true);
  }

  // 台に転がって入ってくる（開始・巻き戻し）
  function enterAnim(done) {
    for (let i = 0; i < rack.length; i++) {
      const b = rack[i];
      const to = rackSlot(i);
      const from = to.clone(); from.x -= 8;
      b.mesh.position.copy(from);
      tween({ dur: 0.7, delay: i * 0.08, ease: ease.outCubic, update: (k) => { b.mesh.position.lerpVectors(from, to, k); b.mesh.rotation.z = -k * 6; } });
    }
    tween({ dur: 0.7 + rack.length * 0.08 + 0.1, update: () => {}, done: () => { loadNext(); done && done(); } });
  }

  // 台の先頭のボールをパチンコに乗せる
  function loadNext() {
    if (current || !rack.length) return;
    const b = rack.shift();
    current = b;
    const from = b.mesh.position.clone();
    const r = R[b.type];
    tween({ dur: 0.45, ease: ease.outBack, update: (k) => {
      b.mesh.position.lerpVectors(from, L.anchor, k);
      b.mesh.position.y += Math.sin(k * Math.PI) * 0.6;
      b.mesh.scale.setScalar(RACK_R + (r - RACK_R) * k);
    } });
    layoutRack();
  }

  // 台のボールをタップ → パチンコのボールと入れ替え
  function swap(rb) {
    if (!current) return;
    const idx = rack.indexOf(rb);
    if (idx < 0) return;
    sfx.swap();
    const c = current;
    rack[idx] = c;
    current = rb;
    const from = rb.mesh.position.clone(), cfrom = c.mesh.position.clone(), slot = rackSlot(idx);
    tween({ dur: 0.4, ease: ease.inOutCubic, update: (k) => {
      rb.mesh.position.lerpVectors(from, L.anchor, k); rb.mesh.position.y += Math.sin(k * Math.PI) * 0.8;
      rb.mesh.scale.setScalar(RACK_R + (R[rb.type] - RACK_R) * k);
      c.mesh.position.lerpVectors(cfrom, slot, k); c.mesh.position.y += Math.sin(k * Math.PI) * 0.4;
      c.mesh.scale.setScalar(R[c.type] + (RACK_R - R[c.type]) * k);
    } });
  }

  // ---- 狙い: 引いた量を塊の上の狙点に写像し、一定飛行時間で届く初速を出す
  const G = world.gravity.y;
  const T = 0.62;
  function launchPointWorld() { return shelf.localToWorld(L.anchor.clone()); }
  function velocityFor(p) {
    const k = Math.min(1, Math.hypot(p.x, p.y) / L.maxPull);
    const down = Math.min(1, Math.max(0, -p.y / L.maxPull));
    const c = aimBox.getCenter(new THREE.Vector3());
    const h = aimBox.max.y - aimBox.min.y, w = aimBox.max.x - aimBox.min.x;
    const target = new THREE.Vector3(
      c.x - (p.x / L.maxPull) * (w * 0.5 + 1.2),
      aimBox.min.y - 0.4 + down * (h + 1.2),
      c.z);
    const T2 = T + k * 0.05;
    const p0 = launchPointWorld();
    const v = target.clone().sub(p0).multiplyScalar(1 / T2);
    v.y -= 0.5 * G * T2;
    return { v, p0, T: T2 };
  }

  function showTrajectory(p) {
    const { v, p0, T: T2 } = velocityFor(p);
    for (let i = 0; i < TRAJ_N; i++) {
      const t = (i + 1) / TRAJ_N * T2 * 1.15;
      trajPos[i * 3] = p0.x + v.x * t;
      trajPos[i * 3 + 1] = p0.y + v.y * t + 0.5 * G * t * t;
      trajPos[i * 3 + 2] = p0.z + v.z * t;
    }
    trajGeo.attributes.position.needsUpdate = true;
    trajMat.opacity = 0.75;
  }

  function setBand(p) {
    const ballP = L.anchor.clone().add(p);
    const tipL = new THREE.Vector3(-0.5, L.y + 0.11 + 1.65, -L.depth), tipR = new THREE.Vector3(0.5, L.y + 0.11 + 1.65, -L.depth);
    for (const [m, tip] of [[bandL, tipL], [bandR, tipR]]) {
      const d = ballP.clone().sub(tip);
      const len = d.length();
      m.position.copy(tip).addScaledVector(d, 0.5);
      m.scale.set(1, Math.max(0.01, len), 1);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    }
  }

  function applyPull(p) {
    pull.copy(p);
    if (current) current.mesh.position.copy(L.anchor).add(pull);
    setBand(pull);
    if (pull.length() > 0.12 * L.maxPull) showTrajectory(pull); else trajMat.opacity = 0;
  }

  function springBack() {
    const from = pull.clone();
    tween({ dur: 0.35, ease: ease.outElastic, update: (k) => applyPull(from.clone().multiplyScalar(1 - k)) });
    trajMat.opacity = 0;
  }

  function launch() {
    if (!current) return;
    const { v, p0 } = velocityFor(pull);
    const b = current; current = null;
    const t = b.type;
    sfx.launch(Math.min(1, pull.length() / L.maxPull));
    shelf.remove(b.mesh);
    const mesh = ballMesh(t, R[t]);
    mesh.position.copy(p0);
    scene.add(mesh);
    const body = new CANNON.Body({ mass: MASS[t], shape: new CANNON.Sphere(R[t]), position: new CANNON.Vec3(p0.x, p0.y, p0.z), material: phys.mat.ball, linearDamping: 0.01 });
    body.velocity.set(v.x, v.y, v.z);
    const ball = { type: t, body, mesh, age: 0, sfxT: 0, hits: 0 };
    body.userData = { kind: 'ball', ref: ball };
    world.addBody(body);
    flying.push(ball);
    pull.set(0, 0, 0);
    setBand(pull);
    trajMat.opacity = 0;
    everLaunched = true;
    tween({ dur: 0.25, update: () => {}, done: loadNext });
    onLaunch && onLaunch(ball);
  }

  function removeBall(ball, sparkle = true) {
    const i = flying.indexOf(ball);
    if (i < 0) return;
    flying.splice(i, 1);
    world.removeBody(ball.body);
    scene.remove(ball.mesh);
    if (sparkle) { fx.sparkle(ball.mesh.position, ball.type === 'B' ? 0xff8060 : 0xffffff, 8); sfx.vanish(); }
    onBallGone && onBallGone(ball);
  }

  // ---- 入力
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function toLocalPlane(clientX, clientY) {
    ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return new THREE.Vector3(ndc.x * t * camera.aspect * L.depth, ndc.y * t * L.depth, -L.depth);
  }
  let pointerId = null;
  function onDown(e) {
    if (!enabled || pointerId !== null) return;
    pointerId = e.pointerId;
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(rack.map((b) => b.mesh), false)[0];
    if (hit) { const rb = rack.find((b) => b.mesh === hit.object); swap(rb); pointerId = null; return; }
    if (!current) { pointerId = null; return; }
    virtualPull = null; ghost.material.opacity = 0;
    dragging = true;
    sfx.grab();
    dragStart = toLocalPlane(e.clientX, e.clientY);
    applyPull(new THREE.Vector3(0, 0, 0));
  }
  let dragStart = new THREE.Vector3();
  let lastStretchK = 0;
  function onMove(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    const p = toLocalPlane(e.clientX, e.clientY).sub(dragStart);
    p.z = 0;
    if (p.y > L.maxPull * 0.25) p.y = L.maxPull * 0.25;
    const len = p.length();
    if (len > L.maxPull) p.multiplyScalar(L.maxPull / len);
    const k = Math.floor(len / L.maxPull * 6);
    if (k !== lastStretchK) { sfx.stretch(len / L.maxPull); lastStretchK = k; }
    applyPull(p);
  }
  function onUp(e) {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    if (!dragging) return;
    dragging = false;
    if (pull.length() < 0.15 * L.maxPull) { sfx.cancel(); springBack(); return; }
    launch();
  }
  const el = document.getElementById('c');
  el.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  // ---- 誘い（無操作時）
  function hop() { if (current && !dragging && hopT < 0) { hopT = 0; sfx.hop(); } }
  function demo() {
    if (!current || dragging || virtualPull) return;
    virtualPull = new THREE.Vector3();
    ghost.scale.setScalar(0.42);
    ghost.position.copy(L.anchor).add(new THREE.Vector3(0.3, -0.2, 0.9));
    const pMax = new THREE.Vector3(0.15, -L.maxPull * 0.75, 0);
    tween({ dur: 0.4, update: (k) => { ghost.material.opacity = 0.35 * k; } });
    tween({ dur: 1.1, delay: 0.5, ease: ease.inOutCubic, update: (k) => {
      if (!virtualPull) return;
      virtualPull.copy(pMax).multiplyScalar(k);
      applyPull(virtualPull);
      ghost.position.copy(L.anchor).add(virtualPull).add(new THREE.Vector3(0.3, -0.2, 0.9));
    }, done: () => {
      if (!virtualPull) return;
      tween({ dur: 0.3, delay: 0.5, update: (k) => { ghost.material.opacity = 0.35 * (1 - k); }, done: () => {
        if (!virtualPull) return;
        virtualPull = null;
        springBack();
      } });
    } });
  }

  function update(dt) {
    time += dt;
    if (hopT >= 0) {
      hopT += dt;
      if (current && !dragging && !virtualPull) {
        const k = Math.min(1, hopT / 0.5);
        current.mesh.position.copy(L.anchor); current.mesh.position.y += Math.sin(k * Math.PI) * 0.7;
        setBand(new THREE.Vector3(0, Math.sin(k * Math.PI) * 0.7, 0));
      }
      if (hopT > 0.5) { hopT = -1; if (current && !dragging && !virtualPull) { current.mesh.position.copy(L.anchor); setBand(pull); } }
    }
    if (current && current.type === 'B') current.mesh.scale.setScalar(R.B * (1 + 0.06 * Math.sin(time * 9)));
    for (const b of rack) if (b.type === 'B') b.mesh.scale.setScalar(RACK_R * (1 + 0.06 * Math.sin(time * 9)));
    for (const ball of flying.slice()) {
      ball.age += dt; ball.sfxT -= dt;
      ball.mesh.position.copy(ball.body.position);
      ball.mesh.quaternion.copy(ball.body.quaternion);
      if (ball.type === 'B') ball.mesh.scale.setScalar(R.B * (1 + 0.08 * Math.sin(time * 14)));
      if (ball.body.position.y < aimBox.min.y - 7 || ball.age > 7 || ball.body.position.z < aimBox.min.z - 10) removeBall(ball);
    }
    if (!dragging && !virtualPull && trajMat.opacity > 0) trajMat.opacity = Math.max(0, trajMat.opacity - dt * 3);
  }

  layout();
  window.addEventListener('resize', () => setTimeout(layout, 0));

  return {
    setRack, enterAnim, update, hop, demo, launch, removeBall, layout,
    setAimBox(b) { aimBox = b.clone(); },
    setEnabled(v) { enabled = v; if (!v && dragging) { dragging = false; pointerId = null; springBack(); } },
    rackCount: () => rack.length + (current ? 1 : 0),
    flyingCount: () => flying.length,
    isDragging: () => dragging,
    isDemo: () => !!virtualPull,
    everLaunched: () => everLaunched,
    currentType: () => (current ? current.type : null),
    rackScreenPositions() {
      return rack.map((b) => {
        const v = b.mesh.getWorldPosition(new THREE.Vector3()).project(camera);
        return { type: b.type, x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
      });
    },
    slowBall(ball, f) { ball.body.velocity.scale(f, ball.body.velocity); },
    ballSfxReady(ball) { if (ball.sfxT <= 0) { ball.sfxT = 0.08; return true; } return false; },
  };
}
