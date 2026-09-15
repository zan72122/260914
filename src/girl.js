import * as THREE from 'three';
import * as T from './textures.js';

export const COSTUMES = ['witch', 'ghost', 'pumpkin', 'cat'];

const PAL = {
  witch: { dress: 0x4a2a6b, accent: 0x2b1740, cape: 0x3a1f55, skin: 0xf6cda6, hat: true, ears: false },
  ghost: { dress: 0xe9edf6, accent: 0xc8d2e6, cape: 0xdde4f2, skin: 0xf6cda6, hat: false, ears: false },
  pumpkin: { dress: 0xdd6a1e, accent: 0x8a4412, cape: 0x4a6b28, skin: 0xf6cda6, hat: false, ears: false },
  cat: { dress: 0x2a2530, accent: 0x14111a, cape: 0x1d1a24, skin: 0xf6cda6, hat: false, ears: true }
};

function mat(color, rough = 0.85) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
}

export function createGirl() {
  const root = new THREE.Group();

  const rig = new THREE.Group();          // bob / lean
  root.add(rig);

  // --- legs ---
  const legMat = mat(0x2d2a3a, 0.9);
  const shoeMat = mat(0x1a1720, 0.7);
  const legs = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.14, 0.52, 0);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.36, 3, 7), legMat);
    leg.position.y = -0.24;
    leg.castShadow = true;
    pivot.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.1, 0.27), shoeMat);
    shoe.position.set(0, -0.47, 0.04);
    pivot.add(shoe);
    rig.add(pivot);
    legs.push(pivot);
  }

  // --- body ---
  const dressMat = mat(PAL.witch.dress, 0.8);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.42, 0.78, 14), dressMat);
  body.position.y = 0.88;
  body.castShadow = true;
  rig.add(body);

  const collarMat = mat(PAL.witch.accent, 0.8);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.1, 12), collarMat);
  collar.position.y = 1.29;
  rig.add(collar);

  // --- head ---
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.36;
  rig.add(headGroup);
  const skinMat = mat(PAL.witch.skin, 0.7);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.31, 18, 14), skinMat);
  head.scale.set(1, 1.02, 0.96);
  head.position.y = 0.26;
  head.castShadow = true;
  headGroup.add(head);

  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), new THREE.MeshBasicMaterial({
    map: T.girlFaceTexture(), transparent: true, depthWrite: false
  }));
  face.position.set(0, 0.26, 0.302);
  headGroup.add(face);

  // hair
  const hairMat = mat(0x3a2118, 0.95);
  const hair = new THREE.Group();
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.325, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat);
  cap.position.y = 0.26;
  hair.add(cap);
  for (const s of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.3, 3, 8), hairMat);
    tail.position.set(s * 0.29, 0.13, -0.05);
    tail.rotation.z = s * 0.3;
    hair.add(tail);
  }
  headGroup.add(hair);

  // cat ears (hidden by default)
  const catEars = new THREE.Group();
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 5), mat(0x1d1a24, 0.9));
    ear.position.set(s * 0.18, 0.52, -0.02);
    ear.rotation.z = s * 0.2;
    catEars.add(ear);
  }
  catEars.visible = false;
  headGroup.add(catEars);

  // witch hat
  const hat = new THREE.Group();
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.05, 16), mat(0x2b1740, 0.9));
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.78, 14), mat(0x2b1740, 0.9));
  cone.position.y = 0.4;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.295, 0.31, 0.09, 16), mat(0xffb54a, 0.5));
  band.position.y = 0.07;
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.03), mat(0xf0d070, 0.4));
  buckle.position.set(0, 0.07, 0.3);
  hat.add(brim, cone, band, buckle);
  hat.position.y = 0.52;
  hat.rotation.z = -0.12;
  hat.castShadow = true;
  headGroup.add(hat);

  // pumpkin hat (crown of leaves)
  const pumpHat = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.2, 6), mat(0x4c6b2e, 0.9));
  stem.position.y = 0.6;
  pumpHat.add(stem);
  for (let i = 0; i < 5; i++) {
    const lf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(0x5c7d36, 0.9));
    lf.scale.set(1.4, 0.35, 0.8);
    const a = (i / 5) * Math.PI * 2;
    lf.position.set(Math.cos(a) * 0.17, 0.52, Math.sin(a) * 0.17);
    lf.rotation.y = -a;
    pumpHat.add(lf);
  }
  pumpHat.visible = false;
  headGroup.add(pumpHat);

  // ghost hood
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ color: 0xe9edf6, roughness: 0.9, transparent: true, opacity: 0.92 }));
  hood.position.y = 0.28;
  hood.visible = false;
  headGroup.add(hood);

  // --- cape ---
  const capeMat = new THREE.MeshStandardMaterial({
    color: PAL.witch.cape, roughness: 0.85, side: THREE.DoubleSide
  });
  const capeSegs = [];
  const capeRoot = new THREE.Group();
  capeRoot.position.set(0, 1.26, -0.14);
  rig.add(capeRoot);
  let parent = capeRoot;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Group();
    seg.position.y = i === 0 ? 0 : -0.26;
    const w = 0.56 + i * 0.12;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.28, 2, 1), capeMat);
    m.position.y = -0.14;
    m.castShadow = true;
    seg.add(m);
    parent.add(seg);
    parent = seg;
    capeSegs.push(seg);
  }

  // --- arms ---
  const arms = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.27, 1.22, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.36, 3, 7), dressMat);
    arm.position.y = -0.2;
    pivot.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), skinMat);
    hand.position.y = -0.42;
    pivot.add(hand);
    rig.add(pivot);
    arms.push(pivot);
  }

  // --- bucket (held in left hand = arms[0]) ---
  const bucket = new THREE.Group();
  const bucketMat = new THREE.MeshStandardMaterial({
    color: 0xe07a1e, roughness: 0.55,
    emissive: new THREE.Color(0xff8a20), emissiveIntensity: 0.25
  });
  const pail = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.16, 0.28, 14, 1, true), bucketMat);
  pail.material.side = THREE.DoubleSide;
  bucket.add(pail);
  const pailBottom = new THREE.Mesh(new THREE.CircleGeometry(0.16, 14), bucketMat);
  pailBottom.rotation.x = -Math.PI / 2;
  pailBottom.position.y = -0.14;
  bucket.add(pailBottom);
  const pailFace = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.24), new THREE.MeshBasicMaterial({
    map: T.pumpkinFaceTexture(1, '#1a0d06'), transparent: true, depthWrite: false, opacity: 0.85
  }));
  pailFace.position.set(0, 0.0, 0.2);
  bucket.add(pailFace);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.017, 6, 16, Math.PI), mat(0x3a3038, 0.5));
  handle.position.y = 0.13;
  handle.rotation.y = Math.PI / 2;
  bucket.add(handle);

  const bucketHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.glowTexture(), color: 0xffb040, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0
  }));
  bucketHalo.scale.set(1.4, 1.4, 1);
  bucket.add(bucketHalo);

  // candy pile inside
  const candyGeo = new THREE.SphereGeometry(0.048, 6, 5);
  const candyColors = [0xff5f8a, 0x6ad2ff, 0xffd84a, 0x9dff7a, 0xc98aff];
  const candyMats = candyColors.map(c => new THREE.MeshStandardMaterial({
    color: c, roughness: 0.35, emissive: new THREE.Color(c), emissiveIntensity: 0.28
  }));
  const candyMesh = new THREE.InstancedMesh(candyGeo, candyMats[0], 90);
  candyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  candyMesh.count = 0;
  const candyColorArr = new Float32Array(90 * 3);
  const dummy = new THREE.Object3D();
  const candySlots = [];
  for (let i = 0; i < 90; i++) {
    const layer = Math.floor(i / 12);
    const a = (i % 12) / 12 * Math.PI * 2 + layer * 0.7;
    const r = 0.03 + (i % 12) / 12 * 0.115;
    candySlots.push(new THREE.Vector3(Math.cos(a) * r, -0.1 + layer * 0.052, Math.sin(a) * r));
    const c = new THREE.Color(candyColors[i % candyColors.length]);
    candyColorArr[i * 3] = c.r; candyColorArr[i * 3 + 1] = c.g; candyColorArr[i * 3 + 2] = c.b;
    dummy.position.copy(candySlots[i]);
    dummy.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    dummy.scale.setScalar(0.8 + Math.random() * 0.5);
    dummy.updateMatrix();
    candyMesh.setMatrixAt(i, dummy.matrix);
  }
  candyMesh.instanceColor = new THREE.InstancedBufferAttribute(candyColorArr, 3);
  candyMesh.material = new THREE.MeshStandardMaterial({
    roughness: 0.35, vertexColors: false, emissive: new THREE.Color(0x221100), emissiveIntensity: 0.5
  });
  candyMesh.instanceMatrix.needsUpdate = true;
  bucket.add(candyMesh);

  const bucketHolder = new THREE.Group();     // attached to left arm
  bucketHolder.position.set(0, -0.5, 0.05);
  bucket.position.set(0, -0.12, 0);
  bucketHolder.add(bucket);
  arms[0].add(bucketHolder);

  // rim light on the girl (kept subtle, no shadows)
  const rim = new THREE.PointLight(0xa8ccff, 3.2, 6.0, 2);
  rim.position.set(-0.9, 2.0, -1.2);
  root.add(rim);
  const keyLight = new THREE.PointLight(0xffe0b8, 2.4, 6.5, 2);
  keyLight.position.set(0.7, 1.8, 1.7);
  root.add(keyLight);

  // sparkle ring (used during reveal)
  const ringMat = new THREE.SpriteMaterial({
    map: T.glowTexture(), color: 0xfff0b0, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0
  });
  const ring = new THREE.Sprite(ringMat);
  ring.scale.set(3.2, 3.2, 1);
  ring.position.y = 1.0;
  root.add(ring);

  const g = {
    root, rig, legs, arms, body, head: headGroup, headMesh: head, face, hair,
    hat, pumpHat, hood, catEars, cape: capeSegs, capeMat, dressMat, collarMat,
    bucket, bucketHolder, bucketHalo, candyMesh, candySlots,
    rim, ring,
    costume: 'witch',
    candyCount: 0,
    // motion
    pos: new THREE.Vector3(0, 0, 0),
    heading: Math.PI,
    speed: 0, speedScale: 1,
    path: null, pathI: 0,
    walkPhase: 0,
    t: 0,
    lookAt: null,
    anim: null, animT: 0, animDur: 0,
    offer: 0, offerTarget: 0,
    ringGlow: 0,
    onFootstep: null,
    bucketPulse: 0
  };
  setCostume(g, 'witch');
  return g;
}

