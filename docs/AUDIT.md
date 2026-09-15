# UX 監査レポート — パカッ！とろとろオムライス

対象: 4歳女児 / 一本指 / 文字なし / iPhone・iPad Safari
方法: `src/` のコード読解 ＋ Playwright(Chromium, 390×844) による実操作計測
再実行: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx playwright test tests/audit.spec.js`
（テスト本体 `tests/audit.spec.js`。結果は `[AUDIT] …` として標準出力に出る）

監査日: 2026-09-15 / 監査時点の `src/` に対する結果（別エージェントが並行編集中のため、行番号は目安）

---

## 1. 結果サマリ

| # | 項目 | 判定 | 根拠（実測値） |
|---|---|---|---|
| 1 | RICE_KETCHUP: 皿の上を長押しだけ | **詰まった** | 3秒完全静止の長押しで `ketchup=0.000 / strokes=0`。指を1pxずつ震わせても3秒で `0.128`（必要量 2.6 の 5%）。完了には約60秒の微動が必要 |
| 1' | 皿の外で長押し | 通った | ケチャップは出ず（`m>1.45` で無視）、ボトルは指へ寄り、離すと定位置へ復帰（1.2秒後に誤差 0px / toolR=35.9） |
| 2 | RICE_MIX: 皿半径の20%幅の短い往復 | **通った** | 14ストロークで `cover 0→0.805` → 自動的に EGG_POUR。吸着（`m>0.94` を山の上へ寄せる）が効いている |
| 2' | 皿の外を擦る | 要改善 | 10往復しても `cover=0`。音も動きも一切返らない（完全な無反応） |
| 3 | EGG_POUR: フライパン直タップ | 通った | 1タップで `spread=1`。実際は画面のどこを1タップしても注がれる（`pointerDown` の else 分岐） |
| 4 | EGG_GATHER: 雑な円運動 | 通った | 接線方向の円運動 5周（自動操作で約2.8秒）で `gather 0.48→0.78→1.0` |
| 4' | 外向きスワイプだけ | **詰まった** | 中央→外を12回で `gather=0.172`（ほぼ丸め誤差ぶん）。外向きは `inward<=0` で完全に捨てられるので、永久に進まない |
| 5 | EGG_SLIDE: 長押しだけ | 通った | フライパン上を押しっぱなしで 1.5秒で `panProg=1.0` → CUT へ |
| 5' | 逆方向ドラッグ | 通った（無害） | `panProg=0` のまま。マイナスにはならない |
| 5'' | 皿を直接タップ／長押し | **要改善** | 1.5秒長押しで `panProg=0`。ゴール（皿）を触っても何も起きず、反応もない |
| 5''' | オムレツをドラッグ | 通った/**要改善** | 半分ドラッグで `panProg=0.7` まで行くが、指を離すと 0.9秒後に `0`（`updSlide` の `-dt*1.1` 減衰）。断続的な操作では永久に溜まらない |
| 6 | CUT: 表示された稜線どおりに縦なぞり | **詰まった** | `cut=0` のまま。稜線の見た目の長さ 71px に対し、判定は「軌跡の最大長 ≥ rx*1.1 = 95px」。**誘っている線をそのままなぞると切れない** |
| 6' | 小さなタップ連打10回 | **詰まった** | `cut=0`。軌跡長が足りずどれだけ叩いても切れない |
| 6'' | 稜線から大きく外れた横なぞり | 通った | オムレツの 1.6ry 上を横切る線で `cut=1`（判定楕円が rx*1.5 × ry*1.9 と広いため） |
| 7 | DRAW: 皿の外に描く | 通った | 皿外は `rr>0.97` で縁へ吸着され、線は残る（1ストローク/9点） |
| 7' | 皿→ボタンへ引き下ろして離す | 通った | ボタンの上で離しても発火しない（`pressed` は pointerdown でしか立たない） |
| 7'' | **ボタンの上から描き始める** | **要改善（破壊的）** | 指を皿まで運んで離しても `again` が発火し、**ゲーム全体がリセット**（state=RICE_KETCHUP、描いた線 2→0）。移動によるキャンセルが無い |
| 8 | 2本指 | 通った | `input.js` が `st.id` で1本目以外を完全無視。割り込み中もケチャップ量は不変（0.26→0.26）、割り込み後も1本目は有効 |
| 9 | 回転（RICE_MIX 途中） | 通った | `cover 0.801 → 0.801` |
| 9' | 回転（DRAW 途中） | 通った | 描いた点数 13 → 13。回転後もボタン3個は画面内 |
| 10 | アトラクト（次に触る物） | 一部要改善 | 下表参照。CUT にアトラクトが無く、DRAW は2か所が同時に光る |
| 11 | iOS Safari 対応 | おおむね良好 | 下記参照。`gesturestart` が canvas 限定なのが唯一の穴 |
| 12 | パフォーマンス | 問題なし（余地あり） | 1フレームの update+render 中央値 0.6–0.7ms / p95 1.1–1.3ms（Chromium デスクトップ）。1024×1366 でも 0.7ms。`getImageData` / `shadowBlur` は皆無 |

---

## 2. アトラクト（誘い）実装の一覧 — `src/render/scene.js`

| ステート | 光っている物 | 実装 | 評価 |
|---|---|---|---|
| RICE_KETCHUP | ボトルのみ | `attractGlow(bottle)` (scene.js:82-84、掴むと消える) | 「ボトルを持つ」は伝わるが「皿の上をなぞる」は伝わらない。長押しでは進まないので致命的（#1） |
| RICE_MIX | ヘラのみ | `attractGlow(spatula)` (73) ＋ 皿の横で上下に揺れる待機モーション (`updMix`) | 良い。皿の方へ揺れるので方向も出ている |
| EGG_POUR | ボウルのみ | `attractGlow(bowl)` (76) ＋ ボウルが左右に傾く | 行き先（フライパン）は光らないが、実際はどこを触っても注がれるので実害なし |
| EGG_GATHER | フライパンの中 | `gatherHint()` (119-133) 同心円が外→中心へ縮む波 | 方向まで伝わる最良の例 |
| EGG_SLIDE | フライパン中心 | `attractGlow(pan)` (27-29) | 「触る場所」は出るが「皿の方へ倒す」方向が出ていない。長押しでも進むので実害は小 |
| CUT | **なし**（オムレツ上の稜線のみ） | `drawRidge()` (egg.js) 白い縦線が明滅 | **アトラクト無し。しかもこの線の長さ(71px)では切れない**（#6） |
| OPEN | — | 自動 | — |
| DRAW | 皿 **と** ボタン3個（同時） | 皿の放射グラデ (scene.js:103-115、線が0本のときだけ) ＋ `drawButton(..., glow=0.45)` | 光が2か所に分散。しかも光っている側（ボタン）を押すと全部消える |
| DONE_MENU | ボタン3個（glow=1.0） | `drawButton(..., 1)` | 1本目の線を離した瞬間に DRAW→DONE_MENU に移るため、まだ絵を描いている最中にボタンが最大光量になる |

---

## 3. iOS Safari 固有の確認（#11）

| 項目 | 実装 | 判定 |
|---|---|---|
| `touch-action` | `html, body, #stage` すべて `none`（style.css:9,21） | OK。ダブルタップズーム・スクロールとも封じられる |
| `-webkit-touch-callout` | `none`（13,24） | OK（長押しメニュー抑止）。`contextmenu` も preventDefault（input.js:46） |
| `user-select` | `-webkit-user-select/user-select: none`（11-12,22-23） | OK |
| `overscroll-behavior` | `none`（10）＋ `body { position: fixed; inset: 0 }`（16）＋ `document.touchmove` を preventDefault（main.js:44） | OK。ラバーバンドは起きない |
| ダブルタップズーム | `touch-action:none` ＋ `dblclick` preventDefault（input.js:47） | OK |
| ピンチズーム | `user-scalable=no`（iOS は無視）＋ `gesturestart` preventDefault が **canvas 限定**（input.js:48） | △ 実害は小（canvas が画面全面）だが、`document` 側で `gesturestart/gesturechange/gestureend` を止めるのが安全 |
| `100dvh` / visualViewport | `height:100%; height:100dvh`（style.css:5-6）＋ `visualViewport` の resize/scroll と `orientationchange` を購読、さらに毎フレームと pointerdown 時に `resize()`（main.js:38-52,65） | OK。Safari のツールバー伸縮に強い。座標系だけ作り直し、皿の中身は正規化保持なので内容が消えない（#9 で実証） |
| `viewport-fit=cover` / セーフエリア | meta にあり。下端の道具は `h*0.885`、半径 `unit*0.092` → 844px 端末で下端 782px（ホームインジケータ 810px より上） | OK |
| DPR | `Math.min(2, dpr)`（main.js:25） | OK（iPhone の dpr=3 でも 2 で頭打ち） |
| 音の解錠 | `pointerDown` 先頭で `unlock()`（state.js:485） | OK（ユーザージェスチャ内で AudioContext 生成） |

