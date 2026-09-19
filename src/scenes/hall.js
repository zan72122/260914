import { Scene } from './scene.js';
import { State } from '../debris/base.js';
import { DustBunny } from '../debris/dustBunny.js';
import { makeWoodFloor } from '../floors/wood.js';
import { Bin } from '../props/bin.js';
import { TAU, clamp } from '../core/math.js';

/**
 * The hallway hub.
 *
 * Thirteen doors, and the only thing that tells the child which ones are worth
 * opening is dust:
 *
 *   a room still dirty  ->  its door stands ajar and a dust bunny has drifted
 *                           out under it, swaying in the idle airflow
 *   the child comes near ->  the bunny leans, strains, and goes in — and THAT
 *                           is the door handle: the room starts as it is
 *                           swallowed, so entering a room is one continuous
 *                           suction gesture and never a button
 *   a room done         ->  the door is shut, the frame glows warm, a small
 *                           shine hangs on it and breathes, and the floor in
 *                           front of it has been polished
 *
 * An ajar door also shows a sliver of the ROOM behind it, in that room's own
 * colour (see `ROOM_TINT`): white tile, sky, pink, or nearly black for under
 * the sofa. Thirteen identical dark rectangles are thirteen holes; thirteen
 * different colours are thirteen places.
 *
 * On the very first visit only the intro door is ajar. When the child comes
 * back out of it the other twelve creak open one after another, in front of
 * them, so the invitation is something they watch happen. After that the order
 * is entirely theirs.
 *
 * Portrait is a corridor going AWAY from the viewer with doors down both
 * walls and the camera scrolling into the depth; landscape is one long wall of
 * doors and the camera tracks sideways.
 */

/** Door order along the hallway. The first is the one open on a fresh start. */
export const DOOR_IDS = [
  'intro', 'kitchen', 'paper', 'toy', 'thread', 'sand', 'sofa', 'carpet',
  'pantry', 'stairs', 'window', 'veranda', 'bedroom',
];

/**
 * One colour per room, for the glimpse through a door that is still ajar.
 *
 * A dark rectangle is a hole, and a hole is not somewhere a four-year-old wants
 * to go. A sliver of the room's OWN colour deep in the opening turns each door
 * into a different promise — the kitchen is white tile, the veranda is sky, the
 * bedroom is pink, under the sofa is nearly black — long before there is
 * anything to read. It is the same grammar as the dust bunny: the world tells
 * you what is behind the door by showing you a piece of it.
 *
 * These are taken from each room's own floor and set, not invented.
 */
export const ROOM_TINT = {
  intro:   '#e7b368',   // warm boards
  kitchen: '#e6edf2',   // white tile
  paper:   '#fdf6e0',   // paper white
  toy:     '#ffd24a',   // the yellow block
  thread:  '#a98cf0',   // the purple yarn
  sand:    '#e9d8ad',   // the sand tray
  sofa:    '#3a3140',   // it is dark under there
  carpet:  '#ff7ec0',   // the big rug
  pantry:  '#fff6e2',   // flour
  stairs:  '#e0bb90',   // treads
  window:  '#fff3cd',   // the light through the glass
  veranda: '#bcdcf2',   // sky
  bedroom: '#edc8da',   // pink
};

const AJAR = 0.34;
const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };

export class HallScene extends Scene {
  constructor(rng) {
    super('hall', rng);
    this.doors = [];
    this.enter = null;        // the door the head is walking into
    this.walkOut = null;      // the door we just came back out of
    this.bright = 0;          // warm wash over the whole house
    this.fin = null;          // the everything-is-clean celebration
    this.house = null;        // set by main.js before layout()
    this.returnFrom = null;   // room id we have just come back from
    this.bin = null;
    this._glow = null;
    this._haze = null;
  }

  // --------------------------------------------------------------- layout

