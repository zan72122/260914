import { PAL, rr, dustColor, circle } from './util.js';

// 板に残る摩擦跡は、消えずに積もっていく（遊ぶたび少しちがう模様になる）
export class Marks {
  constructor() { this.canvas = null; this.ctx = null; this.w = 0; this.h = 0; }
  ensure(w, h) {
    if (this.canvas && this.w === w && this.h === h) return;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    const cx = c.getContext('2d');
    if (this.canvas) cx.drawImage(this.canvas, 0, 0, c.width, c.height); // 回転時も模様を保つ
    this.canvas = c; this.ctx = cx; this.w = w; this.h = h;
  }
  clear() { if (this.ctx) this.ctx.clearRect(0, 0, this.w, this.h); }
  consume(queue) {
    if (!this.ctx) return;
    const cx = this.ctx;
    for (const m of queue) {
      cx.globalAlpha = m.a;
      cx.fillStyle = '#3a2413';
      cx.beginPath();
      cx.ellipse(m.x, m.y, m.r * 1.6, m.r * 0.7, 0, 0, Math.PI * 2);
      cx.fill();
    }
    cx.globalAlpha = 1;
    queue.length = 0;
  }
}

export function drawBoard(ctx, L, game, marks) {
  const { s } = L;
  const b = L.board;
  const shake = game.shake * 1.6 * s;
  ctx.save();
  ctx.translate(Math.sin(game.t * 60) * shake, Math.cos(game.t * 47) * shake * 0.5);

  // 影
  ctx.fillStyle = 'rgba(90,53,32,0.18)';
  rr(ctx, b.x + 6 * s, b.y + b.h - 2 * s, b.w, b.h * 0.7, b.r);
  ctx.fill();

  // 板本体
  const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
  g.addColorStop(0, PAL.board);
  g.addColorStop(1, PAL.boardDark);
  ctx.fillStyle = g;
  rr(ctx, b.x, b.y, b.w, b.h, b.r);
  ctx.fill();
  ctx.lineWidth = 3.2 * s;
  ctx.strokeStyle = PAL.ink;
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 木目
  ctx.strokeStyle = 'rgba(90,53,32,0.16)';
  ctx.lineWidth = 2 * s;
  for (let i = 1; i <= 2; i++) {
    const y = b.y + (b.h * i) / 3;
    ctx.beginPath();
    ctx.moveTo(b.x + 12 * s, y);
    ctx.quadraticCurveTo(b.x + b.w * 0.5, y + 4 * s, b.x + b.w - 12 * s, y);
    ctx.stroke();
  }

  // 積もった摩擦跡
  if (marks && marks.canvas) {
    ctx.save();
    rr(ctx, b.x, b.y, b.w, b.h, b.r);
    ctx.clip();
    ctx.drawImage(marks.canvas, 0, 0, L.w, L.h);
    ctx.restore();
  }

  // くぼみ（摩擦点）：進むほど黒くなる
  const lv = game.charLevel();
  const f = L.friction;
  ctx.fillStyle = dustColor(Math.max(0.15, lv));
  ctx.beginPath();
  ctx.ellipse(f.x, f.y + 3 * s, 15 * s, 7 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // 木粉の山（進捗の“ゲージ”のかわり）
  const amt = Math.min(1, game.progress * 1.15);
  if (amt > 0.01) {
    const pw = (16 + 42 * amt) * s;
    const ph = (5 + 20 * amt) * s;
    ctx.fillStyle = dustColor(lv);
    ctx.beginPath();
    ctx.moveTo(f.x - pw, f.y + 13 * s);
    ctx.bezierCurveTo(f.x - pw * 0.72, f.y + 12 * s - ph * 0.95,
                      f.x - pw * 0.18, f.y + 11 * s - ph,
                      f.x + pw * 0.04, f.y + 11 * s - ph);
    ctx.bezierCurveTo(f.x + pw * 0.34, f.y + 11 * s - ph,
                      f.x + pw * 0.78, f.y + 12 * s - ph * 0.9,
                      f.x + pw, f.y + 14 * s);
    ctx.quadraticCurveTo(f.x, f.y + 18 * s, f.x - pw, f.y + 13 * s);
    ctx.closePath();
    ctx.fill();
    // ざらつき
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + game.t * 0.0;
      circle(ctx, f.x + Math.cos(a) * pw * 0.7, f.y + 10 * s - Math.abs(Math.sin(a)) * ph * 0.6, 2 * s);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
