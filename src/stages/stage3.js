import * as THREE from 'three';
import { approach, rubPaint } from './common.js';

// Stage 3: カボション化（ぐるぐる）
// 火花は水しぶきに変わり、砥石の音も柔らかくなる（同じ機械の細かい目）
// 誘い = ドームのゴースト輪郭だけが残って呼吸する
const _p = new THREE.Vector3();

export default {
  enter(g) {
    g.machines.wheelSpin = 17;
    // ここから上限が外れ、こすった所が 1.0 まで丸くなる
    g.stone.grindCap = 1.0;
    g.stone.material.uniforms.uGrindCap.value = 1.0;
    g.stone.spinSpeed = 0.95;
    g.waterT = 0;
    g.grindNoise = 0;
    g.audio.blip(300, 0.5, 'sine', 0.08);
  },

  update(g, dt) {
    const u = g.stone.material.uniforms;
    u.uProtGlow.value = approach(u.uProtGlow.value, 0.18, dt, 2.0);
    g.stone.ghostMaterial.uniforms.uOpacity.value =
      approach(g.stone.ghostMaterial.uniforms.uOpacity.value, 0.48, dt, 2);
    g.machines.rigExtend = approach(g.machines.rigExtend, 1, dt, 3);
    g.machines.dopPulse = 0.1;
    g.stone.group.position.copy(g.layout.conf.stone);

    g.grindNoise *= Math.exp(-dt * 6);
    g.audio.setGrind(g.grindNoise * 0.35);
    g.audio.setWater(g.grindNoise);
    g.audio.setMotor(1, 38);

    // 水しぶき
    g.waterT += dt;
    if (g.waterT > 0.16) {
      g.waterT = 0;
      const cw = g.stone.worldCAxis(new THREE.Vector3());
      _p.copy(g.stone.group.position).addScaledVector(cw, 0.4);
      g.particles.emit('water', _p, 2, 1.1);
    }
  },

  onMove(g, m) {
    // 円を描くと連続して塗れる。丸める工程なので全体も少しずつ丸くなる。
    // 仕上げに近づくほど「全体が丸くなる」成分を強めて、最後の角が必ず取れるようにする
    const gv = g.stone.stats().grindAvg;
    const r = rubPaint(g, m, 'grind', 0.52, 0.30, 0.0013 * (1 + 2.6 * gv * gv * gv * gv), 0.5);
    if (r.added > 0) {
      g.grindNoise = Math.min(1, g.grindNoise + r.added * 1.2);
      g.emitAt(r.hit.local, 'water', 2, 0.9);
      if (Math.random() < 0.4) g.emitAt(r.hit.local, 'dust', 1, 0.6);
    }
  },

  onTap(g, p) {
    const hit = g.pick(p.x, p.y, 1.1);
    if (hit) { g.emitAt(hit.local, 'light', 10, 1.0); g.audio.sparkle(); }
  },

  check(g) { return g.stone.stats().grindAvg > 0.97 ? 4 : 3; }
};
