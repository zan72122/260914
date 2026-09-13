import * as THREE from 'three';
import { Scalable } from './Scalable';
import { flat, softCircle } from './textures';
import { damp } from '../../util/math';

export class Moon extends Scalable {
  private readonly mat: THREE.MeshStandardMaterial;
  private readonly glow: THREE.Sprite;
  private pulse = 0;
  private pulseTarget = 0;

  constructor() {
    super(0.4, 2.0, 1.6);
    this.mat = flat(0xfff2b8, { emissive: 0xffdd88, emissiveIntensity: 0.55, roughness: 1 });
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), this.mat);
    this.add(body);
    // クレーター
    const cm = flat(0xf0d890, { emissive: 0xd8b860, emissiveIntensity: 0.3 });
    const craters: [number, number, number, number][] = [
      [0.35, 0.4, 0.75, 0.22],
      [-0.5, 0.1, 0.72, 0.16],
      [0.1, -0.5, 0.72, 0.19],
    ];
    for (const [x, y, z, r] of craters) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), cm);
      c.position.set(x, y, z);
      this.add(c);
    }
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: softCircle(),
        color: 0xffe9a8,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.glow.scale.setScalar(3.3);
    this.add(this.glow);
  }

  /** 放置時の誘導: ひとりでにやわらかく明滅 */
  setPulse(on: boolean): void {
    this.pulseTarget = on ? 1 : 0;
  }

  protected onUpdate(dt: number, t: number): void {
    this.pulse = damp(this.pulse, this.pulseTarget, 3, dt);
    const wave = 0.5 + 0.5 * Math.sin(t * 3.2);
    this.mat.emissiveIntensity = 0.55 + this.pulse * 0.9 * wave;
    (this.glow.material as THREE.SpriteMaterial).opacity = 0.45 + this.pulse * 0.45 * wave;
    this.rotation.y += dt * 0.05;
  }
}
