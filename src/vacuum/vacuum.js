import { clamp, lerp, smoothstep, spring2, splineAt, splinePath, TAU } from '../core/math.js';

const TMP = { x: 0, y: 0 };
const TMP2 = { x: 0, y: 0 };
const TMP3 = { x: 0, y: 0 };

/**
 * Lead offsets in SCREEN px (so the finger never covers the mouth).
 * Exported because the dev harness has to aim the MOUTH at a target, which
 * means offsetting the finger by `up` AND by the mouth offset below.
 */
export const LEAD = {
  portrait: { up: 92, ahead: 0, bodyBack: 124 },
  landscape: { up: 78, ahead: 36, bodyBack: 108 },
};

/**
 * How far in front of the nozzle centre the mouth sits, in DESIGN px. The head
 * points "up" when parked, so the mouth is this much further along dir.
 */
export const MOUTH_OFFSET = 22;

const TUBE_SAMPLES = 34;

export class Vacuum {
  constructor(rng) {
    this.rng = rng;
    this.pose = 'portrait';

    this.nozzle = { x: 0, y: 0, vx: 0, vy: 0 };
    this.body = { x: 0, y: 80, vx: 0, vy: 0 };
    this.dirX = 0; this.dirY = -1;
    this.aheadX = 0; this.aheadY = -1;   // smoothed drag direction

    this.power = 1;            // 1 = idle airflow, up to MAXP while held still
    this.powerN = 0;           // 0..1 normalised
    this.load = 0;             // 0..1, debris currently in the flow
    this.time = 0;
    this.gulpAmount = 0;       // mouth squash when something goes in
    /**
     * 0..1 blockage at the intake. The vacuum itself understands it: the
     * motor pitch drops, the flow weakens and the head shakes. Debris that
     * plugs the mouth (a sock, a jammed dust bunny) just sets it every frame.
     */
    this.clog = 0;
    this._shakeX = 0; this._shakeY = 0;

    // gesture mirrors, so debris/scenes never need the Input object
    this.rub = 0; this.circle = 0; this.scrub = 0;
    this._lastHeadDirX = 0; this._lastHeadDirY = 0; this._scrubE = 0;

    // optional cone light, used by dark scenes (see src/core/light.js)
    this.headlight = { on: false, r: 260, intensity: 1, cone: 0.5, softness: 0 };

    this.hosePts = [ {x:0,y:0}, {x:0,y:0,vx:0,vy:0}, {x:0,y:0,vx:0,vy:0}, {x:0,y:0} ];
    this._tube = [ {x:0,y:0}, this.hosePts[0], this.hosePts[1], this.hosePts[2], this.hosePts[3], {x:0,y:0} ];
    this._ts = [];
    for (let i = 0; i < TUBE_SAMPLES; i++) this._ts.push({ x: 0, y: 0, d: 0 });
    this.tubeLen = 1;

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
    this._mouth = { x: 0, y: 0, dirX: 0, dirY: -1 };
  }

  get MAXP() { return 2.2; }
  /** Radius of the physical head, for prop collision. */
  get headRadius() { return 34; }

  setPose(pose) { this.pose = pose; }
  /** How far ahead of the finger the head is drawn, in screen px. */
  get leadUp() { return (LEAD[this.pose] || LEAD.portrait).up; }

  reset(x, y) {
    this.nozzle.x = x; this.nozzle.y = y; this.nozzle.vx = 0; this.nozzle.vy = 0;
    this.body.x = x; this.body.y = y + 120; this.body.vx = 0; this.body.vy = 0;
    for (let i = 0; i < this.hosePts.length; i++) {
      const t = i / (this.hosePts.length - 1);
      this.hosePts[i].x = lerp(x, this.body.x, t);
      this.hosePts[i].y = lerp(y, this.body.y, t);
      this.hosePts[i].vx = 0; this.hosePts[i].vy = 0;
    }
    this.transits.length = 0;
    this.power = 1; this.powerN = 0; this.gulpAmount = 0; this.clog = 0;
  }

