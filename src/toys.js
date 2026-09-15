import * as THREE from 'three';
import * as T from './textures.js';
import * as A from './audio.js';
import { makeJackOLantern, updateLantern, mergeColored } from './house.js';
import { COSTUMES, setCostume } from './girl.js';
import { mergeGeometries as mergeGeometriesLocal } from 'three/addons/utils/BufferGeometryUtils.js';

const M = (c, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r });

// Every toy: { group, kind, hitRadius, tap(ctx), update(dt,t) }

function baseToy(kind, group, hitRadius) {
  return { kind, group, hitRadius, cooldown: 0, tapCount: 0, update() {}, tap() {} };
}

// ------------------------------------------------------------ jack-o'-lantern
export function toyPumpkin(pos, scale = 1) {
  const g = makeJackOLantern(scale, (Math.random() * 4) | 0);
  g.position.copy(pos);
  g.userData.target = 0.25;
  const t = baseToy('pumpkin', g, 0.8 * scale);
  t.faceVariant = g.userData.variant;
  t.update = (dt, time) => {
    updateLantern(g, dt, time);
    if (t.pop > 0) {
      t.pop -= dt * 2.2;
      g.scale.setScalar(scale * (1 + Math.max(0, t.pop) * 0.18));
    }
  };
  t.pop = 0;
  t.tap = (ctx) => {
    t.tapCount++;
    t.faceVariant = (t.faceVariant + 1) % 4;
    g.userData.faceMat.map = T.pumpkinFaceTexture(t.faceVariant, '#ffffff');
    g.userData.carve.material.map = T.pumpkinFaceTexture(t.faceVariant, '#1a0d06');
    g.userData.faceMat.needsUpdate = true;
    g.userData.carve.material.needsUpdate = true;
    const hue = [0xffc25e, 0x9dff7a, 0x7ac8ff, 0xff8ab0][t.tapCount % 4];
    g.userData.faceMat.color.setHex(hue);
    g.userData.halo.material.color.setHex(hue);
    g.userData.light.color.setHex(hue);
    g.userData.target = 1;
    t.pop = 1;
    ctx.sparkles.burst(g.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, 0)), 16, hue, 1.2);
    A.sfxLaugh();
  };
  return t;
}

// ------------------------------------------------------------------ spider web
export function toyWeb(pos, rotY = 0) {
  const g = new THREE.Group();
  g.position.copy(pos);
  g.rotation.y = rotY;
  const web = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({
    map: T.webTexture(), transparent: true, depthWrite: false, opacity: 0.55, side: THREE.DoubleSide
  }));
  g.add(web);
  const spider = new THREE.Group();
  const sParts = [];
  const abG = new THREE.SphereGeometry(0.11, 10, 8); abG.scale(1, 0.85, 1.2);
  sParts.push({ geo: abG, color: 0x14111a });
  const hdG = new THREE.SphereGeometry(0.07, 8, 6); hdG.translate(0, 0, 0.14);
  sParts.push({ geo: hdG, color: 0x17131d });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xff2222, emissiveIntensity: 2 });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), eyeMat);
    e.position.set(s * 0.035, 0.03, 0.2);
    spider.add(e);
  }
  for (let i = 0; i < 8; i++) {
    const s = i < 4 ? -1 : 1;
    const k = i % 4;
    const leg = new THREE.CapsuleGeometry(0.014, 0.22, 2, 4);
    leg.rotateZ(s * 1.0); leg.rotateX((k - 1.5) * 0.25);
    leg.translate(s * 0.13, 0.02, (k - 1.5) * 0.07);
    sParts.push({ geo: leg, color: 0x14111a });
  }
  spider.add(new THREE.Mesh(mergeColored(sParts),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })));
  const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 3, 4),
    new THREE.MeshBasicMaterial({ color: 0xcfd8ea, transparent: true, opacity: 0.4 }));
  thread.position.y = 1.5;
  spider.add(thread);
  spider.position.set(0, 0.3, 0.06);
  g.add(spider);

  const t = baseToy('web', g, 1.1);
  t.drop = 0; t.vel = 0;
  t.update = (dt, time) => {
    t.drop += (t.dropTarget || 0) - t.drop > 0 ? Math.min(dt * 2.2, (t.dropTarget || 0) - t.drop) : Math.max(-dt * 1.1, (t.dropTarget || 0) - t.drop);
    spider.position.y = 0.3 - t.drop * 1.5;
    spider.rotation.z = Math.sin(time * 6) * t.drop * 0.25;
    web.material.opacity = 0.45 + 0.18 * Math.sin(time * 2 + pos.x) + t.drop * 0.2;
    g.rotation.z = Math.sin(time * 3) * 0.02 * (1 + t.drop * 3);
    if (t.drop > 0.95) t.dropTarget = 0;
  };
  t.tap = (ctx) => {
    t.dropTarget = 1;
    A.sfxWhoosh();
    ctx.sparkles.burst(g.getWorldPosition(new THREE.Vector3()), 10, 0xcfd8ea, 0.7, 0.3);
  };
  return t;
}

