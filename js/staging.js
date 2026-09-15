// staging.js — F4 staging: what the world does when a puzzle is solved
// (docs/01.md 3.3), the ending, and the falling seed that starts over (docs/01.md 6-2).
//
// Everything is driven by Web Animations API / rAF on the art layers declared in
// art/*.svg. No text is ever produced. While a sequence runs `board.busy` is true;
// every sequence resolves through a finally-block so the flag is always released.

import { Tile, TILE_DEFS } from './tile.js';
import { tween, fade, growFrom, rainLoop, wait, easeOutCubic, easeInOutCubic } from './fx.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A point of a tile's own 0..1000 art space, in board pixels. */
function svgToBoard(board, tileId, sx, sy) {
  const tile = board.tiles.get(tileId);
  const at = board.locate(tileId);
  if (!tile || !at) return null;
  const g = board.cellGeom(at.r, at.c);
  const vb = tile.svg.getAttribute('viewBox').split(/\s+/).map(Number);
  return {
    x: g.x + ((sx - vb[0]) / vb[2]) * g.size,
    y: g.y + ((sy - vb[1]) / vb[3]) * g.size,
    size: g.size
  };
}

/* ------------------------------ P1: rain ------------------------------ */

export async function stageP1(board) {
  const t1 = board.tiles.get('T1');
  const t2 = board.tiles.get('T2');
  if (!t1 || !t2) return;

  // 1. the cut-off drops of T2 keep going and cross the cell boundary into T1
  const rainAbove = t2.layer('rain');
  const rainBelow = t1.layer('rain');
  if (rainBelow) rainBelow.style.opacity = '1';
  await Promise.all([
    rainLoop(rainAbove, 520, 900, 3),
    rainLoop(rainBelow, 600, 900, 3)
  ]);
  await fade(rainBelow, 1, 0, 350);

  // 2. the soil darkens
  await fade(t1.layer('soil-wet'), 0, 1, 700);

  // 3. the sprout grows (about 1.5s)
  const sprout = t1.layer('sprout');
  if (sprout) {
    sprout.style.opacity = '1';
    await growFrom(sprout, 270, 508, 1500);
  }
  await fade(t1.layer('seed'), 1, 0, 400);

  // 4. T2 has done its work: the colour drains out of it
  t2.setSaturated(false);

  // 5. the sun rises into the cell T2 left behind (docs/02.md D2)
  await riseIntoCell(board, 'T3', 1, 1);
}

/** Add a tile to an empty cell with a "climbing up from below" entrance. */
export async function riseIntoCell(board, defId, r, c) {
  if (board.tiles.get(defId) || !board.isEmpty(r, c)) return;
  const tile = new Tile(TILE_DEFS[defId]);
  tile.setSaturated(true);
  board.add(tile, r, c);
  board.layout();
  const rest = tile.restTransform();
  const from = `translate(${tile.x}px, ${tile.y + tile.size}px)`;
  const anim = tile.el.animate(
    [{ transform: from, opacity: 0 }, { transform: rest, opacity: 1 }],
    { duration: 900, easing: 'cubic-bezier(.22,.9,.28,1)', fill: 'none' }
  );
  await anim.finished.catch(() => {});
}

/* ------------------------------ P2: light ----------------------------- */

export async function stageP2(board) {
  const t1 = board.tiles.get('T1');
  const t4 = board.tiles.get('T4');
  if (!t1) return;

  // a band of light reaches out of the window and down to the pot
  const beam = t1.layer('beam');
  if (beam) {
    beam.style.opacity = '0';
    beam.setAttribute('transform', 'translate(620 300) scale(0.05) translate(-620 -300)');
    beam.style.opacity = '1';
    await tween(1000, (t) => {
      const s = 0.05 + 0.95 * t;
      beam.setAttribute('transform', `translate(620 300) scale(${s}) translate(-620 -300)`);
      beam.style.opacity = String(0.25 + 0.75 * t);
    }, easeOutCubic);
  }

  // the sprout closes into a bud
  const bud = t1.layer('bud');
  if (bud) {
    bud.style.opacity = '1';
    await growFrom(bud, 270, 452, 900);
  }
  await wait(200);

  // the garden matters again
  if (t4) t4.setSaturated(true);
}

/* ---------------------------- P3: butterfly --------------------------- */

export async function stageP3(board) {
  const t1 = board.tiles.get('T1');
  const t4 = board.tiles.get('T4');
  if (!t1 || !t4) return;

  // 1. the two halves of the flight trail join up
  const joins = [t1.layer('trail-join'), t4.layer('trail-join')];
  await Promise.all(joins.map((g) => {
    if (!g) return Promise.resolve();
    g.style.opacity = '1';
    const path = g.querySelector('path');
    if (!path) return Promise.resolve();
    const anim = path.animate(
      [{ strokeDashoffset: 260 }, { strokeDashoffset: 0 }],
      { duration: 900, easing: 'ease-out', fill: 'none' }
    );
    return anim.finished.catch(() => {});
  }));

  // 2. the butterfly leaves the garden, crosses the window and reaches the bud
  await flyButterfly(board);

  // 3. the flower opens
  await fade(t1.layer('bud'), 1, 0, 500);
  const flower = t1.layer('flower');
  if (flower) {
    flower.style.opacity = '1';
    await growFrom(flower, 270, 430, 1200, 0.12);
  }
}

