/**
 * C. 落ち葉 — leaves.
 *
 * A park path in late afternoon. The sun is low, the shadows are long, and
 * the ground is covered in paper-dry leaves. Sweep them with one finger:
 * they tumble ahead of you like a broom, overlap, and stack into a soft
 * mound. Then the tree starts to move — and the wind takes the whole pile
 * apart in a swirl. Press on the pile and it stays. Or let it go and watch,
 * because the way it comes apart is the best part. A squirrel turns up at
 * the end to have an opinion about it.
 *
 * Episode-specific code on purpose: no shared engine, nothing generic.
 */
import type { DevAction, Episode, EpisodeCtx } from '../core/episode';
import type { PointerEvt } from '../core/input';
import type { Orientation } from '../core/layout';
import type { PhaseName } from '../core/phase';
import { makeNoise1d, Rng } from '../core/rng';

// ---------------------------------------------------------------- helpers

type RGB = [number, number, number];

const rgb = (c: RGB, a = 1): string =>
  a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
/** 0 at the edges, 1 in the middle — used for gust envelopes */
const bell = (t: number): number => {
  if (t <= 0 || t >= 1) return 0;
  return Math.sin(Math.PI * t) ** 1.4;
};

// ---------------------------------------------------------------- leaves

type ShapeId = 0 | 1 | 2; // maple / ginkgo / oval

/** unit-size leaf silhouettes, built once, drawn with a transform */
let SHAPE_CACHE: Path2D[] | null = null;

function maplePath(): Path2D {
  const p = new Path2D();
  const deg = (d: number): number => (d * Math.PI) / 180;
  const tipA = [30, -30, -90, -150, -210].map(deg);
  const tipR = [0.8, 1.0, 1.0, 1.0, 0.8];
  const px = (a: number, r: number): number => Math.cos(a) * r;
  const py = (a: number, r: number): number => Math.sin(a) * r;
  p.moveTo(0, 0.78);
  for (let i = 0; i < tipA.length; i++) {
    if (i === 0) {
      p.quadraticCurveTo(0.44, 0.5, px(tipA[0], tipR[0]), py(tipA[0], tipR[0]));
    } else {
      const va = (tipA[i - 1] + tipA[i]) / 2;
      p.quadraticCurveTo(px(va, 0.44), py(va, 0.44), px(tipA[i], tipR[i]), py(tipA[i], tipR[i]));
    }
  }
  p.quadraticCurveTo(-0.44, 0.5, 0, 0.78);
  p.closePath();
  return p;
}

function ginkgoPath(): Path2D {
  const p = new Path2D();
  p.moveTo(0, 0.86);
  p.quadraticCurveTo(-1.02, 0.34, -0.84, -0.5);
  p.quadraticCurveTo(-0.5, -0.86, -0.07, -0.42);
  p.quadraticCurveTo(0.5, -0.86, 0.84, -0.5);
  p.quadraticCurveTo(1.02, 0.34, 0, 0.86);
  p.closePath();
  return p;
}

function ovalPath(): Path2D {
  const p = new Path2D();
  p.moveTo(0, 0.95);
  p.quadraticCurveTo(0.66, 0.26, 0.1, -0.92);
  p.quadraticCurveTo(0, -1.0, -0.1, -0.92);
  p.quadraticCurveTo(-0.66, 0.26, 0, 0.95);
  p.closePath();
  return p;
}

function shapes(): Path2D[] {
  if (!SHAPE_CACHE) SHAPE_CACHE = [maplePath(), ginkgoPath(), ovalPath()];
  return SHAPE_CACHE;
}

const LEAF_COLS: RGB[] = [
  [201, 66, 46],
  [224, 104, 42],
  [232, 148, 50],
  [240, 189, 74],
  [212, 162, 84],
  [164, 96, 50],
  [188, 58, 60],
  [236, 200, 104],
  [198, 122, 52],
];

type LeafState = 'ground' | 'air' | 'held' | 'pile' | 'stuck';

interface Leaf {
  shape: ShapeId;
  col: RGB;
  under: RGB;
  /** ground position (view coords); z is the height above the ground */
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rot: number;
  spin: number;
  /** 3-D-ish flip: the leaf is drawn with scaleX = cos(flip) */
  flip: number;
  flipV: number;
  size: number;
  /** how curled/dry this leaf is, 0..1 — changes the silhouette a touch */
  curl: number;
  state: LeafState;
  /** offsets inside the mound */
  ox: number;
  oy: number;
  lift: number;
  prot: number;
  /** 0..1 join animation into the pile */
  ease: number;
  jx: number;
  jy: number;
  /** pressed under the finger */
  hold: number;
  /** stuck on the fence (1) / on the squirrel (2) */
  stickTo: 0 | 1 | 2;
  stickT: number;
  sway: number;
  rest: number;
}

interface Geo {
  w: number;
  h: number;
  o: Orientation;
  min: number;
  horizonY: number;
  groundTop: number;
  sun: { x: number; y: number };
  /** unit-ish direction the low sun throws shadows */
  shadow: { x: number; y: number };
  pile: { x: number; y: number };
  scatter: { rx: number; ry: number };
  trunk: { x: number; base: number; top: number; w: number };
  canopy: { x: number; y: number; r: number };
  wind: { x: number; y: number };
  charFrom: { x: number; y: number };
  charTo: { x: number; y: number };
  rake: { x: number; y: number; len: number; ang: number };
}

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
}

const LEAF_N = 64;

// ---------------------------------------------------------------- episode

class Leaves implements Episode {
  readonly id = 'leaves';
  readonly title = 'C. 落ち葉 / leaves';

  private ctx!: EpisodeCtx;
  private rng = new Rng(1);
  private noise = makeNoise1d(1);
  private geo!: Geo;

  private leaves: Leaf[] = [];
  private pile: Leaf[] = [];
  private puffs: Puff[] = [];

  // weather
  private t = 0;
  private breeze = 0.08;
  private breezeT = 0.08;
  private gust = 0;
  private waves: Array<{ t0: number; dur: number; peak: number; fired: boolean }> = [];
  private waveClock = 0;
  private vortex: { x: number; y: number; vx: number; vy: number; k: number } | null = null;
  private swayAmp = 0;
  private swayT = 0;

  // beats
  private loops = 0;
  private ending: 'none' | 'held' | 'scattered' = 'none';
  private quiet = 0;
  private settleBeat = -1;
  private driftT = -1;
  private foreCue = 0;
  private fade = 1;
  private fadeOut = false;
  private rustle = 0;
  private lastRustle = 0;

  // camera
  private camZ = 1;
  private camZT = 1;
  private camY = 0;
  private camYT = 0;

  // input
  private held: Leaf | null = null;
  private down = false;
  private ptX = 0;
  private ptY = 0;
  private prevX = 0;
  private prevY = 0;
  private pressT = 0;

  // squirrel
  private ch = {
    on: false,
    x: 0,
    y: 0,
    t: 0,
    look: 0,
    blink: 0,
    blinkT: 2,
    jump: 0,
    inPile: 0,
    hatLeaf: null as Leaf | null,
    shake: 0,
  };

  // ------------------------------------------------------------ setup

  init(ctx: EpisodeCtx): void {
    this.ctx = ctx;
    this.rng = ctx.rng;
    this.rng.reset();
    this.noise = makeNoise1d(this.rng.seed ^ 0x1eaf);
    this.t = 0;
    this.fade = 1;
    this.fadeOut = false;
    this.loops = 0;
    this.buildLeaves();
    this.enterPhase('establish');
  }

  private buildLeaves(): void {
    this.leaves = [];
    for (let i = 0; i < LEAF_N; i++) {
      const shape = (i % 7 === 0 ? 1 : i % 3 === 0 ? 2 : 0) as ShapeId;
      const col = [...this.rng.pick(LEAF_COLS)] as RGB;
      this.leaves.push({
        shape,
        col,
        under: mix(col, [228, 202, 160], 0.4),
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rot: this.rng.range(0, Math.PI * 2),
        spin: 0,
        flip: this.rng.range(-0.5, 0.5),
        flipV: 0,
        size: 1,
        curl: this.rng.range(0.15, 1),
        state: 'ground',
        ox: 0,
        oy: 0,
        lift: 0,
        prot: 0,
        ease: 1,
        jx: 0,
        jy: 0,
        hold: 0,
        stickTo: 0,
        stickT: 0,
        sway: this.rng.range(0, 6.28),
        rest: 9,
      });
    }
    if (this.geo) this.sizeLeaves();
  }

  private sizeLeaves(): void {
    const unit = this.geo.min * 0.052;
    for (const l of this.leaves) {
      l.size = unit * (l.shape === 1 ? 0.86 : l.shape === 2 ? 0.94 : 1) * (0.78 + (l.curl * 0.5));
    }
  }

  layout(o: Orientation, w: number, h: number): void {
    const prev = this.geo;
    const min = Math.min(w, h);
    const g: Geo = {
      w,
      h,
      o,
      min,
      horizonY: 0,
      groundTop: 0,
      sun: { x: 0, y: 0 },
      shadow: { x: 1, y: 0.3 },
      pile: { x: 0, y: 0 },
      scatter: { rx: 0, ry: 0 },
      trunk: { x: 0, base: 0, top: 0, w: 0 },
      canopy: { x: 0, y: 0, r: 0 },
      wind: { x: 0, y: 1 },
      charFrom: { x: 0, y: 0 },
      charTo: { x: 0, y: 0 },
      rake: { x: 0, y: 0, len: 0, ang: 0 },
    };

    if (o === 'portrait') {
      // the path runs down the screen; the tree stands top-left; the gust
      // arrives from the top; the pile belongs in the middle.
      g.horizonY = h * 0.375;
      g.groundTop = h * 0.435;
      g.sun = { x: w * 0.17, y: h * 0.295 };
      g.shadow = { x: 0.93, y: 0.37 };
      g.pile = { x: w * 0.5, y: h * 0.695 };
      g.scatter = { rx: w * 0.4, ry: h * 0.175 };
      g.trunk = { x: w * 0.085, base: h * 0.5, top: -h * 0.02, w: w * 0.085 };
      g.canopy = { x: w * 0.02, y: h * 0.015, r: w * 0.4 };
      g.wind = { x: 0.66, y: 0.5 };
      g.charFrom = { x: -w * 0.16, y: h * 0.9 };
      g.charTo = { x: w * 0.27, y: h * 0.875 };
      g.rake = { x: w * 0.885, y: h * 0.515, len: h * 0.13, ang: -0.26 };
    } else {
      // the path runs across; the tree stands on the right with the gust
      // behind it; the pile sits centre-left so there is room to sweep into.
      g.horizonY = h * 0.3;
      g.groundTop = h * 0.395;
      g.sun = { x: w * 0.87, y: h * 0.2 };
      g.shadow = { x: -0.95, y: 0.3 };
      g.pile = { x: w * 0.355, y: h * 0.7 };
      g.scatter = { rx: w * 0.33, ry: h * 0.215 };
      g.trunk = { x: w * 0.9, base: h * 0.62, top: -h * 0.06, w: w * 0.042 };
      g.canopy = { x: w * 0.99, y: -h * 0.04, r: h * 0.52 };
      g.wind = { x: -0.96, y: 0.14 };
      g.charFrom = { x: -w * 0.1, y: h * 0.92 };
      g.charTo = { x: w * 0.135, y: h * 0.86 };
      g.rake = { x: w * 0.735, y: h * 0.455, len: h * 0.29, ang: 0.26 };
    }

    this.geo = g;
    this.sizeLeaves();
    this.specks = [];
    this.ch.y = g.charTo.y;
    if (!prev) {
      this.ch.x = g.charFrom.x;
      return;
    }
    // keep everything where it was, proportionally
    const sx = g.w / prev.w;
    const sy = g.h / prev.h;
    for (const l of this.leaves) {
      l.x = clamp(l.x * sx, 6, g.w - 6);
      l.y = clamp(l.y * sy, g.groundTop + 4, g.h - 6);
      l.z *= (sx + sy) * 0.5;
    }
    this.ch.x = this.ch.x * sx;
    this.relayoutPile();
  }

  // ------------------------------------------------------------ the pile

  private pileR(n = this.pile.length): number {
    return this.geo.min * (0.055 + 0.175 * Math.sqrt(n / LEAF_N));
  }

  private pileH(n = this.pile.length): number {
    return this.pileR(n) * (0.42 + 0.26 * (n / LEAF_N));
  }

  /** dome packing: early leaves lie at the outer base, later ones ride on top */
  private relayoutPile(): void {
    const n = this.pile.length;
    if (!n) return;
    const R = this.pileR(n);
    const H = this.pileH(n);
    for (let i = 0; i < n; i++) {
      const l = this.pile[i];
      const u = (i + 0.5) / n;
      const ang = i * 2.39996 + 0.7;
      const jitter = 0.62 + 0.38 * (((i * 0.6180339) % 1) as number);
      const rr = R * Math.sqrt(1 - u * 0.94) * jitter;
      l.ox = Math.cos(ang) * rr;
      l.oy = Math.sin(ang) * rr * 0.42;
      l.lift = u * H + Math.abs(Math.sin(ang)) * H * 0.06;
      l.prot = ang * 1.7;
    }
    this.pile.sort((a, b) => a.oy + a.lift * 0.35 - (b.oy + b.lift * 0.35));
  }

