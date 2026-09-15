import { clamp, lerp, smoothstep, spring2, splineAt, splinePath, TAU, noise1 } from '../core/math.js';

const TMP = { x: 0, y: 0 };
const TMP2 = { x: 0, y: 0 };

/** Lead offsets in SCREEN px (so the finger never covers the mouth). */
const LEAD = {
  portrait: { up: 70, ahead: 0, bodyBack: 96 },
  landscape: { up: 60, ahead: 30, bodyBack: 86 },
};

export class Vacuum {
  constructor(rng) {
    this.rng = rng;
    this.pose = 'portrait';

    this.nozzle = { x: 0, y: 0, vx: 0, vy: 0 };
    this.body = { x: 0, y: 80, vx: 0, vy: 0 };
    this.dirX = 0; this.dirY = -1;
    this.aheadX = 0; this.aheadY = -1;   // smoothed drag direction

    this.power = 1;            // 1 = idle airflow, up to MAXP while held
    this.powerN = 0;           // 0..1 normalised
    this.load = 0;             // 0..1, debris currently in the flow
    this.time = 0;

    this.hosePts = [ {x:0,y:0}, {x:0,y:0,vx:0,vy:0}, {x:0,y:0,vx:0,vy:0}, {x:0,y:0} ];
    this._tube = [ {x:0,y:0}, this.hosePts[0], this.hosePts[1], this.hosePts[2], this.hosePts[3], {x:0,y:0} ];

    this.transits = [];
    this.cup = [];             // {x,y,r,kind,color,seed,rot}
    this.cupCols = new Float32Array(10);
    this.cupCenter = { x: 0, y: 0 };
    this.bodyAngle = 0;

    this.motes = [];
    for (let i = 0; i < 26; i++) this.motes.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, r: 1 });
    this._moteT = 0;

    this.audio = null;
    this._fieldOut = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };
  }

  get MAXP() { return 2.2; }

  setPose(pose) { this.pose = pose; }

  reset(x, y) {
    this.nozzle.x = x; this.nozzle.y = y; this.nozzle.vx = 0; this.nozzle.vy = 0;
    this.body.x = x; this.body.y = y + 90; this.body.vx = 0; this.body.vy = 0;
    for (let i = 0; i < this.hosePts.length; i++) {
      const t = i / (this.hosePts.length - 1);
      this.hosePts[i].x = lerp(x, this.body.x, t);
      this.hosePts[i].y = lerp(y, this.body.y, t);
      this.hosePts[i].vx = 0; this.hosePts[i].vy = 0;
    }
    this.transits.length = 0;
    this.power = 1; this.powerN = 0;
  }

  clearCup() { this.cup.length = 0; this.cupCols.fill(0); }

  // ---------------------------------------------------------------- update

  update(dt, input, cam) {
    this.time += dt;

    // --- suction power ---
    // On a touch screen the finger is either on the glass or not, so "press and
    // hold" means: finger down AND not sweeping. Stop moving -> the motor winds
    // up over ~0.3s and distant fibers start to lean. Discoverable by accident.
    const stillness = input.down ? smoothstep(320, 80, Math.hypot(input.vx, input.vy)) : 0;
    const target = 1 + (this.MAXP - 1) * stillness;
    const tau = target > this.power ? 0.3 : 0.45;
    this.power += (target - this.power) * (1 - Math.exp(-dt / (tau / 3)));
    this.powerN = clamp((this.power - 1) / (this.MAXP - 1), 0, 1);

    // --- follow the finger with a lead offset ---
    const L = LEAD[this.pose] || LEAD.portrait;
    const sp = Math.hypot(input.vx, input.vy);
    if (sp > 40) {
      const k = 1 - Math.exp(-6 * dt);
      this.aheadX += (input.vx / sp - this.aheadX) * k;
      this.aheadY += (input.vy / sp - this.aheadY) * k;
    }
    const an = Math.hypot(this.aheadX, this.aheadY) || 1;
    const axn = this.aheadX / an, ayn = this.aheadY / an;
    const drag = clamp(sp / 900, 0, 1);

    const sx = input.x + axn * L.ahead * drag;
    const sy = input.y - L.up + ayn * L.ahead * drag * 0.5;
    cam.toWorld(sx, sy, TMP);
    const ntx = TMP.x, nty = TMP.y;
    cam.toWorld(input.x, input.y + L.bodyBack * 0.42, TMP2);
    const btx = TMP2.x, bty = TMP2.y;

    spring2(this.nozzle, ntx, nty, 24, dt);
    spring2(this.body, btx, bty, 12, dt);

    // --- facing: away from the body, blended with the drag direction ---
    let dx = this.nozzle.x - this.body.x, dy = this.nozzle.y - this.body.y;
    let dl = Math.hypot(dx, dy);
    if (dl < 1e-3) { dx = 0; dy = -1; dl = 1; }
    dx /= dl; dy /= dl;
    cam.toWorld(0, 0, TMP); const ox = TMP.x, oy = TMP.y;
    cam.toWorld(axn, ayn, TMP2);
    let wdx = TMP2.x - ox, wdy = TMP2.y - oy;
    const wl = Math.hypot(wdx, wdy) || 1; wdx /= wl; wdy /= wl;
    const blend = 0.35 * drag;
    let fx = dx * (1 - blend) + wdx * blend;
    let fy = dy * (1 - blend) + wdy * blend;
    const fl = Math.hypot(fx, fy) || 1;
    const kk = 1 - Math.exp(-14 * dt);
    this.dirX += (fx / fl - this.dirX) * kk;
    this.dirY += (fy / fl - this.dirY) * kk;
    const nl = Math.hypot(this.dirX, this.dirY) || 1;
    this.dirX /= nl; this.dirY /= nl;

    this.bodyAngle = Math.atan2(this.nozzle.y - this.body.y, this.nozzle.x - this.body.x);

    // --- hose: nozzle back -> two sagging spring points -> body top ---
    const backX = this.nozzle.x - this.dirX * 13, backY = this.nozzle.y - this.dirY * 13;
    const topX = this.body.x + Math.cos(this.bodyAngle) * 20, topY = this.body.y + Math.sin(this.bodyAngle) * 20;
    this.hosePts[0].x = backX; this.hosePts[0].y = backY;
    this.hosePts[3].x = topX; this.hosePts[3].y = topY;
    const sag = 10 + this.powerN * 3;
    spring2(this.hosePts[1], lerp(backX, topX, 0.35), lerp(backY, topY, 0.35) + sag, 11, dt);
    spring2(this.hosePts[2], lerp(backX, topX, 0.7), lerp(backY, topY, 0.7) + sag * 0.7, 9.5, dt);

    // cup position in world (body local offset, rotated)
    const ca = Math.cos(this.bodyAngle + Math.PI / 2), sa = Math.sin(this.bodyAngle + Math.PI / 2);
    const clx = 0, cly = 6;
    this.cupCenter.x = this.body.x + clx * ca - cly * sa;
    this.cupCenter.y = this.body.y + clx * sa + cly * ca;
    this._tube[0].x = this.mouthX; this._tube[0].y = this.mouthY;
    this._tube[5].x = this.cupCenter.x; this._tube[5].y = this.cupCenter.y;

    // --- transits ---
    let load = 0;
    for (let i = this.transits.length - 1; i >= 0; i--) {
      const it = this.transits[i];
      it.t += dt / it.dur;
      load += 1;
      if (it.t >= 1) { this._land(it); this.transits.splice(i, 1); }
    }
    this.load = clamp(load / 3, 0, 1);

    // --- cup jiggle phase ---
    this.cupPhase = this.time * (7 + this.powerN * 7);

    // --- dust motes drawn into the mouth (world reacting, not an overlay) ---
    this._updateMotes(dt, cam);

    if (this.audio) this.audio.setMotor(this.power, this.load);
  }

  get mouthX() { return this.nozzle.x + this.dirX * 17; }
  get mouthY() { return this.nozzle.y + this.dirY * 17; }
  get radius() { return 105 * (0.8 + 0.3 * this.powerN); }

  // ---------------------------------------------------------------- field

  /**
   * Airflow at a world point. This is THE contract debris reads; nothing else
   * should decide "am I close enough".
   *   fx, fy    : unit-ish pull vector scaled by strength (world units/s^2 factor)
   *   strength  : 0 .. ~2.5
   *   inCapture : point is inside the mouth ellipse
   */
  field(x, y, out) {
    out = out || this._fieldOut;
    const mx = this.mouthX, my = this.mouthY;
    let dx = mx - x, dy = my - y;
    let d = Math.hypot(dx, dy);
    if (d < 1e-4) d = 1e-4;
    const ux = dx / d, uy = dy / d;
    // alignment: 1 when the point sits straight in front of the mouth
    const align = -(ux * this.dirX + uy * this.dirY);
    const cone = 0.1 + 0.9 * smoothstep(-0.35, 0.8, align);
    const r = this.radius;
    const dd = d / r;
    // squared inverse-square: the flow is strongly local, so getting CLOSER is
    // what changes the world, not hovering vaguely nearby
    const q = 1 + dd * dd;
    const falloff = 1 / (q * q);
    const s = this.power * falloff * cone;
    out.strength = s;
    out.fx = ux * s;
    out.fy = uy * s;
    out.dist = d;
    // capture: ellipse at the mouth, long axis along the facing direction
    const lx = -(dx * this.dirX + dy * this.dirY);   // along facing, + = in front
    const ly = -(dx * -this.dirY + dy * this.dirX);  // across
    const a = 15, b = 21;
    out.inCapture = (lx * lx) / (a * a) + (ly * ly) / (b * b) <= 1;
    return out;
  }

  // ---------------------------------------------------------------- transit

  /**
   * Send a captured item through the tube into the cup.
   * item: {kind, color, size, detail?}
   */
  transit(item) {
    const dur = 0.26 + Math.min(item.size, 14) * 0.008;
    this.transits.push({
      kind: item.kind, color: item.color, size: item.size, detail: item.detail || null,
      t: 0, dur, seed: this.rng ? this.rng.next() * 100 : Math.random() * 100,
      x: this.mouthX, y: this.mouthY, px: this.mouthX, py: this.mouthY,
    });
    if (this.audio) this.audio.pop(item.kind === 'crumb' ? 'tick' : 'pop', item.kind === 'crumb' ? 0.6 : 1);
  }

  _land(it) {
    // pack into the cup using a tiny column height map
    const cols = this.cupCols;
    let best = 0;
    for (let i = 1; i < cols.length; i++) if (cols[i] < cols[best]) best = i;
    const jitter = (this.rng ? this.rng.next() : Math.random()) - 0.5;
    const r = clamp(it.size * 0.42, 1.6, 7);
    const x = (best - (cols.length - 1) / 2) * 3.4 + jitter * 2;
    const y = 14 - cols[best] - r;
    cols[best] += r * 1.45;
    // spread the load a bit to neighbours so piles look natural
    if (best > 0) cols[best - 1] += r * 0.35;
    if (best < cols.length - 1) cols[best + 1] += r * 0.35;
    this.cup.push({ x, y, r, kind: it.kind, color: it.color, seed: it.seed, rot: (this.rng ? this.rng.next() : Math.random()) * TAU });
    if (this.cup.length > 160) this.cup.shift();
  }

  // ---------------------------------------------------------------- motes

  _updateMotes(dt, cam) {
    this._moteT -= dt;
    const want = this.powerN > 0.15;
    if (want && this._moteT <= 0) {
      this._moteT = 0.05;
      for (let i = 0; i < this.motes.length; i++) {
        const m = this.motes[i];
        if (m.life <= 0) {
          const a = (this.rng ? this.rng.next() : Math.random()) * TAU;
          const rad = 40 + (this.rng ? this.rng.next() : Math.random()) * this.radius * 0.7;
          m.x = this.mouthX + Math.cos(a) * rad;
          m.y = this.mouthY + Math.sin(a) * rad * 0.8;
          m.vx = 0; m.vy = 0; m.life = 1; m.r = 0.6 + Math.random() * 0.8;
          break;
        }
      }
    }
    const f = this._fieldOut;
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      if (m.life <= 0) continue;
      this.field(m.x, m.y, f);
      m.vx += f.fx * 620 * dt;
      m.vy += f.fy * 620 * dt;
      m.vx *= 0.94; m.vy *= 0.94;
      m.x += m.vx * dt; m.y += m.vy * dt;
      m.life -= dt * 0.7;
      if (f.inCapture) m.life = 0;
    }
  }

  // ---------------------------------------------------------------- draw

  draw(ctx, cam) {
    ctx.save();
    cam.apply(ctx);

    this._drawMotes(ctx);
    this._drawShadow(ctx);
    this._drawHose(ctx);
    this._drawBody(ctx);
    this._drawHead(ctx);

    ctx.restore();
  }

  _drawMotes(ctx) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      if (m.life <= 0) continue;
      ctx.globalAlpha = 0.5 * Math.min(1, m.life * 2);
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawShadow(ctx) {
    ctx.fillStyle = 'rgba(30,20,10,0.16)';
    ctx.beginPath();
    ctx.ellipse(this.body.x + 4, this.body.y + 30, 34, 12, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.ellipse(this.nozzle.x + 3, this.nozzle.y + 13, 19, 6, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  _drawHose(ctx) {
    const pts = this.hosePts;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); splinePath(ctx, pts, 26);
    ctx.strokeStyle = '#3f4a63'; ctx.lineWidth = 15; ctx.stroke();
    ctx.beginPath(); splinePath(ctx, pts, 26);
    ctx.strokeStyle = '#5d6b8c'; ctx.lineWidth = 11; ctx.stroke();
    // ribs
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
    const p = TMP;
    for (let i = 1; i < 14; i++) {
      splineAt(pts, i / 14, p);
      splineAt(pts, i / 14 + 0.012, TMP2);
      const ax = TMP2.x - p.x, ay = TMP2.y - p.y;
      const l = Math.hypot(ax, ay) || 1;
      const nx2 = -ay / l * 5, ny2 = ax / l * 5;
      ctx.beginPath(); ctx.moveTo(p.x - nx2, p.y - ny2); ctx.lineTo(p.x + nx2, p.y + ny2); ctx.stroke();
    }
    // items riding the tube (visible through the hose)
    this._drawTransits(ctx);
  }

  _drawTransits(ctx) {
    const p = TMP, q = TMP2;
    for (let i = 0; i < this.transits.length; i++) {
      const it = this.transits[i];
      const u = clamp(it.t, 0, 1);
      const e = u * u * (3 - 2 * u);
      splineAt(this._tube, e, p);
      splineAt(this._tube, clamp(e + 0.03, 0, 1), q);
      it.px = it.x; it.py = it.y;
      it.x = p.x; it.y = p.y;
      const ax = q.x - p.x, ay = q.y - p.y;
      const ang = Math.atan2(ay, ax);
      const stretch = 1.9;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang);
      ctx.fillStyle = it.color;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.ellipse(0, 0, it.size * 0.55 * stretch, it.size * 0.5 / stretch * 1.5, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  _drawBody(ctx) {
    const a = this.bodyAngle + Math.PI / 2;
    ctx.save();
    ctx.translate(this.body.x, this.body.y);
    ctx.rotate(a);

    // shell
    ctx.fillStyle = '#e8547c';
    roundRect(ctx, -27, -26, 54, 58, 14); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    roundRect(ctx, -22, -22, 18, 46, 9); ctx.fill();
    ctx.strokeStyle = 'rgba(90,20,40,0.35)'; ctx.lineWidth = 2;
    roundRect(ctx, -27, -26, 54, 58, 14); ctx.stroke();

    // transparent panel + dust cup
    ctx.save();
    roundRect(ctx, -21, -12, 42, 38, 10);
    ctx.clip();
    ctx.fillStyle = 'rgba(220,240,255,0.30)';
    ctx.fillRect(-21, -12, 42, 38);
    // contents
    const jig = Math.sin(this.cupPhase) * (0.5 + this.powerN * 1.1);
    for (let i = 0; i < this.cup.length; i++) {
      const c = this.cup[i];
      const wob = Math.sin(this.cupPhase * 0.8 + c.seed) * (0.4 + this.powerN * 0.9);
      ctx.save();
      ctx.translate(c.x + wob * 0.6, c.y + jig * 0.5);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      if (c.kind === 'crumb') {
        ctx.fillRect(-c.r, -c.r * 0.7, c.r * 2, c.r * 1.4);
      } else {
        ctx.beginPath(); ctx.ellipse(0, 0, c.r * 1.15, c.r, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = c.color; ctx.lineWidth = 0.7; ctx.globalAlpha = 0.7;
        for (let k = 0; k < 4; k++) {
          const ang = c.seed + k * 1.57;
          ctx.beginPath(); ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(ang) * c.r * 1.9, Math.sin(ang) * c.r * 1.7); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
    ctx.restore();
    // glass edge
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2;
    roundRect(ctx, -21, -12, 42, 38, 10); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-15, -6); ctx.lineTo(-15, 18); ctx.stroke();

    ctx.restore();
  }

  _drawHead(ctx) {
    const ang = Math.atan2(this.dirY, this.dirX);
    ctx.save();
    ctx.translate(this.nozzle.x, this.nozzle.y);
    ctx.rotate(ang);
    // neck
    ctx.fillStyle = '#5d6b8c';
    roundRect(ctx, -20, -8, 24, 16, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(ctx, -18, -6, 20, 5, 2.5); ctx.fill();
    // flat floor head, seen from above
    ctx.fillStyle = '#4d5878';
    ctx.beginPath();
    ctx.moveTo(-2, -16);
    ctx.quadraticCurveTo(8, -27, 20, -25);
    ctx.quadraticCurveTo(25, -13, 25, 0);
    ctx.quadraticCurveTo(25, 13, 20, 25);
    ctx.quadraticCurveTo(8, 27, -2, 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.beginPath();
    ctx.moveTo(-1, -14); ctx.quadraticCurveTo(7, -23, 17, -21);
    ctx.lineTo(17, -13); ctx.quadraticCurveTo(7, -15, -1, -8);
    ctx.closePath(); ctx.fill();
    // the intake slot: a dark mouth, never a radius or an arrow
    ctx.fillStyle = '#12141d';
    roundRect(ctx, 11, -20, 11, 40, 5); ctx.fill();
    ctx.fillStyle = '#242838';
    roundRect(ctx, 12.5, -18, 4, 36, 2); ctx.fill();
    // bristle strip
    ctx.strokeStyle = 'rgba(230,220,200,0.5)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = -17; i <= 17; i += 3.4) { ctx.moveTo(22, i); ctx.lineTo(25.5, i); }
    ctx.stroke();
    ctx.restore();
  }

  snapshot() {
    return {
      nozzle: { x: Math.round(this.nozzle.x), y: Math.round(this.nozzle.y) },
      mouth: { x: Math.round(this.mouthX), y: Math.round(this.mouthY) },
      body: { x: Math.round(this.body.x), y: Math.round(this.body.y) },
      dir: { x: +this.dirX.toFixed(3), y: +this.dirY.toFixed(3) },
      power: +this.power.toFixed(3), radius: Math.round(this.radius),
      transits: this.transits.length, cup: this.cup.length,
    };
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