// ------------------------------------------------------------- hanging ghost
export function toyGhost(pos) {
  const g = new THREE.Group();
  g.position.copy(pos);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xe9eef8, roughness: 0.9, transparent: true, opacity: 0.8,
    emissive: new THREE.Color(0x3a4a70), emissiveIntensity: 0.7, side: THREE.DoubleSide
  });
  const bodyGeo = new THREE.SphereGeometry(0.42, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const body = new THREE.Mesh(bodyGeo, mat);
  g.add(body);
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.75, 14, 1, true), mat);
  skirt.position.y = -0.36;
  skirt.rotation.x = Math.PI;
  g.add(skirt);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), new THREE.MeshBasicMaterial({
    map: T.faceTexture('ghost'), transparent: true, depthWrite: false
  }));
  face.position.set(0, 0.02, 0.4);
  g.add(face);
  const str = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1.6, 4),
    new THREE.MeshBasicMaterial({ color: 0x9aa4bb, transparent: true, opacity: 0.35 }));
  str.position.y = 1.0;
  g.add(str);

  const t = baseToy('ghost', g, 0.7);
  t.boo = 0;
  t.update = (dt, time) => {
    t.boo = Math.max(0, t.boo - dt * 1.1);
    const s = 1 + Math.sin(Math.min(1, t.boo) * Math.PI) * 0.55;
    g.scale.set(s, s, s);
    g.rotation.y += dt * (0.4 + t.boo * 9);
    g.position.y = pos.y + Math.sin(time * 1.6) * 0.1;
    g.rotation.z = Math.sin(time * 1.2) * 0.08;
    mat.emissiveIntensity = 0.6 + 0.25 * Math.sin(time * 2.1) + t.boo * 1.2;
  };
  t.tap = (ctx) => {
    t.boo = 1;
    A.sfxPop();
    ctx.sparkles.burst(g.getWorldPosition(new THREE.Vector3()), 18, 0xc8d8ff, 1.3, 0.4);
  };
  return t;
}

