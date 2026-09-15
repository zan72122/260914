import * as THREE from 'three';

const MAX = 1400;

const VERT = /* glsl */`
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main(){
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * 320.0 / max(0.001, -mv.z);
}
`;

const FRAG = /* glsl */`
precision mediump float;
varying float vAlpha;
varying vec3 vColor;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  if (d > 0.25) discard;
  float a = smoothstep(0.25, 0.0, d);
  gl_FragColor = vec4(vColor, a * vAlpha);
}
`;

const PRESETS = {
  spark: { color: [1.0, 0.72, 0.3], size: 0.030, life: [0.28, 0.6], speed: 2.4, grav: -3.2, drag: 0.90 },
  dust: { color: [0.72, 0.78, 0.88], size: 0.022, life: [0.5, 1.1], speed: 0.9, grav: -1.4, drag: 0.94 },
  water: { color: [0.62, 0.85, 1.0], size: 0.026, life: [0.4, 0.9], speed: 1.5, grav: -4.0, drag: 0.93 },
  light: { color: [0.80, 0.92, 1.0], size: 0.034, life: [0.9, 2.0], speed: 0.6, grav: 0.35, drag: 0.97 }
};

export class Particles {
  constructor() {
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.cursor = 0;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setDrawRange(0, MAX);
    this.geometry = g;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  emit(type, origin, n = 8, spread = 1.0, extraVel = null) {
    const p = PRESETS[type] || PRESETS.spark;
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      const j = i * 3;
      this.pos[j] = origin.x + (Math.random() - 0.5) * 0.06;
      this.pos[j + 1] = origin.y + (Math.random() - 0.5) * 0.06;
      this.pos[j + 2] = origin.z + (Math.random() - 0.5) * 0.06;
      const z = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      const sp = p.speed * (0.4 + 0.8 * Math.random()) * spread;
      this.vel[j] = r * Math.cos(t) * sp + (extraVel ? extraVel.x : 0);
      this.vel[j + 1] = r * Math.sin(t) * sp + (extraVel ? extraVel.y : 0);
      this.vel[j + 2] = z * sp + (extraVel ? extraVel.z : 0);
      const cv = 0.85 + Math.random() * 0.3;
      this.col[j] = p.color[0] * cv; this.col[j + 1] = p.color[1] * cv; this.col[j + 2] = p.color[2] * cv;
      this.size[i] = p.size * (0.6 + Math.random() * 0.9);
      const lf = p.life[0] + Math.random() * (p.life[1] - p.life[0]);
      this.life[i] = lf; this.maxLife[i] = lf;
      this.alpha[i] = 1;
      this.grav[i] = p.grav; this.drag[i] = p.drag;
    }
  }

  update(dt) {
    const d = Math.min(dt, 0.05);
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      this.life[i] -= d;
      const j = i * 3;
      const dr = Math.pow(this.drag[i], d * 60);
      this.vel[j] *= dr; this.vel[j + 1] *= dr; this.vel[j + 2] *= dr;
      this.vel[j + 1] += this.grav[i] * d;
      this.pos[j] += this.vel[j] * d;
      this.pos[j + 1] += this.vel[j + 1] * d;
      this.pos[j + 2] += this.vel[j + 2] * d;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = t * t;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
  }
}
