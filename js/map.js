// 星空マップ: クリア済みの面は色の付いた星、未クリアは空の輪。
(function () {
  const BG = '#101637';
  let pos = []; // 各面の画面座標 {x, y}
  let starR = 10;

  function layout(box, n) {
    const portrait = box.h >= box.w;
    const cols = portrait ? 3 : 6, rows = Math.ceil(n / cols);
    const padX = box.w * 0.16, padY = box.h * 0.14;
    const cw = (box.w - padX * 2) / (cols - 1), rh = (box.h - padY * 2) / (rows - 1);
    starR = Math.min(box.s * 0.045, cw * 0.28, rh * 0.28);
    pos = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols);
      let col = i % cols;
      if (row % 2 === 1) col = cols - 1 - col; // 蛇行して道をつなぐ
      const x = box.x0 + padX + col * cw;
      const y = box.y0 + padY + row * rh;
      // 少し揺らして有機的に
      const jx = Math.sin(i * 2.3) * cw * 0.08, jy = Math.cos(i * 1.7) * rh * 0.08;
      pos.push({ x: x + jx, y: y + jy });
    }
  }

  function hit(x, y) {
    let best = -1, bd = starR * 2.2;
    for (let i = 0; i < pos.length; i++) {
      const d = Math.hypot(pos[i].x - x, pos[i].y - y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // colors[i]: その面の星の色, cleared[i]: bool, next: 誘う星の番号, fillAnim: {i, t} 満たされる途中
  function draw(ctx, W, H, now, colors, cleared, next, fillAnim, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    // 背景の小さな星
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 40; i++) {
      const x = ((i * 137.5) % 1000) / 1000 * W, y = ((i * 91.7) % 1000) / 1000 * H;
      const tw = 0.6 + 0.4 * Math.sin(now * 1.3 + i);
      ctx.beginPath(); ctx.arc(x, y, 1.2 * tw + 0.6, 0, Math.PI * 2); ctx.fill();
    }
    // 道
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.setLineDash([4, 8]);
    ctx.beginPath();
    for (let i = 0; i < pos.length; i++) { if (i === 0) ctx.moveTo(pos[i].x, pos[i].y); else ctx.lineTo(pos[i].x, pos[i].y); }
    ctx.stroke(); ctx.setLineDash([]);
    // 星
    for (let i = 0; i < pos.length; i++) {
      const p = pos[i];
      let filled = cleared[i] ? 1 : 0;
      if (fillAnim && fillAnim.i === i) filled = Math.min(1, fillAnim.t);
      const isNext = i === next;
      const breath = isNext ? 1 + 0.08 * Math.sin(now * 2.5) : 1;
      const r = starR * breath;
      if (isNext) {
        ctx.save(); ctx.shadowColor = 'rgba(255,255,255,0.9)'; ctx.shadowBlur = r * 1.2;
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = r * 0.22;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = r * 0.16;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
      }
      if (filled > 0) {
        ctx.save(); ctx.shadowColor = colors[i]; ctx.shadowBlur = r * 0.9 * filled;
        ctx.fillStyle = colors[i];
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.86 * filled, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath(); ctx.ellipse(p.x - r * 0.25, p.y - r * 0.3, r * 0.3 * filled, r * 0.2 * filled, -0.6, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  window.StarMap = { layout, hit, draw, pos: () => pos, starR: () => starR, BG };
})();
