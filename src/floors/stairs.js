import { Floor } from './floor.js';
import { clamp, TAU } from '../core/math.js';

/**
 * The staircase: its geometry, and the baked picture of it.
 *
 * ONE geometry serves both poses. A flight is a stack of horizontal BANDS, one
 * per step, each band shifted sideways by `shift` from the one below it:
 *
 *      portrait  shift = 0     the flight fills the frame and recedes upward
 *      landscape shift > 0     the same flight laid out as a long diagonal
 *
 * For step j (0 = the bottom tread the child starts on, `n` = the top landing):
 *
 *      nose(j)            the front edge of tread j — the LIP. Debris perched
 *                         here is what tips over and tumbles.
 *      tread j            y in [nose(j) - depth(j), nose(j)]  — the walkable
 *                         surface, drawn as a band going UP the screen.
 *      riser j            y in [nose(j), nose(j) + riser]     — the vertical
 *                         face below that lip. The head cannot enter it; it
 *                         has to HOP over it.
 *      corner j           y = nose(j) - depth(j) — where tread meets the riser
 *                         above. Fluff collects there.
 *
 * Falling is therefore trivial and exact: something that rolls past nose(j)
 * drops `riser` px onto the back of tread j-1, which is where it bounces.
 * `groundY`, `stepAt` and `clampInside` are the whole physics contract, and the
 * tumbler, the step bunny and the riser fluff all read it instead of knowing
 * anything about the drawing.
 */
export class Stair {
  constructor(o) {
    this.pose = o.pose;
    this.n = o.n;                 // number of risers to climb (treads 0..n)
    this.step = o.step;           // vertical distance between nosings
    this.tread = o.tread;         // depth of a normal tread band
    this.riser = o.step - o.tread;
    this.land = o.land;           // depth of the top landing
    this.shift = o.shift || 0;    // sideways offset per step (landscape)
    this.taper = o.taper || 0;    // portrait: the flight narrows as it recedes
    this.wid = o.wid;             // width of a step
    this.x0 = o.x0;               // left edge of step 0
    this.y0 = o.y0;               // nose(0)
    this.floorY = o.y0 + this.riser + (o.floorDepth || 150);   // bottom of the hall floor
    this.onPuff = null;           // scene hook: (x, y, n, kind) => void
  }

  noseY(j) { return this.y0 - j * this.step; }
  depth(j) { return j >= this.n ? this.land : this.tread; }
  /** y of the corner where tread j meets the riser above it. */
  cornerY(j) { return this.noseY(j) - this.depth(j); }
  left(j) { return this.x0 + j * this.shift + Math.max(0, j) * this.taper; }
  right(j) { return this.x0 + j * this.shift + this.wid - Math.max(0, j) * this.taper; }
  midX(j) { return (this.left(j) + this.right(j)) * 0.5; }

  /** Which step's band a world y is in. Can be -1 (the hall floor below). */
  stepAt(y) {
    const j = Math.floor((this.y0 - y) / this.step);
    return clamp(j, -1, this.n);
  }

  /**
   * Where something falling from (x, y) comes to rest: the back edge of the
   * tread it is dropping onto. Below step 0 that is the hall floor.
   */
  groundY(x, y) {
    const j = this.stepAt(y);
    if (j < 0) return this.y0 + this.riser + 20;
    return this.cornerY(j);
  }

  /** Keep a loose piece on the flight: inside its step's width, out of a riser. */
  clampInside(o, pad) {
    const p = pad === undefined ? 8 : pad;
    const j = this.stepAt(o.y);
    const l = j < 0 ? this.left(0) : this.left(j);
    const r = j < 0 ? this.right(0) : this.right(j);
    if (o.x < l + p) { o.x = l + p; if (o.vx < 0) o.vx *= -0.4; }
    if (o.x > r - p) { o.x = r - p; if (o.vx > 0) o.vx *= -0.4; }
    const top = j < 0 ? this.y0 + this.riser + 6 : this.cornerY(j) + 2;
    if (o.y < top) { o.y = top; if (o.vy < 0) o.vy = 0; }
    const bot = this.floorY - 20;
    if (o.y > bot) { o.y = bot; if (o.vy > 0) o.vy = 0; }
  }