---

## 4. 改善提案（優先度順）

### P0-1. ケチャップが「長押しでは出ない」 — `src/state.js`
**問題**: `squirt()` は `pointerMove` からしか呼ばれない。`pointerDown`（case `S.KETCHUP`）は `grab` を立てるだけで一滴も出さない。しかも `scene.js:85` の `drawSquirtStream` は `bottle.flow`（＝皿に近くて掴んでいる）だけで描かれるので、**静止長押し中は「ケチャップが出ている絵」が出続けるのに量が増えない**という嘘のフィードバックになる。「押せば出る」と考える4歳児はここで確実に止まる。
**修正**:
1. `pointerDown` の `case S.KETCHUP` の最後に、ノズル位置（`pointerMove` と同じ `y + L.toolR*1.7` 補正）で `squirt(G, L, nx, ny)` を1回呼ぶ。
2. `updKetchup(G, L, dt)` に時間ベースの加算を足す:
   ```js
   if (b.grab && G.hold.active && b.flow > 0.5) {
     G.ketchup.amount += dt * 0.8;              // 約3.2秒の長押しで満タン
     if (Math.floor(G.time*6) !== Math.floor((G.time-dt)*6)) squirt(G, L, G.hold.x, G.hold.y + L.toolR*1.7);
   }
   ```
   （`squirt()` 内の `k.amount += 0.008`（イベント駆動）は 60fps でも 0.48/秒しか溜まらず、実測で3秒0.128。時間駆動に置き換えるのが本筋）
