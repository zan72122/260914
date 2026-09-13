// レベルデータ。ブロック: {x,y,z,t}  t: N=ふつう I=てつ G=ガラス C=くも
// balls: W=しろ I=てつ B=ばくはつ（左から順に足元に並ぶ。先頭が最初のボール）
// 座標は塊のローカル。y=0 が塊の最下段。塊は world の y=BASE_Y に置かれる。
export const BASE_Y = 4;

function box(out, x0, y0, z0, w, h, d, t = 'N') {
  for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + h; y++) for (let z = z0; z < z0 + d; z++) out.push({ x, y, z, t });
}
function put(out, x, y, z, t = 'N') { out.push({ x, y, z, t }); }

export const LEVELS = [
  // 1: 投げる・崩れる — 低い壁。どこに当てても崩れる。
  { hue: 0.58, balls: 'WWWWW', build(b) { box(b, -2, 0, 0, 5, 3, 1); } },
  // 2: 狙う — 細い柱の上に板。柱を抜けば全部落ちる。
  { hue: 0.10, balls: 'WWWW', build(b) { box(b, 0, 0, 0, 1, 3, 1); box(b, -2, 3, -1, 5, 1, 2); box(b, -1, 4, 0, 3, 1, 1); } },
  // 3: 連鎖 — ガラスの支柱。少し触るだけで崩れる。
  { hue: 0.80, balls: 'WWW', build(b) { box(b, -2, 0, 0, 1, 3, 1, 'G'); box(b, 2, 0, 0, 1, 3, 1, 'G'); box(b, -2, 3, -1, 5, 2, 2); put(b, 0, 5, 0); } },
  // 4: 弾かれる — 中央に鉄。しろは弾かれ、てつボールで砕ける。
  { hue: 0.35, balls: 'WWIW', build(b) { box(b, -2, 0, 0, 5, 1, 1); put(b, -2, 1, 0); put(b, 2, 1, 0); put(b, 0, 1, 0, 'I'); box(b, -1, 2, 0, 3, 1, 1); put(b, 0, 3, 0); } },
  // 5: てつボールを選ぶ — 鉄の列がふつうの塔を支える。
  { hue: 0.02, balls: 'WIWIW', build(b) { box(b, -1, 0, 0, 3, 1, 1, 'I'); box(b, -1, 1, 0, 3, 3, 1); box(b, -2, 2, 0, 1, 2, 1); box(b, 2, 2, 0, 1, 2, 1); } },
  // 6: 爆発 — ぎゅっと密な塊。
  { hue: 0.92, balls: 'WBBW', build(b) { box(b, -2, 0, -1, 4, 4, 2); } },
  // 7: くも — くもが塊を支えている。くもを撃つと全部落ちる。
  { hue: 0.48, balls: 'WWW', build(b) { put(b, 0, 0, 0, 'C'); box(b, -1, 1, 0, 3, 1, 1); box(b, -3, 2, 0, 7, 1, 1); box(b, -1, 3, 0, 3, 2, 1); put(b, 0, 5, 0); } },
  // 8: 組み合わせ — 鉄の殻の中にガラス。
  { hue: 0.68, balls: 'WIBIW', build(b) { box(b, -2, 0, 0, 5, 1, 1, 'I'); put(b, -2, 1, 0, 'I'); put(b, 2, 1, 0, 'I'); put(b, -2, 2, 0, 'I'); put(b, 2, 2, 0, 'I'); box(b, -2, 3, 0, 5, 1, 1, 'I'); box(b, -1, 1, 0, 3, 2, 1, 'G'); box(b, -1, 4, 0, 3, 1, 1); } },
  // 9: 大崩落 — 高い塔を2つのくもが支える。
  { hue: 0.16, balls: 'WWIBW', build(b) { put(b, -2, 0, 0, 'C'); put(b, 2, 0, 0, 'C'); box(b, -2, 1, 0, 5, 1, 1); box(b, -1, 2, 0, 3, 5, 1); put(b, 0, 4, 0, 'I'); box(b, -3, 3, 0, 1, 2, 1, 'G'); box(b, 3, 3, 0, 1, 2, 1, 'G'); } },
  // 10: ごちそう — すべて登場。
  { hue: 0.75, balls: 'WWBIWBIW', build(b) {
    put(b, 0, 0, 0, 'C'); box(b, -3, 1, -1, 7, 1, 3); box(b, -3, 2, -1, 1, 3, 3, 'G'); box(b, 3, 2, -1, 1, 3, 3, 'G');
    box(b, -2, 2, -1, 5, 2, 3); box(b, -1, 4, 0, 3, 1, 1, 'I'); box(b, -2, 5, -1, 5, 1, 3); box(b, -1, 6, 0, 3, 2, 1); put(b, 0, 8, 0, 'I'); } },
];

export function buildLevel(i) {
  const L = LEVELS[i % LEVELS.length];
  const blocks = [];
  L.build(blocks);
  return { hue: L.hue, balls: L.balls.split(''), blocks };
}
