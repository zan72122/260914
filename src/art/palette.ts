/** Crayon + pastel palette. No black anywhere: lines are dark brown. */

/** Paper (background) colour. */
export const PAPER = 0xfff7e8;
/** Crayon line colour — warm dark brown, never black. */
export const LINE = 0x5a4632;
/** Soft blue-grey blob shadow (never a hard black shadow). */
export const SHADOW = 0x9fb0c4;
export const SHADOW_ALPHA = 0.28;

/** Six pastel shirt colours: peach, sky, lemon, grass, lavender, apricot. */
export const SHIRTS = [0xffb3ba, 0xb3e1ff, 0xfff0a8, 0xc3eeb0, 0xd6c6f2, 0xffd3a8] as const;

/** Skin tones (warm pastels). */
export const SKINS = [0xffe2c8, 0xf7d3ae, 0xe8bd96, 0xd7a377] as const;

/** Hair colours (browns, still never black). */
export const HAIRS = [0x5a4632, 0x7a5c3c, 0x8f6b45, 0x3f342a] as const;

/** Per-scene paper tints from the plan (sky, grass, peach, lilac). */
export const SCENE_TINTS = [0xdff0fb, 0xe4f5dc, 0xfde4e4, 0xece4f7] as const;

export const LINE_WIDTH = 4;

export function hexToCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}
