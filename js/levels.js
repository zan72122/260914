// Level data. World space is roughly 900x900; the camera fits `bounds` on any screen.
window.G = window.G || {};
(function (G) {
  G.LEVELS = [
    {
      // 1: meadow, noon. Build straight up.
      sky: ['#8fd3ff', '#e8f7ff'], hillFar: '#a9dca0', hillNear: '#7fc77a',
      ground: '#5aa657', groundDeep: '#3f7a3e', sun: { x: 760, y: 140, c: '#fff4b0' },
      bounds: { x: 190, y: 240, w: 520, h: 560 },
      terrain: [[-2000, 760], [200, 760], [250, 700], [650, 700], [700, 760], [2900, 760]],
      rocks: [],
      homeX: 450, walk: [265, 635], start: { x: 450, y: 700 },
      pipe: { x: 450, y: 330, dir: 'up' },
      gooCount: 18, need: 4, music: 0
    },
    {
      // 2: sunset cliffs. Bridge across the gap to the right.
      sky: ['#ff9a6b', '#ffd6a0'], hillFar: '#c98a9c', hillNear: '#9b5f7a',
      ground: '#8c6a4f', groundDeep: '#5e4433', sun: { x: 180, y: 220, c: '#ffe08a' },
      bounds: { x: 0, y: 360, w: 680, h: 460 },
      terrain: [[-2000, 620], [300, 620], [380, 790], [480, 790], [560, 610], [2900, 610]],
      rocks: [],
      homeX: 150, walk: [30, 285], start: { x: 255, y: 620 },
      pipe: { x: 640, y: 520, dir: 'right' },
      gooCount: 18, need: 4, music: 1
    },
    {
      // 3: starry night. Climb diagonally, leaning on a floating rock.
      sky: ['#1b1f4b', '#4a3b7a'], hillFar: '#2f2a5e', hillNear: '#23204a',
      ground: '#3a3466', groundDeep: '#221e40', sun: { x: 700, y: 160, c: '#fff7d6', moon: true },
      bounds: { x: 190, y: 240, w: 520, h: 560 },
      terrain: [[-2000, 780], [200, 780], [260, 700], [700, 700], [760, 780], [2900, 780]],
      rocks: [{ x: 410, y: 520, r: 44 }],
      homeX: 520, walk: [275, 685], start: { x: 570, y: 700 },
      pipe: { x: 270, y: 330, dir: 'left' },
      gooCount: 18, need: 4, music: 2
    }
  ];
})(window.G);