3. 逆に、量が増えていないときは流れを描かない（`drawSquirtStream` の条件に「実際に加算中か」を足す）。

### P0-2. CUT: 誘っている線をなぞると切れない — `src/state.js` `tryCut()` / `src/render/egg.js` `drawRidge()`
**問題**: 実測で オムレツ `rx=86.6 / ry=45.5`。`drawRidge` は縦に `±0.78ry` ＝ 71px の線を明滅させるが、`tryCut` の合格条件は `far >= o.rx * 1.1 = 95px`。**見えている誘い線を端から端まで正確になぞっても不合格**。タップ連打も当然不合格。CUT だけ `attractGlow` も無い。
**修正**:
1. `tryCut()` の長さ条件を軸に依存しない形へ:
   ```js
   const need = Math.min(o.rx * 1.1, o.ry * 1.45);   // 縦なぞりでも届く（45.5*1.45≒66 < 71）
   if (near && far >= need) { ... }
   ```
2. 連打の救済: `G.cutTrail` に依存しない別経路として、`pointerDown` の `case S.CUT` でオムレツ内タップを数え、1.5秒以内に3回で `G.omelet.cut = 0.01` とする（`G.omelet.taps`, `G.omelet.tapT` を `createGame`/`resetGame` に追加）。
3. `updCut()` に「詰まりタイマー」: `G.st > 6` なら `scene.js` 側で稜線に沿って光点が端から端へ走るアニメ（指の動きの見本）を出す。`scene.js` の `render()` に `if (G.state === S.CUT && G.omelet.cut === 0) attractGlow(ctx, o.x, o.y, o.rx*0.9, t)` を足すだけでも「ここを触る」が伝わる。
4. `drawRidge` の線を、判定が有利な長軸方向（横）にも見えるようにする／もしくは判定を稜線（縦）優先に寄せる。**見た目と判定の向きを一致させる**のが目的。

