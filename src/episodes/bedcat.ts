/**
 * B. ベッドと猫 — bedcat.
 *
 * Morning light through a window. A rumpled bed. Stroke the sheet flat with a
 * finger, drag the pillow to the head, pat it twice — and hold the little
 * pause where it looks perfect. Then two ears come up in the doorway.
 *
 * The cat always wins. You can carry it off the bed (it goes long and limp,
 * paws dangling) and drop it on the floor, the stool or its basket — it shakes
 * itself off, sits, and strolls back to a *different* spot. Leave it alone and
 * it stretches and rolls belly-up, which crumples the sheet all over again.
 *
 * Episode-specific code on purpose: the wrinkle field, the fur and the cat's
 * pose solver only exist here.
 */
import type { DevAction, Episode, EpisodeCtx } from '../core/episode';
import type { PointerEvt } from '../core/input';
import type { Orientation } from '../core/layout';
import type { PhaseName } from '../core/phase';
import { makeNoise1d, Rng } from '../core/rng';

// ---------------------------------------------------------------- helpers

type RGB = [number, number, number];
interface Pt {
  x: number;
  y: number;
}

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
// ---------------------------------------------------------------- world

/** wrinkle field resolution across (u) and along (v) the bed */
const NU = 21;
const NV = 15;

interface Geo {
  w: number;
  h: number;
  o: Orientation;
  floorY: number;
  /** bed top quad, head (far) edge and foot (near) edge */
  hl: Pt;
  hr: Pt;
  fl: Pt;
  fr: Pt;
  /** mattress crown, in px */
  crown: number;
  bedH: number; // mattress thickness on screen
  headboard: { x: number; y: number; w: number; h: number };
  door: { x: number; y: number; w: number; h: number };
  win: { x: number; y: number; w: number; h: number };
  basket: { x: number; y: number; rx: number; ry: number };
  stool: { x: number; y: number; rx: number; ry: number };
  rug: { x: number; y: number; rx: number; ry: number };
  /** deep in the dark hall, where the ears come up first */
  doorInside: Pt;
  /** where the cat steps out of the doorway (ground point) */
  doorExit: Pt;
  /** the sweep of the sprint, through the foreground */
  runMid: Pt;
  /** where it crouches before the pounce (ground point) */
  launch: Pt;
  unit: number; // cat body half-length at scale 1
}

interface Wave {
  u: number;
  v: number;
  t: number;
  amp: number;
  speed: number;
  width: number;
  life: number;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
  spin: number;
}

type PillowState = 'floor' | 'held' | 'bed';

interface Pillow {
  state: PillowState;
  /** on the bed */
  u: number;
  v: number;
  /** off the bed (screen) */
  x: number;
  y: number;
  /** the floor line it rests on when off the bed */
  restY: number;
  squishX: number;
  squishY: number;
  vy: number;
  rot: number;
  rotV: number;
  grabDX: number;
  grabDY: number;
  was: { state: PillowState; u: number; v: number; x: number; y: number };
}

type CatMode =
  | 'hidden'
  | 'peek'
  | 'crouch'
  | 'sprint'
  | 'leap'
  | 'land'
  | 'spin'
  | 'curl'
  | 'held'
  | 'fall'
  | 'shake'
  | 'sit'
  | 'walk'
  | 'hop'
  | 'look'
  | 'stretch'
  | 'belly';

interface TailNode {
  x: number;
  y: number;
  px: number;
  py: number;
}

interface Cat {
  mode: CatMode;
  mt: number; // seconds in mode
  /** ground anchor (screen) */
  x: number;
  y: number;
  /** height above the anchor */
  z: number;
  scale: number;
  facing: -1 | 1;
  /** blend factors */
  curl: number;
  limp: number;
  belly: number;
  crouch: number;
  /** squash & stretch */
  sx: number;
  sy: number;
  spin: number; // radians
  legPhase: number;
  speed: number; // px/s, drives the legs and the blur
  earUp: number;
  eyeOpen: number;
  blinkT: number;
  pupilX: number;
  pupilY: number;
  tailFlick: number;
  knead: number;
  purr: number;
  /** when settled on the bed */
  onBed: boolean;
  bedU: number;
  bedV: number;
  /** where it is going */
  ax: number;
  ay: number;
  bx: number;
  by: number;
  grabDX: number;
  grabDY: number;
  waitFor: number;
  fallV: number;
  tail: TailNode[];
  trail: Array<{ x: number; y: number; z: number; s: number; a: number }>;
  seat: 'floor' | 'basket' | 'stool';
}

// palette ---------------------------------------------------------------

const FUR: RGB = [236, 168, 96];
const FUR_DARK: RGB = [196, 122, 58];
const FUR_LIGHT: RGB = [252, 224, 176];
const SHEET: RGB = [238, 235, 229];
const SHEET_SHADE: RGB = [178, 178, 186];
const BLANKET: RGB = [128, 164, 186];

// ---------------------------------------------------------------- episode

class BedCat implements Episode {
  readonly id = 'bedcat';
  readonly title = 'B. ベッドと猫 / bedcat';

  private ctx!: EpisodeCtx;
  private rng = new Rng(2);
  private noise = makeNoise1d(2);
  private geo!: Geo;

  private t = 0;
  private fade = 1;
  private fadeOut = false;

  // sheet
  private grid = new Float32Array(NU * NV);
  private waves: Wave[] = [];
  private tuck = 0; // 0 loose hem, 1 tucked in

  // props
  private pillow!: Pillow;
  private cat!: Cat;
  private motes: Mote[] = [];
  private beamMotes: Mote[] = [];

  // beats
  private pats = 0;
  private patT = -1;
  private patU = 0.5;
  private patV = 0.6;
  private admire = -1;
  private done = false;
  private spotIndex = 0;
  private lastSmoothU = 0.34;
  private lastSmoothV = 0.66;
  private comicT = 0;
  private idle = 0;
  private stepT = 0;
  private shh = 0;

  // camera
  private camZ = 1;
  private camZT = 1;
  private camY = 0;
  private camYT = 0;
  private shake = 0;
  private warm = 0;

  // pointer
  private px = 0;
  private py = 0;
  /** 1 while the cat is still a shape in the dark hall */
  private sil = 0;
  private hasPointer = false;
  private stroking = false;
  private strokeT = 0;
  private strokeDist = 0;
  private heldCat = false;
  private heldPillow = false;
  /** the child picked the cat up at least once this lap */
  private catMoved = false;

  // ------------------------------------------------------------- setup

  init(ctx: EpisodeCtx): void {
    this.ctx = ctx;
    this.rng = ctx.rng;
    this.rng.reset();
    this.noise = makeNoise1d(this.rng.seed ^ 0x2f31);
    this.t = 0;
    this.fade = 1;
    this.fadeOut = false;
    this.motes = [];
    this.beamMotes = [];
    this.waves = [];
    this.pillow = {
      state: 'floor',
      u: 0.5,
      v: 0.16,
      x: 0,
      y: 0,
      restY: 0,
      squishX: 1,
      squishY: 1,
      vy: 0,
      rot: -0.24,
      rotV: 0,
      grabDX: 0,
      grabDY: 0,
      was: { state: 'floor', u: 0.5, v: 0.16, x: 0, y: 0 },
    };
    this.cat = this.makeCat();
    if (this.geo) this.seedBeamMotes();
    this.enterPhase('establish');
  }

  private makeCat(): Cat {
    const tail: TailNode[] = [];
    for (let i = 0; i < 5; i++) tail.push({ x: 0, y: 0, px: 0, py: 0 });
    return {
      mode: 'hidden',
      mt: 0,
      x: 0,
      y: 0,
      z: 0,
      scale: 1,
      facing: -1,
      curl: 0,
      limp: 0,
      belly: 0,
      crouch: 0,
      sx: 1,
      sy: 1,
      spin: 0,
      legPhase: 0,
      speed: 0,
      earUp: 1,
      eyeOpen: 1,
      blinkT: 2.5,
      pupilX: 0,
      pupilY: 0,
      tailFlick: 0,
      knead: 0,
      purr: 0,
      onBed: false,
      bedU: 0.5,
      bedV: 0.52,
      ax: 0,
      ay: 0,
      bx: 0,
      by: 0,
      grabDX: 0,
      grabDY: 0,
      waitFor: 2,
      fallV: 0,
      tail,
      trail: [],
      seat: 'floor',
    };
  }

  layout(o: Orientation, w: number, h: number): void {
    const prev = this.geo;
    const g = {} as Geo;
    g.w = w;
    g.h = h;
    g.o = o;
    g.unit = Math.min(w, h) * 0.082;

    if (o === 'portrait') {
      // back wall on top, the bed fills the width of the lower-middle,
      // doorway (cat origin) top-right, basket bottom-left in the foreground.
      g.floorY = h * 0.405;
      g.hl = { x: w * 0.135, y: h * 0.525 };
      g.hr = { x: w * 0.865, y: h * 0.525 };
      g.fl = { x: w * 0.015, y: h * 0.795 };
      g.fr = { x: w * 0.985, y: h * 0.795 };
      g.crown = h * 0.02;
      g.bedH = h * 0.032;
      g.headboard = { x: w * 0.185, y: h * 0.405, w: w * 0.6, h: h * 0.115 };
      g.door = { x: w * 0.705, y: h * 0.075, w: w * 0.265, h: h * 0.33 };
      g.win = { x: w * 0.055, y: h * 0.075, w: w * 0.33, h: h * 0.205 };
      g.basket = { x: w * 0.185, y: h * 0.925, rx: w * 0.145, ry: h * 0.033 };
      g.stool = { x: w * 0.845, y: h * 0.925, rx: w * 0.1, ry: h * 0.022 };
      g.rug = { x: w * 0.5, y: h * 0.918, rx: w * 0.47, ry: h * 0.058 };
      g.doorInside = { x: w * 0.885, y: h * 0.4 };
      g.doorExit = { x: w * 0.875, y: h * 0.475 };
      g.runMid = { x: w * 1.03, y: h * 0.85 };
      g.launch = { x: w * 0.44, y: h * 0.935 };
    } else {
      // bed centre-right, doorway far left, basket lower-left: short carry
      g.floorY = h * 0.34;
      g.hl = { x: w * 0.44, y: h * 0.435 };
      g.hr = { x: w * 0.9, y: h * 0.435 };
      g.fl = { x: w * 0.345, y: h * 0.875 };
      g.fr = { x: w * 1.0, y: h * 0.875 };
      g.crown = h * 0.042;
      g.bedH = h * 0.045;
      g.headboard = { x: w * 0.465, y: h * 0.235, w: w * 0.41, h: h * 0.2 };
      g.door = { x: w * 0.02, y: h * 0.0, w: w * 0.125, h: h * 0.34 };
      g.win = { x: w * 0.175, y: h * 0.03, w: w * 0.135, h: h * 0.2 };
      g.basket = { x: w * 0.135, y: h * 0.87, rx: w * 0.075, ry: h * 0.042 };
      g.stool = { x: w * 0.055, y: h * 0.66, rx: w * 0.045, ry: h * 0.026 };
      g.rug = { x: w * 0.21, y: h * 0.84, rx: w * 0.235, ry: h * 0.125 };
      g.doorInside = { x: w * 0.06, y: h * 0.335 };
      g.doorExit = { x: w * 0.135, y: h * 0.4 };
      g.runMid = { x: w * 0.04, y: h * 0.62 };
      g.launch = { x: w * 0.235, y: h * 0.78 };
    }

    this.geo = g;
    this.seedBeamMotes();

    if (!this.pillow || !this.cat) return; // layout can run before init()

    if (prev) {
      // keep relative placement across a rotation
      if (this.pillow.state !== 'bed') {
        this.pillow.x = (this.pillow.x / prev.w) * w;
        this.pillow.y = this.remapFloorY(this.pillow.y, prev, g);
        this.pillow.restY = this.remapFloorY(this.pillow.restY, prev, g);
      }
      if (!this.cat.onBed) {
        this.cat.x = (this.cat.x / prev.w) * w;
        this.cat.y = this.remapFloorY(this.cat.y, prev, g);
        this.cat.ax = (this.cat.ax / prev.w) * w;
        this.cat.ay = this.remapFloorY(this.cat.ay, prev, g);
        this.cat.bx = (this.cat.bx / prev.w) * w;
        this.cat.by = this.remapFloorY(this.cat.by, prev, g);
      }
      this.resetTail();
    } else {
      this.pillow.x = g.o === 'portrait' ? g.w * 0.6 : g.w * 0.28;
      this.pillow.y = g.o === 'portrait' ? g.h * 0.895 : g.h * 0.7;
      this.pillow.restY = this.pillow.y;
    }
    this.placeSettled();
  }

  private remapFloorY(y: number, a: Geo, b: Geo): number {
    const f = (y - a.floorY) / Math.max(1, a.h - a.floorY);
    return b.floorY + f * (b.h - b.floorY);
  }

  private seedBeamMotes(): void {
    this.beamMotes = [];
    const { w, h } = this.geo;
    for (let i = 0; i < 26; i++) {
      this.beamMotes.push({
        x: this.rng.range(0, w),
        y: this.rng.range(this.geo.win.y, h * 0.92),
        vx: this.rng.range(-4, 6),
        vy: this.rng.range(-5, 5),
        r: this.rng.range(0.8, 2.3),
        life: 1,
        max: 1,
        spin: this.rng.range(0, 6.3),
      });
    }
  }

  // ------------------------------------------------------------- bed maths

  /** point on the mattress surface for (u across, v head→foot) */
  private surf(u: number, v: number): Pt {
    const g = this.geo;
    const xl = lerp(g.hl.x, g.fl.x, v);
    const xr = lerp(g.hr.x, g.fr.x, v);
    const yl = lerp(g.hl.y, g.fl.y, v);
    const yr = lerp(g.hr.y, g.fr.y, v);
    const x = lerp(xl, xr, u);
    let y = lerp(yl, yr, u);
    y -= g.crown * Math.sin(Math.PI * clamp(u, 0, 1)) * (0.45 + 0.55 * v);
    y -= g.crown * 0.35 * Math.sin(Math.PI * clamp(v, 0, 1));
    return { x, y };
  }

  /** screen point → (u,v); only meaningful inside the quad */
  private inv(x: number, y: number): { u: number; v: number } {
    const g = this.geo;
    let u = 0.5;
    let v = clamp((y - g.hl.y) / Math.max(1, g.fl.y - g.hl.y), 0, 1);
    for (let i = 0; i < 5; i++) {
      const xl = lerp(g.hl.x, g.fl.x, v);
      const xr = lerp(g.hr.x, g.fr.x, v);
      u = clamp((x - xl) / Math.max(1, xr - xl), 0, 1);
      const yl = lerp(g.hl.y, g.fl.y, v);
      const yr = lerp(g.hr.y, g.fr.y, v);
      const base = lerp(yl, yr, u);
      const crown =
        g.crown * Math.sin(Math.PI * u) * (0.45 + 0.55 * v) + g.crown * 0.35 * Math.sin(Math.PI * v);
      const span = lerp(g.fl.y, g.fr.y, u) - lerp(g.hl.y, g.hr.y, u);
      v = clamp(v + (y + crown - base) / Math.max(1, span), 0, 1);
    }
    return { u, v };
  }

  private onBed(x: number, y: number): boolean {
    const g = this.geo;
    const q = [g.hl, g.hr, g.fr, g.fl];
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = q[i];
      const b = q[(i + 1) % 4];
      const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
      if (Math.abs(c) < 1e-6) continue;
      const s = c > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
    return true;
  }

  // ------------------------------------------------------------- wrinkles

  private gi(i: number, j: number): number {
    return clamp(j, 0, NV - 1) * NU + clamp(i, 0, NU - 1);
  }

  /** wrinkle amplitude at (u,v): the stored field plus live waves */
  private hAt(u: number, v: number): number {
    const fu = clamp(u, 0, 1) * (NU - 1);
    const fv = clamp(v, 0, 1) * (NV - 1);
    const i = Math.floor(fu);
    const j = Math.floor(fv);
    const tu = fu - i;
    const tv = fv - j;
    const a = lerp(this.grid[this.gi(i, j)], this.grid[this.gi(i + 1, j)], tu);
    const b = lerp(this.grid[this.gi(i, j + 1)], this.grid[this.gi(i + 1, j + 1)], tu);
    let hh = lerp(a, b, tv);
    for (const wv of this.waves) {
      const d = Math.hypot((u - wv.u) * 1.35, v - wv.v);
      const r = wv.speed * wv.t;
      const k = Math.exp(-((d - r) * (d - r)) / (wv.width * wv.width));
      hh += wv.amp * k * clamp(wv.life, 0, 1) * (wv.speed > 0 ? 1 : Math.exp(-d * 9));
    }
    return hh;
  }

  private get smoothness(): number {
    let s = 0;
    for (let k = 0; k < this.grid.length; k++) s += this.grid[k];
    return clamp(1 - s / this.grid.length / 0.42, 0, 1);
  }

