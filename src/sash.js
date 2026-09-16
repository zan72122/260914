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
    ctx.globalAlpha = 0.20;
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
    const hw = Math.max(14, world.min * 0.038);
    const hh = Math.max(44, world.min * 0.125);
    // Once the line is empty this has to be findable in a *still* frame, not
    // only in motion, so the wobble is a real nudge (about half the width of
    // the handle) and it sits inside a soft pulse of light.
    const wob = this.glint > 0.05 && !this.closed
      ? Math.sin(this.t * 5.2) * hw * 0.55 * this.glint : 0;
    ctx.save();
    ctx.translate(h.x + wob, h.y);
    if (this.glint > 0.02) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 3.4);
      ctx.globalAlpha = this.glint * (0.16 + 0.22 * pulse);
      ctx.fillStyle = '#fff4d2';
      ctx.beginPath();
      ctx.ellipse(0, 0, hw * (1.5 + 0.6 * pulse), hh * (0.62 + 0.18 * pulse), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.rotate(wob / hw * 0.12);
    ctx.fillStyle = '#9aa7b1';
    roundRect(ctx, -hw * 0.5, -hh * 0.5, hw, hh, hw * 0.45);
    ctx.fill();
    ctx.fillStyle = '#cfd8de';
    roundRect(ctx, -hw * 0.5 + hw * 0.18, -hh * 0.5 + hh * 0.06, hw * 0.34, hh * 0.88, hw * 0.17);
    ctx.fill();
    if (this.glint > 0.02) {
      const g = (Math.sin(this.t * 3.1) * 0.5 + 0.5) * this.glint;
      ctx.globalAlpha = Math.min(1, 0.35 + g * 0.65);
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, -hw * 0.5, -hh * 0.5 + hh * (0.10 + 0.55 * g), hw, hh * 0.22, hw * 0.4);
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
      const cw = op.w * 0.13;
      // Blowing into the room: the window is obviously still open.
      const sway = (0.45 + Math.sin(this.t * 2.3) * 0.55) * cw * 0.7 * c;
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
    if (this.enabled && !this.closed) this.drawFrameRain(ctx, world);
    ctx.restore();
  }

  /**
   * Rain coming in far enough to hit the frame itself: short streaks running
   * down the bottom rail with a bead at the end of each. Nothing says "shut
   * it"; the window simply stops looking finished.
   */
  drawFrameRain(ctx, world) {
    const op = this.op;
    const f = this.frame;
    const n = 9;
    const s = Math.max(4, world.min * 0.016);
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      // Deterministic, evenly spread, each on its own cycle.
      const u = (i * 0.1373 + 0.06) % 1;
      const ph = (this.t * (0.55 + (i % 4) * 0.13) + i * 0.37) % 1;
      const x = op.x + op.w * u;
      const y = op.bottom + f * ph;
      const a = Math.sin(Math.PI * ph);
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = 'rgba(232,246,255,0.95)';
      ctx.lineWidth = Math.max(1.4, s * 0.28);
      ctx.beginPath();
      ctx.moveTo(x, y - s * 0.9);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(244,251,255,0.95)';
      ctx.beginPath();
      ctx.arc(x, y, s * 0.24, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