  private joinPile(l: Leaf): void {
    if (l.state === 'pile') return;
    l.state = 'pile';
    l.jx = l.x;
    l.jy = l.y - l.z;
    l.ease = 0;
    l.vx = 0;
    l.vy = 0;
    l.vz = 0;
    l.z = 0;
    l.hold = 0;
    this.pile.push(l);
    this.relayoutPile();
  }

  private leavePile(l: Leaf): void {
    const i = this.pile.indexOf(l);
    if (i >= 0) this.pile.splice(i, 1);
    l.state = 'air';
    l.ease = 1;
    this.relayoutPile();
  }

  private pileFrac(): number {
    return this.pile.length / LEAF_N;
  }

  /** true screen position of a pile leaf */
  private pilePos(l: Leaf): { x: number; y: number; z: number } {
    const p = this.geo.pile;
    const dip = l.hold * this.pileH() * 0.3;
    return { x: p.x + l.ox, y: p.y + l.oy, z: l.lift - dip };
  }

  // ------------------------------------------------------------ scatter

  private scatterPoint(spread = 1): { x: number; y: number } {
    const g = this.geo;
    const a = this.rng.range(0, Math.PI * 2);
    // biased a little inward so most strokes stay inside a comfortable reach
    const r = this.rng.next() ** 0.8 * spread;
    return {
      x: clamp(g.pile.x + Math.cos(a) * g.scatter.rx * r, g.w * 0.05, g.w * 0.95),
      y: clamp(g.pile.y + Math.sin(a) * g.scatter.ry * r, g.groundTop + g.min * 0.03, g.h - g.min * 0.035),
    };
  }

  private scatterAll(): void {
    this.pile = [];
    this.puffs = [];
    this.held = null;
    for (const l of this.leaves) {
      const p = this.scatterPoint(1);
      l.x = p.x;
      l.y = p.y;
      l.z = 0;
      l.vx = 0;
      l.vy = 0;
      l.vz = 0;
      l.rot = this.rng.range(0, Math.PI * 2);
      l.spin = 0;
      l.flip = this.rng.range(-0.6, 0.6);
      l.flipV = 0;
      l.state = 'ground';
      l.stickTo = 0;
      l.stickT = 0;
      l.hold = 0;
      l.ease = 1;
      l.rest = 9;
    }
  }

  /** put `frac` of the leaves into a finished-looking mound */
  private buildPile(frac: number): void {
    this.scatterAll();
    const n = Math.round(LEAF_N * clamp(frac, 0, 1));
    // the leaves nearest the centre are the ones that would have been swept in
    const sorted = [...this.leaves].sort(
      (a, b) =>
        Math.hypot(a.x - this.geo.pile.x, a.y - this.geo.pile.y) -
        Math.hypot(b.x - this.geo.pile.x, b.y - this.geo.pile.y),
    );
    for (let i = 0; i < n; i++) {
      const l = sorted[i];
      this.joinPile(l);
      l.ease = 1;
    }
    // the ones left over lie further out, as if missed
    for (let i = n; i < sorted.length; i++) {
      const l = sorted[i];
      const p = this.scatterPoint(1);
      const d = Math.hypot(p.x - this.geo.pile.x, p.y - this.geo.pile.y);
      if (d < this.pileR() * 1.6) {
        const a = Math.atan2(p.y - this.geo.pile.y, p.x - this.geo.pile.x);
        p.x = this.geo.pile.x + Math.cos(a) * this.pileR() * 1.9;
        p.y = this.geo.pile.y + Math.sin(a) * this.pileR() * 1.1;
      }
      l.x = clamp(p.x, this.geo.w * 0.05, this.geo.w * 0.95);
      l.y = clamp(p.y, this.geo.groundTop + 6, this.geo.h - 8);
    }
    for (const l of this.pile) {
      const q = this.pilePos(l);
      l.x = q.x;
      l.y = q.y;
      l.z = q.z;
    }
  }

  // ------------------------------------------------------------ wind

  private scheduleWaves(strength = 1): void {
    const r = this.rng;
    this.waves = [
      { t0: 0.45, dur: r.range(3.2, 3.8), peak: 1 * strength, fired: false },
      { t0: r.range(5.6, 6.2), dur: r.range(2.2, 2.7), peak: r.range(0.72, 0.92) * strength, fired: false },
    ];
    if (r.next() < 0.75) {
      this.waves.push({ t0: r.range(9.6, 10.4), dur: r.range(2.2, 2.8), peak: r.range(0.8, 1.0) * strength, fired: false });
    }
    this.waveClock = 0;
  }

  private wavesEnd(): number {
    let e = 0;
    for (const w of this.waves) e = Math.max(e, w.t0 + w.dur);
    return e;
  }

  private spawnVortex(): void {
    const g = this.geo;
    const from = g.o === 'portrait'
      ? { x: g.pile.x + this.rng.range(-g.w * 0.18, g.w * 0.18), y: g.groundTop + g.min * 0.06 }
      : { x: g.w + g.min * 0.06, y: g.pile.y + this.rng.range(-g.h * 0.12, g.h * 0.12) };
    this.vortex = {
      x: from.x,
      y: from.y,
      vx: g.wind.x * g.min * 0.2,
      vy: g.wind.y * g.min * 0.16,
      k: 1,
    };
  }

  /** blow the pile apart; leaves the player is pressing on stay put */
  private burstPile(power: number): void {
    const p = this.geo.pile;
    const keep: Leaf[] = [];
    const going: Leaf[] = [];
    for (const l of this.pile) (l.hold > 0.35 ? keep : going).push(l);
    let launched = 0;
    for (const l of going) {
      const q = this.pilePos(l);
      // only the loose upper leaves go on the first breath
      const up = l.lift / Math.max(1, this.pileH());
      if (this.rng.next() > clamp(0.32 + power * 0.85 * (0.35 + up), 0, 1)) {
        keep.push(l);
        continue;
      }
      l.x = q.x;
      l.y = q.y;
      l.z = Math.max(4, q.z);
      const a = Math.atan2(q.y - p.y, q.x - p.x) + this.rng.range(-0.7, 0.7);
      const sp = this.geo.min * this.rng.range(0.25, 0.75) * (0.5 + power);
      l.vx = Math.cos(a) * sp + this.geo.wind.x * this.geo.min * 0.22 * power;
      l.vy = Math.sin(a) * sp * 0.5 + this.geo.wind.y * this.geo.min * 0.14 * power;
      l.vz = this.geo.min * this.rng.range(0.42, 1.0) * (0.5 + power * 0.8);
      l.spin = this.rng.range(-9, 9);
      l.flipV = this.rng.range(-11, 11);
      l.sway = this.rng.range(0, 6.28);
      this.leavePile(l);
      launched++;
    }
    this.pile = keep;
    this.relayoutPile();
    if (launched > 0) {
      this.ctx.audio.whoosh(clamp(0.5 + launched / 26, 0.4, 1.35), 0.75);
      this.rustle = Math.max(this.rustle, clamp(launched / 22, 0, 1));
    }
  }

  // ------------------------------------------------------------ phases

  enterPhase(name: PhaseName): void {
    const ph = this.ctx.phase;
    if (ph.name !== name) ph.set(name);
    ph.intervening = name === 'trouble';
    this.quiet = 0;
    this.settleBeat = -1;
    this.driftT = -1;
    this.foreCue = 0;
    this.waves = [];
    this.waveClock = 0;
    this.vortex = null;
    this.gust = 0;
    this.puffs = [];
    this.held = null;
    this.down = false;
    this.pressT = 0;
    this.ch.on = false;
    this.ch.t = 0;
    this.ch.jump = 0;
    this.ch.inPile = 0;
    this.ch.look = 0;
    this.ch.shake = 0;
    this.ch.hatLeaf = null;
    this.ch.x = this.geo.charFrom.x;
    this.loops = 0;
    this.ending = 'none';

    switch (name) {
      case 'establish':
        this.scatterAll();
        this.breeze = this.breezeT = 0.08;
        this.swayAmp = 0.1;
        this.camZ = 1.055;
        this.camZT = 1;
        this.camY = this.geo.h * 0.012;
        this.camYT = 0;
        this.driftT = 1.05;
        break;

      case 'action':
        this.enterPhase('establish');
        this.ctx.phase.set('action');
        this.camZ = this.camZT = 1;
        this.camY = this.camYT = 0;
        this.driftT = -1;
        this.buildPile(0.36);
        break;

      case 'foreshadow':
        this.enterPhase('action');
        this.ctx.phase.set('foreshadow');
        this.buildPile(0.88);
        this.breeze = 0.16;
        this.breezeT = 0.5;
        this.swayAmp = 0.5;
        this.foreCue = 0;
        break;

      case 'trouble':
        this.enterPhase('foreshadow');
        this.ctx.phase.set('trouble');
        this.ctx.phase.intervening = true;
        this.breeze = this.breezeT = 0.62;
        this.swayAmp = 1;
        this.scheduleWaves(1);
        break;

      case 'resolve': {
        this.enterPhase('trouble');
        this.ctx.phase.set('resolve');
        this.ctx.phase.intervening = false;
        // the wind has already been through: a fresh scatter, no pile
        this.scatterAll();
        for (const l of this.leaves) {
          l.rot = this.rng.range(0, Math.PI * 2);
          l.rest = this.rng.range(0, 2);
        }
        for (let i = 0; i < 5; i++) {
          const l = this.leaves[i];
          l.z = this.geo.min * this.rng.range(0.05, 0.3);
          l.vz = -this.geo.min * 0.08;
          l.vx = this.geo.wind.x * this.geo.min * 0.18;
          l.vy = this.geo.wind.y * this.geo.min * 0.1;
          l.flipV = this.rng.range(-4, 4);
          l.spin = this.rng.range(-3, 3);
          l.state = 'air';
        }
        this.breeze = 0.45;
        this.breezeT = 0.12;
        this.swayAmp = 0.45;
        this.waves = [];
        this.gust = 0;
        this.vortex = null;
        this.ending = 'scattered';
        break;
      }

      case 'comic':
        this.enterPhase('resolve');
        this.ctx.phase.set('comic');
        this.breeze = this.breezeT = 0.1;
        this.swayAmp = 0.18;
        this.waves = [];
        this.gust = 0;
        this.vortex = null;
        this.buildPile(0.55);
        this.ending = 'held';
        this.ch.on = true;
        this.ch.t = 0;
        this.ch.x = this.geo.charFrom.x;
        break;

      case 'settle':
        this.enterPhase('comic');
        this.ctx.phase.set('settle');
        this.waves = [];
        this.gust = 0;
        this.vortex = null;
        this.ch.t = 6.4;
        this.ch.x = this.geo.charTo.x;
        this.ch.inPile = (this.ending as string) === 'scattered' ? 0 : 1;
        if (this.ch.inPile) this.settleSquirrelInPile();
        break;
    }
  }

  private settleSquirrelInPile(): void {
    // the squirrel ends up sitting in the middle of the mound
    this.ch.x = this.geo.pile.x - this.pileR() * 0.1;
    this.ch.y = this.geo.pile.y + this.pileH() * 0.05;
  }

