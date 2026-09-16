// layout.js
// ビューポートから「絵の構図」を決める。
// 縦横で単なる拡大縮小ではなく、別のカメラ位置（寄り／引き）にする。
//
// 指のオクルージョン対策:
//   摩擦点（火が生まれる場所）は常に画面の上寄り、
//   指が置かれる弓のハンドル列は常にその下。煙と火種は上の空きスペースへ昇る。

export function computeLayout(w, h) {
  const portrait = h >= w;
  return portrait ? portraitLayout(w, h) : landscapeLayout(w, h);
}

function base(w, h) {
  // 細部（線の太さなど）用のスケール。極端な端末でも破綻しないようにクランプ。
  const s = Math.min(Math.max(Math.min(w, h) / 420, 0.72), 2.1);
  return { w, h, s };
}

function portraitLayout(w, h) {
  const L = base(w, h);
  L.mode = 'portrait';
  const s = L.s;

  // 地面（板が置かれているライン）
  L.groundY = h * 0.50;

  // 火きり板：横長の厚い板。摩擦点は板の上面。
  L.board = {
    x: w * 0.06,
    y: h * 0.455,
    w: w * 0.88,
    h: 42 * s,
    r: 16 * s,
  };
  // 摩擦点（くぼみ）＝ 木粉・煙・火種が生まれる場所。画面の上半分。
  L.friction = { x: w * 0.54, y: L.board.y + 6 * s };

  // 火きり棒：摩擦点から上へ伸びる
  L.spindle = {
    x: L.friction.x,
    topY: L.friction.y - Math.min(h * 0.30, 300 * s),
    baseY: L.friction.y,
    r: 13 * s,
  };

  // 弓：下1/3。ハンドルは「つかんで横にすべらせる」形。
  L.bow = {
    cx: w * 0.50,
    cy: h * 0.755,
    length: Math.min(w * 0.78, 520 * s),
    travel: Math.min(w * 0.20, 150 * s),
    // 持ち手は弓の端ではなく少し内側。端まで動かしても画面の外に出ない。
    handleAt: 0.55,
    handleR: 30 * s,
  };

  // 火口（ほくち）：最初から見えている。板の左はしの上。
  // 弦（弓→きり棒）の通り道より上にあるので、弓をどこまで動かしても線が火口を横切らない。
  L.nest = { x: w * 0.19, y: L.board.y - 24 * s, r: 48 * s };
  // 弦がきり棒に巻きつく高さ（板の上のふち）
  L.stringY = L.board.y - 20 * s;
  L.stringAnchor = 0.92;   // 弦は弓の端よりすこし内側から

  // 大人：右上から顔と手が入ってくる（寄りの構図なので部分的）
  L.character = {
    mode: 'closeup',
    head: { x: w * 0.87, y: h * 0.085, r: 62 * s },
    // 息を吹くときに火口の「すぐ上」へ寄る（火口を隠さない位置）
    // 顔が炎や火口にかぶらない高さで止める
    leanTo: { x: L.nest.x + 40 * s, y: L.nest.y - 150 * s },
    flameLean: 0.55,        // 炎が上がったあと、体を起こして見守る位置（下で幾何から決めなおす）
    scale: s,
    // 火きり棒の頭を押さえる手
    holdHand: { x: L.spindle.x, y: L.spindle.topY - 4 * s },
  };
  L.character.flameLean = safeFlameLean(L);
  return L;
}

function landscapeLayout(w, h) {
  const L = base(w, h);
  L.mode = 'landscape';
  const s = L.s;

  L.groundY = h * 0.60;

  L.board = {
    x: w * 0.30,
    y: h * 0.555,
    w: w * 0.46,
    h: 36 * s,
    r: 14 * s,
  };
  L.friction = { x: w * 0.47, y: L.board.y + 5 * s };

  L.spindle = {
    x: L.friction.x,
    topY: L.friction.y - Math.min(h * 0.34, 260 * s),
    baseY: L.friction.y,
    r: 11 * s,
  };

  L.bow = {
    cx: w * 0.52,
    cy: h * 0.845,
    length: Math.min(w * 0.46, 480 * s),
    travel: Math.min(w * 0.13, 130 * s),
    handleAt: 0.55,
    handleR: 26 * s,
  };
  L.stringY = L.board.y - 18 * s;
  L.stringAnchor = 0.92;

  // 大人：左側に全身（ひざまずき）。引きの構図なので頭は小さめ。
  const headR = 50 * s;
  const hip = { x: w * 0.13, y: h * 0.70 };

  // 火口は板の左はしの上。体（ひざ）にも弓にも重ならず、
  // 弓からきり棒へのびる弦の通り道より上にあるので線が横切らない。
  const nestR = 36 * s;
  L.nest = { x: L.board.x + nestR + 12 * s, y: L.board.y - 22 * s, r: nestR };

  L.character = {
    mode: 'full',
    head: { x: w * 0.165, y: h * 0.235, r: headR },
    // 火口の真上ではなく、すこし手前上。顔が火口をかくさない。
    leanTo: { x: L.nest.x + 16 * s, y: L.nest.y - (headR + nestR * 0.66 + 46 * s) },
    flameLean: 0.55,
    scale: s,
    holdHand: { x: L.spindle.x, y: L.spindle.topY - 2 * s },
    hip,
  };
  L.character.flameLean = safeFlameLean(L);
  return L;
}

// 炎が上がったあとの「見守る姿勢」。
// 顔の円が炎の本体に少しでもかぶらない範囲で、いちばん火のそばに寄れる値を選ぶ。
// （炎の高さは火口の大きさ基準なので、どの画面サイズでも成り立つように計算で決める）
function safeFlameLean(L) {
  const c = L.character, n = L.nest;
  const H = n.r * 2.78;                // ゆれて一番のびたときの炎の高さ
  const W = n.r * 1.05 * 1.05;
  const by = n.y - n.r * 0.15;
  const x0 = n.x - W, x1 = n.x + W, y0 = by - H, y1 = by;
  const margin = 10 * L.s;
  let best = 0.12;
  for (let t = 0.12; t <= 0.6001; t += 0.02) {
    const hx = c.head.x + (c.leanTo.x - c.head.x) * t;
    const hy = c.head.y + (c.leanTo.y - c.head.y) * t;
    const cx = Math.max(x0, Math.min(hx, x1));
    const cy = Math.max(y0, Math.min(hy, y1));
    if (Math.hypot(hx - cx, hy - cy) - c.head.r >= margin) best = t;
  }
  return best;
}
