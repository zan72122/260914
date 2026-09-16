// state.js
// フェーズマシンと「進み方」のモデル。
//   drill → ember → carry → blow → flame →（タップでリスタート）
//
// 設計上の約束:
//  * 進捗は絶対に減らない（失敗が存在しない）
//  * 1ストロークめから必ず木粉が出る（空振りゼロ）
//  * 進捗の表示は木粉の量・黒さ・煙・火種だけ。ゲージも文字もない。

import { Particles } from './particles.js';

export const PHASE = {
  DRILL: 'drill',   // 弓できりもみ（IDLE も同じフェーズ。最初の一擦りで自然に始まる）
  EMBER: 'ember',   // 火種が生まれた
  CARRY: 'carry',   // 火種を指で運んでいる
  BLOW:  'blow',    // 火口に息を吹きこむ
  FLAME: 'flame',   // 炎
};

// ひと擦り（弓のフルストローク）で得られる進捗。
// 4歳児がだいたい 15〜30 ストロークで火種にたどりつく量。
const SWEEP_GAIN = 0.055;
const REVERSAL_BONUS = 0.012;

export class Game {
  constructor() {
    this.particles = new Particles();
    this.markQueue = [];   // 板に残る摩擦跡（オフスクリーンcanvasが消費する）
    this.reset(true);
  }

  reset(hard) {
    this.phase = PHASE.DRILL;
    this.progress = 0;
    this.strokeCount = 0;
    this.t = 0;

    this.bowOffset = 0;       // 弓の左右位置（px, 中心からのずれ）
    this.bowVel = 0;
    this.spindleAngle = 0;
    this.activity = 0;        // なめらかにした擦りの勢い 0..1
    this.shake = 0;           // 板の微振動
    this.sinceStroke = 999;
    this.lastDir = 0;
    this.dirAccum = 0;
    this.emitAccum = 0;
    this.lastSpeed = 0;
    this.touching = false;

    this.ember = { x: 0, y: 0, tx: 0, ty: 0, active: false, carry: false, fly: 0, born: 0 };
    this.emberWait = 0;
    this.spindleLift = 0;   // 火種ができたら、きり棒は持ちあげられて火種が「むきだし」になる
    this.setAside = 0;      // 息をふく段になったら、きり棒は板のわきに寝かせたままにする
    this.nest = { glow: 0, puffs: 0, tilt: 0 };
    this.blowT = 0;
    this.sincePuff = 0;
    this.puffAnim = 0;
    this.lean = 0;            // 大人が火口へ寄る度合い 0..1
    this.flameT = 0;
    this.restartArmed = false;

    this.fade = 0;            // 0=見えている 1=真っ白（暗転）
    this.fadeDir = 0;
    this.pendingReset = false;

    this.particles.clear();
    if (hard) this.markReset = true; else this.markReset = true;
  }

  // ---- 入力（input.js から呼ばれる）-------------------------------------

