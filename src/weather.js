// weather.js -- sky, wind, rain, the first drop on the glass, streaks,
// puddles. Nothing here ever punishes the player: rain only changes how the
// world looks and sounds.

import { clamp, lerp } from './layout.js';

const MAX_DROPS = 150;      // hard cap: mobile Safari must stay at 60fps
const MAX_SPLASH = 20;
const MAX_STREAKS = 14;

const SKY_CALM_TOP = [150, 214, 244];
const SKY_CALM_BOT = [226, 245, 252];
const SKY_RAIN_TOP = [84, 104, 126];
const SKY_RAIN_BOT = [150, 168, 182];

function mix3(a, b, t, out) {
  out[0] = lerp(a[0], b[0], t);
  out[1] = lerp(a[1], b[1], t);
  out[2] = lerp(a[2], b[2], t);
  return out;
}
function css(c) {
  return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
}

export class Weather {
  constructor(audio) {
    this.audio = audio;
    this.t = 0;
    this.intensity = 0;     // 0..1 rain strength
    this.targetIntensity = 0;
    this.dark = 0;          // 0..1 how stormy the sky looks
    this.windPhase = 0;
    this.gust = 0;          // 0..1 current gust envelope
    this.gustTimer = 2.2;
    this.gustPulse = 0;     // spikes to 1 at the start of each gust
    this.gustDir = 1;       // which way the gust leans, across inDir
    this.gustBoost = 1;     // how big this particular gust is
    this.gustHold = 0;      // seconds the gust stays at full before decaying
    this.hero = false;      // the first gust after the first drop is the big one
    this.still = false;     // the world holds its breath for the first drop
    this.wind = { x: 0, y: 0 };
    this.windEnabled = false;
    this.puddle = 0;

    // The hero moment: one drop on the glass, and the one or two that follow
    // it before any mark appears on the washing.
    this.glassDrop = null;
    this.extraDrops = [];
    this._extraT = 0;
    this._extraLeft = 0;

    this.drops = new Array(MAX_DROPS);
    for (let i = 0; i < MAX_DROPS; i++) {
      this.drops[i] = { x: 0, y: 0, vy: 0, len: 0, w: 1, seeded: false };
    }
    this.splashes = new Array(MAX_SPLASH);
    for (let i = 0; i < MAX_SPLASH; i++) this.splashes[i] = { x: 0, r: 0, a: 0 };
    this.streaks = [];
    this._splashCd = 0;
    this._tmpA = [0, 0, 0];
    this._tmpB = [0, 0, 0];
    this.darkFloor = 0;     // the sky goes grey before the rain arrives
    this.rainScale = 1;     // drop length / thickness, by viewport width
    this.countScale = 1;    // how many of them, by viewport width
    // Rings from a finger poked into the wet balcony. Not weather: a reply.
    this.rings = [];
    // Cached sky gradient. Building a CanvasGradient is not free, and this
    // one was being rebuilt every single frame. (Each bead on the glass keeps
    // its own, on the drop object.)
    this._skyG = null;
    this._skyKey = '';
  }

  /**
   * Begin the first drop running down the pane.
   *
   * It is one bead of water, not a balloon: small, asymmetric, dark-rimmed,
   * with a white pinprick where the light is and a splat ring where it landed.
   * Then, before the marks appear on the washing, one or two smaller ones
   * follow it down -- one bead is an event, three is rain.
   */
  startFirstDrop() {
    this.glassDrop = this._makeDrop(0.088, 0.20, 1);
    this.extraDrops.length = 0;
    this._extraT = 0.8 + Math.random() * 0.35;
    this._extraLeft = 1 + (Math.random() < 0.6 ? 1 : 0);
    if (this.audio) this.audio.drop();
  }

  _makeDrop(u, v, scale) {
    return {
      u, v, v0: v, r: 0, speed: 0, age: 0, scale, life: 1,
      splat: 0, wob: Math.random() * 6.283, trail: [],
    };
  }