// ---------------------------------------------------------------- scarecrow
export function toyScarecrow(pos, rotY = 0) {
  const g = new THREE.Group();
  g.position.copy(pos);
  g.rotation.y = rotY;
  const poleG = new THREE.CylinderGeometry(0.06, 0.06, 2.0, 6); poleG.translate(0, 1.0, 0);
  const crossG = new THREE.BoxGeometry(1.5, 0.08, 0.08); crossG.translate(0, 1.5, 0);
  const headG = new THREE.SphereGeometry(0.24, 12, 10); headG.translate(0, 1.86, 0);
  g.add(new THREE.Mesh(mergeColored([
    { geo: poleG, color: 0x4a3a2a }, { geo: crossG, color: 0x4a3a2a }, { geo: headG, color: 0xc9a96a }
  ]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 })));
  const shirt = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.85, 10), M(0x8a4a3a));
  shirt.position.y = 1.25; g.add(shirt);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({
    map: T.faceTexture('pumpkinhead'), transparent: true, depthWrite: false
  }));
  face.position.set(0, 1.86, 0.235); g.add(face);
  const hat = new THREE.Group();
  const brimG = new THREE.CylinderGeometry(0.4, 0.42, 0.04, 12);
  const crownG = new THREE.CylinderGeometry(0.2, 0.23, 0.26, 12); crownG.translate(0, 0.14, 0);
  hat.add(new THREE.Mesh(mergeColored([
    { geo: brimG, color: 0x5a4530 }, { geo: crownG, color: 0x5a4530 }
  ]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 })));
  hat.position.y = 2.1;
  g.add(hat);
  // straw
  const strawParts = [];
  for (let i = 0; i < 10; i++) {
    const sg = new THREE.CylinderGeometry(0.012, 0.012, 0.22, 3);
    const a = Math.random() * 6.28;
    sg.rotateX(Math.random() * 0.8 - 0.4); sg.rotateZ(Math.random() * 0.8 - 0.4);
    sg.translate(Math.cos(a) * 0.3, 0.86 + Math.random() * 0.1, Math.sin(a) * 0.3);
    strawParts.push({ geo: sg, color: 0xc9a96a });
  }
  g.add(new THREE.Mesh(mergeColored(strawParts),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));

  const t = baseToy('scarecrow', g, 1.0);
  t.fly = 0;
  t.update = (dt, time) => {
    if (t.fly > 0) {
      t.fly -= dt * 0.8;
      const k = 1 - t.fly;
      const arc = Math.sin(Math.min(1, k * 1.0) * Math.PI);
      hat.position.y = 2.1 + arc * 1.6;
      hat.position.x = Math.sin(k * 8) * 0.5 * arc;
      hat.rotation.z = k * 12;
      hat.rotation.x = k * 6;
    } else {
      hat.position.y += (2.1 - hat.position.y) * Math.min(1, dt * 6);
      hat.position.x *= 0.85;
      hat.rotation.z *= 0.85; hat.rotation.x *= 0.85;
    }
    g.rotation.z = Math.sin(time * 1.1) * 0.03;
    shirt.rotation.y = Math.sin(time * 0.8) * 0.06;
  };
  t.tap = (ctx) => {
    t.fly = 1;
    A.sfxWhoosh();
    ctx.leaves.burst(g.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.6, 0)), 12, 0.8);
  };
  return t;
}

// ---------------------------------------------------------------- leaf pile
export function toyLeafPile(pos) {
  const g = new THREE.Group();
  g.position.copy(pos);
  const cols = [0xb86a28, 0x9a4f22, 0xd08a30, 0x8a5a2a];
  const parts = [];
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * 6.28, r = Math.random() * 0.75;
    const geo = new THREE.SphereGeometry(0.22, 6, 5);
    geo.scale(1.3, 0.45, 1.1);
    geo.rotateY(Math.random() * 6.28);
    geo.translate(Math.cos(a) * r, 0.1 + Math.random() * 0.22 * (1 - r), Math.sin(a) * r);
    parts.push({ geo, color: cols[i % cols.length] });
  }
  const mound = new THREE.Mesh(mergeColored(parts),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
  g.add(mound);

  // hidden cat
  const cat = makeCatMesh();
  cat.position.set(0, -0.4, 0);
  cat.visible = false;
  g.add(cat);

  const t = baseToy('leafpile', g, 1.1);
  t.catOut = 0; t.catTimer = 0;
  t.update = (dt, time) => {
    mound.scale.y = 1 + Math.sin(time * 1.5 + pos.x) * 0.04 + (t.shake || 0) * 0.25;
    if (t.shake) t.shake = Math.max(0, t.shake - dt * 2);
    if (t.catTimer > 0) {
      t.catTimer -= dt;
      t.catOut = Math.min(1, t.catOut + dt * 3);
    } else {
      t.catOut = Math.max(0, t.catOut - dt * 2);
    }
    cat.visible = t.catOut > 0.02;
    cat.position.y = -0.4 + t.catOut * 0.55;
    cat.rotation.y = Math.sin(time * 3) * 0.3 * t.catOut;
    cat.scale.setScalar(0.8 + t.catOut * 0.2);
  };
  t.tap = (ctx) => {
    t.shake = 1;
    t.catTimer = 3.0;
    const w = g.getWorldPosition(new THREE.Vector3());
    ctx.leaves.burst(w.clone().add(new THREE.Vector3(0, 0.3, 0)), 22, 1.1);
    A.sfxLeaves();
    setTimeout(() => A.sfxMeow(), 350);
  };
  return t;
}

