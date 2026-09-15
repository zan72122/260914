import * as THREE from 'three';
import { approach } from './common.js';

// Stage 1: 固定（ぎゅっ）
// 誘い = ドップが震えながら現れる / 受け皿と石の底が同じリズムで明滅 / 近いほど吸い寄せられる
const _v = new THREE.Vector3();

export default {
  enter(g) {
    g.press = 0;
    g.locked = false;
    g.sealT = 0;
    g.machines.dopTarget = 0.88;
    g.audio.blip(330, 0.35, 'sine', 0.10);
  },

  update(g, dt) {
    const u = g.stone.material.uniforms;
    // 強い吸い寄せ（一度良い向きに来たら外れない＝失敗なし）
    g.assist(dt * (1.2 + 2.4 * Math.max(0, g.align - 0.6)));

    g.machines.dopExtend = approach(g.machines.dopExtend, g.machines.dopTarget + g.press * 0.12, dt, 4.5);

    // 受け皿と石が同じリズムで明滅する（対応関係の可視化）
    const beat = 0.5 + 0.5 * Math.sin(g.t * 3.4);
    g.machines.dopPulse = beat;
    u.uGlow.value = approach(u.uGlow.value, 0.10 + 0.22 * beat + 0.30 * g.press, dt, 10);
    u.uStarBoost.value = approach(u.uStarBoost.value, 1.45, dt, 3);

    // 石が受け皿へ沈み込む
    const cw = g.stone.worldCAxis(_v);
    const base = g.layout.conf.stone;
    g.stone.group.position.copy(base).addScaledVector(cw, -0.18 * g.press);

    g.audio.setDrone(Math.max(g.align, 0.7));

    if (g.locked) {
      g.sealT += dt;
      g.stone.sealBase(Math.min(1, g.sealT / 0.5));
    }
  },

  onMove(g, m) {
    if (g.locked) return;
    const hit = g.pick(m.x, m.y, 1.06);
    g.trackball(m.dx, m.dy, 0.0035 * (hit ? 1 : 0.5));
    if (hit && m.rub) {
      g.stone.paint('window', hit.local, 0.24, 0.18 * Math.min(0.8, Math.max(0.05, m.dist / 40)));
      g.emitAt(hit.local, 'dust', 1, 0.5);
    }
  },

  onLongPressProgress(g, v, p) {
    if (g.locked) return;
    const hit = g.pick(p.x, p.y, 1.15);
    if (!hit) return;
    g.press = v;
    if (Math.random() < 0.3) g.particles.emit('light', g.stone.group.position, 1, 1.2);
    g.audio.setDrone(0.75 + v * 0.25);
  },

  onLongPress(g, p) {
    if (g.locked) return;
    const hit = g.pick(p.x, p.y, 1.15);
    if (!hit) { g.press = 0; return; }
    g.locked = true;
    g.press = 1;
    g.sealT = 0;
    g.machines.dopTarget = 1.0;
    g.audio.click();
    g.particles.emit('light', g.stone.group.position, 26, 1.8);
  },

  onLongPressCancel(g) {
    if (!g.locked) g.press = 0;
  },

  check(g) { return g.locked && g.sealT > 0.45 ? 2 : 1; }
};
