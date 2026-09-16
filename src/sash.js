// sash.js -- the sliding window between the balcony and the room.
//
// Open for the whole game, and deliberately immovable until the line is empty:
// until then the sash is scenery, not a control. The moment the last item is
// in the basket the handle starts to glint and wobble, the curtain blows
// inward and rain spatters the frame. Nothing says "close me" -- the window
// just looks unfinished.
//
// Gesture: drag the handle toward -x in both orientations.
//   landscape: -x is the outdoor side, exactly as the spec asks.
//   portrait : a sliding window slides sideways in the real world, and a
//              vertical drag here would collide with "pull down = bring in",
//              which is the mapping the whole game has been teaching. So the
//              sash keeps the horizontal gesture and gets its own axis.

import { clamp } from './layout.js';
import { roundRect } from './items/base.js';

export class Sash {
  constructor(world, audio) {
    this.audio = audio || null;
    this.progress = 0;     // 0 open .. 1 closed
    this.enabled = false;  // only after EMPTY_LINE
    this.closed = false;
    this.dragging = false;
    this.p0 = 0;
    this.glint = 0;
    this.t = 0;
    this.autoClose = false;
    this.curtain = 0;
    this.layout(world);
  }

  layout(world) {
    this.world = world;
    this.op = world.opening;
    this.travel = world.sash.travel;
    this.frame = world.sash.frame;
  }

  enable() { this.enabled = true; }

  /** Current pane rectangle; the pane is opening-wide and slides left. */
  paneRect(out) {
    const op = this.op;
    const o = out || {};
    o.x = op.x + (1 - this.progress) * this.travel;
    o.y = op.y;
    o.w = op.w;
    o.h = op.h;
    return o;
  }

  handlePoint(out) {
    const p = this.paneRect(this._pr || (this._pr = {}));
    const o = out || {};
    o.x = p.x + this.frame * 1.1;
    o.y = p.y + p.h * 0.5;
    return o;
  }

  hitHandle(x, y) {
    if (!this.enabled || this.closed) return false;
    const h = this.handlePoint(this._hp || (this._hp = {}));
    const rad = Math.max(64, this.world.min * 0.18) * 0.5;
    // Generous along the travel axis, very generous across it.
    return Math.abs(x - h.x) < rad * 1.6 && Math.abs(y - h.y) < Math.max(rad * 2.2, this.op.h * 0.4);
  }

  onPointerDown(p) {
    if (!this.enabled || this.closed) return false;
    this.dragging = true;
    this.p0 = this.progress;
    return true;
  }

  onPointerMove(p) {
    if (!this.dragging) return;
    const moved = -(p.x - p.x0); // dragging left closes
    this.progress = clamp(this.p0 + moved / this.travel, 0, 1);
    if (this.audio) this.audio.sashSlide(Math.min(1, Math.abs(p.vx) / 900));
    if (this.progress >= 1) this._latch();
  }