  layout(pose, w, h) {
    super.layout(pose, w, h);
    const vw = this.vw, vh = this.vh;
    const portrait = pose === 'portrait';
    this.debris.length = 0;
    this.doors.length = 0;
    this.enter = null;
    this._glow = null;
    const house = this.house || { rooms: {}, opened: true };

    if (portrait) {
      // ---- a corridor receding away, doors down both walls ----
      this.W = vw * 0.28;
      this.DS = 158;
      this.yNear = vh * 0.52;
      this.yFar = this.yNear - (DOOR_IDS.length - 1) * this.DS - 300;
      this.startPointer = { x: 0.5, y: 0.78 };
      this.rest = { x: 0, y: this.yNear - vh * 0.30, zoom: this.scale, tilt: 0.30 };
      // the corridor has to reach past the screen at BOTH ends of the scroll,
      // or the camera runs off the floor and the hallway ends in black
      this.floor = makeWoodFloor(
        { x0: -vw * 0.62, y0: this.yFar - vh * 0.32, x1: vw * 0.62, y1: this.yNear + vh * 0.46 },
        this.rng, { plankW: 92 });
      for (let i = 0; i < DOOR_IDS.length; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const y = this.yNear - 210 - i * this.DS;
        this.doors.push(this._door(DOOR_IDS[i], side * this.W, y, side, 0, y));
      }
      // Far enough from the parked machine that walking out of the front door
      // does not empty the cup by accident, near enough to be the first thing
      // in the hallway. (92px of reach plus the mouth offset is 114.)
      this.binPos = { x: -(this.W - 34), y: this.yNear + 28 };
    } else {
      // ---- one long wall of doors, the camera tracking sideways ----
      this.wallY = -vh * 0.24;
      this.DS = 212;
      this.xNear = -vw * 0.30;
      this.xFar = this.xNear + (DOOR_IDS.length - 1) * this.DS + 260;
      this.startPointer = { x: 0.20, y: 0.80 };
      this.rest = { x: this.xNear + vw * 0.18, y: -vh * 0.05, zoom: this.scale, tilt: 0.14 };
      this.floor = makeWoodFloor(
        { x0: this.xNear - vw * 0.95, y0: this.wallY - 30, x1: this.xFar + vw * 0.95, y1: vh * 0.80 },
        this.rng, { plankW: 86, horizontal: true });
      for (let i = 0; i < DOOR_IDS.length; i++) {
        const x = this.xNear + i * this.DS;
        this.doors.push(this._door(DOOR_IDS[i], x, this.wallY, 0, x, this.wallY + 60));
      }
      this.binPos = { x: this.xNear + 84, y: vh * 0.10 };
    }

    this._paintWalls();

    this.bin = new Bin({ x: this.binPos.x, y: this.binPos.y, rng: this.rng });

    // ---- which doors are open, and what each one looks like -------------
    for (const d of this.doors) {
      const st = house.rooms && house.rooms[d.id];
      d.clean = !!(st && st.clean);
      if (d.clean) { d.open = 0; d.target = 0; d.glow = 1; d.shine = 1; }
      else if (house.opened || d.id === DOOR_IDS[0]) { d.open = AJAR; d.target = AJAR; this._spawnBunny(d); }
      else { d.open = 0; d.target = 0; }                 // still shut: not offered yet
    }

    // ---- coming back out of a room --------------------------------------
    // consumed here: an orientation change re-runs layout() and must not play
    // the walk-out a second time
    const rf = this.returnFrom;
    this.returnFrom = null;
    this.walkOut = null;
    const back = rf && this.doors.find((d) => d.id === rf);
    if (back) {
      this.walkOut = { d: back, t: 0 };
      back.open = 0.92; back.target = 0; back.glow = 0; back.shine = 0;
      this.startWorld = { x: back.fx, y: back.fy + (portrait ? 54 : 46) };
      this.rest = portrait
        ? { x: 0, y: back.y + vh * 0.16, zoom: this.scale, tilt: 0.30 }
        : { x: back.x, y: 0, zoom: this.scale, tilt: 0.14 };
    } else {
      this.startWorld = null;
    }

    // ---- the other twelve creak open once the intro has been done -------
    if (house.rooms && house.rooms[DOOR_IDS[0]] && house.rooms[DOOR_IDS[0]].clean && !house.opened) {
      house.opened = true;
      let k = 0;
      for (const d of this.doors) {
        if (d.clean) continue;
        d.delay = 0.7 + k * 0.22;            // staggered, so it is watchable
        k++;
      }
    }

    this.allClean = this.doors.every((d) => d.clean);
    if (this.allClean && !this.fin) this.fin = { phase: 'brighten', t: 0 };
    // the celebration pours the cup itself, in its own time: the bin must not
    // quietly empty it first as the child walks in through the last door
    this.bin.armed = !this.allClean;
  }

