import * as THREE from 'three';
import { softCircle } from './objects/textures';
import { rand } from '../util/math';
import type { Scalable } from './objects/Scalable';

interface Ring {
  mesh: THREE.Mesh;
  life: number;
  flat: boolean;
}
interface Confetto {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  life: number;
}

/**
 * 文字を使わないフィードバック群:
 * - 光の輪(掴んだ / 触った)
 * - 伸縮ガイド(縦の光の帯 + 上下に流れる粒)
 * - 紙吹雪(柱を見つけた)
 */
export class Effects {
  readonly group = new THREE.Group();
  private readonly rings: Ring[] = [];
  private readonly ringGeo = new THREE.RingGeometry(0.8, 1, 40);
  private readonly ringMatBase = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  private readonly guide = new THREE.Group();
  private readonly guideTrack: THREE.Mesh;
  private readonly guideFill: THREE.Mesh;
  private readonly guideDots: THREE.Points;
  private guideTarget: Scalable | null = null;
  private guideAlpha = 0;
  private readonly guideTmp = new THREE.Vector3();

  private readonly confetti: THREE.InstancedMesh;
  private readonly confetto: Confetto[] = [];
  private readonly dummy = new THREE.Object3D();

  private shimmer = 0;

  constructor() {
    const trackMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.guideTrack = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 1), trackMat);
    this.guideFill = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 1), trackMat.clone());
    (this.guideFill.material as THREE.MeshBasicMaterial).color.set(0xfff0a0);
    this.guide.add(this.guideTrack, this.guideFill);
    const n = 14;
    const p = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.guideDots = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        size: 0.16,
        map: softCircle(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        color: 0xffffff,
      }),
    );
    this.guide.add(this.guideDots);
    this.guide.visible = false;
    this.guide.renderOrder = 10;
    this.group.add(this.guide);

    const count = 180;
    this.confetti = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.11, 0.15),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      count,
    );
    const palette = [0xff6b6b, 0xffd93d, 0x6bcb77, 0x4d96ff, 0xff9ff3, 0xffffff];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      c.set(palette[i % palette.length]);
      this.confetti.setColorAt(i, c);
      this.confetto.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        spin: new THREE.Vector3(),
        life: -1,
      });
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.confetti.setMatrixAt(i, this.dummy.matrix);
    }
    this.confetti.frustumCulled = false;
    this.group.add(this.confetti);
  }

  /** 画面全体のきらめき(0..1) */
  get shimmerAmount(): number {
    return this.shimmer;
  }

  ring(worldPos: THREE.Vector3, color = 0xffffff, size = 1): void {
    const mat = this.ringMatBase.clone();
    mat.color.set(color);
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.position.copy(worldPos);
    mesh.scale.setScalar(0.3 * size);
    mesh.renderOrder = 9;
    this.group.add(mesh);
    this.rings.push({ mesh, life: 0, flat: false });
  }

  /** 海や地面に広がる波紋 */
  ripple(worldPos: THREE.Vector3, color = 0xdff6ff): void {
    const mat = this.ringMatBase.clone();
    mat.color.set(color);
    mat.opacity = 0.6;
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.position.copy(worldPos);
    mesh.position.y += 0.03;
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.setScalar(0.15);
    mesh.renderOrder = 9;
    this.group.add(mesh);
    this.rings.push({ mesh, life: 0, flat: true });
  }

  showGuide(target: Scalable): void {
    this.guideTarget = target;
    this.guide.visible = true;
  }
  hideGuide(): void {
    this.guideTarget = null;
  }

  burst(worldPos: THREE.Vector3): void {
    this.shimmer = 1;
    let n = 0;
    for (const c of this.confetto) {
      if (c.life >= 0) continue;
      c.pos.copy(worldPos);
      const a = Math.random() * Math.PI * 2;
      const s = rand(1.5, 4);
      c.vel.set(Math.cos(a) * s * rand(0.3, 1), rand(4, 8), Math.sin(a) * s * rand(0.3, 1));
      c.rot.set(rand(0, 6), rand(0, 6), rand(0, 6));
      c.spin.set(rand(-6, 6), rand(-6, 6), rand(-6, 6));
      c.life = 0;
      if (++n >= 150) break;
    }
  }

  update(dt: number, t: number, camera: THREE.Camera): void {
    this.shimmer = Math.max(0, this.shimmer - dt * 0.6);

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life += dt;
      const k = r.life / (r.flat ? 0.9 : 0.55);
      r.mesh.scale.setScalar(r.mesh.scale.x + dt * (r.flat ? 2.2 : 3.5));
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 * (1 - k));
      if (!r.flat) r.mesh.quaternion.copy(camera.quaternion);
      if (k >= 1) {
        this.group.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
      }
    }

    // 伸縮ガイド
    const want = this.guideTarget ? 1 : 0;
    this.guideAlpha += (want - this.guideAlpha) * Math.min(1, dt * 12);
    if (this.guideTarget) {
      const tg = this.guideTarget;
      tg.hitProxy.getWorldPosition(this.guideTmp);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      // 画面の右側にある物はガイドを左に出す(画面外に出ない)
      const ndc = this.guideTmp.clone().project(camera);
      if (ndc.x > 0.15) right.negate();
      const radius = (tg.hitProxy.geometry as THREE.SphereGeometry).parameters.radius * tg.scale.x;
      this.guide.position.copy(this.guideTmp).addScaledVector(right, radius + 0.35);
      this.guide.quaternion.copy(camera.quaternion);
      const H = 2.2;
      this.guideTrack.scale.y = H;
      const frac = (tg.value - tg.minScale) / (tg.maxScale - tg.minScale);
      const fh = 0.15 + frac * (H - 0.15);
      this.guideFill.scale.y = fh;
      this.guideFill.position.y = -H / 2 + fh / 2;
      const pos = this.guideDots.geometry.attributes.position as THREE.BufferAttribute;
      const n = pos.count;
      for (let i = 0; i < n; i++) {
        const up = i < n / 2;
        const ph = ((t * 0.7 + i * 0.37) % 1);
        const y = up ? (H / 2 + 0.1 + ph * 0.9) : (-H / 2 - 0.1 - ph * 0.9);
        pos.setXYZ(i, 0.12 * Math.sin(t * 3 + i), y, 0);
      }
      pos.needsUpdate = true;
    }
    (this.guideTrack.material as THREE.MeshBasicMaterial).opacity = 0.28 * this.guideAlpha;
    (this.guideFill.material as THREE.MeshBasicMaterial).opacity = 0.75 * this.guideAlpha;
    (this.guideDots.material as THREE.PointsMaterial).opacity = 0.9 * this.guideAlpha;
    if (this.guideAlpha < 0.01 && !this.guideTarget) this.guide.visible = false;

    // 紙吹雪
    let any = false;
    for (let i = 0; i < this.confetto.length; i++) {
      const c = this.confetto[i];
      if (c.life < 0) continue;
      any = true;
      c.life += dt;
      c.vel.y -= 5 * dt;
      c.vel.multiplyScalar(1 - dt * 1.2);
      c.pos.addScaledVector(c.vel, dt);
      c.rot.x += c.spin.x * dt;
      c.rot.y += c.spin.y * dt;
      c.rot.z += c.spin.z * dt;
      const k = Math.max(0, 1 - Math.max(0, c.life - 2.5) / 1.2);
      this.dummy.position.copy(c.pos);
      this.dummy.rotation.copy(c.rot);
      this.dummy.scale.setScalar(k);
      this.dummy.updateMatrix();
      this.confetti.setMatrixAt(i, this.dummy.matrix);
      if (c.life > 3.7 || c.pos.y < -2) {
        c.life = -1;
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.confetti.setMatrixAt(i, this.dummy.matrix);
      }
    }
    if (any) this.confetti.instanceMatrix.needsUpdate = true;
  }
}
