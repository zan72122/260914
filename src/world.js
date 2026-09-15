import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';
import { createHouse, HOUSE_STYLES, setHouseLit, updateHouse, resetHouse } from './house.js';
import * as Toys from './toys.js';
import { rand } from './rng.js';

const UP = new THREE.Vector3(0, 1, 0);

export const ROAD_POINTS = [
  new THREE.Vector3(0, 0, 16),
  new THREE.Vector3(1.5, 0, 4),
  new THREE.Vector3(-2.0, 0, -12),
  new THREE.Vector3(1.0, 0, -30),
  new THREE.Vector3(4.5, 0, -48),
  new THREE.Vector3(0.5, 0, -66),
  new THREE.Vector3(-4.0, 0, -84),
  new THREE.Vector3(-1.0, 0, -102),
  new THREE.Vector3(0.0, 0, -118)
];

export class World {
  constructor(scene) {
    this.scene = scene;
    this.curve = new THREE.CatmullRomCurve3(ROAD_POINTS, false, 'catmullrom', 0.4);
    this.toys = [];
    this.pickables = [];
    this.houses = [];
    this.time = 0;
    this.build();
  }

  pointAt(t) { return this.curve.getPointAt(Math.max(0, Math.min(1, t))); }
  tangentAt(t) { return this.curve.getTangentAt(Math.max(0, Math.min(1, t))).normalize(); }
  rightAt(t) { return this.tangentAt(t).clone().cross(UP).normalize(); }
  offsetPoint(t, lateral) { return this.pointAt(t).clone().addScaledVector(this.rightAt(t), lateral); }