  /** forward transition during play: keep the world, only arm the next beat */
  private advance(name: PhaseName): void {
    const ph = this.ctx.phase;
    ph.set(name);
    ph.intervening = name === 'trouble';
    switch (name) {
      case 'action':
        this.camZT = 1;
        this.camYT = 0;
        break;
      case 'foreshadow':
        this.foreCue = 0;
        this.breezeT = 0.5;
        break;
      case 'trouble':
        this.breezeT = 0.62;
        this.scheduleWaves(1 - this.loops * 0.12);
        break;
      case 'resolve':
        this.breezeT = 0.12;
        this.vortex = null;
        this.ending = this.pileFrac() > 0.4 ? 'held' : 'scattered';
        break;
      case 'comic':
        this.ch.on = true;
        this.ch.t = 0;
        this.ch.x = this.geo.charFrom.x;
        this.ch.y = this.geo.charTo.y;
        this.ending = this.pileFrac() > 0.42 ? 'held' : 'scattered';
        this.breezeT = 0.1;
        break;
      case 'settle':
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------ update

  update(dt: number): void {
    this.t += dt;
    const ph = this.ctx.phase;
    ph.update(dt);

    if (this.down && !this.held) this.applyHold(1);
    this.updateBeats(dt);
    this.updateWind(dt);
    for (const l of this.leaves) this.stepLeaf(l, dt);
    this.updatePuffs(dt);
    this.updateChar(dt);

    const k = 1 - Math.exp(-dt * 1.8);
    this.camZ += (this.camZT - this.camZ) * k;
    this.camY += (this.camYT - this.camY) * k;
    this.swayT += dt * (0.7 + this.breeze * 1.6 + this.gust * 2.2);

    this.ch.blinkT -= dt;
    if (this.ch.blinkT <= 0) {
      this.ch.blink = 0.15;
      this.ch.blinkT = this.rng.range(2.2, 5);
    }
    this.ch.blink = Math.max(0, this.ch.blink - dt);

    this.updateSound(dt);

    if (this.fadeOut) {
      this.fade = Math.min(1, this.fade + dt * 2.2);
      if (this.fade >= 1) {
        this.fadeOut = false;
        this.ctx.exit();
      }
    } else {
      this.fade = Math.max(0, this.fade - dt * 1.8);
    }
  }

  private leave(): void {
    if (!this.fadeOut) this.fadeOut = true;
  }

  private movingCount(): number {
    let n = 0;
    for (const l of this.leaves) {
      if (l.state === 'air' || l.state === 'held') n++;
      else if (l.state === 'ground' && Math.hypot(l.vx, l.vy) > this.geo.min * 0.06) n++;
    }
    return n;
  }

  private updateSound(dt: number): void {
    const a = this.ctx.audio;
    const moving = this.movingCount();
    const want = clamp(moving / 16, 0, 1);
    this.rustle += (want - this.rustle) * (1 - Math.exp(-dt * 6));
    a.bed('rustle', this.rustle * 0.075, 2200 + this.rustle * 2600);
    a.bed('breeze', Math.max(0, this.breeze - 0.12) * 0.05, 300);
    // dry paper ticks while a lot is moving
    this.lastRustle -= dt;
    if (this.rustle > 0.18 && this.lastRustle <= 0) {
      this.lastRustle = this.rng.range(0.06, 0.22) / (0.4 + this.rustle);
      a.drop(this.rng.range(1.5, 2.4));
    }
  }

  // ------------------------------------------------------------ beats

  private updateBeats(dt: number): void {
    const ph = this.ctx.phase;
    switch (ph.name) {
      case 'establish':
        if (this.driftT > 0) {
          this.driftT -= dt;
          if (this.driftT <= 0) this.dropOneFromTree();
        }
        if (ph.t > 3.5 && !this.down) this.advance('action');
        break;

      case 'action': {
        const done = this.pileFrac() >= 0.85;
        if (done && !this.down) {
          this.quiet += dt;
          if (this.settleBeat < 0 && this.quiet > 0.35) {
            this.settleBeat = 0;
            this.pileSettleBeat();
          }
        } else if (!done) {
          this.quiet = 0;
        }
        if (this.settleBeat >= 0) {
          this.settleBeat += dt;
          if (this.settleBeat > 1.9) this.advance('foreshadow');
        } else if (ph.t > 44 && this.pileFrac() > 0.3) {
          this.advance('foreshadow');
        }
        break;
      }

      case 'foreshadow': {
        this.breezeT = 0.22 + smooth(ph.t / 4.6) * 0.42;
        this.runForeshadowCues(ph.t);
        if (ph.t > 5.4) this.advance('trouble');
        break;
      }

      case 'trouble': {
        if (this.waveClock > this.wavesEnd() + 1.7) this.advance('resolve');
        break;
      }

      case 'resolve': {
        const rebuilt = this.pileFrac() >= 0.6;
        if (rebuilt && !this.down && this.loops < 2) {
          this.quiet += dt;
          if (this.quiet > 1.1) {
            this.loops++;
            this.quiet = 0;
            this.advance('foreshadow');
          }
        } else {
          this.quiet = 0;
        }
        if (ph.t > 10 && !this.down) this.advance('comic');
        break;
      }

      case 'comic':
        if (this.ch.t > 6.6) this.advance('settle');
        break;

      case 'settle':
        if (ph.t > 6.5 && !this.down) this.leave();
        break;
    }
  }

  /** the mound gives a small satisfied settle: two leaves slide down the side */
  private pileSettleBeat(): void {
    const n = this.pile.length;
    if (!n) return;
    const top = [...this.pile].sort((a, b) => b.lift - a.lift).slice(0, 2);
    for (const l of top) {
      const q = this.pilePos(l);
      l.x = q.x;
      l.y = q.y;
      l.z = q.z;
      const a = this.rng.range(0, Math.PI * 2);
      l.vx = Math.cos(a) * this.geo.min * 0.17;
      l.vy = Math.abs(Math.sin(a)) * this.geo.min * 0.1;
      l.vz = this.geo.min * 0.05;
      l.spin = this.rng.range(-3, 3);
      this.leavePile(l);
    }
    this.ctx.audio.flump(0.15);
  }

  private runForeshadowCues(t: number): void {
    const cues = [0.85, 1.5, 2.3, 3.1, 3.8, 4.6];
    while (this.foreCue < cues.length && t > cues[this.foreCue]) {
      const i = this.foreCue++;
      switch (i) {
        case 0: {
          // ONE leaf on top of the pile trembles
          const l = this.topPileLeaf();
          if (l) l.hold = -1; // negative hold is used as a tremble marker
          break;
        }
        case 1: {
          // ...and lifts off, slowly
          const l = this.pile.find((x) => x.hold < 0) ?? this.topPileLeaf();
          if (l) {
            const q = this.pilePos(l);
            l.x = q.x;
            l.y = q.y;
            l.z = Math.max(2, q.z);
            l.hold = 0;
            l.vz = this.geo.min * 0.26;
            l.vx = this.geo.wind.x * this.geo.min * 0.12;
            l.vy = this.geo.wind.y * this.geo.min * 0.07;
            l.flipV = 2.4;
            l.spin = 1.6;
            this.leavePile(l);
            this.ctx.audio.drop(2.2);
          }
          break;
        }
        case 2:
        case 4: {
          // a few ground leaves skitter
          const near = this.leaves.filter((x) => x.state === 'ground');
          for (let k = 0; k < 3 && near.length; k++) {
            const l = near[this.rng.int(0, near.length - 1)];
            l.vx += this.geo.wind.x * this.geo.min * this.rng.range(0.3, 0.6);
            l.vy += this.geo.wind.y * this.geo.min * this.rng.range(0.2, 0.4);
            l.spin += this.rng.range(-5, 5);
            l.vz = this.geo.min * this.rng.range(0.01, 0.06);
          }
          this.ctx.audio.drop(this.rng.range(1.6, 2.2));
          break;
        }
        case 3:
          this.swayAmp = 1;
          break;
        case 5:
          this.ctx.audio.whoosh(0.42, 1.5);
          break;
        default:
          break;
      }
    }
  }

  private topPileLeaf(): Leaf | null {
    let best: Leaf | null = null;
    for (const l of this.pile) if (!best || l.lift > best.lift) best = l;
    return best;
  }

  /** a single leaf lets go of the tree and drifts down: the world is alive */
  private dropOneFromTree(): void {
    const g = this.geo;
    const l = this.leaves.find((x) => x.state === 'ground' && x.z === 0);
    if (!l) return;
    l.x = g.canopy.x + g.canopy.r * (g.o === 'portrait' ? 0.55 : -0.42);
    l.y = clamp(g.groundTop + g.min * 0.1, g.groundTop, g.h);
    l.z = g.canopy.y + g.canopy.r * 0.35 > 0 ? l.y - (g.canopy.y + g.canopy.r * 0.2) : g.min * 0.5;
    l.z = Math.max(g.min * 0.42, l.z);
    l.vx = g.wind.x * g.min * 0.09;
    l.vy = g.min * 0.03;
    l.vz = 0;
    l.state = 'air';
    l.flipV = 2.1;
    l.spin = 1.1;
    l.sway = 0;
  }

  // ------------------------------------------------------------ wind

  private updateWind(dt: number): void {
    const k = 1 - Math.exp(-dt * 1.3);
    this.breeze += (this.breezeT - this.breeze) * k;
    this.waveClock += dt;
    let g = 0;
    for (const w of this.waves) {
      if (!w.fired && this.waveClock > w.t0) {
        w.fired = true;
        this.spawnVortex();
        this.ctx.audio.whoosh(0.85 + w.peak * 0.5, 1.1);
        this.burstPile(w.peak);
      }
      g += w.peak * bell((this.waveClock - w.t0) / w.dur);
    }
    this.gust += (clamp(g, 0, 1.25) - this.gust) * (1 - Math.exp(-dt * 6));
    if (this.gust > 0.4 && this.pile.length) {
      this.pressT -= dt;
      if (this.pressT <= 0) {
        this.pressT = 0.22;
        this.burstPile(this.gust * 0.5);
      }
    }
    const targetSway = clamp(this.breeze * 0.9 + this.gust * 1.1, 0, 1.6);
    this.swayAmp += (targetSway - this.swayAmp) * (1 - Math.exp(-dt * 3.4));

    if (this.vortex) {
      const v = this.vortex;
      v.x += v.vx * dt;
      v.y += v.vy * dt;
      v.vx *= Math.exp(-dt * 0.35);
      v.vy *= Math.exp(-dt * 0.35);
      v.k *= Math.exp(-dt * 0.3);
      const out =
        v.x < -this.geo.min * 0.4 ||
        v.x > this.geo.w + this.geo.min * 0.4 ||
        v.y > this.geo.h + this.geo.min * 0.4 ||
        v.k < 0.06;
      if (out) this.vortex = null;
    }
  }

  private windAt(l: Leaf): { x: number; y: number; lift: number } {
    const g = this.geo;
    const s = this.breeze * 0.45 + this.gust;
    const n = this.noise(this.t * 1.6 + l.y * 0.01) * 0.35 + 0.8;
    let wx = g.wind.x * s * g.min * 0.38 * n;
    let wy = g.wind.y * s * g.min * 0.2 * n;
    let lift = this.gust * g.min * 1.15;
    const v = this.vortex;
    if (v) {
      const dx = l.x - v.x;
      const dy = (l.y - v.y) * 1.6;
      const d = Math.hypot(dx, dy) + 1;
      const fall = Math.exp(-d / (g.min * 0.4)) * v.k;
      const tang = g.min * 1.9 * fall;
      wx += (-dy / d) * tang - (dx / d) * tang * 0.3;
      wy += (dx / d) * tang * 0.45 - (dy / d) * tang * 0.18;
      lift += g.min * 1.35 * fall;
    }
    return { x: wx, y: wy, lift };
  }

  // ------------------------------------------------------------ leaves

  private stepLeaf(l: Leaf, dt: number): void {
    const g = this.geo;

    if (l.state === 'pile') {
      const q = this.pilePos(l);
      if (l.ease < 1) {
        l.ease = Math.min(1, l.ease + dt * 3.6);
        const s = smooth(l.ease);
        l.x = lerp(l.jx, q.x, s);
        l.y = lerp(l.jy, q.y, s);
        l.z = q.z + Math.sin(Math.PI * s) * g.min * 0.05;
        l.rot += l.spin * dt;
        l.spin *= Math.exp(-dt * 4);
      } else {
        l.x = q.x;
        l.y = q.y;
        l.z = q.z;
        l.rot += (l.prot - l.rot) * (1 - Math.exp(-dt * 6));
      }
      l.flip *= Math.exp(-dt * 3);
      if (l.hold < 0) {
        // the tremble marker: shiver in place
        l.x += Math.sin(this.t * 34) * g.min * 0.004;
        l.rot += Math.sin(this.t * 41) * 0.012;
      } else {
        l.hold = Math.max(0, l.hold - dt * 1.1);
      }
      return;
    }

    if (l.state === 'held') {
      const lag = 1 - Math.exp(-dt * 22);
      const dx = this.ptX - l.x;
      const dy = this.ptY - l.z - l.y;
      l.x += dx * lag;
      l.y += dy * lag;
      l.vx = dx / Math.max(dt, 1e-3);
      l.vy = dy / Math.max(dt, 1e-3);
      l.rot += (Math.atan2(dy, dx) + Math.PI / 2 - l.rot) * (1 - Math.exp(-dt * 6));
      l.flip = Math.sin(this.t * 6) * 0.3;
      return;
    }

    if (l.state === 'stuck') {
      l.stickT -= dt;
      l.rot += Math.sin(this.t * 7 + l.sway) * dt * (0.3 + this.breeze);
      if (l.stickT <= 0 || this.gust > 0.5) {
        l.state = 'air';
        l.vz = -g.min * 0.02;
        l.vx = g.wind.x * g.min * 0.1;
        l.vy = g.min * 0.12;
        l.flipV = this.rng.range(-4, 4);
        l.stickTo = 0;
      }
      return;
    }

    const face = Math.abs(Math.cos(l.flip));
    const w = this.windAt(l);

    if (l.z > 0.4 || l.vz > 0) {
      // ---- airborne: paper, not stone
      l.vz -= g.min * 1.45 * dt;
      if (l.vz < 0) l.vz *= Math.exp(-dt * (1.1 + face * 5.2));
      l.vz += w.lift * face * dt * (0.5 + 0.5 * Math.sin(l.sway * 1.7));
      l.sway += dt * (3.4 + face * 2.2 + this.gust * 3);
      const fl = Math.sin(l.sway) * g.min * (0.9 + this.gust * 0.6) * face;
      l.vx += (w.x - l.vx) * dt * 1.5 + fl * dt * Math.cos(l.rot);
      l.vy += (w.y - l.vy) * dt * 1.5 + fl * dt * Math.sin(l.rot) * 0.4;
      l.vx *= Math.exp(-dt * 0.8);
      l.vy *= Math.exp(-dt * 0.9);
      const m = g.min * 0.16;
      if (l.x < m) l.vx += (m - l.x) * 5.5 * dt;
      else if (l.x > g.w - m) l.vx -= (l.x - (g.w - m)) * 5.5 * dt;
      const my0 = g.groundTop + g.min * 0.08;
      const my1 = g.h - g.min * 0.1;
      if (l.y < my0) l.vy += (my0 - l.y) * 5.5 * dt;
      else if (l.y > my1) l.vy -= (l.y - my1) * 5.5 * dt;
      l.x += l.vx * dt;
      l.y += l.vy * dt;
      l.z += l.vz * dt;
      l.flip += l.flipV * dt;
      l.flipV += Math.sin(l.sway * 1.3) * dt * 3.5;
      l.flipV *= Math.exp(-dt * 0.5);
      l.rot += l.spin * dt;
      l.spin += (w.x * 0.0008 - l.spin) * dt * 0.8;

      if (l.x < -g.min * 0.1) l.x = -g.min * 0.1, l.vx = Math.abs(l.vx) * 0.3;
      if (l.x > g.w + g.min * 0.1) l.x = g.w + g.min * 0.1, l.vx = -Math.abs(l.vx) * 0.3;
      if (l.y < g.groundTop - g.min * 0.06) {
        l.y = g.groundTop - g.min * 0.06;
        l.vy = Math.abs(l.vy) * 0.4;
      }
      if (l.y > g.h + g.min * 0.06) l.y = g.h + g.min * 0.06, l.vy = -Math.abs(l.vy) * 0.3;

      if (l.z <= 0) {
        l.z = 0;
        l.vz = 0;
        l.state = 'ground';
        l.rest = 0;
        l.spin *= 0.4;
        this.landCheck(l);
      }
      return;
    }

    // ---- on the ground: dry, light, skittering
    if (l.state === 'air') {
      l.z = 0;
      l.vz = 0;
      l.state = 'ground';
      l.rest = 0;
      l.spin *= 0.4;
      this.landCheck(l);
      if (l.state !== 'ground') return;
    }
    l.z = 0;
    l.vz = 0;
    const speed = Math.hypot(l.vx, l.vy);
    const fr = Math.exp(-dt * (speed > g.min * 0.5 ? 2.6 : 5.4));
    l.vx *= fr;
    l.vy *= fr;
    // the wind pushes leaves along the ground and flips them up now and then
    const push = this.breeze * 0.35 + this.gust;
    if (push > 0.16) {
      l.vx += w.x * dt * 0.3;
      l.vy += w.y * dt * 0.3;
      l.spin += Math.sin(this.t * 3 + l.sway) * dt * push * 4;
      if (this.rng.next() < push * dt * 2.2) {
        l.vz = g.min * this.rng.range(0.18, 0.72) * push;
        l.flipV = this.rng.range(-8, 8);
        l.spin += this.rng.range(-5, 5);
      }
    }
    l.x += l.vx * dt;
    l.y += l.vy * dt;
    l.rot += l.spin * dt;
    l.spin *= Math.exp(-dt * 5.5);
    l.flip *= Math.exp(-dt * 6);
    l.x = clamp(l.x, g.min * 0.02, g.w - g.min * 0.02);
    l.y = clamp(l.y, g.groundTop + g.min * 0.02, g.h - g.min * 0.03);
    if (Math.hypot(l.vx, l.vy) < g.min * 0.02) {
      l.vx = 0;
      l.vy = 0;
      l.rest += dt;
      if (l.rest > 0.12) this.maybeJoinPile(l);
    } else {
      l.rest = 0;
    }
  }

  private maybeJoinPile(l: Leaf): void {
    if (this.ctx.phase.is('trouble') && this.gust > 0.35) return;
    const p = this.geo.pile;
    // the target area is a place in the world, not a function of what is in it:
    // the very first leaf has to be able to find it too
    const R = Math.max(this.geo.min * 0.125, this.pileR(this.pile.length + 1) * 1.2);
    const d = Math.hypot(l.x - p.x, (l.y - p.y) / 0.6);
    if (d < R) {
      this.joinPile(l);
      if (this.rng.next() < 0.5) this.ctx.audio.drop(this.rng.range(1.7, 2.6));
    }
  }

  /** a leaf touched down: did it land on the fence, or on somebody? */
  private landCheck(l: Leaf): void {
    const g = this.geo;
    if (this.ch.on && this.ch.inPile < 0.5 && !this.ch.hatLeaf) {
      const hx = this.ch.x;
      const hy = this.ch.y - this.charScale() * 2.9;
      if (Math.hypot(l.x - hx, l.y - hy) < this.charScale() * 1.8) {
        this.stickToHead(l);
        return;
      }
    }
    if (l.y < g.groundTop + g.min * 0.01) {
      l.state = 'stuck';
      l.stickTo = 1;
      l.stickT = this.rng.range(2.5, 7);
      return;
    }
    if (this.rng.next() < 0.35) this.ctx.audio.drop(this.rng.range(1.8, 2.8));
  }

  private stickToHead(l: Leaf): void {
    l.state = 'stuck';
    l.stickTo = 2;
    l.stickT = 99;
    l.vx = 0;
    l.vy = 0;
    l.vz = 0;
    l.rot = this.rng.range(-0.35, 0.35) + Math.PI * 0.5;
    this.ch.hatLeaf = l;
    this.ch.blink = 0.001;
    this.ch.blinkT = 0.45;
    this.ctx.audio.drop(1.3);
  }

  private updatePuffs(dt: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += this.geo.min * 0.4 * dt;
      p.vx *= Math.exp(-dt * 1.4);
      if (p.life <= 0) this.puffs.splice(i, 1);
    }
  }

  // ------------------------------------------------------------ squirrel

  private charScale(): number {
    return this.geo.min * 0.068;
  }

  private updateChar(dt: number): void {
    const c = this.ch;
    if (!c.on) return;
    const g = this.geo;
    c.t += dt;
    const s = this.charScale();

    if (c.inPile < 0.5) {
      const walk = smooth(c.t / 1.45);
      c.x = lerp(g.charFrom.x, g.charTo.x, walk);
      c.y = g.charTo.y;
      c.look = smooth((c.t - 1.5) / 0.8);
    }

    // a leaf comes down on its head
    if (c.t > 1.75 && c.t < 1.8 && !c.hatLeaf) {
      const l =
        this.leaves.find((x) => x.state === 'ground' && Math.hypot(x.x - c.x, x.y - c.y) < g.min * 0.5) ??
        this.leaves.find((x) => x.state === 'ground');
      if (l) {
        if (l.state === 'pile') this.leavePile(l);
        l.x = c.x + s * 0.12;
        l.y = c.y - s * 3.05;
        l.z = g.min * 0.34;
        l.vx = 0;
        l.vy = 0;
        l.vz = 0;
        l.spin = 0.8;
        l.flipV = 1.6;
        l.state = 'air';
      }
    }

    if (this.ending === 'held') {
      // the pile survived: take a run-up and dive into it
      const j0 = 3.7;
      if (c.t > j0 && c.jump <= 0 && c.inPile < 0.5) {
        c.jump = 0.001;
        this.ctx.audio.whoosh(0.4, 0.35);
      }
      if (c.jump > 0 && c.inPile < 0.5) {
        c.jump += dt / 0.62;
        const k = clamp(c.jump, 0, 1);
        c.x = lerp(g.charTo.x, g.pile.x, smooth(k));
        c.y = lerp(g.charTo.y, g.pile.y + this.pileH() * 0.12, smooth(k)) - Math.sin(Math.PI * k) * s * 3.4;
        if (c.jump >= 1) {
          c.inPile = 1;
          this.splashIntoPile();
        }
      }
      if (c.inPile > 0.5) {
        c.inPile = Math.min(3, c.inPile + dt);
        c.x = g.pile.x - this.pileR() * 0.1;
        c.y = g.pile.y + this.pileH() * 0.05;
      }
    } else if (c.t > 3.9 && c.t < 4.9) {
      // no pile left: a small headshake, and the leaf slides off
      c.shake = Math.sin((c.t - 3.9) * 18) * smooth((4.9 - c.t) / 0.5);
      if (c.hatLeaf && c.t > 4.3) {
        const l = c.hatLeaf;
        c.hatLeaf = null;
        l.state = 'air';
        l.stickTo = 0;
        l.vx = this.rng.range(-1, 1) * g.min * 0.25;
        l.vy = g.min * 0.1;
        l.vz = g.min * 0.05;
        l.spin = this.rng.range(-4, 4);
        l.flipV = 3;
        this.ctx.audio.drop(1.6);
      }
    } else {
      c.shake *= Math.exp(-dt * 6);
    }

    if (c.hatLeaf) {
      const l = c.hatLeaf;
      l.x = c.x + s * 0.12 + c.shake * s * 0.16;
      l.y = c.y - s * 3.05;
      l.z = 0;
    }
  }

  private splashIntoPile(): void {
    const g = this.geo;
    this.ctx.audio.flump(0.05);
    this.ctx.audio.mew();
    const going = [...this.pile];
    for (const l of going) {
      const q = this.pilePos(l);
      if (l.lift < this.pileH() * 0.35 && this.rng.next() < 0.5) continue;
      l.x = q.x;
      l.y = q.y;
      l.z = Math.max(3, q.z);
      const a = Math.atan2(q.y - g.pile.y, q.x - g.pile.x) + this.rng.range(-0.5, 0.5);
      const sp = g.min * this.rng.range(0.1, 0.4);
      l.vx = Math.cos(a) * sp;
      l.vy = Math.sin(a) * sp * 0.5;
      l.vz = g.min * this.rng.range(0.5, 1.05);
      l.spin = this.rng.range(-7, 7);
      l.flipV = this.rng.range(-8, 8);
      this.leavePile(l);
    }
    for (let i = 0; i < 10; i++) {
      this.puffs.push({
        x: g.pile.x + this.rng.range(-1, 1) * this.pileR(),
        y: g.pile.y + this.rng.range(-0.4, 0.4) * this.pileR() * 0.5,
        vx: this.rng.range(-1, 1) * g.min * 0.2,
        vy: -this.rng.range(0.1, 0.4) * g.min,
        life: this.rng.range(0.5, 0.9),
        max: 0.9,
        r: g.min * this.rng.range(0.02, 0.05),
      });
    }
  }

  // ------------------------------------------------------------ render

  private specks: Array<{ x: number; y: number; r: number; a: number }> = [];
  private blades: Array<{ x: number; y: number; len: number; ph: number; lean: number; dark: number }> = [];
  private fgBits: Array<{ x: number; y: number; s: number; rot: number; shape: ShapeId; col: RGB }> = [];
  private hedgeBumps: Array<{ x: number; y: number; r: number }> = [];
  private drawBuf: Leaf[] = [];

  private buildDecor(): void {
    const g = this.geo;
    const r = new Rng((this.rng.seed ^ 0x5eed) >>> 0);
    this.specks = [];
    for (let i = 0; i < 90; i++) {
      const y = lerp(g.groundTop, g.h, Math.sqrt(r.next()));
      this.specks.push({
        x: r.range(0, g.w),
        y,
        r: r.range(0.8, 2.4) * (0.6 + (y - g.groundTop) / (g.h - g.groundTop)),
        a: r.range(0.05, 0.17),
      });
    }
    this.blades = [];
    const bladeAt = (x: number, y: number) => {
      this.blades.push({
        x,
        y,
        len: g.min * r.range(0.025, 0.06) * (0.65 + (y - g.groundTop) / (g.h - g.groundTop)),
        ph: r.range(0, 6.28),
        lean: r.range(-0.3, 0.3),
        dark: r.range(0, 1),
      });
    };
    if (g.o === 'portrait') {
      for (let i = 0; i < 74; i++) {
        const y = lerp(g.groundTop + 4, g.h, r.next());
        const t = (y - g.groundTop) / (g.h - g.groundTop);
        const half = lerp(g.w * 0.22, g.w * 0.49, t);
        const side = r.next() < 0.5 ? -1 : 1;
        bladeAt(g.w * 0.5 + side * (half + r.range(-g.w * 0.03, g.w * 0.06)), y);
      }
    } else {
      for (let i = 0; i < 74; i++) {
        const top = r.next() < 0.55;
        const y = top
          ? g.groundTop + r.range(-2, g.h * 0.07)
          : g.h - r.range(0, g.h * 0.09);
        bladeAt(r.range(-10, g.w + 10), y);
      }
    }
    this.fgBits = [];
    for (let i = 0; i < 4; i++) {
      this.fgBits.push({
        x: r.range(-0.05, 1.05) * g.w,
        y: g.h + g.min * r.range(0.035, 0.085),
        s: g.min * r.range(0.07, 0.11),
        rot: r.range(0, 6.28),
        shape: (i % 3) as ShapeId,
        col: mix(r.pick(LEAF_COLS), [52, 36, 28], 0.45),
      });
    }
    this.hedgeBumps = [];
    const n = Math.ceil(g.w / (g.min * 0.09)) + 3;
    for (let i = 0; i < n; i++) {
      this.hedgeBumps.push({
        x: (i - 1) * g.min * 0.09 + r.range(-6, 6),
        y: g.horizonY + r.range(-g.min * 0.03, g.min * 0.01),
        r: g.min * r.range(0.045, 0.08),
      });
    }
  }

  private sway(k: number): number {
    // one shared breathing motion so tree, grass and fence agree
    return (
      Math.sin(this.swayT * 1.35 + k) * 0.62 + this.noise(this.swayT * 0.55 + k * 3.1) * 0.55
    ) * this.swayAmp;
  }

  render(gg: CanvasRenderingContext2D): void {
    if (!this.specks.length) this.buildDecor();
    const { w, h } = this.geo;

    gg.save();
    gg.translate(w / 2, h / 2);
    gg.scale(this.camZ, this.camZ);
    gg.translate(-w / 2, -h / 2 + this.camY);

    this.drawSky(gg);
    this.drawFarTrees(gg);
    this.drawHedgeFence(gg);
    this.drawGround(gg);
    this.drawShadows(gg);
    this.drawGrass(gg);
    this.drawRake(gg);
    this.drawTree(gg);
    this.drawScene(gg);
    this.drawPuffs(gg);
    this.drawForeground(gg);
    this.drawLight(gg);
    gg.restore();

    if (this.fade > 0.001) {
      gg.fillStyle = `rgba(20,12,8,${this.fade})`;
      gg.fillRect(0, 0, w, h);
    }
  }

  private drawSky(gg: CanvasRenderingContext2D): void {
    const g = this.geo;
    const grd = gg.createLinearGradient(0, -g.h * 0.1, 0, g.horizonY + g.min * 0.05);
    grd.addColorStop(0, 'rgb(112,150,186)');
    grd.addColorStop(0.42, 'rgb(186,192,192)');
    grd.addColorStop(0.78, 'rgb(240,206,152)');
    grd.addColorStop(1, 'rgb(252,226,176)');
    gg.fillStyle = grd;
    gg.fillRect(-24, -g.h * 0.2, g.w + 48, g.horizonY + g.min * 0.08 + g.h * 0.2);

    // the low sun, sitting just above the hedge
    const s = g.sun;
    const r = g.min * 0.07;
    const glow = gg.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 6.2);
    glow.addColorStop(0, 'rgba(255,244,206,0.95)');
    glow.addColorStop(0.14, 'rgba(255,224,158,0.55)');
    glow.addColorStop(1, 'rgba(255,206,132,0)');
    gg.fillStyle = glow;
    gg.beginPath();
    gg.arc(s.x, s.y, r * 6.2, 0, Math.PI * 2);
    gg.fill();
    gg.fillStyle = 'rgba(255,250,226,0.92)';
    gg.beginPath();
    gg.arc(s.x, s.y, r * 0.62, 0, Math.PI * 2);
    gg.fill();
  }

