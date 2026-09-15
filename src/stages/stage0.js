import { approach, rubPaint } from './common.js';

// Stage 0: 原石（ころころ・のぞく）
// 誘い = ゆっくり自転してときどき光が走る / 薄皮の一箇所が脈打つ / 良い向きで石がふわっと光る

export default {
  enter(g) {
    const u = g.stone.material.uniforms;
    u.uStarForm.value = 0;
    u.uStarBoost.value = 1.15;
    u.uProtGlow.value = 0;
    u.uPulse.value = 0;
    u.uGrindCap.value = 1.0;
    g.stone.grindCap = 1.0;
    g.stone.spinSpeed = 0;
    g.stone.spin = 0;
    g.stone.ghost.visible = false;
    g.stone.ghostMaterial.uniforms.uOpacity.value = 0;
    g.machines.dopExtend = 0;
    g.machines.rigExtend = 0;
    g.machines.padExtend = 0;
    g.machines.pedExtend = 0;
    g.machines.wheelSpin = 0;
    g.machines.dopPulse = 0;
    g.machines.shelf.visible = false;
    g.machines.nextStone.visible = false;
    g.audio.silence();
    g.goodTimer = 0;
    g.locked = false;
    g.stone.group.position.copy(g.layout.conf.stone);
  },

  update(g, dt) {
    const u = g.stone.material.uniforms;
    const st = g.stone.stats();
    const idle = (g.t - g.lastTouch) > 0.7;
    const engaged = g.hasTouched && (g.t - g.lastTouch) < 6.0;
    const a = g.align;

    // 良い向きへの吸い寄せ（磁石のような助け・失敗しない）
    // 誰も触っていないときは吸い寄せない（勝手に進まないように）
    if (engaged && a > 0.32) {
      g.assist(dt * (0.20 + 2.2 * (a - 0.32)));
    } else if (idle) {
      // ゆっくり自転（触りたくなる誘い）
      g.trackball(dt * 13, dt * 4.5);
    }

    // ときどき光が走る
    const sweep = Math.pow(Math.max(0, Math.sin(g.t * 0.55)), 12);
    const good = a > 0.92 ? 0.22 + 0.18 * Math.sin(g.t * 5.5) : 0;
    u.uGlow.value = approach(u.uGlow.value, 0.05 + 0.35 * sweep + good, dt, 8);

    // 薄皮ヒント（窓を開けたくなる場所）。窓が開くほど消える
    // 薄皮ヒント（窓を開けたくなる場所）: 脈打つ淡い青白い斑。窓が開くほど消える
    u.uHintStrength.value = Math.max(0, 1 - st.windowAvg * 22) * 1.15;

    g.audio.setDrone(a);

    if (engaged && a > 0.92) {
      g.goodTimer += dt;
      if (Math.random() < dt * 22) {
        g.particles.emit('light', g.stone.group.position, 2, 1.6);
      }
    } else {
      g.goodTimer = Math.max(0, g.goodTimer - dt * 1.5);
    }
  },

  onMove(g, m) {
    const hit = g.pick(m.x, m.y, 1.06);
    // 転がす（こすっている間は回転を弱めて、窓が開くようにする）
    g.trackball(m.dx, m.dy, (m.rub ? 0.0016 : 0.0060) * (hit ? 1 : 0.55));

    // 窓開け: こすった場所だけ平らな窓になり内部が見える
    if (hit) {
      const r = rubPaint(g, m, 'window', 0.26, m.rub ? 0.55 : 0.10, 0);
      const added = r.added;
      if (added > 0.02) {
        g.emitAt(hit.local, 'dust', 1, 0.6);
        if (Math.random() < 0.2) g.emitAt(hit.local, 'light', 1, 0.4);
        if (Math.random() < 0.12) g.audio.blip(520 + Math.random() * 420, 0.06, 'triangle', 0.05);
      }
    }
  },

  onTap(g, p) {
    const hit = g.pick(p.x, p.y, 1.1);
    if (!hit) return;
    g.emitAt(hit.local, 'light', 14, 1.2);
    g.audio.sparkle();
  },

  check(g) { return g.goodTimer > 0.7 ? 1 : 0; }
};