### P0-3. DRAW: ボタンの上から描き始めると全消し — `src/state.js` `pointerMove` / `pointerUp`
**問題**: `pointerDown` で `G.pressed` が立つと、そのポインタは離すまで何をしても `pressButton()` に行く（`pointerMove` は `if (G.pressed) return;`）。実測で「ボタン上から描き始めて皿の上で離す」→ `again` 発火 → 描いた線2本ごとゲームが最初から。ボタン判定は `r*1.35`（半径30.4 → 41.1px）と大きく、DRAW 中は半透明(0.45)で光っているので4歳児は触る。
**修正**（3つとも入れるのが望ましい）:
1. `pointerMove` の先頭を
   ```js
   if (G.pressed) {
     const b = L.buttons.find((q) => q.id === G.pressed);
     if (b && Math.hypot(p.x - b.x, p.y - b.y) > b.r * 1.6) { G.pressed = null; G.draw.cur = null; drawPoint(G, L, p.x, p.y); }
     return;
   }
   ```
   にして、ボタンから指が離れたらキャンセル＋描画へ引き継ぐ。
2. `pointerUp` で `hitButton(L, G.hold.x, G.hold.y)` が同じボタンのときだけ `pressButton()` を実行する（離した位置での再判定）。
3. `again` / `variant` は作品を全消しする破壊的操作なので、`hitButton` の甘さ `b.r * 1.35` を DRAW 中だけ `1.05` に落とすか、`G.hold.t > 0.3` の長押しを条件にする。

### P1-4. EGG_SLIDE: 手を離すと進捗が消える — `src/state.js` `updSlide()`
`if (!G.hold.active && G.pan.prog < 1) G.pan.prog = Math.max(0, G.pan.prog - dt * 1.1);` により、実測 0.7 → 0.9秒で 0。4歳児のドラッグは何度も途切れるので、毎回ふりだしに戻る。
**修正**: 到達した最大値の8割を下限として残す。
```js
G.pan.floor = Math.max(G.pan.floor || 0, G.pan.prog * 0.8);
if (!G.hold.active && G.pan.prog < 1) G.pan.prog = Math.max(G.pan.floor, G.pan.prog - dt * 0.35);
```
（`G.pan.floor` を `createGame` / `resetGame` で 0 に初期化）

### P1-5. EGG_SLIDE: ゴール（皿）を触っても無反応 — `src/state.js` `updSlide()`
長押し判定が `Math.hypot(G.hold.x - F.cx, G.hold.y - F.cy) < F.r * 1.6` とフライパン周辺限定。皿を1.5秒押しても `panProg=0`。
**修正**: 皿の側も受け付ける（「行き先を指さす」も正解にする）。
```js
const nearPan   = Math.hypot(G.hold.x - F.cx, G.hold.y - F.cy) < F.r * 1.6;
const nearPlate = Math.hypot(G.hold.x - P.cx, G.hold.y - P.cy) < P.r * 1.2;
if ((nearPan || nearPlate) && G.hold.t > 0.35) G.pan.prog = clamp(G.pan.prog + dt * 0.9, 0, 1);
```
あわせて `scene.js:27-29` の `attractGlow(pan)` に加えて、フライパン→皿へ流れる矢印状の光（`gatherHint` と同じ手法で楕円を皿方向へ流す）を出すと方向が伝わる。

### P1-6. EGG_GATHER: 外向きスワイプが完全に無視される — `src/state.js` `gatherSwipe()`
`if (inward <= 0) return;` のため、外向きばかりだと永久に 0.17 程度で頭打ち（実測）。
**修正**: 符号に関わらず「フライパンの中で指が動いた量」を少し加算する。
```js
const gain = inward > 0 ? inward : Math.abs(inward) * 0.25;
G.egg.gather = clamp(G.egg.gather + gain / (F.r * 1.8), 0, 1);
```
さらに保険として、`updGather` に「フライパン内で合計6秒触っていたら自動で寄る」タイマーを入れる。

### P1-7. 「外した」ときの無反応 — `src/state.js` `rub()` / `squirt()`
皿の外を10往復しても `cover=0`、音も見た目の変化もゼロ（実測）。当たり判定の外にいることが子どもに伝わらない。
**修正**: `rub()` の `if (Math.hypot(p.u,p.v) > 1.25) return;` の直前に「外れカウンタ」を持ち、一定時間外し続けたら皿（またはご飯の山）に `attractGlow` を出す。音は出さず、光だけで「こっち」を示すのが文字なし設計に合う。

