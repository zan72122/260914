// レベル定義。座標は画面比 (x: 0..1 の幅, y: 0..1 の高さ)、半径は短辺比。
// ring.target: 'player' か 他の円の id。輪の色は入るべき円の色になる。
(function () {
  const C = {
    player: '#3D5AFE', // あお: じぶんの円
    warm:   '#FF7A00', // だいだい: 近づくと膨らむ
    cold:   '#00C2FF', // みずいろ: 近づくと縮む
    push:   '#2ECC40', // みどり: 押せる
    flee:   '#FF4FA3', // ピンク: 逃げる
    follow: '#FFD600', // きいろ: ついてくる
  };
  const R = 0.08; // じぶんの円の基本半径 (指の下からはみ出す大きさ)

  window.LEVELS = [
    // 1. 動かす
    {
      bg: '#FFF6E5',
      player: { x: 0.5, y: 0.72, r: R },
      ring:   { x: 0.5, y: 0.28, r: R, target: 'player' },
      demo: true,
      items: [],
    },
    // 2. 膨らむ
    {
      bg: '#E8F7FF',
      player: { x: 0.25, y: 0.75, r: R, maxScale: 1.7 },
      ring:   { x: 0.72, y: 0.25, r: R * 1.7, target: 'player' },
      items: [
        { id: 'warm', type: 'grow', x: 0.7, y: 0.72, r: 0.055, color: C.warm },
      ],
    },
    // 3. 縮む
    {
      bg: '#FFF0F5',
      player: { x: 0.5, y: 0.78, r: R, minScale: 0.55 },
      ring:   { x: 0.5, y: 0.22, r: R * 0.55, target: 'player' },
      items: [
        { id: 'cold', type: 'shrink', x: 0.22, y: 0.42, r: 0.055, color: C.cold },
      ],
    },
    // 4. 押す
    {
      bg: '#F0FFF0',
      player: { x: 0.2, y: 0.8, r: R },
      ring:   { x: 0.78, y: 0.22, r: 0.075, target: 'ball' },
      items: [
        { id: 'ball', type: 'push', x: 0.42, y: 0.58, r: 0.075, color: C.push },
      ],
    },
    // 5. 逃げる
    {
      bg: '#FFFBE0',
      player: { x: 0.5, y: 0.5, r: R },
      ring:   { x: 0.86, y: 0.14, r: 0.06, target: 'shy', corner: true },
      items: [
        { id: 'shy', type: 'flee', x: 0.62, y: 0.32, r: 0.06, color: C.flee },
      ],
    },
    // 6. ついてくる
    {
      bg: '#EEF0FF',
      player: { x: 0.5, y: 0.5, r: R },
      ring:   { x: 0.5, y: 0.18, r: 0.06, target: 'pal' },
      items: [
        { id: 'pal', type: 'follow', x: 0.5, y: 0.84, r: 0.06, color: C.follow },
      ],
    },
  ];
  window.COLORS = C;
})();
