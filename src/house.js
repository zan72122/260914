import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';

const glowTex = () => T.glowTexture();

export const HOUSE_STYLES = [
  { body: '#d8cfae', body2: '#c8bd98', roof: '#7d3b34', trim: '#6a5240', resident: 'granny', face: 4 },
  { body: '#8fa4b8', body2: '#7d92a8', roof: '#3b3552', trim: '#4a4560', resident: 'ghost', face: 1 },
  { body: '#a8c8a4', body2: '#93b690', roof: '#6b4a34', trim: '#4f6b4c', resident: 'cat', face: 2 },
  { body: '#b8764a', body2: '#a4663d', roof: '#3a2f2c', trim: '#5d4436', resident: 'pumpkin', face: 0 },
  { body: '#7b6494', body2: '#6a5482', roof: '#26202f', trim: '#453a58', resident: 'witch', face: 3 },
  { body: '#c9a36a', body2: '#b8935d', roof: '#6e4f3a', trim: '#5c4632', resident: null, face: 0 }
];

const WARM = 0xffb54a;

/** merge several geometries into one, baking a colour per part into vertex colours */
export function mergeColored(parts) {
  const geos = [];
  for (const { geo, color } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    for (const k of Object.keys(g.attributes)) {
      if (k !== 'position' && k !== 'normal' && k !== 'color' && k !== 'uv') g.deleteAttribute(k);
    }
    geos.push(g);
  }
  return mergeGeometries(geos, false);
}

function gableRoofGeometry(w, h, d) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

function boxAt(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Matrix4();
  const e = new THREE.Euler(rx, ry, rz);
  m.makeRotationFromEuler(e);
  m.setPosition(x, y, z);
  g.applyMatrix4(m);
  return g;
}

function cylAt(rt, rb, h, seg, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  const m = new THREE.Matrix4();
  m.makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
  m.setPosition(x, y, z);
  g.applyMatrix4(m);
  return g;
}

// ---------------------------------------------------------------------------
export function makeJackOLantern(scale = 1, variant = 0) {
  const g = new THREE.Group();
  const bodyGeo = new THREE.SphereGeometry(0.5, 14, 10);
  const pos = bodyGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const rib = 1 + Math.cos(a * 8) * 0.055;
    pos.setXYZ(i, x * rib, y * 0.82, z * rib);
  }
  bodyGeo.computeVertexNormals();
  const stemGeo = new THREE.CylinderGeometry(0.05, 0.09, 0.22, 6);
  stemGeo.rotateZ(0.18); stemGeo.translate(0, 0.44, 0);
  const merged = mergeColored([
    { geo: bodyGeo, color: 0xd8641c },
    { geo: stemGeo, color: 0x4c6b2e }
  ]);
  const body = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.78, metalness: 0.0,
    emissive: new THREE.Color(0x3a1000), emissiveIntensity: 0
  }));
  body.castShadow = true;
  g.add(body);

  const faceMat = new THREE.MeshBasicMaterial({
    map: T.pumpkinFaceTexture(variant, '#ffffff'),
    color: new THREE.Color(0xffc25e),
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, opacity: 0
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92), faceMat);
  face.position.set(0, 0.02, 0.455);
  g.add(face);

  const carve = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92), new THREE.MeshBasicMaterial({
    map: T.pumpkinFaceTexture(variant, '#1a0d06'),
    transparent: true, depthWrite: false, opacity: 0.9
  }));
  carve.position.set(0, 0.02, 0.452);
  g.add(carve);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex(), color: 0xff9a2e, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0
  }));
  halo.scale.set(2.6, 2.6, 1);
  g.add(halo);


  g.scale.setScalar(scale);
  g.userData.kind = 'lantern';
  g.userData.faceMat = faceMat;
  g.userData.carve = carve;
  g.userData.body = body;
  g.userData.halo = halo;
  g.userData.variant = variant;
  g.userData.lit = 0;
  g.userData.target = 0;
  g.userData.flicker = Math.random() * 10;
  g.userData.hitRadius = 0.7 * scale;
  return g;
}

