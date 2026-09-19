import { Prop } from './prop.js';
import { TAU } from '../core/math.js';

/**
 * The bookshelf, and the gap behind it.
 *
 * The shelf itself never moves, so it is BAKED into the floor's base canvas
 * (the opaque blit that has to happen anyway) rather than rebuilt out of thirty
 * fills a frame. What it leaves behind on the floor is the point: a slot one
 * head wide with a dark throat at the far end, which the eye reads as "there is
 * something down there" before anything has been explained.
 *
 *   bakeBookshelf(floor.growBase(rect), shelf, gap, rng);
 *   this.props.push(...makeGapProps(shelf, gap, wallX));
 */
export function bakeBookshelf(g, shelf, gap, rng, opts = {}) {
  const wide = !!opts.wide;             // landscape: a wide shelf seen face on
  const x0 = shelf.x0, x1 = shelf.x1, y0 = shelf.y0, y1 = shelf.y1;

  // the shadow it throws onto the boards in front of it
  const sh = g.createLinearGradient(0, y1, 0, y1 + 76);
  sh.addColorStop(0, 'rgba(32,22,10,0.44)');
  sh.addColorStop(1, 'rgba(32,22,10,0)');
  g.fillStyle = sh;
  g.fillRect(x0 - 10, y1, x1 - x0 + 20, 76);

  // carcass
  g.fillStyle = '#7d5433';
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.fillStyle = 'rgba(0,0,0,0.16)';
  g.fillRect(x0, y0, x1 - x0, (y1 - y0) * 0.12);

  // shelves and books
  const cols = ['#c8563f', '#e0a63c', '#4b8f6a', '#3f6fa8', '#a9558f', '#d6cbb0', '#cf7a3e'];
  const rows = wide ? 3 : 4;
  for (let r = 0; r < rows; r++) {
    const ry0 = y0 + ((r + 0.18) / rows) * (y1 - y0);
    const ry1 = y0 + ((r + 0.96) / rows) * (y1 - y0);
    const bh = (ry1 - ry0) * 0.82;
    let x = x0 + 12;
    let i = r * 3;
    while (x < x1 - 18) {
      const bw = 13 + ((i * 41) % 19);
      const lean = rng.next() < 0.12 ? rng.range(-0.22, 0.22) : 0;
      g.save();
      g.translate(x, ry1);
      g.rotate(lean);
      g.fillStyle = cols[i % cols.length];
      g.fillRect(0, -bh, bw, bh);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(0, -bh, bw * 0.34, bh);
      g.fillStyle = 'rgba(0,0,0,0.20)';
      g.fillRect(0, -bh, bw, bh * 0.10);
      g.restore();
      x += bw + 3; i++;
    }
    g.fillStyle = '#9a6a42';
    g.fillRect(x0, ry1, x1 - x0, 7);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(x0, ry1, x1 - x0, 2);
  }
  // the near edge, thick, so it reads as standing up off the floor
  g.fillStyle = '#5d3c21';
  g.fillRect(x0, y1 - 11, x1 - x0, 11);
  g.fillStyle = '#8a5c36';
  g.fillRect(x0, y1 - 11, x1 - x0, 3);

  bakeGapThroat(g, gap);
}

/**
 * The slot: two hard edges and a throat that gets darker the deeper it goes, so
 * the bottom of it is somewhere you cannot see into from outside.
 */
export function bakeGapThroat(g, gap) {
  const gx0 = gap.x - gap.hw, gx1 = gap.x + gap.hw;
  const deep = gap.yDeep, open = gap.yOpen;
  const gl = g.createLinearGradient(0, deep, 0, open + 26);
  gl.addColorStop(0, 'rgba(16,11,6,0.86)');
  gl.addColorStop(0.55, 'rgba(22,15,8,0.55)');
  gl.addColorStop(1, 'rgba(26,18,9,0)');
  g.fillStyle = gl;
  g.fillRect(gx0, deep - 6, gx1 - gx0, open + 26 - deep);
  // the two walls of the slot, catching a little light along their top edges
  g.fillStyle = 'rgba(255,240,210,0.16)';
  g.fillRect(gx0 - 3, deep, 3, open - deep);
  g.fillRect(gx1, deep, 3, open - deep);
  g.fillStyle = 'rgba(10,7,4,0.9)';
  g.fillRect(gx0, deep - 10, gx1 - gx0, 12);
}