### P2-8. DRAW の誘いが2か所に分散 — `src/render/scene.js`
DRAW 中は皿の放射グラデ（103-115）とボタン3個（92、glow=0.45）が同時に明滅する。しかも「押すと全部消えるボタン」の方が個数で勝っている。
**修正**: 1本目の線を引くまでは `drawButton(..., glow=0)`（もしくはボタン自体を描かない）にして、光るのは皿だけにする。現在は「1本描いて指を離した瞬間に DRAW→DONE_MENU」（`pointerUp`）でボタンが glow=1.0 になるので、線が1本以上あるときだけボタンを主張させれば整合する。

### P2-9. パフォーマンス（コード上の指摘） — `src/render/plate.js` ほか
実測では問題なし（update+render 中央値 0.6–0.7ms、1024×1366 でも同等、`getImageData` / `shadowBlur` / `ctx.filter` によるぼかしは不使用、テーブル木目とご飯は焼き込み済み）。ただし iOS の実機は3〜5倍のコストになるため、余裕を作るなら以下の順に効く。
1. **`drawPlateDish()`（plate.js:207-280）が毎フレーム実行される**: `createLinearGradient` 2本 + `createRadialGradient` 2本 + 縁の点28個の `ellipse` を毎フレーム作り直している。皿は `variant` と `L` が変わらない限り不変なので、`table.js` と同じ方式でオフスクリーンに焼き、`invalidateTable()` と同様の無効化フックを `main.js` の `resize()` と `applyVariant()` から呼ぶ。**単独で最大の削減**。
2. `attractGlow()`（fx.js:155-166）は毎フレーム `createRadialGradient`。半径が `r` 固定なので、`(x,y,r,color)` をキーにグラデーションをキャッシュして `translate` で使い回せる。
3. `drawOmelet` / `drawPan` の各グラデーション（egg.js 6,83,93,142,156,292,306,314,324,333 / pan.js 39,50,74,122,165,193）も毎フレーム生成。寸法が変わるのは傾き中だけなので、`tilt`/`open` が動いていないフレームはキャッシュを再利用できる。
4. `drawTable` は全画面 `drawImage`（DPR 2 の iPad で 2048×2732）。これは避けにくいが、`ctx.clearRect` の直後に不透明で全画面を塗るので `clearRect` は省略可能（`getContext('2d', {alpha:false})` なので `clearRect` は無駄）。

---

## 5. 触ってよい・触ってはいけない挙動の確認（回帰の観点）

- 2本指（#8）と画面回転（#9）は現状で堅い。`input.js` の `st.id` による単一ポインタ化と、皿ローカル正規化座標での保持という設計がそのまま効いている。**この2つを壊さないこと**が今後の改修の前提。
- POUR は「画面のどこを1タップしても注がれる」（実測 #3b）。極端に甘いが、この工程で詰まる子は出ない。意図どおりなら維持でよい。

---

## 6. 対応状況（v5 実装）

`docs/AUDIT.md` の P0 / P1 / P2 と、パフォーマンス提案 ①、iOS の `gesture*` を実装した。
再現テストは `tests/audit.spec.js` を「詰まりを検出する assert 付き」に作り直し、`npm test`（play / frames / audit 計 21 本）が全緑。