  private drawFarTrees(gg: CanvasRenderingContext2D): void {
    const g = this.geo;
    const par = (this.camZ - 1) * 26 + this.sway(0) * 1.2;
    for (let layer = 0; layer < 2; layer++) {
      const col: RGB = layer === 0 ? [182, 160, 128] : [124, 118, 86];
      const y = g.horizonY - g.min * (layer === 0 ? 0.075 : 0.035);
      gg.fillStyle = rgb(col, layer === 0 ? 0.6 : 0.82);
      gg.beginPath();
      gg.moveTo(-g.w, g.horizonY + 10);
      const n = 11;
      for (let i = 0; i <= n; i++) {
        const x = -g.w * 0.1 + (g.w * 1.2 * i) / n + par * (layer === 0 ? 0.3 : 0.6);
        const rr = g.min * (0.05 + 0.035 * Math.sin(i * 2.3 + layer));
        gg.moveTo(x + rr, y + Math.sin(i * 1.7 + layer * 2) * g.min * 0.02);
        gg.arc(x, y + Math.sin(i * 1.7 + layer * 2) * g.min * 0.02, rr, 0, Math.PI * 2);
        gg.moveTo(x + rr * 0.7, y + rr * 0.5);
        gg.arc(x - rr * 0.5, y + rr * 0.45, rr * 0.75, 0, Math.PI * 2);
      }
      gg.fill();
      gg.fillStyle = rgb(col, layer === 0 ? 0.5 : 0.85);
      gg.fillRect(-24, y + g.min * (layer === 0 ? 0.03 : 0.02), g.w + 48, g.horizonY - y);
    }
  }