  /** The downhill direction along the flight, as a unit-ish x nudge. */
  get downX() { return this.shift > 0 ? -1 : 0; }

  puff(x, y, n, kind) { if (this.onPuff) this.onPuff(x, y, n, kind); }

  /** World rectangle the whole set occupies (for the floor canvas). */
  bounds(margin) {
    const m = margin || 0;
    let x0 = 1e9, x1 = -1e9;
    for (let j = -1; j <= this.n; j++) {
      x0 = Math.min(x0, this.left(Math.max(0, j)));
      x1 = Math.max(x1, this.right(Math.max(0, j)));
    }
    return {
      x0: x0 - m, x1: x1 + m,
      y0: this.cornerY(this.n) - 260 - m,
      y1: this.floorY + m,
    };
  }
}

const TREAD_TONES = ['#dcb385', '#d6ab7b', '#e0bb90', '#d3a677'];

/**
 * Bake the whole flight — hall floor, risers, treads, nosings, side walls, the
 * landing and its window — into the opaque blit the floor has to do anyway.
 * Nothing here moves, so nothing here costs a frame.
 */
export function makeStairsFloor(stair, rng, opts) {
  const o = opts || {};
  const rect = stair.bounds(240);
  const f = new Floor(rect);
  const g = f.bctx;
  g.save();
  g.translate(-rect.x0, -rect.y0);

  const W = rect.x1 - rect.x0;

  // ---- the stairwell wall behind everything ------------------------------
  const wg = g.createLinearGradient(0, rect.y0, 0, rect.y1);
  wg.addColorStop(0, '#efe2cb');
  wg.addColorStop(0.55, '#ded0b6');
  wg.addColorStop(1, '#c0ae93');
  g.fillStyle = wg;
  g.fillRect(rect.x0, rect.y0, W, rect.y1 - rect.y0);

  // ---- the hall floor at the foot of the stairs ---------------------------
  const hallTop = stair.y0 + stair.riser;
  planks(g, rect.x0, hallTop, W, stair.floorY - hallTop + 260, rng, 74, false);
  // the stairs throw a soft shadow onto the hall floor
  const sh = g.createLinearGradient(0, hallTop, 0, hallTop + 74);
  sh.addColorStop(0, 'rgba(48,30,14,0.36)');
  sh.addColorStop(1, 'rgba(48,30,14,0)');
  g.fillStyle = sh;
  g.fillRect(rect.x0, hallTop, W, 74);

  // ---- the flight, far step first so near ones paint over ----------------
  // A step is one SLAB: a light tread top with a dark vertical riser under it.
  // The eye needs that tread/riser contrast to be unmistakable, because the
  // nosing between them is the edge the whole room is played on.
  for (let j = stair.n; j >= 0; j--) {
    const l = stair.left(j), r = stair.right(j);
    const nose = stair.noseY(j);
    const dep = stair.depth(j);
    const wid = r - l;

    // the slab throws a shadow sideways onto the wall it is set into
    g.fillStyle = 'rgba(46,30,14,0.30)';
    g.fillRect(l - 17, nose - dep, 17, dep + stair.riser);
    g.fillRect(r, nose - dep, 17, dep + stair.riser);

    // ---- the riser: a genuinely dark vertical face ----------------------
    const rg = g.createLinearGradient(0, nose, 0, nose + stair.riser);
    rg.addColorStop(0, '#5d3f24');
    rg.addColorStop(0.5, '#7b5631');
    rg.addColorStop(1, '#8d6539');
    g.fillStyle = rg;
    g.fillRect(l, nose, wid, stair.riser);
    // the ambient dark right under the lip
    const ao = g.createLinearGradient(0, nose, 0, nose + 16);
    ao.addColorStop(0, 'rgba(24,12,2,0.55)');
    ao.addColorStop(1, 'rgba(24,12,2,0)');
    g.fillStyle = ao;
    g.fillRect(l, nose, wid, 16);

    // ---- the tread: the light horizontal surface ------------------------
    g.save();
    g.beginPath(); g.rect(l, nose - dep, wid, dep); g.clip();
    g.fillStyle = TREAD_TONES[j % TREAD_TONES.length];
    g.fillRect(l, nose - dep, wid, dep);
    g.strokeStyle = 'rgba(126,84,40,0.16)';
    g.lineWidth = 1;
    for (let k = 1; k < 6; k++) {
      const yy = nose - dep + (dep * k) / 6 + rng.range(-1.5, 1.5);
      g.beginPath();
      for (let x = l; x <= r; x += 38) g.lineTo(x, yy + Math.sin((x + j * 40) * 0.016) * 1.5);
      g.stroke();
    }
    // the riser ABOVE shades the back of the tread; the front catches the light
    const tg = g.createLinearGradient(0, nose - dep, 0, nose);
    tg.addColorStop(0, 'rgba(48,28,8,0.44)');
    tg.addColorStop(0.30, 'rgba(48,28,8,0.06)');
    tg.addColorStop(1, 'rgba(255,244,214,0.26)');
    g.fillStyle = tg;
    g.fillRect(l, nose - dep, wid, dep);
    g.restore();

    // ---- the NOSING: the brightest line on the screen -------------------
    g.fillStyle = '#f7e3bd';
    g.fillRect(l, nose - 6, wid, 6);
    g.fillStyle = 'rgba(255,252,236,0.9)';
    g.fillRect(l, nose - 6, wid, 2.5);

    // ---- the skirting climbing the wall beside the step -----------------
    g.fillStyle = '#c9b191';
    g.fillRect(l - 17, nose - dep, 17, 9);
    g.fillRect(r, nose - dep, 17, 9);
    g.fillStyle = 'rgba(58,38,16,0.30)';
    g.fillRect(l - 17, nose - dep + 9, 17, 4);
    g.fillRect(r, nose - dep + 9, 17, 4);
  }

  // ---- the top landing, its back wall and the window ----------------------
  const nTop = stair.noseY(stair.n);
  const landTop = nTop - stair.land;
  const lx0 = stair.left(stair.n) - (stair.shift > 0 ? 60 : 0);
  const lx1 = stair.right(stair.n) + (stair.shift > 0 ? 120 : 0);
  // wall above the landing
  const wallH = 250;
  g.fillStyle = '#e3d4bd';
  g.fillRect(rect.x0, landTop - wallH, W, wallH);
  g.fillStyle = '#cdbb9f';
  g.fillRect(rect.x0, landTop - 16, W, 16);
  g.fillStyle = 'rgba(70,52,30,0.20)';
  g.fillRect(rect.x0, landTop, W, 10);

  // the window: dull and grey now; the scene lights it when the flight is clean
  // Portrait has a whole wall above the landing to hang it on. Landscape does
  // not — the viewport is barely 400 design px tall — so there the window goes
  // in the stairwell wall just PAST the top step, where it is in frame for the
  // whole climb and is the thing the child is walking toward.
  const side = stair.shift > 0;
  const wx = side ? stair.left(stair.n) - 116 : (lx0 + lx1) * 0.5;
  const wy = side ? stair.noseY(stair.n) - 104 : landTop - 132;
  const ww = side ? 128 : 182, wh = side ? 116 : 148;
  f.window = { x: wx, y: wy, w: ww, h: wh };
  g.fillStyle = '#b3a58c';
  g.fillRect(wx - ww / 2 - 11, wy - wh / 2 - 11, ww + 22, wh + 22);
  g.fillStyle = '#8fa0a6';
  g.fillRect(wx - ww / 2, wy - wh / 2, ww, wh);
  g.fillStyle = 'rgba(255,255,255,0.10)';
  g.fillRect(wx - ww / 2, wy - wh / 2, ww, wh * 0.42);
  g.fillStyle = '#cbbda3';
  g.fillRect(wx - 5, wy - wh / 2, 10, wh);
  g.fillRect(wx - ww / 2, wy - 5, ww, 10);
  g.fillStyle = '#9d8e75';
  g.fillRect(wx - ww / 2 - 16, wy + wh / 2 + 6, ww + 32, 12);

  // ---- the walls either side of the flight -------------------------------
  if (stair.shift > 0) {
    // landscape: the dim void beyond the open side, where the banister stands
    // and where a sock can hide in the gap under it
    // it is not a grey slab: it is the hall carrying on underneath the flight,
    // in the shadow the stairs throw over it
    for (let j = 0; j <= stair.n; j++) {
      const x = stair.right(j) + 17;
      const y = stair.noseY(j) - stair.depth(j);
      const h = stair.step + (j === stair.n ? stair.land : 0);
      g.save();
      g.beginPath(); g.rect(x, y, rect.x1 - x, h); g.clip();
      planks(g, x - 40, y - 40, rect.x1 - x + 80, h + 80, rng, 66, false);
      const vgg = g.createLinearGradient(x, 0, x + 260, 0);
      vgg.addColorStop(0, 'rgba(28,16,4,0.62)');
      vgg.addColorStop(0.55, 'rgba(28,16,4,0.34)');
      vgg.addColorStop(1, 'rgba(28,16,4,0.22)');
      g.fillStyle = vgg;
      g.fillRect(x, y, rect.x1 - x, h);
      g.restore();
    }
  }

  // ---- overall shaping light: the top of the flight is the bright end ----
  const vg = g.createLinearGradient(0, landTop - 120, 0, stair.floorY);
  vg.addColorStop(0, 'rgba(255,238,198,0.22)');
  vg.addColorStop(0.45, 'rgba(255,238,198,0.03)');
  vg.addColorStop(1, 'rgba(40,24,10,0.26)');
  g.fillStyle = vg;
  g.fillRect(rect.x0, rect.y0, W, rect.y1 - rect.y0);

  g.restore();
  // The flight is horizontal bands: upscaled with the bilinear filter it costs
  // a measured 2-4 fps on the iPad-sized canvas and looks no better, because
  // every edge in it is axis-aligned. Nearest-neighbour keeps the nosings crisp.
  f.smoothBase = false;
  return f;
}