  /**
   * One drop's worth of physics: swell, cling, run, and finally go.
   *
   * It goes when it has run out of glass to run down, or when the rain proper
   * has arrived and the streaks have taken the pane over -- a hero bead parked
   * at the bottom of the window for the rest of the game is scenery nobody
   * asked for.
   */
  _stepDrop(gd, dt, fade) {
    if (fade || gd.v >= 0.9399) gd.life = Math.max(0, gd.life - dt);
    gd.age += dt;
    gd.r = Math.min(1, gd.age / 0.18);
    gd.splat = gd.age < 0.4 ? gd.age / 0.4 : 1;
    if (gd.age <= 0.6) return;   // it hangs there first
    gd.speed = Math.min(0.30, gd.speed + dt * 0.10);
    const prevV = gd.v;
    gd.v += gd.speed * dt;
    // Leave a thin, slightly wavering trail of tiny beads that thins as it
    // goes: the bead is spending itself on the glass.
    const last = gd.trail.length ? gd.trail[gd.trail.length - 1].v : gd.v0;
    if (gd.v - last > 0.035) {
      gd.trail.push({ u: gd.u + (Math.random() - 0.5) * 0.008, v: prevV, r: 0.25 + Math.random() * 0.4 });
      if (gd.trail.length > 18) gd.trail.shift();
    }
    // The run wavers instead of ruling a straight line.
    gd.u += Math.sin(gd.v * 22 + gd.wob) * 0.0009;
    if (gd.v > 0.94) { gd.v = 0.94; gd.speed = 0; }
  }

  /**
   * The wind arrives. The first gust is the "look, the wind" beat, so it is
   * deliberately the biggest one of the game: it leans hard across the room
   * direction, it holds at full strength instead of decaying immediately, and
   * everything that is still pegged down wobbles and glints with it.
   */
  startWind() {
    this.windEnabled = true;
    this.gustTimer = 0.15;
    this.hero = true;
  }

  /** The world holds still while the single drop is on the glass. */
  setStill(on) { this.still = !!on; }

  setTargetIntensity(v) { this.targetIntensity = clamp(v, 0, 1); }

  /**
   * How grey the sky is allowed to get before a drop has fallen.
   *
   * The playtest found the rain unreadable until eight or nine seconds in --
   * the wind arrived first and a gust on its own does not say "rain". A sky
   * that is already darkening while the wind blows does, and it costs nothing
   * but a floor under `dark`.
   */
  setDarkFloor(v) { this.darkFloor = clamp(v, 0, 1); }

  /** A finger in the puddle: one ring, spreading. */
  ring(x, y) {
    this.rings.push({ x, y, r: 2, a: 0.9 });
    if (this.rings.length > 6) this.rings.shift();
  }

