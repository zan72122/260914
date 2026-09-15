import * as THREE from 'three';
import { Stone } from './stone.js';
import { Machines } from './machines.js';
import { Particles } from './particles.js';
import { Audio } from './audio.js';
import { Layout } from './layout.js';
import { createInput } from './input.js';
import { STAGES } from './stages/index.js';
import * as storage from './storage.js';

const RING_VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;
const RING_FRAG = /* glsl */`
precision mediump float;
uniform float uProgress;
uniform float uAlpha;
uniform vec3  uColor;
varying vec2 vUv;
void main(){
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float ring = smoothstep(0.62, 0.70, r) * (1.0 - smoothstep(0.86, 0.94, r));
  float a = atan(p.x, p.y) / 6.28318530718;
  if (a < 0.0) a += 1.0;
  float arc = step(a, uProgress);
  float base = ring * 0.14;
  gl_FragColor = vec4(uColor, (base + ring * arc * 0.9) * uAlpha);
}
`;

class Game {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true, alpha: false, powerPreference: 'high-performance'
    });
    this.renderer.setClearColor(0x05070d, 1);
    this.renderer.autoClear = false;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05070d, 0.045);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);

    // 暗い作業台の空気（背景のゆるいグラデーション）
    const bg = new THREE.Mesh(
      new THREE.SphereGeometry(40, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: {},
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `precision mediump float; varying vec3 vP;
          void main(){
            float h = clamp(vP.y / 40.0 * 0.5 + 0.5, 0.0, 1.0);
            vec3 c = mix(vec3(0.020,0.031,0.055), vec3(0.008,0.012,0.026), h);
            float r = 1.0 - clamp(length(vP.xy) / 34.0, 0.0, 1.0);
            c += vec3(0.02, 0.035, 0.075) * pow(r, 3.0);
            gl_FragColor = vec4(c, 1.0);
          }`
      })
    );
    bg.frustumCulled = false;
    bg.renderOrder = -10;
    this.scene.add(bg);

    this.scene.add(new THREE.AmbientLight(0x35507a, 0.9));
    const key = new THREE.DirectionalLight(0xfff3e0, 1.5);
    key.position.set(2.2, 5.2, 4.2);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x6fa8ff, 0.7);
    fill.position.set(-4.0, 1.4, 2.8);
    this.scene.add(fill);
    const rigLight = new THREE.PointLight(0x9ec6ff, 26, 12, 2);
    rigLight.position.set(1.4, -0.4, 2.2);
    this.scene.add(rigLight);

    this.stone = new Stone();
    this.machines = new Machines();
    this.particles = new Particles();
    this.scene.add(this.stone.group, this.machines.group, this.particles.points);

    this.audio = new Audio();
    this.layout = new Layout(this.renderer, this.camera);

    // 指のリング（Stage1 の長押し表示）— 文字なしの唯一の UI
    this.overlay = new THREE.Scene();
    this.overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    this.ringMat = new THREE.ShaderMaterial({
      vertexShader: RING_VERT, fragmentShader: RING_FRAG,
      uniforms: {
        uProgress: { value: 0 }, uAlpha: { value: 0 },
        uColor: { value: new THREE.Color(0xbfe4ff) }
      },
      transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.ringMat);
    this.ring.renderOrder = 100;
    this.overlay.add(this.ring);

    this.raycaster = new THREE.Raycaster();
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._q = new THREE.Quaternion();

    this.t = 0;
    this.stage = 0;
    this.stageTime = 0;
    this.touching = false;
    this.lastTouch = -10;
    this.hasTouched = false;
    this.collection = [];
    this.align = 0;
    this.alignSmooth = 0;
    this.pendingSave = 0;

    this.input = createInput(this.renderer.domElement, {
      onDown: (p) => { this.audio.unlock(); this.hasTouched = true; this.touching = true; this.lastTouch = this.t; this._stage().onDown?.(this, p); },
      onMove: (m) => { this.lastTouch = this.t; this._stage().onMove?.(this, m); },
      onUp: (p) => { this.touching = false; this.lastTouch = this.t; this._stage().onUp?.(this, p); },
      onTap: (p) => this._stage().onTap?.(this, p),
      onLongPressProgress: (v, p) => {
        this.ringMat.uniforms.uProgress.value = v;
        this.ringMat.uniforms.uAlpha.value = Math.min(1, v * 4);
        this.ring.position.set(p.x - this.layout.w / 2, this.layout.h / 2 - p.y, 0);
        this._stage().onLongPressProgress?.(this, v, p);
      },
      onLongPress: (p) => {
        this.ringMat.uniforms.uAlpha.value = 0;
        this._stage().onLongPress?.(this, p);
      },
      onLongPressCancel: () => {
        this.ringMat.uniforms.uProgress.value = 0;
        this.ringMat.uniforms.uAlpha.value = 0;
        this._stage().onLongPressCancel?.(this);
      }
    });

    this._restore();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 60));

    STAGES[this.stage].enter(this, true);
    this._exposeDebug();

    this.clock = new THREE.Clock();
    this._loop = this._loop.bind(this);
    this.renderer.setAnimationLoop(this._loop);
  }

  _stage() { return STAGES[this.stage]; }

  resize() {
    this.layout.apply(this.stone, this.machines);
    const w = this.layout.w, h = this.layout.h;
    this.overlayCam.left = -w / 2; this.overlayCam.right = w / 2;
    this.overlayCam.top = h / 2; this.overlayCam.bottom = -h / 2;
    this.overlayCam.updateProjectionMatrix();
    this.ring.scale.set(150, 150, 1);
  }

  setStage(n) {
    if (n === this.stage) return;
    STAGES[this.stage].exit?.(this);
    this.stage = n;
    this.stone.stage = n;
    this.stageTime = 0;
    STAGES[n].enter(this, false);
    this._save();
  }

  // --- 石へのレイ当たり判定（local 方向を返す） ---
  pick(x, y, slack = 1.0) {
    const w = this.layout.w, h = this.layout.h;
    this.raycaster.setFromCamera(
      new THREE.Vector2((x / w) * 2 - 1, -((y / h) * 2 - 1)), this.camera
    );
    const ray = this.raycaster.ray;
    const R = this.stone.hitRadius() * slack;
    const oc = this._v.copy(ray.origin).sub(this.stone.group.position);
    const b = oc.dot(ray.direction);
    const c = oc.lengthSq() - R * R;
    const disc = b * b - c;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    if (t < 0) return null;
    const world = new THREE.Vector3().copy(ray.origin).addScaledVector(ray.direction, t);
    const dirW = new THREE.Vector3().subVectors(world, this.stone.group.position).normalize();
    const local = this.stone.toLocalDir(dirW, new THREE.Vector3());
    return { world, dirW, local };
  }

  viewDir(out) {
    return out.copy(this.camera.position).sub(this.stone.group.position).normalize();
  }

  /** 星が一番よく見える向き（視線より少し上に倒した軸） */
  idealAxis(out) {
    const v = this.viewDir(out);
    const up = this._v2.set(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, v).normalize();
    const camUp = new THREE.Vector3().crossVectors(v, right).normalize();
    return out.copy(v).multiplyScalar(Math.cos(0.30)).addScaledVector(camUp, Math.sin(0.30)).normalize();
  }

  /** 画面ドラッグで石を転がす（トラックボール） */
  trackball(dx, dy, k = 0.0062) {
    const v = this.viewDir(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), v).normalize().negate();
    const up = new THREE.Vector3().crossVectors(v, right).normalize();
    const qa = new THREE.Quaternion().setFromAxisAngle(up, dx * k);
    const qb = new THREE.Quaternion().setFromAxisAngle(right, dy * k);
    this.stone.orientation.premultiply(qb).premultiply(qa);
    this.stone.orientation.normalize();
    this.stone.applyOrientation();
  }

  /** 現在の向きを理想の向きへ少し寄せる（磁石のような吸い寄せ・失敗なし） */
  assist(strength) {
    if (strength <= 0) return;
    const cw = this.stone.worldCAxis(new THREE.Vector3());
    const ideal = this.idealAxis(new THREE.Vector3());
    const q = new THREE.Quaternion().setFromUnitVectors(cw, ideal);
    q.slerp(new THREE.Quaternion(), 1 - Math.min(1, strength));
    this.stone.orientation.premultiply(q).normalize();
    this.stone.applyOrientation();
  }

  updateAlign() {
    const cw = this.stone.worldCAxis(this._v);
    const v = this.viewDir(this._v2);
    this.align = cw.dot(v);
    this.alignSmooth += (this.align - this.alignSmooth) * 0.25;
    this.stone.material.uniforms.uAlign.value = Math.max(0, this.alignSmooth);
  }

  emitAt(local, type, n, spread = 1.0) {
    const p = this.stone.surfacePoint(local, new THREE.Vector3());
    this.particles.emit(type, p, n, spread);
    return p;
  }

  addToCollection() {
    const s = this.stone;
    this.collection.push({
      seed: s.seed,
      color: s.params.baseColor.getHex(),
      windowAvg: s.stats().windowAvg
    });
    if (this.collection.length > 8) this.collection.shift();
    this._buildShelf();
  }

  _buildShelf() {
    const items = this.machines.shelfItems;
    while (items.children.length) {
      const c = items.children.pop();
      c.geometry.dispose(); c.material.dispose();
    }
    const n = this.collection.length;
    this.collection.forEach((c, i) => {
      const g = new THREE.SphereGeometry(0.19, 14, 10);
      g.scale(1, 0.72, 1);
      const m = new THREE.MeshStandardMaterial({
        color: c.color, roughness: 0.08, metalness: 0.25,
        emissive: new THREE.Color(c.color).multiplyScalar(0.28)
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set((i - (n - 1) / 2) * 0.46, 0.18, 0);
      items.add(mesh);
    });
    this.machines.shelf.visible = n > 0 && this.stage === 5;
  }

  // ---- 保存 / 復元 ----
  _save() {
    storage.save({
      stone: this.stone.serialize(),
      collection: this.collection,
      portrait: this.layout.portrait
    });
  }

  _restore() {
    const d = storage.load();
    if (!d || !d.stone) return;
    if (this.stone.restore(d.stone)) {
      this.stage = Math.max(0, Math.min(5, d.stone.stage | 0));
      this.collection = Array.isArray(d.collection) ? d.collection : [];
      this._buildShelf();
    }
  }

  _exposeDebug() {
    const self = this;
    window.__game = {
      stone: this.stone,
      get stage() { return self.stage; },
      getStats() {
        const s = self.stone.stats();
        return {
          stage: self.stage,
          align: self.align,
          grindAvg: s.grindAvg,
          polishAvg: s.polishAvg,
          windowAvg: s.windowAvg,
          maxProtrusion: s.maxProtrusion,
          protHigh: s.protHigh,
          seed: self.stone.seed
        };
      },
      // 画面上の石の位置（試遊スクリプトが指を当てるためだけの補助。進行はしない）
      stoneScreen() { return self.layout.stoneScreen(self.stone); },
      orientation() { return self.stone.orientation.toArray(); }
    };
  }

  _loop() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.t += dt;
    this.stageTime += dt;
    this.input.tick();

    const u = this.stone.material.uniforms;
    u.uTime.value = this.t;
    this.stone.ghostMaterial.uniforms.uTime.value = this.t;

    // 機械が石をゆっくり回す（研削中・研磨中）
    if (this.stone.spinSpeed !== 0) {
      this.stone.spin += this.stone.spinSpeed * dt;
      this.stone.applyOrientation();
    }

    this.updateAlign();
    STAGES[this.stage].update(this, dt);

    const nxt = STAGES[this.stage].check?.(this);
    if (typeof nxt === 'number' && nxt !== this.stage) this.setStage(nxt);

    this.machines.update(dt, this.t);
    this.machines.placeDop(
      this.stone.group.position,
      this.stone.worldCAxis(this._v),
      this.t,
      this.machines.dopPulse || 0
    );
    this.particles.update(dt);

    this.pendingSave += dt;
    if (this.pendingSave > 2.0) { this.pendingSave = 0; this._save(); }

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.render(this.overlay, this.overlayCam);
  }
}

const container = document.getElementById('app');
try {
  window.__gameInstance = new Game(container);
} catch (e) {
  console.error(e);
  document.body.style.background = '#300';
  throw e;
}
