import * as THREE from 'three';
import { C } from './materials.js';

// 軽量パーティクル: 光の粒(誘導)、水滴、花びら。すべてスプライトの使い回し。
function makeDot(color, size = 32, soft = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const col = new THREE.Color(color);
  const rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
  grad.addColorStop(0, `rgba(${rgb},1)`);
  grad.addColorStop(soft ? 0.4 : 0.8, `rgba(${rgb},${soft ? 0.6 : 1})`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePetal(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const col = new THREE.Color(color);
  g.fillStyle = `rgb(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)})`;
  g.beginPath();
  g.ellipse(16, 16, 7, 13, 0.5, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createParticles(parent) {
  const pools = {};
  const textures = {
    mote: makeDot(C.mote),
    water: makeDot(C.water, 32, false),
    spark: makeDot(0xffffff),
    petal0: makePetal(C.flowers[0]),
    petal1: makePetal(C.flowers[1]),
    petal2: makePetal(C.flowers[2]),
  };
  const live = [];

  function get(kind) {
    const pool = (pools[kind] ||= []);
    let s = pool.pop();
    if (!s) {
      const m = new THREE.SpriteMaterial({ map: textures[kind], transparent: true, depthWrite: false });
      s = new THREE.Sprite(m);
      parent.add(s);
    }
    s.visible = true;
    return s;
  }

  function spawn({ kind = 'mote', pos, vel = new THREE.Vector3(), life = 1, size = 0.08, gravity = 0, drag = 0, target = null, seek = 0, fade = true, spin = 0 }) {
    const s = get(kind);
    s.position.copy(pos);
    s.scale.setScalar(size);
    s.material.opacity = 1;
    s.material.rotation = Math.random() * Math.PI * 2;
    live.push({ s, vel: vel.clone(), life, maxLife: life, size, gravity, drag, target, seek, fade, spin, kind });
    return s;
  }

  const tmp = new THREE.Vector3();
  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        pools[p.kind].push(p.s);
        live.splice(i, 1);
        continue;
      }
      if (p.target && p.seek) {
        tmp.copy(p.target).sub(p.s.position).normalize().multiplyScalar(p.seek * dt);
        p.vel.add(tmp);
      }
      p.vel.y -= p.gravity * dt;
      if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.s.position.addScaledVector(p.vel, dt);
      p.s.material.rotation += p.spin * dt;
      const k = p.life / p.maxLife;
      if (p.fade) {
        p.s.material.opacity = Math.min(1, k * 2);
        p.s.scale.setScalar(p.size * (0.4 + 0.6 * Math.min(1, (1 - k) * 4)));
      }
    }
  }

  // 便利関数
  function puff(pos, color = 'spark', count = 8, speed = 0.8) {
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random()));
      spawn({ kind: color, pos, vel: v, life: 0.5 + Math.random() * 0.4, size: 0.06 + Math.random() * 0.06, drag: 2 });
    }
  }

  return { spawn, update, puff, live };
}