export function setCostume(g, name) {
  if (!COSTUMES.includes(name)) return;
  g.costume = name;
  const p = PAL[name];
  g.dressMat.color.setHex(p.dress);
  g.collarMat.color.setHex(p.accent);
  g.capeMat.color.setHex(p.cape);
  g.hat.visible = name === 'witch';
  g.pumpHat.visible = name === 'pumpkin';
  g.hood.visible = name === 'ghost';
  g.catEars.visible = name === 'cat';
  g.hair.visible = name !== 'ghost';
  const ghost = name === 'ghost';
  g.dressMat.transparent = ghost;
  g.dressMat.opacity = ghost ? 0.9 : 1;
  g.dressMat.emissive.setHex(ghost ? 0x33405e : 0x000000);
  g.dressMat.emissiveIntensity = ghost ? 0.5 : 0;
  g.capeMat.transparent = ghost;
  g.capeMat.opacity = ghost ? 0.75 : 1;
}

export function addCandy(g, n) {
  g.candyCount = Math.min(90, g.candyCount + n);
  g.candyMesh.count = g.candyCount;
  g.candyMesh.instanceMatrix.needsUpdate = true;
  g.bucketPulse = 1;
}

export function setPath(g, points) {
  g.path = points.map(p => p.clone());
  g.pathI = 0;
}

