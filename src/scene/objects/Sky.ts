import * as THREE from 'three';
import { softCircle } from './textures';

/** 夕暮れのグラデーション空と星 */
export class Sky extends THREE.Group {
  private readonly stars: THREE.Points;

  constructor() {
    super();
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x24336b) },
        mid: { value: new THREE.Color(0x8d7cc0) },
        bottom: { value: new THREE.Color(0xf3b7a0) },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
        void main(){ float h = normalize(vP).y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.7, h)) : mix(mid, bottom, smoothstep(0.0, -0.75, h));
        gl_FragColor = vec4(c, 1.0); }`,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(80, 24, 16), mat);
    this.add(dome);

    const n = 220;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(0.15 + Math.random() * 0.8);
      const r = 70;
      p[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      p[i * 3 + 1] = r * Math.cos(phi);
      p[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.stars = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        size: 1.4,
        map: softCircle(),
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: 0xfff6d8,
      }),
    );
    this.add(this.stars);
  }

  update(t: number): void {
    (this.stars.material as THREE.PointsMaterial).opacity = 0.6 + 0.25 * Math.sin(t * 0.8);
  }
}
