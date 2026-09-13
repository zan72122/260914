import * as THREE from 'three';
import { Scalable } from './Scalable';
import { flat } from './textures';
import { islandHeightAt } from './Island';
import { rand } from '../../util/math';
import type { Synth } from '../../audio/Synth';

type NutState = 'on' | 'fall' | 'rest' | 'back';
interface Nut {
  mesh: THREE.Mesh;
  state: NutState;
  vel: THREE.Vector3;
  home: THREE.Vector3;
  timer: number;
  splashed: boolean;
}
type BirdState = 'perch' | 'fly' | 'return';
interface Bird {
  group: THREE.Group;
  wings: THREE.Mesh[];
  state: BirdState;
  home: THREE.Vector3;
  angle: number;
  from: THREE.Vector3;
  timer: number;
  side: number;
}

/**
 * ヤシの木。大きくするとヤシの実が落ちて転がり、小さくすると鳥が飛び立つ。
 * 落ちた実と飛ぶ鳥は木の伸縮の影響を受けないよう、回転盤(world)の子になる。
 */
export class Tree extends Scalable {
  private readonly nuts: Nut[] = [];
  private readonly birds: Bird[] = [];
  private readonly world: THREE.Group;
  private readonly synth: Synth;
  private dropTimer = 0;
  seaLevel = 0.8;