/** The side wall the gap runs along, baked with the rest of the set. */
export function bakeSideWall(g, wall) {
  g.fillStyle = '#d8cab2';
  g.fillRect(wall.x0, wall.y0, wall.x1 - wall.x0, wall.y1 - wall.y0);
  g.fillStyle = '#f0e8db';
  g.fillRect(wall.x0, wall.y0, 26, wall.y1 - wall.y0);
  g.fillStyle = 'rgba(120,100,74,0.4)';
  g.fillRect(wall.x0, wall.y0, 5, wall.y1 - wall.y0);
  const sh = g.createLinearGradient(wall.x0, 0, wall.x0 - 46, 0);
  sh.addColorStop(0, 'rgba(38,26,12,0.30)');
  sh.addColorStop(1, 'rgba(38,26,12,0)');
  g.fillStyle = sh;
  g.fillRect(wall.x0 - 46, wall.y0, 46, wall.y1 - wall.y0);
}

/**
 * The solid edges of the corridor. Non-pushable, so the head is guided into the
 * slot and stopped at the closed end instead of driving through the wall — and
 * because they block the BODY too, the machine never gets shoved through the
 * shelf and flips the head (and the whole airflow cone) round backwards.
 */
export function makeGapProps(shelf, gap, wall, far) {
  const blank = () => {};
  const out = [];
  const len = gap.yOpen - gap.yDeep;
  /**
   * The bookshelf itself is NOT solid, and that is deliberate.
   *
   * A tall slab beside a corridor one head wide makes a pocket: press the head
   * up into the corner and the two flat faces cancel both components of the
   * spring that follows the finger, and it sits there for ever with the next
   * dust bunny across the room. `dev/playthrough.mjs` found exactly that. The
   * long bookshelf in `paper` is not solid either, for the same reason — only
   * its leg is.
   *
   * What IS solid is the room: the side wall the slot runs along, the far wall,
   * and a ROUND stop a quarter of the way into the slot. Round matters: a
   * circle pushes the head along its own normal, which always has a component
   * back down the slot, so a head pressed into the end slides out of the corner
   * by itself instead of grinding there.
   */
  out.push(new Prop({
    x: wall.x0 + 160, y: gap.yDeep + len * 0.5,
    shape: 'rect', w: 320, h: len + 260,
    pushable: false, shadow: false, draw: blank, data: { wall: true },
  }));
  if (far) {
    out.push(new Prop({
      x: (far.x0 + far.x1) * 0.5, y: far.y - 200,
      shape: 'rect', w: far.x1 - far.x0, h: 400,
      pushable: false, shadow: false, draw: blank, data: { wall: true },
    }));
  }
  // A fixed distance in from the closed end, not a fraction of it: the slot is
  // 211px long in landscape and 321 in portrait, and what matters is only that
  // the mouth gets within about a head of the deepest thing down there.
  const stop = gap.yDeep + Math.min(58, len * 0.28);
  const R = 92;
  out.push(new Prop({
    x: gap.x, y: stop - R,
    shape: 'circle', r: R,
    pushable: false, shadow: false, draw: blank, data: { wall: true },
  }));
  return out;
}

/**
 * A few real books stacked on the floor beside the shelf — scenery, solid, and
 * the thing that makes the slot read as a slot rather than a stripe of paint.
 */
export function makeBookStack(x, y, rng) {
  const cols = ['#c8563f', '#3f6fa8', '#e0a63c'];
  return new Prop({
    x, y, shape: 'rect', w: 58, h: 40, angle: rng.range(-0.2, 0.2),
    pushable: false, shadow: false,
    draw(ctx) {
      ctx.save();
      ctx.fillStyle = 'rgba(38,26,12,0.30)';
      ctx.beginPath(); ctx.ellipse(this.x + 4, this.y + 22, 36, 12, 0, 0, TAU); ctx.fill();
      ctx.translate(this.x, this.y); ctx.rotate(this.angle);
      for (let i = 0; i < 3; i++) {
        const w = 58 - i * 7, h = 13;
        ctx.fillStyle = cols[i];
        ctx.fillRect(-w / 2, -6 - i * 12, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(-w / 2, -6 - i * 12, w, 3);
      }
      ctx.restore();
    },
  });
}
