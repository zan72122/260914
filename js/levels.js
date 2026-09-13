// レベル定義。
// 座標: {x, y} は画面比 (0..1)。{cx, cy} は画面中央からのオフセット (短辺比) で、縦横で同じ形を保つ。
// 半径 r は短辺比。ring.target: 'player' / 円の id / { type: '種類' } (その種類のどれでも)。
// { type: 'gate', cy, gap, r }: 画面端まで届く壁の列。中央に幅 gap (短辺比) の隙間ができる。
(function () {
  const C = {
    player: '#3D5AFE', // あお: じぶんの円
    warm:   '#FF7A00', // だいだい: 近づくと膨らむ
    cold:   '#00C2FF', // みずいろ: 近づくと縮む
    push:   '#2ECC40', // みどり: 押せる
    flee:   '#FF4FA3', // ピンク: 逃げる
    follow: '#FFD600', // きいろ: ついてくる
    wall:   '#C9CCD6', // はいいろ: 壁 (生き物ではない)
    sticky: '#9C4DFF', // むらさき: くっつく
    merge:  '#00BFA5', // あおみどり: 合体する
    split:  '#FF3B30', // あか: 分裂する
  };
  const R = 0.08; // じぶんの円の基本半径 (指の下からはみ出す大きさ)
  const M2 = 0.05 * Math.SQRT2;        // 合体: 0.05 が2つ → 0.0707
  const M3 = 0.045 * Math.sqrt(3);     // 合体: 0.045 が3つ → 0.078
  const SP = 0.09 / Math.sqrt(3);      // 分裂: 0.09 → 0.052 が3つ

  window.LEVELS = [
    // 1. 動かす
    { bg: '#FFF6E5', demo: true,
      player: { x: 0.5, y: 0.72, r: R },
      rings: [{ x: 0.5, y: 0.28, r: R, target: 'player' }],
      items: [] },
    // 2. 膨らむ
    { bg: '#E8F7FF',
      player: { x: 0.25, y: 0.75, r: R, maxScale: 1.7 },
      rings: [{ x: 0.72, y: 0.25, r: R * 1.7, target: 'player' }],
      items: [{ id: 'warm', type: 'grow', x: 0.7, y: 0.72, r: 0.055, color: C.warm }] },
    // 3. 縮む
    { bg: '#FFF0F5',
      player: { x: 0.5, y: 0.78, r: R, minScale: 0.55 },
      rings: [{ x: 0.5, y: 0.22, r: R * 0.55, target: 'player' }],
      items: [{ id: 'cold', type: 'shrink', x: 0.22, y: 0.42, r: 0.055, color: C.cold }] },
    // 4. 押す
    { bg: '#F0FFF0',
      player: { x: 0.2, y: 0.8, r: R },
      rings: [{ x: 0.78, y: 0.22, r: 0.075, target: 'ball' }],
      items: [{ id: 'ball', type: 'push', x: 0.42, y: 0.58, r: 0.075, color: C.push }] },
    // 5. 逃げる
    { bg: '#FFFBE0',
      player: { x: 0.5, y: 0.5, r: R },
      rings: [{ x: 0.86, y: 0.14, r: 0.06, target: 'shy', corner: true }],
      items: [{ id: 'shy', type: 'flee', x: 0.62, y: 0.32, r: 0.06, color: C.flee }] },
    // 6. ついてくる
    { bg: '#EEF0FF',
      player: { x: 0.5, y: 0.5, r: R },
      rings: [{ x: 0.5, y: 0.18, r: 0.06, target: 'pal' }],
      items: [{ id: 'pal', type: 'follow', x: 0.5, y: 0.84, r: 0.06, color: C.follow }] },

    // 7. 壁 (紹介): 真ん中の大きな灰色を回り込む
    { bg: '#F4F6FA',
      player: { cx: 0, cy: 0.38, r: R },
      rings: [{ cx: 0, cy: -0.38, r: R, target: 'player' }],
      items: [{ id: 'w', type: 'wall', cx: 0, cy: 0, r: 0.2, color: C.wall }] },
    // 8. 壁 + 縮む: 狭い隙間を縮んで通る
    { bg: '#EAF9FF',
      player: { cx: 0, cy: 0.38, r: R, minScale: 0.5 },
      rings: [{ cx: 0, cy: -0.36, r: R * 0.5, target: 'player' }],
      items: [
        { type: 'gate', cy: 0, gap: 0.135, r: 0.24 },
        { id: 'cold', type: 'shrink', cx: -0.3, cy: 0.3, r: 0.05, color: C.cold },
      ] },
    // 9. くっつく (紹介)
    { bg: '#F5EEFF',
      player: { cx: -0.25, cy: 0.32, r: R },
      rings: [{ cx: 0, cy: -0.34, r: 0.06, target: 'st' }],
      items: [{ id: 'st', type: 'sticky', cx: 0.25, cy: 0.25, r: 0.06, color: C.sticky }] },
    // 10. くっつく ×2 + 輪 ×2
    { bg: '#F1EBFF',
      player: { cx: 0, cy: 0.05, r: R },
      rings: [
        { cx: -0.28, cy: -0.36, r: 0.06, target: { type: 'sticky' } },
        { cx: 0.28, cy: -0.36, r: 0.06, target: { type: 'sticky' } },
      ],
      items: [
        { id: 'st1', type: 'sticky', cx: -0.3, cy: 0.34, r: 0.06, color: C.sticky },
        { id: 'st2', type: 'sticky', cx: 0.3, cy: 0.34, r: 0.06, color: C.sticky },
      ] },
    // 11. 合体 (紹介): 小さな2つをぶつけると大きくなる
    { bg: '#E6FBF7',
      player: { cx: -0.3, cy: 0.36, r: R },
      rings: [{ cx: 0, cy: -0.36, r: M2, target: { type: 'merge' } }],
      items: [
        { id: 'm1', type: 'merge', cx: -0.12, cy: 0.1, r: 0.05, color: C.merge },
        { id: 'm2', type: 'merge', cx: 0.16, cy: 0.12, r: 0.05, color: C.merge },
      ] },
    // 12. 合体 ×3 + 壁
    { bg: '#E0F7F2',
      player: { cx: 0, cy: 0.42, r: R },
      rings: [{ cx: 0, cy: -0.4, r: M3, target: { type: 'merge' } }],
      items: [
        { id: 'w', type: 'wall', cx: 0, cy: -0.02, r: 0.14, color: C.wall },
        { id: 'm1', type: 'merge', cx: -0.3, cy: 0.2, r: 0.045, color: C.merge },
        { id: 'm2', type: 'merge', cx: 0.3, cy: 0.2, r: 0.045, color: C.merge },
        { id: 'm3', type: 'merge', cx: 0.32, cy: -0.24, r: 0.045, color: C.merge },
      ] },
    // 13. 分裂 (紹介): 触ると3つに分かれてついてくる
    { bg: '#FFEEEC',
      player: { cx: 0, cy: 0.4, r: R },
      rings: [
        { cx: -0.26, cy: -0.36, r: SP, target: { type: 'piece' } },
        { cx: 0, cy: -0.36, r: SP, target: { type: 'piece' } },
        { cx: 0.26, cy: -0.36, r: SP, target: { type: 'piece' } },
      ],
      items: [{ id: 'big', type: 'split', cx: 0, cy: 0.08, r: 0.09, color: C.split }] },
    // 14. 分裂 + 壁の隙間
    { bg: '#FFE9E6',
      player: { cx: 0, cy: 0.42, r: R },
      rings: [
        { cx: -0.26, cy: -0.38, r: SP, target: { type: 'piece' } },
        { cx: 0, cy: -0.38, r: SP, target: { type: 'piece' } },
        { cx: 0.26, cy: -0.38, r: SP, target: { type: 'piece' } },
      ],
      items: [
        { type: 'gate', cy: -0.05, gap: 0.135, r: 0.24 },
        { id: 'big', type: 'split', cx: 0, cy: 0.22, r: 0.09, color: C.split },
      ] },
    // 15. 逃げる + 壁: 壁が追い込みを助ける
    { bg: '#FFF9DB',
      player: { cx: -0.2, cy: 0.3, r: R },
      rings: [{ x: 0.86, y: 0.14, r: 0.06, target: 'shy', corner: true }],
      items: [
        { id: 'w', type: 'wall', cx: -0.1, cy: -0.2, r: 0.16, color: C.wall },
        { id: 'shy', type: 'flee', cx: 0.2, cy: 0, r: 0.06, color: C.flee },
      ] },
    // 16. くっつく + 縮む + 壁: 張り付けたまま縮んで隙間を通る
    { bg: '#EFEBFF',
      player: { cx: 0.25, cy: 0.4, r: R, minScale: 0.5 },
      rings: [{ cx: 0, cy: -0.38, r: 0.06 * 0.5, target: 'st' }],
      items: [
        { type: 'gate', cy: -0.05, gap: 0.135, r: 0.24 },
        { id: 'st', type: 'sticky', cx: -0.28, cy: 0.36, r: 0.06, color: C.sticky, minScale: 0.5 },
        { id: 'cold', type: 'shrink', cx: 0, cy: 0.3, r: 0.05, color: C.cold },
      ] },
    // 17. 合体 + 押す + 輪 ×2
    { bg: '#DDF6F0',
      player: { cx: 0, cy: 0.42, r: R },
      rings: [
        { cx: -0.26, cy: -0.38, r: M2, target: { type: 'merge' } },
        { cx: 0.26, cy: -0.38, r: M2, target: { type: 'merge' } },
      ],
      items: [
        { id: 'm1', type: 'merge', cx: -0.3, cy: 0.12, r: 0.05, color: C.merge },
        { id: 'm2', type: 'merge', cx: -0.1, cy: 0.2, r: 0.05, color: C.merge },
        { id: 'm3', type: 'merge', cx: 0.1, cy: 0.2, r: 0.05, color: C.merge },
        { id: 'm4', type: 'merge', cx: 0.3, cy: 0.12, r: 0.05, color: C.merge },
      ] },
    // 18. フィナーレ: 分裂 + ついてくる + 壁 + 輪 ×4
    { bg: '#FFF1F6',
      player: { cx: 0, cy: 0.42, r: R },
      rings: [
        { cx: -0.3, cy: -0.38, r: SP, target: { type: 'piece' } },
        { cx: -0.1, cy: -0.4, r: SP, target: { type: 'piece' } },
        { cx: 0.1, cy: -0.4, r: SP, target: { type: 'piece' } },
        { cx: 0.32, cy: -0.36, r: 0.06, target: 'pal' },
      ],
      items: [
        { type: 'gate', cy: -0.05, gap: 0.135, r: 0.24 },
        { id: 'big', type: 'split', cx: -0.2, cy: 0.24, r: 0.09, color: C.split },
        { id: 'pal', type: 'follow', cx: 0.25, cy: 0.26, r: 0.06, color: C.follow },
      ] },
  ];
  window.COLORS = C;
})();