  clearCup() { this.cup.length = 0; this.cupCols.fill(0); }

  // ---------------------------------------------------------------- update

  update(dt, input, cam) {
    this.time += dt;
    this.rub = input.rub; this.circle = input.circle;

    // --- suction power ---
    // On a touch screen the finger is either on the glass or not, so "press and
    // hold" means: finger down AND not sweeping. Stop moving -> the motor winds
    // up over ~0.3s and distant fibers start to lean. Discoverable by accident.
    const stillness = input.down ? smoothstep(320, 80, Math.hypot(input.vx, input.vy)) : 0;
    const target = 1 + (this.MAXP - 1) * stillness;
    const tau = target > this.power ? 0.3 : 0.45;
    this.power += (target - this.power) * (1 - Math.exp(-dt / (tau / 3)));
    this.powerN = clamp((this.power - 1) / (this.MAXP - 1), 0, 1);
    this.gulpAmount *= Math.exp(-dt / 0.045);
    // whatever is plugging the mouth re-asserts `clog` every frame; left alone
    // it clears itself quickly, so nothing can forget to switch it off
    this.clog = clamp(this.clog * Math.exp(-dt / 0.09), 0, 1);
    // a clogged head judders: the motor is working and nothing is moving
    if (this.clog > 0.01) {
      const a = this.clog * 2.6;
      this._shakeX = Math.sin(this.time * 61) * a;
      this._shakeY = Math.cos(this.time * 47.3) * a;
    } else { this._shakeX = 0; this._shakeY = 0; }

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

    // the head leads the finger, but must never leave the screen (landscape is
    // only ~390px tall: a finger near the top edge would push it out of view)
    const m = 34;
    const sx = clamp(input.x + axn * L.ahead * drag, m, cam.w - m);
    const sy = clamp(input.y - L.up + ayn * L.ahead * drag * 0.5, m, cam.h - m);
    cam.toWorld(sx, sy, TMP);
    const ntx = TMP.x, nty = TMP.y;
    cam.toWorld(input.x, input.y + L.bodyBack * 0.42, TMP2);
    const btx = TMP2.x, bty = TMP2.y;

    const pnx = this.nozzle.x, pny = this.nozzle.y;
    spring2(this.nozzle, ntx, nty, 24, dt);
    spring2(this.body, btx, bty, 12, dt);

    // --- scrub: back-and-forth reversals of the HEAD itself (brush-roll input)
    const hdx = this.nozzle.x - pnx, hdy = this.nozzle.y - pny;
    const hl = Math.hypot(hdx, hdy);
    if (hl > 0.6) {
      const ux = hdx / hl, uy = hdy / hl;
      const dot = ux * this._lastHeadDirX + uy * this._lastHeadDirY;
      if (dot < -0.2) this._scrubE += 0.5;
      this._lastHeadDirX = ux; this._lastHeadDirY = uy;
    }
    this._scrubE = Math.max(0, this._scrubE - dt * 0.9);
    this.scrub = clamp(this._scrubE, 0, 1);

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
    const backX = this.nozzle.x - this.dirX * 17, backY = this.nozzle.y - this.dirY * 17;
    const topX = this.body.x + Math.cos(this.bodyAngle) * 26, topY = this.body.y + Math.sin(this.bodyAngle) * 26;
    this.hosePts[0].x = backX; this.hosePts[0].y = backY;
    this.hosePts[3].x = topX; this.hosePts[3].y = topY;
    const sag = 12 + this.powerN * 4;
    spring2(this.hosePts[1], lerp(backX, topX, 0.35), lerp(backY, topY, 0.35) + sag, 11, dt);
    spring2(this.hosePts[2], lerp(backX, topX, 0.7), lerp(backY, topY, 0.7) + sag * 0.7, 9.5, dt);

    // cup position in world (body local offset, rotated)
    const ca = Math.cos(this.bodyAngle + Math.PI / 2), sa = Math.sin(this.bodyAngle + Math.PI / 2);
    const clx = 0, cly = 8;
    this.cupCenter.x = this.body.x + clx * ca - cly * sa;
    this.cupCenter.y = this.body.y + clx * sa + cly * ca;
    this._tube[0].x = this.mouthX; this._tube[0].y = this.mouthY;
    this._tube[5].x = this.cupCenter.x; this._tube[5].y = this.cupCenter.y;
    this._resampleTube();

    // --- transits ---
    let load = 0;
    for (let i = this.transits.length - 1; i >= 0; i--) {
      const it = this.transits[i];
      it.t += dt / it.dur;
      load += 1;
      if (it.t >= 1) { this._land(it); this.transits.splice(i, 1); }
    }
    this.load = clamp(load / 3, 0, 1);

    this.cupPhase = this.time * (7 + this.powerN * 7);
    this._updateMotes(dt, cam);

    if (this.audio) this.audio.setMotor(this.power, this.load, this.clog);
  }