  // 指の横移動（画面のどこで始めてもよい「見えないレール」）
  drag(dx, speed, L) {
    if (this.phase !== PHASE.DRILL) return;
    const tr = L.bow.travel;
    const before = this.bowOffset;
    this.bowOffset = clamp(this.bowOffset + dx, -tr, tr);
    const applied = this.bowOffset - before;
    const adist = Math.abs(applied);
    if (adist < 0.01) return;

    this.bowVel = speed;
    this.lastSpeed = Math.abs(speed);
    this.activity = Math.min(1, this.activity + adist / (tr * 0.9));
    this.shake = Math.min(1, this.shake + adist / (tr * 1.2));

    // きり棒の回転は弓の速度そのまま（自然な対応づけ）
    this.spindleAngle += applied * 0.055;

    // 進捗（絶対に減らない）
    this.progress = Math.min(1, this.progress + (adist / (tr * 2)) * SWEEP_GAIN);
    this.sinceStroke = 0;

    // ストローク検出（折り返し＝1ストローク）
    const dir = Math.sign(applied);
    if (dir !== 0) {
      if (this.lastDir === 0) this.lastDir = dir;
      else if (dir !== this.lastDir) {
        if (Math.abs(this.dirAccum) > tr * 0.12) {
          this.strokeCount++;
          this.progress = Math.min(1, this.progress + REVERSAL_BONUS);
        }
        this.lastDir = dir;
        this.dirAccum = 0;
      }
      this.dirAccum += applied;
    }

    // 木粉：距離に比例して必ず出る
    this.emitAccum += adist;
    const step = 5;
    let guard = 0;
    while (this.emitAccum >= step && guard++ < 6) {
      this.emitAccum -= step;
      this.emitDust(L, this.lastSpeed);
    }

    // 板に残る摩擦跡（個性が出る）
    if (Math.random() < 0.25) {
      this.markQueue.push({
        x: L.friction.x + rnd(-10, 10) * L.s + this.bowOffset * 0.05,
        y: L.friction.y + rnd(2, 12) * L.s,
        r: (3 + Math.random() * 5) * L.s,
        a: 0.05 + 0.10 * this.progress,
      });
    }
    if (this.phase === PHASE.DRILL && this.progress >= 1) this.bornEmber(L);
  }

  pointerDown(x, y, L) {
    this.touching = true;
    if (this.phase === PHASE.FLAME) {
      if (this.restartArmed && this.fadeDir === 0) {
        this.fadeDir = 1; this.pendingReset = true;
      }
      return;
    }
    if (this.phase === PHASE.EMBER) {
      // 火口を直接タップしたら、そのまま火口へ
      if (dist(x, y, L.nest.x, L.nest.y) < L.nest.r * 2.6) { this.startFly(); return; }
      // それ以外は画面のどこを触っても火種がふわりと浮いて指についてくる。
      // （火種が出たあとも弓を擦りつづける子が、無反応にならないように）
      const e = this.ember;
      e.carry = true;
      e.tx = x;
      e.ty = y - 60 * Math.max(1, L.s * 0.9);
      this.phase = PHASE.CARRY;
      return;
    }
    if (this.phase === PHASE.BLOW) { this.puff(L); return; }
  }

  pointerMove(x, y, L) {
    if (this.phase === PHASE.CARRY && this.ember.carry) {
      // 指で隠れないように、火種は指より少し上に持ち上げて描く
      this.ember.tx = x;
      this.ember.ty = y - 60 * Math.max(1, L.s * 0.9);
    }
  }

  pointerUp(x, y, L) {
    this.touching = false;
    if (this.phase === PHASE.CARRY) {
      // 途中で離しても、火種はふわっと火口まで飛んでいく（失敗しない）
      this.startFly();
    }
  }

  // ---- 内部 --------------------------------------------------------------

  bornEmber(L) {
    this.phase = PHASE.EMBER;
    this.emberWait = 0;
    this.ember.active = true;
    this.ember.x = L.friction.x;
    this.ember.y = L.friction.y - 6 * L.s;
    this.ember.born = this.t;
  }

  startFly() {
    this.ember.carry = false;
    this.ember.fly = 0.0001;
    this.phase = PHASE.CARRY;
  }

