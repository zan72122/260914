import { PAL, rr } from './util.js';

export function drawBackground(ctx, L, game) {
  const { w, h, s } = L;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, PAL.skyTop);
  g.addColorStop(0.55, PAL.skyMid);
  g.addColorStop(1, PAL.skyLow);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // やわらかい夕陽の丸
  const sx = L.mode === 'portrait' ? w * 0.22 : w * 0.72;
  const sy = L.groundY - Math.min(w, h) * 0.30;
  const rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.min(w, h) * 0.42);
  rg.addColorStop(0, 'rgba(255,238,200,0.85)');
  rg.addColorStop(1, 'rgba(255,238,200,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, w, h);

  // 遠くの丘
  ctx.fillStyle = 'rgba(206,150,92,0.45)';
  ctx.beginPath();
  ctx.moveTo(-10, L.groundY);
  ctx.quadraticCurveTo(w * 0.28, L.groundY - 90 * s, w * 0.62, L.groundY - 10 * s);
  ctx.quadraticCurveTo(w * 0.85, L.groundY - 60 * s, w + 10, L.groundY + 6 * s);
  ctx.lineTo(w + 10, h + 10); ctx.lineTo(-10, h + 10);
  ctx.closePath(); ctx.fill();

  // 地面
  const gg = ctx.createLinearGradient(0, L.groundY - 20 * s, 0, h);
  gg.addColorStop(0, PAL.ground);
  gg.addColorStop(1, PAL.groundDark);
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.moveTo(-10, L.groundY + 14 * s);
  ctx.quadraticCurveTo(w * 0.5, L.groundY - 26 * s, w + 10, L.groundY + 16 * s);
  ctx.lineTo(w + 10, h + 10); ctx.lineTo(-10, h + 10);
  ctx.closePath(); ctx.fill();

  // 小石と草のかたまり（にぎやかしすぎない程度）
  ctx.fillStyle = 'rgba(120,80,45,0.18)';
  for (let i = 0; i < 6; i++) {
    const px = ((i * 137.5) % 100) / 100 * w;
    const py = L.groundY + (30 + ((i * 53) % 60)) * s;
    if (py > h) continue;
    rr(ctx, px, py, 26 * s, 10 * s, 5 * s);
    ctx.fill();
  }
}