  get mouthX() { return this.nozzle.x + this.dirX * MOUTH_OFFSET; }
  get mouthY() { return this.nozzle.y + this.dirY * MOUTH_OFFSET; }
  get radius() { return 138 * (0.8 + 0.3 * this.powerN); }
  /** A blocked intake moves less air. 1 = clear, 0.25 = fully plugged. */
  get flowScale() { return 1 - 0.75 * this.clog; }

  /** Current mouth position and facing, for debris that feeds itself in. */
  mouth() {
    this._mouth.x = this.mouthX; this._mouth.y = this.mouthY;
    this._mouth.dirX = this.dirX; this._mouth.dirY = this.dirY;
    return this._mouth;
  }

  // ---------------------------------------------------------------- field

  /**
   * Airflow at a world point. This is THE contract debris reads; nothing else
   * should decide "am I close enough".
   */
  field(x, y, out) {
    out = out || this._fieldOut;
    const mx = this.mouthX, my = this.mouthY;
    let dx = mx - x, dy = my - y;
    let d = Math.hypot(dx, dy);
    if (d < 1e-4) d = 1e-4;
    const ux = dx / d, uy = dy / d;
    const align = -(ux * this.dirX + uy * this.dirY);
    const cone = 0.1 + 0.9 * smoothstep(-0.35, 0.8, align);
    const r = this.radius;
    const dd = d / r;
    // squared inverse-square: the flow is strongly local, so getting CLOSER is
    // what changes the world, not hovering vaguely nearby
    const q = 1 + dd * dd;
    const falloff = 1 / (q * q);
    const s = this.power * this.flowScale * falloff * cone;
    out.strength = s;
    out.fx = ux * s;
    out.fy = uy * s;
    out.dist = d;
    const lx = -(dx * this.dirX + dy * this.dirY);
    const ly = -(dx * -this.dirY + dy * this.dirX);
    const a = 22, b = 30;
    out.inCapture = (lx * lx) / (a * a) + (ly * ly) / (b * b) <= 1;
    return out;
  }

  // ---------------------------------------------------------------- transit

  _resampleTube() {
    const ts = this._ts;
    let acc = 0;
    splineAt(this._tube, 0, TMP3);
    ts[0].x = TMP3.x; ts[0].y = TMP3.y; ts[0].d = 0;
    for (let i = 1; i < TUBE_SAMPLES; i++) {
      splineAt(this._tube, i / (TUBE_SAMPLES - 1), TMP3);
      acc += Math.hypot(TMP3.x - ts[i - 1].x, TMP3.y - ts[i - 1].y);
      ts[i].x = TMP3.x; ts[i].y = TMP3.y; ts[i].d = acc;
    }
    this.tubeLen = Math.max(1, acc);
  }

  /** Point at `dist` along the tube from the mouth. Clamped at both ends. */
  tubePointAt(dist, out) {
    const ts = this._ts;
    if (dist <= 0) { out.x = ts[0].x; out.y = ts[0].y; return out; }
    const last = ts[TUBE_SAMPLES - 1];
    if (dist >= last.d) { out.x = last.x; out.y = last.y; return out; }
    let lo = 0;
    for (let i = 1; i < TUBE_SAMPLES; i++) { if (ts[i].d >= dist) { lo = i - 1; break; } }
    const a = ts[lo], b = ts[lo + 1];
    const t = (dist - a.d) / Math.max(1e-4, b.d - a.d);
    out.x = a.x + (b.x - a.x) * t;
    out.y = a.y + (b.y - a.y) * t;
    return out;
  }