  constructor(world: THREE.Group, synth: Synth) {
    super(0.4, 2.0, 1.15, 1.0);
    this.world = world;
    this.synth = synth;

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.17, 1.25, 7), flat(0x9c6b3f));
    trunk.position.y = 0.62;
    trunk.rotation.z = 0.08;
    trunk.castShadow = true;
    this.add(trunk);

    const leafMat = flat(0x5fbf6a);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), leafMat);
    crown.position.set(0.05, 1.45, 0);
    crown.scale.set(1.2, 0.7, 1.2);
    crown.castShadow = true;
    this.add(crown);
    const crown2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), flat(0x77d180));
    crown2.position.set(0.0, 1.72, 0.05);
    crown2.castShadow = true;
    this.add(crown2);

    // ヤシの実
    const nutMat = flat(0x6d4c2f);
    const spots = [
      [0.32, 1.22, 0.2],
      [-0.25, 1.2, 0.28],
      [0.05, 1.18, -0.36],
    ];
    for (const [x, y, z] of spots) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), nutMat);
      m.position.set(x, y, z);
      m.castShadow = true;
      this.add(m);
      this.nuts.push({
        mesh: m,
        state: 'on',
        vel: new THREE.Vector3(),
        home: new THREE.Vector3(x, y, z),
        timer: 0,
        splashed: false,
      });
    }

    // 鳥
    const bodyMat = flat(0xffffff);
    const beakMat = flat(0xff9f43);
    const perches = [
      [0.55, 1.85, 0.2, 1],
      [-0.5, 1.8, -0.15, -1],
    ];
    for (const [x, y, z, side] of perches) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), bodyMat);
      body.scale.set(1.3, 1, 1);
      g.add(body);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 4), beakMat);
      beak.rotation.z = -Math.PI / 2;
      beak.position.x = 0.14;
      g.add(beak);
      const wings: THREE.Mesh[] = [];
      for (const s of [1, -1]) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.015, 0.16), bodyMat);
        w.position.set(0, 0.03, s * 0.1);
        g.add(w);
        wings.push(w);
      }
      g.position.set(x, y, z);
      g.rotation.y = side > 0 ? 0.3 : Math.PI - 0.3;
      this.add(g);
      this.birds.push({
        group: g,
        wings,
        state: 'perch',
        home: new THREE.Vector3(x, y, z),
        angle: 0,
        from: new THREE.Vector3(),
        timer: 0,
        side,
      });
    }
  }

  protected onUpdate(dt: number, t: number): void {
    this.updateNuts(dt, t);
    this.updateBirds(dt, t);
  }

  private toWorldFrame(obj: THREE.Object3D, out: THREE.Vector3): void {
    obj.getWorldPosition(out);
    this.world.worldToLocal(out);
  }

  private updateNuts(dt: number, t: number): void {
    const big = this.value >= 1.5;
    const small = this.value < 1.3;
    this.dropTimer -= dt;
    const tmp = new THREE.Vector3();
    for (const n of this.nuts) {
      if (n.state === 'on' && big && this.dropTimer <= 0) {
        // 木から離して回転盤の子にする
        this.toWorldFrame(n.mesh, tmp);
        this.remove(n.mesh);
        this.world.add(n.mesh);
        n.mesh.position.copy(tmp);
        n.mesh.scale.setScalar(this.value * 0.95);
        n.vel.set(rand(-0.4, 0.4), 0.5, rand(-0.4, 0.4));
        n.state = 'fall';
        n.splashed = false;
        this.dropTimer = 0.3;
        continue;
      }
      if (n.state === 'fall' || n.state === 'rest') {
        if (small) {
          n.state = 'back';
          n.timer = 0;
          continue;
        }
      }
      if (n.state === 'fall') {
        const p = n.mesh.position;
        n.vel.y -= 9 * dt;
        p.addScaledVector(n.vel, dt);
        const r = n.mesh.scale.x * 0.13;
        const ground = islandHeightAt(p.x, p.z) + r;
        const water = this.seaLevel - r * 0.6;
        if (ground < water) {
          // 海に落ちた: 浮かぶ
          if (p.y < water) {
            if (!n.splashed) {
              this.synth.splash();
              n.splashed = true;
            }
            p.y = water;
            n.vel.set(0, 0, 0);
            n.state = 'rest';
          }
        } else if (p.y < ground) {
          p.y = ground;
          if (Math.abs(n.vel.y) > 1.2) this.synth.thud();
          n.vel.y *= -0.35;
          // 斜面を転がる
          const eps = 0.05;
          const gx = (islandHeightAt(p.x + eps, p.z) - islandHeightAt(p.x - eps, p.z)) / (2 * eps);
          const gz = (islandHeightAt(p.x, p.z + eps) - islandHeightAt(p.x, p.z - eps)) / (2 * eps);
          n.vel.x -= gx * 6 * dt;
          n.vel.z -= gz * 6 * dt;
          n.vel.x *= 0.995;
          n.vel.z *= 0.995;
          if (n.vel.lengthSq() < 0.02 && Math.hypot(gx, gz) < 0.05) n.state = 'rest';
        }
        n.mesh.rotation.x += n.vel.z * dt * 6;
        n.mesh.rotation.z -= n.vel.x * dt * 6;
        const rr = Math.hypot(p.x, p.z);
        if (rr > 3.85) {
          p.multiplyScalar(3.85 / rr);
          n.vel.x *= -0.3;
          n.vel.z *= -0.3;
        }
      } else if (n.state === 'rest') {
        const p = n.mesh.position;
        const r = n.mesh.scale.x * 0.13;
        const water = this.seaLevel - r * 0.6;
        if (islandHeightAt(p.x, p.z) + r < water) {
          p.y = water + 0.02 * Math.sin(t * 2 + p.x);
        } else if (p.y > islandHeightAt(p.x, p.z) + r + 0.01) {
          n.state = 'fall';
        }
      } else if (n.state === 'back') {
        n.timer += dt;
        const k = 1 - Math.min(1, n.timer / 0.35);
        n.mesh.scale.setScalar(this.value * 0.95 * k);
        if (n.timer >= 0.35) {
          this.world.remove(n.mesh);
          this.add(n.mesh);
          n.mesh.position.copy(n.home);
          n.mesh.rotation.set(0, 0, 0);
          n.mesh.scale.setScalar(1);
          n.state = 'on';
        }
      }
    }
  }

  private updateBirds(dt: number, t: number): void {
    const small = this.value < 0.7;
    const calm = this.value > 0.95;
    const tmp = new THREE.Vector3();
    for (const b of this.birds) {
      const flap = b.state === 'perch' ? 0.1 * Math.sin(t * 3) : Math.sin(t * 22 + b.side) * 0.9;
      b.wings[0].rotation.x = -flap;
      b.wings[1].rotation.x = flap;

      if (b.state === 'perch' && small) {
        this.toWorldFrame(b.group, tmp);
        this.remove(b.group);
        this.world.add(b.group);
        b.group.position.copy(tmp);
        b.group.scale.setScalar(1);
        b.angle = Math.atan2(tmp.z, tmp.x);
        b.state = 'fly';
        b.timer = 0;
        this.synth.chirp();
        this.synth.whoosh();
      } else if (b.state === 'fly') {
        b.timer += dt;
        b.angle += dt * 1.1 * b.side;
        const r = Math.min(3.2, 1 + b.timer * 1.2);
        const h = Math.min(3.4, 2 + b.timer * 0.8) + 0.25 * Math.sin(t * 2 + b.side);
        const p = b.group.position;
        const nx = Math.cos(b.angle) * r;
        const nz = Math.sin(b.angle) * r;
        b.group.rotation.y = Math.atan2(-(nz - p.z), nx - p.x);
        p.set(nx, h, nz);
        if (calm) {
          b.state = 'return';
          b.timer = 0;
          b.from.copy(p);
        }
      } else if (b.state === 'return') {
        b.timer += dt;
        const k = Math.min(1, b.timer / 1.6);
        const e = k * k * (3 - 2 * k);
        // 止まり木の現在位置(回転盤座標)
        tmp.copy(b.home);
        this.localToWorld(tmp);
        this.world.worldToLocal(tmp);
        const p = b.group.position;
        const nx = b.from.x + (tmp.x - b.from.x) * e;
        const nz = b.from.z + (tmp.z - b.from.z) * e;
        b.group.rotation.y = Math.atan2(-(nz - p.z), nx - p.x);
        p.set(nx, b.from.y + (tmp.y - b.from.y) * e + Math.sin(k * Math.PI) * 0.8, nz);
        if (k >= 1) {
          this.world.remove(b.group);
          this.add(b.group);
          b.group.position.copy(b.home);
          b.group.rotation.y = b.side > 0 ? 0.3 : Math.PI - 0.3;
          b.state = 'perch';
        }
      }
    }
  }
}
