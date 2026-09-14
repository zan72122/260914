// タイル記法: "<地形> [道ビット NESW] [装飾]"
//  地形: g 草原 / w 水 / f 森 / m 岩山 / k 花畑 / d 洞窟 / s 砂地 / b 橋(水の上の道)
//  装飾: house(1面の家=開始) / start(開始) / goal(おばあちゃん) / ghouse(おばあちゃんの家=最終ゴール)
//        tree bush rock stump lantern
// flaps[辺] は「その辺を折ったとき、内側の列(行)に現れる裏面」を画面上の向きそのままで書く。
// sides は つまめる辺（省略時は4辺すべて）。

export const LEVELS = [
  // 1. 家の前の庭: 右端を折ると橋がかかる
  {
    scene: 'meadow',
    front: [
      ['f', 'f', 'f', 'f tree'],
      ['g E house', 'g EW', 'w', 'g bush'],
      ['f', 'f', 'w', 'f'],
      ['g E goal', 'g EW', 'w', 'g tree'],
    ],
    flaps: { R: ['w', 'b WS', 'b NS', 'b NW'] },
    sides: ['R'],
  },
  // 2. 森の入口: 左端を折る
  {
    scene: 'forest',
    front: [
      ['f', 'f tree', 'f', 'f'],
      ['g bush', 'w', 'g EW', 'g W start'],
      ['f', 'w', 'f', 'f'],
      ['g tree', 'w', 'g EW', 'g W goal'],
    ],
    flaps: { L: ['w', 'b ES', 'b NS', 'b NE'] },
    sides: ['L'],
  },
  // 3. 小川: 下端を折る
  {
    scene: 'stream',
    front: [
      ['f', 'g S start', 'f', 'g S goal'],
      ['f', 'g NS', 'f', 'g NS'],
      ['f', 'w', 'f', 'w'],
      ['g bush', 'w', 'g tree', 'w'],
    ],
    flaps: { B: ['w', 'b NE', 'b EW', 'b NW'] },
    sides: ['B'],
  },
  // 4. 花畑: 上端を折る
  {
    scene: 'flowers',
    front: [
      ['k', 'w', 'k bush', 'w'],
      ['k', 'w', 'k', 'w'],
      ['k', 'k NS', 'k', 'k NS'],
      ['k tree', 'k N start', 'k', 'k N goal'],
    ],
    flaps: { T: ['w', 'b SE', 'b EW', 'b SW'] },
    sides: ['T'],
  },
  // 5. 分かれ道: 右端は湖(はずれ)、下端が正解
  {
    scene: 'lake',
    front: [
      ['f', 'g S start', 'f', 'g S goal'],
      ['f', 'g NS', 'f', 'g NS'],
      ['f', 'w', 'f', 'w'],
      ['g bush', 'w', 'g tree', 'w'],
    ],
    flaps: { B: ['w', 'b NE', 'b EW', 'b NW'], R: ['w', 'w', 'w', 'w'] },
    sides: ['B', 'R'],
  },
  // 6. 山道: 長い迂回
  {
    scene: 'mountain',
    front: [
      ['g S start', 'm', 'm', 'g S goal'],
      ['g NS', 'm', 'm', 'g NS'],
      ['w', 'w', 'w', 'w'],
      ['g rock', 'g', 'g rock', 'g'],
    ],
    flaps: { B: ['b NE', 'b EW', 'b EW', 'b NW'], L: ['m', 'm', 'w', 'm'] },
    sides: ['B', 'L'],
  },
  // 7. 吊り橋: 右を折って渡り、戻して、下を折る
  {
    scene: 'bridge',
    front: [
      ['g E start', 'g EW', 'w', 'g S goal'],
      ['f', 'g ES', 'w', 'g NS'],
      ['f', 'm', 'w', 'm'],
      ['k', 'k', 'w', 'k'],
    ],
    flaps: { R: ['b WS', 'b NW', 'w', 'w'], B: ['m', 'b NE', 'b EW', 'b NW'] },
    sides: ['R', 'B'],
  },
  // 8. 洞窟: ハナが端に立っていると折れない
  {
    scene: 'cave',
    front: [
      ['d', 'd', 'd', 'd'],
      ['d E lantern', 'd EW', 'd EW', 'd W start'],
      ['d', 'd', 'w', 'd'],
      ['d E goal', 'd EW', 'w', 'd'],
    ],
    flaps: { R: ['d', 'b WS', 'b NS', 'b NW'] },
    sides: ['R'],
  },
  // 9. 雨の丘: 左を折って渡り、戻して、上を折る
  {
    scene: 'rain',
    front: [
      ['g', 'g', 'g', 'g S start'],
      ['m', 'w', 'm', 'g NS'],
      ['g NS', 'w', 'g NW', 'g NS'],
      ['g N goal', 'w', 'g EW', 'g NW'],
    ],
    flaps: { L: ['w', 'w', 'b SE', 'b NE'], T: ['g SE', 'g EW', 'g SW', 'm'] },
    sides: ['L', 'T'],
  },
  // 10. おばあちゃんの村: 下を折って渡り、戻して、左を折る
  {
    scene: 'village',
    front: [
      ['g', 'f', 'f', 'g S start'],
      ['g', 'm', 'g SW', 'g NS'],
      ['g', 'w', 'w', 'w'],
      ['g bush', 'm', 'g EW', 'g W ghouse'],
    ],
    flaps: { B: ['w', 'w', 'b NE', 'b NW'], L: ['m', 'g ES', 'g NS', 'g NE'] },
    sides: ['B', 'L'],
  },
];