function makeCatMesh() {
  const c = new THREE.Group();
  const parts = [];
  const bodyG = new THREE.CapsuleGeometry(0.17, 0.3, 3, 8);
  bodyG.rotateZ(Math.PI / 2); bodyG.translate(0, 0.26, 0);
  parts.push({ geo: bodyG, color: 0x1e1a24 });
  const headG = new THREE.SphereGeometry(0.16, 10, 8); headG.translate(0, 0.46, 0.2);
  parts.push({ geo: headG, color: 0x231e2a });
  for (const s of [-1, 1]) {
    const ear = new THREE.ConeGeometry(0.06, 0.13, 4);
    ear.translate(s * 0.08, 0.59, 0.18);
    parts.push({ geo: ear, color: 0x1e1a24 });
  }
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.CapsuleGeometry(0.04, 0.16, 2, 5);
    leg.translate((i % 2 ? 0.1 : -0.1), 0.1, i < 2 ? 0.14 : -0.12);
    parts.push({ geo: leg, color: 0x181420 });
  }
  c.add(new THREE.Mesh(mergeColored(parts),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffd24d, emissive: 0xffb300, emissiveIntensity: 2.2 });
  const eyeG = [];
  for (const s of [-1, 1]) {
    const e = new THREE.SphereGeometry(0.032, 6, 5);
    e.translate(s * 0.06, 0.48, 0.33);
    eyeG.push(e);
  }
  c.add(new THREE.Mesh(mergeColored(eyeG.map(geo => ({ geo, color: 0xffd24d }))), eyeMat));
  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.34, 3, 6), M(0x1e1a24, 0.95));
  tail.position.set(0, 0.42, -0.24);
  tail.rotation.x = 0.7;
  c.add(tail);
  c.userData.tail = tail;
  return c;
}

// --------------------------------------------------------------------- cat
export function toyCat(pos) {
  const g = makeCatMesh();
  g.position.copy(pos);
  const t = baseToy('cat', g, 0.6);
  t.follow = false;
  t.meow = 0;
  t.home = pos.clone();
  t.update = (dt, time, ctx) => {
    t.meow = Math.max(0, t.meow - dt * 1.5);
    g.userData.tail.rotation.z = Math.sin(time * 2.4) * 0.35;
    g.position.y = t.home.y + Math.abs(Math.sin(time * 2)) * 0.02;
    if (t.follow && ctx && ctx.girl) {
      const target = ctx.girl.pos;
      const d = g.position.distanceTo(target);
      if (d > 1.8) {
        const dir = target.clone().sub(g.position).setY(0).normalize();
        g.position.addScaledVector(dir, dt * 2.2);
        g.rotation.y = Math.atan2(dir.x, dir.z);
        g.position.y = t.home.y + Math.abs(Math.sin(time * 9)) * 0.09;
      }
    }
    g.scale.setScalar(1 + Math.sin(Math.min(1, t.meow) * Math.PI) * 0.15);
  };
  t.tap = (ctx) => {
    t.meow = 1;
    t.follow = !t.follow;
    A.sfxMeow();
    ctx.sparkles.burst(g.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.5, 0)), 10, 0xffd24d, 0.8);
  };
  return t;
}

