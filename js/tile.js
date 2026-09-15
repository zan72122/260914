// tile.js — tile data model + SVG instance (docs/01.md 4.2, 4.5).
//
// A tile is a square SVG (viewBox 0 0 1000 1000) built from a <symbol> in art/*.svg.
// Everything the game needs is declared in the art itself:
//   [data-layer]        a named <g> layer
//   [data-portal]       tap target that zooms the tile in (G2)
//   [data-zoom-frame]   invisible rect describing a zoom stage's viewBox
//   [data-hole]         geometry punched out of [data-hole-target] so a tile
//                       stacked underneath shows through (G5)
// Swapping art = replacing the <symbol> body (e.g. with a single <image>).

import { tween, easeInOutCubic } from './fx.js';

export const ART_IDS = ['t1', 't2', 't3', 't4'];

/** Tile definitions — docs/01.md 3.2 / 4.2, revised by docs/02.md D2. */
export const TILE_DEFS = {
  T1: {
    id: 'T1', art: 't1',
    layers: ['bg', 'window', 'table', 'beam', 'pot', 'soil', 'soil-wet', 'seed',
             'sprout', 'bud', 'flower', 'rain', 'trail-in', 'trail-join'],
    // the window sits on the right edge, so the butterfly trail arrives from the right
    edges: { left: null, right: 'butterfly-path', top: null, bottom: null },
    hole: { shape: 'window', accepts: ['sun'] },
    emits: null,
    provides: [],
    saturated: true
  },
  T2: {
    id: 'T2', art: 't2',
    layers: ['bg', 'cloud', 'rain'],
    edges: { left: null, right: null, top: null, bottom: 'rain-fall' },
    hole: null,
    emits: { side: 'bottom', item: 'rain' },
    provides: ['rain'],
    saturated: true
  },
  T3: {
    id: 'T3', art: 't3',
    layers: ['bg', 'beams', 'sun'],
    edges: { left: null, right: null, top: null, bottom: null },
    hole: null,
    emits: null,
    provides: ['sun'],
    saturated: false
  },
  T4: {
    id: 'T4', art: 't4',
    layers: ['bg', 'bed', 'trail', 'trail-join', 'butterfly'],
    // T4 stands to the right of T1: its trail is cut off at the LEFT edge
    edges: { left: 'butterfly-path', right: null, top: null, bottom: null },
    hole: null,
    emits: null,
    provides: ['butterfly'],
    saturated: false
  }
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const FULL_VIEW = [0, 0, 1000, 1000];
const ZOOM_MS = 350;

const symbols = new Map();

/**
 * Load the art symbols. art/*.svg is the single source of truth (docs/02.md D1),
 * so the page must be served over http(s); file:// is not supported.
 */
export async function loadArt() {
  await Promise.all(ART_IDS.map(async (id) => {
    const res = await fetch(`art/${id}.svg`, { cache: 'no-cache' });
    const doc = new DOMParser().parseFromString(await res.text(), 'image/svg+xml');
    const sym = doc.querySelector('symbol');
    if (sym) symbols.set(id, sym);
  }));
  return symbols;
}

let uid = 0;

export class Tile {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.zoom = 0;                     // 0 = whole scene, 1 = close-up
    this.layers = def.layers.slice();
    this.edges = { ...def.edges };
    this.hole = def.hole ? { ...def.hole } : null;
    this.emits = def.emits ? { ...def.emits } : null;
    this.provides = (def.provides || []).slice();
    this.saturated = def.saturated !== false;

    this.uid = `${def.id}-${++uid}`;
    this.el = document.createElement('div');
    this.el.className = 'tile';
    this.el.dataset.tile = def.id;

    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('viewBox', FULL_VIEW.join(' '));
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    this.el.appendChild(this.svg);

    const sym = symbols.get(def.art);
    if (sym) {
      for (const child of sym.children) {
        this.svg.appendChild(document.importNode(child, true));
      }
    }

    this._collectZoomStages();
    this._buildHoleMask();
    this.setSaturated(this.saturated);
    this.x = 0; this.y = 0; this.size = 0;
  }

  /* ---------- structure ---------- */

  layer(name) { return this.svg.querySelector(`[data-layer="${name}"]`); }
  portals() { return [...this.svg.querySelectorAll('[data-portal]')]; }

  _collectZoomStages() {
    this.zoomStages = [FULL_VIEW.slice()];
    const frames = [...this.svg.querySelectorAll('[data-zoom-frame]')]
      .sort((a, b) => +a.dataset.zoomFrame - +b.dataset.zoomFrame);
    for (const f of frames) {
      this.zoomStages.push([
        +f.getAttribute('x'), +f.getAttribute('y'),
        +f.getAttribute('width'), +f.getAttribute('height')
      ]);
      f.style.display = 'none';
    }
  }

  _buildHoleMask() {
    const holeGroup = this.svg.querySelector('[data-hole]');
    const target = this.svg.querySelector('[data-hole-target]');
    if (!holeGroup) return;
    holeGroup.style.display = 'none';
    if (!target) return;

    const defs = document.createElementNS(SVG_NS, 'defs');
    const mask = document.createElementNS(SVG_NS, 'mask');
    mask.id = `hole-${this.uid}`;
    mask.setAttribute('maskUnits', 'userSpaceOnUse');
    mask.setAttribute('x', '0'); mask.setAttribute('y', '0');
    mask.setAttribute('width', '1000'); mask.setAttribute('height', '1000');

    const full = document.createElementNS(SVG_NS, 'rect');
    full.setAttribute('x', '0'); full.setAttribute('y', '0');
    full.setAttribute('width', '1000'); full.setAttribute('height', '1000');
    full.setAttribute('fill', '#fff');
    mask.appendChild(full);

    for (const shape of holeGroup.children) {
      const cut = shape.cloneNode(true);
      cut.setAttribute('fill', '#000');
      cut.setAttribute('stroke', 'none');
      mask.appendChild(cut);
    }
    defs.appendChild(mask);
    this.svg.insertBefore(defs, this.svg.firstChild);
    target.setAttribute('mask', `url(#${mask.id})`);
    this.holeEl = holeGroup;
  }

  /* ---------- presentation ---------- */

  setSaturated(on) {
    this.saturated = !!on;
    this.el.classList.toggle('desaturated', !on);
  }

  /** Place & size in board pixels; `t` is an optional extra transform suffix. */
  setRect(x, y, size) {
    this.x = x; this.y = y; this.size = size;
    this.el.style.width = `${size}px`;
    this.el.style.height = `${size}px`;
    this.el.style.transform = this.restTransform();
  }

  restTransform() { return `translate(${this.x}px, ${this.y}px)`; }

  dragTransform(dx, dy) {
    return `translate(${this.x + dx}px, ${this.y + dy}px) scale(1.04)`;
  }

  /* ---------- zoom (G2 / G3) ---------- */

  get maxZoom() { return this.zoomStages.length - 1; }

  currentViewBox() {
    return this.svg.getAttribute('viewBox').split(/\s+/).map(Number);
  }

  async setZoom(level, animate = true) {
    const clamped = Math.max(0, Math.min(this.maxZoom, level));
    if (clamped === this.zoom) return false;
    const from = this.currentViewBox();
    const to = this.zoomStages[clamped];
    this.zoom = clamped;
    if (!animate) {
      this.svg.setAttribute('viewBox', to.join(' '));
      return true;
    }
    await tween(ZOOM_MS, (t) => {
      const vb = from.map((v, i) => v + (to[i] - v) * t);
      this.svg.setAttribute('viewBox', vb.join(' '));
    }, easeInOutCubic);
    return true;
  }

  zoomIn() { return this.setZoom(this.zoom + 1); }
  zoomOut() { return this.setZoom(0); }
}
