import * as THREE from 'three';
import { DISC_RADIUS } from './Island';

/** 月の大きさに追従して上下する海。頂点を揺らして波にする */
export class Sea extends THREE.Mesh {
  level = 0.8;
  private readonly base: Float32Array;
  private readonly radii: Float32Array;
  private readonly angles: Float32Array;

  constructor() {
    const geo = new THREE.RingGeometry(0.02, DISC_RADIUS - 0.02, 64, 12);
    geo.rotateX(-Math.PI / 2);
    super(
      geo,
      new THREE.MeshStandardMaterial({
        color: 0x4fb3e0,
        transparent: true,
        opacity: 0.72,
        flatShading: true,
        roughness: 0.35,
        metalness: 0.05,
        depthWrite: false,
      }),
    );
    const pos = geo.attributes.position as THREE.BufferAttribute;
    this.base = new Float32Array(pos.array as Float32Array);
    this.radii = new Float32Array(pos.count);
    this.angles = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      this.radii[i] = Math.hypot(x, z);
      this.angles[i] = Math.atan2(z, x);
    }
    this.receiveShadow = true;
    this.renderOrder = 2;
  }

  update(t: number): void {
    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const r = this.radii[i];
      const a = this.angles[i];
      const y = 0.03 * Math.sin(r * 3.1 - t * 2.2) + 0.02 * Math.sin(a * 4 + t * 1.7 + r);
      pos.setY(i, this.base[i * 3 + 1] + y);
    }
    pos.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.position.y = this.level;
  }
}
