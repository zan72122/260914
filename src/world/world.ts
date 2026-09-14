import * as THREE from 'three';
import { PALETTE, toy } from '../fx/fx';

export const GROUND_HALF = 11; // the felt is a square of side 2*GROUND_HALF

/** Soft room-like sky: pale blue overhead fading to warm cream at the horizon. */
function buildSky(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(90, 24, 16);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0x9fd3f2);
  const horizon = new THREE.Color(0xf7efe2);
  const below = new THREE.Color(0x2b2118);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 90;
    if (y >= 0) c.lerpColors(horizon, top, Math.min(1, y * 1.6));
    else c.lerpColors(horizon, below, Math.min(1, -y * 3));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  mesh.name = 'sky';
  return mesh;
}

export class World {
  scene = new THREE.Scene();
  ground: THREE.Mesh;
  sun: THREE.DirectionalLight;

  constructor() {
    this.scene.background = new THREE.Color(0x2b2118);
    this.scene.add(buildSky());

    const hemi = new THREE.HemisphereLight(0xfff5e0, 0x5c7a4a, 0.85);
    this.scene.add(hemi);

    this.sun = new THREE.DirectionalLight(0xfff2d6, 1.9);
    this.sun.position.set(8, 16, 6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -16;
    cam.right = cam.top = 16;
    cam.near = 1;
    cam.far = 50;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Table
    const table = new THREE.Mesh(new THREE.BoxGeometry(GROUND_HALF * 2 + 10, 1.2, GROUND_HALF * 2 + 10), toy(PALETTE.table));
    table.position.y = -0.62;
    table.receiveShadow = true;
    this.scene.add(table);

    // Felt play mat with a rounded look (slightly raised)
    const feltGeo = new THREE.BoxGeometry(GROUND_HALF * 2, 0.12, GROUND_HALF * 2, 1, 1, 1);
    this.ground = new THREE.Mesh(feltGeo, toy(PALETTE.felt));
    this.ground.position.y = -0.06;
    this.ground.receiveShadow = true;
    this.ground.name = 'ground';
    this.scene.add(this.ground);

    // Subtle stitched border
    const border = new THREE.Mesh(new THREE.BoxGeometry(GROUND_HALF * 2 + 0.4, 0.08, GROUND_HALF * 2 + 0.4), toy(PALETTE.feltDark));
    border.position.y = -0.09;
    border.receiveShadow = true;
    this.scene.add(border);
  }
}