  puff(L) {
    if (this.phase !== PHASE.BLOW) return;
    if (this.sincePuff < 0.45) return;
    this.sincePuff = 0;
    this.nest.puffs++;
    this.puffAnim = 1;
    this.nest.glow = Math.min(1.6, this.nest.glow + 0.45);

    const c = L.character;
    const mouth = this.mouthPos(L);
    for (let i = 0; i < 10; i++) {
      const a = Math.atan2(L.nest.y - mouth.y, L.nest.x - mouth.x) + rnd(-0.22, 0.22);
      const sp = rnd(240, 430) * Math.max(0.8, c.scale);
      this.particles.spawn({
        type: 'breath', x: mouth.x + rnd(-6, 6), y: mouth.y + rnd(-6, 6),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: (5 + Math.random() * 7) * c.scale, gr: 8, life: rnd(0.4, 0.7), drag: 1.2,
      });
    }
    for (let i = 0; i < 14; i++) {
      const a = rnd(-Math.PI, 0);
      this.particles.spawn({
        type: 'spark', x: L.nest.x + rnd(-14, 14) * L.s, y: L.nest.y + rnd(-8, 4) * L.s,
        vx: Math.cos(a) * rnd(40, 220), vy: Math.sin(a) * rnd(60, 260),
        g: 260, r: (1.6 + Math.random() * 2.2) * L.s, life: rnd(0.5, 1.1), wob: 12,
      });
    }
    if (this.nest.puffs >= 3) {
      this.phase = PHASE.FLAME;
      this.flameT = 0;
      for (let i = 0; i < 26; i++) {
        const a = rnd(-Math.PI, 0);
        this.particles.spawn({
          type: 'spark', x: L.nest.x + rnd(-18, 18) * L.s, y: L.nest.y - 6 * L.s,
          vx: Math.cos(a) * rnd(60, 300), vy: Math.sin(a) * rnd(120, 420),
          g: 220, r: (1.8 + Math.random() * 2.6) * L.s, life: rnd(0.8, 1.6), wob: 16,
        });
      }
    }
  }

  mouthPos(L) {
    const c = L.character;
    const hx = c.head.x + (c.leanTo.x - c.head.x) * this.lean;
    const hy = c.head.y + (c.leanTo.y - c.head.y) * this.lean;
    return { x: hx - c.head.r * 0.10, y: hy + c.head.r * 0.45 };
  }

  emitDust(L, speed) {
    // 速い＝細かい粉が広く散る／ゆっくり＝大きめのフレークが少し
    const fast = Math.min(1, speed / 900);
    const s = L.s;
    const spread = 0.5 + fast * 1.5;
    const a = -Math.PI / 2 + rnd(-0.9, 0.9) * spread + (this.bowVel > 0 ? 0.3 : -0.3);
    const sp = rnd(30, 90) * (0.6 + fast) * s;
    this.particles.spawn({
      type: 'dust',
      x: L.friction.x + rnd(-6, 6) * s,
      y: L.friction.y + rnd(-2, 4) * s,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      g: 760 * s, drag: 1.4,
      r: (1.2 + (1 - fast) * 2.6 + Math.random() * 1.4) * s,
      life: rnd(0.3, 0.6),
      rot: Math.random() * 6.28, vr: rnd(-6, 6),
      hue: this.charLevel(),
    });
  }

  emitSmoke(L, strength) {
    const s = L.s;
    this.particles.spawn({
      type: 'smoke',
      x: L.friction.x + rnd(-5, 5) * s,
      y: L.friction.y - 6 * s,
      vx: rnd(-8, 8) * s, vy: -rnd(26, 52) * s * (0.7 + strength),
      r: (5 + Math.random() * 6) * s, gr: (14 + 12 * strength) * s,
      life: rnd(1.4, 2.4), wob: (10 + 26 * this.activity) * s,
      alpha: 0.10 + 0.22 * strength,
    });
  }

  // きり棒の描画オフセット（板のゆれ＋火種誕生後の持ちあげ）。
  // きり棒・弦の巻きつき・押さえる手が、いつも同じ位置になるように一か所で計算する。
  spindleOffset(L) {
    const sh = this.shake * 1.2 * L.s;
    // 息をふく段になったら、持ちあげたきり棒は板のわきに「寝かせる」（宙に浮かせない）。
    // 顔の寄り（lean）ではなく setAside で決めるので、炎のあとで体を起こしても寝たまま。
    const a = this.setAside;
    const k = this.spindleLift * (1 - 0.9 * a);
    return {
      // 寝かせるときは、火口・炎・煙の柱から十分はなれた右へずらす
      dx: Math.sin(this.t * 61) * sh + 26 * L.s * k + 40 * L.s * a,
      dy: -60 * L.s * k,
      tilt: a * 1.45,   // 根もとを軸に、ころんと横になる
    };
  }