| # | 項目 | 対応 | 実装場所 | 再現テストの assert |
|---|---|---|---|---|
| P0-1 | ケチャップが長押しで出ない | `updKetchup` に時間駆動の加算（`need/3.0` 毎秒＝約3秒で満タン）。`pointerDown` でも一滴出る。0.17秒ごとに皿へ点を残す（`squirt(..., quiet=true)`）。**実際に加算したフレームだけ `ketchup.emit` を更新し、`drawSquirtStream` はその 0.18 秒以内かつ未満タンのときだけ描く**（嘘の流れを出さない） | `src/state.js` `updKetchup`/`squirt`/`ketchupFull`、`src/render/scene.js` | 1: 3.5秒の静止長押しで `ketchup>=1` かつ線が残り `RICE_MIX` へ / 満タン後 `flowing=false`。1': ドラッグ経路も従来どおり |
| P0-2 | CUT: 誘い線どおりでは切れない | 判定長を `min(rx*1.1, ry*1.45)`（実測 66px ≦ 稜線 71px）に。稜線の形は `RIDGE` として `egg.js` から export し、判定・見た目・アトラクトで共有。**3タップ救済**（1.5秒以内に3回オムレツ内タップ）。**CUT 用アトラクト**＝オムレツの呼吸グロー＋稜線を端から端へ走る光点 `runnerLight()` | `src/state.js` `tryCut`/`pointerDown(S.CUT)`、`src/render/egg.js` `RIDGE`、`src/render/fx.js` `runnerLight`、`scene.js` `cutHint` | 6: `need <= ry*1.56` と、稜線どおりの縦なぞりで `cut=1`。6': 3タップで `cut>0` |
| P0-3 | DRAW: ボタン上から描き始めると全消し | ① `pointerMove` でボタンから `r*1.6` 離れたら押下をキャンセルし、その場から描画へ引き継ぐ ② `pointerUp` は「**同じボタンの上で離した**」ときだけ発火 ③ まだ一筆も描いていない DRAW 中は判定半径を `r*1.05` に絞る（`buttonSlack`） | `src/state.js` `pointerMove`/`pointerUp`/`hitButton`/`buttonSlack` | 7: ボタン→皿で離しても state は DRAW/DONE_MENU のまま線が増える / 皿→ボタンで離しても発火しない / 同じボタン上で離したときだけ発火 |
| P1-4 | SLIDE の進捗が消える | 到達最大値の 8 割を `pan.floor` として残し、減衰を `dt*1.1 → dt*0.35` に | `src/state.js` `updSlide` | 5b: 離して1.4秒後も `panProg >= peak*0.8` |
| P1-5 | SLIDE でゴール（皿）が無反応 | 皿の `r*1.2` 以内の長押し／ドラッグでも傾く。フライパン→皿へ流れる光 `slideHint()` で方向を出す | `src/state.js` `updSlide`、`scene.js` `slideHint` | 5c: 皿を1.2秒長押しで `panProg` が 0.3 以上増える |
| P1-6 | GATHER: 外向きスワイプが無視される | 外向きも `|inward|*0.25` で加算。フライパン内を合計6秒さわったら自動で寄る保険タイマー（`egg.touchT`） | `src/state.js` `gatherSwipe`/`updGather` | 4: 外向きスワイプだけで 30 回以内に完了。4': 静止長押しだけでも完了 |
| P1-7 | 外したときの無反応 | `G.miss`（0〜1.2、毎秒 0.45 で減衰）を導入。皿の外の `squirt`/`rub`、フライパン外のスワイプ、オムレツから外れた CUT 操作、的外れな長押しで加算し、`attractGlow(..., boost)` で**触るべき物の光を強める**（音は出さない＝文字なし設計に合わせる） | `src/state.js` 各所、`src/render/fx.js` `attractGlow`、`scene.js` `boostOf` | 2a / 1'a / 6'a: 外し続けたあと `miss > 0.3〜0.5` |
| P2-8 | DRAW の誘いが2か所に分散 | 一筆も描いていない間はボタンの glow を 0 に（皿だけが光る）。線が1本でもあれば従来どおり | `src/render/scene.js` | 7（視覚）＋ `screenshots/iphone-portrait-09-DRAW.png` |
| 提案① | `drawPlateDish` が毎フレーム | 皿をオフスクリーンへ焼き込み（`dishCache`、キーは 皿の座標・半径・variant・DPR）。`invalidatePlate()` を `main.js` の `resize()` と `applyVariant()` から呼ぶ。現在の transform から DPR を読んで等倍で焼くのでボケない | `src/render/plate.js` `drawPlateDish`/`bakeDish`/`paintDish`、`main.js`、`state.js` | 12: 1024×1366 でも p95 < 4ms（実測 0.9ms） |
| iOS | `gesturestart` が canvas 限定 | `document` 側でも `gesturestart / gesturechange / gestureend` を preventDefault。canvas 側も3種に拡張 | `src/main.js`、`src/input.js` | — |

### 残っている既知の割り切り
- EGG_POUR は「画面のどこを1タップしても注がれる」まま（§5 の方針どおり意図的に維持）。
- 提案② `attractGlow` のグラデーションキャッシュ、③ `drawOmelet`/`drawPan` のグラデーション再利用、④ `clearRect` 省略は未実施（実測 p95 が 1ms 前後で余裕があるため、皿の焼き込みだけで打ち止めにした）。
