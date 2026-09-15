/**
 * palette.js — SINGLE SOURCE OF TRUTH for the five elements.
 *
 * Every scene / world MUST read colours, spectra and labels from here.
 * Never draw `labelJa` — it exists only for speechSynthesis (see audio.js).
 *
 * Element record:
 * @typedef {Object} ElementDef
 * @property {string} id          'lithium' | 'copper' | 'sodium' | 'strontium' | 'barium'
 * @property {string} labelJa     utterance text (kana, audio only)
 * @property {string} flameColor  css hex — the flame / handoff colour
 * @property {string} glowColor   css hex — lighter variant used for ambient light
 * @property {string} ambient     css hex — the world's settled light colour
 * @property {string} sampleColor css hex — raw sample colour in the dish (NOT the flame colour)
 * @property {string} sampleShape 'pebble'|'coil'|'cubes'|'needles'|'plate'
 * @property {boolean} domed      true when the dish needs a protective glass dome
 * @property {Array<{nm:number,i:number}>} spectrum  emission lines (nm, intensity 0..1)
 * @property {{wave:string,notes:number[],release:number}} motif 3-note naming motif
 * @property {{w:number,h:number}} coreFrame default camera core rect
 */

/** @type {ElementDef[]} ordered — this order is the dish order in the hearth arc. */
export const ELEMENTS = [
  {
    id: 'lithium',
    labelJa: 'リチウム',
    flameColor: '#ff2a33',
    glowColor: '#ff7a6a',
    ambient: '#ff5a46',
    sampleColor: '#c9ccd4',
    sampleShape: 'pebble',
    domed: true,
    spectrum: [
      { nm: 670.8, i: 1.0 },
      { nm: 610.4, i: 0.35 }
    ],
    motif: { wave: 'triangle', notes: [523.25, 659.25, 783.99], release: 0.5 },
    coreFrame: { w: 600, h: 600 }
  },
  {
    id: 'copper',
    labelJa: 'どう',
    flameColor: '#1fe3c4',
    glowColor: '#9bfff0',
    ambient: '#2fd8d0',
    sampleColor: '#b4552c',
    sampleShape: 'coil',
    domed: false,
    spectrum: [
      { nm: 510.5, i: 0.7 },
      { nm: 515.3, i: 0.85 },
      { nm: 521.8, i: 1.0 }
    ],
    motif: { wave: 'sine', notes: [783.99, 1046.5, 1318.51], release: 0.45 },
    coreFrame: { w: 600, h: 600 }
  },
  {
    id: 'sodium',
    labelJa: 'ナトリウム',
    flameColor: '#ffc21a',
    glowColor: '#ffe9a0',
    ambient: '#ffae2b',
    sampleColor: '#f2f4f8',
    sampleShape: 'cubes',
    domed: true,
    spectrum: [
      { nm: 589.0, i: 1.0 }
    ],
    motif: { wave: 'sine', notes: [659.25, 659.25, 880.0], release: 0.55 },
    coreFrame: { w: 600, h: 600 }
  },
  {
    id: 'strontium',
    labelJa: 'ストロンチウム',
    flameColor: '#e5133f',
    glowColor: '#ff7186',
    ambient: '#e04a52',
    sampleColor: '#d08a86',
    sampleShape: 'needles',
    domed: false,
    spectrum: [
      { nm: 460.7, i: 0.5 },
      { nm: 650.4, i: 0.8 },
      { nm: 665.0, i: 1.0 },
      { nm: 687.8, i: 0.7 },
      { nm: 707.0, i: 0.6 }
    ],
    motif: { wave: 'square', notes: [523.25, 783.99, 1046.5], release: 0.4 },
    coreFrame: { w: 600, h: 600 }
  },
  {
    id: 'barium',
    labelJa: 'バリウム',
    flameColor: '#3ddc57',
    glowColor: '#b2ffa8',
    ambient: '#46d86a',
    sampleColor: '#8fae86',
    sampleShape: 'plate',
    domed: false,
    spectrum: [
      { nm: 513.7, i: 0.8 },
      { nm: 553.5, i: 1.0 },
      { nm: 577.8, i: 0.6 }
    ],
    motif: { wave: 'triangle', notes: [587.33, 739.99, 880.0], release: 0.9 },
    coreFrame: { w: 600, h: 600 }
  }
];

/** @type {Object<string, ElementDef>} */
export const ELEMENT_BY_ID = Object.create(null);
for (const e of ELEMENTS) ELEMENT_BY_ID[e.id] = e;

/** Ordered list of element ids. */
export const ELEMENT_IDS = ELEMENTS.map((e) => e.id);

/** The hearth's own (element-less) fire colours. */
export const HEARTH = {
  flameColor: '#ff9a35',
  flameCore: '#fff0c2',
  glowColor: '#ffbe6a',
  bg0: '#100910',
  bg1: '#1d0f14',
  stone: '#2a1a1c',
  stoneLit: '#4a2a26',
  wood: '#4b2f22',
  woodLit: '#6d4630',
  platinum: '#dfe6ef',
  hinoko: '#ffd27a'
};

/**
 * Approximate visible-spectrum wavelength -> css rgb colour.
 * Used by the spectroscope scene to colour the emission lines.
 * @param {number} nm 380..780
 * @returns {string} 'rgb(r,g,b)'
 */
export function nmToColor(nm) {
  let r = 0, g = 0, b = 0;
  if (nm >= 380 && nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else if (nm <= 780) { r = 1; }
  // gentle intensity roll-off at the ends of vision
  let f = 1;
  if (nm >= 380 && nm < 420) f = 0.3 + 0.7 * (nm - 380) / 40;
  else if (nm > 700 && nm <= 780) f = 0.3 + 0.7 * (780 - nm) / 80;
  // never return near-black: children need to SEE the line
  const lift = 0.22;
  const ch = (v) => Math.round(255 * Math.min(1, lift + (1 - lift) * Math.pow(Math.max(0, v) * f, 0.8)));
  return `rgb(${ch(r)},${ch(g)},${ch(b)})`;
}

/**
 * Map a wavelength to a 0..1 horizontal position for spectrum drawing.
 * @param {number} nm
 * @param {number} [lo=420] @param {number} [hi=720]
 */
export function nmToX01(nm, lo = 420, hi = 720) {
  return Math.max(0, Math.min(1, (nm - lo) / (hi - lo)));
}