export function isWalking(g) { return !!g.path; }

export function playAnim(g, name, dur) {
  g.anim = name; g.animT = 0; g.animDur = dur;
}

const _tmp = new THREE.Vector3();

export function updateGirl(g, dt, t) {
  g.t += dt;

  // --- path following ---
  let moving = false;
  if (g.path) {
    const target = g.path[g.pathI];
    _tmp.copy(target).sub(g.pos); _tmp.y = 0;
    const d = _tmp.length();
    const sp = 3.0 * (g.speedScale || 1);
    g.speed += (sp - g.speed) * Math.min(1, dt * 4);
    const step = g.speed * dt;
    if (d <= step + 0.12) {
      // snap on arrival so a long frame can never make her orbit a waypoint
      g.pos.copy(target); g.pos.y = 0;
      g.pathI++;
      if (g.pathI >= g.path.length) { g.path = null; }
      moving = true;
    } else {
      _tmp.normalize();
      g.pos.addScaledVector(_tmp, step);
      const want = Math.atan2(_tmp.x, _tmp.z);
      let diff = want - g.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      g.heading += diff * Math.min(1, dt * 7);
      moving = true;
    }
  }
  if (!moving) g.speed += (0 - g.speed) * Math.min(1, dt * 8);

  // --- facing when idle ---
  if (!moving && g.lookAt) {
    _tmp.copy(g.lookAt).sub(g.pos); _tmp.y = 0;
    if (_tmp.lengthSq() > 0.01) {
      const want = Math.atan2(_tmp.x, _tmp.z);
      let diff = want - g.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      g.heading += diff * Math.min(1, dt * 3.2);
    }
  }

  g.root.position.copy(g.pos);
  let spin = 0;
  let poseLean = 0;
  let armPose = null;

  // --- scripted anims ---
  if (g.anim) {
    g.animT += dt;
    const k = Math.min(1, g.animT / g.animDur);
    if (g.anim === 'reveal') {
      const e = k * k * (3 - 2 * k);
      spin = e * Math.PI * 4;
      poseLean = Math.sin(k * Math.PI) * 0.22;
      const flare = Math.sin(Math.min(1, k * 1.4) * Math.PI);
      for (let i = 0; i < g.cape.length; i++) {
        g.cape[i].rotation.x = -flare * (0.5 + i * 0.28);
        g.cape[i].rotation.z = Math.sin(t * 9 + i) * flare * 0.25;
      }
      armPose = [-2.1 * Math.sin(k * Math.PI) - 0.2, -2.1 * Math.sin(k * Math.PI) + 0.2];
      g.ringGlow = Math.max(g.ringGlow, Math.sin(k * Math.PI));
      if (k >= 1) { g.anim = null; }
    } else if (g.anim === 'sit') {
      const e = Math.min(1, g.animT / 0.8);   // hold the pose once seated
      g.rig.position.y = -0.42 * e;
      g.legs[0].rotation.x = -1.5 * e;
      g.legs[1].rotation.x = -1.5 * e;
      g.legs[0].rotation.z = -0.4 * e;
      g.legs[1].rotation.z = 0.4 * e;
      const eat = Math.sin(t * 2.4) * 0.5 + 0.5;
      g.arms[1].rotation.x = -0.4 - eat * 1.1;
      g.arms[0].rotation.x = -0.5;
      g.head.rotation.x = 0.1 + eat * 0.12;
      g.animDur = 1e9;
    } else if (g.anim === 'cheer') {
      const e = Math.sin(k * Math.PI);
      armPose = [-2.6 * e, -2.6 * e];
      g.rig.position.y = Math.abs(Math.sin(k * Math.PI * 3)) * 0.18;
      if (k >= 1) { g.anim = null; g.rig.position.y = 0; }
    }
  }

  if (!g.anim || (g.anim !== 'sit')) {
    if (!g.anim) g.rig.position.y = 0;
  }

  g.root.rotation.y = g.heading + spin;

  // --- walk / idle animation ---
  const sp = Math.min(1.35, g.speed / 3.0);
  g.walkPhase += dt * (4.0 + sp * 5.0) * (0.25 + sp);
  if (g.anim !== 'sit') {
    const swing = Math.sin(g.walkPhase) * 0.72 * sp;
    g.legs[0].rotation.x = swing;
    g.legs[1].rotation.x = -swing;
    const bob = Math.abs(Math.sin(g.walkPhase)) * 0.055 * sp + Math.sin(g.t * 1.8) * 0.012;
    if (!g.anim) g.rig.position.y = bob;
    g.rig.rotation.z = Math.sin(g.walkPhase) * 0.045 * sp + Math.sin(g.t * 1.4) * 0.012;
    g.head.rotation.z = -Math.sin(g.walkPhase) * 0.03 * sp;
    g.head.rotation.x = poseLean * -0.4;

    // arms
    g.offer += (g.offerTarget - g.offer) * Math.min(1, dt * 5);
    const armSwingL = -Math.sin(g.walkPhase) * 0.5 * sp;
    const armSwingR = Math.sin(g.walkPhase) * 0.6 * sp;
    if (armPose) {
      g.arms[0].rotation.x = armPose[0];
      g.arms[1].rotation.x = armPose[1];
      g.arms[0].rotation.z = -0.5; g.arms[1].rotation.z = 0.5;
    } else {
      g.arms[0].rotation.x = armSwingL * 0.4 - g.offer * 1.25;
      g.arms[1].rotation.x = armSwingR - g.offer * 0.7;
      g.arms[0].rotation.z = -0.12 - g.offer * 0.22 + Math.sin(g.t * 1.6) * 0.02;
      g.arms[1].rotation.z = 0.12 + Math.sin(g.t * 1.6 + 1) * 0.02;
    }

    // cape sway
    if (g.anim !== 'reveal') {
      for (let i = 0; i < g.cape.length; i++) {
        const lag = Math.sin(g.walkPhase - i * 0.7) * (0.12 + i * 0.05) * sp;
        const idle = Math.sin(g.t * 1.3 - i * 0.5) * 0.045;
        g.cape[i].rotation.x += ((-0.06 - lag - idle * 0.4) - g.cape[i].rotation.x) * Math.min(1, dt * 8);
        g.cape[i].rotation.z += ((idle) - g.cape[i].rotation.z) * Math.min(1, dt * 8);
      }
    }
  }

  // footstep callback
  if (sp > 0.25) {
    const ph = Math.floor(g.walkPhase / Math.PI);
    if (ph !== g._lastStep) {
      g._lastStep = ph;
      if (g.onFootstep) g.onFootstep();
    }
  }

  // bucket glow
  g.bucketPulse = Math.max(0, g.bucketPulse - dt * 1.5);
  const bh = g.bucketHaloTarget || 0;
  g.bucketHalo.material.opacity += ((bh * (0.4 + 0.35 * Math.sin(t * 5)) + g.bucketPulse * 0.5) - g.bucketHalo.material.opacity) * Math.min(1, dt * 6);
  g.bucket.rotation.z = bh * Math.sin(t * 11) * 0.09;
  g.bucket.scale.setScalar(1 + g.bucketPulse * 0.12);

  g.ringGlow = Math.max(0, g.ringGlow - dt * 1.1);
  g.ring.material.opacity = g.ringGlow * 0.85;
  g.ring.scale.setScalar(2.4 + (1 - g.ringGlow) * 2.0);

  // rim light follows behind-left relative to heading
  g.rim.position.set(
    Math.sin(g.heading + 2.4) * 1.3,
    2.0,
    Math.cos(g.heading + 2.4) * 1.3
  );
}

export function girlWorldPoint(g, which) {
  const v = new THREE.Vector3();
  if (which === 'bucket') g.bucket.getWorldPosition(v);
  else if (which === 'head') g.headMesh.getWorldPosition(v);
  else v.copy(g.pos).setY(1.0);
  return v;
}
