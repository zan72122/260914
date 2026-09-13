import * as THREE from 'three';
import { Scalable } from './Scalable';
import { flat } from './textures';
import { islandHeightAt } from './Island';
import { rand } from '../../util/math';
import type { Synth } from '../../audio/Synth';

interface Puff {
  mesh: THREE.Mesh;
  life: number;
  vel: THREE.Vector3;
}
type CatState = 'in' | 'out' | 'walk' | 'home';

/**
 * 家。大きくすると煙がたくさん出る。小さくするとドアからネコが出てくる。
 */
export class House extends Scalable {
  private readonly world: THREE.Group;
  private readonly synth: Synth;
  private readonly chimney: THREE.Mesh;
  private readonly door: THREE.Mesh;
  private readonly puffs: Puff[] = [];
  private readonly puffMat: THREE.MeshStandardMaterial;
  private smokeTimer = 0;
  private readonly cat: THREE.Group;
  private readonly tail: THREE.Mesh;
  private catState: CatState = 'in';
  private catAngle = 0;
  private catTimer = 0;
  private readonly catTmp = new THREE.Vector3();

  constructor(world: THREE.Group, synth: Synth) {
    super(0.4, 2.0, 0.95, 0.5);
    this.world = world;
    this.synth = synth;

    const walls = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.55, 0.62), flat(0xfff1d6));
    walls.position.y = 0.275;
    walls.castShadow = true;
    walls.receiveShadow = true;
    this.add(walls);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.42, 4), flat(0xe8705f));
    roof.position.y = 0.75;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    this.add(roof);
    this.chimney = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.12), flat(0xb35a4e));
    this.chimney.position.set(0.2, 0.85, -0.12);
    this.add(this.chimney);
    this.door = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 0.03), flat(0x8a5a3c));
    this.door.position.set(0.12, 0.14, 0.32);
    this.add(this.door);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.03), flat(0xffe27a, { emissive: 0xffb347, emissiveIntensity: 0.6 }));
    win.position.set(-0.18, 0.32, 0.32);
    this.add(win);

    this.puffMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, transparent: true, opacity: 0.7, flatShading: true });
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), this.puffMat.clone());
      m.visible = false;
      world.add(m);
      this.puffs.push({ mesh: m, life: 0, vel: new THREE.Vector3() });
    }

    // ネコ
    const cat = new THREE.Group();
    const fur = flat(0xf6a04d);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.15), fur);
    body.position.y = 0.13;
    cat.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.14, 0.16), fur);
    head.position.set(0.26, 0.2, 0);
    cat.add(head);
    for (const s of [1, -1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 4), fur);
      ear.position.set(0.26, 0.3, s * 0.05);
      cat.add(ear);
    }
    for (const s of [1, -1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.03), flat(0x333333));
      eye.position.set(0.34, 0.22, s * 0.04);
      cat.add(eye);
    }
    this.tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.04), fur);
    this.tail.position.set(-0.28, 0.2, 0);
    this.tail.rotation.z = 0.7;
    cat.add(this.tail);
    for (const [x, z] of [
      [0.15, 0.05],
      [0.15, -0.05],
      [-0.15, 0.05],
      [-0.15, -0.05],
    ]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.05), fur);
      leg.position.set(x, 0.04, z);
      cat.add(leg);
    }
    cat.visible = false;
    cat.castShadow = true;
    world.add(cat);
    this.cat = cat;
  }

  protected onUpdate(dt: number, t: number): void {
    this.updateSmoke(dt);
    this.updateCat(dt, t);
  }

  private updateSmoke(dt: number): void {
    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0) {
      this.smokeTimer = 0.55 / this.value;
      const p = this.puffs.find((q) => !q.mesh.visible);
      if (p) {
        this.chimney.getWorldPosition(p.mesh.position);
        this.world.worldToLocal(p.mesh.position);
        p.mesh.position.y += 0.15 * this.value;
        p.mesh.visible = true;
        p.life = 0;
        p.vel.set(rand(-0.1, 0.1), 0.45 + this.value * 0.2, rand(-0.1, 0.1));
        p.mesh.scale.setScalar(0.6 * this.value);
      }
    }
    for (const p of this.puffs) {
      if (!p.mesh.visible) continue;
      p.life += dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.scale.addScalar(dt * 0.6 * this.value);
      (p.mesh.material as THREE.MeshStandardMaterial).opacity = 0.6 * (1 - p.life / 2.2);
      if (p.life > 2.2) p.mesh.visible = false;
    }
  }

  private updateCat(dt: number, t: number): void {
    const small = this.value < 0.7;
    const back = this.value > 0.95;
    const cat = this.cat;
    this.tail.rotation.z = 0.7 + 0.3 * Math.sin(t * 5);

    if (this.catState === 'in' && small) {
      this.door.getWorldPosition(this.catTmp);
      this.world.worldToLocal(this.catTmp);
      cat.position.copy(this.catTmp);
      cat.position.y = islandHeightAt(cat.position.x, cat.position.z);
      cat.visible = true;
      cat.scale.setScalar(0.01);
      this.catState = 'out';
      this.catTimer = 0;
      this.catAngle = Math.atan2(cat.position.z - this.position.z, cat.position.x - this.position.x);
      this.synth.meow();
    } else if (this.catState === 'out') {
      this.catTimer += dt;
      cat.scale.setScalar(Math.min(1, this.catTimer / 0.4));
      cat.rotation.y = -this.catAngle;
      if (this.catTimer >= 0.4) this.catState = 'walk';
    }
    if (this.catState === 'walk') {
      if (back) {
        this.catState = 'home';
        this.catTimer = 0;
      } else {
        // 家のまわりをぐるぐる歩く
        this.catAngle += dt * 0.9;
        const r = 0.85;
        const nx = this.position.x + Math.cos(this.catAngle) * r;
        const nz = this.position.z + Math.sin(this.catAngle) * r;
        cat.rotation.y = Math.atan2(-(nz - cat.position.z), nx - cat.position.x);
        cat.position.set(nx, islandHeightAt(nx, nz) + 0.04 * Math.abs(Math.sin(t * 9)), nz);
      }
    } else if (this.catState === 'home') {
      this.catTimer += dt;
      this.door.getWorldPosition(this.catTmp);
      this.world.worldToLocal(this.catTmp);
      const k = Math.min(1, this.catTimer / 0.8);
      cat.position.lerp(this.catTmp, k * 0.15);
      cat.position.y = islandHeightAt(cat.position.x, cat.position.z);
      cat.rotation.y = Math.atan2(-(this.catTmp.z - cat.position.z), this.catTmp.x - cat.position.x);
      cat.scale.setScalar(1 - k);
      if (k >= 1) {
        cat.visible = false;
        this.catState = 'in';
      }
    }
  }
}