  _door(id, x, y, side, fx, fy) {
    return {
      id, x, y, side,
      fx: side ? x - side * 44 : fx, fy: side ? y : fy,
      open: 0, target: 0, v: 0, delay: -1,
      clean: false, glow: 0, shine: 0, bunny: null, creaked: false,
    };
  }

  _spawnBunny(d) {
    if (d.bunny && d.bunny.state !== State.DONE) return d.bunny;
    const b = new DustBunny(d.fx, d.fy + (this.pose === 'portrait' ? 16 : 26), 24, this.rng);
    b.hx = b.x; b.hy = b.y;
    // NOT `decor`: the harness aims at real debris, and this fluff is the
    // most important target in the game — it is the door handle. The hall
    // decides when it is finished in `remaining()` instead.
    b.anchored = true;     // clearStartZone leaves the invitation where it is
    d.bunny = b;
    this.debris.push(b);
    return b;
  }

  /** Walls, skirting and door frames are static: bake them into the floor. */
  _paintWalls() {
    const f = this.floor;
    const vw = this.vw, vh = this.vh;
    let g;
    if (this.pose === 'portrait') {
      const y0 = this.yFar - vh * 0.34, y1 = this.yNear + vh * 0.48, hgt = y1 - y0;
      g = f.growBase({ x0: -vw * 0.72, y0, x1: vw * 0.72, y1 });
      const W = this.W;
      for (const s of [-1, 1]) {
        g.fillStyle = '#e6d8c3';
        g.fillRect(s < 0 ? -vw * 0.72 : W, y0, vw * 0.72 - W, hgt);
        // skirting: a dark line where wall meets floor, the corridor's edge
        g.fillStyle = '#cbb99f';
        g.fillRect(s < 0 ? -W - 14 : W, y0, 14, hgt);
        g.fillStyle = 'rgba(70,52,30,0.20)';
        g.fillRect(s < 0 ? -W : W - 5, y0, 5, hgt);
      }
      for (const d of this.doors) this._frame(g, d);
    } else {
      const x0 = this.xNear - vw * 1.0, x1 = this.xFar + vw * 1.0, wid = x1 - x0;
      g = f.growBase({ x0, y0: this.wallY - 280, x1, y1: vh * 0.82 });
      g.fillStyle = '#e6d8c3';
      g.fillRect(x0, this.wallY - 280, wid, 280);
      g.fillStyle = '#cbb99f';
      g.fillRect(x0, this.wallY - 16, wid, 16);
      g.fillStyle = 'rgba(70,52,30,0.20)';
      g.fillRect(x0, this.wallY, wid, 7);
      for (const d of this.doors) this._frame(g, d);
    }
    g.restore();
  }

  /**
   * Frame and CLOSED door face, painted once into the wall. An open door is
   * drawn over the top of this at run time (a dark opening plus the swung
   * leaf), so a shut door costs nothing at all to draw.
   */
  _frame(g, d) {
    let x, y, w, h;
    if (d.side) {
      const s = d.side;
      x = s < 0 ? -this.W - 90 : this.W; y = d.y - 66; w = 90; h = 132;
    } else {
      x = d.x - 60; y = this.wallY - 132; w = 120; h = 132;
    }
    g.fillStyle = '#7a6444';
    g.fillRect(x, y, w, h);
    const ix = x + 7, iy = y + (d.side ? 7 : 8), iw = w - 14, ih = h - (d.side ? 14 : 8);
    g.fillStyle = '#b98f61';
    g.fillRect(ix, iy, iw, ih);
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fillRect(ix + iw * 0.12, iy + ih * 0.10, iw * 0.3, ih * 0.8);
    g.fillStyle = 'rgba(70,46,22,0.35)';
    g.strokeStyle = 'rgba(70,46,22,0.35)'; g.lineWidth = 3;
    g.strokeRect(ix + 9, iy + 9, iw - 18, ih - 18);
    g.fillStyle = '#e3c887';
    g.beginPath();
    g.arc(d.side ? (d.side < 0 ? ix + 12 : ix + iw - 12) : ix + iw - 14,
      d.side ? iy + ih * 0.5 : iy + ih * 0.55, 5, 0, TAU);
    g.fill();
  }

