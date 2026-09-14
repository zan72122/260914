/** 楽器の絵。すべてコードで描く(画像素材なし)。 */
import type { InstrumentId } from '../app/state';
import { type Ctx, paperFill, circle, ellipse, roundRect } from './paper';

export const INSTRUMENT_COLOR: Record<InstrumentId, string> = {
  drum: '#d94f4f', clap: '#a2643a', shaker: '#f2c744', bell: '#e0a92c',
  bird: '#4f8fd9', marimba: '#c98a4b', flute: '#8b5a2b', frog: '#5cb85c',
};

/**
 * 楽器を (x, y) を中心に描く。size = 基準サイズ。
 * wobble: -1..1 の揺れ(鳴った直後)。
 */
export function drawInstrument(ctx: Ctx, id: InstrumentId, x: number, y: number, size: number, wobble = 0, scale = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(wobble * 0.18);
  ctx.scale(scale * (1 + Math.abs(wobble) * 0.12), scale * (1 - Math.abs(wobble) * 0.08));
  const s = size;
  switch (id) {
    case 'drum': {
      paperFill(ctx, '#d94f4f', (c) => roundRect(c, -s * 0.42, -s * 0.28, s * 0.84, s * 0.62, s * 0.1));
      // 白い紐の模様
      ctx.strokeStyle = 'rgba(255,245,220,0.85)'; ctx.lineWidth = s * 0.05;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const x0 = -s * 0.36 + i * s * 0.24;
        ctx.moveTo(x0, -s * 0.2); ctx.lineTo(x0 + s * 0.12, s * 0.28);
      }
      ctx.stroke();
      paperFill(ctx, '#fff3d6', (c) => ellipse(c, 0, -s * 0.28, s * 0.42, s * 0.16), 2);
      break;
    }
    case 'clap': {
      paperFill(ctx, '#a2643a', (c) => { c.beginPath(); c.ellipse(-s * 0.05, s * 0.05, s * 0.34, s * 0.26, -0.25, 0, Math.PI * 2); });
      paperFill(ctx, '#c98a4b', (c) => { c.beginPath(); c.ellipse(s * 0.05, -s * 0.12, s * 0.34, s * 0.26, -0.25, 0, Math.PI * 2); }, 2);
      ctx.strokeStyle = '#5c3a1a'; ctx.lineWidth = s * 0.06;
      ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.34); ctx.lineTo(-s * 0.36, -s * 0.05); ctx.stroke();
      break;
    }
    case 'shaker': {
      paperFill(ctx, '#f2c744', (c) => { c.beginPath(); c.ellipse(0, -s * 0.05, s * 0.3, s * 0.4, 0, 0, Math.PI * 2); });
      paperFill(ctx, '#8b5a2b', (c) => roundRect(c, -s * 0.08, s * 0.28, s * 0.16, s * 0.24, s * 0.05), 2);
      ctx.fillStyle = '#d94f4f';
      for (const [dx, dy] of [[-0.12, -0.2], [0.1, -0.05], [-0.05, 0.12], [0.14, -0.25]]) {
        circle(ctx, dx * s, dy * s, s * 0.045); ctx.fill();
      }
      break;
    }
    case 'bell': {
      paperFill(ctx, '#e0a92c', (c) => {
        c.beginPath();
        c.moveTo(-s * 0.36, s * 0.22);
        c.quadraticCurveTo(-s * 0.3, -s * 0.1, -s * 0.12, -s * 0.3);
        c.quadraticCurveTo(0, -s * 0.42, s * 0.12, -s * 0.3);
        c.quadraticCurveTo(s * 0.3, -s * 0.1, s * 0.36, s * 0.22);
        c.closePath();
      });
      paperFill(ctx, '#b8801a', (c) => roundRect(c, -s * 0.4, s * 0.2, s * 0.8, s * 0.12, s * 0.05), 2);
      paperFill(ctx, '#7a4f10', (c) => circle(c, 0, s * 0.36, s * 0.08), 1);
      paperFill(ctx, '#7a4f10', (c) => circle(c, 0, -s * 0.4, s * 0.07), 1);
      break;
    }
    case 'bird': {
      paperFill(ctx, '#4f8fd9', (c) => ellipse(c, 0, 0, s * 0.38, s * 0.3));
      paperFill(ctx, '#3a6fb0', (c) => { c.beginPath(); c.ellipse(-s * 0.08, s * 0.02, s * 0.2, s * 0.12, 0.5, 0, Math.PI * 2); }, 1);
      paperFill(ctx, '#f2a33a', (c) => { c.beginPath(); c.moveTo(s * 0.32, -s * 0.06); c.lineTo(s * 0.52, 0); c.lineTo(s * 0.32, s * 0.08); c.closePath(); }, 1);
      ctx.fillStyle = '#fff'; circle(ctx, s * 0.18, -s * 0.1, s * 0.07); ctx.fill();
      ctx.fillStyle = '#222'; circle(ctx, s * 0.2, -s * 0.1, s * 0.035); ctx.fill();
      break;
    }
    case 'marimba': {
      paperFill(ctx, '#c98a4b', (c) => roundRect(c, -s * 0.45, -s * 0.16, s * 0.9, s * 0.32, s * 0.08));
      ctx.fillStyle = '#5c3a1a';
      circle(ctx, -s * 0.3, 0, s * 0.045); ctx.fill();
      circle(ctx, s * 0.3, 0, s * 0.045); ctx.fill();
      // マレット
      ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = s * 0.05;
      ctx.beginPath(); ctx.moveTo(s * 0.1, -s * 0.16); ctx.lineTo(s * 0.28, -s * 0.5); ctx.stroke();
      paperFill(ctx, '#d94f4f', (c) => circle(c, s * 0.3, -s * 0.52, s * 0.09), 1);
      break;
    }
    case 'flute': {
      ctx.save(); ctx.rotate(-0.5);
      paperFill(ctx, '#8b5a2b', (c) => roundRect(c, -s * 0.5, -s * 0.11, s * 1.0, s * 0.22, s * 0.1));
      ctx.fillStyle = '#3a2410';
      for (let i = 0; i < 4; i++) { circle(ctx, -s * 0.2 + i * s * 0.17, 0, s * 0.04); ctx.fill(); }
      ctx.restore();
      break;
    }
    case 'frog': {
      paperFill(ctx, '#5cb85c', (c) => ellipse(c, 0, s * 0.05, s * 0.4, s * 0.3));
      paperFill(ctx, '#5cb85c', (c) => circle(c, -s * 0.18, -s * 0.22, s * 0.13), 1);
      paperFill(ctx, '#5cb85c', (c) => circle(c, s * 0.18, -s * 0.22, s * 0.13), 1);
      ctx.fillStyle = '#fff';
      circle(ctx, -s * 0.18, -s * 0.24, s * 0.08); ctx.fill();
      circle(ctx, s * 0.18, -s * 0.24, s * 0.08); ctx.fill();
      ctx.fillStyle = '#222';
      circle(ctx, -s * 0.16, -s * 0.24, s * 0.04); ctx.fill();
      circle(ctx, s * 0.2, -s * 0.24, s * 0.04); ctx.fill();
      ctx.strokeStyle = '#2f7a2f'; ctx.lineWidth = s * 0.04;
      ctx.beginPath(); ctx.arc(0, s * 0.05, s * 0.18, 0.2, Math.PI - 0.2); ctx.stroke();
      break;
    }
  }
  ctx.restore();
}
