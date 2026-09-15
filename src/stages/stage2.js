import * as THREE from 'three';
import { approach, rubPaint, pickProtrusion } from './common.js';

// Stage 2: 粗形成（ガリガリ）
// 誘い = 砥石が回りだす / ゴースト輪郭からはみ出た出っ張りだけが光る / そこに火花が散る
const _p = new THREE.Vector3();

export default {
  enter(g) {
    const u = g.stone.material.uniforms;
    u.uPulse.value = 0;
    // この工程は「出っ張りを落とす」だけ。全周を丸めるのは Stage 3。
    g.stone.grindCap = 0.62;
    u.uGrindCap.value = 0.62;
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

    // 火花は砥石と石の「接触点」から出る（機械と石の関係が見える）
    g.sparkT += dt;
    if (g.sparkT > 0.07 && g.machines.rigExtend > 0.6) {
      g.sparkT = 0;
      g.particles.emit('spark', g.machines.contact, 3, 1.0);
      if (Math.random() < 0.25) g.audio.spark();
      // 残っている出っ張りにも小さく散らす（「ここが邪魔」の可視化）
      const d = pickProtrusion(g);
      if (d) {
        g.stone.surfacePoint(d, _p);
        g.particles.emit('spark', _p, 1, 0.7);
      }
    }
  },

  onMove(g, m) {
    // 削り進むほど全体成分を強めて、最後の出っ張りが必ず落ちるようにする
    const gv = g.stone.stats().grindAvg;
    // 出っ張り優先（protBias 0.85）。上限 0.62 まで削れたら、その頂点の発光は消える。
    const r = rubPaint(g, m, 'grind', 0.36, 0.72, 0.0008 * (1 + 2.2 * gv * gv * gv * gv), 0.55, 0.85);
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
    // 「発光する出っ張りが全部消えた」= 上限まで削れた（protHigh は上限で正規化済み）
    return (s.grindAvg > 0.52 && s.protHigh < 0.28) ? 3 : 2;
  }
};
