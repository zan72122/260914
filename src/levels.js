// Level definitions. See parseLevel() in sim/grid.js for the token format.
// Colours: 1 = red (circle tag), 2 = blue (square tag), 3 = yellow (triangle tag).
// `solution` is one known solution, used by tests; the solver also verifies solvability.
export const LEVELS = [
  {
    id: 1,
    map: `
      .. .. .. ..
      1> == .. L>
      .. TT .. ..
      .. .. .. ..`,
    solution: [[2, 1, 'H']],
  },
  {
    id: 2,
    map: `
      .. .. .. ..
      .. TT .. ..
      1> .. .. L>
      .. TT .. ..`,
    solution: [[1, 2, 'H'], [2, 2, 'H']],
  },
  {
    id: 3,
    map: `
      .. .. .. ..
      .. .. == L>
      .. || .. ..
      .. 1^ .. TT`,
    solution: [[1, 1, 'SE']],
  },
  {
    id: 4,
    map: `
      .. .. TT .. ..
      .. .. .. .. L>
      .. .. .. || ..
      .. TT .. || ..
      1> == == .. ..`,
    solution: [[3, 4, 'NW'], [3, 1, 'SE']],
  },
  {
    id: 5,
    map: `
      .. TT .. .. ..
      1> .. ## .. L>
      .. .. == .. ..
      .. .. .. .. ..
      TT .. .. .. TT`,
    solution: [[1, 1, 'SW'], [1, 2, 'NE'], [3, 2, 'NW'], [3, 1, 'SE']],
  },
  {
    id: 6,
    map: `
      .. .. .. .. ..
      .. .. TT .. ..
      2> 1> .. .. L>
      .. TT .. TT ..
      .. .. .. .. ..`,
    solution: [[2, 2, 'H'], [3, 2, 'H']],
  },
  {
    id: 7,
    map: `
      .. .. .. .. ..
      .. .. 1v .. ..
      2> .. Y  .. L>
      .. .. .. .. ..
      .. TT .. TT ..`,
    junctions: [{ x: 2, y: 2, trunk: 'E', branches: ['W', 'N'] }],
    solution: [[1, 2, 'H'], [3, 2, 'H']],
  },
  {
    id: 8,
    map: `
      .. TT .. .. ..
      .. .. .. .. ..
      .. .. Y  .. L>
      2> .. || .. ..
      .. .. 1^ .. TT`,
    junctions: [{ x: 2, y: 2, trunk: 'E', branches: ['S', 'W'] }],
    solution: [[1, 3, 'NW'], [1, 2, 'SE'], [3, 2, 'H']],
  },
  {
    id: 9,
    map: `
      .. .. .. 2v .. ..
      .. .. .. .. .. ..
      .. .. .. .. .. TT
      1> == == Y  == L>
      .. TT .. .. .. ..
      .. .. .. .. .. ..`,
    junctions: [{ x: 3, y: 3, trunk: 'E', branches: ['W', 'N'] }],
    solution: [[3, 1, 'NE'], [4, 1, 'SW'], [4, 2, 'NW'], [3, 2, 'SE']],
  },
  {
    id: 10,
    map: `
      .. .. .. .. .. ..
      .. .. 2> .. .. ..
      .. .. .. .. == ..
      .. .. .. Y  == L>
      .. TT .. .. .. ..
      1> == == .. .. ..`,
    junctions: [{ x: 3, y: 3, trunk: 'E', branches: ['S', 'N'] }],
    solution: [[3, 5, 'NW'], [3, 4, 'V'], [3, 1, 'H'], [4, 1, 'H'], [5, 1, 'SW'], [5, 2, 'NW'], [3, 2, 'SE']],
  },
  {
    id: 11,
    map: `
      .. .. 1v .. .. ..
      .. .. .. .. TT ..
      .. .. Y  .. .. ..
      2> .. .. .. .. ..
      .. .. Y  == == L>
      .. .. .. .. .. ..
      3> == == .. TT ..`,
    junctions: [
      { x: 2, y: 2, trunk: 'S', branches: ['N', 'W'] },
      { x: 2, y: 4, trunk: 'E', branches: ['N', 'S'] },
    ],
    solution: [[2, 1, 'V'], [2, 3, 'V'], [1, 3, 'NW'], [1, 2, 'SE'], [3, 6, 'NW'], [3, 5, 'SW'], [2, 5, 'NE']],
  },
  {
    id: 12,
    map: `
      .. 3v .. .. .. .. ..
      .. .. .. 1v .. TT ..
      .. .. .. .. .. .. ..
      2> .. .. Y  == == L>
      .. TT .. .. .. .. ..
      .. .. .. .. TT .. ..`,
    junctions: [{ x: 3, y: 3, trunk: 'E', branches: ['W', 'N'] }],
    solution: [[3, 2, 'V'], [1, 3, 'H'], [2, 3, 'H'], [1, 1, 'NE'], [2, 1, 'NW'], [2, 0, 'SE'], [3, 0, 'SW']],
  },
  {
    id: 13,
    map: `
      .. .. .. 1v .. .. ..
      .. TT .. .. .. .. ..
      2> == == Y  .. .. ..
      .. .. .. .. .. TT ..
      .. .. .. Y  == == L>
      .. .. .. .. .. .. ..
      3> == == .. .. .. ..`,
    junctions: [
      { x: 3, y: 2, trunk: 'S', branches: ['N', 'W'] },
      { x: 3, y: 4, trunk: 'E', branches: ['N', 'S'] },
    ],
    solution: [[3, 1, 'V'], [3, 3, 'V'], [3, 6, 'H'], [4, 6, 'NW'], [4, 5, 'SW'], [3, 5, 'NE']],
  },
  {
    id: 14,
    map: `
      .. .. .. 2v .. .. ..
      .. .. .. .. .. .. ..
      .. TT .. .. .. .. ..
      1> Y  == Y  == == L>
      .. .. .. .. .. .. ..
      3> == .. .. .. TT ..
      .. .. .. .. .. .. ..`,
    junctions: [
      { x: 1, y: 3, trunk: 'E', branches: ['W', 'S'] },
      { x: 3, y: 3, trunk: 'E', branches: ['W', 'N'] },
    ],
    solution: [[3, 1, 'NE'], [4, 1, 'SW'], [4, 2, 'NW'], [3, 2, 'SE'], [2, 5, 'NW'], [2, 4, 'SW'], [1, 4, 'NE']],
  },
  {
    id: 15,
    map: `
      2> == == .. .. .. ..
      .. .. .. .. .. TT ..
      .. TT .. Y  .. .. 3<
      .. .. .. .. .. || ..
      1> == == Y  .. .. ..
      .. .. .. || .. .. ..
      .. .. .. Lv .. .. ..`,
    junctions: [
      { x: 3, y: 2, trunk: 'S', branches: ['N', 'E'] },
      { x: 3, y: 4, trunk: 'S', branches: ['N', 'W'] },
    ],
    solution: [[3, 0, 'SW'], [3, 1, 'V'], [3, 3, 'V'], [5, 2, 'SE'], [5, 4, 'NW'], [4, 4, 'NE'], [4, 3, 'V'], [4, 2, 'SW']],
  },
];
