import * as THREE from 'three';

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const damp = (cur: number, target: number, lambda: number, dt: number): number =>
  THREE.MathUtils.damp(cur, target, lambda, dt);

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  grow: number;
  gravity: number;
}

/** Cheap particle puffs: smoke, sparkles, dust. */
export class Particles {
  group = new THREE.Group();
  private pool: Particle[] = [];
  private smokeGeo = new THREE.SphereGeometry(1, 8, 6);
  private starGeo = new THREE.OctahedronGeometry(1, 0);
  private smokeMat = new THREE.MeshLambertMaterial({ color: 0xf4f1ea, transparent: true, opacity: 0.8 });
  private dustMat = new THREE.MeshLambertMaterial({ color: 0xc9b59a, transparent: true, opacity: 0.7 });
  private starMats = [0xffe066, 0xff8fb1, 0x8fd3ff, 0xb8ff8f].map(
    (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 1 }),
  );

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  private spawn(geo: THREE.BufferGeometry, mat: THREE.Material, pos: THREE.Vector3, vel: THREE.Vector3, size: number, life: number, grow: number, gravity: number): void {
    const mesh = new THREE.Mesh(geo, mat.clone());
    mesh.position.copy(pos);
    mesh.scale.setScalar(size);
    this.group.add(mesh);
    this.pool.push({ mesh, vel, life, maxLife: life, grow, gravity });
  }

  smoke(pos: THREE.Vector3, speed: number): void {
    const vel = new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.9 + speed * 0.3, (Math.random() - 0.5) * 0.3);
    this.spawn(this.smokeGeo, this.smokeMat, pos, vel, 0.12, 1.4, 0.35, 0);
  }

  sparkle(pos: THREE.Vector3, count = 10): void {
    for (let i = 0; i < count; i++) {
      const vel = new THREE.Vector3((Math.random() - 0.5) * 2.4, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 2.4);
      const mat = this.starMats[i % this.starMats.length];
      this.spawn(this.starGeo, mat, pos, vel, 0.1 + Math.random() * 0.08, 0.9 + Math.random() * 0.4, -0.05, -4);
    }
  }

  dust(pos: THREE.Vector3, count = 6): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const vel = new THREE.Vector3(Math.cos(a) * 1.2, 0.5, Math.sin(a) * 1.2);
      this.spawn(this.smokeGeo, this.dustMat, pos, vel, 0.08, 0.5, 0.2, -3);
    }
  }

  update(dt: number): void {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const p = this.pool[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.group.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.pool.splice(i, 1);
        continue;
      }
      p.vel.y += p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.scale.addScalar(p.grow * dt);
      if (p.mesh.scale.x < 0.01) p.mesh.scale.setScalar(0.01);
      const m = p.mesh.material as THREE.MeshBasicMaterial;
      m.opacity = Math.min(1, p.life / p.maxLife) * 0.9;
      p.mesh.rotation.y += dt * 4;
    }
  }
}

/** Colours used across the toy world. */
export const PALETTE = {
  felt: 0x7fb069,
  feltDark: 0x6b9a58,
  table: 0x8b5e3c,
  tableEdge: 0x6e4527,
  wood: 0xd9b382,
  woodDark: 0xb08d5e,
  rail: 0x8a6a44,
  loco: 0xe0524f,
  car1: 0x3d6fb6,
  car2: 0xf2c14e,
  wheel: 0x3b3b3b,
  white: 0xf2efe8,
  glow: 0xffe27a,
};

export function toy(color: number, opts: { flat?: boolean } = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: opts.flat ?? false });
}
