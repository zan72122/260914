import * as THREE from 'three';
import { approach, starCenter } from './common.js';

// Stage 5: 完成（遊べる完成品）
// 誘い = 星が指に追いてくる / しばらくすると新しい原石が転がってくる
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();

function screenOf(g, world) {
  const p = _q.copy(world).project(g.camera);
  return { x: (p.x * 0.5 + 0.5) * g.layout.w, y: (-p.y * 0.5 + 0.5) * g.layout.h };
}

export default {
  enter(g, restored) {
    const u = g.stone.material.uniforms;
    u.uStarForm.value = 1;
    u.uStarBoost.value = 4.2;
    u.uPulse.value = 0;
    u.uProtGlow.value = 0;
    u.uHintStrength.value = 0;
    g.stone.spinSpeed = 0;
    g.stone.ghost.visible = false;
    g.machines.wheelSpin = 0;
    g.machines.dopTarget = 0;
    g.machines.dopPulse = 0;
    g.bounce = 0.55;
    g.bounceV = 0;
    g.doneT = 0;
    g.nextIn = 0;
    g.draggingNext = false;

    if (!restored) {
      g.audio.silence();
      g.audio.chime();
      g.particles.emit('light', g.stone.group.position, 200, 2.6);
    }
    const last = g.collection[g.collection.length - 1];
    if (!last || last.seed !== g.stone.seed) g.addToCollection();
    g.machines.shelf.visible = true;
  },

  update(g, dt) {
    const u = g.stone.material.uniforms;
    g.doneT += dt;

    g.machines.dopExtend = approach(g.machines.dopExtend, 0, dt, 2.0);
    g.machines.padExtend = approach(g.machines.padExtend, 0, dt, 3.0);
    g.machines.rigExtend = approach(g.machines.rigExtend, 0, dt, 3.0);
    g.machines.pedExtend = approach(g.machines.pedExtend, 1, dt, 2.0);
    u.uStarBoost.value = approach(u.uStarBoost.value, 2.6, dt, 1.1);
    u.uGlow.value = approach(u.uGlow.value, 0.05, dt, 2);

    // 軽く跳ねる
    g.bounceV -= 10.0 * dt;
    g.bounce += g.bounceV * dt;
    if (g.bounce < 0) { g.bounce = 0; g.bounceV *= -0.42; if (Math.abs(g.bounceV) < 0.25) g.bounceV = 0; }
    g.stone.group.position.copy(g.layout.conf.stone);
    g.stone.group.position.y += g.bounce;

    // 指を離すとゆっくり星が正面に戻る
    if ((g.t - g.lastTouch) > 0.9) g.assist(dt * 0.45);

    g.audio.setMotor(0);

    // 光の粒がときどき舞う
    if (Math.random() < dt * 6) {
      starCenter(g, _p);
      g.particles.emit('light', _p, 1, 0.9);
    }

    // しばらくすると新しい原石が画面端から転がってくる
    if (g.doneT > 8) {
      const m = g.machines.nextStone;
      if (!m.visible) {
        m.visible = true;
        const off = g.layout.portrait
          ? new THREE.Vector3(2.4, -3.1, 0.8)
          : new THREE.Vector3(5.6, -1.6, 0.8);
        m.position.copy(g.layout.conf.stone).add(off);
        m.userData.rest = g.layout.conf.stone.clone().add(
          g.layout.portrait ? new THREE.Vector3(1.25, -2.7, 0.8) : new THREE.Vector3(3.5, -1.4, 0.8)
        );
        m.material.color.setHex(0x33538f);
      }
      const rest = m.userData.rest;
      if (!g.draggingNext) m.position.lerp(rest, Math.min(1, dt * 1.3));
      m.rotation.x += dt * 1.1;
      m.rotation.y += dt * 0.7;
      const glow = 0.5 + 0.5 * Math.sin(g.t * 2.4);
      m.material.emissive.setRGB(0.05 + 0.10 * glow, 0.10 + 0.14 * glow, 0.24 + 0.22 * glow);

      if (m.position.distanceTo(g.stone.group.position) < 1.0) {
        m.visible = false;
        g.draggingNext = false;
        g.stone.reseed((Math.random() * 0xffffffff) >>> 0);
        g.stone.stage = 0;
        g.setStage(0);
      }
    }
  },

  onDown(g, p) {
    const m = g.machines.nextStone;
    g.draggingNext = false;
    if (m.visible) {
      const s = screenOf(g, m.position);
      if (Math.hypot(s.x - p.x, s.y - p.y) < Math.max(90, g.layout.w * 0.16)) {
        g.draggingNext = true;
      }
    }
  },

  onMove(g, m) {
    if (g.draggingNext && g.machines.nextStone.visible) {
      const n = g.machines.nextStone;
      const dir = _p.copy(g.stone.group.position).sub(n.position);
      const len = dir.length() || 1;
      dir.multiplyScalar(1 / len);
      n.position.addScaledVector(dir, Math.min(len, m.dist * 0.016));
      n.rotation.z -= m.dist * 0.01;
      if (Math.random() < 0.2) g.particles.emit('dust', n.position, 1, 0.5);
      return;
    }
    // 画面のどこを触っても石が傾く（指が石を隠さない）
    g.trackball(m.dx, m.dy, 0.0040);
    if (Math.random() < 0.10) g.audio.blip(1500 + Math.random() * 1500, 0.07, 'sine', 0.035);
  },

  onUp(g) { g.draggingNext = false; },

  onTap(g, p) {
    starCenter(g, _p);
    g.particles.emit('light', _p, 22, 1.5);
    g.audio.sparkle();
  },

  check(g) { return 5; }
};
