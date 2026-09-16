// character.js -- the small one who does the actual work.
//
// No gender cues, no clothes that read as a costume, no words and no arrows.
// Everything it communicates it communicates with where it looks, what it
// points at, and how it stands. A few bones: head, body, two arms, two legs.

import { clamp, lerp } from './layout.js';

const HAND = { x: 0, y: 0 };

export class Character {
  constructor(world, hooks) {
    this.hooks = hooks || {};
    this.audio = this.hooks.audio || null;
    this.queue = [];
    this.carrying = null;
    this.mode = 'idle';     // idle | toCatch | toBasket | back | happy
    this.t = 0;
    this.moodT = 0;
    this.mood = 'calm';     // calm | shiver | smile | relief
    this.gaze = null;       // {x, y} world point to look at
    this.point = null;      // {x, y} world point to point at
    this.pointT = 0;
    this.layout(world);
  }

  layout(world) {
    this.world = world;
    const span = world.trackMax - world.trackMin;
    const rel = this.pos === undefined ? 0.16 : this._rel;
    this.pos = world.trackMin + span * rel;
    this._rel = rel;
    this.h = world.charH;
    this.speed = Math.max(180, world.min * 0.75);
  }

  _setPos(v) {
    const w = this.world;
    this.pos = clamp(v, w.trackMin, w.trackMax);
    const span = w.trackMax - w.trackMin;
    this._rel = span ? (this.pos - w.trackMin) / span : 0;
  }

  /** Foot anchor in screen space. */
  foot(out) {
    const w = this.world;
    if (w.portrait) { out.x = this.pos; out.y = w.catchLine; }
    else { out.x = w.catchLine; out.y = this.pos; }
    return out;
  }

  handPos(out) {
    this.foot(out);
    const h = this.h;
    const reach = (this.mode === 'toCatch' || this.mode === 'toBasket' || this.carrying) ? 1 : 0.6;
    out.y -= h * (0.60 + 0.12 * reach);
    out.x += this.world.inDir.x * h * 0.10;
    return out;
  }

  /** The item has been let go: go and get it. */
  receive(item) {
    this.queue.push(item);
    if (this.mode === 'idle' || this.mode === 'back' || this.mode === 'happy') this._next();
  }

  _next() {
    if (this.carrying) return;
    const item = this.queue.shift();
    if (!item) { this.mode = 'back'; return; }
    this.target = item;
    this.mode = 'toCatch';
  }

  trackOfItem(item) {
    return this.world.portrait ? item.cx : item.cy;
  }

  update(dt, world) {
    this.t += dt;
    this.moodT = Math.max(0, this.moodT - dt);
    if (this.moodT === 0 && this.mood !== 'relief') this.mood = 'calm';
    this.pointT = Math.max(0, this.pointT - dt);

    const w = world;
    if (this.mode === 'toCatch' && this.target) {
      const goal = clamp(this.trackOfItem(this.target), w.trackMin, w.trackMax);
      this._moveTo(goal, dt);
      const it = this.target;
      this.gaze = { x: it.cx, y: it.cy };
      const near = Math.abs(this.pos - goal) < this.h * 0.35;
      const ready = it.releaseT > 0.55;
      // Success is guaranteed: after a beat, the catch simply happens.
      if ((near && ready) || it.releaseT > 1.6) {
        this.handPos(HAND);
        it.beginCarry(HAND.x, HAND.y);
        this.carrying = it;
        this.target = null;
        this.mode = 'toBasket';
        this.mood = it.wetness > 0.32 ? 'shiver' : 'smile';
        this.moodT = 1.1;
      }
    } else if (this.mode === 'toBasket') {
      const b = w.basket;
      const goal = clamp(w.portrait ? b.cx : b.cy, w.trackMin, w.trackMax);
      this._moveTo(goal, dt);
      if (this.carrying) {
        this.handPos(HAND);
        this.carrying.setCarry(HAND.x, HAND.y);
        this.gaze = { x: b.cx, y: b.cy };
      }
      if (Math.abs(this.pos - goal) < this.h * 0.22) {
        const it = this.carrying;
        this.carrying = null;
        if (it) {
          it.stow();
          if (this.hooks.onStow) this.hooks.onStow(it);
        }
        this._next();
      }
    } else if (this.mode === 'back') {
      const goal = w.trackMin + (w.trackMax - w.trackMin) * 0.16;
      this._moveTo(goal, dt);
      if (Math.abs(this.pos - goal) < 2) this.mode = 'idle';
    }
  }

  _moveTo(goal, dt) {
    const d = goal - this.pos;
    const step = this.speed * dt;
    this.facing = d === 0 ? (this.facing || 1) : (d > 0 ? 1 : -1);
    if (Math.abs(d) <= step) this._setPos(goal);
    else this._setPos(this.pos + Math.sign(d) * step);
    this.walk = Math.abs(d) > 2;
  }

  lookAt(x, y) { this.gaze = { x, y }; }
  pointAt(x, y, seconds) { this.point = { x, y }; this.pointT = seconds || 2.2; }
  celebrate() {
    this.mode = 'happy';
    this.mood = 'relief';
    this.moodT = 6;
    if (this.audio) this.audio.relief();
  }