// ---------------------------------------------------------------- pinwheel
export function toyPinwheel(pos) {
  const g = new THREE.Group();
  g.position.copy(pos);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 5), M(0x6a5a44));
  pole.position.y = 0.65; g.add(pole);
  const wheel = new THREE.Group();
  const cols = [0xff8a3c, 0xffd24a, 0x7ad2ff, 0xff7ab8];
  const bladeParts = [];
  for (let i = 0; i < 4; i++) {
    const b = new THREE.PlaneGeometry(0.34, 0.16);
    b.translate(0.19, 0, 0);
    b.rotateZ((i / 4) * Math.PI * 2);
    bladeParts.push({ geo: b, color: cols[i] });
  }
  wheel.add(new THREE.Mesh(mergeColored(bladeParts), new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.6, side: THREE.DoubleSide,
    emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.18
  })));
  wheel.position.y = 1.3;
  g.add(wheel);
  const t = baseToy('pinwheel', g, 0.55);
  t.spin = 0.6;
  t.update = (dt, time) => {
    t.spin = Math.max(0.5, t.spin - dt * 0.9);
    wheel.rotation.z += dt * t.spin * 3;
    g.rotation.z = Math.sin(time * 1.4) * 0.03;
  };
  t.tap = (ctx) => {
    t.spin = 9;
    A.sfxWhoosh();
    ctx.sparkles.burst(g.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.3, 0)), 14, 0xffd24a, 1.0, 0.3);
  };
  return t;
}

// -------------------------------------------------------------- wind chime
export function toyChime(pos) {
  const g = new THREE.Group();
  g.position.copy(pos);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 10), M(0x6a5a44));
  g.add(cap);
  const tubes = [];
  const tubeMat = new THREE.MeshStandardMaterial({
    color: 0xd8dbe4, roughness: 0.3, metalness: 0.8,
    emissive: new THREE.Color(0x445566), emissiveIntensity: 0.3
  });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const holder = new THREE.Group();
    const len = 0.5 - i * 0.05;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 6), tubeMat);
    tube.position.y = -len / 2 - 0.12;
    holder.add(tube);
    holder.position.set(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1);
    g.add(holder);
    tubes.push(holder);
  }
  const t = baseToy('chime', g, 0.5);
  t.ring = 0;
  t.update = (dt, time) => {
    t.ring = Math.max(0, t.ring - dt * 0.8);
    for (let i = 0; i < tubes.length; i++) {
      const amp = 0.04 + t.ring * 0.4;
      tubes[i].rotation.x = Math.sin(time * (3 + i * 0.6) + i) * amp;
      tubes[i].rotation.z = Math.cos(time * (2.6 + i * 0.5) + i) * amp;
    }
    tubeMat.emissiveIntensity = 0.3 + t.ring * 1.4;
  };
  t.tap = () => { t.ring = 1; A.sfxChimeSoft(); };
  return t;
}

// ------------------------------------------------------------------- candle
export function toyCandle(pos) {
  const g = new THREE.Group();
  g.position.copy(pos);
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.34, 8), M(0xefe4cf, 0.7));
  wax.position.y = 0.17; g.add(wax);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffd07a, transparent: true, opacity: 0.95 });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 7), flameMat);
  flame.position.y = 0.41; g.add(flame);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.glowTexture(), color: 0xffb35e, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0.4
  }));
  halo.scale.set(1.0, 1.0, 1); halo.position.y = 0.41;
  g.add(halo);
  const t = baseToy('candle', g, 0.4);
  t.big = 0;
  t.update = (dt, time) => {
    t.big = Math.max(0, t.big - dt * 0.7);
    const f = 1 + t.big * 1.6 + Math.sin(time * 14) * 0.08;
    flame.scale.set(1, f, 1);
    flame.position.y = 0.41 + (f - 1) * 0.07;
    halo.material.opacity = 0.35 + t.big * 0.5 + Math.sin(time * 9) * 0.05;
    halo.scale.setScalar(1.0 + t.big * 1.2);
  };
  t.tap = (ctx) => {
    t.big = 1;
    A.sfxPop();
    ctx.sparkles.burst(g.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.45, 0)), 8, 0xffd07a, 0.6, 0.2);
  };
  return t;
}