/** Overlay flight: crosses cell boundaries, so it lives in #fx, not in a tile. */
async function flyButterfly(board) {
  const fxEl = document.getElementById('fx');
  const t4 = board.tiles.get('T4');
  const wing = t4 && t4.layer('butterfly');
  const start = svgToBoard(board, 'T4', 640, 518);
  const end = svgToBoard(board, 'T1', 276, 392);
  if (!fxEl || !wing || !start || !end) return;

  const flyer = document.createElementNS(SVG_NS, 'svg');
  flyer.setAttribute('class', 'flyer');
  flyer.setAttribute('viewBox', '0 0 1000 1000');
  flyer.setAttribute('width', String(start.size));
  flyer.setAttribute('height', String(start.size));
  flyer.style.transformOrigin = `${(640 / 1000) * start.size}px ${(518 / 1000) * start.size}px`;
  const at = board.locate('T4');
  const g4 = board.cellGeom(at.r, at.c);
  flyer.style.left = `${g4.x}px`;
  flyer.style.top = `${g4.y}px`;
  flyer.appendChild(wing.cloneNode(true));
  fxEl.appendChild(flyer);
  wing.style.opacity = '0';

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lift = -start.size * 0.34;              // arc up through the window
  await tween(2200, (t) => {
    const x = dx * t;
    const y = dy * t + lift * Math.sin(Math.PI * t);
    const flap = 0.55 + 0.45 * Math.abs(Math.cos(t * 26));
    flyer.style.transform = `translate(${x}px, ${y}px) scale(${flap}, 1)`;
  }, easeInOutCubic);

  // it settles on the bud and keeps breathing there through the ending
  const rest = `translate(${dx}px, ${dy}px)`;
  flyer.style.transform = rest;
  flyer.animate(
    [{ transform: `${rest} scale(1, 1)` },
     { transform: `${rest} scale(0.82, 1)` },
     { transform: `${rest} scale(1, 1)` }],
    { duration: 2600, iterations: Infinity, easing: 'ease-in-out' }
  );
}

/* ------------------------------- ending ------------------------------- */

/**
 * The four cells melt into a single picture, the spirals become petals, and after
 * a few seconds the flower drops one seed. Tapping the seed starts over.
 */
export async function stageEnding(board, restart) {
  document.body.classList.add('ending');

  // tiles that no longer carry the picture dissolve into the light
  for (const [id, tile] of board.tiles) {
    if (id === 'T2') tile.el.classList.add('fade-away');
  }
  await wait(2600);

  const seed = dropSeed(board, restart);
  if (!seed) return;
}

function dropSeed(board, restart) {
  const fxEl = document.getElementById('fx');
  const from = svgToBoard(board, 'T1', 276, 400);
  if (!fxEl || !from) return null;

  const size = Math.max(72, from.size * 0.32);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'flyer seed-drop');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.style.left = `${from.x - size / 2}px`;
  svg.style.top = `${from.y - size / 2}px`;
  const hit = document.createElementNS(SVG_NS, 'rect');   // generous 64px+ tap area
  hit.setAttribute('x', '0'); hit.setAttribute('y', '0');
  hit.setAttribute('width', '100'); hit.setAttribute('height', '100');
  hit.setAttribute('fill', 'transparent');
  const body = document.createElementNS(SVG_NS, 'circle');
  body.setAttribute('cx', '50'); body.setAttribute('cy', '52'); body.setAttribute('r', '17');
  body.setAttribute('fill', '#7a5f37');
  body.setAttribute('stroke', '#46423a'); body.setAttribute('stroke-width', '5');
  const shine = document.createElementNS(SVG_NS, 'path');
  shine.setAttribute('d', 'M44 44 q10 -10 18 2');
  shine.setAttribute('fill', 'none'); shine.setAttribute('stroke', '#a78c5c');
  shine.setAttribute('stroke-width', '4'); shine.setAttribute('stroke-linecap', 'round');
  svg.append(hit, body, shine);
  fxEl.appendChild(svg);

  // the seed drops from the flower and comes to rest low in the picture
  const boardH = board.boardEl.getBoundingClientRect().height;
  const fall = Math.max(60, boardH * 0.86 - from.y);
  tween(1100, (t) => {
    svg.style.transform = `translateY(${fall * t}px) rotate(${t * 40}deg)`;
  }, easeOutCubic).then(() => {
    svg.animate(
      [{ transform: `translateY(${fall}px) rotate(40deg) scale(1)` },
       { transform: `translateY(${fall - 6}px) rotate(40deg) scale(1.08)` },
       { transform: `translateY(${fall}px) rotate(40deg) scale(1)` }],
      { duration: 1800, iterations: Infinity, easing: 'ease-in-out' }
    );
  });

  const onTap = (e) => {
    e.preventDefault();
    e.stopPropagation();
    svg.removeEventListener('pointerdown', onTap);
    restart();
  };
  svg.addEventListener('pointerdown', onTap, { passive: false });
  return svg;
}