  update(dt, world) {
    this.t += dt;
    this.intensity += (this.targetIntensity - this.intensity) * Math.min(1, dt * 0.45);
    // A wide screen swallows rain: the same drops spread over an iPad in
    // landscape read as drizzle. Longer, fatter, more of them, and a sky that
    // goes a shade further down -- all of it derived from the viewport, all of
    // it plain arithmetic on numbers that already exist.
    this.rainScale = 1 + 0.5 * clamp((world.w - 820) / 180, 0, 1);
    this.countScale = 1 + 0.35 * clamp((world.w - 820) / 360, 0, 1);
    const land = world.portrait ? 1 : 1.12;
    this.dark = clamp(Math.max(this.intensity * 1.05 * land, this.darkFloor * land), 0, 1);

    // --- wind -----------------------------------------------------------
    this.windPhase += dt * 1.6;
    this.gustPulse = Math.max(0, this.gustPulse - dt * 3);
    if (this.windEnabled) {
      this.gustTimer -= dt;
      if (this.gustTimer <= 0) {
        this.gustTimer = 2.4 + Math.random() * 2.2;
        this.gust = 1;
        this.gustPulse = 1;
        // Gusts alternate, so the washing swings one way and then back
        // instead of being walked off the edge of the screen.
        this.gustDir = this.hero ? 1 : -this.gustDir;
        this.gustBoost = this.hero ? 1.9 : 1;
        this.gustHold = this.hero ? 0.75 : 0.10;
        this.hero = false;
      }
      if (this.gustHold > 0) this.gustHold -= dt;
      else this.gust *= Math.pow(0.22, dt); // exponential decay
    }
    const calm = this.still ? 0.22 : 1;
    const breeze = (Math.sin(this.windPhase) * 0.22 +
      Math.sin(this.windPhase * 0.37) * 0.12) * calm;
    // Wind always pushes toward the room: the wind itself is the hint.
    const gk = this.gust * this.gustBoost;
    const strength = (this.windEnabled ? 260 : 0) * (0.35 + 0.65 * gk) +
      (this.windEnabled ? 0 : 60) * breeze;
    // Across the room direction. In landscape `inDir` is horizontal, so the
    // wind above is already a visible sideways swing and this stays a breeze.
    // In portrait `inDir` points at the camera and a gust would be invisible
    // without it, so a real lateral kick rides on every gust.
    const lat = world.portrait ? this.gustDir * gk * 260 : 0;
    const cross = breeze * 70 + lat;
    this.wind.x = world.inDir.x * strength + (world.inDir.x ? 0 : cross);
    this.wind.y = world.inDir.y * strength * 0.55 + (world.inDir.y ? 0 : cross * 0.4);

    // --- glass drops -----------------------------------------------------
    const fade = this.intensity > 0.3;
    const gd = this.glassDrop;
    if (gd) {
      this._stepDrop(gd, dt, fade);
      if (gd.life <= 0) this.glassDrop = null;
    }
    if (this._extraLeft > 0) {
      this._extraT -= dt;
      if (this._extraT <= 0) {
        this._extraLeft--;
        this._extraT = 0.55 + Math.random() * 0.4;
        const u = 0.088 + (this.extraDrops.length ? -0.16 : 0.19) + (Math.random() - 0.5) * 0.06;
        this.extraDrops.push(this._makeDrop(clamp(u, 0.05, 0.9), 0.12 + Math.random() * 0.22, 0.62));
        if (this.audio) this.audio.drop();
      }
    }
    for (let i = this.extraDrops.length - 1; i >= 0; i--) {
      this._stepDrop(this.extraDrops[i], dt, fade);
      if (this.extraDrops[i].life <= 0) this.extraDrops.splice(i, 1);
    }

    // --- rain particles ---------------------------------------------------
    const op = world.opening;
    const active = this.activeDrops();
    const fall = 900 + 700 * this.intensity;
    for (let i = 0; i < MAX_DROPS; i++) {
      const d = this.drops[i];
      if (i >= active) { d.seeded = false; continue; }
      if (!d.seeded) {
        d.x = op.x + Math.random() * op.w;
        d.y = op.y + Math.random() * op.h;
        d.vy = fall * (0.7 + Math.random() * 0.6);
        d.len = 10 + Math.random() * 22;
        d.w = 1 + Math.random() * 1.4;
        d.seeded = true;
      }
      d.y += d.vy * dt;
      d.x += this.wind.x * 0.0016 * dt * 60;
      if (d.y > world.floorY) {
        d.y = op.y - 20 - Math.random() * 40;
        d.x = op.x + Math.random() * op.w;
        this._splash(d.x, world);
      }
      if (d.x < op.x - 20) d.x = op.right;
      else if (d.x > op.right + 20) d.x = op.x;
    }

    // --- puddle / splashes ------------------------------------------------
    this.puddle = clamp(this.puddle + dt * this.intensity * 0.07, 0, 1);
    for (let i = 0; i < MAX_SPLASH; i++) {
      const s = this.splashes[i];
      if (s.a > 0) { s.a -= dt * 2.6; s.r += dt * 42; }
    }
    this._splashCd -= dt;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.r += dt * 120;
      r.a -= dt * 1.5;
      if (r.a <= 0) this.rings.splice(i, 1);
    }

