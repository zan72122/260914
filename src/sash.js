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

// A press that travels less than this is a press, not a pull.
const TAP_SLOP = 12;
// How much of the window one press shuts. Three presses clear the 0.42 mark
// that lets the sash finish by itself, so a child who only ever taps still
// closes it.
const TAP_STEP = 0.17;
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
    // A tap is not a drag. A four year old's first idea is always to press the
    // thing that is glowing, so a press has to move the pane -- one nudge of
    // it, left where it lands, so three presses shut the window and the first
    // one has already said which way it goes.
    this.slideTo = -1;
    this.moved = 0;
    this.glintPulse = 0;
    // `drift` is the pane rocking on its runners: a couple of percent toward
    // closed on every gust, springing back. Nothing points at it; the window
    // simply shows the child the only direction it can travel in.
    this.drift = 0;
    this.driftV = 0;
    this._gustWas = 0;
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
    o.x = op.x + (1 - clamp(this.progress + this.drift, 0, 1)) * this.travel;
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

  /** Where the handle ends up once the window is shut. */
  closedHandlePoint(out) {
    const o = out || {};
    o.x = this.op.x + this.frame * 1.1;
    o.y = this.op.y + this.op.h * 0.5;
    return o;
  }

  /** The handle's pad, whether or not the sash may be moved yet. */
  overHandle(x, y) {
    const h = this.handlePoint(this._hp || (this._hp = {}));
    const rad = Math.max(64, this.world.min * 0.18) * 0.5;
    // Generous along the travel axis, very generous across it.
    return Math.abs(x - h.x) < rad * 1.6 && Math.abs(y - h.y) < Math.max(rad * 2.2, this.op.h * 0.4);
  }

  hitHandle(x, y) {
    if (!this.enabled || this.closed) return false;
    return this.overHandle(x, y);
  }

  /**
   * Touched while it is still locked (the line is not empty yet).
   *
   * Nothing moves the window before its time, but a control that answers a
   * finger with absolutely nothing teaches a child that the screen is dead.
   * So it knocks in its runners, a few pixels, and stops.
   */
  rattle(strength) {
    this.driftV += 0.55 * (strength === undefined ? 1 : strength);
  }

  onPointerDown(p) {
    if (!this.enabled || this.closed) return false;
    this.dragging = true;
    this.p0 = this.progress;
    this.moved = 0;
    this.slideTo = -1;
    return true;
  }

  onPointerMove(p) {
    if (!this.dragging) return;
    const moved = -(p.x - p.x0); // dragging left closes
    this.moved = Math.max(this.moved, Math.hypot(p.x - p.x0, p.y - p.y0));
    this.progress = clamp(this.p0 + moved / this.travel, 0, 1);
    if (this.audio) this.audio.sashSlide(Math.min(1, Math.abs(p.vx) / 900));
    if (this.progress >= 1) this._latch();
  }

  onPointerUp() { this._release(true); }

  /** A gesture taken away is not a press: it just leaves the pane where it is. */
  onPointerCancel() { this._release(false); }

  _release(tap) {
    if (!this.dragging) return;
    this.dragging = false;
    if (tap && this.moved < TAP_SLOP && this.progress < 1) {
      // A press, not a pull: give it one notch and leave it there. Enough of
      // the window has moved that the next press is obvious, and three of
      // them shut it without ever learning to drag.
      this.progress = this.p0;
      this.slideTo = Math.min(1, this.p0 + TAP_STEP);
      this.glintPulse = 1;
      return;
    }
    if (this.audio) this.audio.sashStop();
    if (this.progress >= 1) this._latch();
    else if (this.progress > 0.42) this.autoClose = true; // forgiving: it finishes itself
  }

  _latch() {
    if (this.closed) return;
    this.closed = true;
    this.progress = 1;
    this.autoClose = false;
    if (this.audio) { this.audio.sashStop(); this.audio.latch(); this.audio.setIndoor(true); }
  }

  update(dt, world, weather) {
    this.t += dt;

    // The pane rocking in its runners: gusts knock it toward closed and the
    // runners bring it back. Critically damped enough to settle in about a
    // second, so the eye sees one clear movement rather than a shudder.
    if (weather && !this.closed && !this.dragging) {
      const g = weather.gustPulse || 0;
      if (g > 0.6 && this._gustWas <= 0.6) this.driftV += this.enabled ? 0.50 : 0.12;
      this._gustWas = g;
    }
    if (this.drift !== 0 || this.driftV !== 0) {
      this.driftV += (-this.drift * 70 - this.driftV * 9) * dt;
      this.drift += this.driftV * dt;
      if (Math.abs(this.drift) < 1e-4 && Math.abs(this.driftV) < 1e-3) {
        this.drift = 0; this.driftV = 0;
      }
    }

    if (this.slideTo >= 0 && !this.closed && !this.dragging) {
      this.progress = Math.min(this.slideTo, this.progress + dt * 0.75);
      if (this.audio) this.audio.sashSlide(0.35);
      if (this.progress >= this.slideTo - 1e-4) {
        this.progress = this.slideTo;
        this.slideTo = -1;
        if (this.audio) this.audio.sashStop();
        if (this.progress >= 1) this._latch();
        else if (this.progress > 0.42) this.autoClose = true;
      }
    }

    this.glintPulse = Math.max(0, (this.glintPulse || 0) - dt * 1.6);
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
    const gp = this.glintPulse || 0;
    const wob = this.glint > 0.05 && !this.closed
      ? Math.sin(this.t * 5.2) * hw * 0.55 * this.glint : 0;
    ctx.save();
    ctx.translate(h.x + wob, h.y);
    if (this.glint > 0.02) {
      const pulse = Math.min(1, 0.5 + 0.5 * Math.sin(this.t * 3.4) + gp);
      ctx.globalAlpha = this.glint * (0.16 + 0.22 * pulse) + gp * 0.25;
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
      const g = Math.min(1, (Math.sin(this.t * 3.1) * 0.5 + 0.5) * this.glint + gp);
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