  // --------------------------------------------------------------- update

  update(dt, ctx) {
    const vac = ctx.vacuum;
    this.t = (this.t || 0) + dt;

    for (const d of this.doors) this._updateDoor(dt, d, vac, ctx);

    const list = this.debris;
    for (let i = 0; i < list.length; i++) list[i].update(dt, vac, ctx.world);

    if (!this.enter && !this.fin) this._checkEntry(vac);

    if (this.walkOut) {
      const W = this.walkOut;
      W.t += dt;
      if (W.t > 0.55 && !W.d.creaked) {
        W.d.creaked = true;
        if (ctx.audio) ctx.audio.pop('tick', 0.5);
      }
      if (W.t > 0.9) {
        W.d.clean = true;
        this.walkOut = null;
        this.allClean = this.doors.every((x) => x.clean);
        if (this.allClean && !this.fin) this.fin = { phase: 'brighten', t: 0 };
      }
    }

    if (this.bin) this.bin.update(dt, ctx);
    if (this.fin) this._finale(dt, ctx);
    this._camera(dt, ctx);
  }

  _updateDoor(dt, d, vac, ctx) {
    if (d.delay > 0) {
      d.delay -= dt;
      if (d.delay <= 0) {
        d.delay = -1;
        d.target = AJAR;
        this._spawnBunny(d);
        if (ctx.audio) ctx.audio.pop('tick', 0.45);
      }
    }
    if (d.clean) {
      d.target = 0;
      d.glow += (1 - d.glow) * (1 - Math.exp(-2.2 * dt));
      d.shine += (1 - d.shine) * (1 - Math.exp(-1.6 * dt));
    } else if (d.target > 0) {
      // the airflow reaches under the door and swings it further open: the
      // world answering the approach before anything has been collected
      const f = vac.field(d.fx, d.fy, TMPF);
      d.target = AJAR + clamp(f.strength, 0, 1.2) * 0.42;
      d.glow += (0 - d.glow) * (1 - Math.exp(-3 * dt));
      d.shine += (0 - d.shine) * (1 - Math.exp(-3 * dt));
    }
    // a door is heavy: a soft spring, so it creaks rather than snaps
    const a = -2 * 7 * d.v - 7 * 7 * (d.open - d.target);
    d.v += a * dt;
    d.open = clamp(d.open + d.v * dt, 0, 1);
  }

  /**
   * The door handle is the bunny. It counts as opened the moment the fluff
   * reaches the mouth — not only when it is swallowed — so a FULL cup, which
   * refuses to swallow anything, can never lock a child out of a room.
   */
  _checkEntry(vac) {
    for (const d of this.doors) {
      const b = d.bunny;
      if (d.clean || !b) continue;
      const near = Math.hypot(b.x - vac.mouthX, b.y - vac.mouthY) < 34;
      if (b.state === State.DONE || b.state === State.CAPTURED || (b.state === State.PULLED && near)) {
        this.enter = d;
        d.target = 1;
        return;
      }
    }
  }

  _camera(dt, ctx) {
    const cam = ctx.camera;
    const n = ctx.vacuum.nozzle;
    const A = this._anchor || (this._anchor = { x: 0, y: 0, zoom: 1, tilt: 0 });
    A.zoom = this.rest.zoom;
    A.tilt = this.rest.tilt;
    if (this.pose === 'portrait') {
      A.x = 0;
      A.y = clamp(n.y, this.yFar + this.vh * 0.26, this.yNear - this.vh * 0.26);
    } else {
      A.y = -this.vh * 0.05;
      A.x = clamp(n.x, this.xNear - this.vw * 0.10, this.xFar - this.vw * 0.20);
    }
    if (this.enter) {
      // riding into the door: give it the frame
      A.x = this.pose === 'portrait' ? this.enter.fx * 0.45 : this.enter.x;
      A.y = this.pose === 'portrait' ? this.enter.y + this.vh * 0.12 : 0;
    }
    cam.followTo(dt, A, n, { x: 58, y: 46 }, 0.34, 2.6);
  }

  // --------------------------------------------------------------- finale

