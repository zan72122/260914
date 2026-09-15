// ゲーム全体の状態。板ローカル座標で砂を持つので回転しても模様は保たれる。

export const state = {
  plate: 'square',        // 装着中の板
  knob: 0,                // 周波数ノブ 0..1（0 = 停止）
  socket: 0,              // 振動位置 0:中央 1:角 2:縁
  vib: 0,                 // 実際の振動の強さ（ノブを平滑化）
  pitch: 0,               // 音程 0..1
  shakePhase: 0,
  shakeX: 0,
  shakeY: 0,

  plugAnim: { from: 0, to: 0, t: 1 },        // プラグ移動アニメ
  plateAnim: { from: null, to: null, t: 1 }, // 板の載せ替えアニメ
  bowlTilt: 0,
  bowlTiltTarget: 0,
  rackPulse: [0, 0, 0],
  socketPulse: [0, 0, 0],
  knobPulse: 0,

  flight: [],             // ボウルから板へ飛んでいる砂（スクリーン座標）
  ripples: [],
  rippleTimer: 0,

  shock: 0,               // 場が切り替わった直後の崩れ
  lastBigKey: undefined,
  idleBoost: 0.5,
  converged: false,
  glow: 0,
  sparkle: 0,
  convergeHold: 0,

  rubEnergy: 0,
  lastInteract: 0,
  idle: 0,
  hint: 'bowl',
  hintPhase: 0,
  everPoured: false,
  everKnob: false,
  everRack: false,
  everSocket: false,
  time: 0,
};