  private drawHedgeFence(gg: CanvasRenderingContext2D): void {
    const g = this.geo;
    const top = g.horizonY;
    const base = g.groundTop + g.min * 0.01;
    // hedge
    gg.fillStyle = 'rgb(86,96,64)';
    gg.beginPath();
    for (const b of this.hedgeBumps) {
      const s = this.sway(b.x * 0.01) * 1.6;
      gg.moveTo(b.x + b.r + s, b.y);
      gg.arc(b.x + s, b.y, b.r, 0, Math.PI * 2);
    }
    gg.fill();
    gg.fillStyle = 'rgb(74,84,56)';
    gg.fillRect(-24, top, g.w + 48, base - top);
    // a warm rim on top of the hedge, lit by the low sun
    gg.fillStyle = 'rgba(226,192,120,0.32)';
    gg.beginPath();
    for (const b of this.hedgeBumps) {
      const s = this.sway(b.x * 0.01) * 1.6;
      gg.moveTo(b.x + b.r * 0.8 + s, b.y - b.r * 0.2);
      gg.arc(b.x + s, b.y - b.r * 0.2, b.r * 0.8, Math.PI, Math.PI * 2);
    }
    gg.fill();

    // fence in front of it
    const fTop = lerp(top, base, 0.42);
    const step = g.min * 0.058;
    const wood: RGB = [150, 112, 78];
    for (let x = -step; x < g.w + step; x += step) {
      const k = (x * 7919) % 13;
      const ph = fTop + (k % 3) * 1.6;
      gg.fillStyle = rgb(mix(wood, [255, 226, 168], 0.18 + (k % 5) * 0.03));
      gg.fillRect(x, ph, step * 0.52, base - ph + 2);
      gg.fillStyle = rgb(mix(wood, [58, 38, 26], 0.45), 0.5);
      gg.fillRect(x + step * 0.42, ph, step * 0.1, base - ph + 2);
    }
    for (const ry of [0.32, 0.78]) {
      const y = lerp(fTop, base, ry);
      gg.fillStyle = rgb(mix(wood, [255, 230, 180], 0.3));
      gg.fillRect(-24, y, g.w + 48, g.min * 0.016);
      gg.fillStyle = rgb(mix(wood, [50, 34, 24], 0.4), 0.45);
      gg.fillRect(-24, y + g.min * 0.014, g.w + 48, g.min * 0.005);
    }
  }

  /** the outline of the gravel path — also used to keep shadows off the grass */
  private pathShape(gg: CanvasRenderingContext2D): void {
    const g = this.geo;
    const gt = g.groundTop;
    gg.beginPath();
    if (g.o === 'portrait') {
      const half = (t: number): number => lerp(g.w * 0.23, g.w * 0.52, t);
      const N = 8;
      gg.moveTo(g.w * 0.5 - half(0), gt);
      for (let i = 1; i <= N; i++) {
        const t = i / N;
        const y = lerp(gt, g.h + 10, t);
        gg.lineTo(g.w * 0.5 - half(t) + Math.sin(t * 5) * g.w * 0.012, y);
      }
      for (let i = N; i >= 0; i--) {
        const t = i / N;
        const y = lerp(gt, g.h + 10, t);
        gg.lineTo(g.w * 0.5 + half(t) + Math.sin(t * 4 + 1) * g.w * 0.012, y);
      }
    } else {
      const N = 8;
      const topY = (t: number): number => gt + g.min * (0.1 + 0.02 * Math.sin(t * 5.2));
      const botY = (t: number): number => g.h - g.min * (0.06 + 0.025 * Math.sin(t * 4.1 + 2));
      gg.moveTo(-10, topY(0));
      for (let i = 1; i <= N; i++) gg.lineTo(lerp(-10, g.w + 10, i / N), topY(i / N));
      for (let i = N; i >= 0; i--) gg.lineTo(lerp(-10, g.w + 10, i / N), botY(i / N));
    }
    gg.closePath();
  }

  private drawGround(gg: CanvasRenderingContext2D): void {
    const g = this.geo;
    const gt = g.groundTop;
    // grass
    const grass = gg.createLinearGradient(0, gt, 0, g.h);
    grass.addColorStop(0, 'rgb(104,112,66)');
    grass.addColorStop(0.45, 'rgb(122,128,72)');
    grass.addColorStop(1, 'rgb(96,100,58)');
    gg.fillStyle = grass;
    gg.fillRect(-24, gt, g.w + 48, g.h - gt + 24);

    // the path
    const pth = gg.createLinearGradient(0, gt, 0, g.h);
    pth.addColorStop(0, 'rgb(190,162,124)');
    pth.addColorStop(0.4, 'rgb(212,184,142)');
    pth.addColorStop(1, 'rgb(198,168,128)');
    gg.fillStyle = pth;
    this.pathShape(gg);
    gg.fill();

    // gravel
    for (const s of this.specks) {
      gg.fillStyle = `rgba(92,70,48,${s.a})`;
      gg.beginPath();
      gg.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      gg.fill();
    }
  }