export function updateLantern(g, dt, t) {
  const ud = g.userData;
  ud.lit += (ud.target - ud.lit) * Math.min(1, dt * 3.2);
  ud.flicker += dt;
  const pulse = 0.82 + 0.18 * Math.sin(t * 1.9 + ud.variant) + 0.06 * Math.sin(ud.flicker * 11.3);
  const v = ud.lit * pulse;
  ud.faceMat.opacity = Math.min(1, v * 1.15);
  ud.body.material.emissiveIntensity = v * 0.55;
  ud.halo.material.opacity = v * 0.55;
  ud.carve.material.opacity = 0.9 - ud.lit * 0.55;
}

// ---------------------------------------------------------------------------
function makeResident(kind) {
  const g = new THREE.Group();
  const palettes = {
    granny: { body: 0x9a5f7a, head: 0xf0c9a8, hair: 0xd8d4cf },
    ghost: { body: 0xe8ecf5, head: 0xe8ecf5, hair: null },
    cat: { body: 0x2a2630, head: 0x2a2630, hair: null },
    pumpkin: { body: 0x4a3b2c, head: 0xd8641c, hair: null },
    witch: { body: 0x3d2b52, head: 0xa8c07a, hair: 0x241826 }
  };
  const p = palettes[kind] || palettes.granny;

  const bodyGeo = new THREE.CylinderGeometry(0.28, 0.46, 1.0, 12);
  const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({
    color: p.body, roughness: 0.85,
    transparent: kind === 'ghost', opacity: kind === 'ghost' ? 0.85 : 1
  }));
  body.position.y = 0.5;
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), new THREE.MeshStandardMaterial({
    color: p.head, roughness: 0.8,
    transparent: kind === 'ghost', opacity: kind === 'ghost' ? 0.9 : 1,
    emissive: kind === 'ghost' ? 0x2a3550 : 0x000000, emissiveIntensity: kind === 'ghost' ? 0.6 : 0
  }));
  head.position.y = 1.2;
  if (kind === 'pumpkin') head.scale.set(1.05, 0.9, 1.05);
  g.add(head);

  const faceKind = kind === 'pumpkin' ? 'pumpkinhead' : kind;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({
    map: T.faceTexture(faceKind), transparent: true, depthWrite: false
  }));
  face.position.set(0, 1.21, 0.295);
  g.add(face);

  if (kind === 'cat') {
    const earMat = new THREE.MeshStandardMaterial({ color: p.head, roughness: 0.9 });
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 4), earMat);
      ear.position.set(s * 0.17, 1.44, 0);
      ear.rotation.z = s * 0.25;
      g.add(ear);
    }
  }
  if (kind === 'witch' || kind === 'pumpkin') {
    const hat = new THREE.Group();
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.05, 14),
      new THREE.MeshStandardMaterial({ color: 0x241826, roughness: 0.9 }));
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.62, 12),
      new THREE.MeshStandardMaterial({ color: 0x241826, roughness: 0.9 }));
    cone.position.y = 0.33;
    hat.add(brim, cone);
    hat.position.set(0, 1.46, 0);
    hat.rotation.z = -0.1;
    g.add(hat);
  }
  if (kind === 'granny') {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8),
      new THREE.MeshStandardMaterial({ color: p.hair, roughness: 1 }));
    bun.position.set(0, 1.42, -0.12);
    g.add(bun);
  }
  if (kind === 'ghost') {
    body.material.side = THREE.DoubleSide;
  }

  // arms
  const armMat = new THREE.MeshStandardMaterial({ color: p.body, roughness: 0.85 });
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.42, 3, 6), armMat);
    a.position.y = -0.24;
    arm.add(a);
    arm.position.set(s * 0.33, 1.0, 0.02);
    arm.rotation.z = s * 0.18;
    g.add(arm);
    arms.push(arm);
  }

  // candy in right hand
  const candy = new THREE.Group();
  const cm = new THREE.MeshStandardMaterial({
    color: 0xff5f8a, roughness: 0.4, emissive: 0x3a0018, emissiveIntensity: 0.4
  });
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), cm);
    c.position.set((i - 1) * 0.1, i === 1 ? 0.06 : 0, (i % 2) * 0.05);
    candy.add(c);
  }
  candy.position.set(0, -0.48, 0.06);
  candy.visible = false;
  arms[1].add(candy);

  g.userData = { kind, head, face, arms, candy, body, t: 0, hop: 0 };
  return g;
}