  /**
   * Send a captured item through the tube into the cup.
   *   {kind:'fluff'|'crumb'|'wisp', color, size}
   *   {kind:'strand', color, width, points:[{x,y}...]}  points[0] enters first;
   *     the tail stays outside the mouth until its turn, so you see the whole
   *     thing run in head-first.
   */
  /** Squash the mouth, as if something just went in. */
  gulp(amount = 1) {
    if (amount > this.gulpAmount) this.gulpAmount = clamp(amount, 0, 1);
    return this.gulpAmount;
  }

  transit(item, dur) {
    this.gulp(1);
    let it;
    if (item.kind === 'strand' && item.points && item.points.length > 1) {
      const pts = item.points.map((p) => ({ x: p.x, y: p.y, s: 0 }));
      let len = 0;
      for (let i = 1; i < pts.length; i++) {
        len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        pts[i].s = len;
      }
      it = {
        kind: 'strand', color: item.color || '#e7e2d8', width: item.width || 2.4,
        pts, strandLen: len, size: item.size || 10,
        t: 0, dur: (this.tubeLen + len) / 1000, seed: this._seed(),
      };
      if (it.dur < 0.28) it.dur = 0.28;
    } else {
      it = {
        kind: item.kind, color: item.color, size: item.size, detail: item.detail || null,
        t: 0, dur: 0.22 + Math.min(item.size, 20) * 0.006, seed: this._seed(),
        x: this.mouthX, y: this.mouthY,
      };
    }
    if (dur !== undefined && dur > 0) it.dur = dur;
    this.transits.push(it);
    if (this.audio) {
      const k = item.kind === 'crumb' ? 'tick' : item.kind === 'wisp' ? 'tick' : 'pop';
      this.audio.pop(k, item.kind === 'wisp' ? 0.35 : item.kind === 'crumb' ? 0.6 : 1);
    }
    return it;
  }

  /** Put something straight into the cup, with no tube ride. */
  addToCup(item) {
    this._land({
      kind: item.kind || 'fluff', color: item.color || '#cfc6b8',
      size: item.size === undefined ? 8 : item.size, seed: this._seed(),
    });
    return this.cup[this.cup.length - 1];
  }

  /**
   * Tip the cup out. Returns the contents with WORLD coordinates filled in
   * (`wx`, `wy`), so a scene can keep animating them after the cup is clear.
   */
  emptyCup() {
    const a = this.bodyAngle + Math.PI / 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const out = this.cup.map((c) => ({
      x: c.x, y: c.y, r: c.r, kind: c.kind, color: c.color, seed: c.seed, rot: c.rot,
      wx: this.body.x + c.x * ca - c.y * sa,
      wy: this.body.y + c.x * sa + c.y * ca,
    }));
    this.clearCup();
    return out;
  }

  /** Cup-local point -> world. The finale pour needs this every frame. */
  cupToWorld(lx, ly, out) {
    const a = this.bodyAngle + Math.PI / 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    out.x = this.body.x + lx * ca - ly * sa;
    out.y = this.body.y + lx * sa + ly * ca;
    return out;
  }

  _seed() { return (this.rng ? this.rng.next() : Math.random()) * 100; }