  // ---- drawing ----------------------------------------------------------
  draw(ctx, world) {
    const h = this.h;
    this.foot(HAND);
    let fx = HAND.x, fy = HAND.y;
    const bob = this.walk ? Math.sin(this.t * 11) * h * 0.035 : Math.sin(this.t * 2.2) * h * 0.012;
    const shiver = this.mood === 'shiver' ? Math.sin(this.t * 34) * h * 0.02 : 0;
    const hop = this.mode === 'happy' ? Math.abs(Math.sin(this.t * 4.4)) * h * 0.10 : 0;
    fy -= bob + hop;
    fx += shiver;

    const bodyH = h * 0.42;
    const headR = h * 0.24;
    const hipY = fy - h * 0.20;
    const shoulderY = hipY - bodyH;
    const headY = shoulderY - headR * 0.82;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // soft ground shadow
    ctx.fillStyle = 'rgba(70,52,40,0.18)';
    ctx.beginPath();
    ctx.ellipse(fx, HAND.y + h * 0.02, h * 0.26, h * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();

    // legs
    ctx.strokeStyle = '#6b5a4c';
    ctx.lineWidth = h * 0.10;
    const stride = this.walk ? Math.sin(this.t * 11) * h * 0.10 : 0;
    ctx.beginPath();
    ctx.moveTo(fx - h * 0.06, hipY);
    ctx.lineTo(fx - h * 0.06 + stride, HAND.y);
    ctx.moveTo(fx + h * 0.06, hipY);
    ctx.lineTo(fx + h * 0.06 - stride, HAND.y);
    ctx.stroke();

    // body
    ctx.fillStyle = '#f5a25d';
    ctx.beginPath();
    ctx.ellipse(fx, shoulderY + bodyH * 0.5, h * 0.19, bodyH * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();

    // arms -- the pose is the message
    const gx = this.gaze ? this.gaze.x : fx + world.inDir.x * h;
    const gy = this.gaze ? this.gaze.y : fy - h;
    let armT = 0.25;
    if (this.mode === 'toCatch') armT = 0.9;
    else if (this.carrying) armT = 0.75;
    else if (this.mode === 'happy') armT = 1;
    const reachX = this.carrying ? fx + world.inDir.x * h * 0.30 : gx;
    const reachY = this.carrying ? shoulderY - h * 0.02 : gy;
    const armLen = h * 0.34;
    ctx.strokeStyle = '#f5a25d';
    ctx.lineWidth = h * 0.095;
    for (let s = -1; s <= 1; s += 2) {
      const sx = fx + s * h * 0.15;
      const sy = shoulderY + h * 0.04;
      // Rest: hanging down and a little out. Target: toward what matters.
      let tx = s * 0.6, ty = -1;
      if (this.mode !== 'happy') {
        tx = reachX - sx; ty = reachY - sy;
      }
      const tl = Math.max(1, Math.hypot(tx, ty));
      const dx = lerp(s * 0.38, tx / tl, armT);
      const dy = lerp(1, ty / tl, armT);
      const dl = Math.max(0.001, Math.hypot(dx, dy));
      const ex = sx + (dx / dl) * armLen;
      const ey = sy + (dy / dl) * armLen;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx + (ex - sx) * 0.35 + s * h * 0.06,
        sy + (ey - sy) * 0.5, ex, ey);
      ctx.stroke();
    }

    // pointing arm overrides one side (used for the "look, the laundry!" cue)
    if (this.pointT > 0 && this.point) {
      const a = Math.min(1, this.pointT / 0.4);
      const sx = fx + h * 0.17 * Math.sign(this.point.x - fx || 1);
      const dx = this.point.x - sx, dy = this.point.y - (shoulderY + h * 0.03);
      const len = Math.max(1, Math.hypot(dx, dy));
      const ex = sx + dx / len * h * 0.42;
      const ey = shoulderY + h * 0.03 + dy / len * h * 0.42;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.moveTo(sx, shoulderY + h * 0.03);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // head
    ctx.fillStyle = '#ffd9b0';
    ctx.beginPath();
    ctx.arc(fx, headY, headR, 0, Math.PI * 2);
    ctx.fill();
    // hair cap -- rounded, no gendered shape
    ctx.fillStyle = '#5a4436';
    ctx.beginPath();
    ctx.arc(fx, headY, headR * 1.02, Math.PI * 1.06, Math.PI * 1.94);
    ctx.fill();

    // eyes follow the gaze: this is the entire tutorial
    const ldx = clamp((gx - fx) / (headR * 6), -1, 1) * headR * 0.22;
    const ldy = clamp((gy - headY) / (headR * 6), -1, 1) * headR * 0.22;
    ctx.fillStyle = '#3a2b22';
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.arc(fx + s * headR * 0.36 + ldx, headY + headR * 0.06 + ldy, headR * 0.115, 0, Math.PI * 2);
      ctx.fill();
    }
    // mouth: a smile arc when dry / relieved, a small o when shivering
    ctx.strokeStyle = '#3a2b22';
    ctx.lineWidth = Math.max(1.5, headR * 0.09);
    ctx.beginPath();
    if (this.mood === 'shiver') {
      ctx.arc(fx + ldx * 0.5, headY + headR * 0.42, headR * 0.12, 0, Math.PI * 2);
    } else if (this.mood === 'smile' || this.mood === 'relief' || this.mode === 'happy') {
      ctx.arc(fx + ldx * 0.5, headY + headR * 0.28, headR * 0.26, 0.15 * Math.PI, 0.85 * Math.PI);
    } else {
      ctx.arc(fx + ldx * 0.5, headY + headR * 0.30, headR * 0.20, 0.25 * Math.PI, 0.75 * Math.PI);
    }
    ctx.stroke();

    // cheeks when happy
    if (this.mood === 'relief' || this.mood === 'smile') {
      ctx.fillStyle = 'rgba(244,140,132,0.5)';
      for (let s = -1; s <= 1; s += 2) {
        ctx.beginPath();
        ctx.ellipse(fx + s * headR * 0.62, headY + headR * 0.34, headR * 0.16, headR * 0.10, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