  private rumple(amount: number, seedShift = 0): void {
    const n = makeNoise1d(this.rng.seed ^ (0x77 + seedShift));
    for (let j = 0; j < NV; j++) {
      for (let i = 0; i < NU; i++) {
        const u = i / (NU - 1);
        const v = j / (NV - 1);
        // big soft lumps, a couple of hard diagonal creases, a little noise
        const lump =
          0.5 + 0.5 * Math.sin(u * 4.1 + v * 2.6 + seedShift) * Math.cos(v * 3.3 - u * 1.7 + seedShift * 0.6);
        const crease = Math.pow(Math.abs(Math.sin((u * 1.6 + v * 2.9 + seedShift * 0.4) * 2.1)), 6);
        const grain = 0.5 + 0.5 * n(u * 7.3 + v * 4.1 + seedShift * 2.2);
        const edge = 0.45 + 0.55 * Math.sin(Math.PI * clamp(v, 0, 1)) * Math.sin(Math.PI * clamp(u, 0, 1));
        const val = clamp(Math.pow(lump, 1.5) * 0.85 + crease * 0.55 + grain * 0.22 - 0.16, 0, 1) * edge * amount;
        this.grid[j * NU + i] = Math.max(this.grid[j * NU + i], val);
      }
    }
    this.blurGrid(1);
  }

  /** one box-blur pass: turns noise into folds */
  private blurGrid(k = 1): void {
    const tmp = new Float32Array(this.grid.length);
    for (let pass = 0; pass < k; pass++) {
      for (let j = 0; j < NV; j++) {
        for (let i = 0; i < NU; i++) {
          let sum = 0;
          let n = 0;
          for (let dj = -1; dj <= 1; dj++) {
            for (let di = -1; di <= 1; di++) {
              const wgt = di === 0 && dj === 0 ? 3 : 1;
              sum += this.grid[this.gi(i + di, j + dj)] * wgt;
              n += wgt;
            }
          }
          tmp[j * NU + i] = sum / n;
        }
      }
      this.grid.set(tmp);
    }
  }

  private flatten(): void {
    this.grid.fill(0);
    this.waves = [];
  }

  /** the finger pushing the cloth flat */
  private smoothAt(x: number, y: number, strength: number): void {
    if (!this.onBed(x, y)) return;
    const { u, v } = this.inv(x, y);
    const ru = 0.24;
    const rv = 0.26;
    let removed = 0;
    for (let j = 0; j < NV; j++) {
      const v0 = j / (NV - 1);
      const dv = (v0 - v) / rv;
      if (Math.abs(dv) > 1.4) continue;
      for (let i = 0; i < NU; i++) {
        const u0 = i / (NU - 1);
        const du = (u0 - u) / ru;
        const d = Math.hypot(du, dv);
        if (d > 1.4) continue;
        const k = smooth(1 - d / 1.4) * strength;
        const idx = j * NU + i;
        const before = this.grid[idx];
        this.grid[idx] = before * (1 - k);
        removed += before - this.grid[idx];
      }
    }
    if (removed > 0.0005) {
      // the whole sheet relaxes a little whenever the cloth is pushed flat
      const relax = Math.min(0.05, removed * 0.16);
      for (let k = 0; k < this.grid.length; k++) this.grid[k] *= 1 - relax;
      this.lastSmoothU = u;
      this.lastSmoothV = v;
      this.shh = Math.min(1, this.shh + removed * 2.4 + 0.12);
      // a little bow wave of cloth pushed ahead of the finger
      if (this.waves.length < 14 && this.rng.next() < 0.5) {
        this.waves.push({
          u,
          v,
          t: 0,
          amp: 0.1,
          speed: 0.5,
          width: 0.1,
          life: 1,
        });
      }
    }
  }

  private crumpleAt(u: number, v: number, amount: number, radius: number): void {
    for (let j = 0; j < NV; j++) {
      const v0 = j / (NV - 1);
      for (let i = 0; i < NU; i++) {
        const u0 = i / (NU - 1);
        const d = Math.hypot((u0 - u) * 1.3, v0 - v) / radius;
        if (d > 1.6) continue;
        const k = Math.exp(-d * d * 1.1);
        const ripple = 0.55 + 0.45 * Math.sin(d * 7.5 + u0 * 6.1 + v0 * 4.3);
        this.grid[j * NU + i] = clamp(this.grid[j * NU + i] + amount * k * ripple, 0, 1);
      }
    }
    this.blurGrid(1);
  }

  // ------------------------------------------------------------- phases

  enterPhase(name: PhaseName): void {
    const ph = this.ctx.phase;
    if (ph.name !== name) ph.set(name);
    ph.intervening = name === 'trouble' || name === 'resolve';
    this.waves = [];
    this.motes = [];
    this.shh = 0;
    this.idle = 0;
    this.sil = 0;
    this.stroking = false;
    this.heldCat = false;
    this.heldPillow = false;
    this.catMoved = false;
    this.comicT = 0;

    switch (name) {
      case 'establish':
        this.flatten();
        this.rumple(0.95, 0);
        this.tuck = 0;
        this.pats = 0;
        this.patT = -1;
        this.admire = -1;
        this.done = false;
        this.spotIndex = 0;
        this.warm = 0;
        this.pillowToFloor();
        this.cat = this.makeCat();
        this.camZ = 1.07;
        this.camZT = 1;
        this.camY = this.geo ? this.geo.h * 0.018 : 0;
        this.camYT = 0;
        break;

      case 'action':
        this.enterPhase('establish');
        this.ctx.phase.set('action');
        this.camZ = this.camZT = 1;
        this.camY = this.camYT = 0;
        break;

      case 'foreshadow':
        this.enterPhase('action');
        this.ctx.phase.set('foreshadow');
        this.flatten();
        this.tuck = 1;
        this.pats = 2;
        this.done = true;
        this.warm = 1;
        this.pillowToHead();
        this.catPeek();
        break;

      case 'trouble':
        this.enterPhase('foreshadow');
        this.ctx.phase.set('trouble');
        this.ctx.phase.intervening = true;
        this.catPeek();
        this.startSprint();
        break;

      case 'resolve': {
        this.enterPhase('foreshadow');
        this.ctx.phase.set('resolve');
        this.ctx.phase.intervening = true;
        this.spotIndex = 0;
        const s = this.spot(0);
        this.settleCatOn(s.u, s.v);
        this.cat.mode = 'curl';
        this.cat.mt = 1.6;
        this.cat.curl = 1;
        this.cat.eyeOpen = 0.12;
        this.cat.purr = 1;
        this.crumpleAt(s.u, s.v, 0.75, 0.42);
        this.crumpleAt(0.5, 0.58, 0.2, 0.9);
        break;
      }

      case 'comic': {
        this.enterPhase('resolve');
        this.ctx.phase.set('comic');
        this.cat.mode = 'stretch';
        this.cat.mt = 0;
        this.comicT = 0;
        break;
      }

      case 'settle': {
        this.enterPhase('comic');
        this.ctx.phase.set('settle');
        this.cat.mode = 'belly';
        this.cat.mt = 1.5;
        this.cat.belly = 1;
        this.cat.curl = 0.25;
        this.comicT = 3;
        this.crumpleAt(this.cat.bedU, this.cat.bedV, 0.6, 0.5);
        break;
      }
    }
    if (this.cat.mode !== 'peek') this.sil = 0;
    this.resetTail();
  }

  /** forward transition during play: keep the world, arm the next beat */
  private advance(name: PhaseName): void {
    const ph = this.ctx.phase;
    ph.set(name);
    ph.intervening = name === 'trouble' || name === 'resolve';
    switch (name) {
      case 'action':
        this.camZT = 1;
        this.camYT = 0;
        break;
      case 'foreshadow':
        this.catPeek();
        break;
      case 'trouble':
        this.startSprint();
        break;
      case 'resolve':
        break;
      case 'comic':
        this.comicT = 0;
        this.cat.mode = 'stretch';
        this.cat.mt = 0;
        break;
      case 'settle':
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------- placement

  private pillowToFloor(): void {
    const g = this.geo;
    if (!g) return;
    this.pillow.state = 'floor';
    this.pillow.x = g.o === 'portrait' ? g.w * 0.6 : g.w * 0.28;
    this.pillow.y = g.o === 'portrait' ? g.h * 0.895 : g.h * 0.7;
    this.pillow.restY = this.pillow.y;
    this.pillow.rot = -0.3;
    this.pillow.rotV = 0;
    this.pillow.vy = 0;
    this.pillow.squishX = 1.06;
    this.pillow.squishY = 0.9;
  }

  private pillowToHead(): void {
    this.pillow.state = 'bed';
    this.pillow.u = 0.5;
    this.pillow.v = 0.15;
    this.pillow.rot = 0;
    this.pillow.rotV = 0;
    this.pillow.squishX = 1;
    this.pillow.squishY = 1;
  }

  private pillowHome(): boolean {
    return this.pillow.state === 'bed' && this.pillow.v < 0.32;
  }

  private catAt(x: number, y: number): void {
    const c = this.cat;
    c.x = x;
    c.y = y;
    c.z = 0;
    c.onBed = false;
    c.scale = this.depthScale(y);
    this.resetTail();
  }

  private depthScale(y: number): number {
    const g = this.geo;
    const f = clamp((y - g.floorY) / Math.max(1, g.h * 0.97 - g.floorY), 0, 1);
    return lerp(0.88, 1.32, f);
  }

  private settleCatOn(u: number, v: number): void {
    const c = this.cat;
    this.sil = 0;
    if (this.pillow.state === 'bed' && Math.hypot(u - this.pillow.u, v - this.pillow.v) < 0.16) {
      this.pillow.squishY = 0.72;
      this.pillow.squishX = 1.14;
    }
    c.onBed = true;
    c.bedU = u;
    c.bedV = v;
    const p = this.surf(u, v);
    c.x = p.x;
    c.y = p.y;
    c.z = 0;
    c.scale = lerp(1.1, 1.42, v);
    c.facing = u > 0.5 ? -1 : 1;
    this.resetTail();
  }

  private placeSettled(): void {
    if (this.cat && this.cat.onBed) {
      const p = this.surf(this.cat.bedU, this.cat.bedV);
      this.cat.x = p.x;
      this.cat.y = p.y;
      this.cat.scale = lerp(1.1, 1.42, this.cat.bedV);
    }
  }

  private catPeek(): void {
    const g = this.geo;
    const c = this.cat;
    c.mode = 'peek';
    c.mt = 0;
    c.onBed = false;
    c.x = g.doorExit.x;
    c.y = g.doorExit.y;
    c.z = 0;
    c.curl = 0;
    c.limp = 0;
    c.belly = 0;
    c.crouch = 0.9;
    c.sx = 1;
    c.sy = 1;
    c.spin = 0;
    c.scale = this.depthScale(c.y);
    c.facing = g.o === 'portrait' ? -1 : 1;
    c.earUp = 0;
    c.eyeOpen = 0;
    c.purr = 0;
    c.x = g.doorInside.x;
    c.y = g.doorInside.y;
    c.scale = this.depthScale(c.y);
    this.sil = 1;
    this.resetTail();
  }

  private spot(i: number): { u: number; v: number } {
    const k = ((i % 3) + 3) % 3;
    if (k === 0) return { u: 0.5, v: 0.66 };
    if (k === 1) {
      const onBed = this.pillow.state === 'bed';
      return { u: onBed ? this.pillow.u : 0.5, v: (onBed ? this.pillow.v : 0.15) + 0.08 };
    }
    return { u: clamp(this.lastSmoothU, 0.14, 0.86), v: clamp(this.lastSmoothV, 0.3, 0.86) };
  }

  private resetTail(): void {
    const c = this.cat;
    if (!c) return;
    for (const n of c.tail) {
      n.x = c.x;
      n.y = c.y - (this.geo ? this.geo.unit * 0.5 : 10);
      n.px = n.x;
      n.py = n.y;
    }
  }

  // ------------------------------------------------------------- update

  update(dt: number): void {
    this.t += dt;
    const ph = this.ctx.phase;
    ph.update(dt);

    this.updateBeats(dt);
    this.updateSheet(dt);
    this.updatePillow(dt);
    this.updateCat(dt);
    this.updateMotes(dt);
    this.updateCamera(dt);
    this.updateSound();

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

  private updateBeats(dt: number): void {
    const ph = this.ctx.phase;
    const c = this.cat;
    switch (ph.name) {
      case 'establish':
        if (ph.t > 2.4) this.advance('action');
        break;

      case 'action': {
        if (!this.done) {
          const ready = this.smoothness > 0.86 && this.pillowHome() && this.pats >= 2;
          if (ready) {
            this.done = true;
            this.admire = 0;
            this.tuck = 1;
            this.warm = 1;
            this.flatten();
            this.ctx.audio.bloom();
            this.camZT = 1.035;
          }
        }
        if (this.admire >= 0) {
          this.admire += dt;
          if (this.admire > 1.0) {
            this.camZT = 1;
            this.advance('foreshadow');
          }
        } else if (ph.t > 24) {
          // the cat does not wait forever
          this.advance('foreshadow');
        }
        break;
      }

      case 'foreshadow':
        if (ph.t > 4.3 && c.mode === 'crouch') this.advance('trouble');
        break;

      case 'trouble':
        if (c.mode === 'curl' && c.mt > 2.4 && !this.heldCat) this.advance('resolve');
        break;

      case 'resolve':
        if ((c.mode === 'curl' || c.mode === 'look') && c.mt > 4 && !this.heldCat) this.advance('comic');
        break;

      case 'comic':
        this.comicT += dt;
        if (this.comicT > 3.4) this.advance('settle');
        break;

      case 'settle':
        if (this.heldCat || this.stroking || this.heldPillow) this.idle = 0;
        else this.idle += dt;
        if (this.idle > 6.5) this.leave();
        break;
    }
  }

  private leave(): void {
    if (!this.fadeOut) this.fadeOut = true;
  }

  private updateSheet(dt: number): void {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const wv = this.waves[i];
      wv.t += dt;
      wv.life -= dt * (wv.speed > 0.4 ? 1.35 : 0.9);
      if (wv.life <= 0) this.waves.splice(i, 1);
    }
    // the hem tucks itself in as the sheet gets smooth
    const want = this.done ? 1 : clamp(this.smoothness * 1.12 - 0.12, 0, 1);
    this.tuck += (want - this.tuck) * (1 - Math.exp(-dt * 3.2));
    this.shh = Math.max(0, this.shh - dt * 2.1);
    if (this.patT >= 0) {
      this.patT += dt;
      if (this.patT > 0.55) this.patT = -1;
    }
    this.warm += ((this.done ? 1 : 0) - this.warm) * (1 - Math.exp(-dt * 1.4));
  }

  private updatePillow(dt: number): void {
    const p = this.pillow;
    const g = this.geo;
    if (p.state === 'held') {
      const tx = this.px + p.grabDX;
      const ty = this.py + p.grabDY;
      const k = 1 - Math.exp(-dt * 16);
      p.x += (tx - p.x) * k;
      p.y += (ty - p.y) * k;
      p.rotV += (clamp((tx - p.x) * 0.0016, -0.5, 0.5) - p.rot) * dt * 26;
    } else if (p.state === 'floor') {
      p.vy += 1500 * dt;
      p.y += p.vy * dt;
      const floor = clamp(p.restY, g.floorY + g.h * 0.06, g.h * 0.965);
      if (p.y >= floor) {
        p.y = floor;
        if (p.vy > 60) {
          p.squishY = 0.66;
          p.squishX = 1.24;
          this.ctx.audio.flump(0);
          this.puff(p.x, p.y, 7, 0.7);
        }
        p.vy = 0;
      }
    }
    p.rotV *= Math.exp(-dt * 6);
    p.rot += p.rotV * dt;
    if (p.state !== 'held') p.rot += ((p.state === 'floor' ? -0.26 : 0) - p.rot) * (1 - Math.exp(-dt * 4));
    const sq = 1 - Math.exp(-dt * 9);
    p.squishX += (1 - p.squishX) * sq;
    p.squishY += (1 - p.squishY) * sq;
  }

  private puff(x: number, y: number, n: number, power: number): void {
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const sp = this.rng.range(20, 95) * power;
      this.motes.push({
        x: x + this.rng.range(-8, 8),
        y: y + this.rng.range(-4, 4),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.5 - this.rng.range(14, 54) * power,
        r: this.rng.range(1.1, 2.8),
        life: this.rng.range(0.7, 1.6),
        max: 1.6,
        spin: this.rng.range(0, 6.3),
      });
    }
  }

  private updateMotes(dt: number): void {
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      m.life -= dt;
      m.vy += 26 * dt;
      m.vx *= Math.exp(-dt * 1.6);
      m.vy *= Math.exp(-dt * 1.3);
      m.x += (m.vx + Math.sin(this.t * 2 + m.spin) * 5) * dt;
      m.y += m.vy * dt;
      if (m.life <= 0) this.motes.splice(i, 1);
    }
    const g = this.geo;
    for (const m of this.beamMotes) {
      m.x += (m.vx + Math.sin(this.t * 0.7 + m.spin) * 4) * dt;
      m.y += (m.vy + Math.cos(this.t * 0.53 + m.spin * 1.7) * 3) * dt;
      if (m.x < -10) m.x = g.w + 10;
      if (m.x > g.w + 10) m.x = -10;
      if (m.y < g.win.y - 20) m.y = g.h * 0.9;
      if (m.y > g.h * 0.95) m.y = g.win.y;
    }
  }

  private updateCamera(dt: number): void {
    const k = 1 - Math.exp(-dt * 1.8);
    this.camZ += (this.camZT - this.camZ) * k;
    this.camY += (this.camYT - this.camY) * k;
    this.shake = Math.max(0, this.shake - dt * 2.6);
  }