  /**
   * Every room clean: the whole house warms up, the cup goes into the hall bin
   * in one long rush, and then — because the owner asked for a fresh house
   * every time and nothing is stored between page loads — the dust comes back
   * and all thirteen doors creak open again.
   */
  _finale(dt, ctx) {
    const F = this.fin;
    F.t += dt;
    if (F.phase === 'brighten') {
      this.bright = clamp(F.t / 1.4, 0, 1);
      if (F.t > 1.5) {
        F.phase = 'pour'; F.t = 0;
        if (this.bin) this.bin.beginPour(ctx.vacuum, ctx, { pad: 46 });
      }
    } else if (F.phase === 'pour') {
      if (!this.bin || !this.bin.pouring) { F.phase = 'hold'; F.t = 0; }
    } else if (F.phase === 'hold') {
      if (F.t > 2.6) { F.phase = 'reset'; F.t = 0; this._resetHouse(ctx); }
    } else if (F.phase === 'reset') {
      this.bright = clamp(1 - F.t / 1.6, 0, 1);
      if (F.t > 2.4) this.fin = null;
    }
  }

  _resetHouse(ctx) {
    const house = this.house;
    let k = 0;
    for (const d of this.doors) {
      d.clean = false;
      d.glow = 0; d.shine = 0;
      d.delay = 0.25 + k * 0.16;
      d.creaked = false;
      k++;
      if (house && house.rooms[d.id]) { house.rooms[d.id].clean = false; house.rooms[d.id].persist = {}; }
    }
    if (house) house.opened = true;
    this.allClean = false;
    this.bin.armed = true;
    if (ctx.audio) ctx.audio.pop('whoosh', 0.6);
  }

  // ----------------------------------------------------------- completion

  /** The hall is never "finished": it hands over the moment a door is entered. */
  isComplete() { return !!this.enter; }
  remaining() { return this.enter ? 0 : 1; }

  exit() {
    const d = this.enter;
    const to = this.pose === 'portrait'
      ? { x: d.fx * 0.6, y: d.y - 40, zoom: this.scale * 1.18, tilt: 0.34 }
      : { x: d.x, y: this.wallY + 30, zoom: this.scale * 1.18, tilt: 0.18 };
    return { to, dur: 1.1, next: d.id };
  }

  entry() {
    if (this.walkOut) {
      const d = this.walkOut.d;
      return this.pose === 'portrait'
        ? { x: d.fx * 0.6, y: d.y - 20, zoom: this.scale * 1.16, tilt: 0.34 }
        : { x: d.x, y: this.wallY + 40, zoom: this.scale * 1.16, tilt: 0.18 };
    }
    return { x: this.rest.x, y: this.rest.y, zoom: this.scale * 0.94, tilt: this.rest.tilt };
  }

  /** Dev hook: hand straight back out of the first still-dirty door. */
  devFinish() {
    const d = this.doors.find((x) => !x.clean) || this.doors[0];
    this.enter = d;
  }

  saveProgress() { return null; }
  restoreProgress() {}

  snapshot() {
    const s = super.snapshot();
    s.doors = this.doors.map((d) => ({
      id: d.id, clean: d.clean, open: +d.open.toFixed(2),
      nx: 0, ny: 0, fx: Math.round(d.fx), fy: Math.round(d.fy),
    }));
    s.enter = this.enter ? this.enter.id : null;
    s.bright = +this.bright.toFixed(2);
    s.finale = this.fin ? this.fin.phase : null;
    if (this.bin) s.bin = this.bin.snapshot();
    return s;
  }

  // ----------------------------------------------------------------- draw

  draw(ctx, cam) {
    this.drawFloor(ctx, cam);
    ctx.save();
    cam.apply(ctx);
    for (const d of this.doors) this._drawDoor(ctx, d);
    ctx.restore();
    this.drawDebris(ctx, cam);
  }