  // きり棒を押さえる手・腕の見え方。
  // 顔を火口へ寄せたとき、またはきり棒を寝かせたあとは、手はもう棒を押さえていない。
  holdFade() {
    return Math.max(0, 1 - Math.max(this.lean, this.setAside) * 1.6);
  }

  // 木粉・くぼみの黒さ 0..1（進捗の唯一の“表示”のひとつ）
  charLevel() { return clamp((this.progress - 0.08) / 0.62, 0, 1); }

  // ---- 毎フレーム --------------------------------------------------------

  update(dt, L) {
    this.t += dt;
    this.sinceStroke += dt;

    // 勢いの減衰
    this.activity = Math.max(0, this.activity - dt * 2.2);
    this.shake = Math.max(0, this.shake - dt * 4.0);
    this.bowVel *= Math.max(0, 1 - dt * 6);

    // 指を離したら弓はゆっくり中央へ（次のストロークの余地をつくる）
    if (!this.touching) {
      this.bowOffset += (0 - this.bowOffset) * Math.min(1, dt * 1.4);
    }
    // 何もしていないときの、ごく小さなゆれ（「動かしてね」の気配）
    this.spindleAngle += this.bowVel * 0.0006;

    // やさしい自動アシスト：何度か擦ったあと長く止まっても、決して戻らない。
    // さらに長く止まったときだけ、ごくゆっくり前へ進む（必ず成功するため）
    if (this.phase === PHASE.DRILL && this.strokeCount >= 4 && this.sinceStroke > 8) {
      this.progress = Math.min(1, this.progress + dt * 0.02);
      if (this.progress >= 1) this.bornEmber(L);
    }

    // 火種が生まれたら、きり棒は上へどかされる（火種の上に何もない状態にする）
    const liftTarget = this.phase === PHASE.DRILL ? 0 : 1;
    this.spindleLift += (liftTarget - this.spindleLift) * Math.min(1, dt / 0.6 * 2.2);
    const asideTarget = (this.phase === PHASE.BLOW || this.phase === PHASE.FLAME) ? 1 : 0;
    this.setAside += (asideTarget - this.setAside) * Math.min(1, dt * 2.2);

    // 煙：黒くなってきたら細く、そのあと濃く
    const sm = this.smokeStrength();
    if (sm > 0) {
      this.smokeAccum = (this.smokeAccum || 0) + dt * (2 + 16 * sm) * (0.35 + this.activity);
      while (this.smokeAccum >= 1) { this.smokeAccum -= 1; this.emitSmoke(L, sm); }
    }

    if (this.phase === PHASE.EMBER) {
      // 長いあいだ手が出なければ、火種のほうから火口へ飛んでいく（必ず成功する）
      this.emberWait = (this.emberWait || 0) + dt;
      if (this.emberWait > 6) this.startFly();
      // ときどき小さな火の粉（「ここにいるよ」）
      if (Math.random() < dt * 2.2) {
        this.particles.spawn({
          type: 'spark', x: this.ember.x + rnd(-6, 6) * L.s, y: this.ember.y - 2 * L.s,
          vx: rnd(-30, 30), vy: -rnd(40, 120), g: 120,
          r: (1.2 + Math.random() * 1.4) * L.s, life: rnd(0.5, 1.0), wob: 10,
        });
      }
      this.nest.tilt += ((Math.sin(this.t * 2.0) * 0.10 + 0.12) - this.nest.tilt) * dt * 3;
      // 火種のまわりから立ちのぼる煙
      if (Math.random() < dt * 8) this.emitSmoke(L, 0.8);
    }

    if (this.phase === PHASE.CARRY) {
      const e = this.ember;
      if (e.carry && e.fly <= 0) {
        // 指の少し上へ、ふわっと寄ってから追従する
        const k = Math.min(1, dt * 8);
        e.x += (e.tx - e.x) * k;
        e.y += (e.ty - e.y) * k;
      }
      if (e.fly > 0) {
        e.fly = Math.min(1, e.fly + dt / 0.8);
        const k = easeInOut(e.fly);
        e.x += (L.nest.x - e.x) * k * 0.22;
        e.y += (L.nest.y - e.y - 4 * L.s) * k * 0.22;
        if (e.fly >= 1) {
          e.x = L.nest.x; e.y = L.nest.y - 4 * L.s;
          this.phase = PHASE.BLOW;
          this.sincePuff = 1.2;
          this.nest.glow = 0.5;
          this.blowT = 0;
        }
      }
      // 運んでいるあいだも煙
      if (Math.random() < dt * 10) {
        this.particles.spawn({
          type: 'smoke', x: e.x + rnd(-4, 4) * L.s, y: e.y - 4 * L.s,
          vx: rnd(-10, 10) * L.s, vy: -rnd(30, 60) * L.s,
          r: 5 * L.s, gr: 20 * L.s, life: 1.4, wob: 14 * L.s, alpha: 0.2,
        });
      }
    }

    if (this.phase === PHASE.BLOW) {
      this.blowT += dt;
      this.sincePuff += dt;
      this.lean += (1 - this.lean) * Math.min(1, dt * 2.2);
      // 触りっぱなしでも吹ける／何もしなくても自動でつづく（必ず成功する）
      if (this.touching && this.sincePuff > 0.9) this.puff(L);
      else if (this.sincePuff > 3.0) this.puff(L);
      this.nest.glow = Math.max(0.35, this.nest.glow - dt * 0.25);
      if (Math.random() < dt * (4 + 10 * this.nest.glow)) {
        this.particles.spawn({
          type: 'smoke', x: L.nest.x + rnd(-10, 10) * L.s, y: L.nest.y - 10 * L.s,
          vx: rnd(-12, 12) * L.s, vy: -rnd(30, 70) * L.s,
          r: 6 * L.s, gr: 22 * L.s, life: 1.6, wob: 16 * L.s, alpha: 0.18,
        });
      }
    } else if (this.phase !== PHASE.FLAME) {
      this.lean = Math.max(0, this.lean - dt * 1.5);
    }

    if (this.phase === PHASE.FLAME) {
      this.flameT += dt;
      // 炎が上がったら、そっと体を起こして見守る姿勢へ（顔が炎にかからない位置）
      const rest = (L.character.flameLean == null ? 0.55 : L.character.flameLean);
      this.lean += (rest - this.lean) * Math.min(1, dt * 2.5);
      this.nest.glow = Math.min(1.6, this.nest.glow + dt * 0.6);
      if (Math.random() < dt * 14) {
        this.particles.spawn({
          type: 'spark', x: L.nest.x + rnd(-16, 16) * L.s, y: L.nest.y - rnd(10, 60) * L.s,
          vx: rnd(-40, 40), vy: -rnd(60, 190), g: 60,
          r: (1.4 + Math.random() * 1.8) * L.s, life: rnd(0.7, 1.5), wob: 18,
        });
      }
      if (this.flameT > 4) this.restartArmed = true;
    }

    this.puffAnim = Math.max(0, this.puffAnim - dt * 2.2);

    // 暗転→リセット→明転
    if (this.fadeDir === 1) {
      this.fade = Math.min(1, this.fade + dt / 0.5);
      if (this.fade >= 1 && this.pendingReset) {
        this.pendingReset = false;
        this.reset();
        this.fade = 1; this.fadeDir = -1;
      }
    } else if (this.fadeDir === -1) {
      this.fade = Math.max(0, this.fade - dt / 0.6);
      if (this.fade <= 0) this.fadeDir = 0;
    }

    this.particles.update(dt, this.t);
  }

  smokeStrength() {
    if (this.phase === PHASE.FLAME) return 0;
    if (this.phase !== PHASE.DRILL) return 0.9;
    const p = this.progress;
    if (p < 0.42) return 0;
    return clamp((p - 0.42) / 0.5, 0, 1) * (0.25 + 0.75 * Math.min(1, this.activity + 0.25));
  }
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function rnd(a, b) { return a + Math.random() * (b - a); }
function dist(x1, y1, x2, y2) { const dx = x1 - x2, dy = y1 - y2; return Math.hypot(dx, dy); }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
