import { makeCanvas } from './floor.js';
import { TAU, clamp, smoothstep, hash1, noise1 } from '../core/math.js';

/**
 * Deep-pile rug.
 *
 * Three things live here:
 *
 *  1. A baked base canvas: wood surround + the rug painted in DULL, greyed-out
 *     colours under a shaggy pile texture. That is the rug "before combing".
 *  2. A baked `bright` canvas the same size as the rug: the SAME pattern in full
 *     colour under a neat, flattened pile texture — the rug "after combing".
 *     Combing stamps soft pieces of it straight into the base canvas, so the
 *     comb stripe literally shows the rug's true colours: progress is visible
 *     without a counter, and the floor is still ONE blit per frame.
 *  3. A coarse comb grid (Uint8 per ~11 design px cell) that gameplay reads:
 *     how combed is this spot, and how much of the rug is done.
 *
 * On top of that, `drawPile()` renders a sparse DYNAMIC layer of tufts around
 * the nozzle only. Each tuft samples vacuum.field() at its own root and bends
 * toward the mouth — that is the airflow made visible, and it is the only place
 * the flow is ever drawn.
 */

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };
const SCRATCH = 144;

export class CarpetFloor {
  /**
   * @param {{x0,y0,x1,y1}} rect  world rect of the whole baked floor
   * @param {{x0,y0,x1,y1}} rug   world rect of the rug itself
   */
  constructor(rect, rug, rng, opts = {}) {
    this.rect = rect;
    this.rug = rug;
    this.rng = rng;
    this.opts = opts;
    this.along = opts.along || 'y';          // the rug's long axis
    this.w = Math.max(1, Math.round(rect.x1 - rect.x0));
    this.h = Math.max(1, Math.round(rect.y1 - rect.y0));
    this.rw = Math.max(1, Math.round(rug.x1 - rug.x0));
    this.rh = Math.max(1, Math.round(rug.y1 - rug.y0));

    this.base = makeCanvas(this.w, this.h);
    this.bctx = this.base.getContext('2d');
    this.bright = makeCanvas(this.rw, this.rh);
    this.brctx = this.bright.getContext('2d');
    this.scratch = makeCanvas(SCRATCH, SCRATCH);
    this.sctx = this.scratch.getContext('2d');

    this.cell = 11;
    this.gw = Math.ceil(this.rw / this.cell);
    this.gh = Math.ceil(this.rh / this.cell);
    this.grid = new Uint8Array(this.gw * this.gh);
    this.cells = this.gw * this.gh;
    this._sum = 0;

    // dynamic tuft buffers (no per-frame allocation)
    const MAX = 1600;
    this.tn = 0;
    this.trx = new Float32Array(MAX);
    this.try_ = new Float32Array(MAX);
    this.tmx = new Float32Array(MAX);
    this.tmy = new Float32Array(MAX);
    this.ttx = new Float32Array(MAX);
    this.tty = new Float32Array(MAX);
    this.tb = new Uint8Array(MAX);           // bucket: alpha step + combed flag
    this.MAXT = MAX;

    this._paintBright();
    this._paintBase();
  }

  // ------------------------------------------------------------- geometry

  inRug(x, y) {
    const r = this.rug;
    return x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;
  }

  /** 0..1 how combed this world point is. */
  combAt(x, y) {
    const gx = Math.floor((x - this.rug.x0) / this.cell);
    const gy = Math.floor((y - this.rug.y0) / this.cell);
    if (gx < 0 || gy < 0 || gx >= this.gw || gy >= this.gh) return 0;
    return this.grid[gy * this.gw + gx] / 255;
  }

  /** 0..1 fraction of the rug that reads as combed. */
  get progress() { return this._sum / (this.cells * 255); }

  // ---------------------------------------------------------------- comb

