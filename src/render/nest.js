import { PAL } from './util.js';

// 火口（ほくち）：ふわふわの繊維の巣。最初から画面にある＝「ここが目的地」。
// 火種ができると、火種のほうへ少し傾いて、ゆっくり脈打つ。
export function drawNest(ctx, L, game) {
  const s = L.s;
  const n = L.nest;
  const hot = game.nest.glow;
  // 火種があるあいだは、火種と「同じリズム」で息をする＝ここが行き先だとわかる
  const waiting = (game.phase === 'ember' || game.phase === 'carry');
  const beat = (Math.sin(game.t * 5.2) + 1) / 2;         // 火種の脈と同位相
  const pulse = waiting ? 1 + Math.sin(game.t * 3.2) * 0.09 : 1;
  const tilt = game.nest.tilt * Math.sin(game.t * 1.6) * 0.5 + game.nest.tilt * 0.4;

  ctx.save();
  ctx.translate(n.x, n.y);
  ctx.rotate(-tilt * 0.35);
  ctx.scale(pulse, pulse);

  // 影
  ctx.fillStyle = 'rgba(90,53,32,0.16)';
  ctx.beginPath();
  ctx.ellipse(4 * s, n.r * 0.55, n.r * 1.0, n.r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // 光（火種が入ったあと）
  if (hot > 0.01) {
    const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, n.r * (2.0 + hot));
    rg.addColorStop(0, `rgba(255,190,90,${Math.min(0.75, 0.35 * hot)})`);
    rg.addColorStop(1, 'rgba(255,170,70,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(0, 0, n.r * (2.0 + hot), 0, Math.PI * 2);
    ctx.fill();
  }

  // ふわふわの本体：まるい塊をいくつか重ねる
  ctx.lineJoin = 'round';
  ctx.fillStyle = PAL.nestDark;
  ctx.beginPath();
  ctx.ellipse(0, n.r * 0.06, n.r * 1.02, n.r * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.45; ctx.lineWidth = 3.2 * s; ctx.strokeStyle = PAL.ink; ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = PAL.nest;
  for (let i = 0; i < 5; i++) {
    const a2 = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a2) * n.r * 0.52, Math.sin(a2) * n.r * 0.26 - n.r * 0.10,
                n.r * 0.52, n.r * 0.34, a2 * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // 中央のくぼみ（火種を置くところ）
  ctx.fillStyle = 'rgba(150,108,58,0.55)';
  ctx.beginPath();
  ctx.ellipse(0, -n.r * 0.06, n.r * 0.42, n.r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  // 繊維（もじゃもじゃ）
  ctx.strokeStyle = 'rgba(160,116,62,0.8)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.2 * s;
  for (let i = 0; i < 22; i++) {
    const a3 = (i / 22) * Math.PI * 2 + 0.3;
    const len = 1.0 + ((i * 7) % 5) * 0.07;
    const rx = Math.cos(a3) * n.r * 0.95 * len;
    const ry = Math.sin(a3) * n.r * 0.58 * len;
    const wob = Math.sin(game.t * 1.2 + i) * 3 * s;
    ctx.beginPath();
    ctx.moveTo(rx * 0.4, ry * 0.4 - n.r * 0.05);
    ctx.quadraticCurveTo(rx * 0.85 + wob, ry * 0.9, rx * 1.15 + wob, ry * 1.1 - 4 * s);
    ctx.stroke();
  }
  // 火種を待っているあいだ、くぼみが火種と同じ色・同じリズムでほのかに光る
  if (waiting) {
    const a2 = 0.16 + 0.26 * beat;
    const rg2 = ctx.createRadialGradient(0, -n.r * 0.06, 0, 0, -n.r * 0.06, n.r * 0.85);
    rg2.addColorStop(0, `rgba(255,120,50,${a2})`);
    rg2.addColorStop(1, 'rgba(255,120,50,0)');
    ctx.fillStyle = rg2;
    ctx.beginPath();
    ctx.ellipse(0, -n.r * 0.06, n.r * 0.85, n.r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 明るく焼けはじめた芯
  if (hot > 0.01) {
    ctx.fillStyle = `rgba(255,${Math.round(120 + 60 * Math.min(1, hot))},60,${Math.min(0.9, 0.5 * hot)})`;
    ctx.beginPath();
    ctx.ellipse(0, -n.r * 0.08, n.r * 0.34, n.r * 0.20, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