// -------------------------------------------------------------- skull sign
export function toySign(pos, rotY = 0) {
  const g = new THREE.Group();
  g.position.copy(pos); g.rotation.y = rotY;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 5), M(0x5a4530));
  post.position.y = 0.5; g.add(post);
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.05), new THREE.MeshStandardMaterial({
    map: T.skullSignTexture(), roughness: 0.9
  }));
  board.position.y = 1.05;
  g.add(board);
  const t = baseToy('sign', g, 0.55);
  t.swing = 0;
  t.update = (dt, time) => {
    t.swing = Math.max(0, t.swing - dt);
    board.rotation.z = Math.sin(time * 9) * t.swing * 0.5 + Math.sin(time * 1.2) * 0.03;
    board.material.emissive = board.material.emissive || new THREE.Color();
  };
  t.tap = (ctx) => {
    t.swing = 1;
    A.sfxLaugh();
    ctx.bats.flock(g.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.4, 0)), new THREE.Vector3(0, 0.5, -1), 4);
  };
  return t;
}

// ----------------------------------------------------------------- gate
export function toyGate(pos, rotY = 0) {
  const g = new THREE.Group();
  g.position.copy(pos); g.rotation.y = rotY;
  const woodMat = new THREE.MeshStandardMaterial({ map: T.woodTexture('#5a4636'), roughness: 0.9 });
  const postGeos = [];
  for (const s of [-1, 1]) {
    const pg = new THREE.BoxGeometry(0.14, 1.3, 0.14);
    pg.translate(s * 0.85, 0.65, 0);
    postGeos.push(pg);
  }
  g.add(new THREE.Mesh(mergeGeometriesLocal(postGeos), woodMat));
  const leaf = new THREE.Group();
  leaf.position.set(-0.78, 0, 0);
  const lparts = [];
  for (let i = 0; i < 4; i++) {
    const b = new THREE.BoxGeometry(0.09, 0.95, 0.06);
    b.translate(0.18 + i * 0.4, 0.55, 0);
    lparts.push(b);
  }
  const r1 = new THREE.BoxGeometry(1.55, 0.09, 0.05); r1.translate(0.78, 0.85, 0);
  const r2 = new THREE.BoxGeometry(1.55, 0.09, 0.05); r2.translate(0.78, 0.3, 0);
  lparts.push(r1, r2);
  leaf.add(new THREE.Mesh(mergeGeometriesLocal(lparts), woodMat));
  g.add(leaf);
  const t = baseToy('gate', g, 0.9);
  t.open = 0; t.target = 0;
  t.update = (dt) => {
    t.open += (t.target - t.open) * Math.min(1, dt * 3);
    leaf.rotation.y = -t.open * 1.25;
    if (t.open > 0.95) t.target = 0;
  };
  t.tap = () => { t.target = 1; A.sfxDoorCreak(); };
  return t;
}