    // --- streaks on the glass ---------------------------------------------
    if (this.intensity > 0.2 && this.streaks.length < MAX_STREAKS && Math.random() < dt * 4) {
      this.streaks.push({
        u: 0.03 + Math.random() * 0.94,
        v: Math.random() * 0.2,
        len: 0.12 + Math.random() * 0.4,
        sp: 0.05 + Math.random() * 0.14,
        a: 0.35 + Math.random() * 0.4,
      });
    }
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i];
      s.v += s.sp * dt;
      if (s.v > 1.05) { s.v = 0; s.u = 0.03 + Math.random() * 0.94; }
    }
  }

  _splash(x, world) {
    if (this._splashCd > 0) return;
    this._splashCd = 0.06;
    for (let i = 0; i < MAX_SPLASH; i++) {
      const s = this.splashes[i];
      if (s.a <= 0) {
        s.x = x; s.r = 1; s.a = 0.7;
        if (this.audio && Math.random() < 0.12) this.audio.splash();
        return;
      }
    }
  }

  skyTop() { return css(mix3(SKY_CALM_TOP, SKY_RAIN_TOP, this.dark, this._tmpA)); }
  skyBottom() { return css(mix3(SKY_CALM_BOT, SKY_RAIN_BOT, this.dark, this._tmpB)); }

  drawSky(ctx, world) {
    const op = world.opening;
    // 32 buckets of darkness. The sky crossfades over tens of seconds, so the
    // step between two buckets is far below what an eye can see -- and the
    // gradient is built about thirty times in a whole playthrough instead of
    // sixty times a second.
    const bucket = Math.round(this.dark * 31);
    const key = bucket + ':' + Math.round(op.y) + ':' + Math.round(op.bottom);
    if (key !== this._skyKey) {
      this._skyKey = key;
      const t = bucket / 31;
      const g2 = ctx.createLinearGradient(0, op.y, 0, op.bottom);
      g2.addColorStop(0, css(mix3(SKY_CALM_TOP, SKY_RAIN_TOP, t, this._tmpA)));
      g2.addColorStop(1, css(mix3(SKY_CALM_BOT, SKY_RAIN_BOT, t, this._tmpB)));
      this._skyG = g2;
    }
    const g = this._skyG;
    ctx.fillStyle = g;
    ctx.fillRect(op.x, op.y, op.w, op.h);

    // Soft chunky clouds; they thicken and sink as the storm arrives.
    const n = 3;
    for (let i = 0; i < n; i++) {
      const p = (i + 1) / (n + 1);
      const cx = op.x + op.w * (0.18 + p * 0.62) + Math.sin(this.t * 0.06 + i) * op.w * 0.03;
      const cy = op.y + op.h * (0.10 + 0.05 * i + this.dark * 0.03);
      const r = op.w * (0.10 + 0.03 * i);
      ctx.globalAlpha = 0.55 + 0.35 * this.dark;
      ctx.fillStyle = this.dark > 0.4 ? '#6d7f92' : '#ffffff';
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.52, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - r * 0.6, cy + r * 0.1, r * 0.6, r * 0.36, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + r * 0.62, cy + r * 0.08, r * 0.55, r * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  drawBalcony(ctx, world) {
    const op = world.opening;
    const fy = world.floorY;
    // Balcony slab
    ctx.fillStyle = this.dark > 0.5 ? '#8e8175' : '#b9a894';
    ctx.fillRect(op.x, fy, op.w, op.bottom - fy);
    ctx.fillStyle = this.dark > 0.5 ? '#6f6459' : '#9c8d7c';
    ctx.fillRect(op.x, fy, op.w, Math.max(3, world.min * 0.012));

    // Railing: a few chunky uprights, kept low-contrast so cloth stays hero.
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = Math.max(3, world.min * 0.012);
    ctx.lineCap = 'round';
    const railY = fy - op.h * 0.16;
    ctx.beginPath();
    ctx.moveTo(op.x + op.w * 0.02, railY);
    ctx.lineTo(op.right - op.w * 0.02, railY);
    ctx.stroke();
    const bars = 6;
    ctx.globalAlpha = 0.7;
    for (let i = 0; i <= bars; i++) {
      const x = op.x + op.w * (0.04 + 0.92 * (i / bars));
      ctx.beginPath();
      ctx.moveTo(x, railY);
      ctx.lineTo(x, fy);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Puddle + splashes
    if (this.puddle > 0.02) {
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.4 * this.puddle;
      ctx.fillStyle = '#5b7387';
      const pw = op.w * (0.16 + 0.42 * this.puddle);
      ctx.beginPath();
      ctx.ellipse(op.x + op.w * 0.42, fy + (op.bottom - fy) * 0.55, pw * 0.5, (op.bottom - fy) * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < this.rings.length; i++) {
      const rg = this.rings[i];
      ctx.globalAlpha = Math.max(0, rg.a) * 0.9;
      ctx.strokeStyle = 'rgba(245,252,255,0.95)';
      ctx.lineWidth = Math.max(2, world.min * 0.008);
      ctx.beginPath();
      ctx.ellipse(rg.x, rg.y, rg.r, rg.r * 0.38, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < this.splashes.length; i++) {
      const s = this.splashes[i];
      if (s.a <= 0) continue;
      ctx.globalAlpha = Math.max(0, s.a) * 0.8;
      ctx.beginPath();
      ctx.ellipse(s.x, world.floorY + 3, s.r, s.r * 0.35, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** How many of the pooled drops are in play. Never more than the pool. */
  activeDrops() {
    return Math.min(MAX_DROPS, Math.round(this.intensity * MAX_DROPS * this.countScale));
  }

  drawRain(ctx, world) {
    if (this.intensity <= 0.002) return;
    const active = this.activeDrops();
    const sc = this.rainScale;
    ctx.strokeStyle = 'rgba(232,244,252,0.72)';
    ctx.lineCap = 'round';
    const tiltX = this.wind.x * 0.012;
    const tiltY = this.wind.y * 0.012;
    ctx.beginPath();
    for (let i = 0; i < active; i++) {
      const d = this.drops[i];
      if (!d.seeded) continue;
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - tiltX * 0.35, d.y - d.len * sc - tiltY * 0.2);
    }
    ctx.lineWidth = 1.6 * sc;
    ctx.stroke();
  }

  /**
   * Everything that lives on the sliding pane, drawn in pane-normalised
   * coordinates so it travels with the glass when the sash closes.
   */
  drawGlass(ctx, pane) {
    const X = (u) => pane.x + u * pane.w;
    const Y = (v) => pane.y + v * pane.h;
    const S = Math.min(pane.w, pane.h);

    // Streaks first, they sit behind the hero drop.
    if (this.streaks.length) {
      ctx.lineCap = 'round';
      for (let i = 0; i < this.streaks.length; i++) {
        const s = this.streaks[i];
        ctx.globalAlpha = s.a * 0.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = Math.max(1.5, S * 0.008);
        ctx.beginPath();
        ctx.moveTo(X(s.u), Y(Math.max(0, s.v - s.len)));
        ctx.lineTo(X(s.u), Y(Math.min(1, s.v)));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    for (let i = 0; i < this.extraDrops.length; i++) {
      this._drawBead(ctx, this.extraDrops[i], X, Y, S);
    }
    if (this.glassDrop) this._drawBead(ctx, this.glassDrop, X, Y, S);
  }

  /**
   * One bead of water on the glass.
   *
   * The playtest read the old one as a balloon: big, round, pale, floating.
   * This one is water. It is small, it is a teardrop -- fat at the bottom,
   * drawn out at the top and more so the faster it runs -- and it earns its
   * place by contrast rather than by size: a dark rim, a soft shadow under it
   * where it presses on the glass, and one hard white pinprick of a highlight.
   * It lands with a splat ring, clings for six tenths of a second, and then
   * runs, leaving a wavering trail that thins behind it.
   */
  _drawBead(ctx, gd, X, Y, S) {
    const x = X(gd.u), y = Y(gd.v);
    const sc = gd.scale === undefined ? 1 : gd.scale;
    const shed = clamp((gd.v - gd.v0) / 0.6, 0, 1);
    const r = S * (0.060 - 0.017 * shed) * gd.r * sc;
    if (r <= 0.2 || gd.life <= 0) return;

    ctx.save();
    // A, below, is the fade: the bead thins away at the end of its run, and
    // when the real rain takes the pane over.
    const A = gd.life;
    // The splat: a ring thrown out where it hit, gone in four tenths.
    if (gd.splat < 1) {
      const sp = gd.splat;
      ctx.globalAlpha = (1 - sp) * 0.75 * A;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = Math.max(1, r * 0.3 * (1 - sp));
      ctx.beginPath();
      ctx.ellipse(x, y, r * (0.7 + 2.3 * sp), r * (0.5 + 1.7 * sp), 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Trail: beads left behind, thinning the further back they are.
    for (let i = 0; i < gd.trail.length; i++) {
      const b = gd.trail[i];
      const a = (i + 1) / gd.trail.length;
      ctx.globalAlpha = 0.5 * a * A;
      ctx.fillStyle = '#eaf7ff';
      ctx.beginPath();
      ctx.ellipse(X(b.u), Y(b.v), r * 0.30 * b.r * a, r * 0.42 * b.r * a, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = A;

    // The shadow it casts on the pane: this is what makes it sit *on* glass.
    ctx.fillStyle = 'rgba(32,58,86,0.42)';
    ctx.beginPath();
    ctx.ellipse(x + r * 0.26, y + r * 0.42, r * 0.84, r * 0.94, 0, 0, Math.PI * 2);
    ctx.fill();

    const stretch = gd.speed * 5.5;
    const key = (x | 0) + ':' + (y | 0) + ':' + ((r * 4) | 0);
    if (key !== gd.gkey) {
      gd.gkey = key;
      const g2 = ctx.createRadialGradient(x - r * 0.34, y - r * 0.46, r * 0.08, x, y, r * 1.25);
      g2.addColorStop(0, 'rgba(255,255,255,0.99)');
      g2.addColorStop(0.45, 'rgba(214,240,255,0.88)');
      g2.addColorStop(1, 'rgba(118,172,208,0.72)');
      gd.grad = g2;
    }
    beadPath(ctx, x, y, r, stretch);
    ctx.fillStyle = gd.grad;
    ctx.fill();
    // Dark rim: the meniscus, and the only reason a pale bead reads at all
    // against a pale sky.
    ctx.strokeStyle = 'rgba(28,58,88,0.55)';
    ctx.lineWidth = Math.max(1, r * 0.20);
    ctx.stroke();

    // The specular: one small, hard, absolutely white dot.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x - r * 0.32, y - r * 0.40, Math.max(0.8, r * 0.20), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * A teardrop: rounder at the bottom than the top, and drawn further out at
 * the top the faster it is running.
 */
function beadPath(ctx, x, y, r, stretch) {
  const top = y - r * (1.25 + stretch);
  const bot = y + r * 1.05;
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.bezierCurveTo(x + r * 0.40, y - r * 0.55, x + r * 0.98, y + r * 0.24, x, bot);
  ctx.bezierCurveTo(x - r * 0.98, y + r * 0.24, x - r * 0.40, y - r * 0.55, x, top);
  ctx.closePath();
}
