// Level data in world units. y grows downward. Each level teaches one idea.
// Polygons are closed; list them clockwise or counter-clockwise, either works.

const FLOOR = 3000; // bottom of solid fills (well below deathY)

export const LEVELS = [
  {
    // 1: stroke the blob and it moves. Gentle slope running right toward the flower.
    seed: 11,
    start: [320, 180],
    goal: [1560, 470],
    deathY: 1200,
    bounds: [-300, 2000],
    solids: [
      [[-300, 300], [420, 300], [700, 360], [1200, 470], [1900, 470], [2000, 470], [2000, FLOOR], [-300, FLOOR]],
      [[-300, -800], [-220, -800], [-220, 300], [-300, 300]],
      [[1920, -800], [2000, -800], [2000, 470], [1920, 470]],
    ],
  },
  {
    // 2: erase the bottom/back so cells bud on top and spill over a low step.
    seed: 23,
    start: [320, 240],
    goal: [1500, 310],
    deathY: 1200,
    bounds: [-300, 2000],
    solids: [
      [[-300, 380], [600, 380], [700, 380], [720, 372], [736, 356], [744, 340], [748, 320], [750, 310], [1900, 310], [2000, 310], [2000, FLOOR], [-300, FLOOR]],
      [[-300, -800], [-220, -800], [-220, 380], [-300, 380]],
      [[1920, -800], [2000, -800], [2000, 310], [1920, 310]],
    ],
  },
  {
    // 3: erase the top so the blob flattens and squeezes under a mossy overhang.
    seed: 37,
    start: [320, 240],
    goal: [1500, 400],
    deathY: 1200,
    bounds: [-300, 2000],
    solids: [
      [[-300, 400], [2000, 400], [2000, FLOOR], [-300, FLOOR]],
      [[-300, -800], [-220, -800], [-220, 400], [-300, 400]],
      [[1920, -800], [2000, -800], [2000, 400], [1920, 400]],
      // overhang: from x=760 to 1060, ceiling at y=344 (56 units above ground)
      [[740, -800], [1080, -800], [1080, 300], [1060, 330], [1050, 344], [770, 344], [760, 330], [740, 300]],
    ],
  },
];