  private updateSound(): void {
    const a = this.ctx.audio;
    a.bed('shh', Math.min(0.055, this.shh * 0.05), 4200 + this.shh * 2600);
    const pr = this.cat.purr;
    a.bed('purr', pr * 0.045 * (0.62 + 0.38 * Math.sin(this.t * 17)), 78);
  }

  // ------------------------------------------------------------- the cat

  private updateCat(dt: number): void {
    const c = this.cat;
    const g = this.geo;
    c.mt += dt;
    const ease = (v: number, target: number, rate: number): number =>
      v + (target - v) * (1 - Math.exp(-rate * dt));

    // blinking
    c.blinkT -= dt;
    if (c.blinkT <= 0 && c.mode !== 'curl' && c.mode !== 'look') {
      c.blinkT = this.rng.range(2.2, 5.4);
    }

    let targetCurl = 0;
    let targetLimp = 0;
    let targetBelly = 0;
    let targetEar = 1;
    let targetEye = 1;
    let purr = 0;

    switch (c.mode) {
      case 'hidden':
        c.z = 0;
        break;

      case 'peek': {
        // in the dark hall: ears, then eyes, then a tail flick, then it steps out
        const p = c.mt;
        targetEar = smooth(p / 0.75);
        targetEye = smooth((p - 0.8) / 0.5);
        const out = smooth((p - 1.5) / 1.3);
        c.crouch = 1 - out * 0.35;
        c.x = lerp(g.doorInside.x, g.doorExit.x, out);
        c.y = lerp(g.doorInside.y, g.doorExit.y, out);
        c.scale = this.depthScale(c.y);
        this.sil = clamp(1 - (p - 1.6) / 0.7, 0, 1);
        if (p > 1.3) c.tailFlick = 1;
        c.facing = g.launch.x < g.doorExit.x ? -1 : 1;
        if (p > 1.6) {
          this.stepT -= dt;
          if (this.stepT <= 0) {
            this.stepT = 0.36;
            this.ctx.audio.thump(0.4);
          }
        }
        if (p > 3.0) {
          c.mode = 'crouch';
          c.mt = 0;
          this.sil = 0;
        }
        break;
      }

      case 'crouch': {
        // hips wiggle, the classic pre-pounce
        c.crouch = 1;
        const wig = Math.sin(c.mt * 11.5) * 0.06 * clamp(c.mt / 0.5, 0, 1);
        c.sx = 1 + wig;
        c.sy = 1 - wig * 0.7;
        c.tailFlick = 1;
        const tgt = this.surf(0.5, 0.5);
        c.facing = tgt.x > c.x ? 1 : -1;
        if (this.ctx.phase.is('foreshadow') && c.mt > 1.3) {
          this.advance('trouble');
        }
        break;
      }

      case 'sprint': {
        const T = 0.86;
        const k = clamp(c.mt / T, 0, 1);
        const e = k * k * (3 - 2 * k) * 0.25 + k * 0.75; // fast, barely eased
        const prevX = c.x;
        const m = g.runMid;
        const iq = (1 - e) * (1 - e);
        c.x = iq * c.ax + 2 * (1 - e) * e * m.x + e * e * c.bx;
        c.y = iq * c.ay + 2 * (1 - e) * e * m.y + e * e * c.by;
        c.scale = this.depthScale(c.y);
        c.speed = 900;
        if (Math.abs(c.x - prevX) > 0.4) c.facing = c.x > prevX ? 1 : -1;
        c.crouch = 0.4;
        c.sx = 1.3;
        c.sy = 0.78;
        c.legPhase += dt * 30;
        c.trail.push({ x: c.x, y: c.y, z: c.z, s: c.scale, a: 1 });
        if (c.trail.length > 8) c.trail.shift();
        if (k >= 1) {
          c.sx = 1;
          c.sy = 1;
          this.startLeap();
        }
        break;
      }

      case 'leap': {
        const T = 0.6;
        const k = clamp(c.mt / T, 0, 1);
        c.x = lerp(c.ax, c.bx, k);
        c.y = lerp(c.ay, c.by, k);
        c.z = Math.sin(Math.PI * k) * g.h * 0.24;
        c.scale = lerp(this.depthScale(c.ay), lerp(1.1, 1.42, c.bedV), k);
        c.sx = lerp(1.32, 0.94, smooth(k));
        c.sy = lerp(0.76, 1.12, smooth(k));
        c.legPhase += dt * 8;
        c.trail.push({ x: c.x, y: c.y, z: c.z, s: c.scale, a: 1 });
        if (c.trail.length > 6) c.trail.shift();
        if (k >= 1) this.landOnBed();
        break;
      }

      case 'land': {
        const k = clamp(c.mt / 0.34, 0, 1);
        c.sx = lerp(1.36, 1, smooth(k));
        c.sy = lerp(0.62, 1, smooth(k));
        c.z = 0;
        if (k >= 1) {
          c.mode = 'spin';
          c.mt = 0;
        }
        break;
      }

      case 'spin': {
        const k = clamp(c.mt / 0.5, 0, 1);
        c.spin = smooth(k) * Math.PI * 2;
        c.crouch = 0.6;
        c.legPhase += dt * 12;
        if (k >= 1) {
          c.spin = 0;
          c.mode = 'curl';
          c.mt = 0;
          c.knead = 1;
        }
        break;
      }

      case 'curl': {
        targetCurl = 1;
        targetEye = c.mt < 0.6 ? 1 : 0.1;
        purr = clamp((c.mt - 0.7) / 0.8, 0, 1);
        c.knead = Math.max(0, c.knead - dt * 0.55);
        c.spin = 0;
        c.sx = ease(c.sx, 1 + Math.sin(this.t * 5.4) * 0.012 * purr, 8);
        c.sy = ease(c.sy, 1 - Math.sin(this.t * 5.4) * 0.012 * purr, 8);
        break;
      }

      case 'held': {
        targetLimp = 1;
        targetEye = 1;
        c.z = 0;
        const k = 1 - Math.exp(-dt * 19);
        c.x += (this.px + c.grabDX - c.x) * k;
        c.y += (this.py + c.grabDY - c.y) * k;
        c.scale = lerp(c.scale, this.depthScale(clamp(c.y, g.floorY, g.h)), 1 - Math.exp(-dt * 3));
        c.onBed = false;
        break;
      }

      case 'fall': {
        c.fallV = Math.min(1500, c.fallV + 2600 * dt);
        c.y = Math.min(c.by, c.y + c.fallV * dt);
        c.sy = lerp(c.sy, 1.16, 1 - Math.exp(-dt * 6));
        c.sx = lerp(c.sx, 0.9, 1 - Math.exp(-dt * 6));
        targetLimp = 0;
        if (c.y >= c.by - 0.5) {
          c.y = c.by;
          c.mode = 'shake';
          c.mt = 0;
          c.fallV = 0;
          c.sx = 1.34;
          c.sy = 0.68;
          c.scale = this.depthScale(c.y);
          this.ctx.audio.thump(0.9);
          this.puff(c.x, c.y, 8, 0.8);
          this.shake = 0.28;
        }
        break;
      }

      case 'shake': {
        const k = clamp(c.mt / 0.55, 0, 1);
        c.sx = lerp(1.3, 1, smooth(Math.min(1, k * 2)));
        c.sy = lerp(0.72, 1, smooth(Math.min(1, k * 2)));
        c.spin = Math.sin(c.mt * 34) * 0.1 * (1 - k);
        c.crouch = 0.3;
        if (k >= 1) {
          c.spin = 0;
          c.mode = 'sit';
          c.mt = 0;
          c.waitFor = this.rng.range(1.5, 2.5);
        }
        break;
      }

      case 'sit': {
        c.crouch = ease(c.crouch, 0.25, 6);
        c.tailFlick = 0.4;
        if (c.mt > c.waitFor && !this.heldCat) this.startWalkBack();
        break;
      }

      case 'walk': {
        const T = 1.05;
        const k = clamp(c.mt / T, 0, 1);
        c.x = lerp(c.ax, c.bx, smooth(k));
        c.y = lerp(c.ay, c.by, smooth(k));
        c.scale = this.depthScale(c.y);
        c.facing = c.bx > c.ax ? 1 : -1;
        c.legPhase += dt * 11;
        c.speed = 60;
        this.stepT -= dt;
        if (this.stepT <= 0) {
          this.stepT = 0.26;
          this.ctx.audio.thump(0.4);
        }
        if (k >= 1) {
          const s = this.spot(this.spotIndex);
          c.mode = 'hop';
          c.mt = 0;
          c.ax = c.x;
          c.ay = c.y;
          const p = this.surf(s.u, s.v);
          c.bx = p.x;
          c.by = p.y;
          c.bedU = s.u;
          c.bedV = s.v;
          this.ctx.audio.whoosh(0.4, 0.34);
        }
        break;
      }

      case 'hop': {
        const T = 0.52;
        const k = clamp(c.mt / T, 0, 1);
        c.x = lerp(c.ax, c.bx, k);
        c.y = lerp(c.ay, c.by, k);
        c.z = Math.sin(Math.PI * k) * g.h * 0.12;
        c.scale = lerp(this.depthScale(c.ay), lerp(1.1, 1.42, c.bedV), k);
        c.sx = lerp(1.14, 0.98, smooth(k));
        c.sy = lerp(0.88, 1.06, smooth(k));
        c.legPhase += dt * 9;
        if (k >= 1) {
          c.z = 0;
          c.sx = 1.2;
          c.sy = 0.78;
          this.settleCatOn(c.bedU, c.bedV);
          this.crumpleAt(c.bedU, c.bedV, 0.55, 0.36);
          this.pushWave(c.bedU, c.bedV, 0.26, 0.55);
          this.ctx.audio.flump(0.1);
          this.puff(c.x, c.y, 5, 0.5);
          c.mode = 'look';
          c.mt = 0;
        }
        break;
      }

      case 'look': {
        // turn to the camera and slow-blink: "yes, I know"
        targetCurl = clamp((c.mt - 0.2) / 0.9, 0, 1) * 0.9;
        const b = c.mt - 0.75;
        targetEye = b > 0 && b < 0.85 ? clamp(1 - Math.sin(clamp(b / 0.85, 0, 1) * Math.PI) * 1.25, 0.05, 1) : 1;
        purr = clamp((c.mt - 1.2) / 1, 0, 1) * 0.7;
        c.sx = ease(c.sx, 1, 7);
        c.sy = ease(c.sy, 1, 7);
        if (c.mt > 2.1) {
          c.mode = 'curl';
          c.mt = 0.6;
        }
        break;
      }

      case 'stretch': {
        // the comic beat: a long stretch, then a roll onto the back
        const k = clamp(c.mt / 1.25, 0, 1);
        targetCurl = 1 - smooth(k);
        targetEye = k < 0.6 ? 0.25 : 1;
        c.sx = 1 + Math.sin(Math.PI * smooth(k)) * 0.34;
        c.sy = 1 - Math.sin(Math.PI * smooth(k)) * 0.2;
        purr = 0.3;
        if (k >= 1) {
          c.mode = 'belly';
          c.mt = 0;
          this.ctx.audio.mew();
        }
        break;
      }

      case 'belly': {
        const k = clamp(c.mt / 0.7, 0, 1);
        targetBelly = 1;
        targetCurl = 0.12;
        targetEye = c.mt > 1.4 ? 0.18 : 1;
        purr = clamp((c.mt - 0.8) / 1, 0, 1);
        c.spin = smooth(k) * 0.1;
        if (c.mt > 0.6 && c.mt - dt <= 0.6) {
          this.crumpleAt(c.bedU, c.bedV, 0.55, 0.5);
          this.pushWave(c.bedU, c.bedV, 0.2, 0.5);
          this.ctx.audio.flump(0.15);
          this.puff(c.x, c.y - g.unit * 0.4, 6, 0.5);
        }
        break;
      }
    }

    // blend factors
    c.curl = ease(c.curl, targetCurl, 7);
    c.limp = ease(c.limp, targetLimp, 9);
    c.belly = ease(c.belly, targetBelly, 6);
    c.earUp = ease(c.earUp, targetEar, 8);
    const blink = c.blinkT < 0.13 && c.mode !== 'curl' ? 0.1 : 1;
    c.eyeOpen = ease(c.eyeOpen, targetEye * blink, 14);
    c.purr = ease(c.purr, purr, 3);
    c.tailFlick = Math.max(0, c.tailFlick - dt * 0.55);
    c.speed *= Math.exp(-dt * 6);
    if (c.mode !== 'sprint' && c.mode !== 'leap' && c.trail.length) {
      for (const tr of c.trail) tr.a -= dt * 6;
      c.trail = c.trail.filter((tr) => tr.a > 0);
    }

    // eyes follow the finger
    if (this.hasPointer) {
      const head = this.headPoint();
      const dx = this.px - head.x;
      const dy = this.py - head.y;
      const d = Math.hypot(dx, dy) || 1;
      c.pupilX = ease(c.pupilX, clamp(dx / d, -1, 1), 9);
      c.pupilY = ease(c.pupilY, clamp(dy / d, -1, 1) * 0.7, 9);
    } else {
      c.pupilX = ease(c.pupilX, 0, 3);
      c.pupilY = ease(c.pupilY, 0, 3);
    }

    // the cat rides the sheet while it is settled on it
    if (c.onBed && (c.mode === 'curl' || c.mode === 'look' || c.mode === 'stretch' || c.mode === 'belly')) {
      const p = this.surf(c.bedU, c.bedV);
      c.x = p.x;
      c.y = p.y - this.hAt(c.bedU, c.bedV) * this.geo.crown * 0.5;
    }

    this.stepTail(dt);
  }

  private headPoint(): Pt {
    const c = this.cat;
    const u = this.geo.unit * c.scale;
    return { x: c.x + c.facing * u * 0.9, y: c.y - c.z - u * (1.3 - c.curl * 0.55) };
  }