// ---------------------------------------------------------------------------
export function createHouse(opts) {
  const { index, style, position, facing, isHome } = opts;
  const st = style;
  const root = new THREE.Group();
  root.position.copy(position);
  root.rotation.y = facing;

  const W = 5.2, H = 3.2, D = 4.6;

  const bodyMat = new THREE.MeshStandardMaterial({
    map: index === 3 ? T.brickTexture(st.body) : T.sidingTexture(st.body, st.body2),
    roughness: 0.92, metalness: 0
  });
  bodyMat.map.repeat.set(3, 2);
  const roofMat = new THREE.MeshStandardMaterial({ map: T.shingleTexture(st.roof), roughness: 0.88 });
  roofMat.map.repeat.set(3, 2);
  const woodMat = new THREE.MeshStandardMaterial({ map: T.woodTexture(st.trim), roughness: 0.9 });

  // --- merged static geometry: body ---
  const bodyParts = [boxAt(W, H, D, 0, H / 2, 0)];
  // chimney
  bodyParts.push(boxAt(0.6, 1.5, 0.6, -W * 0.28, H + 0.8, -0.6));
  const bodyMesh = new THREE.Mesh(mergeGeometries(bodyParts, false), bodyMat);
  bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
  root.add(bodyMesh);

  // --- roof ---
  const roofParts = [];
  const rg = gableRoofGeometry(W + 0.7, 1.9, D + 0.6);
  rg.translate(0, H, 0);
  roofParts.push(rg);
  const roofMesh = new THREE.Mesh(mergeGeometries(roofParts, false), roofMat);
  roofMesh.castShadow = true; roofMesh.receiveShadow = true;
  root.add(roofMesh);

  // --- porch + trim (wood) ---
  const porchZ = D / 2 + 1.0;
  const woodParts = [];
  woodParts.push(boxAt(3.6, 0.22, 2.2, 0, 0.11, D / 2 + 1.0));          // porch deck
  woodParts.push(boxAt(3.9, 0.12, 0.5, 0, 0.05, D / 2 + 2.15));          // step
  for (const s of [-1, 1]) {
    woodParts.push(cylAt(0.1, 0.1, 2.5, 6, s * 1.6, 1.3, D / 2 + 1.85)); // posts
  }
  woodParts.push(boxAt(3.9, 0.22, 2.6, 0, 2.55, D / 2 + 1.2));           // porch roof
  // door frame
  woodParts.push(boxAt(1.5, 2.2, 0.16, 0, 1.1, D / 2 + 0.03));
  // fence
  const fz = D / 2 + 4.2;
  for (let i = -4; i <= 4; i++) {
    woodParts.push(boxAt(0.12, 0.85, 0.12, i * 0.8, 0.42, fz));
  }
  woodParts.push(boxAt(6.6, 0.1, 0.09, 0, 0.72, fz));
  woodParts.push(boxAt(6.6, 0.1, 0.09, 0, 0.35, fz));
  const woodMesh = new THREE.Mesh(mergeGeometries(woodParts, false), woodMat);
  woodMesh.castShadow = true; woodMesh.receiveShadow = true;
  root.add(woodMesh);

  // --- windows ---
  const winMat = new THREE.MeshStandardMaterial({
    color: 0x1b2438, roughness: 0.25, metalness: 0.1,
    emissive: new THREE.Color(WARM), emissiveIntensity: 0
  });
  const winParts = [];
  const wp = [[-1.75, 1.5], [1.75, 1.5], [-1.2, 2.55 + 0.0], [1.2, 2.55]];
  winParts.push(boxAt(1.0, 1.1, 0.08, -1.8, 1.55, D / 2 + 0.01));
  winParts.push(boxAt(1.0, 1.1, 0.08, 1.8, 1.55, D / 2 + 0.01));
  winParts.push(boxAt(0.9, 0.8, 0.08, 0, 3.55, D / 2 - 0.05));
  winParts.push(boxAt(0.08, 1.1, 1.0, -W / 2 - 0.01, 1.7, -0.5));
  winParts.push(boxAt(0.08, 1.1, 1.0, W / 2 + 0.01, 1.7, -0.5));
  const winMesh = new THREE.Mesh(mergeGeometries(winParts, false), winMat);
  root.add(winMesh);

  // --- door (pivot group) ---
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-0.62, 0, D / 2 + 0.06);
  const doorMat = new THREE.MeshStandardMaterial({ map: T.woodTexture(st.trim), roughness: 0.75 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.24, 2.1, 0.1), doorMat);
  door.position.set(0.62, 1.05, 0);
  door.castShadow = true;
  doorPivot.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xd8b25a, roughness: 0.3, metalness: 0.8 }));
  knob.position.set(1.08, 1.05, 0.08);
  doorPivot.add(knob);
  root.add(doorPivot);

  // warm light spilling from the doorway when open
  const doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.15), new THREE.MeshBasicMaterial({
    color: 0xffc472, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  doorGlow.position.set(0, 1.05, D / 2 + 0.02);
  root.add(doorGlow);
  const doorLight = new THREE.PointLight(0xffb060, 0, 7, 2);
  doorLight.visible = false;
  doorLight.position.set(0, 1.4, D / 2 - 0.4);
  root.add(doorLight);

  // --- doorbell ---
  const doorbell = new THREE.Group();
  const bellPlate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x8a8f9c, roughness: 0.4, metalness: 0.6 }));
  doorbell.add(bellPlate);
  const bellBtnMat = new THREE.MeshStandardMaterial({
    color: 0xffe2a0, roughness: 0.3,
    emissive: new THREE.Color(0xffc45e), emissiveIntensity: 0
  });
  const bellBtn = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8), bellBtnMat);
  bellBtn.position.z = 0.05;
  doorbell.add(bellBtn);
  const bellHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex(), color: 0xffd27a, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0
  }));
  bellHalo.scale.set(0.9, 0.9, 1);
  bellHalo.position.z = 0.06;
  doorbell.add(bellHalo);
  doorbell.position.set(0.95, 1.25, D / 2 + 0.1);
  doorbell.userData = { kind: 'doorbell', house: index, btnMat: bellBtnMat, halo: bellHalo, hitRadius: 0.45, base: doorbell.position.clone() };
  root.add(doorbell);

  // --- porch light ---
  const porchLampMat = new THREE.MeshStandardMaterial({
    color: 0xfff0cc, roughness: 0.3, transparent: true, opacity: 0.85,
    emissive: new THREE.Color(WARM), emissiveIntensity: 0
  });
  const porchLamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), porchLampMat);
  porchLamp.position.set(-0.95, 1.95, D / 2 + 0.12);
  root.add(porchLamp);
  const porchHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex(), color: 0xffb35e, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0
  }));
  porchHalo.scale.set(3.2, 3.2, 1);
  porchHalo.position.copy(porchLamp.position);
  root.add(porchHalo);
  const porchLight = new THREE.PointLight(0xffa94e, 0, 13, 2);
  porchLight.visible = false;
  porchLight.position.set(0, 2.3, D / 2 + 1.4);
  root.add(porchLight);

  // --- lanterns on porch steps ---
  const lanterns = [];
  const l1 = makeJackOLantern(0.95, index % 4);
  l1.position.set(-1.45, 0.62, D / 2 + 2.0);
  root.add(l1); lanterns.push(l1);
  const l2 = makeJackOLantern(0.62, (index + 2) % 4);
  l2.position.set(1.5, 0.45, D / 2 + 2.05);
  root.add(l2); lanterns.push(l2);

  // --- resident ---
  let resident = null;
  if (st.resident) {
    resident = makeResident(st.resident);
    resident.position.set(0, 0.22, D / 2 - 0.55);
    resident.visible = false;
    resident.userData.kind = 'resident';
    resident.userData.house = index;
    resident.userData.hitRadius = 0.8;
    root.add(resident);
  }

  // porch approach spot in world space (in front of the steps)
  const local = new THREE.Vector3(-0.55, 0, D / 2 + 2.9);
  const porchSpot = local.clone().applyEuler(new THREE.Euler(0, facing, 0)).add(position);
  porchSpot.y = 0;

  const doorWorld = new THREE.Vector3(0, 1.1, D / 2).applyEuler(new THREE.Euler(0, facing, 0)).add(position);

  const h = {
    index, root, style: st, isHome,
    doorbell, doorPivot, doorGlow, doorLight, porchLampMat, porchHalo, porchLight,
    winMat, lanterns, resident, porchSpot, doorWorld,
    position: position.clone(), facing,
    lit: 0, litTarget: 0,
    doorOpen: 0, doorTarget: 0,
    bellGlow: 0, bellTarget: 0,
    bellShake: 0,
    residentOut: 0, residentTarget: 0,
    windowFlash: 0,
    pulseBoost: 0,
    hitRadius: 4.0
  };

  bodyMesh.userData = { kind: 'house', house: index };
  roofMesh.userData = { kind: 'house', house: index };
  woodMesh.userData = { kind: 'house', house: index };
  winMesh.userData = { kind: 'house', house: index };
  door.userData = { kind: 'house', house: index };

  h.pickMeshes = [bodyMesh, roofMesh, woodMesh, winMesh, door];
  return h;
}