function planks(g, x, y, w, h, rng, plankW, vertical) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = '#c1895a';
  g.fillRect(x, y, w, h);
  const tones = ['#c08f59', '#b8854f', '#c89a64', '#b27d47'];
  const across = vertical ? w : h;
  const along = vertical ? h : w;
  const nP = Math.ceil(across / plankW) + 1;
  for (let i = 0; i < nP; i++) {
    const a0 = (vertical ? x : y) + i * plankW;
    let p = vertical ? y : x;
    const end = p + along;
    while (p < end) {
      const seg = rng.range(150, 380);
      g.fillStyle = tones[rng.int(0, tones.length - 1)];
      if (vertical) g.fillRect(a0, p, plankW, seg);
      else g.fillRect(p, a0, seg, plankW);
      g.fillStyle = 'rgba(88,56,22,0.26)';
      if (vertical) { g.fillRect(a0 + plankW - 2, p, 2, seg); g.fillRect(a0, p + seg - 2, plankW, 2); }
      else { g.fillRect(p, a0 + plankW - 2, seg, 2); g.fillRect(p + seg - 2, a0, 2, plankW); }
      p += seg;
    }
  }
  g.restore();
}

/** A little decorative dust in the corners of the hall floor, baked in. */
export function bakeGrit(g, x, y, r, rng) {
  g.fillStyle = 'rgba(150,136,118,0.5)';
  for (let i = 0; i < 14; i++) {
    const a = rng.range(0, TAU), d = Math.sqrt(rng.next()) * r;
    g.beginPath();
    g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rng.range(0.7, 1.8), 0, TAU);
    g.fill();
  }
}