  drawOver(ctx, cam) {
    // Portrait: the corridor runs AWAY from the viewer, and the only honest
    // way to say so on a top-down canvas is that the far end is dimmer. One
    // cached gradient over the top third — no per-frame gradient, no filter,
    // and it costs nothing in landscape, where there is no depth to sell.
    if (this.pose === 'portrait') {
      if (!this._haze || this._hazeH !== cam.h) {
        const gr = ctx.createLinearGradient(0, 0, 0, cam.h * 0.42);
        gr.addColorStop(0, 'rgba(42,30,18,0.38)');
        gr.addColorStop(0.55, 'rgba(42,30,18,0.13)');
        gr.addColorStop(1, 'rgba(42,30,18,0)');
        this._haze = gr; this._hazeH = cam.h;
      }
      ctx.fillStyle = this._haze;
      ctx.fillRect(0, 0, cam.w, cam.h * 0.42);
    }
    if (this.bright > 0.005) {
      // the whole house warming up: one flat fill, the cheapest pass there is
      ctx.fillStyle = 'rgba(255,224,158,' + (this.bright * 0.22).toFixed(3) + ')';
      ctx.fillRect(0, 0, cam.w, cam.h);
    }
  }

  _drawDoor(ctx, d) {
    const portrait = this.pose === 'portrait';
    // shiny patch on the floor in front of a finished room
    if (d.shine > 0.02) {
      ctx.save();
      ctx.globalAlpha = d.shine * 0.5;
      ctx.fillStyle = '#fff3d2';
      ctx.beginPath();
      ctx.ellipse(d.fx, d.fy + (portrait ? 10 : 24), portrait ? 52 : 60, portrait ? 34 : 26, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = d.shine * 0.8;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(d.fx - 26, d.fy + (portrait ? 4 : 18));
      ctx.lineTo(d.fx + 10, d.fy + (portrait ? 16 : 30));
      ctx.stroke();
      ctx.restore();
    }
    // warm light around the frame of a finished room
    if (d.glow > 0.02) {
      ctx.save();
      ctx.globalAlpha = d.glow;
      if (!this._glow) {
        const gr = ctx.createRadialGradient(0, 0, 6, 0, 0, 120);
        gr.addColorStop(0, 'rgba(255,224,152,0.85)');
        gr.addColorStop(0.5, 'rgba(255,214,132,0.34)');
        gr.addColorStop(1, 'rgba(255,214,132,0)');
        this._glow = gr;
      }
      const gx = d.side ? d.x + d.side * 22 : d.x;
      const gy = d.side ? d.y : this.wallY - 44;
      ctx.translate(gx, gy);
      ctx.fillStyle = this._glow;
      ctx.fillRect(-120, -120, 240, 240);
      ctx.restore();
      /**
       * ...and a small shine HANGING on the door itself, breathing slowly.
       *
       * The glow says "this room is warm now"; on its own it is a wash, and at
       * the far end of a corridor of thirteen doors a wash is hard to tell from
       * the light on the wall next to it. A four-point sparkle is a POINT: it
       * catches the eye from any distance, it is obviously ON the door rather
       * than around it, and because it breathes it reads as pleased with
       * itself. No text, no tick, no counter — the reward for finishing a room
       * is that its door now twinkles at you across the house.
       */
      const b = 0.62 + 0.38 * Math.sin((this.t || 0) * 1.7 + d.y * 0.013 + d.x * 0.011);
      const sx = d.side ? gx - d.side * 16 : gx + 26;
      const sy = d.side ? gy - 26 : gy - 8;
      const L = (7 + 5 * b) * d.glow;
      ctx.save();
      ctx.globalAlpha = clamp(d.glow * b, 0, 1);
      ctx.fillStyle = '#fff6d6';
      ctx.beginPath();
      ctx.moveTo(sx, sy - L);
      ctx.quadraticCurveTo(sx + L * 0.22, sy - L * 0.22, sx + L, sy);
      ctx.quadraticCurveTo(sx + L * 0.22, sy + L * 0.22, sx, sy + L);
      ctx.quadraticCurveTo(sx - L * 0.22, sy + L * 0.22, sx - L, sy);
      ctx.quadraticCurveTo(sx - L * 0.22, sy - L * 0.22, sx, sy - L);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = clamp(d.glow * b, 0, 1) * 0.5;
      ctx.beginPath(); ctx.arc(sx, sy, L * 0.3, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // Open: a dark opening where the painted door face was, and the leaf
    // itself swung out into the hallway on its hinge. Shut, none of this is
    // drawn at all — the face is already in the wall texture.
    const open = d.open;
    if (open > 0.01) {
      const th = open * 1.28;
      const st = Math.sin(th), ct = Math.cos(th);
      let hx, hy, dx, dy, px, py, L;
      if (portrait) {
        const sgn = d.side;
        hx = sgn * this.W; hy = d.y - 58;
        // closed the leaf lies along the wall (+y); open it swings into the
        // corridor (toward -side)
        dx = -sgn * st; dy = ct;
        px = sgn * ct; py = st;
        L = 116;
        ctx.save();
        ctx.globalAlpha = clamp(open * 3, 0, 1);
        const ox = sgn < 0 ? -this.W - 83 : this.W + 7;
        ctx.fillStyle = '#31241a';
        ctx.fillRect(ox, d.y - 59, 76, 118);
        // A ROOM beyond, not a hole. The far half of the opening carries that
        // room's own colour, so every door promises something different; the
        // near half keeps the warm light pooling at the threshold. Two flat
        // fills — a gradient here would be a new raster every frame, thirteen
        // times over (see the performance rules in docs/ARCHITECTURE.md).
        const tint = ROOM_TINT[d.id];
        if (tint) {
          const a0 = clamp(open * 3, 0, 1);
          ctx.fillStyle = tint;
          // inset on every side, so the jamb keeps its shadow and the colour
          // reads as something further back rather than as a picture hung in
          // the doorway
          ctx.globalAlpha = a0 * 0.20;
          ctx.fillRect(sgn < 0 ? ox + 6 : ox + 14, d.y - 44, 56, 88);
          ctx.globalAlpha = a0 * 0.52;
          ctx.fillRect(sgn < 0 ? ox + 8 : ox + 24, d.y - 34, 44, 68);
          ctx.globalAlpha = a0;
        }
        ctx.fillStyle = 'rgba(255,208,128,0.30)';
        ctx.fillRect(sgn < 0 ? ox + 46 : ox, d.y - 59, 30, 118);
        ctx.restore();
      } else {
        hx = d.x - 54; hy = this.wallY;
        dx = ct; dy = st;
        px = st; py = -ct;
        L = 106;
        ctx.save();
        ctx.globalAlpha = clamp(open * 3, 0, 1);
        ctx.fillStyle = '#31241a';
        ctx.fillRect(d.x - 53, this.wallY - 118, 106, 118);
        // the same glimpse: the room's colour DEEP in (up the wall, away from
        // the hallway), the warm threshold light at the bottom
        const tintL = ROOM_TINT[d.id];
        if (tintL) {
          const a0 = clamp(open * 3, 0, 1);
          ctx.fillStyle = tintL;
          ctx.globalAlpha = a0 * 0.20;
          ctx.fillRect(d.x - 40, this.wallY - 104, 80, 74);
          ctx.globalAlpha = a0 * 0.52;
          ctx.fillRect(d.x - 30, this.wallY - 96, 60, 52);
          ctx.globalAlpha = a0;
        }
        ctx.fillStyle = 'rgba(255,208,128,0.30)';
        ctx.fillRect(d.x - 53, this.wallY - 38, 106, 38);
        ctx.restore();
      }
      const T = 9 + 30 * st;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + dx * L, hy + dy * L);
      ctx.lineTo(hx + dx * L + px * T, hy + dy * L + py * T);
      ctx.lineTo(hx + px * T, hy + py * T);
      ctx.closePath();
      ctx.fillStyle = d.clean ? '#d9b183' : '#b98f61';
      ctx.fill();
      ctx.strokeStyle = 'rgba(70,46,22,0.45)'; ctx.lineWidth = 2;
      ctx.stroke();
      // the leading edge catches the corridor light
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(hx + dx * L * 0.06, hy + dy * L * 0.06);
      ctx.lineTo(hx + dx * L * 0.94, hy + dy * L * 0.94);
      ctx.stroke();
      ctx.restore();
    }

    // the gap under an ajar door: warm light from the room beyond
    if (!d.clean && open > 0.05) {
      ctx.save();
      ctx.globalAlpha = clamp(open * 1.4, 0, 1) * 0.55;
      ctx.fillStyle = '#ffdc9a';
      if (portrait) {
        ctx.beginPath();
        ctx.ellipse(d.fx, d.fy, 46 * open + 20, 30 * open + 12, 0, 0, TAU);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.ellipse(d.x, this.wallY + 22, 54 * open + 22, 26 * open + 10, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