// -------------------------------------------------------- costume mannequins
export function toyMannequin(pos, costume, rotY = 0) {
  const g = new THREE.Group();
  g.position.copy(pos); g.rotation.y = rotY;
  const standG = new THREE.CylinderGeometry(0.3, 0.36, 0.14, 12);
  const poleG = new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6); poleG.translate(0, 0.4, 0);
  g.add(new THREE.Mesh(mergeColored([
    { geo: standG, color: 0x4a4050 }, { geo: poleG, color: 0x5a5060 }
  ]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })));

  const colors = { witch: 0x6a3f9a, ghost: 0xe9edf6, pumpkin: 0xdd6a1e, cat: 0x2a2530 };
  const c = colors[costume];
  const bodyMat = new THREE.MeshStandardMaterial({
    color: c, roughness: 0.7, emissive: new THREE.Color(c), emissiveIntensity: 0.45
  });
  const figure = [];
  const dg = new THREE.CylinderGeometry(0.16, 0.36, 0.7, 12); dg.translate(0, 1.05, 0);
  const hg = new THREE.SphereGeometry(0.2, 12, 10); hg.translate(0, 1.55, 0);
  figure.push(dg, hg);
  if (costume === 'witch') {
    const ha = new THREE.ConeGeometry(0.22, 0.5, 10); ha.translate(0, 1.95, 0);
    const br = new THREE.CylinderGeometry(0.34, 0.36, 0.04, 12); br.translate(0, 1.72, 0);
    figure.push(ha, br);
  } else if (costume === 'cat') {
    for (const s of [-1, 1]) {
      const ear = new THREE.ConeGeometry(0.08, 0.18, 4);
      ear.translate(s * 0.11, 1.74, 0);
      figure.push(ear);
    }
  } else if (costume === 'pumpkin') {
    const stem = new THREE.CylinderGeometry(0.04, 0.06, 0.16, 5); stem.translate(0, 1.78, 0);
    figure.push(stem);
  }
  g.add(new THREE.Mesh(mergeGeometriesLocal(figure.map(x => {
    const y = x.index ? x.toNonIndexed() : x;
    for (const k of Object.keys(y.attributes)) if (!['position','normal','uv'].includes(k)) y.deleteAttribute(k);
    return y;
  }), false), bodyMat));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.glowTexture(), color: c, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0.35
  }));
  halo.scale.set(2.2, 2.2, 1); halo.position.y = 1.2;
  g.add(halo);

  const t = baseToy('mannequin', g, 0.9);
  t.costume = costume;
  t.pop = 0;
  t.update = (dt, time) => {
    t.pop = Math.max(0, t.pop - dt * 1.6);
    const pulse = 0.35 + 0.2 * Math.sin(time * 2 + pos.x) + t.pop * 0.6;
    halo.material.opacity = pulse;
    bodyMat.emissiveIntensity = 0.4 + 0.2 * Math.sin(time * 2 + pos.x) + t.pop;
    g.position.y = pos.y + Math.sin(time * 1.5 + pos.x) * 0.03;
    g.scale.setScalar(1 + t.pop * 0.1);
  };
  t.tap = (ctx) => {
    t.pop = 1;
    setCostume(ctx.girl, costume);
    ctx.girl.ringGlow = 1;
    A.sfxTwinkleUp();
    ctx.sparkles.ring(ctx.girl.pos.clone().setY(0.6), 30, 0.9, c);
  };
  return t;
}

export function toyTombstone(pos, rotY = 0) {
  const g = new THREE.Group();
  g.position.copy(pos); g.rotation.y = rotY;
  const stoneMat = M(0x6e6b74, 0.95);
  const bg = new THREE.BoxGeometry(0.7, 0.16, 0.3); bg.translate(0, 0.08, 0);
  const sg = new THREE.CylinderGeometry(0.28, 0.28, 0.16, 12, 1, false, 0, Math.PI);
  sg.rotateZ(Math.PI / 2); sg.rotateY(Math.PI / 2); sg.translate(0, 0.72, 0);
  const yg = new THREE.BoxGeometry(0.56, 0.72, 0.16); yg.translate(0, 0.44, 0);
  g.add(new THREE.Mesh(mergeGeometriesLocal([bg, sg, yg]), stoneMat));
  const t = baseToy('tomb', g, 0.6);
  t.shake = 0;
  t.update = (dt, time) => {
    t.shake = Math.max(0, t.shake - dt * 1.4);
    g.rotation.z = Math.sin(time * 26) * t.shake * 0.06;
    g.position.y = pos.y + Math.sin(time * 18) * t.shake * 0.04;
  };
  t.tap = (ctx) => {
    t.shake = 1;
    A.sfxPop();
    const w = g.getWorldPosition(new THREE.Vector3());
    ctx.sparkles.burst(w.clone().add(new THREE.Vector3(0, 0.4, 0)), 14, 0x9fd8c0, 1.0, 0.25);
    ctx.bats.flock(w.clone().add(new THREE.Vector3(0, 0.8, 0)), new THREE.Vector3(0.3, 1, -0.6), 3);
  };
  return t;
}