export function setHouseLit(h, on) {
  h.litTarget = on ? 1 : 0;
  for (const l of h.lanterns) l.userData.target = on ? 1 : 0;
}

export function updateHouse(h, dt, t) {
  h.lit += (h.litTarget - h.lit) * Math.min(1, dt * 2.0);
  const pulse = 0.85 + 0.15 * Math.sin(t * 1.6 + h.index * 0.7) + h.pulseBoost * 0.35 * Math.sin(t * 5.2);
  h.pulseBoost = Math.max(0, h.pulseBoost - dt * 0.5);
  const v = h.lit * pulse;

  h.porchLampMat.emissiveIntensity = v * 2.4;
  h.porchHalo.material.opacity = v * 0.5;
  // only lit houses carry a real light, to keep the shader light count tiny
  h.porchLight.visible = h.litTarget > 0.5;
  h.porchLight.intensity = v * 11.0;
  h.winMat.emissiveIntensity = v * 0.5 + h.windowFlash * 1.6;
  h.windowFlash = Math.max(0, h.windowFlash - dt * 2.2);

  for (const l of h.lanterns) updateLantern(l, dt, t);

  // door
  h.doorOpen += (h.doorTarget - h.doorOpen) * Math.min(1, dt * 2.2);
  h.doorPivot.rotation.y = h.doorOpen * 1.5;
  h.doorGlow.material.opacity = h.doorOpen * 0.55;
  h.doorLight.visible = h.doorTarget > 0.5 || h.doorOpen > 0.02;
  h.doorLight.intensity = h.doorOpen * 8.0;

  // doorbell
  h.bellGlow += (h.bellTarget - h.bellGlow) * Math.min(1, dt * 3.5);
  const bp = 0.6 + 0.4 * Math.sin(t * 4.4);
  h.doorbell.userData.btnMat.emissiveIntensity = h.bellGlow * (1.2 + bp * 2.2);
  h.doorbell.userData.halo.material.opacity = h.bellGlow * (0.25 + bp * 0.45);
  h.bellShake = Math.max(0, h.bellShake - dt * 2.0);
  const wob = h.bellGlow * 0.012 * Math.sin(t * 13) + h.bellShake * 0.05 * Math.sin(t * 40);
  h.doorbell.position.x = h.doorbell.userData.base.x + wob;
  h.doorbell.position.y = h.doorbell.userData.base.y + wob * 0.6;

  // resident
  if (h.resident) {
    h.residentOut += (h.residentTarget - h.residentOut) * Math.min(1, dt * 3.0);
    const r = h.resident;
    r.visible = h.residentOut > 0.01;
    const ud = r.userData;
    ud.t += dt;
    r.position.z = (4.6 / 2 - 0.55) + h.residentOut * 0.85;
    ud.hop = Math.max(0, ud.hop - dt * 1.6);
    const hop = Math.abs(Math.sin(ud.t * 9)) * ud.hop * 0.28;
    r.position.y = 0.22 + hop + Math.sin(ud.t * 1.7) * 0.02 * h.residentOut;
    r.rotation.y = Math.sin(ud.t * 1.2) * 0.12;
    if (ud.waving > 0) {
      ud.waving -= dt;
      ud.arms[1].rotation.z = -1.5 + Math.sin(ud.t * 12) * 0.4;
      ud.arms[1].rotation.x = -0.3;
    } else {
      ud.arms[1].rotation.z += (0.18 - ud.arms[1].rotation.z) * Math.min(1, dt * 4);
      ud.arms[1].rotation.x += (0 - ud.arms[1].rotation.x) * Math.min(1, dt * 4);
    }
    ud.arms[0].rotation.z = -0.18 + Math.sin(ud.t * 1.5) * 0.06;
    if (ud.kind === 'ghost') {
      r.position.y += Math.sin(ud.t * 2.2) * 0.07 * h.residentOut;
    }
  }
}
