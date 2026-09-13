import * as THREE from 'three';
import { flat, softCircle } from './textures';
import { damp, clamp } from '../../util/math';

export const PILLAR_BASE = 0.2;
export const PILLAR_TOP = 0.55;

/**
 * 海底に隠れた柱。
 * 潮が引いて先端が見えると少しキラキラ、全部出ると強くキラキラして「タップ」を誘う。
 */
export class Pillar extends THREE.Group {
  readonly hitProxy: THREE.Mesh;
  found = false;
  exposed = false;
  private tipVisible = false;
  private readonly gemMat: THREE.MeshStandardMaterial;
  private readonly sparkles: THREE.Points;
  private readonly sparkleBase: Float32Array;
  private readonly sparkleMat: THREE.PointsMaterial;
  private sparkleAmount = 0;
  private readonly beam: THREE.Mesh;
  private beamLife = -1;
  private readonly gem: THREE.Mesh;

  constructor() {
    super();
    const stone = flat(0xd8d3c8);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, PILLAR_TOP - PILLAR_BASE - 0.16, 8), stone);
    shaft.position.y = (PILLAR_TOP - PILLAR_BASE - 0.16) / 2;
    shaft.castShadow = true;
    this.add(shaft);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.1, 0.56), stone);
    cap.position.y = PILLAR_TOP - PILLAR_BASE - 0.11;
    cap.castShadow = true;
    this.add(cap);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), stone);
    foot.position.y = 0.05;
    this.add(foot);

    this.gemMat = flat(0xffd166, { emissive: 0xffb703, emissiveIntensity: 0.2, roughness: 0.3 });
    this.gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), this.gemMat);
    this.gem.position.y = PILLAR_TOP - PILLAR_BASE + 0.03;
    this.add(this.gem);

    const n = 48;
    this.sparkleBase = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.15 + Math.random() * 0.5;
      this.sparkleBase[i * 3] = Math.cos(a) * r;
      this.sparkleBase[i * 3 + 1] = PILLAR_TOP - PILLAR_BASE - 0.4 + Math.random() * 1.1;
      this.sparkleBase[i * 3 + 2] = Math.sin(a) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.sparkleBase), 3));
    this.sparkleMat = new THREE.PointsMaterial({
      size: 0.16,
      map: softCircle(),
      color: 0xfff3b0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.sparkles = new THREE.Points(g, this.sparkleMat);
    this.add(this.sparkles);

    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.3, 7, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff1b8,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.beam.position.y = PILLAR_TOP - PILLAR_BASE + 3.5;
    this.beam.visible = false;
    this.add(this.beam);

    this.hitProxy = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 10, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
    );
    this.hitProxy.position.y = (PILLAR_TOP - PILLAR_BASE) * 0.6;
    this.hitProxy.userData.pillar = this;
    this.add(this.hitProxy);
  }

  setSeaLevel(level: number): void {
    this.tipVisible = level < PILLAR_TOP + 0.12;
    this.exposed = level < PILLAR_BASE + 0.12;
  }

  celebrate(): void {
    this.found = true;
    this.beamLife = 0;
    this.beam.visible = true;
  }

  reset(): void {
    this.found = false;
    this.beamLife = -1;
    this.beam.visible = false;
  }

  update(dt: number, t: number): void {
    const want = this.exposed ? (this.found ? 0.7 : 1) : this.tipVisible ? 0.35 : 0;
    this.sparkleAmount = damp(this.sparkleAmount, want, 4, dt);
    this.sparkleMat.opacity = this.sparkleAmount * (0.6 + 0.3 * Math.sin(t * 6));
    this.gemMat.emissiveIntensity = 0.2 + this.sparkleAmount * (1.1 + 0.5 * Math.sin(t * 5));
    this.gem.rotation.y = t * (0.6 + this.sparkleAmount * 2);
    this.gem.position.y = PILLAR_TOP - PILLAR_BASE + 0.03 + 0.04 * Math.sin(t * 3);

    const pos = this.sparkles.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const bx = this.sparkleBase[i * 3];
      const by = this.sparkleBase[i * 3 + 1];
      const bz = this.sparkleBase[i * 3 + 2];
      const rise = ((t * 0.35 + i * 0.13) % 1) * 1.0;
      pos.setXYZ(i, bx * (1 + 0.2 * Math.sin(t * 2 + i)), by + rise - 0.5, bz * (1 + 0.2 * Math.cos(t * 2 + i)));
    }
    pos.needsUpdate = true;

    if (this.beamLife >= 0) {
      this.beamLife += dt;
      const k = this.beamLife;
      const op = k < 0.4 ? k / 0.4 : clamp(1 - (k - 2.5) / 2.5, 0, 1);
      (this.beam.material as THREE.MeshBasicMaterial).opacity = op * 0.32;
      this.beam.scale.set(1 + 0.15 * Math.sin(t * 8), Math.min(1, k / 0.5), 1 + 0.15 * Math.cos(t * 8));
      if (k > 5) {
        this.beamLife = -1;
        this.beam.visible = false;
      }
    }
  }
}
