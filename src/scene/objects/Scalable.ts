import * as THREE from 'three';
import { damp } from '../../util/math';

/**
 * 伸縮できるオブジェクトの共通部分。
 * - 常にわずかに「呼吸」して、触れるものだと分かるようにする
 * - 掴んだ瞬間「ぽよん」と弾む
 * - 当たり判定用に見た目より大きい透明な球を持つ(小さな指でも掴める)
 */
export class Scalable extends THREE.Group {
  /** ゲームロジック上の大きさ(0.4〜2.0) */
  value = 1;
  target = 1;
  grabbed = false;
  readonly minScale: number;
  readonly maxScale: number;
  readonly hitProxy: THREE.Mesh;
  private bouncePhase = -1;
  private readonly phase = Math.random() * Math.PI * 2;

  constructor(minScale: number, maxScale: number, hitRadius: number, hitCenterY = 0) {
    super();
    this.minScale = minScale;
    this.maxScale = maxScale;
    this.hitProxy = new THREE.Mesh(
      new THREE.SphereGeometry(hitRadius, 10, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
    );
    this.hitProxy.position.y = hitCenterY;
    this.hitProxy.userData.owner = this;
    this.add(this.hitProxy);
  }

  bounce(): void {
    this.bouncePhase = 0;
  }

  update(dt: number, t: number): void {
    this.value = damp(this.value, this.target, this.grabbed ? 22 : 8, dt);
    let s = this.value * (1 + 0.02 * Math.sin(t * 2.2 + this.phase));
    if (this.bouncePhase >= 0) {
      this.bouncePhase += dt * 5;
      s *= 1 + 0.16 * Math.sin(this.bouncePhase * Math.PI) * Math.exp(-this.bouncePhase * 1.4);
      if (this.bouncePhase > 2.5) this.bouncePhase = -1;
    }
    this.scale.setScalar(s);
    this.onUpdate(dt, t);
  }

  protected onUpdate(_dt: number, _t: number): void {}
}
