import * as THREE from 'three';
import * as T from './textures.js';

const _v = new THREE.Vector3();
const _d = new THREE.Object3D();

// --------------------------------------------------------------- fireflies
export class Fireflies {
  constructor(scene, count = 110) {
    this.count = count;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    this.data = [];
    for (let i = 0; i < count; i++) {
      const p = new THREE.Vector3(
        (Math.random() - 0.5) * 34,
        0.4 + Math.random() * 2.6,
        -Math.random() * 115 + 12
      );
      this.data.push({
        p, v: new THREE.Vector3(), phase: Math.random() * 6.28,
        speed: 0.25 + Math.random() * 0.5, home: p.clone()
      });
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      col[i * 3] = 1; col[i * 3 + 1] = 0.85; col[i * 3 + 2] = 0.4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geo = geo;
    this.mat = new THREE.PointsMaterial({
      size: 0.22, map: T.glowTexture(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, vertexColors: true, sizeAttenuation: true
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
    this.target = null;
    this.attract = 0;
  }
  flowTo(v) { this.target = v ? v.clone() : null; this.attract = 1; }
  update(dt, t) {
    const pos = this.geo.attributes.position.array;
    const col = this.geo.attributes.color.array;
    this.attract = Math.max(0, this.attract - dt * 0.06);
    for (let i = 0; i < this.count; i++) {
      const f = this.data[i];
      f.phase += dt * f.speed * 2.2;
      const wander = 0.5;
      f.v.x += Math.sin(f.phase * 1.3) * dt * wander;
      f.v.y += Math.cos(f.phase * 0.9) * dt * wander * 0.4;
      f.v.z += Math.cos(f.phase * 1.1) * dt * wander;
      // gentle pull home
      _v.copy(f.home).sub(f.p).multiplyScalar(dt * 0.25);
      f.v.add(_v);
      if (this.target && this.attract > 0) {
        _v.copy(this.target).sub(f.p);
        const dist = _v.length();
        if (dist < 26) {
          _v.normalize().multiplyScalar(dt * this.attract * 1.5 * (1 - dist / 26));
          f.v.add(_v);
        }
      }
      f.v.multiplyScalar(0.96);
      f.p.addScaledVector(f.v, dt * 8);
      if (f.p.y < 0.25) { f.p.y = 0.25; f.v.y = Math.abs(f.v.y); }
      pos[i * 3] = f.p.x; pos[i * 3 + 1] = f.p.y; pos[i * 3 + 2] = f.p.z;
      const b = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 3 + f.phase * 2));
      col[i * 3] = b; col[i * 3 + 1] = b * 0.85; col[i * 3 + 2] = b * 0.35;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

// ------------------------------------------------------------------- leaves
export class Leaves {
  constructor(scene, max = 160) {
    this.max = max;
    const geo = new THREE.PlaneGeometry(0.28, 0.28);
    const mat = new THREE.MeshBasicMaterial({
      map: T.leafTexture(), transparent: true, side: THREE.DoubleSide,
      depthWrite: false, alphaTest: 0.25
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = max;
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    scene.add(this.mesh);
    this.items = [];
    for (let i = 0; i < max; i++) this.items.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), rv: new THREE.Vector3(), s: 1 });
    this.next = 0;
    this.tints = [[0.85, 0.45, 0.16], [0.72, 0.28, 0.12], [0.9, 0.62, 0.2], [0.55, 0.33, 0.14]];
  }
  burst(center, n = 18, power = 1) {
    for (let i = 0; i < n; i++) {
      const it = this.items[this.next]; this.next = (this.next + 1) % this.max;
      it.life = 1.6 + Math.random() * 1.6;
      it.maxLife = it.life;
      it.p.copy(center).add(new THREE.Vector3((Math.random() - 0.5) * 1.4, Math.random() * 0.2, (Math.random() - 0.5) * 1.4));
      const a = Math.random() * Math.PI * 2;
      it.v.set(Math.cos(a) * (0.6 + Math.random()) * power, (1.4 + Math.random() * 1.8) * power, Math.sin(a) * (0.6 + Math.random()) * power);
      it.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      it.rv.set((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5);
      it.s = 0.7 + Math.random() * 0.7;
      const c = this.tints[(Math.random() * this.tints.length) | 0];
      this.mesh.instanceColor.setXYZ(this.items.indexOf(it), c[0], c[1], c[2]);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt, t) {
    for (let i = 0; i < this.max; i++) {
      const it = this.items[i];
      if (it.life > 0) {
        it.life -= dt;
        it.v.y -= dt * 2.2;
        it.v.x += Math.sin(t * 2 + i) * dt * 1.4;
        it.v.z += Math.cos(t * 1.7 + i) * dt * 1.4;
        it.v.multiplyScalar(0.985);
        it.p.addScaledVector(it.v, dt);
        if (it.p.y < 0.04) { it.p.y = 0.04; it.v.y *= -0.25; it.v.x *= 0.7; it.v.z *= 0.7; }
        it.r.x += it.rv.x * dt; it.r.y += it.rv.y * dt; it.r.z += it.rv.z * dt;
        const fade = Math.min(1, it.life / 0.6);
        _d.position.copy(it.p);
        _d.rotation.set(it.r.x, it.r.y, it.r.z);
        _d.scale.setScalar(it.s * fade);
      } else {
        _d.position.set(0, -999, 0);
        _d.scale.setScalar(0.0001);
        _d.rotation.set(0, 0, 0);
      }
      _d.updateMatrix();
      this.mesh.setMatrixAt(i, _d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ candy
export class CandyDrops {
  constructor(scene, max = 60) {
    this.max = max;
    const geo = new THREE.SphereGeometry(0.065, 8, 6);
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.3, emissive: new THREE.Color(0x332200), emissiveIntensity: 0.8
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.items = [];
    for (let i = 0; i < max; i++) {
      this.items.push({ alive: false, t: 0, dur: 1, from: new THREE.Vector3(), to: new THREE.Vector3(), p: new THREE.Vector3(), arc: 0.5, spin: 0 });
    }
    this.next = 0;
    this.onLand = null;
    this.live = 0;
    this.colors = [[1, 0.37, 0.54], [0.42, 0.82, 1], [1, 0.85, 0.29], [0.62, 1, 0.48], [0.79, 0.54, 1]];
  }

  /** toss one sweet from a hand into the bucket */
  drop(from, to) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    const it = this.items[i];
    it.alive = true;
    it.t = 0;
    it.dur = 0.75 + Math.random() * 0.35;
    it.from.copy(from);
    it.to.copy(to);
    it.p.copy(from);
    it.arc = 0.45 + Math.random() * 0.4;
    it.spin = 4 + Math.random() * 8;
    const c = this.colors[(Math.random() * this.colors.length) | 0];
    this.mesh.instanceColor.setXYZ(i, c[0], c[1], c[2]);
    this.mesh.instanceColor.needsUpdate = true;
  }

  /** the bucket moves, so late arrivals still land in it */
  retarget(to) {
    for (const it of this.items) if (it.alive) it.to.copy(to);
  }

  update(dt) {
    let live = 0;
    for (let i = 0; i < this.max; i++) {
      const it = this.items[i];
      if (it.alive) {
        it.t += dt / it.dur;
        if (it.t >= 1) {
          it.alive = false;
          if (this.onLand) this.onLand();
        } else {
          const k = it.t;
          it.p.copy(it.from).lerp(it.to, k);
          it.p.y += Math.sin(k * Math.PI) * it.arc;
          _d.position.copy(it.p);
          _d.rotation.set(k * it.spin, k * it.spin * 0.7, 0);
          _d.scale.setScalar(1);
          live++;
        }
      }
      if (!it.alive) {
        _d.position.set(0, -999, 0);
        _d.scale.setScalar(0.0001);
        _d.rotation.set(0, 0, 0);
      }
      _d.updateMatrix();
      this.mesh.setMatrixAt(i, _d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.live = live;
  }
}

// ---------------------------------------------------------------- sparkles
export class Sparkles {
  constructor(scene, max = 320) {
    this.max = max;
    const pos = new Float32Array(max * 3);
    const col = new Float32Array(max * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geo = geo;
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.3, map: T.glowTexture(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, vertexColors: true
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
    this.items = [];
    for (let i = 0; i < max; i++) this.items.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), c: new THREE.Color(), g: 1 });
    this.next = 0;
    for (let i = 0; i < max; i++) pos[i * 3 + 1] = -999;
  }
  burst(center, n = 26, color = 0xffe08a, power = 1.4, gravity = 1) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const it = this.items[this.next]; this.next = (this.next + 1) % this.max;
      it.life = 0.7 + Math.random() * 0.9;
      it.maxLife = it.life;
      it.p.copy(center);
      const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1);
      const s = power * (0.4 + Math.random());
      it.v.set(Math.sin(b) * Math.cos(a) * s, Math.cos(b) * s * 0.9 + power * 0.3, Math.sin(b) * Math.sin(a) * s);
      it.c.copy(c);
      it.g = gravity;
    }
  }
  ring(center, n = 30, radius = 1, color = 0xfff0b0) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const it = this.items[this.next]; this.next = (this.next + 1) % this.max;
      it.life = 1.0 + Math.random() * 0.5;
      it.maxLife = it.life;
      const a = (i / n) * Math.PI * 2;
      it.p.set(center.x + Math.cos(a) * radius, center.y + Math.random() * 0.3, center.z + Math.sin(a) * radius);
      it.v.set(Math.cos(a) * 0.4, 0.9 + Math.random() * 0.6, Math.sin(a) * 0.4);
      it.c.copy(c);
      it.g = 0.2;
    }
  }
  update(dt) {
    const pos = this.geo.attributes.position.array;
    const col = this.geo.attributes.color.array;
    for (let i = 0; i < this.max; i++) {
      const it = this.items[i];
      if (it.life > 0) {
        it.life -= dt;
        it.v.y -= dt * 2.4 * it.g;
        it.v.multiplyScalar(0.97);
        it.p.addScaledVector(it.v, dt);
        const f = Math.max(0, it.life / it.maxLife);
        pos[i * 3] = it.p.x; pos[i * 3 + 1] = it.p.y; pos[i * 3 + 2] = it.p.z;
        col[i * 3] = it.c.r * f; col[i * 3 + 1] = it.c.g * f; col[i * 3 + 2] = it.c.b * f;
      } else {
        pos[i * 3 + 1] = -999;
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

// -------------------------------------------------------------------- bats
export class Bats {
  constructor(scene, max = 26) {
    this.max = max;
    const geo = new THREE.PlaneGeometry(1.5, 0.75);
    const mat = new THREE.MeshBasicMaterial({
      map: T.batTexture(), transparent: true, depthWrite: false, alphaTest: 0.2,
      side: THREE.DoubleSide, color: 0x1a1726
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.items = [];
    for (let i = 0; i < max; i++) this.items.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), ph: 0, s: 1 });
    this.next = 0;
  }
  flock(from, dir, n = 10) {
    for (let i = 0; i < n; i++) {
      const it = this.items[this.next]; this.next = (this.next + 1) % this.max;
      it.life = 5 + Math.random() * 3;
      it.maxLife = it.life;
      it.p.copy(from).add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3));
      it.v.copy(dir).normalize().multiplyScalar(4 + Math.random() * 3);
      it.v.x += (Math.random() - 0.5) * 3;
      it.v.y += 1.2 + Math.random() * 1.5;
      it.ph = Math.random() * 6.28;
      it.s = 0.7 + Math.random() * 0.8;
    }
  }
  update(dt, t) {
    for (let i = 0; i < this.max; i++) {
      const it = this.items[i];
      if (it.life > 0) {
        it.life -= dt;
        it.ph += dt * 13;
        it.v.y += Math.sin(it.ph) * dt * 2.4;
        it.v.x += Math.sin(t * 1.3 + i) * dt * 2.0;
        it.p.addScaledVector(it.v, dt);
        const f = Math.min(1, it.life / 1.2);
        _d.position.copy(it.p);
        _d.rotation.set(0, Math.atan2(it.v.x, it.v.z) + Math.PI / 2, Math.sin(it.ph) * 0.35);
        _d.scale.set(it.s * (0.6 + 0.4 * Math.abs(Math.cos(it.ph))) * f, it.s * f, it.s * f);
      } else {
        _d.position.set(0, -999, 0);
        _d.scale.setScalar(0.0001);
      }
      _d.updateMatrix();
      this.mesh.setMatrixAt(i, _d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// -------------------------------------------------------------- fireworks
export class Fireworks {
  constructor(scene, sparkles) {
    this.sparkles = sparkles;
    this.rockets = [];
    this.scene = scene;
  }
  launch(x, z, color) {
    this.rockets.push({
      p: new THREE.Vector3(x, 1, z),
      v: new THREE.Vector3((Math.random() - 0.5) * 2, 15 + Math.random() * 5, (Math.random() - 0.5) * 2),
      t: 1.0 + Math.random() * 0.4,
      color: color || [0xff8a2e, 0xffd24a, 0x8affc2, 0xff7ab8, 0x9fd4ff][(Math.random() * 5) | 0]
    });
  }
  update(dt) {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.t -= dt;
      r.v.y -= dt * 6;
      r.p.addScaledVector(r.v, dt);
      this.sparkles.burst(r.p, 2, r.color, 0.25, 0.4);
      if (r.t <= 0) {
        // pumpkin-shaped burst
        const n = 46;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          // pumpkin silhouette: wide ellipse with ribbed radius
          const rad = (1 + 0.12 * Math.cos(a * 6)) * (Math.abs(Math.cos(a)) * 1.25 + 0.75);
          const it = this.sparkles.items[this.sparkles.next];
          this.sparkles.next = (this.sparkles.next + 1) % this.sparkles.max;
          it.life = 1.4 + Math.random() * 0.8;
          it.maxLife = it.life;
          it.p.copy(r.p);
          it.v.set(Math.cos(a) * rad * 5.5, Math.sin(a) * rad * 5.0, (Math.random() - 0.5) * 1.6);
          it.c.setHex(r.color);
          it.g = 0.35;
        }
        // stem
        for (let k = 0; k < 6; k++) {
          const it = this.sparkles.items[this.sparkles.next];
          this.sparkles.next = (this.sparkles.next + 1) % this.sparkles.max;
          it.life = 1.2; it.maxLife = 1.2;
          it.p.copy(r.p);
          it.v.set((Math.random() - 0.5) * 0.8, 6.2 + k * 0.4, (Math.random() - 0.5) * 0.8);
          it.c.setHex(0x8fd44a);
          it.g = 0.35;
        }
        this.rockets.splice(i, 1);
      }
    }
  }
}