  /** find the curve parameter nearest to a world point */
  nearestT(p) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i <= 160; i++) {
      const t = i / 160;
      const d = this.pointAt(t).distanceToSquared(p);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  build() {
    this.buildSky();
    this.buildGround();
    this.buildRoad();
    this.buildLamps();
    this.buildTrees();
    this.buildHouses();
    this.buildFog();
  }

  // ---------------------------------------------------------------- sky
  buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(320, 24, 16),
      new THREE.MeshBasicMaterial({ map: T.skyTexture(), side: THREE.BackSide, depthWrite: false, fog: false })
    );
    sky.renderOrder = -10;
    this.scene.add(sky);
    this.sky = sky;

    // stars
    const N = 1400;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const siz = new Float32Array(N);
    this.starPhase = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const u = rand() * Math.PI * 2;
      const v = rand();
      const y = Math.pow(v, 0.55);
      const r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(u) * r * 300;
      pos[i * 3 + 1] = y * 300 + 8;
      pos[i * 3 + 2] = Math.sin(u) * r * 300;
      const tint = 0.75 + rand() * 0.25;
      col[i * 3] = tint; col[i * 3 + 1] = tint * (0.9 + rand() * 0.1); col[i * 3 + 2] = 1;
      siz[i] = 0.5 + rand();
      this.starPhase[i] = rand() * 6.28;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.starGeo = g;
    this.starBase = col.slice();
    const stars = new THREE.Points(g, new THREE.PointsMaterial({
      size: 2.8, map: T.starTexture(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, vertexColors: true, sizeAttenuation: false, fog: false
    }));
    stars.renderOrder = -9;
    this.scene.add(stars);
    this.stars = stars;

    // moon
    const moonGroup = new THREE.Group();
    const moonDir = new THREE.Vector3(-0.16, 0.24, -0.96).normalize();
    moonGroup.position.copy(moonDir).multiplyScalar(240);
    const moonMat = new THREE.MeshBasicMaterial({
      map: T.moonTexture(), transparent: true, depthWrite: false, fog: false,
      color: 0xdedac6
    });
    const moon = new THREE.Mesh(new THREE.PlaneGeometry(62, 62), moonMat);
    moonGroup.add(moon);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.glowTexture(), color: 0xc8d8ff, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.34, fog: false
    }));
    halo.scale.set(148, 148, 1);
    halo.position.z = -2;
    moonGroup.add(halo);
    // smiling face (hidden until the ending)
    const smileMat = new THREE.MeshBasicMaterial({
      map: T.faceTexture('granny'), transparent: true, depthWrite: false, opacity: 0, fog: false,
      color: 0xb09a6a
    });
    const smile = new THREE.Mesh(new THREE.PlaneGeometry(48, 48), smileMat);
    smile.position.z = 0.6;
    moonGroup.add(smile);
    moonGroup.lookAt(0, 0, 0);
    this.scene.add(moonGroup);
    this.moon = moonGroup;
    this.moonMesh = moon;
    this.moonSmile = smileMat;
    this.moonDir = moonDir;

    // drifting clouds in front of the moon
    const cloudMat = new THREE.MeshBasicMaterial({
      map: T.fogTexture(), transparent: true, depthWrite: false, opacity: 0.34,
      color: 0x6f7fa8, fog: false, blending: THREE.AdditiveBlending
    });
    const clouds = new THREE.Mesh(new THREE.PlaneGeometry(260, 78), cloudMat);
    clouds.position.copy(moonDir).multiplyScalar(268);
    clouds.position.y += 4;
    clouds.lookAt(0, 20, 0);
    clouds.renderOrder = -8;
    this.scene.add(clouds);
    this.clouds = clouds;
    this.cloudMat = cloudMat;
  }

  // ------------------------------------------------------------- ground
  buildGround() {
    const grassMat = new THREE.MeshStandardMaterial({ map: T.grassTexture(), roughness: 1 });
    grassMat.map.repeat.set(48, 96);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 320), grassMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, -50);
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;
  }

  // --------------------------------------------------------------- road
  buildRoad() {
    const SEG = 200;
    const makeRibbon = (halfA, halfB, y) => {
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= SEG; i++) {
        const t = i / SEG;
        const p = this.pointAt(t);
        const r = this.rightAt(t);
        const a = p.clone().addScaledVector(r, halfA);
        const b = p.clone().addScaledVector(r, halfB);
        pos.push(a.x, y, a.z, b.x, y, b.z);
        uv.push(0, t * 30, 1, t * 30);
        if (i < SEG) {
          const o = i * 2;
          idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      const nrm = new Float32Array(pos.length);
      for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setIndex(idx);
      return g;
    };

    const roadMat = new THREE.MeshStandardMaterial({ map: T.asphaltTexture(), roughness: 0.95 });
    roadMat.map.repeat.set(1, 1);
    const road = new THREE.Mesh(makeRibbon(-3.6, 3.6, 0.005), roadMat);
    road.receiveShadow = true;
    this.scene.add(road);

    // dashed centre line
    const dashGeos = [];
    for (let i = 0; i < 46; i++) {
      const t0 = i / 46 + 0.004, t1 = t0 + 0.009;
      const a = this.pointAt(t0), b = this.pointAt(t1);
      const ra = this.rightAt(t0), rb = this.rightAt(t1);
      const pos = [], idx = [], uv = [];
      const w = 0.26;
      const p0 = a.clone().addScaledVector(ra, -w), p1 = a.clone().addScaledVector(ra, w);
      const p2 = b.clone().addScaledVector(rb, -w), p3 = b.clone().addScaledVector(rb, w);
      pos.push(p0.x, 0.02, p0.z, p1.x, 0.02, p1.z, p2.x, 0.02, p2.z, p3.x, 0.02, p3.z);
      uv.push(0, 0, 1, 0, 0, 1, 1, 1);
      idx.push(0, 1, 2, 1, 3, 2);
      const g2 = new THREE.BufferGeometry();
      g2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g2.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g2.setIndex(idx);
      g2.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0,1,0, 0,1,0, 0,1,0, 0,1,0]), 3));
      dashGeos.push(g2);
    }
    const dashes = new THREE.Mesh(mergeGeometries(dashGeos, false),
      new THREE.MeshStandardMaterial({ color: 0x8f8a6a, roughness: 0.85 }));
    this.scene.add(dashes);

    const swMat = new THREE.MeshStandardMaterial({ map: T.sidewalkTexture(), roughness: 0.95 });
    const sw = mergeGeometries([
      makeRibbon(-6.4, -3.6, 0.12),
      makeRibbon(3.6, 6.4, 0.12),
      // curbs
      makeRibbon(-3.68, -3.6, 0.06),
      makeRibbon(3.6, 3.68, 0.06)
    ], false);
    const sidewalk = new THREE.Mesh(sw, swMat);
    sidewalk.receiveShadow = true;
    this.scene.add(sidewalk);
    this.road = road;
    this.sidewalk = sidewalk;
  }

  // -------------------------------------------------------------- trees
  buildTrees() {
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.34, 4.2, 6);
    trunkGeo.translate(0, 2.1, 0);
    const branchGeos = [trunkGeo];
    for (let i = 0; i < 7; i++) {
      const b = new THREE.CylinderGeometry(0.04, 0.11, 1.9, 5);
      const m = new THREE.Matrix4();
      const a = (i / 7) * Math.PI * 2 + 0.4;
      const tilt = 0.7 + rand() * 0.5;
      m.makeRotationFromEuler(new THREE.Euler(Math.cos(a) * tilt, 0, Math.sin(a) * tilt));
      m.setPosition(Math.cos(a) * 0.55, 3.4 + (i % 3) * 0.45, Math.sin(a) * 0.55);
      b.applyMatrix4(m);
      branchGeos.push(b);
      const b2 = new THREE.CylinderGeometry(0.02, 0.06, 1.2, 4);
      const m2 = new THREE.Matrix4();
      m2.makeRotationFromEuler(new THREE.Euler(Math.cos(a + 1) * 1.1, 0, Math.sin(a + 1) * 1.1));
      m2.setPosition(Math.cos(a) * 1.3, 4.3 + (i % 2) * 0.6, Math.sin(a) * 1.3);
      b2.applyMatrix4(m2);
      branchGeos.push(b2);
    }
    const treeGeo = mergeGeometries(branchGeos, false);
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x1a1620, roughness: 1 });
    const COUNT = 34;
    const trees = new THREE.InstancedMesh(treeGeo, treeMat, COUNT);
    trees.castShadow = true;
    const d = new THREE.Object3D();
    for (let i = 0; i < COUNT; i++) {
      const t = 0.02 + (i / COUNT) * 0.98;
      const side = i % 2 ? 1 : -1;
      const lat = side * (15.5 + rand() * 13);
      const p = this.offsetPoint(t + (rand() - 0.5) * 0.02, lat);
      d.position.set(p.x, 0, p.z);
      d.rotation.set(0, rand() * 6.28, 0);
      const s = 0.8 + rand() * 0.75;
      d.scale.set(s, s * (0.9 + rand() * 0.4), s);
      d.updateMatrix();
      trees.setMatrixAt(i, d.matrix);
    }
    this.scene.add(trees);
    this.trees = trees;
  }

  // --------------------------------------------------------- street lamps
  buildLamps() {
    const poleGeos = [];
    const lampSpec = [];
    const T_ = [0.075, 0.245, 0.415, 0.585, 0.755, 0.925];
    T_.forEach((t, i) => {
      const side = i % 2 ? 1 : -1;
      const p = this.offsetPoint(t, side * 6.0);
      const pole = new THREE.CylinderGeometry(0.09, 0.14, 5.0, 7);
      const m = new THREE.Matrix4();
      m.setPosition(p.x, 2.5, p.z);
      pole.applyMatrix4(m);
      poleGeos.push(pole);
      const arm = new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6);
      const m2 = new THREE.Matrix4();
      m2.makeRotationZ(Math.PI / 2 * -side);
      m2.setPosition(p.x - side * 0.5, 4.9, p.z);
      arm.applyMatrix4(m2);
      poleGeos.push(arm);
      lampSpec.push({ x: p.x - side * 1.0, z: p.z, on: i === 2 });
    });
    const poles = new THREE.Mesh(mergeGeometries(poleGeos, false),
      new THREE.MeshStandardMaterial({ color: 0x232330, roughness: 0.85, metalness: 0.3 }));
    poles.castShadow = true;
    this.scene.add(poles);

    this.lamps = [];
    // A lamp is a dark shade with a warm mouth, a soft additive glow and a very
    // faint cone. Nothing here is opaque enough to hide a house behind it.
    const shadeGeo = new THREE.ConeGeometry(0.36, 0.44, 10);
    const mouthGeo = new THREE.CircleGeometry(0.32, 14);
    const coneGeo = new THREE.ConeGeometry(2.7, 4.5, 18, 1, true);
    for (const L of lampSpec) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x2b2b38, roughness: 0.6, metalness: 0.35,
        emissive: new THREE.Color(0xffc070), emissiveIntensity: 0
      });
      const head = new THREE.Mesh(shadeGeo, mat);
      head.position.set(L.x, 4.9, L.z);
      this.scene.add(head);
      if (L.on) {
        const mouthMat = new THREE.MeshBasicMaterial({
          color: 0xffd9a0, transparent: true, opacity: 0.85, depthWrite: false,
          blending: THREE.AdditiveBlending, fog: false
        });
        const mouth = new THREE.Mesh(mouthGeo, mouthMat);
        mouth.rotation.x = Math.PI / 2;
        mouth.position.set(L.x, 4.66, L.z);
        this.scene.add(mouth);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
          map: T.glowTexture(), color: 0xffb968, transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, opacity: 0.4
        }));
        halo.scale.set(3.4, 3.4, 1);
        halo.position.set(L.x, 4.66, L.z);
        this.scene.add(halo);
        const coneMat = new THREE.MeshBasicMaterial({
          color: 0xffb46a, transparent: true, opacity: 0.055, depthWrite: false,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending
        });
        const cone = new THREE.Mesh(coneGeo, coneMat);
        cone.position.set(L.x, 2.42, L.z);
        cone.renderOrder = 1;
        this.scene.add(cone);
        // the pool of light the lamp puts on the pavement
        const poolMat = new THREE.MeshBasicMaterial({
          map: T.glowTexture(), color: 0xffa858, transparent: true, opacity: 0.22,
          depthWrite: false, blending: THREE.AdditiveBlending
        });
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), poolMat);
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(L.x, 0.16, L.z);
        pool.renderOrder = 1;
        this.scene.add(pool);
        const pl = new THREE.PointLight(0xffb060, 5.0, 16, 2);
        pl.position.set(L.x, 4.5, L.z);
        this.scene.add(pl);
        this.lamps.push({ mat, mouthMat, halo, coneMat, poolMat, light: pl, pos: new THREE.Vector3(L.x, 4.7, L.z), flick: rand() * 10 });
      } else {
        this.lamps.push({ mat, halo: null, light: null, flick: rand() * 10, off: true });
      }
    }
  }

  // ------------------------------------------------------------- houses
  buildHouses() {
    // t values along the curve for the 5 visited houses; home is the start
    const spec = [
      { t: 0.045, side: 1, style: 5, home: true },
      { t: 0.165, side: -1, style: 0 },
      { t: 0.335, side: 1, style: 1 },
      { t: 0.505, side: -1, style: 2 },
      { t: 0.675, side: 1, style: 3 },
      { t: 0.845, side: -1, style: 4 }
    ];
    this.houses = [];
    spec.forEach((s, i) => {
      const lat = s.side * 12.0;
      const p = this.offsetPoint(s.t, lat);
      const toRoad = this.pointAt(s.t).clone().sub(p).setY(0).normalize();
      const facing = Math.atan2(toRoad.x, toRoad.z);
      const h = createHouse({
        index: i,
        style: HOUSE_STYLES[s.style],
        position: new THREE.Vector3(p.x, 0, p.z),
        facing,
        isHome: !!s.home
      });
      h.curveT = s.t;
      h.side = s.side;
      // pull the porch spot onto the sidewalk so she stands on pavement
      const sw = this.offsetPoint(s.t, s.side * 5.0);
      h.walkSpot = new THREE.Vector3(sw.x, 0, sw.z);
      h.porchSpot.y = 0;
      this.scene.add(h.root);
      this.houses.push(h);
      for (const m of h.pickMeshes) this.pickables.push(m);
      this.pickables.push(h.doorbell);
      if (h.resident) this.pickables.push(h.resident);
    });
    this.homeHouse = this.houses[0];
    this.buildDecor(spec);
  }

  addToy(toy) {
    this.scene.add(toy.group);
    this.toys.push(toy);
    toy.group.userData.toy = toy;
    toy.group.traverse(o => { if (o.isMesh) o.userData.toy = toy; });
    this.pickables.push(toy.group);
    return toy;
  }

  buildDecor(spec) {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    spec.forEach((s, i) => {
      const h = this.houses[i];
      const f = h.facing;
      const local = (x, y, z) => {
        const v = new THREE.Vector3(x, y, z).applyEuler(new THREE.Euler(0, f, 0)).add(h.position);
        v.y = y;
        return v;
      };
      // a distinct decoration mix per house
      if (i === 0) {
        // home: three costume mannequins out front
        const cs = ['witch', 'ghost', 'cat'];
        cs.forEach((c, k) => {
          this.addToy(Toys.toyMannequin(local(-2.4 + k * 2.4, 0.07, 5.6), c, f + Math.PI));
        });
        this.addToy(Toys.toyPumpkin(local(2.9, 0.5, 4.2), 0.9));
        this.addToy(Toys.toyChime(local(-1.9, 2.3, 3.4)));
      } else if (i === 1) {
        this.addToy(Toys.toyWeb(local(-2.9, 2.0, 2.45), f));
        this.addToy(Toys.toyLeafPile(local(3.2, 0, 4.6)));
        this.addToy(Toys.toyCat(local(-3.6, 0.0, 5.2)));
        this.addToy(Toys.toyCandle(local(1.2, 0.24, 3.5)));
      } else if (i === 2) {
        this.addToy(Toys.toyGhost(local(-2.2, 2.3, 3.6)));
        this.addToy(Toys.toyGhost(local(2.4, 2.5, 3.9)));
        this.addToy(Toys.toySign(local(3.4, 0, 5.4), f + 0.3));
        this.addToy(Toys.toyPumpkin(local(-3.4, 0.45, 5.0), 0.8));
      } else if (i === 3) {
        this.addToy(Toys.toyScarecrow(local(-3.6, 0, 5.0), f));
        this.addToy(Toys.toyPinwheel(local(3.3, 0, 5.2)));
        this.addToy(Toys.toyLeafPile(local(2.2, 0, 6.4)));
        this.addToy(Toys.toyWeb(local(2.9, 2.0, 2.45), f));
      } else if (i === 4) {
        this.addToy(Toys.toyTombstone(local(-3.2, 0, 5.4), f + 0.2));
        this.addToy(Toys.toyTombstone(local(-4.4, 0, 6.6), f - 0.3));
        this.addToy(Toys.toyPumpkin(local(3.2, 0.5, 5.2), 1.0));
        this.addToy(Toys.toyGate(local(0.2, 0, 6.9), f));
      } else {
        this.addToy(Toys.toyGhost(local(2.6, 2.4, 3.7)));
        this.addToy(Toys.toyWeb(local(-2.9, 2.1, 2.45), f));
        this.addToy(Toys.toyCandle(local(-1.3, 0.24, 3.5)));
        this.addToy(Toys.toyCandle(local(1.3, 0.24, 3.5)));
        this.addToy(Toys.toyScarecrow(local(3.6, 0, 5.6), f));
        this.addToy(Toys.toyChime(local(1.9, 2.3, 3.4)));
      }
    });

    // pumpkin patches + stray decorations along the street
    const patchT = [0.10, 0.24, 0.41, 0.58, 0.74, 0.90];
    patchT.forEach((t, i) => {
      const side = i % 2 ? 1 : -1;
      const c = this.offsetPoint(t, side * 7.8);
      for (let k = 0; k < 3; k++) {
        const a = rand() * 6.28, r = rand() * 1.3;
        const p = new THREE.Vector3(c.x + Math.cos(a) * r, 0.34 + rand() * 0.1, c.z + Math.sin(a) * r);
        this.addToy(Toys.toyPumpkin(p, 0.55 + rand() * 0.3));
      }
      const lp = this.offsetPoint(t + 0.03, -side * 7.4);
      this.addToy(Toys.toyLeafPile(new THREE.Vector3(lp.x, 0, lp.z)));
    });

    // street cat wandering near the middle
    const cp = this.offsetPoint(0.44, 6.0);
    this.addToy(Toys.toyCat(new THREE.Vector3(cp.x, 0, cp.z)));
  }

  // ----------------------------------------------------------------- fog
  buildFog() {
    const mat = new THREE.MeshBasicMaterial({
      map: T.fogTexture(), transparent: true, depthWrite: false,
      color: 0x88a0c4, opacity: 0.12, blending: THREE.NormalBlending
    });
    this.fogMat = mat;
    const geos = [];
    const planes = [];
    for (let i = 0; i < 16; i++) {
      const t = (i + 0.5) / 16;
      const p = this.pointAt(t);
      const g = new THREE.PlaneGeometry(52, 3.6);
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set(p.x, 0.75, p.z);
      mesh.renderOrder = 2;
      mesh.userData.phase = rand() * 6.28;
      mesh.userData.baseX = p.x;
      this.scene.add(mesh);
      planes.push(mesh);
    }
    this.fogPlanes = planes;
  }

  update(dt, camera) {
    this.time += dt;
    const t = this.time;
    for (const h of this.houses) updateHouse(h, dt, t);
    for (const toy of this.toys) toy.update(dt, t, this.ctx);

    // twinkling stars
    if (this.starGeo) {
      const col = this.starGeo.attributes.color.array;
      for (let i = 0; i < col.length / 3; i += 1) {
        const f = 0.65 + 0.35 * Math.sin(t * 1.4 + this.starPhase[i] * 5);
        col[i * 3] = this.starBase[i * 3] * f;
        col[i * 3 + 1] = this.starBase[i * 3 + 1] * f;
        col[i * 3 + 2] = this.starBase[i * 3 + 2] * f;
      }
      this.starGeo.attributes.color.needsUpdate = true;
    }

    // fog planes always face the camera, drift slowly
    for (const p of this.fogPlanes) {
      p.userData.phase += dt * 0.12;
      p.position.x = p.userData.baseX + Math.sin(p.userData.phase) * 2.2;
      p.position.y = 0.72 + Math.sin(p.userData.phase * 0.7) * 0.18;
      if (camera) p.quaternion.copy(camera.quaternion);
    }
    if (this.cloudMat) {
      this.cloudMat.map.offset.x = (this.cloudMat.map.offset.x + dt * 0.004) % 1;
    }
    if (this.lamps) {
      for (const L of this.lamps) {
        if (L.off) continue;
        L.flick += dt;
        const f = 0.78 + 0.22 * Math.sin(L.flick * 2.3) + 0.08 * Math.sin(L.flick * 17.7);
        // fade the glow out when the camera walks right past the pole, so a
        // lamp can never wash out or block the house being framed
        let near = 1;
        if (camera) {
          const d = camera.position.distanceTo(L.pos);
          near = Math.max(0, Math.min(1, (d - 3.2) / 5.0));
        }
        L.mat.emissiveIntensity = 0.5 * f * near;
        L.mouthMat.opacity = 0.85 * f * near;
        L.halo.material.opacity = 0.4 * f * near;
        L.coneMat.opacity = 0.055 * f * near;
        L.poolMat.opacity = 0.22 * f;
        L.light.intensity = 5.0 * f;
      }
    }
  }

  /** cold, closed, unvisited - used when a scenario reloads */
  resetHouses() {
    for (const h of this.houses) resetHouse(h);
    for (const t of this.toys) {
      if (t.kind === 'pumpkin') t.group.userData.target = 0.25;
      if (t.kind === 'cat') { t.follow = false; t.group.position.copy(t.home); }
      if (t.kind === 'leafpile') { t.catTimer = 0; t.catOut = 0; }
    }
    this.moonSmile.opacity = 0;
  }

  setLitHouse(index) {
    this.houses.forEach((h, i) => setHouseLit(h, i === index));
  }

  lightAll() {
    this.houses.forEach(h => setHouseLit(h, true));
    this.toys.forEach(t => { if (t.kind === 'pumpkin') t.group.userData.target = 1; });
  }
}
