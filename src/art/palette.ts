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

/**
 * Per-scene paper tints. One per scene in running order (§3: the paper colour
 * changes with the place), pastel throughout and never dark — the only dim
 * scene is the last one, which uses NIGHT below.
 */
export const SCENE_TINTS = [
  0xdff0fb, // 1 gather    — sky
  0xe8f3d8, // 2 march     — young grass
  0xffe8ef, // 3 tickle    — blossom
  0xfde4e4, // 4 ball pit  — peach
  0xdcf2ee, // 5 butterfly — mint
  0xfdeccd, // 6 slide     — apricot
  0xdcefd9, // 7 hide      — leaf
  0xe7ecfb, // 8 balloon   — high sky
  0xfbe9d2, // 9 tower     — sand
  0x6f68a8, // 10 sleep    — deep lavender night (see NIGHT)
] as const;

/**
 * Night paper: a deep lavender-indigo. Deliberately NOT black — §9's review
 * asks for no scary darkness anywhere, so the last scene dims to a colour a
 * child would call "purple", not to an absence of light.
 */
export const NIGHT = 0x6f68a8;
/** Morning paper the night brightens into before the loop starts again. */
export const MORNING = 0xfff2dd;
/** Multiplier laid over the kids at night so they sit inside the dusk. */
export const NIGHT_KID_TINT = 0xc8c3e8;

/** Scene 2: the crayon path the line of kids walks along. */
export const PATH_FILL = 0xf6e3bd;
export const PATH_EDGE = 0xd8b78a;

/**
 * Scene 5: the butterfly.
 *
 * The only saturated colours in the whole palette, and deliberately so. Every
 * other thing in this game may be a soft pastel because it is allowed to sit
 * in the crowd; the butterfly is the one object a 4-year-old has to FIND among
 * thirty faces, so it is warm orange and sunflower yellow with deep-orange
 * spots, at roughly twice the size of a kid's head. A pastel butterfly the
 * size of a head simply vanished into the crowd (see docs/04.md).
 */
export const BUTTERFLY_WING = 0xffa22b;
export const BUTTERFLY_WING2 = 0xffd23f;
/** The spots on the wings: a pattern reads as "creature", not "blob". */
export const BUTTERFLY_SPOT = 0xe0621a;
/** The faint dotted crayon trail it leaves behind while it flies. */
export const BUTTERFLY_TRAIL = 0xffb14a;

/** Scene 6: the slide — apricot slope on a sky-blue frame. */
export const SLIDE_SLOPE = 0xffcf9b;
export const SLIDE_FRAME = 0x9fd7f0;

/** Scene 7: the bushes kids hide in. */
export const BUSH_FILL = 0xa8dd96;
export const BUSH_DARK = 0x86c878;

/** Scene 8: balloon colours (the pastel six, a touch more saturated). */
export const BALLOONS = [0xff9fb0, 0x9fd4ff, 0xffe887, 0xaee89a, 0xc9b4f5, 0xffc08a] as const;

/** Scene 10: the stars, and the pale glow around them. */
export const STAR_FILL = 0xfff3b0;
export const STAR_GLOW = 0xfff8d8;

/** Six pastel ball colours for the ball pit (matched to the shirt palette). */
export const BALLS = [0xffb3ba, 0xb3e1ff, 0xfff0a8, 0xc3eeb0, 0xd6c6f2, 0xffd3a8] as const;

/** Confetti dots: the same pastels, used as tiny burst specks. */
export const CONFETTI = BALLS;

/** Ball-pit basin fill — a pale pool of water-blue under the balls. */
export const PIT_FILL = 0xd8eef8;
/** Ball-pit rim colour (a warm crayon ring around the pit). */
export const PIT_RIM = 0xf3b6a0;

/** The finger ring: warm peach-pink, clearly visible on cream paper. */
export const FINGER_RING = 0xff8fa3;

export const LINE_WIDTH = 4;

export function hexToCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}