  private drawShadows(gg: CanvasRenderingContext2D): void {
    const g = this.geo;
    const sh = g.shadow;
    gg.save();
    gg.globalCompositeOperation = 'multiply';
    // the fence throws a comb of long stripes across the path
    const step = g.min * 0.058;
    const len = g.min * 0.3;
    gg.fillStyle = 'rgba(120,96,74,0.2)';
    gg.beginPath();
    for (let x = -step; x < g.w + step * 2; x += step) {
      const x0 = x;
      const y0 = g.groundTop + g.min * 0.012;
      gg.moveTo(x0, y0);
      gg.lineTo(x0 + step * 0.52, y0);
      gg.lineTo(x0 + step * 0.52 + sh.x * len, y0 + sh.y * len);
      gg.lineTo(x0 + sh.x * len, y0 + sh.y * len);
      gg.closePath();
    }
    gg.fill();

    // the tree: trunk stripe + canopy blot, stretched away from the sun.
    // clipped to the path, so it never smears across the foreground grass.
    gg.save();
    this.pathShape(gg);
    gg.clip();
    const bx = g.trunk.x;
    const by = g.trunk.base;
    const L = g.min * 1.05;
    const swy = this.sway(1.2) * g.min * 0.03;
    gg.fillStyle = 'rgba(104,80,62,0.22)';
    gg.beginPath();
    gg.moveTo(bx - g.trunk.w * 0.5, by);
    gg.lineTo(bx + g.trunk.w * 0.5, by);
    gg.lineTo(bx + g.trunk.w * 0.9 + sh.x * L + swy, by + sh.y * L);
    gg.lineTo(bx - g.trunk.w * 0.9 + sh.x * L + swy, by + sh.y * L);
    gg.closePath();
    gg.fill();
    const cx = bx + sh.x * L * 0.92 + swy;
    const cy = by + sh.y * L * 0.92;
    const rot = Math.atan2(sh.y, sh.x);
    // a soft dappled blot rather than four hard ovals
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7;
      const ex = cx + Math.cos(a) * g.canopy.r * 0.3;
      const ey = cy + Math.sin(a) * g.canopy.r * 0.08;
      const rx = g.canopy.r * 0.44;
      const ry = g.canopy.r * 0.13;
      const bg = gg.createRadialGradient(ex, ey, 0, ex, ey, rx);
      bg.addColorStop(0, 'rgba(104,80,62,0.15)');
      bg.addColorStop(0.55, 'rgba(104,80,62,0.11)');
      bg.addColorStop(1, 'rgba(104,80,62,0)');
      gg.save();
      gg.translate(ex, ey);
      gg.rotate(rot);
      gg.scale(1, ry / rx);
      gg.translate(-ex, -ey);
      gg.fillStyle = bg;
      gg.beginPath();
      gg.arc(ex, ey, rx, 0, Math.PI * 2);
      gg.fill();
      gg.restore();
    }
    gg.restore();
    gg.restore();
  }

  private drawGrass(gg: CanvasRenderingContext2D): void {
    const g = this.geo;
    gg.lineCap = 'round';
    for (const b of this.blades) {
      const s = this.sway(b.x * 0.013 + b.ph) * 0.5 + b.lean;
      gg.strokeStyle = `rgba(${86 + b.dark * 40 | 0},${104 + b.dark * 36 | 0},${52 + b.dark * 24 | 0},0.9)`;
      gg.lineWidth = Math.max(1, g.min * 0.005);
      gg.beginPath();
      gg.moveTo(b.x, b.y);
      gg.quadraticCurveTo(b.x + s * b.len * 0.5, b.y - b.len * 0.6, b.x + s * b.len * 1.25, b.y - b.len);
      gg.stroke();
    }
  }

  private drawRake(gg: CanvasRenderingContext2D): void {
    const g = this.geo;
    const r = g.rake;
    const a = r.ang + this.sway(2.6) * 0.012;
    const hx = r.x + Math.sin(a) * r.len;
    const hy = r.y - Math.cos(a) * r.len;
    gg.save();
    gg.strokeStyle = 'rgba(96,74,54,0.25)';
    gg.lineWidth = g.min * 0.016;
    gg.lineCap = 'round';
    gg.beginPath();
    gg.moveTo(r.x + g.shadow.x * g.min * 0.05, r.y + g.shadow.y * g.min * 0.05);
    gg.lineTo(hx + g.shadow.x * g.min * 0.1, hy + g.shadow.y * g.min * 0.1);
    gg.stroke();
    gg.strokeStyle = 'rgb(176,134,88)';
    gg.lineWidth = g.min * 0.014;
    gg.beginPath();
    gg.moveTo(r.x, r.y);
    gg.lineTo(hx, hy);
    gg.stroke();
    gg.strokeStyle = 'rgba(255,226,172,0.5)';
    gg.lineWidth = g.min * 0.004;
    gg.beginPath();
    gg.moveTo(r.x, r.y);
    gg.lineTo(hx, hy);
    gg.stroke();
    // the head: a fan of tines on the ground
    const tn = 9;
    const spread = g.min * 0.075;
    const drop = g.min * 0.06;
    gg.strokeStyle = 'rgb(138,102,68)';
    gg.lineWidth = g.min * 0.007;
    gg.lineJoin = 'round';
    for (let i = 0; i < tn; i++) {
      const f = (i / (tn - 1) - 0.5) * 2;
      const tipX = r.x + f * spread;
      const tipY = r.y + drop - Math.abs(f) * drop * 0.22;
      gg.beginPath();
      gg.moveTo(r.x, r.y - g.min * 0.012);
      gg.quadraticCurveTo(r.x + f * spread * 0.55, r.y + drop * 0.4, tipX, tipY);
      gg.stroke();
    }
    gg.strokeStyle = 'rgb(160,120,80)';
    gg.lineWidth = g.min * 0.01;
    gg.beginPath();
    gg.moveTo(r.x - spread * 0.78, r.y + drop * 0.42);
    gg.quadraticCurveTo(r.x, r.y + drop * 0.12, r.x + spread * 0.78, r.y + drop * 0.42);
    gg.stroke();
    gg.restore();
  }

  private drawTree(gg: CanvasRenderingContext2D): void {
    const g = this.geo;
    const tr = g.trunk;
    const s = this.sway(0.4);
    const bend = s * g.min * 0.014;

    // trunk
    gg.fillStyle = 'rgb(112,80,56)';
    gg.beginPath();
    gg.moveTo(tr.x - tr.w * 0.62, tr.base + 2);
    gg.quadraticCurveTo(tr.x - tr.w * 0.5 + bend * 0.4, lerp(tr.base, tr.top, 0.5), tr.x - tr.w * 0.34 + bend, tr.top);
    gg.lineTo(tr.x + tr.w * 0.34 + bend, tr.top);
    gg.quadraticCurveTo(tr.x + tr.w * 0.52 + bend * 0.4, lerp(tr.base, tr.top, 0.5), tr.x + tr.w * 0.66, tr.base + 2);
    gg.closePath();
    gg.fill();
    // bark, lit from the sun side
    const lit = g.shadow.x > 0 ? -1 : 1;
    gg.fillStyle = 'rgba(228,176,102,0.3)';
    gg.fillRect(tr.x + lit * tr.w * 0.42, tr.top, tr.w * 0.2, tr.base - tr.top);
    gg.strokeStyle = 'rgba(58,40,30,0.35)';
    gg.lineWidth = Math.max(1, g.min * 0.005);
    for (let i = 0; i < 5; i++) {
      const f = (i + 0.5) / 5;
      gg.beginPath();
      gg.moveTo(tr.x + (f - 0.5) * tr.w * 0.9, tr.base - 4);
      gg.quadraticCurveTo(
        tr.x + (f - 0.4) * tr.w * 0.7 + bend * 0.5,
        lerp(tr.base, tr.top, 0.55),
        tr.x + (f - 0.5) * tr.w * 0.5 + bend,
        tr.top,
      );
      gg.stroke();
    }
    // roots spreading into the ground
    gg.fillStyle = 'rgb(96,72,54)';
    for (const sgn of [-1, 1]) {
      gg.beginPath();
      gg.moveTo(tr.x + sgn * tr.w * 0.5, tr.base - g.min * 0.02);
      gg.quadraticCurveTo(tr.x + sgn * tr.w * 1.1, tr.base - 2, tr.x + sgn * tr.w * 1.5, tr.base + g.min * 0.012);
      gg.lineTo(tr.x + sgn * tr.w * 0.3, tr.base + 4);
      gg.closePath();
      gg.fill();
    }

    // branches + canopy, swaying as one crown
    gg.save();
    gg.translate(tr.x, tr.base);
    gg.rotate(s * 0.022);
    gg.translate(-tr.x, -tr.base);
    const c = g.canopy;
    gg.strokeStyle = 'rgb(96,72,54)';
    gg.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const f = i / 3;
      const a = lerp(-1.3, 1.1, f) + (g.o === 'portrait' ? 0.5 : -0.6);
      const len = g.min * (0.1 + 0.06 * Math.sin(i * 2.1));
      const x0 = tr.x + bend * 0.7;
      const y0 = lerp(tr.base, tr.top, 0.45 + f * 0.4);
      gg.lineWidth = g.min * (0.02 - f * 0.006);
      gg.beginPath();
      gg.moveTo(x0, y0);
      gg.quadraticCurveTo(x0 + Math.cos(a) * len * 0.6, y0 + Math.sin(a) * len * 0.5, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len * 0.8);
      gg.stroke();
    }
    // foliage: clumps of warm colour, darker underneath
    const clumps = 13;
    for (let pass = 0; pass < 2; pass++) {
      gg.fillStyle = pass === 0 ? 'rgb(150,78,40)' : 'rgb(216,134,50)';
      gg.beginPath();
      for (let i = 0; i < clumps; i++) {
        const a = i * 2.39996;
        const rr = c.r * (0.3 + 0.62 * Math.sqrt(((i * 0.618) % 1)));
        const x = c.x + Math.cos(a) * rr * 0.95;
        const y = c.y + Math.sin(a) * rr * 0.74 + (pass === 0 ? c.r * 0.07 : 0);
        const cr = c.r * (0.22 + 0.16 * Math.abs(Math.sin(i * 1.3)));
        gg.moveTo(x + cr, y);
        gg.arc(x, y, cr, 0, Math.PI * 2);
      }
      gg.fill();
    }
    // sun-struck highlights
    gg.fillStyle = 'rgba(255,206,110,0.42)';
    gg.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = i * 1.9;
      const rr = c.r * (0.35 + 0.4 * ((i * 0.37) % 1));
      const x = c.x + Math.cos(a) * rr * 0.9 - g.shadow.x * c.r * 0.12;
      const y = c.y + Math.sin(a) * rr * 0.7 - c.r * 0.08;
      const cr = c.r * 0.12;
      gg.moveTo(x + cr, y);
      gg.arc(x, y, cr, 0, Math.PI * 2);
    }
    gg.fill();
    gg.restore();
  }

  private drawScene(gg: CanvasRenderingContext2D): void {
    const g = this.geo;
    const buf = this.drawBuf;
    buf.length = 0;
    for (const l of this.leaves) {
      if (l.state === 'pile') continue;
      if (l === this.ch.hatLeaf) continue;
      buf.push(l);
    }
    const key = (l: Leaf): number => (l.z > g.min * 0.02 ? 1e6 + l.y : l.y);
    buf.sort((a, b) => key(a) - key(b));

    const pileKey = g.pile.y + this.pileR() * 0.3;
    const charKey = this.ch.y + this.charScale() * 0.2;
    const inPile = this.ch.on && this.ch.inPile > 0.5;
    let pileDone = !this.pile.length;
    let charDone = !this.ch.on;

    const drawPileGroup = (): void => {
      if (inPile) {
        this.drawMound(gg, 'back');
        this.drawSquirrel(gg);
        this.drawMound(gg, 'front');
        charDone = true;
      } else {
        this.drawMound(gg, 'all');
      }
      pileDone = true;
    };

    for (const l of buf) {
      const k = key(l);
      if (!pileDone && k > pileKey) drawPileGroup();
      if (!charDone && k > charKey && !inPile) {
        this.drawSquirrel(gg);
        charDone = true;
      }
      this.drawLeaf(gg, l);
    }
    if (!pileDone) drawPileGroup();
    if (!charDone) this.drawSquirrel(gg);
  }

  private drawLeaf(gg: CanvasRenderingContext2D, l: Leaf): void {
    const g = this.geo;
    const face = Math.cos(l.flip);
    const af = Math.max(0.12, Math.abs(face));
    const sy = l.y - l.z;

    // cast shadow: as the leaf rises the shadow slides away, shrinks and fades
    // (a big grey oval under a flying leaf just reads as a smudge)
    const high = clamp(l.z / (g.min * 0.26), 0, 1);
    const off = l.z * 0.8 + l.size * 0.2;
    const a = 0.2 * (1 - high) ** 1.7;
    if (a > 0.012) {
      const k = 1 - 0.6 * high;
      gg.fillStyle = `rgba(78,56,40,${a})`;
      gg.beginPath();
      gg.ellipse(
        l.x + g.shadow.x * off,
        l.y + g.shadow.y * off * 0.55,
        l.size * (0.3 + 0.34 * af) * k,
        l.size * 0.22 * k,
        l.rot * 0.3,
        0,
        Math.PI * 2,
      );
      gg.fill();
    }

    const c = face < 0 ? l.under : l.col;
    const litK = 0.06 + 0.16 * (1 - af) + (l.z > 2 ? 0.08 : 0);
    gg.save();
    gg.translate(l.x, sy);
    gg.rotate(l.rot);
    gg.scale(l.size * af, l.size * (1 - l.curl * 0.1));
    const path = shapes()[l.shape];
    gg.fillStyle = `rgb(${(c[0] * (1 - litK) + 255 * litK) | 0},${(c[1] * (1 - litK) + 232 * litK) | 0},${
      (c[2] * (1 - litK) + 176 * litK) | 0
    })`;
    gg.fill(path);
    // curl sheen along one side
    gg.strokeStyle = `rgba(255,238,200,${0.13 + l.curl * 0.12})`;
    gg.lineWidth = 0.22;
    gg.beginPath();
    gg.moveTo(-0.42, 0.42);
    gg.quadraticCurveTo(-0.2, -0.1, 0.06, -0.62);
    gg.stroke();
    // midrib + stem
    gg.strokeStyle = `rgba(${(c[0] * 0.55) | 0},${(c[1] * 0.45) | 0},${(c[2] * 0.42) | 0},0.45)`;
    gg.lineWidth = 0.05;
    gg.beginPath();
    if (l.shape === 0) {
      gg.moveTo(0, 0.6);
      gg.lineTo(0, -0.62);
      gg.moveTo(0, 0.34);
      gg.lineTo(-0.44, -0.2);
      gg.moveTo(0, 0.34);
      gg.lineTo(0.44, -0.2);
    } else if (l.shape === 1) {
      for (let i = -2; i <= 2; i++) {
        gg.moveTo(0, 0.72);
        gg.lineTo(i * 0.26, -0.42);
      }
    } else {
      gg.moveTo(0, 0.72);
      gg.lineTo(0, -0.66);
    }
    gg.stroke();
    gg.strokeStyle = `rgba(${(c[0] * 0.5) | 0},${(c[1] * 0.4) | 0},${(c[2] * 0.36) | 0},0.85)`;
    gg.lineWidth = 0.07;
    gg.beginPath();
    gg.moveTo(0, 0.7);
    gg.lineTo(0, 1.02);
    gg.stroke();
    gg.restore();
  }

  private drawMound(gg: CanvasRenderingContext2D, part: 'all' | 'back' | 'front'): void {
    const g = this.geo;
    const n = this.pile.length;
    if (!n) return;
    const R = this.pileR();
    const H = this.pileH();
    const p = g.pile;

    if (part !== 'front') {
      // long soft shadow on the ground
      gg.save();
      gg.globalCompositeOperation = 'multiply';
      gg.fillStyle = 'rgba(104,78,58,0.3)';
      gg.beginPath();
      gg.ellipse(
        p.x + g.shadow.x * R * 0.85,
        p.y + g.shadow.y * R * 0.45,
        R * 1.25,
        R * 0.42,
        Math.atan2(g.shadow.y * 0.35, g.shadow.x),
        0,
        Math.PI * 2,
      );
      gg.fill();
      gg.restore();

      // the mound itself: soft and puffy
      const grd = gg.createLinearGradient(0, p.y - H, 0, p.y + R * 0.4);
      grd.addColorStop(0, 'rgb(214,144,64)');
      grd.addColorStop(0.5, 'rgb(180,106,50)');
      grd.addColorStop(1, 'rgb(122,72,42)');
      gg.fillStyle = grd;
      gg.beginPath();
      gg.moveTo(p.x - R, p.y);
      const N = 9;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const x = lerp(-R, R, t);
        const k = Math.sqrt(Math.max(0, 1 - (x / R) ** 2));
        const bump = 0.9 + 0.1 * Math.sin(i * 2.3 + n * 0.3);
        gg.lineTo(p.x + x, p.y - H * k * bump - R * 0.06 * k);
      }
      gg.lineTo(p.x + R, p.y);
      gg.ellipse(p.x, p.y, R, R * 0.36, 0, 0, Math.PI);
      gg.closePath();
      gg.fill();
    }

    for (const l of this.pile) {
      if (part === 'back' && l.oy >= 0) continue;
      if (part === 'front' && l.oy < 0) continue;
      this.drawLeaf(gg, l);
    }
  }

  private drawPuffs(gg: CanvasRenderingContext2D): void {
    for (const p of this.puffs) {
      const a = clamp(p.life / p.max, 0, 1);
      gg.fillStyle = `rgba(214,170,110,${0.3 * a})`;
      gg.beginPath();
      gg.arc(p.x, p.y, p.r * (1.6 - a * 0.6), 0, Math.PI * 2);
      gg.fill();
    }
  }

  private drawSquirrel(gg: CanvasRenderingContext2D): void {
    const c = this.ch;
    if (!c.on) return;
    const g = this.geo;
    const s = this.charScale();
    const dir = g.pile.x >= c.x ? 1 : -1;
    const sunk = c.inPile > 0.5 ? -this.pileH() * 0.22 : 0;
    const hop = c.jump > 0 && c.inPile < 0.5 ? 0 : Math.abs(Math.sin(c.t * 7)) * (c.t < 1.45 ? s * 0.14 : 0);
    const x = c.x;
    const y = c.y - hop + sunk;
    const fur: RGB = [176, 110, 62];
    const furD: RGB = [138, 82, 46];
    const belly: RGB = [240, 218, 186];

    gg.save();
    // ground shadow
    if (!sunk) {
      gg.fillStyle = 'rgba(78,56,40,0.28)';
      gg.beginPath();
      gg.ellipse(x + g.shadow.x * s * 0.4, y + g.shadow.y * s * 0.2, s * 1.0, s * 0.3, 0, 0, Math.PI * 2);
      gg.fill();
    }

    // tail: a big comma behind the body
    const tSway = Math.sin(this.t * 3 + c.t) * 0.12 + c.shake * 0.1;
    gg.strokeStyle = rgb(furD);
    gg.lineCap = 'round';
    gg.lineWidth = s * 0.82;
    gg.beginPath();
    gg.moveTo(x - dir * s * 0.55, y - s * 0.35);
    gg.quadraticCurveTo(
      x - dir * s * 1.85,
      y - s * (1.5 + tSway),
      x - dir * s * (1.1 + tSway * 0.5),
      y - s * 2.85,
    );
    gg.stroke();
    gg.strokeStyle = rgb(mix(fur, [255, 226, 186], 0.35));
    gg.lineWidth = s * 0.4;
    gg.stroke();

    // body
    gg.fillStyle = rgb(fur);
    gg.beginPath();
    gg.ellipse(x, y - s * 1.0, s * 0.74, s * 0.98, dir * 0.12, 0, Math.PI * 2);
    gg.fill();
    gg.fillStyle = rgb(belly, 0.85);
    gg.beginPath();
    gg.ellipse(x + dir * s * 0.22, y - s * 0.86, s * 0.42, s * 0.66, dir * 0.1, 0, Math.PI * 2);
    gg.fill();
    // hind foot
    gg.fillStyle = rgb(furD);
    gg.beginPath();
    gg.ellipse(x + dir * s * 0.34, y - s * 0.12, s * 0.36, s * 0.18, 0, 0, Math.PI * 2);
    gg.fill();

    // head
    const hx = x + dir * s * (0.3 + c.look * 0.1) + c.shake * s * 0.2;
    const hy = y - s * 2.15;
    gg.save();
    gg.translate(hx, hy);
    gg.rotate(dir * (0.12 + c.look * 0.18) + c.shake * 0.12);
    gg.scale(dir, 1);
    // ears
    gg.fillStyle = rgb(furD);
    for (const e of [-1, 1]) {
      gg.beginPath();
      gg.ellipse(e * s * 0.34, -s * 0.62, s * 0.2, s * 0.3, e * 0.3, 0, Math.PI * 2);
      gg.fill();
    }
    gg.fillStyle = rgb(fur);
    gg.beginPath();
    gg.arc(0, 0, s * 0.66, 0, Math.PI * 2);
    gg.fill();
    // muzzle
    gg.fillStyle = rgb(belly, 0.95);
    gg.beginPath();
    gg.ellipse(s * 0.34, s * 0.22, s * 0.32, s * 0.24, 0, 0, Math.PI * 2);
    gg.fill();
    gg.fillStyle = 'rgb(72,46,38)';
    gg.beginPath();
    gg.ellipse(s * 0.6, s * 0.12, s * 0.1, s * 0.08, 0, 0, Math.PI * 2);
    gg.fill();
    // eye
    const blink = c.blink > 0 ? 1 : 0;
    if (blink) {
      gg.strokeStyle = 'rgb(48,32,28)';
      gg.lineWidth = s * 0.08;
      gg.beginPath();
      gg.moveTo(s * 0.12, -s * 0.1);
      gg.lineTo(s * 0.42, -s * 0.1);
      gg.stroke();
    } else {
      gg.fillStyle = 'rgb(38,26,24)';
      gg.beginPath();
      gg.ellipse(s * 0.28, -s * 0.12, s * 0.15, s * 0.17, 0, 0, Math.PI * 2);
      gg.fill();
      gg.fillStyle = 'rgba(255,255,255,0.9)';
      gg.beginPath();
      gg.arc(s * 0.33, -s * 0.18, s * 0.05, 0, Math.PI * 2);
      gg.fill();
    }
    gg.restore();

    // front paws
    gg.fillStyle = rgb(furD);
    for (const f of [-1, 1]) {
      gg.beginPath();
      gg.ellipse(x + dir * s * 0.52, y - s * (1.05 + f * 0.24), s * 0.2, s * 0.14, dir * 0.4, 0, Math.PI * 2);
      gg.fill();
    }
    gg.restore();

    // the leaf that landed on its head rides along
    if (c.hatLeaf) this.drawLeaf(gg, c.hatLeaf);
  }

  private drawForeground(gg: CanvasRenderingContext2D): void {
    const g = this.geo;
    const par = (this.camZ - 1) * 90;
    for (const b of this.fgBits) {
      gg.save();
      gg.translate(b.x + this.sway(b.rot) * 2, b.y + par * 1.6);
      gg.rotate(b.rot + this.sway(b.rot) * 0.03);
      gg.scale(b.s, b.s);
      gg.fillStyle = rgb(b.col, 0.9);
      gg.fill(shapes()[b.shape]);
      gg.restore();
    }
    // a couple of dark grass tufts right at the camera
    gg.strokeStyle = 'rgba(56,54,34,0.55)';
    gg.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const x = ((i * 0.37) % 1) * g.w;
      const len = g.min * (0.07 + 0.05 * Math.sin(i * 2.1));
      const s = this.sway(i) * 0.7;
      gg.lineWidth = g.min * 0.009;
      gg.beginPath();
      gg.moveTo(x, g.h + 8 + par * 1.6);
      gg.quadraticCurveTo(x + s * len * 0.5, g.h - len * 0.6 + par * 1.6, x + s * len * 1.4, g.h - len + par * 1.6);
      gg.stroke();
    }
  }

  private drawLight(gg: CanvasRenderingContext2D): void {
    const g = this.geo;
    const s = g.sun;
    gg.save();
    gg.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const spread = 0.1 + i * 0.09;
      const grd = gg.createLinearGradient(s.x, s.y, s.x - g.shadow.x * g.w * 0.2, g.h);
      grd.addColorStop(0, `rgba(255,222,158,${0.032 - i * 0.008})`);
      grd.addColorStop(1, 'rgba(255,206,132,0)');
      gg.fillStyle = grd;
      gg.beginPath();
      gg.moveTo(s.x - g.w * spread * 0.2, s.y);
      gg.lineTo(s.x + g.w * spread * 0.2, s.y);
      gg.lineTo(s.x + g.w * spread * 1.6 + g.shadow.x * g.w * 0.3, g.h + 20);
      gg.lineTo(s.x - g.w * spread * 1.6 + g.shadow.x * g.w * 0.3, g.h + 20);
      gg.closePath();
      gg.fill();
    }
    gg.restore();
    // warm haze down low + vignette
    const v = gg.createRadialGradient(g.w / 2, g.h * 0.52, g.min * 0.34, g.w / 2, g.h * 0.52, Math.max(g.w, g.h) * 0.76);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(38,20,8,0.3)');
    gg.fillStyle = v;
    gg.fillRect(-24, -24, g.w + 48, g.h + 48);
  }

  // ------------------------------------------------------------ input

  pointer(e: PointerEvt): void {
    if (e.type === 'down') {
      this.down = true;
      this.ptX = e.x;
      this.ptY = e.y;
      this.prevX = e.x;
      this.prevY = e.y;
      const l = this.pickAir(e.x, e.y);
      if (l) this.grab(l);
      else this.applyHold(1);
      return;
    }
    if (e.type === 'move') {
      this.prevX = this.ptX;
      this.prevY = this.ptY;
      this.ptX = e.x;
      this.ptY = e.y;
      if (!this.held) this.sweep(this.prevX, this.prevY, e.x, e.y, Math.hypot(e.vx, e.vy));
      return;
    }
    // up
    this.down = false;
    this.ptX = e.x;
    this.ptY = e.y;
    if (this.held) {
      const l = this.held;
      this.held = null;
      l.state = 'air';
      l.vx = clamp(e.vx, -1400, 1400) * 0.4;
      l.vy = clamp(e.vy, -1400, 1400) * 0.4;
      l.vz = 0;
      l.spin = clamp(e.vx, -900, 900) * 0.004;
      l.flipV = this.rng.range(-3, 3);
      l.sway = this.rng.range(0, 6.28);
      return;
    }
    if (this.ctx.phase.is('comic', 'settle') && e.travel < this.geo.min * 0.04 && e.age < 0.5) {
      this.leave();
    }
  }

  private pickAir(x: number, y: number): Leaf | null {
    let best: Leaf | null = null;
    let bd = 1e9;
    for (const l of this.leaves) {
      if (l.state !== 'air' && l.state !== 'stuck') continue;
      if (l.state === 'stuck' && l.stickTo === 2) continue;
      const d = Math.hypot(x - l.x, y - (l.y - l.z));
      if (d < bd) {
        bd = d;
        best = l;
      }
    }
    return bd < this.geo.min * 0.1 ? best : null;
  }

  private grab(l: Leaf): void {
    if (l.state === 'pile') this.leavePile(l);
    l.state = 'held';
    l.stickTo = 0;
    l.z = this.geo.min * 0.05;
    l.spin = 0;
    this.held = l;
    this.ctx.audio.drop(2.2);
  }

  /** press-and-hold: the leaves under the finger stay put through the gust */
  private applyHold(k: number): void {
    const R = this.geo.min * 0.17;
    for (const l of this.pile) {
      const q = this.pilePos(l);
      const d = Math.hypot(this.ptX - q.x, (this.ptY - (q.y - q.z)) / 0.8);
      if (d < R) l.hold = Math.max(l.hold, k * clamp(1.3 - d / R, 0, 1));
    }
  }

  /** broom stroke: leaves inside the radius are shoved ahead of the finger */
  private sweep(x0: number, y0: number, x1: number, y1: number, speed: number): void {
    const g = this.geo;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    this.applyHold(1);
    if (d < 0.02) return;
    const ux = dx / d;
    const uy = dy / d;
    const R = g.min * 0.135;
    const power = clamp(speed, g.min * 0.3, g.min * 5);
    for (const l of this.leaves) {
      if (l.state === 'held' || l.state === 'pile' || l.state === 'stuck') continue;
      const px = l.x;
      const py = l.y - l.z * 0.5;
      let t = ((px - x0) * dx + (py - y0) * dy) / (d * d);
      t = clamp(t, 0, 1);
      const cx = x0 + dx * t;
      const cy = y0 + dy * t;
      const dist = Math.hypot(px - cx, py - cy);
      if (dist > R + l.size) continue;
      const fall = clamp(1 - dist / (R + l.size), 0, 1);
      l.vx += ux * power * 0.62 * fall;
      l.vy += uy * power * 0.62 * fall;
      const cross = (px - cx) * uy - (py - cy) * ux;
      l.spin += Math.sign(cross) * fall * (3 + power / g.min);
      // the broom edge: anything behind the finger gets carried forward
      const ahead = (px - x1) * ux + (py - y1) * uy;
      if (ahead < 0) {
        const s = Math.min(-ahead, d) * 0.85 * fall;
        l.x += ux * s;
        l.y += uy * s;
      }
      if (l.z <= 0 && power > g.min * 1.1 && this.rng.next() < 0.22) {
        l.vz = g.min * this.rng.range(0.03, 0.14);
        l.flipV = this.rng.range(-6, 6);
      }
      l.rest = 0;
      l.x = clamp(l.x, g.min * 0.02, g.w - g.min * 0.02);
      l.y = clamp(l.y, g.groundTop + g.min * 0.02, g.h - g.min * 0.03);
    }
  }

  // ------------------------------------------------------------ dev

  readonly devActions: DevAction[] = [
    {
      name: 'pile:build',
      run: () => {
        this.buildPile(0.88);
        if (this.ctx.phase.is('establish')) this.advance('action');
      },
    },
    {
      name: 'wind:gust',
      run: () => {
        this.waves.push({ t0: this.waveClock + 0.05, dur: 2.2, peak: 1, fired: false });
        this.breezeT = Math.max(this.breezeT, 0.5);
      },
    },
    {
      name: 'wind:stop',
      run: () => {
        this.waves = [];
        this.gust = 0;
        this.vortex = null;
        this.breezeT = 0.1;
      },
    },
    { name: 'leaf:drift', run: () => this.dropOneFromTree() },
    {
      name: 'critter:in',
      run: () => {
        this.ending = this.pileFrac() > 0.42 ? 'held' : 'scattered';
        this.advance('comic');
      },
    },
    {
      name: 'demo:mid-drag',
      run: () => {
        // a finger halfway through a stroke, a wave of leaves rolling ahead of it
        this.buildPile(0.3);
        const g = this.geo;
        const to = { x: g.pile.x, y: g.pile.y };
        const from =
          g.o === 'portrait'
            ? { x: g.pile.x - g.scatter.rx * 0.95, y: g.pile.y + g.scatter.ry * 0.7 }
            : { x: g.pile.x - g.scatter.rx * 1.05, y: g.pile.y + g.scatter.ry * 0.5 };
        // pull a handful of loose leaves into the path of the stroke
        const loose = this.leaves.filter((l) => l.state === 'ground').slice(0, 16);
        loose.forEach((l, i) => {
          const t = 0.12 + (i % 6) * 0.06;
          const off = (Math.floor(i / 6) - 1) * g.min * 0.075;
          l.x = lerp(from.x, to.x, t) + off * 0.6 + this.rng.range(-8, 8);
          l.y = lerp(from.y, to.y, t) + off + this.rng.range(-8, 8);
          l.vx = 0;
          l.vy = 0;
          l.z = 0;
        });
        this.down = true;
        this.ptX = from.x;
        this.ptY = from.y;
        const steps = 34;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const nx = lerp(from.x, to.x, t * 0.62);
          const ny = lerp(from.y, to.y, t * 0.62);
          this.sweep(this.ptX, this.ptY, nx, ny, g.min * 1.9);
          this.ptX = nx;
          this.ptY = ny;
          for (const l of this.leaves) this.stepLeaf(l, 1 / 120);
        }

        // ---- pose the moment so a still frame reads as "being pushed NOW" ----
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dl = Math.hypot(dx, dy) || 1;
        const ux = dx / dl;
        const uy = dy / dl;
        const nxv = -uy; // across the stroke
        const nyv = ux;
        const R = g.min * 0.3;
        // a crescent of leaves bowed ahead of the finger, mid-tumble
        const bow = this.leaves
          .filter((l) => (l.state === 'ground' || l.state === 'air') && !loose.includes(l))
          .slice(0, 15);
        bow.forEach((l, i) => {
          const s2 = (i / (bow.length - 1)) * 2 - 1; // -1..1 across the crescent
          const ahead = R * (0.5 + 0.62 * (1 - s2 * s2)); // bowed forward in the middle
          const side = s2 * R * 1.15;
          l.state = 'air';
          l.x = clamp(this.ptX + ux * ahead + nxv * side, g.min * 0.07, g.w - g.min * 0.07);
          l.y = clamp(this.ptY + uy * ahead + nyv * side * 0.55, g.groundTop + g.min * 0.12, g.h - g.min * 0.08);
          l.z = (0.3 + 0.7 * (1 - Math.abs(s2))) * g.min * 0.12 + this.rng.range(0, g.min * 0.03);
          const kick = g.min * (0.5 + 0.5 * (1 - Math.abs(s2)));
          l.vx = ux * kick + this.rng.range(-0.1, 0.1) * g.min;
          l.vy = uy * kick * 0.6 + this.rng.range(-0.08, 0.08) * g.min;
          l.vz = g.min * this.rng.range(0.15, 0.6) * (1 - Math.abs(s2) * 0.6);
          l.spin = this.rng.range(-9, 9);
          l.flipV = this.rng.range(-10, 10);
          l.rot += this.rng.range(-1, 1);
        });
        // and a small puff of dust kicked up right at the finger
        for (let i = 0; i < 14; i++) {
          const sp = this.rng.range(0.1, 0.5);
          this.puffs.push({
            x: this.ptX + nxv * this.rng.range(-0.5, 0.5) * R * 0.7 - ux * R * 0.15,
            y: this.ptY + nyv * this.rng.range(-0.5, 0.5) * R * 0.4,
            vx: ux * g.min * sp + this.rng.range(-0.1, 0.1) * g.min,
            vy: -this.rng.range(0.05, 0.3) * g.min,
            life: this.rng.range(0.55, 0.95),
            max: 1,
            r: g.min * this.rng.range(0.03, 0.07),
          });
        }
      },
    },
    {
      name: 'fail:scattered',
      run: () => {
        // the pile went up entirely: leaves over the whole park
        this.ctx.phase.set('trouble');
        this.ctx.phase.intervening = true;
        this.scatterAll();
        const g = this.geo;
        this.breeze = this.breezeT = 0.7;
        this.swayAmp = 1.3;
        this.waves = [{ t0: this.waveClock - 0.7, dur: 3.6, peak: 1, fired: true }];
        this.spawnVortex();
        if (this.vortex) {
          this.vortex.x = g.pile.x;
          this.vortex.y = g.pile.y - g.min * 0.05;
          this.vortex.vx *= 0.35;
          this.vortex.vy *= 0.35;
        }
        this.leaves.forEach((l, i) => {
          if (i % 5 === 0) return; // a few stay down, skittering
          const a = this.rng.range(0, Math.PI * 2);
          const rr = this.rng.range(0.1, 1.15);
          l.x = clamp(g.pile.x + Math.cos(a) * g.min * 0.6 * rr, -10, g.w + 10);
          l.y = clamp(g.pile.y + Math.sin(a) * g.min * 0.34 * rr, g.groundTop, g.h);
          l.z = g.min * this.rng.range(0.02, 0.62);
          l.vx = Math.cos(a) * g.min * this.rng.range(0.2, 0.7) + g.wind.x * g.min * 0.4;
          l.vy = Math.sin(a) * g.min * this.rng.range(0.1, 0.3) + g.wind.y * g.min * 0.25;
          l.vz = g.min * this.rng.range(-0.1, 0.45);
          l.spin = this.rng.range(-8, 8);
          l.flipV = this.rng.range(-9, 9);
          l.sway = this.rng.range(0, 6.28);
          l.state = 'air';
        });
        // a couple caught on the fence
        for (let i = 0; i < 3; i++) {
          const l = this.leaves[i * 7 + 2];
          l.state = 'stuck';
          l.stickTo = 1;
          l.stickT = 5;
          l.x = g.w * (0.2 + i * 0.28);
          l.y = g.groundTop - g.min * this.rng.range(0.02, 0.06);
          l.z = 0;
          l.vx = l.vy = l.vz = 0;
        }
        this.ending = 'scattered';
      },
    },
    {
      name: 'fail:on-head',
      run: () => {
        this.devActions.find((a) => a.name === 'fail:scattered')?.run();
        for (const l of this.leaves) {
          if (l.state !== 'air') continue;
          l.z = 0;
          l.vx = l.vy = l.vz = 0;
          l.state = 'ground';
        }
        this.waves = [];
        this.gust = 0;
        this.vortex = null;
        this.breeze = this.breezeT = 0.12;
        this.ctx.phase.set('comic');
        this.ctx.phase.intervening = false;
        this.ending = 'scattered';
        this.ch.on = true;
        this.ch.t = 2.2;
        this.ch.look = 1;
        this.ch.x = this.geo.charTo.x;
        this.ch.y = this.geo.charTo.y;
        this.ch.blink = 0.001;
        this.ch.blinkT = 0.5;
        const l = this.leaves[3];
        this.stickToHead(l);
      },
    },
  ];

  devState(): Record<string, unknown> {
    const air = this.leaves.filter((l) => l.state === 'air').length;
    return {
      phase: this.ctx.phase.name,
      phaseT: +this.ctx.phase.t.toFixed(2),
      intervening: this.ctx.phase.intervening,
      seed: this.rng.seed,
      orientation: this.geo?.o,
      leaves: LEAF_N,
      pile: this.pile.length,
      pileFrac: +this.pileFrac().toFixed(2),
      air,
      stuck: this.leaves.filter((l) => l.state === 'stuck').length,
      held: this.held ? 1 : 0,
      holding: this.pile.filter((l) => l.hold > 0.35).length,
      breeze: +this.breeze.toFixed(2),
      gust: +this.gust.toFixed(2),
      swayAmp: +this.swayAmp.toFixed(2),
      vortex: this.vortex ? { x: Math.round(this.vortex.x), y: Math.round(this.vortex.y), k: +this.vortex.k.toFixed(2) } : null,
      waves: this.waves.length,
      waveClock: +this.waveClock.toFixed(2),
      loops: this.loops,
      ending: this.ending,
      critter: this.ch.on ? { t: +this.ch.t.toFixed(2), inPile: +this.ch.inPile.toFixed(2), hat: !!this.ch.hatLeaf } : null,
    };
  }

  // ------------------------------------------------------------ hub tile

  thumbnail(gg: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    const min = Math.min(w, h);
    const sky = gg.createLinearGradient(0, 0, 0, h * 0.58);
    sky.addColorStop(0, 'rgb(120,158,192)');
    sky.addColorStop(0.55, 'rgb(206,198,180)');
    sky.addColorStop(1, 'rgb(250,218,160)');
    gg.fillStyle = sky;
    gg.fillRect(0, 0, w, h);
    gg.fillStyle = 'rgba(255,246,214,0.95)';
    gg.beginPath();
    gg.arc(w * 0.26, h * 0.41, min * 0.075, 0, Math.PI * 2);
    gg.fill();

    // hedge
    gg.fillStyle = 'rgb(84,96,62)';
    gg.beginPath();
    for (let i = -1; i < 9; i++) {
      const x = (i / 8) * w + min * 0.03;
      gg.moveTo(x + min * 0.09, h * 0.5);
      gg.arc(x, h * 0.5, min * 0.09, 0, Math.PI * 2);
    }
    gg.fill();
    gg.fillRect(0, h * 0.5, w, h * 0.06);

    // ground
    const ground = gg.createLinearGradient(0, h * 0.55, 0, h);
    ground.addColorStop(0, 'rgb(198,170,130)');
    ground.addColorStop(1, 'rgb(216,186,144)');
    gg.fillStyle = ground;
    gg.fillRect(0, h * 0.55, w, h * 0.45);

    // the tree at the left edge, swaying
    const swayT = Math.sin(t * 1.15) * 0.6 + Math.sin(t * 0.47 + 1) * 0.4;
    gg.fillStyle = 'rgb(112,80,56)';
    gg.fillRect(w * 0.05, h * 0.12, w * 0.05, h * 0.45);
    gg.save();
    gg.translate(w * 0.075, h * 0.56);
    gg.rotate(swayT * 0.014);
    gg.translate(-w * 0.075, -h * 0.56);
    for (let pass = 0; pass < 2; pass++) {
      gg.fillStyle = pass === 0 ? 'rgb(150,78,40)' : 'rgb(214,132,50)';
      gg.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = i * 2.39996;
        const rr = min * (0.06 + 0.11 * ((i * 0.618) % 1));
        const cx = w * 0.06 + Math.cos(a) * rr;
        const cy = h * 0.12 + Math.sin(a) * rr * 0.8 + (pass === 0 ? min * 0.02 : 0);
        gg.moveTo(cx + min * 0.11, cy);
        gg.arc(cx, cy, min * 0.11, 0, Math.PI * 2);
      }
      gg.fill();
    }
    gg.restore();

    // the mound, and a gust that takes a few leaves off the top every loop
    const cycle = (t * 0.4) % 3;
    const blow = clamp((cycle - 1.9) * 2.6, 0, 1) * clamp((3 - cycle) * 2.4, 0, 1);
    const R = min * (0.25 - blow * 0.05);
    const H = R * 0.7;
    const px = w * 0.58;
    const py = h * 0.8;
    gg.fillStyle = 'rgba(104,78,58,0.26)';
    gg.beginPath();
    gg.ellipse(px + R * 0.55, py + R * 0.06, R * 1.15, R * 0.3, 0, 0, Math.PI * 2);
    gg.fill();
    const mg = gg.createLinearGradient(0, py - H, 0, py + R * 0.2);
    mg.addColorStop(0, 'rgb(220,152,68)');
    mg.addColorStop(1, 'rgb(126,74,42)');
    gg.fillStyle = mg;
    gg.beginPath();
    gg.moveTo(px - R, py);
    for (let i = 0; i <= 8; i++) {
      const x = lerp(-R, R, i / 8);
      const k = Math.sqrt(Math.max(0, 1 - (x / R) ** 2));
      gg.lineTo(px + x, py - H * k * (0.9 + 0.1 * Math.sin(i * 2.3)));
    }
    gg.lineTo(px + R, py);
    gg.closePath();
    gg.fill();

    const sp = shapes();
    const leaf = (x: number, y: number, size: number, rot: number, flip: number, ci: number): void => {
      gg.save();
      gg.translate(x, y);
      gg.rotate(rot);
      gg.scale(size * Math.max(0.15, Math.abs(Math.cos(flip))), size);
      gg.fillStyle = rgb(LEAF_COLS[ci % LEAF_COLS.length]);
      gg.fill(sp[ci % 3]);
      gg.restore();
    };
    // leaves resting on the mound
    for (let i = 0; i < 9; i++) {
      const a = i * 2.39996 + 0.7;
      const u = (i + 0.5) / 9;
      const rr = R * Math.sqrt(1 - u * 0.9) * 0.8;
      leaf(px + Math.cos(a) * rr, py + Math.sin(a) * rr * 0.4 - u * H, min * 0.068, a * 1.7, 0.3, i);
    }
    // three leaves lifting away on the gust
    for (let i = 0; i < 3; i++) {
      const ph = clamp((cycle - 1.9 - i * 0.12) / 1.0, 0, 1);
      if (ph <= 0 || ph >= 1) continue;
      const x = px + lerp(-R * 0.2, R * 2.4, ph) + Math.sin(ph * 9 + i) * min * 0.03;
      const y = py - H - Math.sin(Math.PI * ph) * min * 0.34 - ph * min * 0.05;
      leaf(x, y, min * 0.068, ph * 7 + i, ph * 9 + i, i + 3);
    }
    gg.fillStyle = 'rgba(38,20,8,0.07)';
    gg.fillRect(0, 0, w, h);
  }
}

export const episode: Episode = new Leaves();
