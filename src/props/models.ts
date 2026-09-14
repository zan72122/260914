import * as THREE from 'three';
import { PALETTE, toy } from '../fx/fx';

export type PropType = 'tree' | 'pine' | 'house' | 'cow' | 'sheep' | 'dog' | 'station' | 'flower';
export const PROP_TYPES: PropType[] = ['tree', 'pine', 'house', 'station', 'cow', 'sheep', 'dog', 'flower'];

const trunkMat = toy(PALETTE.woodDark);
const leafMat = toy(0x5aa54a);
const leafMat2 = toy(0x8ccf5a);
const pineMat = toy(0x2f7d4f);
const wallMat = toy(0xf6e6c8);
const roofMat = toy(0xd9534f);
const roofMat2 = toy(0x4b7bd6);
const doorMat = toy(0x8a5a2b);
const cowMat = toy(0xf7f3ea);
const spotMat = toy(0x3a3a3a);
const pinkMat = toy(0xf4a6b8);
const sheepMat = toy(0xfbf8f2);
const sheepFace = toy(0x3a3a3a);
const dogMat = toy(0xc98a4b);
const stoneMat = toy(0xbfb8ab);
const stationRoof = toy(0x3d8b6e);
const petalMats = [0xff6b8a, 0xffd166, 0x7fb7ff, 0xffffff].map((c) => toy(c));

function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

export function buildProp(type: PropType, seed = Math.random()): THREE.Group {
  const g = new THREE.Group();
  g.name = 'prop';
  g.userData.type = type;
  switch (type) {
    case 'tree': {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.5, 8), trunkMat);
      trunk.position.y = 0.25;
      g.add(trunk);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), seed > 0.5 ? leafMat : leafMat2);
      crown.position.y = 0.85;
      crown.scale.set(1, 0.9, 1);
      g.add(crown);
      const crown2 = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), leafMat2);
      crown2.position.set(0.25, 1.05, 0.15);
      g.add(crown2);
      break;
    }
    case 'pine': {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.4, 8), trunkMat);
      trunk.position.y = 0.2;
      g.add(trunk);
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.5 - i * 0.12, 0.55, 9), pineMat);
        cone.position.y = 0.55 + i * 0.32;
        g.add(cone);
      }
      break;
    }
    case 'house': {
      const walls = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.9), wallMat);
      walls.position.y = 0.35;
      g.add(walls);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.55, 4), seed > 0.5 ? roofMat : roofMat2);
      roof.rotation.y = Math.PI / 4;
      roof.position.y = 0.97;
      g.add(roof);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.34, 0.04), doorMat);
      door.position.set(0, 0.17, 0.46);
      g.add(door);
      for (const x of [-0.3, 0.3]) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.04), toy(PALETTE.glow));
        w.position.set(x, 0.42, 0.46);
        g.add(w);
      }
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.16), roofMat);
      chimney.position.set(0.3, 1.05, -0.2);
      g.add(chimney);
      break;
    }
    case 'cow': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.42, 0.42), cowMat);
      body.position.y = 0.5;
      g.add(body);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), cowMat);
      head.position.set(0.5, 0.62, 0);
      g.add(head);
      const nose = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.22), pinkMat);
      nose.position.set(0.66, 0.55, 0);
      g.add(nose);
      for (const [x, z, s] of [[-0.2, 0.1, 0.22], [0.15, -0.12, 0.16]]) {
        const spot = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), spotMat);
        spot.position.set(x, 0.62, z * 1.2);
        spot.scale.set(1, 0.6, 1);
        g.add(spot);
      }
      for (const x of [-0.28, 0.28]) for (const z of [-0.14, 0.14]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.12), spotMat);
        leg.position.set(x, 0.15, z);
        g.add(leg);
      }
      for (const z of [-0.14, 0.14]) {
        const ear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.14), pinkMat);
        ear.position.set(0.42, 0.78, z * 1.6);
        g.add(ear);
      }
      break;
    }
    case 'sheep': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), sheepMat);
      body.position.y = 0.42;
      body.scale.set(1.3, 1, 1);
      g.add(body);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.2), sheepFace);
      head.position.set(0.4, 0.5, 0);
      g.add(head);
      for (const x of [-0.18, 0.18]) for (const z of [-0.12, 0.12]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.08), sheepFace);
        leg.position.set(x, 0.12, z);
        g.add(leg);
      }
      break;
    }
    case 'dog': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.24), dogMat);
      body.position.y = 0.32;
      g.add(body);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), dogMat);
      head.position.set(0.32, 0.5, 0);
      g.add(head);
      const snout = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.14), spotMat);
      snout.position.set(0.46, 0.44, 0);
      g.add(snout);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.06), dogMat);
      tail.position.set(-0.32, 0.45, 0);
      tail.rotation.z = 0.7;
      tail.name = 'tail';
      g.add(tail);
      for (const x of [-0.16, 0.16]) for (const z of [-0.08, 0.08]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.08), dogMat);
        leg.position.set(x, 0.1, z);
        g.add(leg);
      }
      for (const z of [-0.1, 0.1]) {
        const ear = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.05), spotMat);
        ear.position.set(0.28, 0.6, z * 1.4);
        g.add(ear);
      }
      break;
    }
    case 'station': {
      // Platform along X, track runs beside it on -Z side.
      const platform = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 0.9), stoneMat);
      platform.position.set(0, 0.11, 0);
      g.add(platform);
      const hut = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.5), wallMat);
      hut.position.set(0, 0.52, 0.18);
      g.add(hut);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 0.8), stationRoof);
      roof.position.set(0, 0.95, 0.15);
      g.add(roof);
      for (const x of [-1.0, 1.0]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.75, 8), trunkMat);
        post.position.set(x, 0.58, -0.3);
        g.add(post);
      }
      const bell = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 10), toy(PALETTE.car2));
      bell.position.set(0.8, 0.82, -0.3);
      bell.name = 'bell';
      g.add(bell);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.04), doorMat);
      door.position.set(0, 0.37, -0.08);
      g.add(door);
      break;
    }
    case 'flower': {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 6), leafMat);
      stem.position.y = 0.17;
      g.add(stem);
      const mat = petalMats[Math.floor(seed * petalMats.length) % petalMats.length];
      for (let i = 0; i < 5; i++) {
        const petal = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat);
        const a = (i / 5) * Math.PI * 2;
        petal.position.set(Math.cos(a) * 0.11, 0.38, Math.sin(a) * 0.11);
        g.add(petal);
      }
      const center = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), toy(PALETTE.car2));
      center.position.y = 0.4;
      g.add(center);
      break;
    }
  }
  return shadowed(g);
}

/** Radius used for "don't put it on the rails" checks and drop spacing. */
export function propRadius(type: PropType): number {
  switch (type) {
    case 'station':
      return 1.2;
    case 'house':
      return 0.7;
    case 'flower':
      return 0.15;
    case 'sheep':
    case 'dog':
      return 0.3;
    default:
      return 0.45;
  }
}

const dollColors = [0xe0524f, 0x3d6fb6, 0xf2c14e, 0x7bc96f, 0xb07cc6];

/** Peg-doll passenger. */
export function buildDoll(i: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'doll';
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.24, 10), toy(dollColors[i % dollColors.length]));
  body.position.y = 0.12;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), toy(0xf5d7b5));
  head.position.y = 0.33;
  g.add(head);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 6), toy(0xf5d7b5));
  arm.position.set(0.13, 0.25, 0);
  arm.rotation.z = -0.4;
  arm.name = 'arm';
  g.add(arm);
  return shadowed(g);
}
