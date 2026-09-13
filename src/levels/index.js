// 6 つのステージ。朝 → 夜へ進む。
// cells: 固定の足場 { x, z, h, base? }
// gadgets: 仕掛け。order: ヒントの順番(仕掛け id の配列)
// sky: [上, 中, 下] の色。light: { sky, ground, sun }
// illusion: 画面上で隣り合って見えるセルを歩けるようにする

const X = { x: 1, z: 0 };
const NX = { x: -1, z: 0 };
const NZ = { x: 0, z: -1 };

export const LEVELS = [
  // 1. 朝: 回転塔
  {
    name: 'morning',
    sky: ['#f9e4cf', '#f3c9c0', '#c9b8d8'],
    light: { sky: 0xfff4e0, ground: 0xc9b0d8, sun: 0xfff2dc },
    cells: [
      { x: 0, z: 2, h: 3 },
      { x: 1, z: 2, h: 3 },
      { x: 2, z: 2, h: 3 },
      { x: 4, z: 0, h: 3 },
      { x: 4, z: -1, h: 3 },
      { x: 4, z: -2, h: 3 },
    ],
    start: { x: 0, z: 2 },
    goal: { x: 4, z: -2 },
    doorDir: NZ,
    entryDir: NX,
    gadgets: [
      {
        type: 'rotator',
        id: 'r1',
        x: 4,
        z: 2,
        h: 3,
        arms: [
          { x: 0, z: 0 },
          { x: -1, z: 0 },
          { x: 0, z: 1 },
        ],
        initial: 2,
        solution: [3],
      },
    ],
    order: ['r1'],
  },

  // 2. 朝〜昼: 引き出しブロック
  {
    name: 'late-morning',
    sky: ['#e3f2ff', '#c8e3f6', '#f7dcc8'],
    light: { sky: 0xf4fbff, ground: 0xd8c6b4, sun: 0xfff8e6 },
    palette: { platformSide: 0xd9a986, platformTop: 0xfbf1dc, towerBody: 0xa9cfd2 },
    cells: [
      { x: 0, z: 0, h: 3 },
      { x: 1, z: 0, h: 3 },
      { x: 5, z: 0, h: 3 },
      { x: 6, z: 0, h: 3 },
    ],
    start: { x: 0, z: 0 },
    goal: { x: 6, z: 0 },
    doorDir: NZ,
    entryDir: NX,
    decor: [
      // 引き出しの箪笥
      { type: 'box', x: 3, z: -2, w: 3.3, d: 3, h: 4.6, base: 0, color: 0x9fb6c9, top: 0xc9dbe8 },
    ],
    gadgets: [
      {
        type: 'slider',
        id: 's1',
        cells: [
          { x: 2, z: 0 },
          { x: 3, z: 0 },
          { x: 4, z: 0 },
        ],
        h: 3,
        axis: { x: 0, z: 1 },
        travel: 1,
        roadDirs: [X, NX],
      },
    ],
    order: ['s1'],
  },

  // 3. 昼: スイッチ床
  {
    name: 'noon',
    sky: ['#eaf6e2', '#cfe9d6', '#f9e6bf'],
    light: { sky: 0xffffff, ground: 0xc8d8b8, sun: 0xfffbe8 },
    palette: { platformSide: 0xc9b07f, platformTop: 0xfaf3d9, platformSideDark: 0xb39a6a },
    cells: [
      { x: 0, z: 0, h: 3 },
      { x: 1, z: 0, h: 3 },
      { x: 2, z: 0, h: 3 },
      { x: 5, z: 0, h: 5 },
      { x: 6, z: 0, h: 5 },
    ],
    start: { x: 0, z: 0 },
    goal: { x: 6, z: 0 },
    doorDir: NZ,
    entryDir: NX,
    gadgets: [
      { type: 'switch', id: 'sw', x: 1, z: 1, h: 3, target: 'st' },
      {
        type: 'stairs',
        id: 'st',
        cells: [
          { x: 3, z: 0, h: 4, stair: NX },
          { x: 4, z: 0, h: 5, stair: NX },
        ],
      },
    ],
    order: ['sw'],
  },

  // 4. 夕: 回転塔 + 錯視。高い道と低い道が画面上でつながる。
  {
    name: 'evening',
    sky: ['#f7c59f', '#ef9a8a', '#8f6fae'],
    light: { sky: 0xffdcc0, ground: 0x8a6aa8, sun: 0xffc9a0 },
    palette: { platformSide: 0xc98a72, platformTop: 0xfbe4cf, towerBody: 0xc7a2c9, towerBodyDark: 0xa985ac, towerTop: 0xfbe4cf, road: 0xf1cfae },
    illusion: true,
    cells: [
      { x: 0, z: 0, h: 4 },
      { x: 1, z: 0, h: 4 },
      // 低い道(浮いた板)。(4,4,0) の隣に見える。
      { x: 4, z: -1, h: 3, base: 2 },
      { x: 5, z: -1, h: 3, base: 2 },
      { x: 6, z: -1, h: 3, base: 2 },
    ],
    start: { x: 0, z: 0 },
    goal: { x: 6, z: -1 },
    doorDir: NZ,
    entryDir: NX,
    gadgets: [
      {
        type: 'rotator',
        id: 'r1',
        x: 3,
        z: 0,
        h: 4,
        radius: 0.62,
        ring: 1.05,
        arms: [
          { x: -1, z: 0 },
          { x: 0, z: 0 },
          { x: 1, z: 0 },
        ],
        initial: 1,
        solution: [0, 2],
      },
    ],
    order: ['r1'],
  },

  // 5. 夕〜夜: 引き出し → 回転塔
  {
    name: 'dusk',
    sky: ['#c58ea6', '#8c6aa4', '#3f3d78'],
    light: { sky: 0xe8c8e0, ground: 0x4a4478, sun: 0xffc8d8 },
    palette: { platformSide: 0x8f6f95, platformTop: 0xead7e6, towerBody: 0x7fa9ad, towerBodyDark: 0x5f8b90, drawerSide: 0xa87ca0, drawerTop: 0xf2dcee, road: 0xe6c6dc },
    cells: [
      { x: 0, z: 0, h: 3 },
      { x: 1, z: 0, h: 3 },
      { x: 5, z: -2, h: 3 },
      { x: 5, z: -3, h: 3 },
    ],
    start: { x: 0, z: 0 },
    goal: { x: 5, z: -3 },
    doorDir: NZ,
    entryDir: NX,
    decor: [{ type: 'box', x: 2.5, z: -2, w: 2.3, d: 3, h: 4.4, base: 0, color: 0x6e5a8c, top: 0x9d88b8 }],
    gadgets: [
      {
        type: 'slider',
        id: 's1',
        cells: [
          { x: 2, z: 0 },
          { x: 3, z: 0 },
        ],
        h: 3,
        axis: { x: 0, z: 1 },
        travel: 1,
        roadDirs: [X, NX],
      },
      {
        type: 'rotator',
        id: 'r1',
        x: 5,
        z: 0,
        h: 3,
        arms: [
          { x: 0, z: 0 },
          { x: -1, z: 0 },
          { x: 0, z: 1 },
        ],
        initial: 1,
        solution: [3],
      },
    ],
    order: ['s1', 'r1'],
  },

  // 6. 夜: スイッチ床 → 回転塔で錯視。星と提灯。
  {
    name: 'night',
    sky: ['#1e2247', '#2f2f6b', '#5a4a86'],
    light: { sky: 0x8f8fd0, ground: 0x2a2450, sun: 0xb8b8ff },
    stars: true,
    illusion: true,
    palette: {
      platformSide: 0x4d4a7a,
      platformTop: 0xb9b3d9,
      platformSideDark: 0x3a3760,
      towerBody: 0x5f6f9e,
      towerBodyDark: 0x475680,
      towerTop: 0xc4bde0,
      road: 0xa9a0cc,
      handle: 0xf0a060,
      handleGlow: 0xffc080,
    },
    cells: [
      { x: 0, z: 0, h: 3 },
      { x: 1, z: 0, h: 3 },
      { x: 2, z: 0, h: 3 },
      { x: 6, z: -1, h: 3, base: 2 },
      { x: 7, z: -1, h: 3, base: 2 },
      { x: 8, z: -1, h: 3, base: 2 },
    ],
    start: { x: 0, z: 0 },
    goal: { x: 8, z: -1 },
    doorDir: NZ,
    entryDir: NX,
    decor: [
      { type: 'lantern', x: 0.5, z: 0.5, h: 3 },
      { type: 'lantern', x: 8.5, z: -0.5, h: 3 },
    ],
    gadgets: [
      { type: 'switch', id: 'sw', x: 1, z: 1, h: 3, target: 'st' },
      { type: 'stairs', id: 'st', cells: [{ x: 3, z: 0, h: 4, stair: NX }] },
      {
        type: 'rotator',
        id: 'r1',
        x: 5,
        z: 0,
        h: 4,
        radius: 0.62,
        ring: 1.05,
        arms: [
          { x: -1, z: 0 },
          { x: 0, z: 0 },
          { x: 1, z: 0 },
        ],
        initial: 1,
        solution: [0, 2],
      },
    ],
    order: ['sw', 'r1'],
  },
];