  _land(it) {
    const cols = this.cupCols;
    let best = 0;
    for (let i = 1; i < cols.length; i++) if (cols[i] < cols[best]) best = i;
    const jitter = (this.rng ? this.rng.next() : Math.random()) - 0.5;
    const r = clamp((it.kind === 'strand' ? it.size : it.size) * 0.42, 1.4, 9);
    const x = (best - (cols.length - 1) / 2) * 4.2 + jitter * 2;
    const y = 18 - cols[best] - r;
    cols[best] += r * 1.45;
    if (best > 0) cols[best - 1] += r * 0.35;
    if (best < cols.length - 1) cols[best + 1] += r * 0.35;
    this.cup.push({
      x, y, r, kind: it.kind === 'strand' ? 'coil' : it.kind, color: it.color, seed: it.seed,
      rot: (this.rng ? this.rng.next() : Math.random()) * TAU,
    });
    if (this.cup.length > 200) this.cup.shift();
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
          const rad = 50 + (this.rng ? this.rng.next() : Math.random()) * this.radius * 0.7;
          m.x = this.mouthX + Math.cos(a) * rad;
          m.y = this.mouthY + Math.sin(a) * rad * 0.8;
          m.vx = 0; m.vy = 0; m.life = 1; m.r = 0.7 + Math.random() * 1;
          break;
        }
      }
    }
    const f = this._fieldOut;
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      if (m.life <= 0) continue;
      this.field(m.x, m.y, f);
      m.vx += f.fx * 760 * dt;
      m.vy += f.fy * 760 * dt;
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
    ctx.ellipse(this.body.x + 5, this.body.y + 38, 42, 15, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.ellipse(this.nozzle.x + 4, this.nozzle.y + 20, 22, 7, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  _drawHose(ctx) {
    const pts = this.hosePts;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); splinePath(ctx, pts, 26);
    ctx.strokeStyle = '#3f4a63'; ctx.lineWidth = 20; ctx.stroke();
    ctx.beginPath(); splinePath(ctx, pts, 26);
    ctx.strokeStyle = '#5d6b8c'; ctx.lineWidth = 15; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2.4;
    const p = TMP;
    for (let i = 1; i < 14; i++) {
      splineAt(pts, i / 14, p);
      splineAt(pts, i / 14 + 0.012, TMP2);
      const ax = TMP2.x - p.x, ay = TMP2.y - p.y;
      const l = Math.hypot(ax, ay) || 1;
      const nx2 = -ay / l * 6.5, ny2 = ax / l * 6.5;
      ctx.beginPath(); ctx.moveTo(p.x - nx2, p.y - ny2); ctx.lineTo(p.x + nx2, p.y + ny2); ctx.stroke();
    }
    this._drawTransits(ctx);
  }

  _drawTransits(ctx) {
    const p = TMP, q = TMP2;
    for (let i = 0; i < this.transits.length; i++) {
      const it = this.transits[i];
      const u = clamp(it.t, 0, 1);
      if (it.kind === 'strand') { this._drawStrandTransit(ctx, it, u); continue; }
      const e = u * u * (3 - 2 * u);
      const d = e * this.tubeLen;
      this.tubePointAt(d, p);
      this.tubePointAt(Math.min(this.tubeLen, d + 12), q);
      it.x = p.x; it.y = p.y;
      const ang = Math.atan2(q.y - p.y, q.x - p.x);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang);
      const w = it.size * 0.62 * 1.9, h = it.size * 0.42;
      ctx.fillStyle = it.color;
      ctx.beginPath(); ctx.ellipse(0, 0, w, h, 0, 0, TAU); ctx.fill();
      // bright core: the thing racing through the tube must pop
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.ellipse(-w * 0.15, -h * 0.2, w * 0.45, h * 0.4, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  _drawStrandTransit(ctx, it, u) {
    const head = u * (this.tubeLen + it.strandLen);
    const p = TMP;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = it.color;
    ctx.lineWidth = it.width;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < it.pts.length; i++) {
      const v = it.pts[i];
      const d = head - v.s;
      let x, y;
      if (d <= 0) { x = v.x; y = v.y; }        // still outside the mouth
      else { this.tubePointAt(Math.min(d, this.tubeLen), p); x = p.x; y = p.y; }
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = it.width * 0.4;
    ctx.stroke();
    ctx.restore();
  }

  _drawBody(ctx) {
    const a = this.bodyAngle + Math.PI / 2;
    ctx.save();
    ctx.translate(this.body.x, this.body.y);
    ctx.rotate(a);

    ctx.fillStyle = '#e8547c';
    roundRect(ctx, -34, -33, 68, 73, 18); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    roundRect(ctx, -28, -28, 22, 58, 11); ctx.fill();
    ctx.strokeStyle = 'rgba(90,20,40,0.35)'; ctx.lineWidth = 2.5;
    roundRect(ctx, -34, -33, 68, 73, 18); ctx.stroke();

    // transparent panel + dust cup
    ctx.save();
    roundRect(ctx, -27, -15, 54, 48, 13);
    ctx.clip();
    ctx.fillStyle = 'rgba(220,240,255,0.30)';
    ctx.fillRect(-27, -15, 54, 48);
    const jig = Math.sin(this.cupPhase) * (0.5 + this.powerN * 1.2);
    for (let i = 0; i < this.cup.length; i++) {
      const c = this.cup[i];
      const wob = Math.sin(this.cupPhase * 0.8 + c.seed) * (0.4 + this.powerN * 1.0);
      ctx.save();
      ctx.translate(c.x + wob * 0.6, c.y + jig * 0.5);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      if (c.kind === 'crumb') {
        ctx.fillRect(-c.r, -c.r * 0.7, c.r * 2, c.r * 1.4);
      } else if (c.kind === 'coil') {
        ctx.strokeStyle = c.color; ctx.lineWidth = 1.4;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.ellipse(0, 0, c.r * (0.5 + k * 0.28), c.r * (0.34 + k * 0.2), k * 1.1, 0, TAU);
          ctx.stroke();
        }
      } else {
        ctx.beginPath(); ctx.ellipse(0, 0, c.r * 1.15, c.r, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = c.color; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.7;
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
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2.5;
    roundRect(ctx, -27, -15, 54, 48, 13); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-19, -8); ctx.lineTo(-19, 22); ctx.stroke();

    ctx.restore();
  }

  _drawHead(ctx) {
    const ang = Math.atan2(this.dirY, this.dirX);
    const g = this.gulpAmount;
    ctx.save();
    ctx.translate(this.nozzle.x + this._shakeX, this.nozzle.y + this._shakeY);
    ctx.rotate(ang);
    ctx.scale(1 + 0.12 * g, 1 - 0.1 * g);      // the mouth gulps when it swallows
    // neck
    ctx.fillStyle = '#5d6b8c';
    roundRect(ctx, -26, -11, 32, 22, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(ctx, -23, -8, 26, 6, 3); ctx.fill();
    // flat floor head, seen from above
    ctx.fillStyle = '#4d5878';
    ctx.beginPath();
    ctx.moveTo(-3, -22);
    ctx.quadraticCurveTo(11, -37, 27, -34);
    ctx.quadraticCurveTo(34, -18, 34, 0);
    ctx.quadraticCurveTo(34, 18, 27, 34);
    ctx.quadraticCurveTo(11, 37, -3, 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.beginPath();
    ctx.moveTo(-1, -19); ctx.quadraticCurveTo(10, -31, 23, -29);
    ctx.lineTo(23, -18); ctx.quadraticCurveTo(10, -20, -1, -11);
    ctx.closePath(); ctx.fill();
    // the intake slot: a dark mouth, never a radius or an arrow
    ctx.fillStyle = '#12141d';
    roundRect(ctx, 15, -27, 15, 54, 7); ctx.fill();
    ctx.fillStyle = '#242838';
    roundRect(ctx, 17, -24, 5, 48, 2.5); ctx.fill();
    // bristle strip
    ctx.strokeStyle = 'rgba(230,220,200,0.5)'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = -23; i <= 23; i += 4.2) { ctx.moveTo(30, i); ctx.lineTo(34.5, i); }
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
      rub: +this.rub.toFixed(2), circle: +this.circle.toFixed(2), scrub: +this.scrub.toFixed(2),
      transits: this.transits.length, cup: this.cup.length,
      clog: +this.clog.toFixed(2), gulp: +this.gulpAmount.toFixed(2),
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