  private stepTail(dt: number): void {
    const c = this.cat;
    const u = this.geo.unit * c.scale;
    const root = this.tailRoot();
    const seg = u * (0.44 - c.curl * 0.05);
    const n0 = c.tail[0];
    n0.px = n0.x;
    n0.py = n0.y;
    n0.x = root.x;
    n0.y = root.y;
    const flick = c.tailFlick > 0.02 ? Math.sin(this.t * 9.5) * c.tailFlick * u * 0.9 : 0;
    const wag = Math.sin(this.t * 1.7) * u * 0.1 * (1 - c.curl);
    const sub = Math.min(3, Math.max(1, Math.round(dt * 120)));
    const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      for (let i = 1; i < c.tail.length; i++) {
        const n = c.tail[i];
        const vx = (n.x - n.px) * 0.92;
        const vy = (n.y - n.py) * 0.92;
        n.px = n.x;
        n.py = n.y;
        // gravity, plus the flick, plus the curl pulling it around the body
        let fx = flick * (i / c.tail.length) + wag;
        let fy = c.limp > 0.5 ? 900 : 620 * (1 - c.curl * 0.55);
        if (c.curl > 0.3) {
          // wraps around the front of the curled body and ends by the paws
          const k = i / (c.tail.length - 1);
          const tx = c.x + c.facing * u * (-0.7 + 1.85 * k);
          const ty = c.y - u * 0.62 + u * (0.28 + 0.62 * Math.sin(Math.PI * k));
          fx += (tx - n.x) * 46 * c.curl;
          fy += (ty - n.y) * 46 * c.curl;
        }
        if (c.belly > 0.3) fy -= 130 * c.belly;
        n.x += vx + fx * h * h * 60;
        n.y += vy + fy * h * h * 60;
      }
      const restY = c.y - c.z + u * 0.28;
      for (let k = 0; k < 3; k++) {
        for (let i = 1; i < c.tail.length; i++) {
          const n = c.tail[i];
          if (c.limp < 0.4 && n.y > restY) {
            n.y = restY;
            n.px += (n.x - n.px) * 0.3;
          }
        }
        for (let i = 0; i < c.tail.length - 1; i++) {
          const a = c.tail[i];
          const b = c.tail[i + 1];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 1e-4;
          const diff = (d - seg) / d;
          dx *= diff;
          dy *= diff;
          const wa = i === 0 ? 0 : 0.5;
          a.x += dx * wa;
          a.y += dy * wa;
          b.x -= dx * (1 - wa);
          b.y -= dy * (1 - wa);
        }
      }
    }
  }

  private tailRoot(): Pt {
    const c = this.cat;
    const u = this.geo.unit * c.scale;
    if (c.limp > 0.5) return { x: c.x - c.facing * u * 0.16, y: c.y + u * 0.85 * c.limp };
    return {
      x: c.x - c.facing * u * (0.88 - c.curl * 0.16),
      y: c.y - c.z - u * (0.72 - c.curl * 0.18) + u * c.belly * 0.15,
    };
  }

  private startSprint(): void {
    const c = this.cat;
    const g = this.geo;
    this.sil = 0;
    c.mode = 'sprint';
    c.mt = 0;
    c.ax = c.x;
    c.ay = c.y;
    c.bx = g.launch.x;
    c.by = g.launch.y;
    c.curl = 0;
    c.limp = 0;
    c.belly = 0;
    c.spin = 0;
    c.earUp = 1;
    c.eyeOpen = 1;
    c.trail = [];
    this.ctx.audio.whoosh(0.8, 0.55);
  }

  private startLeap(): void {
    const c = this.cat;
    const s = this.spot(0);
    const p = this.surf(s.u, s.v);
    c.mode = 'leap';
    c.mt = 0;
    c.ax = c.x;
    c.ay = c.y;
    c.bx = p.x;
    c.by = p.y;
    c.bedU = s.u;
    c.bedV = s.v;
    c.facing = p.x > c.x ? 1 : -1;
    c.trail = [];
    this.ctx.audio.whoosh(0.9, 0.5);
  }

  private landOnBed(): void {
    const c = this.cat;
    c.mode = 'land';
    c.mt = 0;
    c.z = 0;
    this.settleCatOn(c.bedU, c.bedV);
    this.crumpleAt(c.bedU, c.bedV, 0.95, 0.5);
    this.crumpleAt(0.5, 0.55, 0.3, 1.1);
    this.pushWave(c.bedU, c.bedV, 0.42, 0.85);
    this.tuck = 0.1;
    this.ctx.audio.thump(0.85);
    this.ctx.audio.flump(0.05);
    this.shake = 0.6;
    this.puff(c.x, c.y, 16, 1.1);
    // the pillow jumps
    if (this.pillow.state === 'bed') {
      this.pillow.squishY = 0.72;
      this.pillow.squishX = 1.18;
      this.pillow.rotV = this.rng.range(-1.4, 1.4);
    }
    this.spotIndex = 0;
  }

  private pushWave(u: number, v: number, amp: number, width: number): void {
    this.waves.push({ u, v, t: 0, amp, speed: 0.78, width: width * 0.22, life: 1 });
    this.waves.push({ u, v, t: -0.09, amp: amp * 0.55, speed: 0.78, width: width * 0.16, life: 1 });
  }

  private startWalkBack(): void {
    const c = this.cat;
    const g = this.geo;
    // stroll to the near corner of the bed, then hop up
    c.mode = 'walk';
    c.mt = 0;
    c.ax = c.x;
    c.ay = c.y;
    c.bx = g.launch.x + this.rng.range(-g.w * 0.03, g.w * 0.03);
    c.by = g.launch.y;
    c.seat = 'floor';
  }

  // ------------------------------------------------------------- input

  pointer(e: PointerEvt): void {
    this.px = e.x;
    this.py = e.y;
    this.hasPointer = true;
    if (e.type === 'down') {
      this.idle = 0;
      if (this.catGrabbable() && this.hitCat(e.x, e.y)) {
        this.grabCat();
        return;
      }
      if (this.hitPillow(e.x, e.y)) {
        this.grabPillow();
        return;
      }
      if (this.onBed(e.x, e.y)) {
        this.stroking = true;
        this.strokeT = 0;
        this.strokeDist = 0;
        this.smoothAt(e.x, e.y, 0.2);
        return;
      }
      if (this.ctx.phase.is('settle', 'comic')) this.leave();
      return;
    }

    if (e.type === 'move') {
      this.idle = 0;
      if (this.stroking) {
        this.strokeT = e.age;
        this.strokeDist = e.travel;
        const step = Math.min(24, Math.hypot(e.dx, e.dy));
        const n = 1 + Math.floor(step / 7);
        for (let i = 1; i <= n; i++) {
          this.smoothAt(e.x - e.dx * (1 - i / n), e.y - e.dy * (1 - i / n), 0.26);
        }
      }
      return;
    }

    // up
    this.idle = 0;
    if (this.stroking) {
      this.stroking = false;
      if (this.strokeDist < 14 && this.strokeT < 0.5) this.pat(e.x, e.y);
      return;
    }
    if (this.heldPillow) {
      this.releasePillow(e);
      return;
    }
    if (this.heldCat) this.releaseCat();
  }

  private catGrabbable(): boolean {
    const m = this.cat.mode;
    return (
      m === 'curl' ||
      m === 'look' ||
      m === 'sit' ||
      m === 'belly' ||
      m === 'stretch' ||
      m === 'shake' ||
      m === 'walk' ||
      m === 'land' ||
      m === 'spin' ||
      m === 'hop'
    );
  }

  private hitCat(x: number, y: number): boolean {
    const c = this.cat;
    const u = this.geo.unit * c.scale;
    const bx = c.x;
    const by = c.y - c.z - u * (0.72 - c.curl * 0.12);
    return Math.hypot((x - bx) / (u * 1.5), (y - by) / (u * 1.25)) < 1.25;
  }

  private hitPillow(x: number, y: number): boolean {
    const p = this.pillow;
    const c = this.pillowCentre();
    const s = this.pillowSize();
    if (p.state === 'bed' && this.cat.onBed && this.cat.curl > 0.4) {
      // the cat is sitting on it: grab the cat, not the pillow
      if (Math.hypot(x - this.cat.x, y - this.cat.y) < this.geo.unit) return false;
    }
    return Math.hypot((x - c.x) / (s.rx * 1.25), (y - c.y) / (s.ry * 1.5)) < 1.2;
  }

  private grabCat(): void {
    const c = this.cat;
    c.mode = 'held';
    c.mt = 0;
    c.grabDX = clamp(c.x - this.px, -this.geo.unit, this.geo.unit);
    c.grabDY = clamp(c.y - this.py, -this.geo.unit, this.geo.unit) - this.geo.unit * 0.15;
    c.onBed = false;
    c.spin = 0;
    c.sx = 1;
    c.sy = 1;
    c.trail = [];
    this.heldCat = true;
    this.catMoved = true;
    this.ctx.audio.mew();
  }

  private releaseCat(): void {
    const c = this.cat;
    this.heldCat = false;
    const g = this.geo;
    if (this.onBed(c.x, c.y)) {
      // dropped straight back onto the bed: it simply melts into the sheet
      const uv = this.inv(c.x, c.y);
      this.settleCatOn(uv.u, uv.v);
      this.crumpleAt(uv.u, uv.v, 0.6, 0.4);
      this.pushWave(uv.u, uv.v, 0.24, 0.5);
      this.ctx.audio.flump(0.1);
      this.puff(c.x, c.y, 6, 0.5);
      c.mode = 'curl';
      c.mt = 0;
      c.limp = 0;
      return;
    }
    // falls to the floor, or into the basket / onto the stool
    let ty = clamp(c.y, g.floorY + g.h * 0.035, g.h * 0.965);
    c.seat = 'floor';
    const b = g.basket;
    if (Math.abs(c.x - b.x) < b.rx * 1.3 && Math.abs(c.y - b.y) < b.ry * 5) {
      c.x = b.x;
      ty = b.y + b.ry * 0.5;
      c.seat = 'basket';
    } else {
      const s = g.stool;
      if (Math.abs(c.x - s.x) < s.rx * 1.5 && Math.abs(c.y - s.y) < s.ry * 6) {
        c.x = s.x;
        ty = s.y - s.ry * 0.15;
        c.seat = 'stool';
      }
    }
    c.mode = 'fall';
    c.mt = 0;
    c.by = ty;
    c.bx = c.x;
    this.spotIndex = (this.spotIndex + 1) % 3;
  }

  private grabPillow(): void {
    const p = this.pillow;
    const c = this.pillowCentre();
    p.was = { state: p.state, u: p.u, v: p.v, x: p.x, y: p.y };
    p.grabDX = clamp(c.x - this.px, -60, 60);
    p.grabDY = clamp(c.y - this.py, -60, 60);
    p.x = c.x;
    p.y = c.y;
    p.state = 'held';
    p.squishX = 0.9;
    p.squishY = 1.1;
    this.heldPillow = true;
    this.ctx.audio.whoosh(0.25, 0.28);
  }

  private releasePillow(e: PointerEvt): void {
    const p = this.pillow;
    this.heldPillow = false;
    if (e.travel < 14 && e.age < 0.5) {
      // that was not a move, that was a pat
      p.state = p.was.state;
      p.u = p.was.u;
      p.v = p.was.v;
      p.x = p.was.x;
      p.y = p.was.y;
      p.squishY = 0.62;
      p.squishX = 1.22;
      this.pat(e.x, e.y);
      return;
    }
    const x = p.x + clamp(e.vx, -500, 500) * 0.05;
    const y = p.y + clamp(e.vy, -500, 500) * 0.05;
    if (this.onBed(x, y)) {
      const uv = this.inv(x, y);
      p.state = 'bed';
      p.u = clamp(uv.u, 0.22, 0.78);
      p.v = clamp(uv.v, 0.1, 0.9);
      p.squishY = 0.7;
      p.squishX = 1.2;
      p.rotV = clamp(e.vx, -300, 300) * 0.0012;
      this.ctx.audio.flump(0);
      this.puff(x, y, 8, 0.6);
      this.pushWave(p.u, p.v + 0.04, 0.2, 0.5);
      this.crumpleAt(p.u, p.v, 0.1, 0.28);
      this.shake = 0.12;
    } else {
      p.state = 'floor';
      p.x = clamp(x, 20, this.geo.w - 20);
      p.y = y;
      p.restY = clamp(y, this.geo.floorY + this.geo.h * 0.06, this.geo.h * 0.965);
      p.vy = clamp(e.vy, -200, 400);
    }
  }

  private pat(x: number, y: number): void {
    const uv = this.inv(x, y);
    this.patT = 0;
    this.patU = uv.u;
    this.patV = uv.v;
    this.smoothAt(x, y, 0.55);
    this.waves.push({ u: uv.u, v: uv.v, t: 0, amp: -0.32, speed: 0, width: 0.2, life: 0.55 });
    this.pushWave(uv.u, uv.v, 0.12, 0.45);
    this.puff(x, y, 9, 0.6);
    this.ctx.audio.thump(1.15);
    this.shake = 0.14;
    const onPillow = this.pillow.state === 'bed' && Math.hypot(uv.u - this.pillow.u, uv.v - this.pillow.v) < 0.22;
    if (onPillow) {
      this.pillow.squishY = 0.68;
      this.pillow.squishX = 1.2;
    }
    if (this.smoothness > 0.78 && this.pillowHome()) this.pats++;
    // patting the sleeping cat is allowed; it purrs harder
    if (this.cat.onBed && Math.hypot(x - this.cat.x, y - this.cat.y) < this.geo.unit * 1.6) {
      this.cat.purr = 1;
      this.cat.knead = 1;
    }
  }

  // ------------------------------------------------------------- render

  render(g: CanvasRenderingContext2D): void {
    const geo = this.geo;
    const { w, h } = geo;

    g.save();
    const sx = this.shake ? Math.sin(this.t * 70) * this.shake * 4 : 0;
    const sy = this.shake ? Math.cos(this.t * 61) * this.shake * 3 : 0;
    g.translate(w / 2 + sx, h / 2 + sy);
    g.scale(this.camZ, this.camZ);
    g.translate(-w / 2, -h / 2 + this.camY);

    this.drawRoom(g);
    this.drawDoorway(g);
    const behind = !this.cat.onBed && this.cat.y < geo.hl.y && this.cat.mode !== 'held';
    if (behind) this.drawCat(g);
    this.drawBed(g);
    if (!behind) this.drawCat(g);
    this.drawForeground(g);
    this.drawMotes(g);
    this.drawLight(g);
    g.restore();

    if (this.fade > 0.001) {
      g.fillStyle = `rgba(8,7,12,${this.fade})`;
      g.fillRect(0, 0, w, h);
    }
  }

  private drawRoom(g: CanvasRenderingContext2D): void {
    const { w, h, floorY } = this.geo;
    const warm = 0.12 + this.warm * 0.1;
    // wall
    const wall = g.createLinearGradient(0, -h * 0.1, 0, floorY + 10);
    wall.addColorStop(0, rgb(mix([226, 216, 206], [246, 228, 196], warm)));
    wall.addColorStop(0.62, rgb(mix([238, 230, 220], [252, 238, 210], warm)));
    wall.addColorStop(1, rgb(mix([214, 204, 196], [232, 214, 186], warm)));
    g.fillStyle = wall;
    g.fillRect(-w, -h, w * 3, floorY + h + 2);

    // a faint wallpaper stripe, and the skirting board
    g.strokeStyle = 'rgba(180,166,156,0.16)';
    g.lineWidth = 1;
    const step = Math.max(26, w * 0.075);
    for (let x = -w * 0.2; x < w * 1.2; x += step) {
      g.beginPath();
      g.moveTo(x, -h * 0.1);
      g.lineTo(x, floorY);
      g.stroke();
    }
    const sk = Math.max(7, h * 0.019);
    const skg = g.createLinearGradient(0, floorY - sk, 0, floorY);
    skg.addColorStop(0, 'rgb(242,236,228)');
    skg.addColorStop(0.42, 'rgb(230,222,212)');
    skg.addColorStop(1, 'rgb(202,190,180)');
    g.fillStyle = skg;
    g.fillRect(-w, floorY - sk, w * 3, sk);
    // the moulded lip at the top of the skirting, and its shadow on the wall
    g.fillStyle = 'rgba(255,252,246,0.75)';
    g.fillRect(-w, floorY - sk, w * 3, Math.max(1.5, sk * 0.17));
    g.fillStyle = 'rgba(126,110,100,0.22)';
    g.fillRect(-w, floorY - sk - Math.max(1.5, sk * 0.12), w * 3, Math.max(1.5, sk * 0.12));
    g.fillStyle = 'rgba(120,104,96,0.26)';
    g.fillRect(-w, floorY - sk * 0.3, w * 3, Math.max(1.2, sk * 0.1));
    // where the board meets the boards
    g.fillStyle = 'rgba(66,48,36,0.38)';
    g.fillRect(-w, floorY - 2, w * 3, 3);

    this.drawWindow(g);
    this.drawPicture(g);

    // floor
    const fl = g.createLinearGradient(0, floorY, 0, h);
    fl.addColorStop(0, rgb(mix([186, 150, 112], [206, 168, 120], warm)));
    fl.addColorStop(1, rgb(mix([152, 118, 84], [176, 138, 96], warm)));
    g.fillStyle = fl;
    g.fillRect(-w, floorY, w * 3, h - floorY + 20);
    // planks, converging slightly for depth, each one a slightly different board
    const nb = 9;
    const depth = h - floorY + 20;
    const boardX = (i: number, t: number): number => {
      const f = i / nb;
      return lerp(w * (0.08 + 0.84 * f), w * (-0.3 + 1.6 * f), t);
    };
    for (let i = 0; i < nb; i++) {
      const tint = ((i * 37) % 7) / 7;
      g.fillStyle = tint > 0.5 ? `rgba(118,86,54,${0.04 + tint * 0.05})` : `rgba(240,212,172,${0.04 + tint * 0.06})`;
      g.beginPath();
      g.moveTo(boardX(i, 0), floorY);
      g.lineTo(boardX(i + 1, 0), floorY);
      g.lineTo(boardX(i + 1, 1), floorY + depth);
      g.lineTo(boardX(i, 1), floorY + depth);
      g.closePath();
      g.fill();
      // grain: long soft fibres running with the plank
      g.lineWidth = 1;
      for (let k = 1; k <= 3; k++) {
        g.strokeStyle = `rgba(104,74,48,${0.06 + ((i + k) % 3) * 0.028})`;
        const across = k / 4;
        g.beginPath();
        for (let j = 0; j <= 8; j++) {
          const t = j / 8;
          const wob = Math.sin(t * 5.1 + i * 2.3 + k * 1.7) * 0.05 + Math.sin(t * 11.3 + k * 3.1) * 0.022;
          const s2 = clamp(across + wob, 0.08, 0.92);
          const x = lerp(boardX(i, t), boardX(i + 1, t), s2);
          const y = floorY + depth * t;
          if (j === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
    }
    // the seam between planks, with a waxed highlight on its lit side
    for (let i = 0; i <= nb; i++) {
      g.strokeStyle = 'rgba(88,62,40,0.3)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(boardX(i, 0), floorY);
      g.lineTo(boardX(i, 1), floorY + depth);
      g.stroke();
      g.strokeStyle = 'rgba(255,238,206,0.16)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(boardX(i, 0) + 1.6, floorY);
      g.lineTo(boardX(i, 1) + 2.6, floorY + depth);
      g.stroke();
    }
    // short butt joints where boards end
    g.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const t = (i / 4) ** 1.4;
      const y = floorY + depth * t;
      const a = i % 2 === 0 ? 1 : 4;
      g.strokeStyle = 'rgba(96,70,46,0.17)';
      g.beginPath();
      g.moveTo(boardX(a, t), y);
      g.lineTo(boardX(a + 3, t), y);
      g.stroke();
    }
    // the floor darkens a little into the corner with the wall
    const ao = g.createLinearGradient(0, floorY, 0, floorY + depth * 0.24);
    ao.addColorStop(0, 'rgba(70,50,34,0.3)');
    ao.addColorStop(1, 'rgba(70,50,34,0)');
    g.fillStyle = ao;
    g.fillRect(-w, floorY, w * 3, depth * 0.24);

    // the rug, sliding under the near corner of the bed
    const r = this.geo.rug;
    g.save();
    // fringe, before the pile so it reads as sticking out
    g.strokeStyle = 'rgba(214,196,188,0.55)';
    g.lineWidth = 1.6;
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const cx = r.x + Math.cos(a) * r.rx;
      const cy = r.y + Math.sin(a) * r.ry;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a) * r.rx * 0.035, cy + Math.sin(a) * r.ry * 0.12);
      g.stroke();
    }
    // the shadow it casts, and the pile itself
    g.fillStyle = 'rgba(48,34,28,0.14)';
    g.beginPath();
    g.ellipse(r.x + r.rx * 0.02, r.y + r.ry * 0.09, r.rx, r.ry, 0, 0, Math.PI * 2);
    g.fill();
    const rgg = g.createRadialGradient(r.x - r.rx * 0.22, r.y - r.ry * 0.34, r.ry * 0.1, r.x, r.y, r.rx);
    rgg.addColorStop(0, 'rgba(230,212,204,0.88)');
    rgg.addColorStop(0.72, 'rgba(206,184,178,0.82)');
    rgg.addColorStop(1, 'rgba(178,152,146,0.78)');
    g.fillStyle = rgg;
    g.beginPath();
    g.ellipse(r.x, r.y, r.rx, r.ry, 0, 0, Math.PI * 2);
    g.fill();
    // woven borders
    g.strokeStyle = 'rgba(244,234,228,0.5)';
    g.lineWidth = Math.max(2, r.ry * 0.1);
    g.beginPath();
    g.ellipse(r.x, r.y, r.rx * 0.88, r.ry * 0.84, 0, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(172,138,132,0.4)';
    g.lineWidth = Math.max(1.5, r.ry * 0.06);
    g.beginPath();
    g.ellipse(r.x, r.y, r.rx * 0.72, r.ry * 0.64, 0, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.ellipse(r.x, r.y, r.rx * 0.34, r.ry * 0.3, 0, 0, Math.PI * 2);
    g.stroke();
    // pile texture
    g.beginPath();
    g.ellipse(r.x, r.y, r.rx, r.ry, 0, 0, Math.PI * 2);
    g.clip();
    g.strokeStyle = 'rgba(158,128,122,0.16)';
    g.lineWidth = 1;
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2 + 0.4;
      const rr = 0.25 + ((i * 17) % 11) / 14;
      const cx = r.x + Math.cos(a) * r.rx * rr;
      const cy = r.y + Math.sin(a) * r.ry * rr;
      g.beginPath();
      g.moveTo(cx - r.rx * 0.035, cy);
      g.lineTo(cx + r.rx * 0.035, cy);
      g.stroke();
    }
    g.restore();
  }

  /** a small framed picture: a bit of life on the empty wall */
  private drawPicture(g: CanvasRenderingContext2D): void {
    const geo = this.geo;
    const x = geo.o === 'portrait' ? geo.w * 0.47 : geo.w * 0.345;
    const y = geo.o === 'portrait' ? geo.h * 0.11 : geo.h * 0.06;
    const fw = geo.o === 'portrait' ? geo.w * 0.15 : geo.w * 0.075;
    const fh = fw * 1.18;
    g.fillStyle = 'rgba(80,64,56,0.16)';
    this.roundRect(g, x + 3, y + 4, fw, fh, 3);
    g.fill();
    g.fillStyle = 'rgb(174,132,92)';
    this.roundRect(g, x, y, fw, fh, 3);
    g.fill();
    g.fillStyle = 'rgb(250,246,238)';
    g.fillRect(x + fw * 0.09, y + fh * 0.08, fw * 0.82, fh * 0.84);
    // a scribbled sun and a hill: a child's drawing
    g.fillStyle = 'rgb(246,206,110)';
    g.beginPath();
    g.arc(x + fw * 0.68, y + fh * 0.28, fw * 0.12, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgb(160,196,150)';
    g.beginPath();
    g.moveTo(x + fw * 0.09, y + fh * 0.72);
    g.quadraticCurveTo(x + fw * 0.4, y + fh * 0.44, x + fw * 0.91, y + fh * 0.72);
    g.lineTo(x + fw * 0.91, y + fh * 0.92);
    g.lineTo(x + fw * 0.09, y + fh * 0.92);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(120,96,72,0.5)';
    g.lineWidth = 1;
    g.strokeRect(x + fw * 0.09, y + fh * 0.08, fw * 0.82, fh * 0.84);
  }

  private drawWindow(g: CanvasRenderingContext2D): void {
    const wn = this.geo.win;
    const r = Math.min(14, wn.w * 0.1);
    // frame
    g.fillStyle = 'rgb(250,246,240)';
    this.roundRect(g, wn.x - 7, wn.y - 7, wn.w + 14, wn.h + 14, r + 4);
    g.fill();
    g.strokeStyle = 'rgba(160,148,140,0.5)';
    g.lineWidth = 1.5;
    g.stroke();

    // morning sky
    g.save();
    this.roundRect(g, wn.x, wn.y, wn.w, wn.h, r);
    g.clip();
    const sky = g.createLinearGradient(wn.x, wn.y, wn.x, wn.y + wn.h);
    sky.addColorStop(0, 'rgb(150,196,228)');
    sky.addColorStop(0.55, 'rgb(206,226,238)');
    sky.addColorStop(1, 'rgb(252,238,206)');
    g.fillStyle = sky;
    g.fillRect(wn.x, wn.y, wn.w, wn.h);
    // low sun
    const sx = wn.x + wn.w * 0.66;
    const sy = wn.y + wn.h * 0.66;
    const sg = g.createRadialGradient(sx, sy, 0, sx, sy, wn.w * 0.7);
    sg.addColorStop(0, 'rgba(255,250,222,0.98)');
    sg.addColorStop(0.2, 'rgba(255,242,196,0.6)');
    sg.addColorStop(1, 'rgba(255,236,180,0)');
    g.fillStyle = sg;
    g.fillRect(wn.x, wn.y, wn.w, wn.h);
    // a soft tree line
    g.fillStyle = 'rgba(126,158,130,0.55)';
    g.beginPath();
    g.moveTo(wn.x, wn.y + wn.h);
    for (let i = 0; i <= 8; i++) {
      const f = i / 8;
      g.lineTo(wn.x + wn.w * f, wn.y + wn.h * (0.78 - 0.1 * Math.sin(i * 1.9 + 1)));
    }
    g.lineTo(wn.x + wn.w, wn.y + wn.h);
    g.closePath();
    g.fill();
    g.restore();

    // mullions
    g.strokeStyle = 'rgb(250,246,240)';
    g.lineWidth = Math.max(5, wn.w * 0.035);
    g.beginPath();
    g.moveTo(wn.x + wn.w / 2, wn.y);
    g.lineTo(wn.x + wn.w / 2, wn.y + wn.h);
    g.moveTo(wn.x, wn.y + wn.h * 0.46);
    g.lineTo(wn.x + wn.w, wn.y + wn.h * 0.46);
    g.stroke();
    // sill
    g.fillStyle = 'rgb(238,232,224)';
    g.fillRect(wn.x - 12, wn.y + wn.h + 7, wn.w + 24, Math.max(5, wn.h * 0.045));
    g.fillStyle = 'rgba(150,138,130,0.35)';
    g.fillRect(wn.x - 12, wn.y + wn.h + 7 + Math.max(5, wn.h * 0.045), wn.w + 24, 2);
  }

  private drawDoorway(g: CanvasRenderingContext2D): void {
    const d = this.geo.door;
    // dark hall beyond
    g.fillStyle = 'rgb(58,50,54)';
    g.fillRect(d.x, d.y, d.w, d.h);
    const dg = g.createLinearGradient(d.x, d.y, d.x, d.y + d.h);
    dg.addColorStop(0, 'rgba(24,20,26,0.85)');
    dg.addColorStop(0.7, 'rgba(46,38,44,0.4)');
    dg.addColorStop(1, 'rgba(96,80,72,0.5)');
    g.fillStyle = dg;
    g.fillRect(d.x, d.y, d.w, d.h);
    // a sliver of light on the hall floor
    g.fillStyle = 'rgba(232,206,170,0.22)';
    g.fillRect(d.x, d.y + d.h - Math.max(4, d.h * 0.05), d.w, Math.max(4, d.h * 0.05));
    // frame
    g.strokeStyle = 'rgb(250,246,240)';
    g.lineWidth = Math.max(7, d.w * 0.09);
    g.beginPath();
    g.moveTo(d.x, d.y + d.h);
    g.lineTo(d.x, d.y);
    g.lineTo(d.x + d.w, d.y);
    g.lineTo(d.x + d.w, d.y + d.h);
    g.stroke();
    g.strokeStyle = 'rgba(150,138,130,0.35)';
    g.lineWidth = 1.5;
    g.stroke();
  }

  // --- bed -------------------------------------------------------------

  private bedTopPath(): Path2D {
    const p = new Path2D();
    const N = 22;
    for (let i = 0; i <= N; i++) {
      const s = this.surf(i / N, 0);
      if (i === 0) p.moveTo(s.x, s.y);
      else p.lineTo(s.x, s.y);
    }
    for (let i = 0; i <= N; i++) {
      const s = this.surf(1, i / N);
      p.lineTo(s.x, s.y);
    }
    for (let i = N; i >= 0; i--) {
      const s = this.surf(i / N, 1);
      p.lineTo(s.x, s.y);
    }
    for (let i = N; i >= 0; i--) {
      const s = this.surf(0, i / N);
      p.lineTo(s.x, s.y);
    }
    p.closePath();
    return p;
  }

  private drawBed(g: CanvasRenderingContext2D): void {
    this.drawHeadboard(g);
    this.drawBedBody(g);

    const top = this.bedTopPath();
    // sheet base
    const a = this.surf(0, 0);
    const b = this.surf(1, 1);
    const grd = g.createLinearGradient(a.x, a.y, b.x, b.y);
    grd.addColorStop(0, rgb(mix(SHEET, [255, 246, 226], 0.55 * (0.4 + this.warm * 0.6))));
    grd.addColorStop(0.5, rgb(SHEET));
    grd.addColorStop(1, rgb(mix(SHEET, [196, 192, 198], 0.45)));
    g.fillStyle = grd;
    g.fill(top);

    g.save();
    g.clip(top);
    this.drawSheetShading(g);
    this.drawWrinkles(g);
    this.drawBlanketFoot(g);
    this.drawPatDip(g);
    g.restore();
    if (this.pillow.state === 'bed') this.drawPillow(g);

    // hem along the near edge, wavy when rumpled, crisp when tucked
    this.drawHem(g);
  }

  private drawHeadboard(g: CanvasRenderingContext2D): void {
    const hb = this.geo.headboard;
    const r = Math.min(hb.h * 0.55, hb.w * 0.08);
    const wood = g.createLinearGradient(hb.x, hb.y, hb.x, hb.y + hb.h);
    wood.addColorStop(0, 'rgb(176,124,84)');
    wood.addColorStop(0.5, 'rgb(150,102,66)');
    wood.addColorStop(1, 'rgb(122,82,52)');
    g.fillStyle = wood;
    this.roundRect(g, hb.x, hb.y, hb.w, hb.h + this.geo.bedH, r);
    g.fill();
    g.fillStyle = 'rgba(255,232,196,0.3)';
    this.roundRect(g, hb.x + hb.w * 0.03, hb.y + hb.h * 0.1, hb.w * 0.94, hb.h * 0.18, r * 0.5);
    g.fill();
    // posts
    g.fillStyle = 'rgb(134,90,58)';
    for (const s of [0, 1]) {
      const x = hb.x + s * hb.w - (s ? hb.w * 0.055 : 0);
      this.roundRect(g, x, hb.y - hb.h * 0.16, hb.w * 0.055, hb.h * 1.3, hb.w * 0.027);
      g.fill();
    }
  }

  private drawBedBody(g: CanvasRenderingContext2D): void {
    const geo = this.geo;
    const { fl, fr, hl, hr, bedH } = geo;
    // the mattress side: from the near edge down
    const side = new Path2D();
    side.moveTo(hl.x, hl.y);
    side.lineTo(fl.x, fl.y);
    side.lineTo(fl.x, fl.y + bedH);
    side.lineTo(fr.x, fr.y + bedH);
    side.lineTo(fr.x, fr.y);
    side.lineTo(hr.x, hr.y);
    side.closePath();
    const sg = g.createLinearGradient(0, fl.y - bedH * 0.2, 0, fl.y + bedH * 1.2);
    sg.addColorStop(0, rgb(mix(SHEET, [206, 202, 200], 0.55)));
    sg.addColorStop(1, rgb(mix(SHEET_SHADE, [104, 102, 112], 0.45)));
    g.fillStyle = sg;
    g.fill(side);

    // the bed frame / valance below, and its shadow on the floor
    const frameTop = fl.y + bedH;
    const frameH = geo.h * (geo.o === 'portrait' ? 0.045 : 0.06);
    g.fillStyle = 'rgba(60,44,36,0.22)';
    g.beginPath();
    g.ellipse((fl.x + fr.x) / 2, frameTop + frameH * 1.15, (fr.x - fl.x) * 0.52, frameH * 0.7, 0, 0, Math.PI * 2);
    g.fill();
    const fg = g.createLinearGradient(0, frameTop, 0, frameTop + frameH);
    fg.addColorStop(0, 'rgb(162,112,74)');
    fg.addColorStop(1, 'rgb(118,78,50)');
    g.fillStyle = fg;
    g.beginPath();
    g.moveTo(fl.x, frameTop - 1);
    g.lineTo(fr.x, frameTop - 1);
    g.lineTo(fr.x - (fr.x - fl.x) * 0.02, frameTop + frameH);
    g.lineTo(fl.x + (fr.x - fl.x) * 0.02, frameTop + frameH);
    g.closePath();
    g.fill();
  }

  /** ambient shading that makes the mattress read as a solid even when flat */
  private drawSheetShading(g: CanvasRenderingContext2D): void {
    const geo = this.geo;
    // occlusion along the head edge
    const a = this.surf(0.5, 0);
    const b = this.surf(0.5, 0.26);
    const og = g.createLinearGradient(a.x, a.y, b.x, b.y);
    og.addColorStop(0, 'rgba(126,124,138,0.32)');
    og.addColorStop(1, 'rgba(126,124,138,0)');
    g.fillStyle = og;
    g.fillRect(-geo.w, a.y - 10, geo.w * 3, (b.y - a.y) + 12);
    // occlusion down the two long sides, so the crown reads
    for (const side of [0, 1]) {
      const p0 = this.surf(side, 0.5);
      const p1 = this.surf(side === 0 ? 0.22 : 0.78, 0.5);
      const sg = g.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
      sg.addColorStop(0, 'rgba(120,118,134,0.3)');
      sg.addColorStop(1, 'rgba(120,118,134,0)');
      g.fillStyle = sg;
      g.fillRect(Math.min(p0.x, p1.x) - 4, geo.hl.y - 20, Math.abs(p1.x - p0.x) + 8, geo.h);
    }
    // the sheen where the morning light lands
    const c = this.surf(0.34, 0.5);
    const rg = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, geo.w * 0.5);
    rg.addColorStop(0, `rgba(255,246,222,${0.1 + this.warm * 0.1})`);
    rg.addColorStop(1, 'rgba(255,246,222,0)');
    g.fillStyle = rg;
    g.fillRect(-geo.w, geo.hl.y - 30, geo.w * 3, geo.h);

    // a long satin sheen down the quilt, so the white reads as cloth not card
    const s0 = this.surf(0.02, 0.2);
    const s1 = this.surf(1.0, 0.72);
    const sh = g.createLinearGradient(s0.x, s0.y, s1.x, s1.y);
    sh.addColorStop(0, 'rgba(150,150,170,0.1)');
    sh.addColorStop(0.28, `rgba(255,253,246,${0.14 + this.warm * 0.08})`);
    sh.addColorStop(0.46, 'rgba(255,255,255,0)');
    sh.addColorStop(0.74, 'rgba(146,146,168,0.09)');
    sh.addColorStop(1, 'rgba(132,132,154,0.2)');
    g.fillStyle = sh;
    g.fillRect(-geo.w, geo.hl.y - 40, geo.w * 3, geo.h);

    // soft ambient darkening around the whole mattress edge
    const m = this.surf(0.5, 0.5);
    const half = Math.abs(this.surf(1, 0.5).x - this.surf(0, 0.5).x) * 0.5;
    const vg = g.createRadialGradient(m.x, m.y, half * 0.45, m.x, m.y, half * 1.12);
    vg.addColorStop(0, 'rgba(112,110,128,0)');
    vg.addColorStop(1, 'rgba(112,110,128,0.26)');
    g.fillStyle = vg;
    g.fillRect(-geo.w, geo.hl.y - 40, geo.w * 3, geo.h);

    // the turned-down hem: a band of doubled cloth folded over the quilt
    const tuck = this.tuck;
    if (tuck > 0.04) {
      const wob = (u: number): number => Math.sin(u * Math.PI) * 0.008 * tuck + (1 - tuck) * Math.sin(u * 7.3) * 0.012;
      const edge = (v: number, path: Path2D | CanvasRenderingContext2D, first: boolean): void => {
        for (let i = 0; i <= 16; i++) {
          const u = i / 16;
          const p = this.surf(u, v + wob(u));
          if (i === 0 && first) path.moveTo(p.x, p.y);
          else path.lineTo(p.x, p.y);
        }
      };
      const v0 = 0.285;
      const v1 = 0.4;
      const band = new Path2D();
      edge(v0, band, true);
      for (let i = 16; i >= 0; i--) {
        const u = i / 16;
        const p = this.surf(u, v1 + wob(u) * 0.6);
        band.lineTo(p.x, p.y);
      }
      band.closePath();
      const a0 = this.surf(0.5, v0);
      const a1 = this.surf(0.5, v1);
      const bg = g.createLinearGradient(a0.x, a0.y, a1.x, a1.y);
      bg.addColorStop(0, `rgba(255,254,250,${0.55 * tuck})`);
      bg.addColorStop(0.6, `rgba(246,244,241,${0.32 * tuck})`);
      bg.addColorStop(1, `rgba(150,148,166,${0.26 * tuck})`);
      g.fillStyle = bg;
      g.fill(band);
      // the crisp fold along the top of the hem, lit from above
      g.lineWidth = 1.4;
      g.strokeStyle = `rgba(255,255,255,${0.62 * tuck})`;
      g.beginPath();
      edge(v0 - 0.004, g, true);
      g.stroke();
      g.strokeStyle = `rgba(158,156,176,${0.4 * tuck})`;
      g.beginPath();
      edge(v0 + 0.006, g, true);
      g.stroke();
      // and the faint stitch line along the bottom of the turn-down
      g.strokeStyle = `rgba(160,158,178,${0.3 * tuck})`;
      g.lineWidth = 1;
      g.setLineDash([5, 5]);
      g.beginPath();
      for (let i = 0; i <= 16; i++) {
        const u = i / 16;
        const p = this.surf(u, v1 - 0.012 + wob(u) * 0.6);
        if (i === 0) g.moveTo(p.x, p.y);
        else g.lineTo(p.x, p.y);
      }
      g.stroke();
      g.setLineDash([]);
    }

    // a made bed keeps two long, calm creases: the memory of being folded
    const calm = this.tuck * 0.5;
    if (calm > 0.02) {
      g.strokeStyle = `rgba(150,148,164,${0.22 * calm})`;
      g.lineWidth = 1.6;
      for (const u of [0.3, 0.68]) {
        g.beginPath();
        for (let i = 0; i <= 12; i++) {
          const v = i / 12;
          const p = this.surf(u + Math.sin(v * 2.1) * 0.012, v);
          if (i === 0) g.moveTo(p.x, p.y);
          else g.lineTo(p.x, p.y);
        }
        g.stroke();
      }
    }
  }

  /** the wrinkle field, drawn as folds of cloth running across the bed */
  private drawWrinkles(g: CanvasRenderingContext2D): void {
    const amp = this.geo.crown * 3.1;
    const R = 9;
    const S = 30;
    type Sample = { x: number; y: number; h: number };
    const row: Sample[] = [];

    for (let r = 0; r < R; r++) {
      const seed = r * 3.17;
      const rowAmp = 0.62 + 0.38 * Math.abs(Math.sin(seed * 1.7 + 0.4));
      row.length = 0;
      for (let sI = 0; sI <= S; sI++) {
        const u = sI / S;
        const v = clamp((r + 0.62) / R + this.noise(u * 2.6 + seed) * 0.035, 0.01, 0.995);
        const hh = this.hAt(u, v) * rowAmp;
        const p = this.surf(u, v);
        row.push({ x: p.x, y: p.y - hh * amp, h: hh });
      }
      let i = 0;
      while (i <= S) {
        if (row[i].h < 0.06) {
          i++;
          continue;
        }
        let j = i;
        let sum = 0;
        let peak = 0;
        while (j <= S && row[j].h >= 0.06) {
          sum += row[j].h;
          peak = Math.max(peak, row[j].h);
          j++;
        }
        const n = j - i;
        if (n >= 3) {
          const mean = clamp(sum / n, 0, 1);
          const th = 2.5 + peak * amp;
          g.save();
          g.lineCap = 'round';
          g.lineJoin = 'round';
          // the crest catches the light; the cloth under it falls into shadow
          g.shadowColor = `rgba(96,90,110,${(0.95 * mean).toFixed(3)})`;
          g.shadowBlur = th * 1.0;
          g.shadowOffsetX = th * 0.28;
          g.shadowOffsetY = th * 0.7;
          g.strokeStyle = `rgba(255,255,255,${(0.95 * mean).toFixed(3)})`;
          g.lineWidth = th * 0.6;
          g.beginPath();
          for (let k = i; k < j; k++) {
            const p = row[k];
            if (k === i) g.moveTo(p.x, p.y);
            else g.lineTo(p.x, p.y);
          }
          g.stroke();
          g.restore();
        }
        i = j;
      }
    }

    // creases running the other way, so it crumples instead of corrugating
    const C = 6;
    for (let c = 1; c < C; c++) {
      const u0 = c / C + this.noise(c * 2.3) * 0.03;
      let on = false;
      let acc = 0;
      let cnt = 0;
      g.beginPath();
      for (let sI = 0; sI <= 20; sI++) {
        const v = sI / 20;
        const hh = this.hAt(u0, v);
        const p = this.surf(u0 + Math.sin(v * 5.3 + c) * 0.016, v);
        if (hh > 0.32) {
          acc += hh;
          cnt++;
          if (!on) {
            g.moveTo(p.x, p.y - hh * amp * 0.5);
            on = true;
          } else g.lineTo(p.x, p.y - hh * amp * 0.5);
        } else on = false;
      }
      if (cnt) {
        g.save();
        g.strokeStyle = `rgba(112,108,128,${(0.26 * clamp(acc / cnt, 0, 1)).toFixed(3)})`;
        g.lineWidth = 3;
        g.lineCap = 'round';
        g.shadowColor = 'rgba(255,255,255,0.5)';
        g.shadowBlur = 4;
        g.shadowOffsetX = -2;
        g.stroke();
        g.restore();
      }
    }
  }

  /** a folded blanket lying across the foot of the bed */
  private drawBlanketFoot(g: CanvasRenderingContext2D): void {
    const v0 = 0.82;
    const path = new Path2D();
    const N = 18;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const wob = (1 - this.tuck) * 0.016 * Math.sin(u * 9.1 + 1.3);
      const p = this.surf(u, v0 + wob);
      if (i === 0) path.moveTo(p.x, p.y);
      else path.lineTo(p.x, p.y);
    }
    for (let i = N; i >= 0; i--) {
      const p = this.surf(i / N, 1.001);
      path.lineTo(p.x, p.y);
    }
    path.closePath();
    const a = this.surf(0, v0);
    const b = this.surf(1, 1);
    const grd = g.createLinearGradient(a.x, a.y, b.x, b.y);
    grd.addColorStop(0, rgb(mix(BLANKET, [255, 255, 255], 0.3)));
    grd.addColorStop(1, rgb(mix(BLANKET, [46, 62, 78], 0.35)));
    g.fillStyle = grd;
    g.fill(path);
    g.save();
    g.clip(path);
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.lineWidth = 2;
    for (let i = 1; i < 6; i++) {
      const u = i / 6;
      const p0 = this.surf(u, v0);
      const p1 = this.surf(u, 1.001);
      g.beginPath();
      g.moveTo(p0.x, p0.y);
      g.lineTo(p1.x, p1.y);
      g.stroke();
    }
    g.restore();
    g.strokeStyle = 'rgba(52,70,86,0.3)';
    g.lineWidth = 1.4;
    g.stroke(path);

    // the rolled top edge of the fold
    g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const wob = (1 - this.tuck) * 0.016 * Math.sin(u * 9.1 + 1.3);
      const p = this.surf(u, v0 + wob);
      if (i === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    }
    const roll = Math.max(4, this.geo.crown * 0.7);
    g.strokeStyle = rgb(mix(BLANKET, [255, 255, 255], 0.42));
    g.lineWidth = roll;
    g.stroke();
    g.strokeStyle = rgb(mix(BLANKET, [255, 255, 255], 0.75), 0.6);
    g.lineWidth = roll * 0.35;
    g.stroke();
  }

  private drawPatDip(g: CanvasRenderingContext2D): void {
    if (this.patT < 0) return;
    const k = clamp(this.patT / 0.55, 0, 1);
    const a = Math.sin(Math.PI * k) * 0.3;
    const p = this.surf(this.patU, this.patV);
    const r = this.geo.unit * 1.5;
    const grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    grd.addColorStop(0, `rgba(150,148,160,${a})`);
    grd.addColorStop(0.6, `rgba(150,148,160,${a * 0.5})`);
    grd.addColorStop(1, 'rgba(150,148,160,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(p.x, p.y, r, r * 0.5, 0, 0, Math.PI * 2);
    g.fill();
  }

  private drawHem(g: CanvasRenderingContext2D): void {
    const N = 26;
    const tuck = this.tuck;
    g.beginPath();
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const hh = this.hAt(u, 0.99);
      const p = this.surf(u, 1);
      const wob = (1 - tuck) * (hh * this.geo.crown * 1.4 + Math.sin(u * 13.7) * this.geo.crown * 0.5);
      if (i === 0) g.moveTo(p.x, p.y - wob);
      else g.lineTo(p.x, p.y - wob);
    }
    g.strokeStyle = `rgba(150,148,158,${0.3 + tuck * 0.35})`;
    g.lineWidth = 2 + tuck * 1.6;
    g.stroke();
    g.strokeStyle = `rgba(255,255,255,${0.25 + tuck * 0.5})`;
    g.lineWidth = 1.4;
    g.beginPath();
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const hh = this.hAt(u, 0.99);
      const p = this.surf(u, 1);
      const wob = (1 - tuck) * (hh * this.geo.crown * 1.4 + Math.sin(u * 13.7) * this.geo.crown * 0.5);
      if (i === 0) g.moveTo(p.x, p.y - wob - 3);
      else g.lineTo(p.x, p.y - wob - 3);
    }
    g.stroke();
  }

  // --- pillow ----------------------------------------------------------

  private pillowCentre(): Pt {
    const p = this.pillow;
    if (p.state === 'bed') {
      const s = this.surf(p.u, p.v);
      return { x: s.x, y: s.y - this.geo.crown * 0.35 };
    }
    return { x: p.x, y: p.y };
  }

  private pillowSize(): { rx: number; ry: number } {
    const g = this.geo;
    const base = g.o === 'portrait' ? g.w * 0.165 : g.w * 0.095;
    const depth = this.pillow.state === 'bed' ? lerp(0.86, 1.12, this.pillow.v) : 1.05;
    const flat = this.pillow.state === 'floor' ? 1 : 0;
    return {
      rx: base * depth * this.pillow.squishX * (1 + flat * 0.06),
      ry: base * 0.46 * depth * this.pillow.squishY * (1 - flat * 0.16),
    };
  }

  private drawPillow(g: CanvasRenderingContext2D): void {
    const p = this.pillow;
    const c = this.pillowCentre();
    const s = this.pillowSize();
    const lift = p.state === 'held' ? 1 : 0;

    g.save();
    g.translate(c.x, c.y);
    g.rotate(p.rot);

    // shadow
    g.fillStyle = `rgba(70,64,74,${0.18 + lift * 0.1})`;
    g.beginPath();
    g.ellipse(s.rx * 0.08, s.ry * (0.75 + lift * 1.2), s.rx * (0.95 + lift * 0.1), s.ry * 0.38, 0, 0, Math.PI * 2);
    g.fill();

    // body: a soft rounded rectangle with pinched corners
    const path = new Path2D();
    const k = 0.62;
    path.moveTo(-s.rx, -s.ry * k);
    path.quadraticCurveTo(-s.rx * 1.02, -s.ry * 1.05, -s.rx * 0.52, -s.ry * 0.98);
    path.quadraticCurveTo(0, -s.ry * 0.94, s.rx * 0.52, -s.ry * 0.98);
    path.quadraticCurveTo(s.rx * 1.02, -s.ry * 1.05, s.rx, -s.ry * k);
    path.quadraticCurveTo(s.rx * 1.1, s.ry * 0.22, s.rx * 0.6, s.ry * 0.95);
    path.quadraticCurveTo(0, s.ry * 1.2, -s.rx * 0.6, s.ry * 0.95);
    path.quadraticCurveTo(-s.rx * 1.1, s.ry * 0.22, -s.rx, -s.ry * k);
    path.closePath();

    const grd = g.createLinearGradient(-s.rx * 0.5, -s.ry, s.rx * 0.6, s.ry);
    grd.addColorStop(0, 'rgb(255,253,248)');
    grd.addColorStop(0.55, 'rgb(244,240,232)');
    grd.addColorStop(1, 'rgb(212,206,202)');
    g.fillStyle = grd;
    g.fill(path);

    g.save();
    g.clip(path);
    // the dent along the middle
    g.strokeStyle = 'rgba(176,170,172,0.45)';
    g.lineWidth = s.ry * 0.16;
    g.beginPath();
    g.moveTo(-s.rx * 0.72, s.ry * 0.1);
    g.quadraticCurveTo(0, s.ry * 0.42, s.rx * 0.72, s.ry * 0.05);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = s.ry * 0.1;
    g.beginPath();
    g.moveTo(-s.rx * 0.66, -s.ry * 0.36);
    g.quadraticCurveTo(0, -s.ry * 0.12, s.rx * 0.68, -s.ry * 0.42);
    g.stroke();
    // a stitched border
    g.strokeStyle = 'rgba(190,182,186,0.5)';
    g.lineWidth = 1.2;
    g.setLineDash([4, 4]);
    g.beginPath();
    g.ellipse(0, 0, s.rx * 0.88, s.ry * 0.8, 0, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.restore();

    g.strokeStyle = 'rgba(160,154,158,0.5)';
    g.lineWidth = 1.3;
    g.stroke(path);
    g.restore();
  }

  // --- cat -------------------------------------------------------------

  private furJitter(a: number, seed: number): number {
    return this.noise(a * 2.3 + seed + this.t * 1.6) * 0.055 + this.noise(a * 5.1 + seed * 2.3) * 0.035;
  }

  /** fur colours, or the shape of a cat in a dark hall */
  private furCols(): [RGB, RGB, RGB] {
    if (this.sil < 0.01) return [FUR, FUR_DARK, FUR_LIGHT];
    const k = this.sil * 0.93;
    return [mix(FUR, [34, 28, 38], k), mix(FUR_DARK, [22, 18, 28], k), mix(FUR_LIGHT, [48, 42, 54], k)];
  }

  private drawCat(g: CanvasRenderingContext2D): void {
    const c = this.cat;
    if (c.mode === 'hidden') return;
    const geo = this.geo;
    const u = geo.unit * c.scale;
    if (this.sil > 0.01) {
      // never spills out of the doorway: it is still in there
      const d = geo.door;
      g.save();
      g.beginPath();
      g.rect(d.x + 2, d.y, d.w - 4, d.h + geo.h * 0.03);
      g.rect(-geo.w, d.y + d.h, geo.w * 3, geo.h);
      g.clip('evenodd');
      this.drawTail(g, u);
      this.drawCatBody(g, c.x, c.y - c.z, u, false);
      g.restore();
      return;
    }

    // motion blur ghosts while it sprints and leaps
    for (const tr of c.trail) {
      g.save();
      g.globalAlpha = 0.16 * clamp(tr.a, 0, 1);
      this.drawCatBody(g, tr.x, tr.y - tr.z, geo.unit * tr.s, true);
      g.restore();
    }

    // shadow on whatever it is standing on
    const groundY = c.y + (c.limp > 0.3 ? u * 2.4 * c.limp : 0);
    if (c.limp < 0.9) {
      const lift = clamp(1 - c.z / (geo.h * 0.2), 0.25, 1);
      g.fillStyle = `rgba(60,48,46,${0.26 * lift})`;
      g.beginPath();
      g.ellipse(c.x + c.z * 0.06, groundY + u * 0.05, u * (1.15 - c.curl * 0.15) * lift, u * 0.3 * lift, 0, 0, Math.PI * 2);
      g.fill();
    }

    const wrapped = c.curl > 0.45 || c.belly > 0.4;
    if (!wrapped) this.drawTail(g, u);
    this.drawCatBody(g, c.x, c.y - c.z, u, false);
    if (wrapped) this.drawTail(g, u);
  }

  /** the whole animal, posed from the blend factors */
  private drawCatBody(g: CanvasRenderingContext2D, x: number, y: number, u: number, ghost: boolean): void {
    const c = this.cat;
    const [FUR, FUR_DARK, FUR_LIGHT] = this.furCols();
    const curl = c.curl;
    const limp = c.limp;
    const belly = c.belly;
    const f = c.facing;

    // body centre, above the ground anchor
    const bodyOffY = lerp(lerp(0.82, 0.66, curl), -0.62, limp);
    const cx = x;
    const cy = y - u * bodyOffY - u * c.crouch * -0.04;
    const rx = u * lerp(lerp(1.02, 0.86, curl), 0.56, limp) * c.sx * (1 + belly * 0.34);
    const ry = u * lerp(lerp(0.56, 0.78, curl), 1.18, limp) * c.sy * (1 - belly * 0.3);

    g.save();
    g.translate(cx, cy);
    g.rotate(c.spin + (belly > 0.05 ? belly * 0.06 * f : 0));

    // ---- back legs ------------------------------------------------------
    const legVis = (1 - curl * 0.75) * (1 - limp * 0.15);
    const step = Math.sin(c.legPhase);
    const step2 = Math.sin(c.legPhase + 2.1);
    const legLen = u * lerp(lerp(0.62, 0.2, curl), 1.0, limp);
    const drawLeg = (hx: number, hy: number, ph: number, front: boolean): void => {
      if (legVis < 0.05 && belly < 0.1) return;
      const swing = c.speed > 5 ? ph * 0.42 : Math.sin(this.t * 1.6 + hx) * 0.03;
      // standing / walking
      let px2 = hx + swing * u * 0.7 + (limp > 0.01 ? Math.sin(this.t * 3.2 + hx) * u * 0.12 * limp : 0);
      let py2 = hy + legLen + (c.speed > 5 ? Math.abs(ph) * u * 0.18 : 0);
      let bend = 0.62;
      if (belly > 0.05) {
        // rolled over: all four paws up in the air, splayed and slack
        const wob = Math.sin(this.t * 2.4 + hx * 0.1 + (front ? 0 : 1.9)) * u * 0.055;
        const spread = hx > 0 === f > 0 ? 1 : -1; // front pair leans one way, back pair the other
        const bx2 = hx * 0.9 + spread * u * 0.2 + wob;
        const by2 = -ry - u * (front ? 0.78 : 0.66) + wob * 0.7;
        px2 = lerp(px2, bx2, belly);
        py2 = lerp(py2, by2, belly);
        bend = lerp(bend, 0.16, belly);
      }
      if (c.knead > 0.05 && front && curl > 0.4) {
        py2 += Math.sin(this.t * 7.5 + (hx > 0 ? 0 : 1.6)) * u * 0.07 * c.knead;
      }
      g.strokeStyle = rgb(mix(FUR, FUR_DARK, front ? 0.05 : 0.3 + belly * 0.16));
      g.lineWidth = u * (0.3 - belly * 0.06);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(hx, hy);
      g.quadraticCurveTo(hx + (px2 - hx) * 0.2 - f * u * 0.24 * belly, hy + (py2 - hy) * bend, px2, py2);
      g.stroke();
      // paw — bigger and pink-padded in the air, where it is the whole joke
      g.fillStyle = rgb(FUR_LIGHT);
      g.beginPath();
      g.ellipse(px2, py2, u * (0.17 + belly * 0.05), u * (0.13 + belly * 0.05), 0, 0, Math.PI * 2);
      g.fill();
      if (belly > 0.4 && !ghost) {
        g.fillStyle = `rgba(238,164,166,${0.85 * belly})`;
        g.beginPath();
        g.ellipse(px2, py2 + u * 0.03, u * 0.09, u * 0.07, 0, 0, Math.PI * 2);
        g.fill();
        for (let k = -1; k <= 1; k++) {
          g.beginPath();
          g.ellipse(px2 + k * u * 0.075, py2 - u * 0.05, u * 0.032, u * 0.028, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
    };
    const hipY = lerp(ry * 0.3, -ry * 0.42, belly);
    const backLegs = (): void => {
      drawLeg(-f * rx * 0.62, hipY, step, false);
      drawLeg(-f * rx * 0.28, hipY + ry * 0.04, step2, false);
    };
    if (belly < 0.4) backLegs();

    // ---- body -----------------------------------------------------------
    const body = new Path2D();
    const N = 30;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const j = ghost ? 0 : this.furJitter(a, 3.1);
      const px2 = Math.cos(a) * rx * (1 + j);
      const py2 = Math.sin(a) * ry * (1 + j) - (curl > 0.2 ? Math.cos(a) * 0 : 0);
      if (i === 0) body.moveTo(px2, py2);
      else body.lineTo(px2, py2);
    }
    body.closePath();

    const grd = g.createLinearGradient(-rx * 0.4, -ry, rx * 0.4, ry);
    grd.addColorStop(0, rgb(mix(FUR, FUR_LIGHT, 0.5)));
    grd.addColorStop(0.55, rgb(FUR));
    grd.addColorStop(1, rgb(mix(FUR, FUR_DARK, 0.75)));
    g.fillStyle = grd;
    g.fill(body);

    g.save();
    g.clip(body);
    // tabby stripes
    if (!ghost) {
      g.strokeStyle = rgb(FUR_DARK, 0.55 * (1 - belly * 0.8));
      g.lineWidth = u * 0.13;
      g.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const t0 = -0.5 + i * 0.32;
        g.beginPath();
        g.moveTo(rx * t0 * f, -ry * 1.1);
        g.quadraticCurveTo(rx * (t0 + 0.1) * f, 0, rx * (t0 - 0.02) * f, ry * 0.55);
        g.stroke();
      }
      if (belly > 0.05) {
        // rolled over: the whole pale underside faces the camera
        g.fillStyle = rgb(FUR_LIGHT, 0.95 * belly);
        g.beginPath();
        g.ellipse(-f * rx * 0.05, ry * 0.06, rx * 0.84, ry * 0.9, 0, 0, Math.PI * 2);
        g.fill();
        // ribs / the soft fold of a relaxed tummy
        g.strokeStyle = `rgba(214,168,124,${0.3 * belly})`;
        g.lineWidth = u * 0.045;
        for (let i = -1; i <= 1; i++) {
          g.beginPath();
          g.moveTo(-f * rx * 0.34 + i * rx * 0.24, -ry * 0.2);
          g.quadraticCurveTo(-f * rx * 0.3 + i * rx * 0.24, ry * 0.2, -f * rx * 0.38 + i * rx * 0.24, ry * 0.52);
          g.stroke();
        }
        // the darker back of the cat, still showing along the far edge
        const bk = g.createLinearGradient(0, ry * 0.2, 0, ry * 1.05);
        bk.addColorStop(0, rgb(FUR_DARK, 0));
        bk.addColorStop(1, rgb(FUR_DARK, 0.5 * belly));
        g.fillStyle = bk;
        g.fillRect(-rx * 1.1, ry * 0.2, rx * 2.2, ry);
      }
      // belly / chest cream
      const cy2 = lerp(ry * 0.42, -ry * 0.1, belly);
      const cg = g.createRadialGradient(f * rx * 0.24, cy2, 0, f * rx * 0.24, cy2, rx * lerp(0.75, 1.05, belly));
      cg.addColorStop(0, rgb(FUR_LIGHT, lerp(0.8, 1, belly)));
      cg.addColorStop(lerp(0.4, 0.68, belly), rgb(FUR_LIGHT, lerp(0.45, 0.95, belly)));
      cg.addColorStop(1, rgb(FUR_LIGHT, 0));
      g.fillStyle = cg;
      g.fillRect(-rx * 1.1, -ry * 1.1, rx * 2.2, ry * 2.2);
    }
    g.restore();

    // fur fringe
    if (!ghost) {
      g.strokeStyle = rgb(mix(FUR, FUR_DARK, 0.45), 0.5);
      g.lineWidth = u * 0.03;
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * Math.PI * 2 + 0.1;
        const j = this.furJitter(a, 3.1);
        const r0x = Math.cos(a) * rx * (1 + j);
        const r0y = Math.sin(a) * ry * (1 + j);
        const l = u * (0.012 + 0.022 * Math.abs(Math.sin(a * 3 + this.t)));
        g.beginPath();
        g.moveTo(r0x * 0.94, r0y * 0.94);
        g.lineTo(r0x + Math.cos(a) * l, r0y + Math.sin(a) * l);
        g.stroke();
      }
      g.strokeStyle = rgb(mix(FUR, FUR_DARK, 0.6), 0.5);
      g.lineWidth = u * 0.045;
      g.stroke(body);
    }

    // ---- front legs -----------------------------------------------------
    if (belly >= 0.4) backLegs();
    drawLeg(f * rx * 0.32, hipY + ry * 0.02, -step, true);
    drawLeg(f * rx * 0.62, hipY - ry * 0.04, -step2, true);

    // ---- head -----------------------------------------------------------
    const headR = u * 0.5 * (1 + belly * 0.02);
    let hx = f * rx * lerp(lerp(0.78, 0.62, curl), 0.05, limp);
    let hy = -ry * lerp(lerp(0.72, 0.28, curl), 0.92, limp);
    if (belly > 0.05) {
      hx = lerp(hx, f * rx * 0.88, belly);
      hy = lerp(hy, ry * 0.3, belly);
    }
    const headTilt = f * 1.35 * belly + (limp > 0.1 ? -f * 0.2 * limp : 0) + (curl > 0.5 ? f * 0.2 * curl : 0);
    this.drawHead(g, hx, hy, headR, headTilt, ghost);

    g.restore();
  }

  private drawHead(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    tilt: number,
    ghost: boolean,
  ): void {
    const c = this.cat;
    const [FUR, FUR_DARK, FUR_LIGHT] = this.furCols();
    const f = c.facing;
    g.save();
    g.translate(x, y);
    g.rotate(tilt);

    // ears
    const ear = (side: number): void => {
      const up = c.earUp;
      const bx = side * r * 0.62;
      const by = -r * 0.62;
      const tipY = -r * (0.72 + 0.62 * up);
      const tipX = side * r * (0.78 + 0.1 * up);
      g.fillStyle = rgb(mix(FUR, FUR_DARK, 0.25));
      g.beginPath();
      g.moveTo(bx - side * r * 0.3, by + r * 0.16);
      g.quadraticCurveTo(tipX - side * r * 0.1, tipY, tipX, tipY + r * 0.06);
      g.quadraticCurveTo(bx + side * r * 0.42, by + r * 0.1, bx + side * r * 0.3, by + r * 0.3);
      g.closePath();
      g.fill();
      if (ghost) return;
      g.fillStyle = 'rgba(244,168,170,0.85)';
      g.beginPath();
      g.moveTo(bx - side * r * 0.12, by + r * 0.16);
      g.quadraticCurveTo(tipX - side * r * 0.16, tipY + r * 0.18, bx + side * r * 0.28, by + r * 0.22);
      g.closePath();
      g.fill();
    };
    ear(-1);
    ear(1);

    // skull
    const head = new Path2D();
    const N = 24;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const j = ghost ? 0 : this.furJitter(a, 8.7) * 0.7;
      head.lineTo(Math.cos(a) * r * 1.02 * (1 + j), Math.sin(a) * r * 0.9 * (1 + j));
    }
    head.closePath();
    const grd = g.createLinearGradient(-r, -r, r, r);
    grd.addColorStop(0, rgb(mix(FUR, FUR_LIGHT, 0.45)));
    grd.addColorStop(1, rgb(mix(FUR, FUR_DARK, 0.45)));
    g.fillStyle = grd;
    g.fill(head);

    // muzzle
    g.fillStyle = rgb(FUR_LIGHT, 0.95);
    g.beginPath();
    g.ellipse(f * r * 0.3, r * 0.34, r * 0.46, r * 0.32, 0, 0, Math.PI * 2);
    g.fill();

    if (!ghost) {
      // stripes on the forehead
      g.strokeStyle = rgb(FUR_DARK, 0.5);
      g.lineWidth = r * 0.1;
      g.lineCap = 'round';
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(i * r * 0.28, -r * 0.82);
        g.lineTo(i * r * 0.34, -r * 0.44);
        g.stroke();
      }
    }

    // eyes
    const open = clamp(c.eyeOpen, 0, 1);
    const eyeY = -r * 0.02;
    for (const s of [-1, 1] as const) {
      const ex = s * r * 0.4 + f * r * 0.1;
      if (open < 0.14) {
        g.strokeStyle = 'rgb(84,60,44)';
        g.lineWidth = r * 0.1;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(ex - r * 0.22, eyeY);
        g.quadraticCurveTo(ex, eyeY + r * 0.13, ex + r * 0.22, eyeY);
        g.stroke();
        continue;
      }
      if (this.sil > 0.2) {
        const gl = g.createRadialGradient(ex, eyeY, 0, ex, eyeY, r * 0.8);
        gl.addColorStop(0, `rgba(214,246,170,${0.6 * this.sil})`);
        gl.addColorStop(1, 'rgba(214,246,170,0)');
        g.fillStyle = gl;
        g.beginPath();
        g.arc(ex, eyeY, r * 0.8, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = this.sil > 0.2 ? 'rgb(214,246,170)' : 'rgb(174,214,150)';
      g.beginPath();
      g.ellipse(ex, eyeY, r * 0.26, r * 0.24 * open, 0, 0, Math.PI * 2);
      g.fill();
      // slit pupil, tracking the finger
      g.fillStyle = 'rgb(40,34,32)';
      g.beginPath();
      g.ellipse(
        ex + c.pupilX * r * 0.1,
        eyeY + c.pupilY * r * 0.08,
        r * 0.085 * (1 + (1 - open) * 0.6),
        r * 0.2 * open,
        0,
        0,
        Math.PI * 2,
      );
      g.fill();
      if (!ghost) {
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.beginPath();
        g.arc(ex - r * 0.08, eyeY - r * 0.08 * open, r * 0.05, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = 'rgba(92,64,44,0.55)';
      g.lineWidth = r * 0.05;
      g.beginPath();
      g.ellipse(ex, eyeY, r * 0.26, r * 0.24 * open, 0, 0, Math.PI * 2);
      g.stroke();
    }

    // nose + mouth
    g.fillStyle = 'rgb(226,140,142)';
    g.beginPath();
    g.moveTo(f * r * 0.24 - r * 0.1, r * 0.2);
    g.lineTo(f * r * 0.24 + r * 0.1, r * 0.2);
    g.lineTo(f * r * 0.24, r * 0.32);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(96,66,50,0.6)';
    g.lineWidth = r * 0.055;
    g.beginPath();
    g.moveTo(f * r * 0.24, r * 0.32);
    g.lineTo(f * r * 0.24, r * 0.42);
    g.moveTo(f * r * 0.24, r * 0.42);
    g.quadraticCurveTo(f * r * 0.24 - r * 0.16, r * 0.5, f * r * 0.24 - r * 0.26, r * 0.38);
    g.moveTo(f * r * 0.24, r * 0.42);
    g.quadraticCurveTo(f * r * 0.24 + r * 0.16, r * 0.5, f * r * 0.24 + r * 0.26, r * 0.38);
    g.stroke();

    // whiskers
    if (!ghost) {
      g.strokeStyle = 'rgba(255,255,255,0.72)';
      g.lineWidth = r * 0.035;
      for (const s of [-1, 1] as const) {
        for (let i = 0; i < 3; i++) {
          const a = -0.22 + i * 0.2 + Math.sin(this.t * 1.5 + i) * 0.03;
          g.beginPath();
          g.moveTo(f * r * 0.2 + s * r * 0.2, r * 0.3);
          g.quadraticCurveTo(
            f * r * 0.2 + s * r * 0.8,
            r * 0.3 + a * r,
            f * r * 0.2 + s * r * 1.35,
            r * 0.24 + a * r * 1.8,
          );
          g.stroke();
        }
      }
    }
    g.restore();
  }

  /** the tail lives in world space, four segments of verlet chain */
  private drawTail(g: CanvasRenderingContext2D, u: number): void {
    const c = this.cat;
    const [FUR, FUR_DARK, FUR_LIGHT] = this.furCols();
    const pts = c.tail;
    g.save();
    g.lineCap = 'round';
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const w = u * (0.165 - i * 0.028);
      g.strokeStyle = rgb(mix(FUR, FUR_DARK, 0.15 + i * 0.12));
      g.lineWidth = Math.max(1.5, w * 2);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    // a light tip
    const tip = pts[pts.length - 1];
    g.fillStyle = rgb(FUR_LIGHT);
    g.beginPath();
    g.arc(tip.x, tip.y, Math.max(1.4, u * 0.075), 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // --- foreground / light ----------------------------------------------

  private drawForeground(g: CanvasRenderingContext2D): void {
    const par = (this.camZ - 1) * 90;
    g.save();
    g.translate(0, par);
    this.drawBasket(g);
    this.drawStool(g);
    if (this.pillow.state !== 'bed') this.drawPillow(g);
    g.restore();
  }

  private drawBasket(g: CanvasRenderingContext2D): void {
    const b = this.geo.basket;
    const woven: RGB = [206, 168, 116];
    const dark = mix(woven, [86, 60, 34], 0.42);
    // shadow
    g.fillStyle = 'rgba(60,44,36,0.22)';
    g.beginPath();
    g.ellipse(b.x, b.y + b.ry * 1.5, b.rx * 1.05, b.ry * 0.5, 0, 0, Math.PI * 2);
    g.fill();
    // back rim
    g.fillStyle = rgb(dark);
    g.beginPath();
    g.ellipse(b.x, b.y - b.ry * 0.5, b.rx, b.ry * 0.62, 0, 0, Math.PI * 2);
    g.fill();
    // a cushion inside
    g.fillStyle = 'rgb(206,158,160)';
    g.beginPath();
    g.ellipse(b.x, b.y - b.ry * 0.28, b.rx * 0.82, b.ry * 0.52, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,228,226,0.5)';
    g.beginPath();
    g.ellipse(b.x - b.rx * 0.2, b.y - b.ry * 0.42, b.rx * 0.4, b.ry * 0.22, 0, 0, Math.PI * 2);
    g.fill();
    // front body
    const bg = g.createLinearGradient(0, b.y - b.ry, 0, b.y + b.ry * 1.8);
    bg.addColorStop(0, rgb(mix(woven, [255, 238, 206], 0.35)));
    bg.addColorStop(1, rgb(dark));
    g.fillStyle = bg;
    g.beginPath();
    g.moveTo(b.x - b.rx, b.y - b.ry * 0.5);
    g.lineTo(b.x - b.rx * 0.84, b.y + b.ry * 1.1);
    g.quadraticCurveTo(b.x, b.y + b.ry * 1.85, b.x + b.rx * 0.84, b.y + b.ry * 1.1);
    g.lineTo(b.x + b.rx, b.y - b.ry * 0.5);
    g.closePath();
    g.fill();
    g.strokeStyle = rgb(dark, 0.6);
    g.lineWidth = 1.5;
    for (let i = 1; i <= 3; i++) {
      const yy = b.y - b.ry * 0.2 + i * b.ry * 0.46;
      g.beginPath();
      g.moveTo(b.x - b.rx * (0.98 - i * 0.04), yy);
      g.quadraticCurveTo(b.x, yy + b.ry * 0.3, b.x + b.rx * (0.98 - i * 0.04), yy);
      g.stroke();
    }
    g.strokeStyle = rgb(mix(woven, [255, 246, 220], 0.5));
    g.lineWidth = Math.max(3, b.ry * 0.3);
    g.beginPath();
    g.ellipse(b.x, b.y - b.ry * 0.5, b.rx, b.ry * 0.62, 0, Math.PI * 0.02, Math.PI * 0.98);
    g.stroke();
  }

  private drawStool(g: CanvasRenderingContext2D): void {
    const s = this.geo.stool;
    g.fillStyle = 'rgba(60,44,36,0.2)';
    g.beginPath();
    g.ellipse(s.x, s.y + s.ry * 2.6, s.rx * 0.95, s.ry * 0.5, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgb(140,96,62)';
    g.lineWidth = Math.max(3, s.rx * 0.11);
    for (const d of [-0.72, 0.72]) {
      g.beginPath();
      g.moveTo(s.x + s.rx * d * 0.8, s.y + s.ry * 0.4);
      g.lineTo(s.x + s.rx * d, s.y + s.ry * 2.6);
      g.stroke();
    }
    const tg = g.createLinearGradient(0, s.y - s.ry, 0, s.y + s.ry);
    tg.addColorStop(0, 'rgb(196,146,102)');
    tg.addColorStop(1, 'rgb(150,102,64)');
    g.fillStyle = tg;
    g.beginPath();
    g.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,236,204,0.35)';
    g.beginPath();
    g.ellipse(s.x - s.rx * 0.2, s.y - s.ry * 0.3, s.rx * 0.5, s.ry * 0.4, 0, 0, Math.PI * 2);
    g.fill();
  }

  private drawMotes(g: CanvasRenderingContext2D): void {
    for (const m of this.beamMotes) {
      const inBeam = this.beamAlphaAt(m.x, m.y);
      if (inBeam < 0.02) continue;
      g.fillStyle = `rgba(255,246,218,${0.5 * inBeam})`;
      g.beginPath();
      g.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      g.fill();
    }
    for (const m of this.motes) {
      const a = clamp(m.life / m.max, 0, 1);
      g.fillStyle = `rgba(252,244,224,${0.55 * a})`;
      g.beginPath();
      g.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      g.fill();
    }
  }

  /** the shaft of morning light: a slanted band from the window */
  private beamAlphaAt(x: number, y: number): number {
    const g = this.geo;
    const wn = g.win;
    const cx = wn.x + wn.w * 0.5;
    const cy = wn.y + wn.h * 0.62;
    const dx = x - cx;
    const dy = y - cy;
    const dir = { x: 0.52, y: 0.855 };
    const along = dx * dir.x + dy * dir.y;
    if (along < 0) return 0;
    const across = Math.abs(dx * -dir.y + dy * dir.x);
    const half = wn.w * 0.62 + along * 0.32;
    return clamp(1 - across / half, 0, 1) * clamp(1 - along / (g.h * 1.1), 0, 1);
  }

  private drawLight(g: CanvasRenderingContext2D): void {
    const geo = this.geo;
    const { w, h } = geo;
    const wn = geo.win;
    const cx = wn.x + wn.w * 0.5;
    const cy = wn.y + wn.h * 0.62;
    // direction of the shaft, and the axis across it
    const dx = 0.52;
    const dy = 0.855;
    const nx = -dy;
    const ny = dx;
    const half = wn.w * 0.62;
    const far = h * 1.5;
    const str = 0.07 + this.warm * 0.04;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const STRIPS = 14;
    for (let i = 0; i < STRIPS; i++) {
      const t0 = (i / STRIPS) * 2 - 1;
      const t1 = ((i + 1) / STRIPS) * 2 - 1;
      const prof = Math.pow(Math.cos((t0 + t1) * 0.5 * Math.PI * 0.5), 2);
      const spread = 1 + 1.35;
      const a0x = cx + nx * half * t0;
      const a0y = cy + ny * half * t0;
      const a1x = cx + nx * half * t1;
      const a1y = cy + ny * half * t1;
      const grd = g.createLinearGradient(cx, cy, cx + dx * far, cy + dy * far);
      grd.addColorStop(0, `rgba(255,242,204,${(str * prof).toFixed(4)})`);
      grd.addColorStop(0.45, `rgba(255,236,190,${(str * prof * 0.7).toFixed(4)})`);
      grd.addColorStop(1, 'rgba(255,232,178,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(a0x, a0y);
      g.lineTo(a1x, a1y);
      g.lineTo(a1x + nx * half * (spread - 1) * t1 + dx * far, a1y + ny * half * (spread - 1) * t1 + dy * far);
      g.lineTo(a0x + nx * half * (spread - 1) * t0 + dx * far, a0y + ny * half * (spread - 1) * t0 + dy * far);
      g.closePath();
      g.fill();
    }
    // a pool of light on the floor where the shaft lands
    const px = cx + dx * h * 0.62;
    const py = cy + dy * h * 0.62;
    const pg = g.createRadialGradient(px, py, 0, px, py, w * 0.42);
    pg.addColorStop(0, `rgba(255,238,190,${0.06 + this.warm * 0.04})`);
    pg.addColorStop(1, 'rgba(255,232,178,0)');
    g.fillStyle = pg;
    g.beginPath();
    g.ellipse(px, py, w * 0.42, h * 0.2, 0.32, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // a warm wash that grows as the bed gets made
    if (this.warm > 0.02) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(255,224,168,${0.035 * this.warm})`;
      g.fillRect(-w, -h, w * 3, h * 3);
      g.restore();
    }

    const v = g.createRadialGradient(w * 0.5, h * 0.55, Math.min(w, h) * 0.38, w * 0.5, h * 0.55, Math.max(w, h) * 0.8);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(32,22,26,0.26)');
    g.fillStyle = v;
    g.fillRect(-w, -h, w * 3, h * 3);
  }

  private roundRect(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    const rr = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + rr, y);
    g.arcTo(x + w, y, x + w, y + h, rr);
    g.arcTo(x + w, y + h, x, y + h, rr);
    g.arcTo(x, y + h, x, y, rr);
    g.arcTo(x, y, x + w, y, rr);
    g.closePath();
  }

  // ------------------------------------------------------------- dev

  private poseCurledOn(u: number, v: number): void {
    const c = this.cat;
    this.settleCatOn(u, v);
    c.mode = 'curl';
    c.mt = 2.2;
    c.curl = 1;
    c.limp = 0;
    c.belly = 0;
    c.eyeOpen = 0.08;
    c.purr = 1;
    c.sx = 1;
    c.sy = 1;
    c.spin = 0;
    this.resetTail();
    for (let i = 0; i < 90; i++) this.stepTail(1 / 90);
  }

  readonly devActions: DevAction[] = [
    { name: 'sheet:smooth', run: () => { this.flatten(); this.tuck = 1; } },
    { name: 'sheet:rumple', run: () => { this.rumple(0.95, 3); this.tuck = 0; } },
    {
      name: 'pillow:place',
      run: () => {
        this.pillowToHead();
        this.pushWave(0.5, 0.2, 0.2, 0.5);
        this.ctx.audio.flump(0);
      },
    },
    {
      name: 'cat:pounce',
      run: () => {
        if (this.cat.mode === 'hidden') this.catPeek();
        this.catAt(this.geo.launch.x, this.geo.launch.y);
        this.startLeap();
      },
    },
    {
      name: 'cat:return',
      run: () => {
        this.cat.mode = 'sit';
        this.cat.mt = 9;
        this.cat.waitFor = 0;
      },
    },
    {
      name: 'demo:mid-drag',
      run: () => {
        // the cat dangling from the finger, long and limp
        const g = this.geo;
        this.px = g.o === 'portrait' ? g.w * 0.5 : g.w * 0.42;
        this.py = g.o === 'portrait' ? g.h * 0.52 : g.h * 0.36;
        this.hasPointer = true;
        this.flatten();
        this.tuck = 1;
        this.pillowToHead();
        this.cat.x = this.px;
        this.cat.y = this.py;
        this.cat.z = 0;
        this.cat.onBed = false;
        this.cat.scale = 1;
        this.cat.facing = 1;
        this.cat.mode = 'held';
        this.cat.mt = 1;
        this.cat.curl = 0;
        this.cat.belly = 0;
        this.cat.limp = 1;
        this.cat.eyeOpen = 1;
        this.cat.sx = 1;
        this.cat.sy = 1;
        this.cat.spin = 0;
        this.cat.grabDX = 0;
        this.cat.grabDY = 0;
        this.heldCat = true;
        this.resetTail();
        for (let i = 0; i < 120; i++) this.stepTail(1 / 120);
      },
    },
    {
      name: 'fail:cat-on-pillow',
      run: () => {
        this.ctx.phase.set('resolve');
        this.ctx.phase.intervening = true;
        this.flatten();
        this.tuck = 1;
        this.pillowToHead();
        this.pillow.squishY = 0.78;
        this.pillow.squishX = 1.12;
        this.spotIndex = 1;
        const s = this.spot(1);
        this.poseCurledOn(s.u, s.v);
        this.crumpleAt(s.u, s.v, 0.5, 0.36);
        this.crumpleAt(0.5, 0.62, 0.22, 0.7);
        this.warm = 1;
        this.done = true;
      },
    },
    {
      name: 'fail:cat-belly-up',
      run: () => {
        this.ctx.phase.set('comic');
        this.flatten();
        this.pillowToHead();
        this.poseCurledOn(0.5, 0.66);
        const c = this.cat;
        c.mode = 'belly';
        c.mt = 1.6;
        c.belly = 1;
        c.curl = 0.25;
        c.eyeOpen = 0.16;
        c.spin = 0.24;
        this.rumple(0.45, 5);
        this.crumpleAt(0.5, 0.66, 0.75, 0.55);
        this.tuck = 0.2;
        this.warm = 1;
        this.done = true;
        this.comicT = 2;
        for (let i = 0; i < 90; i++) this.stepTail(1 / 90);
      },
    },
  ];

  /**
   * How this lap reads once the comic beat is up: the cat kept the bed, or the
   * child carried it off and it stayed off. Before the comic beat: undecided.
   */
  private endingName(): 'cat-won' | 'cat-moved' | 'none' {
    if (!this.ctx.phase.is('comic', 'settle')) return 'none';
    return this.catMoved && !this.cat.onBed ? 'cat-moved' : 'cat-won';
  }

  devState(): Record<string, unknown> {
    return {
      phase: this.ctx.phase.name,
      phaseT: +this.ctx.phase.t.toFixed(2),
      intervening: this.ctx.phase.intervening,
      seed: this.rng.seed,
      orientation: this.geo?.o,
      sil: +this.sil.toFixed(2),
      smoothness: +this.smoothness.toFixed(3),
      tuck: +this.tuck.toFixed(2),
      pats: this.pats,
      done: this.done,
      admire: +this.admire.toFixed(2),
      waves: this.waves.length,
      pillow: {
        state: this.pillow.state,
        u: +this.pillow.u.toFixed(2),
        v: +this.pillow.v.toFixed(2),
        x: Math.round(this.pillowCentre().x),
        y: Math.round(this.pillowCentre().y),
        rx: Math.round(this.pillowSize().rx),
      },
      cat: {
        mode: this.cat.mode,
        mt: +this.cat.mt.toFixed(2),
        onBed: this.cat.onBed,
        u: +this.cat.bedU.toFixed(2),
        v: +this.cat.bedV.toFixed(2),
        curl: +this.cat.curl.toFixed(2),
        limp: +this.cat.limp.toFixed(2),
        belly: +this.cat.belly.toFixed(2),
        seat: this.cat.seat,
      },
      ending: this.endingName(),
      catMoved: this.catMoved,
      spotIndex: this.spotIndex,
      motes: this.motes.length,
      held: this.heldCat ? 'cat' : this.heldPillow ? 'pillow' : this.stroking ? 'sheet' : null,
    };
  }

  // ------------------------------------------------------------- hub tile

  thumbnail(g: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    // a small bed, a window, and a cat that flicks its tail and slow-blinks
    const wall = g.createLinearGradient(0, 0, 0, h * 0.55);
    wall.addColorStop(0, 'rgb(240,230,216)');
    wall.addColorStop(1, 'rgb(224,212,200)');
    g.fillStyle = wall;
    g.fillRect(0, 0, w, h * 0.55);
    g.fillStyle = 'rgb(186,150,112)';
    g.fillRect(0, h * 0.55, w, h * 0.45);

    // window
    g.fillStyle = 'rgb(206,226,238)';
    g.fillRect(w * 0.08, h * 0.1, w * 0.26, h * 0.27);
    g.fillStyle = 'rgba(255,246,206,0.9)';
    g.beginPath();
    g.arc(w * 0.28, h * 0.3, h * 0.07, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgb(250,246,240)';
    g.lineWidth = Math.max(2, w * 0.016);
    g.strokeRect(w * 0.08, h * 0.1, w * 0.26, h * 0.27);
    g.beginPath();
    g.moveTo(w * 0.21, h * 0.1);
    g.lineTo(w * 0.21, h * 0.37);
    g.stroke();

    // light shaft
    const lg = g.createLinearGradient(w * 0.2, h * 0.2, w * 0.8, h * 0.9);
    lg.addColorStop(0, 'rgba(255,240,196,0.5)');
    lg.addColorStop(1, 'rgba(255,232,178,0)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(w * 0.06, h * 0.12);
    g.lineTo(w * 0.36, h * 0.1);
    g.lineTo(w * 1.1, h * 0.92);
    g.lineTo(w * 0.5, h);
    g.closePath();
    g.fill();

    // headboard + bed
    g.fillStyle = 'rgb(150,102,66)';
    g.fillRect(w * 0.16, h * 0.44, w * 0.68, h * 0.1);
    const bed = new Path2D();
    bed.moveTo(w * 0.18, h * 0.54);
    bed.lineTo(w * 0.82, h * 0.54);
    bed.lineTo(w * 0.95, h * 0.84);
    bed.lineTo(w * 0.05, h * 0.84);
    bed.closePath();
    g.fillStyle = 'rgb(246,244,238)';
    g.fill(bed);
    g.fillStyle = 'rgb(214,208,204)';
    g.fillRect(w * 0.05, h * 0.84, w * 0.9, h * 0.05);
    // pillow
    g.fillStyle = 'rgb(255,253,248)';
    g.beginPath();
    g.ellipse(w * 0.34, h * 0.59, w * 0.13, h * 0.05, -0.05, 0, Math.PI * 2);
    g.fill();
    // a couple of folds
    g.strokeStyle = 'rgba(150,148,160,0.35)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const y = h * (0.66 + i * 0.055);
      g.beginPath();
      g.moveTo(w * (0.12 - i * 0.02), y);
      g.quadraticCurveTo(w * 0.5, y + h * 0.02, w * (0.88 + i * 0.02), y - h * 0.008);
      g.stroke();
    }

    // curled cat
    const cx = w * 0.62;
    const cy = h * 0.71;
    const r = h * 0.12;
    g.fillStyle = 'rgb(236,168,96)';
    g.beginPath();
    g.ellipse(cx, cy, r * 1.15, r * 0.95, 0, 0, Math.PI * 2);
    g.fill();
    // tail curling round, flicking
    g.strokeStyle = 'rgb(214,142,74)';
    g.lineWidth = Math.max(2, r * 0.3);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx - r, cy + r * 0.3);
    g.quadraticCurveTo(cx - r * 0.2, cy + r * 1.25, cx + r * (0.9 + 0.2 * Math.sin(t * 2.2)), cy + r * (0.7 + 0.2 * Math.cos(t * 2.2)));
    g.stroke();
    // head
    const hx = cx + r * 0.72;
    const hy = cy - r * 0.32;
    g.fillStyle = 'rgb(240,180,110)';
    g.beginPath();
    g.ellipse(hx, hy, r * 0.56, r * 0.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgb(224,150,82)';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(hx + s * r * 0.34, hy - r * 0.26);
      g.lineTo(hx + s * r * 0.48, hy - r * 0.72);
      g.lineTo(hx + s * r * 0.06, hy - r * 0.44);
      g.closePath();
      g.fill();
    }
    // slow blink
    const blink = (t * 0.5) % 3 < 0.5;
    g.strokeStyle = 'rgb(84,60,44)';
    g.lineWidth = Math.max(1.4, r * 0.1);
    for (const s of [-1, 1]) {
      const ex = hx + s * r * 0.22;
      if (blink) {
        g.beginPath();
        g.moveTo(ex - r * 0.12, hy);
        g.quadraticCurveTo(ex, hy + r * 0.08, ex + r * 0.12, hy);
        g.stroke();
      } else {
        g.fillStyle = 'rgb(174,214,150)';
        g.beginPath();
        g.ellipse(ex, hy, r * 0.14, r * 0.13, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgb(40,34,32)';
        g.beginPath();
        g.ellipse(ex, hy, r * 0.05, r * 0.11, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}

export const episode: Episode = new BedCat();
