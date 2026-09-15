import { approach, rubPaint } from './common.js';

// Stage 4: 研磨（つるつる）
// 誘い = すりガラスの下で中の光が脈打つ / 磨けた場所には星の一部がもう見えている
export default {
  enter(g) {
    g.machines.wheelSpin = 11;
    g.stone.spinSpeed = 0.85;
    g.polishNoise = 0;
    g.starBurst = 0;
    g.audio.setGrind(0);
    g.audio.setWater(0);
    g.audio.blip(660, 0.45, 'sine', 0.09);
  },

  update(g, dt) {
    const u = g.stone.material.uniforms;
    const s = g.stone.stats();

    g.machines.rigExtend = approach(g.machines.rigExtend, 0, dt, 2.4);
    g.machines.padExtend = approach(g.machines.padExtend, 1, dt, 2.2);
    g.machines.dopPulse = 0.1;
    g.stone.ghostMaterial.uniforms.uOpacity.value =
      approach(g.stone.ghostMaterial.uniforms.uOpacity.value, 0, dt, 2.5);
    if (g.stone.ghostMaterial.uniforms.uOpacity.value < 0.01) g.stone.ghost.visible = false;

    u.uProtGlow.value = approach(u.uProtGlow.value, 0, dt, 3);
    u.uPulse.value = approach(u.uPulse.value, 0.75, dt, 2);
    u.uStarForm.value = approach(u.uStarForm.value, Math.min(1, s.polishAvg * 2.4), dt, 4);
    u.uStarBoost.value = approach(u.uStarBoost.value, 1.5 + s.polishAvg * 1.1, dt, 3);
    u.uGlow.value = approach(u.uGlow.value, 0.04, dt, 3);

    g.stone.group.position.copy(g.layout.conf.stone);

    g.polishNoise *= Math.exp(-dt * 5);
    g.audio.setPolish(g.polishNoise);
    g.audio.setMotor(g.machines.padExtend * 0.6, 30);
  },

  onMove(g, m) {
    // 最後の曇りが必ず消えるよう、磨きが進むほど全体成分を強める
    const pv = g.stone.stats().polishAvg;
    const r = rubPaint(g, m, 'polish', 0.40, 0.34, 0.0018 * (1 + 2.6 * pv * pv * pv * pv), 0.6);
    if (r.added > 0) {
      g.polishNoise = Math.min(1, g.polishNoise + r.added * 1.6);
      if (Math.random() < 0.6) g.emitAt(r.hit.local, 'light', 1, 0.5);
    }
  },

  onTap(g, p) {
    const hit = g.pick(p.x, p.y, 1.1);
    if (hit) { g.emitAt(hit.local, 'light', 10, 1.0); g.audio.sparkle(); }
  },

  check(g) { return g.stone.stats().polishAvg > 0.985 ? 5 : 4; }
};
