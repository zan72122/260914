import * as THREE from 'three';
import { approach, rubPaint, pickProtrusion } from './common.js';

// Stage 2: 粗形成（ガリガリ）
// 誘い = 砥石が回りだす / ゴースト輪郭からはみ出た出っ張りだけが光る / そこに火花が散る
const _p = new THREE.Vector3();

export default {
  enter(g) {
    const u = g.stone.material.uniforms;
    u.uPulse.value = 0;
    g.stone.ghost.visible = true;
    g.machines.wheelSpin = 30;
    g.machines.dopTarget = 1.0;
    g.stone.spinSpeed = 0.95;         // 機械が石をゆっくり回す（全周に手が届く）
    g.grindNoise = 0;
    g.sparkT = 0;
    g.audio.blip(180, 0.4, 'sawtooth', 0.08);
  },

  update(g, dt) {
    const u = g.stone.material.uniforms;
    g.machines.rigExtend = approach(g.machines.rigExtend, 1, dt, 2.6);
    g.machines.padExtend = approach(g.machines.padExtend, 0, dt, 4);
    g.machines.dopExtend = approach(g.machines.dopExtend, 1, dt, 4);
    g.machines.dopPulse = 0.12;
    u.uProtGlow.value = approach(u.uProtGlow.value, 0.62, dt, 2.2);
    u.uGlow.value = approach(u.uGlow.value, 0.05, dt, 3);
    g.stone.ghostMaterial.uniforms.uOpacity.value =
      approach(g.stone.ghostMaterial.uniforms.uOpacity.value, 0.55, dt, 2);

    g.stone.group.position.copy(g.layout.conf.stone);

    g.grindNoise *= Math.exp(-dt * 6);
    g.audio.setGrind(g.grindNoise);
    g.audio.setMotor(g.machines.rigExtend, 62);
    g.audio.setDrone(0);

    // 出っ張りに火花（「ここが邪魔」の可視化）
    g.sparkT += dt;
    if (g.sparkT > 0.09 && g.machines.rigExtend > 0.6) {
      g.sparkT = 0;
      const d = pickProtrusion(g);
      if (d) {
        g.stone.surfacePoint(d, _p);
        g.particles.emit('spark', _p, 2, 0.8);
        if (Math.random() < 0.25) g.audio.spark();
      }
    }
  },

  onMove(g, m) {
    // 削り進むほど全体成分を強めて、最後の出っ張りが必ず落ちるようにする
    const gv = g.stone.stats().grindAvg;
    const r = rubPaint(g, m, 'grind', 0.36, 0.60, 0.0006 * (1 + 2.2 * gv * gv * gv * gv), 0.55, 0.85);
    if (r.added > 0) {
      g.grindNoise = Math.min(1, g.grindNoise + r.added * 1.4);
      g.emitAt(r.hit.local, 'spark', 3, 1.0);
      g.emitAt(r.hit.local, 'dust', 2, 0.8);
    }
  },

  onTap(g, p) {
    const hit = g.pick(p.x, p.y, 1.1);
    if (hit) { g.emitAt(hit.local, 'light', 10, 1.0); g.audio.sparkle(); }
  },

  check(g) {
    const s = g.stone.stats();
    return (s.grindAvg > 0.55 && s.protHigh < 0.28) ? 3 : 2;
  }
};