  /**
   * Comb a round patch of pile. Raises the grid and (when `stamp`) brings the
   * true colours of that patch up out of the dull pile.
   * @returns {number} how much NEW combing happened (0..1-ish), for feedback
   */
  comb(wx, wy, r, amount, stamp = true) {
    const rug = this.rug;
    if (wx < rug.x0 - r || wx > rug.x1 + r || wy < rug.y0 - r || wy > rug.y1 + r) return 0;
    const c = this.cell;
    const g0x = Math.max(0, Math.floor((wx - r - rug.x0) / c));
    const g1x = Math.min(this.gw - 1, Math.floor((wx + r - rug.x0) / c));
    const g0y = Math.max(0, Math.floor((wy - r - rug.y0) / c));
    const g1y = Math.min(this.gh - 1, Math.floor((wy + r - rug.y0) / c));
    let gained = 0;
    const inv = 1 / (r * r);
    for (let gy = g0y; gy <= g1y; gy++) {
      const cy = rug.y0 + (gy + 0.5) * c;
      for (let gx = g0x; gx <= g1x; gx++) {
        const cx = rug.x0 + (gx + 0.5) * c;
        const dx = cx - wx, dy = cy - wy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r * r) continue;
        const k = 1 - d2 * inv;
        const i = gy * this.gw + gx;
        const was = this.grid[i];
        const add = amount * 255 * (0.45 + 0.55 * k);
        let v = was + add;
        if (v > 255) v = 255;
        const d = v - was;
        if (d > 0) { this.grid[i] = v; this._sum += d; gained += d; }
      }
    }
    if (gained > 0 && stamp) this._stampReveal(wx, wy, r * 1.12, clamp(amount * 1.5, 0.08, 0.6));
    return gained / (255 * 9);
  }

  /**
   * Stamp a soft round piece of the bright rug straight into the base canvas.
   * Keeping it to ONE layer matters: two big alpha blits per frame cost more
   * than everything else in the scene put together.
   */
  _stampReveal(wx, wy, r, alpha) {
    const R = Math.min(r, SCRATCH * 0.5 - 2);
    const sx = Math.round(wx - this.rug.x0 - R);
    const sy = Math.round(wy - this.rug.y0 - R);
    const n = Math.round(R * 2);
    if (n < 2) return;
    const s = this.sctx;
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.clearRect(0, 0, n + 2, n + 2);
    s.drawImage(this.bright, sx, sy, n, n, 0, 0, n, n);
    s.globalCompositeOperation = 'destination-in';
    if (this._gradR !== R) {
      const g = s.createRadialGradient(R, R, R * 0.15, R, R, R);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.45, 'rgba(0,0,0,0.80)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      this._grad = g; this._gradR = R;
    }
    s.fillStyle = this._grad;
    s.fillRect(0, 0, n, n);
    s.globalCompositeOperation = 'source-over';
    const rc = this.bctx;
    const ox = this.rug.x0 - this.rect.x0, oy = this.rug.y0 - this.rect.y0;
    rc.globalAlpha = alpha;
    rc.drawImage(this.scratch, 0, 0, n, n, sx + ox, sy + oy, n, n);
    rc.globalAlpha = 1;
  }

  /** Bring the true colours up everywhere by a little: the finishing bloom. */
  bloom(a) {
    this.bctx.globalAlpha = clamp(a, 0, 1);
    this.bctx.drawImage(this.bright, this.rug.x0 - this.rect.x0, this.rug.y0 - this.rect.y0);
    this.bctx.globalAlpha = 1;
  }

  /** Comb everything (used by the dev finale preview and by relayout replay). */
  fill(v = 1) {
    const b = Math.round(clamp(v, 0, 1) * 255);
    this._sum = 0;
    for (let i = 0; i < this.grid.length; i++) { this.grid[i] = b; this._sum += b; }
    this.bctx.globalAlpha = v;
    this.bctx.drawImage(this.bright, this.rug.x0 - this.rect.x0, this.rug.y0 - this.rect.y0);
    this.bctx.globalAlpha = 1;
  }

  /** Snapshot / restore the comb state across an orientation change. */
  save() { return { gw: this.gw, gh: this.gh, g: Uint8Array.from(this.grid) }; }
  restore(s) {
    if (!s || !s.g) return;
    this._sum = 0;
    for (let gy = 0; gy < this.gh; gy++) {
      const sy = Math.min(s.gh - 1, Math.floor((gy / this.gh) * s.gh));
      for (let gx = 0; gx < this.gw; gx++) {
        const sx = Math.min(s.gw - 1, Math.floor((gx / this.gw) * s.gw));
        const v = s.g[sy * s.gw + sx];
        this.grid[gy * this.gw + gx] = v;
        this._sum += v;
      }
    }
    // Paint the whole combed area in one go: a mask the size of the grid,
    // scaled up (the smoothing IS the soft edge), used to cut the bright rug.
    const mask = makeCanvas(this.gw, this.gh);
    const mc = mask.getContext('2d');
    const img = mc.createImageData(this.gw, this.gh);
    for (let i = 0; i < this.grid.length; i++) img.data[i * 4 + 3] = this.grid[i];
    mc.putImageData(img, 0, 0);
    const tmp = makeCanvas(this.rw, this.rh);
    const tc = tmp.getContext('2d');
    tc.drawImage(this.bright, 0, 0);
    tc.globalCompositeOperation = 'destination-in';
    tc.drawImage(mask, 0, 0, this.rw, this.rh);
    this.bctx.drawImage(tmp, this.rug.x0 - this.rect.x0, this.rug.y0 - this.rect.y0);
  }

  // --------------------------------------------------------------- paint

  _palette() {
    return this.opts.palette || {
      backing: '#c9b48e',
      bright: ['#3aa392', '#dd5f42', '#e8ad4c', '#396c95', '#f6ead2'],
      field: '#e9dcbe',
    };
  }

  /** The rug as it looks once combed: full colour, neat pile, a soft sheen. */
  _paintBright() {
    const g = this.brctx;
    const W = this.rw, H = this.rh;
    const p = this._palette();
    g.fillStyle = p.field;
    g.fillRect(0, 0, W, H);
    this._paintPattern(g, W, H, p, 1);
    // neat, flattened pile: short strokes all lying the same way + a sheen
    this._paintPile(g, W, H, {
      step: 7, len: 5.6, spread: 0.26, dark: 'rgba(70,52,32,0.14)', light: 'rgba(255,250,235,0.34)', bias: -1.28,
    });
    const sh = g.createLinearGradient(0, 0, W, H);
    sh.addColorStop(0, 'rgba(255,255,255,0.10)');
    sh.addColorStop(0.5, 'rgba(255,255,255,0.0)');
    sh.addColorStop(1, 'rgba(255,255,255,0.08)');
    g.fillStyle = sh;
    g.fillRect(0, 0, W, H);
  }

  /** The world: wood around, then the rug greyed out under a shaggy pile. */
  _paintBase() {
    const g = this.bctx;
    const W = this.w, H = this.h;
    const rng = this.rng;

    // --- wood surround -----------------------------------------------
    g.fillStyle = '#b98b55';
    g.fillRect(0, 0, W, H);
    const tones = ['#bd9059', '#b3854e', '#c79a63', '#ab7c47'];
    const pw = 74;
    const horiz = this.along === 'x';
    const across = horiz ? H : W;
    const along = horiz ? W : H;
    for (let i = 0; i * pw < across; i++) {
      let q = 0;
      while (q < along) {
        const seg = rng.range(180, 420);
        g.fillStyle = tones[rng.int(0, tones.length - 1)];
        if (horiz) g.fillRect(q, i * pw, seg, pw - 2);
        else g.fillRect(i * pw, q, pw - 2, seg);
        q += seg;
      }
    }
    g.fillStyle = 'rgba(70,45,18,0.18)';
    for (let i = 0; i * pw < across; i++) {
      if (horiz) g.fillRect(0, i * pw + pw - 2, W, 2);
      else g.fillRect(i * pw + pw - 2, 0, 2, H);
    }

    if (this.opts.wallAt !== undefined) {
      const wy = this.opts.wallAt - this.rect.y0;
      g.fillStyle = '#e3d5c0';
      g.fillRect(0, 0, W, wy);
      g.fillStyle = '#cbb99f';
      g.fillRect(0, wy - 16, W, 16);
      g.fillStyle = 'rgba(60,40,20,0.16)';
      g.fillRect(0, wy, W, 26);
    }

    // --- the rug ------------------------------------------------------
    const ox = this.rug.x0 - this.rect.x0, oy = this.rug.y0 - this.rect.y0;
    const W2 = this.rw, H2 = this.rh;
    // it sits proud of the floor: stacked translucent rects = cheap soft shadow
    g.save();
    for (let i = 6; i >= 1; i--) {
      g.fillStyle = 'rgba(40,26,10,0.055)';
      g.fillRect(ox - i, oy - i * 0.5, W2 + i * 2, H2 + i * 1.8);
    }
    g.restore();

    g.save();
    g.translate(ox, oy);
    const p = this._palette();
    g.fillStyle = p.field;
    g.fillRect(0, 0, W2, H2);
    this._paintPattern(g, W2, H2, p, 1);
    // the wash that hides the colours until they are combed out
    g.fillStyle = 'rgba(152,145,130,0.78)';
    g.fillRect(0, 0, W2, H2);
    g.fillStyle = 'rgba(96,86,70,0.16)';
    g.fillRect(0, 0, W2, H2);
    // shaggy, every-which-way pile
    this._paintPile(g, W2, H2, {
      step: 8, len: 8.2, spread: 1.15, dark: 'rgba(50,36,20,0.30)', light: 'rgba(238,230,210,0.30)', bias: -1.22,
    });
    // edge shading so the deep pile reads as thick
    const eg = g.createLinearGradient(0, 0, 0, 22);
    eg.addColorStop(0, 'rgba(50,36,20,0.30)');
    eg.addColorStop(1, 'rgba(50,36,20,0)');
    g.fillStyle = eg; g.fillRect(0, 0, W2, 22);
    g.restore();

    // fringe at both ends of the long axis
    this._paintFringe(g, ox, oy, W2, H2);
  }

  _paintFringe(g, ox, oy, W2, H2) {
    g.save();
    g.strokeStyle = '#e7dcc4';
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    const n = 46;
    g.beginPath();
    if (this.along === 'y') {
      for (let i = 0; i < n; i++) {
        const x = ox + (i + 0.5) * (W2 / n);
        const w = ((i * 37) % 7) * 0.4;
        g.moveTo(x, oy); g.lineTo(x + w - 1.2, oy - 11);
        g.moveTo(x, oy + H2); g.lineTo(x + w - 1.2, oy + H2 + 11);
      }
    } else {
      for (let i = 0; i < n; i++) {
        const y = oy + (i + 0.5) * (H2 / n);
        const w = ((i * 37) % 7) * 0.4;
        g.moveTo(ox, y); g.lineTo(ox - 11, y + w - 1.2);
        g.moveTo(ox + W2, y); g.lineTo(ox + W2 + 11, y + w - 1.2);
      }
    }
    g.stroke();
    g.restore();
  }

  /** Border + medallions along the rug's long axis. */
  _paintPattern(g, W, H, p, alpha) {
    const c = p.bright;
    g.save();
    g.globalAlpha = alpha;
    const along = this.along === 'y' ? H : W;
    const across = this.along === 'y' ? W : H;
    const m = Math.min(across * 0.10, 34);

    // border bands
    g.strokeStyle = c[3]; g.lineWidth = m * 0.7;
    g.strokeRect(m * 0.6, m * 0.6, W - m * 1.2, H - m * 1.2);
    g.strokeStyle = c[0]; g.lineWidth = m * 0.28;
    g.strokeRect(m * 1.25, m * 1.25, W - m * 2.5, H - m * 2.5);
    g.strokeStyle = c[1]; g.lineWidth = m * 0.16;
    g.strokeRect(m * 1.75, m * 1.75, W - m * 3.5, H - m * 3.5);

    // saw-tooth trim on the inner border
    g.fillStyle = c[2];
    const tooth = 15;
    const inx = m * 2.05, iny = m * 2.05;
    for (let x = inx; x < W - inx; x += tooth) {
      g.beginPath(); g.moveTo(x, iny); g.lineTo(x + tooth * 0.5, iny + tooth * 0.55); g.lineTo(x + tooth, iny); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(x, H - iny); g.lineTo(x + tooth * 0.5, H - iny - tooth * 0.55); g.lineTo(x + tooth, H - iny); g.closePath(); g.fill();
    }

    // medallions strung along the long axis
    const inner = along - m * 5;
    const nMed = Math.max(2, Math.round(inner / (across * 0.9)));
    const step = inner / nMed;
    const rad = Math.min(step * 0.42, across * 0.30);
    for (let i = 0; i < nMed; i++) {
      const t = m * 2.5 + step * (i + 0.5);
      const cx = this.along === 'y' ? W * 0.5 : t;
      const cy = this.along === 'y' ? t : H * 0.5;
      this._medallion(g, cx, cy, rad, c, i);
    }
    // little dots filling the field
    g.fillStyle = c[3];
    for (let i = 0; i < nMed; i++) {
      const t = m * 2.5 + step * i;
      const cx = this.along === 'y' ? W * 0.5 : t;
      const cy = this.along === 'y' ? t : H * 0.5;
      for (let k = -1; k <= 1; k += 2) {
        const dx = this.along === 'y' ? k * across * 0.30 : 0;
        const dy = this.along === 'y' ? 0 : k * across * 0.30;
        g.beginPath(); g.arc(cx + dx, cy + dy, 5, 0, TAU); g.fill();
      }
    }
    g.restore();
  }

  _medallion(g, cx, cy, r, c, i) {
    g.save();
    g.translate(cx, cy);
    g.rotate(Math.PI * 0.25);
    g.fillStyle = c[(i + 1) % 2 === 0 ? 0 : 1];
    g.fillRect(-r * 0.72, -r * 0.72, r * 1.44, r * 1.44);
    g.fillStyle = c[4];
    g.fillRect(-r * 0.52, -r * 0.52, r * 1.04, r * 1.04);
    g.fillStyle = c[(i % 2) === 0 ? 3 : 2];
    g.beginPath();
    g.moveTo(0, -r * 0.46); g.lineTo(r * 0.46, 0); g.lineTo(0, r * 0.46); g.lineTo(-r * 0.46, 0);
    g.closePath(); g.fill();
    g.fillStyle = c[2];
    g.beginPath(); g.arc(0, 0, r * 0.17, 0, TAU); g.fill();
    g.restore();
  }

  /** Bake a field of short strokes: this is what makes it read as pile. */
  _paintPile(g, W, H, o) {
    g.save();
    g.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      g.strokeStyle = pass === 0 ? o.dark : o.light;
      g.lineWidth = pass === 0 ? 2.1 : 1.5;
      g.beginPath();
      let k = pass * 7919;
      for (let y = 2; y < H; y += o.step) {
        for (let x = 2; x < W; x += o.step) {
          k++;
          const h1 = hash1(k * 3 + 11), h2 = hash1(k * 7 + 29), h3 = hash1(k * 13 + 5);
          if (h3 > 0.25) continue;                     // sparse: two passes overlap
          const px = x + h1 * o.step * 0.9;
          const py = y + h2 * o.step * 0.9;
          const a = o.bias + h1 * o.spread;
          const L = o.len * (0.7 + (h2 + 1) * 0.3);
          g.moveTo(px, py);
          g.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L * 0.8);
        }
      }
      g.stroke();
    }
    g.restore();
  }

  // ---------------------------------------------------------------- draw

  draw(ctx) {
    ctx.drawImage(this.base, this.rect.x0, this.rect.y0);
  }

  /**
   * Sparse dynamic tufts around the mouth. Every tuft samples the field at its
   * own root, so the pile bends toward the mouth in a soft fan that grows as
   * the head comes down — the airflow, drawn only through what it does.
   */
  drawPile(ctx, vac, t) {
    const mx = vac.mouthX, my = vac.mouthY;
    const RAD = vac.radius * 1.12;
    const S = 16;
    let n = 0;
    const R2 = RAD * RAD;
    const fadeIn = RAD * 0.62;               // no visible circle: fade at the rim
    const gx0 = Math.floor((mx - RAD) / S), gx1 = Math.ceil((mx + RAD) / S);
    const gy0 = Math.floor((my - RAD) / S), gy1 = Math.ceil((my + RAD) / S);
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        if (n >= this.MAXT) break;
        const k = (gx * 73856093) ^ (gy * 19349663);
        const hx = hash1(k), hy = hash1(k + 1), hl = hash1(k + 2);
        const px = gx * S + hx * S * 0.48;
        const py = gy * S + hy * S * 0.48;
        const dx = px - mx, dy = py - my;
        const d2 = dx * dx + dy * dy;
        if (d2 > R2) continue;
        if (!this.inRug(px, py)) continue;
        const d = Math.sqrt(d2);
        // dithered rim instead of a fade, so there is never a visible circle
        if (d > fadeIn && hl * 0.5 + 0.5 > 1 - (d - fadeIn) / (RAD - fadeIn)) continue;
        const f = vac.field(px, py, TMPF);
        const s = f.strength;
        const cb = this.combAt(px, py);
        const bend = clamp(s * 1.30, 0, 1);
        // pulled pile stretches: it lengthens as it leans
        const L = (8.0 + hl * 2.2) * (1 - cb * 0.30) * (1 + bend * 0.45);
        // rest pose matches the baked pile exactly, so nothing "appears":
        // what you see is the same pile, leaning
        const ra = -1.22 + hx * 0.58 + cb * 0.22;
        const rux = Math.cos(ra), ruy = Math.sin(ra) * 0.8;
        const fl = Math.hypot(f.fx, f.fy) || 1;
        const flx = f.fx / fl, fly = (f.fy / fl) * 0.85;
        const w = noise1(t * 9 + k * 0.013) * bend * 2.4;
        const ux = rux * (1 - bend) + flx * bend;
        const uy = ruy * (1 - bend) + fly * bend;
        const tipx = px + ux * L + w * 0.6;
        const tipy = py + uy * L - Math.abs(w) * 0.2;
        this.trx[n] = px; this.try_[n] = py;
        this.tmx[n] = px + (tipx - px) * 0.5 - uy * L * 0.24 * (1 - bend * 0.6);
        this.tmy[n] = py + (tipy - py) * 0.5 + ux * L * 0.24 * (1 - bend * 0.6);
        this.ttx[n] = tipx; this.tty[n] = tipy;
        let bucket = Math.min(3, Math.floor(bend * 3.999));
        if (cb > 0.45) bucket += 4;
        this.tb[n] = bucket;
        n++;
      }
    }
    this.tn = n;
    if (!n) return;

    ctx.save();
    ctx.lineCap = 'round';
    for (let b = 0; b < 8; b++) {
      let any = false;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if (this.tb[i] !== b) continue;
        any = true;
        ctx.moveTo(this.trx[i], this.try_[i]);
        ctx.quadraticCurveTo(this.tmx[i], this.tmy[i], this.ttx[i], this.tty[i]);
      }
      if (!any) continue;
      const lv = (b % 4) / 3;                 // 0 = at rest, 1 = fully bent
      const combed = b >= 4;
      if (lv > 0) {   // at rest the baked pile already supplies the dark roots
        ctx.strokeStyle = 'rgba(46,32,18,' + (0.26 + lv * 0.26).toFixed(3) + ')';
        ctx.lineWidth = 2.5 + lv * 0.7;
        ctx.stroke();
      }
      ctx.strokeStyle = combed
        ? 'rgba(255,252,238,' + (0.34 + lv * 0.46).toFixed(3) + ')'
        : 'rgba(238,228,206,' + (0.28 + lv * 0.48).toFixed(3) + ')';
      ctx.lineWidth = 1.3 + lv * 0.5;
      ctx.stroke();
    }
    ctx.restore();
  }
}