  onPointerUp() {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.audio) this.audio.sashStop();
    if (this.progress >= 1) this._latch();
    else if (this.progress > 0.42) this.autoClose = true; // forgiving: it finishes itself
  }

  onPointerCancel() { this.onPointerUp(); }

  _latch() {
    if (this.closed) return;
    this.closed = true;
    this.progress = 1;
    this.autoClose = false;
    if (this.audio) { this.audio.sashStop(); this.audio.latch(); this.audio.setIndoor(true); }
  }

  update(dt, world) {
    this.t += dt;
    if (this.autoClose && !this.closed) {
      this.progress = Math.min(1, this.progress + dt * 1.1);
      if (this.audio) this.audio.sashSlide(0.4);
      if (this.progress >= 1) this._latch();
    }
    const wantGlint = this.enabled && !this.closed ? 1 : 0;
    this.glint += (wantGlint - this.glint) * Math.min(1, dt * 3);
    const wantCurtain = this.enabled && !this.closed ? 1 : 0.25;
    this.curtain += (wantCurtain - this.curtain) * Math.min(1, dt * 1.6);
  }

  /** Glass pane, drawn over the outdoor scene (weather paints the drops). */
  drawPane(ctx, world, weather) {
    const p = this.paneRect(this._pr || (this._pr = {}));
    const op = this.op;
    ctx.save();
    ctx.beginPath();
    ctx.rect(op.x, op.y, op.w, op.h);
    ctx.clip();

    // glass tint + a diagonal sheen so it reads as glass, not haze
    ctx.globalAlpha = 0.20 + 0.10 * (1 - this.progress) * 0;
    ctx.fillStyle = '#dff0fa';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.globalAlpha = 0.09;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(p.x + p.w * 0.10, p.y);
    ctx.lineTo(p.x + p.w * 0.34, p.y);
    ctx.lineTo(p.x + p.w * 0.10, p.bottom || (p.y + p.h));
    ctx.lineTo(p.x - p.w * 0.10, p.y + p.h);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    if (weather) weather.drawGlass(ctx, p);

    // pane stile + handle
    ctx.fillStyle = '#e6ecef';
    ctx.fillRect(p.x, p.y, this.frame * 0.9, p.h);
    ctx.fillStyle = 'rgba(120,138,150,0.55)';
    ctx.fillRect(p.x, p.y, this.frame * 0.22, p.h);

    const h = this.handlePoint(this._hp || (this._hp = {}));
    const hw = Math.max(10, world.min * 0.030);
    const hh = Math.max(34, world.min * 0.10);
    const wob = this.glint > 0.05 && !this.closed
      ? Math.sin(this.t * 6) * hw * 0.16 * this.glint : 0;
    ctx.save();
    ctx.translate(h.x + wob, h.y);
    ctx.fillStyle = '#9aa7b1';
    roundRect(ctx, -hw * 0.5, -hh * 0.5, hw, hh, hw * 0.45);
    ctx.fill();
    ctx.fillStyle = '#cfd8de';
    roundRect(ctx, -hw * 0.5 + hw * 0.18, -hh * 0.5 + hh * 0.06, hw * 0.34, hh * 0.88, hw * 0.17);
    ctx.fill();
    if (this.glint > 0.02) {
      const g = (Math.sin(this.t * 3.1) * 0.5 + 0.5) * this.glint;
      ctx.globalAlpha = g * 0.85;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, -hw * 0.5, -hh * 0.5 + hh * (0.12 + 0.5 * g), hw, hh * 0.18, hw * 0.4);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.restore();
  }

  /** The window frame itself, plus the curtain that flutters into the room. */
  drawFrame(ctx, world) {
    const op = this.op;
    const f = this.frame;
    ctx.save();
    // curtain, on the room side of the opening
    const c = this.curtain;
    if (c > 0.02) {
      const cw = op.w * 0.12;
      const sway = Math.sin(this.t * 2.3) * cw * 0.35 * c;
      ctx.fillStyle = 'rgba(255,250,240,0.85)';
      ctx.beginPath();
      ctx.moveTo(op.x, op.y);
      ctx.quadraticCurveTo(op.x + cw * 0.7 + sway, op.y + op.h * 0.45,
        op.x + cw * 0.35 + sway * 1.4, op.bottom);
      ctx.lineTo(op.x, op.bottom);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(214,196,172,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.fillStyle = '#8d6a4f';
    // top / bottom / left / right frame bars
    ctx.fillRect(op.x - f, op.y - f, op.w + f * 2, f);
    ctx.fillRect(op.x - f, op.bottom, op.w + f * 2, f);
    ctx.fillRect(op.x - f, op.y - f, f, op.h + f * 2);
    ctx.fillRect(op.right, op.y - f, f, op.h + f * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(op.x - f, op.y - f, op.w + f * 2, Math.max(2, f * 0.22));
    ctx.restore();
  }
}
