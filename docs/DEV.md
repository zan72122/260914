# 開発・検証の手引き（M0 / M1 / M2 / M3 / M4 / M5）

『ほんとうの火』の局所再現・観測・再検証の使い方。設計の根拠は [PLAN.md](PLAN.md) §5。

## 0. 準備

```
npm install
```

Chromium は同梱済み（`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`）。`playwright install` は実行しない。

## 1. コマンド

| 目的 | コマンド | 備考 |
|---|---|---|
| 開発サーバ | `npm run dev` | http://127.0.0.1:5173 。`window.__fire` はここでのみ入る |
| 本番ビルド | `npm run build` | `tsc --noEmit` の後に `vite build`。出力は `dist/` |
| 単体検査 | `npm run test` | Vitest。規則・時計・色算出・本番ビルドの漏れ検査 |
| 操作・画面検査 | `npm run test:e2e` | Playwright。iPhone の viewport と実タッチ。dev サーバは自動起動 |
| 局所の再検査 | `npx vitest run tests/world.test.ts -t '銅を配線'` | 名前で一件だけ |
| 場面の再検査 | `npx playwright test -g 'copper_called'` | |
| 横画面だけ | `npx playwright test --project=ipad-landscape` | iPad の横 viewport |
| 縦画面だけ | `npx playwright test --project=iphone` | iPhone 13 の viewport |

失敗時の出力: 単体は差分と期待値、操作検査は色相・輝度の実測値をメッセージに含める。
スクリーンショットは `artifacts/`（git 管理外）に残る。

## 2. 開発用入口 `window.__fire`

開発サーバ（`/src/dev/devMain.ts`）でのみ読み込まれる。本番ビルドの `index.html` にはこの
script が入らないため、`dist/` には `__fire` の文字列すら残らない（`tests/prodBundle.test.ts` が検査）。

```js
__fire.loadScenario('copper_called')  // 通常の初期化経路で読み込む。必ず全破棄から始める。Promise<void>
__fire.ready()                        // 'loading' | 'ready' | 'busy'（busy は仕事が動いている間）
__fire.state()                        // 副作用なしの小さな JSON（下記）
__fire.log(n?)                        // 直近 n 件の出来事ログ（順序付き、既定 200 件のリング）
__fire.clock.mode('manual'|'real')    // 引数なしで現在の mode を返す
__fire.clock.step(16)                 // 本番と同じ update を 16ms 刻みで進める（刻みは飛ばさない）
__fire.clock.timeMs()
__fire.rng.seed(n)                    // 次の loadScenario から効く。既定はシナリオの seed
__fire.speech.captured()              // dev では実発話せず、発話予定テキストを記録する
__fire.dump('materials'|'jobs'|'flame'|'prism'|'layout'|'audio')
__fire.points()                       // 実ポインタを当てるための世界座標（状態の代入はできない）
__fire.flameRect()                    // 根元の外炎の領域（CSS px）。スクリーンショットの色判定に使う
```

`state()` の項目（PLAN §5.2）:

```
phase       'idle' | 'dragging' | 'delivering' | 'job_running'
held        { id, element, inFlame, afterglowMs } | null
flame       { element | null, intensityPct }
jobs        [{ id, element, status, calledAt }]
            status: 'waiting'|'called'|'job_running'|'done'|'cooldown'
            jobs は wiring(銅) / flare(ストロンチウム) / battery(リチウム) の 3 つ
materials   [{ id, element, at: 'bench'|'held'|'ring'|'site:<jobId>' }]
            'ring' は炎の中に張り出した金属の輪の上（置いたままにできる）
prism       { at: 'bench'|'held', projecting: element | null }
            projecting はプリズムが炎の前にあるときの炎の元素。素の炎なら null
input       { accepting, rejectReason? }
waitingFor  'job_animation' | 'next_trouble_timer' | null
```

`__fire` は観測と時間の制御だけを行う。状態の直接代入や仕事の直接実行はできない。
操作は必ず本来の入力経路（canvas への pointer / touch）を通す。

## 3. 名前付きシナリオ

| 名前 | 既定 seed | 開始状態 |
|---|---|---|
| `bench_idle` | 20250914 | 全材料が台、困りなし（循環を止める）、炎は青 |
| `copper_called` | 20250915 | 配線が切れて火花、作業員が「どう〜」を呼んだ直後 |
| `flare_called` | 20250916 | 沖の船が手を振り、桟橋の人が「ストロンチウム〜」を呼んだ直後 |
| `battery_called` | 20250917 | リモコンの電池室が空、机の人が「リチウム〜」を呼んだ直後 |
| `wrong_delivery` | 20250918 | `copper_called` と同じで、手にリチウムを持って配線の上にいる直前 |
| `two_reds_on_bench` | 20250919 | 困りなし。ストロンチウムとリチウムが台の中央に並ぶ（プリズム用） |

`wrong_delivery` はシナリオが材料の位置と保持状態だけを置く。届け判定そのものは
通常の入力経路（指を離す）を通るので、成功状態の代入で合格することはない。

**本番の開始状態**は `src/scenarios/scenarios.ts` の `PRODUCTION_SCENARIO`（= `copper_called`）で、
毎回ここから始まる。`?scenario=` / `?speak=` は `import.meta.env.DEV` の中でしか読まないため、
本番では利用者から検証用の入口を操作できない（`tests/prodBundle.test.ts` が検査）。

`loadScenario` は毎回、世界と絵と記録と時計を全破棄してから「通常の初期化 → 世界生成 →
指定状態へ進める」の順で作り直す。前回の残りは持ち越さない。
開発サーバでは `?scenario=bench_idle` で起動時のシナリオを選べ、`?speak=1` で実際に発話する。
本番ビルドではどちらも読まない。

## 3.1 困りの循環

常に 1〜2 箇所が困っている。仕事が終わって少し経つと（`DONE_HOLD_MS` = 3 秒）材料が木箱の
定位置に戻り、`cooldown` を経て別の場所が困る。次の困りまでの間隔は 25〜40 秒（seed で固定）で、
どこも困っていない状態になったときは待たずに次が起きる。困る順は seed で固定した並びを
後ろへ回していくので、同じ場所が続けて困ることはなく、3 種すべてが数分以内に一巡する。

## 4. 再現に影響する要素

| 要素 | 固定の仕方 |
|---|---|
| 初期状態 | シナリオ名 |
| 乱数 | シナリオ既定 seed（困りの間隔、火花の散り方）。`__fire.rng.seed(n)` で上書き |
| 入力列とタイミング | Playwright の実タッチ（CDP `Input.dispatchTouchEvent`）＋ `clock.step(16)` を挟む |
| 時間進行 | manual clock。`step(16)` を基本刻みとし、大きな値も 16ms に分割して全て通す |
| 保存データ | 無し |
| 描画ノイズ | GameClock 由来なので同一 |
| TTS | dev では記録のみ。実発話は再現対象外 |

ピクセル完全一致は要求しない。画面の判定は仕様に基づく許容差で行う。

炎の色は **色相と明度の 2 軸**で判定する。赤2種（緋と深紅）の色相差は実際には 3.5° しかなく、
色相だけでは分けられない。区別は明るさ（表示輝度比 約 2.4 倍）と主波長で付く。

| 元素 | hex | 色相の許容範囲 | 明度の許容範囲 | 実測（色相 / 明度） |
|---|---|---|---|---|
| 素の炎（ガス炎の青） | `#0053b3` | 198–240° | 0.50–0.95 | 211.8° / 0.688 |
| 銅（青緑） | `#00d0d3` | 160–196° | 0.60–1.00 | 181.7° / 0.824（横画面 181.1° / 0.824） |
| ストロンチウム（緋） | `#ac0026` | 330–360° | 0.56–0.82 | 343.8° / 0.663 |
| リチウム（深紅） | `#720020` | 330–360° | 0.30–0.55 | 338.2° / 0.439 |

実測は GLSL 炎（M1）を実際の WebGL2 で描いた値で、e2e が測る時点
（材料が炎に触れてから 224ms、uMix ≒ 0.99）のもの。残っているガス炎の青のぶんだけ
青側へ寄っている。入りきった後（uMix = 1）まで進めると算出値そのものになる。

| 元素 | 算出値（色相 / 明度） | uMix = 1 での実測 |
|---|---|---|
| 素の炎 | 212.2° / 0.700 | 212.0° / 0.670 |
| 銅 | 180.9° / 0.827 | 180.8° / 0.826 |
| ストロンチウム | 346.7° / 0.676 | 346.8° / 0.674 |
| リチウム | 343.1° / 0.446 | 343.2° / 0.447 |

hex は書き写しではない。`src/flame/color.ts` が発光線を CIE 1931 の等色関数で
積分し、色域マッピングと輝度正規化を通して算出した値を
`src/flame/elementColors.ts` がそのまま引き写す（`tests/elementColors.test.ts` が
算出結果・仕様書の hex・線形 sRGB の三者一致を見張る）。

許容範囲（`hue` と `value`）だけは算出物ではなく検査の仕様なので、
`src/flame/elementColors.ts` に一箇所だけ直接置く。
単体テストが「どの二つの領域も重ならない」ことを保証し、e2e もそこを読む。

炎の色は `__fire.flameRect()` が返す**根元の外炎**（層が重なって不透明になる所）で測る。

- 軸の真上は外す。そこには内炎（還元炎）の円錐があり、外炎とは別の発光をしている
  （C2 Swan 帯が強く、素のガス炎では外炎より緑寄りの青緑。実測で軸上 193°、外炎 212°）。
  仕様が「炎の色」と呼んでいるのは外炎の色。
- 揺らぎは上へ行くほど大きく、根元は口に固定されてほとんど動かない。
  だから根元は「重なって不透明」かつ「静か」な場所になる。
- 材料を持つ手は炎の半分の高さに来るので、材料の地の色も混ざらない。

| 仕事の結果の判定 | 仕様上の範囲 | 実測 |
|---|---|---|
| 銅: 作業灯の領域の平均輝度 | 仕事の後に 1.5 倍以上 | 0.1176 → 0.3568（3.03 倍） |
| ストロンチウム: 沖の赤成分 | 仕事の間に 1.5 倍以上、色相が赤 | 58.5 → 111.2（1.90 倍）, 346.3° |
| ストロンチウム: 救助船の光の領域の輝度 | 仕事の後に 1.5 倍以上 | 0.1898 → 0.6719（3.54 倍） |
| リチウム: リモコンのランプの輝度 | 仕事の後に 1.3 倍以上 | 0.1793 → 0.3538（1.97 倍） |
| リチウム: 受け口の山 → リモコンの山 | 受け口が先 | 6 番目 → 11 番目 |

## 5. 通し実証

`e2e/scene.ts` の `playDelivery` が、PLAN §5.6 と同じ構成を材料と受け口だけ替えて通す。
操作はすべて実タッチ（CDP の `Input.dispatchTouchEvent`）で、状態の直接代入はしない。

| 検査 | 内容 |
|---|---|
| `e2e/copper.spec.ts` | `copper_called`。§5.6 の 1〜6（再実行の一致まで） |
| `e2e/flare.spec.ts` | `flare_called`。信号炎 → 沖が赤く照らされる → 救助船の光が近づく |
| `e2e/battery.spec.ts` | `battery_called`。受け口 → 装置 → 電池が出る → リモコン → ランプの順 |
| `e2e/wrong_delivery.spec.ts` | 不一致では何も起きず、拾い直して正しく届けられる |
| `e2e/landscape.spec.ts` | 横画面（iPad の viewport）で `copper_called` を一本 |
| `e2e/prism.spec.ts` | `two_reds_on_bench`。輪に置く → プリズム → 縞で赤2種を見分ける |

`copper_called` の手順は以下（iPhone 13 の viewport 390×844）。

1. `loadScenario('copper_called')` → `ready()==='ready'`
2. `state()` の銅の仕事が `'called'`
3. 銅線を押さえて炎へ引きずる → `flame.element==='copper'`、炎領域が青緑
4. 指を離さず配線の隙間へ運んで離す → `'job_running'` → `clock.step` で `'done'`、作業灯が明るくなる
5. ログに 入力 → 炎入り → 炎出 → 届け → 成功 → 仕事完了 の順が残り、発話に「銅、ありがとう」
6. 同じ入力列で再実行し、状態・ログ・発話・色相が一致

## 6. 報告に書くこと

引き渡しのたびに、使用したコマンド・対象コミットのハッシュ・再現条件（シナリオ・seed・入力列）・
結果（合否と数値）・所要時間・未検証範囲を残す。

## 7. 境界

- 炎の描画: `src/flame/FlameRenderer.ts` の `FlameRenderer`（`view` / `layout` / `update` /
  `stats?` / `destroy`）。実装を選ぶのは `createFlameRenderer()` の一箇所で、いまは
  `GlslFlameRenderer`（M1 の物理ベース GLSL 炎）を返す。M0 の `PlaceholderFlameRenderer` も
  控えとして残っている。世界側は `FlameState`（element / intensityPct / timeMs）しか渡さない。
  時間は必ず GameClock 由来（`timeMs`）で、描画側は壁時計にも Ticker にも触らない。
- 元素 → 色: `src/flame/elementColors.ts`。参照側（描画・余熱発光・検査）はこれしか見ない。
  値の出どころは `src/flame/color.ts`（発光線 → CIE 1931 → 色域マッピング → 表示 sRGB）で、
  発光線は `src/flame/spectra.ts`。算出の手法と限界は `src/flame/README.md`。
- 余熱発光: `src/flame/afterglow.ts`。約 3 秒でちょうど 0 になる指数減衰（純関数）。
  `AFTERGLOW_MS` もここから導く。
- 縞: `src/flame/prism.ts`。発光線 → 波長軸上の帯（位置・幅・明るさ・色）。純関数。
  描画（`WorldView.updatePrism`）も検査（`e2e/prism.spec.ts`）もこのモジュールを通る。
- 仕事と困り: `src/game/world.ts` の `JOB_DEFS` / `dropAt` / `updateTroubles`。
  受け口の場所は `World.siteOf`、絵は `WorldView.updateWiring` / `updateFlare` / `updateBattery`。
- 画面の配置: `src/game/layout.ts` の `computeLayout` だけが座標を決める。
  奥の物の大きさは `layout.unit`（工房の短辺から決まるので縦横で同じ見え方）。

## 7.1 炎の描画（M1）

`src/flame/GlslFlameRenderer.ts` が `flame.frag.glsl` を PixiJS v8 の Filter として貼る。
シェーダは色を一切作らない。青いガス炎も内炎も元素色も煤の輝点も、すべて `color.ts` が
算出して uniform で渡す（`tests/flame/shader.test.ts` が、GLSL の中に色リテラルが
無いこと・時間源が `uTime` だけであることを見張る）。

- 層（外炎 / 内炎 / 煤の輝点 / 根元の散乱光）は、覆っている割合を重みにした**加重平均**で
  混ぜる。足し込むと重なった所で成分が 1 を超えて切り落とされ、色相が曲がる。
  明るさは alpha が持ち、芯で 1、縁でなめらかに消える。
- 最後に sRGB 伝達関数を掛け、alpha を先に掛けた形（premultiplied）で出す。
- 何も入っていなければ外炎は青、内炎は青緑。材料が入れば炎全体がその色になる（PLAN §3.3）。
  追従は指数（約 0.15 秒）で、飛び込む一瞬のにじみだけを残す。

性能（PLAN §7）: 炎は一箇所だけなので、横 48px を上限とする FBO に描いて拡大する。
iPhone 13（390×844, dpr 3）では炎の矩形が 60.9×110.7 CSS px で、FBO は **48×87**
（そのままなら 183×332、画素数で約 14 分の 1）。

```js
__fire.dump('flame')
// { element, intensityPct, rect, core, timeMs,
//   render: { mix, element, fboScale, fboWidth, fboHeight,
//             frameMs, frameMsSource: 'gpu'|'sync'|'cpu', cpuMs, gpuMs, syncMs } }
```

`frameMs` が 1 フレームの炎描画時間。`EXT_disjoint_timer_query_webgl2` があれば GPU の
実測（`gpu`）、無ければ 6 フレームに 1 度 `gl.finish()` まで待った実測（`sync`）、
それも無ければ描画命令を積む CPU 時間（`cpu`）を返す。`performance.now()` は 0.1ms 刻みに
丸められるので、いずれも窓で均してある。計測は絵にも状態にも影響しない。
**常設の表示は作らない。ここからしか読めない。**

実測（iPhone 13 viewport、Playwright の Chromium）: `frameMs` は **0.05〜0.10 ms**
（`sync`＝`gl.finish()` まで待った値）、描画命令を積む CPU 時間は 0.02〜0.03 ms。
ただしこの環境の WebGL は ANGLE 越しの SwiftShader（ソフトウェア）で、
`EXT_disjoint_timer_query_webgl2` を持たない。実機の GPU での時間は未計測。

## 7.2 金属の輪とプリズム（M3）

一本指なので、材料とプリズムを同時には持てない。縞を見るには、材料を炎に
差し入れたまま手を空ける道が要る。台の「材料をすくう金属の輪」（PLAN §3.1）を
炎の中へ張り出した形にして、置き場所にした。

| 規則 | 中身 |
|---|---|
| 置く | 輪の上で指を離すと `at: 'ring'`。置いてある間、炎はその元素の色を保つ |
| 色 | 余熱ではなく炎そのものの色。時間が経っても褪せない |
| 拾う | 輪から拾えば炎は素の青に戻る |
| 二つ目 | 輪に置けるのは 1 つ。塞がっていればバーナーの手前へ転がり落ちて拾い直せる |
| 優先 | 手に持って炎に入れている材料の色が、輪の材料より優先される |
| 影響しないもの | 届け先の判定、困りの循環、回転での置き直し |

炎の色は `World.recomputeFlame()` 一箇所が
「手に持って入れているもの → 輪のもの → 素の青」の順で決める。

プリズムを炎の前（`World.prismInFrontOfFlame()`）まで引きずると、
炎の後ろの壁（`layout.spectrumWall`）に縞が映る。映るのは**いまの炎の色**だけで、
余熱の色は映さない。離せば台に戻る。

```js
__fire.dump('prism')
// { at, pos, inFront, projecting, wall, ring, ringMaterial }
__fire.points().ring    // 金属の輪の位置（実タッチを当てるため）
```

### 縞の作り（`src/flame/prism.ts`、純関数）

波長も強度も `spectra.ts`、色は `color.ts` が算出する。この中に色リテラルは無い。

| 項目 | 決め方 |
|---|---|
| 位置 | `spectrumU(nm)` が 380–720nm を 0..1 に写す。描画も検査もこの一つを通る |
| 幅 | 分子バンド `MOLECULAR_WIDTH_NM` = 14nm、原子線 `ATOMIC_WIDTH_NM` = 6nm |
| 明るさ | 放射パワー × 視感効率 V(λ) を線形光として置き、sRGB 伝達関数を通す |
| 色 | その波長の単色光が sRGB で出せる最も明るい色（`color.ts`）× 明るさ |
| 可視域の外 | 映らない（Cu I 324.8 / 327.4nm の紫外線） |

幅について: 炎で光っているものの多くは原子線ではなく分子バンドで、本来 1 本の線ではなく
数 nm〜数十 nm の幅を持つ。`spectra.ts` はそれを代表波長に離散化しているので、ここで戻す。
原子線の 6nm は自然幅（1e-3nm 級）ではなく、分光器のスリットの像の幅にあたる。

明るさについて: 目の感度が低い波長の線は暗く映る。だから
Sr の 460.7nm（相対強度 0.03）は「弱いが確かに見える青の線」になり、
Li の 460.3nm（0.0005）は事実上見えない。実際の見え方の差がそのまま出ており、
見栄えで足したり引いたりはしていない。

### 縞の実測（iPhone 13 viewport、実描画）

プリズムを炎の前に置いた時と置いていない時の、壁の同じ場所の画素差で測る
（壁は一様ではないので、前後差だけが縞の証拠になる）。
帯が出るはずの位置は `spectra.ts` の発光線と `spectrumU()` から出し、描画側の値は読まない。

| 元素 | 青の線の Δ青（460nm 付近） | 赤の連続幅 | 赤の Δ赤の山 |
|---|---|---|---|
| ストロンチウム | **13.9**（仕様: 8 以上） | **29nm**（仕様: 14nm 以上＝帯） | 178.2 |
| リチウム | **0.0**（仕様: 3 以下＝無い） | **8nm**（仕様: 10nm 以下＝一本） | 170.1 |

（M5 で縁をやわらかくしたぶん、青の線の差と赤の山は下がり、帯の幅は 2nm 広がった。
仕様の範囲は変えていない。Li の一本が太らないことは `bandFalloff` の形が保証する。）

赤の連続幅は「Δ赤が山の 25% を超える波長が続く最大の幅」。
Sr は SrCl / SrOH の分子バンドが重なって帯になり、Li は 670.8nm の原子線一本だけになる。
色相では 3.5° しか違わない二つの赤が、縞では誰の目にも違う。

## 8. 音（M4）

音声ファイルは一つも持たない。環境音も物理音も `src/audio/` で Web Audio から合成する。

| 音 | いつ | 作り |
|---|---|---|
| `burner` | 起動から鳴り続ける | 雑音 → バンドパス。炎の強さで音量、入っている元素で中心周波数と Q が変わる |
| `waves` | 起動から鳴り続ける | 雑音 → ローパス。0.09Hz の寄せ波 |
| `material_enter` | `flame:enter` | 3600→700Hz へ落ちる雑音の一撃（ジュッ） |
| `sparks` | 銅の仕事が `called` の間 | 240ms ごとに高域の短い弾け（パチッ） |
| `current` | `deliver:success`(wiring) | 58→240Hz へ駆け上がる唸り＋灯が点くカチッ |
| `flare_launch` | `deliver:success`(flare) | 噴き上がる雑音 → 上空で開く低い音 |
| `battery_machine` | `deliver:success`(battery) | 52Hz の機械の唸り＋出てきた電池が当たる音 |

三つの仕事の音は、現象が違うので作りも違う（PLAN §3.4）。

- 反応する出来事は EventLog の kind そのもの（`src/core/EventTap.ts` が World の記録を音へ流す）。
- 時刻はすべて GameClock 由来。壁時計は使わない。
- **dev では実再生しない**。鳴らす予定の音の列を記録し、`__fire.dump('audio')` で読む。

```js
__fire.dump('audio')
// [{ t: 0, cue: 'burner', action: 'start' },
//  { t: 0, cue: 'waves', action: 'start' },
//  { t: 0, cue: 'sparks', action: 'start' },
//  { t: 112, cue: 'material_enter', action: 'play', data: { element: 'copper' } },
//  { t: 112, cue: 'burner', action: 'change', data: { element: 'copper' } }, ... ]
```

`action` は持続音の `start`/`stop`/`change` と、一度きりの `play`。

iOS の AudioContext は利用者の操作の中でしか動かないため、**最初のタッチ**で
`Speech.unlock()` と `GameAudio.unlock()` を同じ手で呼ぶ（`Game.attachInput` の `pointerdown`）。

### 名前の声

`src/audio/Speech.ts`。

- ja-JP の声を選ぶ（`ja-JP` 優先 → `ja` で始まる声 → 無ければ端末の既定）。
  声の一覧が遅れて届く端末では `voiceschanged` のあとに選び直す。
- 呼び声（`reason: 'call'`）は**待ち行列**。前の呼び声が終わってから次が鳴る。
- 礼（`reason: 'thanks'`）は**即時**。待ち行列を通さず今すぐ鳴らし、鳴っている呼び声を打ち切らない
  （`speechSynthesis.cancel()` は呼ばない）。
- 子ども向けに `rate = 0.85` / `pitch = 1.15`。
- 合成音声が無い端末では無音のまま成立する（名前は追加の情報であり、成立条件にしない）。

検査は `tests/audio.test.ts`（待ち行列・声選び・無音での成立）と
`e2e/rotate.spec.ts`（通しでの音の列）。

## 9. 回転・リサイズ（M4）

`resize` / `orientationchange` / `visualViewport` の変化を `src/core/viewportWatch.ts` が拾い、
`Game.handleResize` が `computeLayout` → `World.setLayout` → `WorldView.layout` を呼ぶ。
**世界は作り直さない**ので、持っている材料も余熱も進行中の仕事も失われない。
大きさが変わっていないときは何もしない。

iOS は回転の直後にはまだ新しい寸法を返さないので、`orientationchange` のあと
80 / 250 / 600ms でもう一度見て最後の寸法で落ち着かせる。

| 検査 | 内容 |
|---|---|
| `tests/rotate.test.ts` | 回転の前後で `stateView()` が一致。仕事の進行も材料の戻り先も続く |
| `e2e/rotate.spec.ts` | 実タッチで材料を持ったまま viewport を縦→横にしても `held` が残り、横画面の受け口で届けが成立する |

## 10. PWA と配信（M4）

`vite-plugin-pwa` でマニフェストと Service Worker を作る。`base` は `/260914/`。
手順とアイコンの作り直しは [DEPLOY.md](DEPLOY.md)。

| 物 | 場所 |
|---|---|
| マニフェスト | `vite.config.ts` の `VitePWA({ manifest })` → `dist/manifest.webmanifest` |
| アイコン | `public/icon.svg`（文字なしの炎）→ `node scripts/make-icons.mjs` で PNG を作り直す |
| Service Worker | workbox の生成。静的資産を全部プリキャッシュし、オフラインで起動する |
| iOS 向けの指定 | `index.html`（`apple-mobile-web-app-capable` / `viewport-fit=cover` / `user-scalable=no`、拡大・選択・はね返りを止める CSS と JS） |

検査は `e2e/pwa.spec.ts`。`vite build` → `vite preview` で `/260914/` の下に配り、
manifest と SW とアイコンが 200 で取れること、画面に押し物が出ないこと、
オフラインで起動することを見る。

本番の出力に `__fire` が入らないことは従来どおり `tests/prodBundle.test.ts` が
`dist/` の全ファイルを見て検査する（SW・manifest・アイコンも検査の対象のまま）。

## 11. 絵と光（M5）

遊び方・世界の規則・座標の意味・検査は M4 のまま。変えたのは**見え方だけ**で、
炎の色の出どころ（`elementColors.ts`）も縞の中身（`prism.ts` の純関数）も動かしていない。

### 11.1 層の分け方

| file | 役目 |
|---|---|
| `src/view/paint.ts` | 色を混ぜる・段差の無いグラデーション・やわらかい光の塗り |
| `src/view/light.ts` | 光の置き場（`LightPool`）。光の点の絵を一枚だけ持ち、使い回す |
| `src/view/people.ts` | 工房と港の人。顔は描かず、腕の角度だけで「呼ぶ／差し出す／済んだ」を見せる |
| `src/view/spectrum.ts` | 壁に落ちた縞の描き方（位置・幅・明るさは `prism.ts` のまま） |
| `src/view/WorldView.ts` | 世界の絵の組み立て（従来どおり、ここだけが配置を知る） |

### 11.2 光

炎・作業灯・火花・信号炎・救助船の光・電池工場・リモコンのランプは、
すべて `LightPool` に「置き場所・大きさ・色・強さ」を渡すだけで描かれる。
**炎の光の色は `flameColorOf(world.flameElement).hex`**（＝ `elementColors.ts` の算出値）なので、
炎に入れた材料が変われば、台・金属の輪・木箱・奥の壁に落ちる光の色も一緒に変わる。
色のリテラルは描画側に置かない。

光の点の絵（円形に薄れてゆく模様）は一枚だけ作って全部の光で共有する。
そのため光がいくつ増えても描画の回数は増えない（下の実測を参照）。

夕空・壁・台のグラデーションは、帯を何枚も重ねるのではなく
一枚の塗りに連続した色変化を持たせる（`verticalGradient`）。段差（バンディング）は出ない。

### 11.3 縞（プリズム）

`prism.ts` の `spectrumBands()` の出力（中心波長・幅・明るさ・色）は**変えていない**。
描画側に足したのは次の二つだけで、どちらも新しい純関数として `prism.ts` に置いた。

| 関数 | 中身 |
|---|---|
| `bandFalloff(Δnm, 幅nm)` | 帯の縁のにじみ。中心±幅/4 は平ら、幅×0.75 で 0。表示値に対する割合 |
| `bandSupportNm(幅nm)` | 帯が描かれる範囲（片側 幅×0.75） |

にじみを**表示値（sRGB を通した後）に対して**掛けるのは、線形光に掛けると
sRGB 伝達関数が暗い側を持ち上げ、原子線まで太く見えてしまうため。
この形なら山の 1/4 の明るさまでの全幅がほぼ「幅」そのもの（原子線 6nm → 約 7nm）になり、
「Li は一本、Sr は帯」という見分けは縁をぼかしても保たれる（下の実測）。

縞は 1 本の帯につき 1 枚のグラデーションで塗る（細片を並べると継ぎ目の線が出る）。
高さ方向は中心を共有する入れ子で重ねて、上下がやわらかく消えるようにする。
プリズムから壁へは、光の点を線上に並べた薄い道筋（分散の道筋）が伸びる。

### 11.4 描画の重さ

絵を厚くしても 1 フレームの描画の重さが増えないよう、次を守る。

- **光は形を作り直さない**。位置・大きさ・色・強さだけを毎フレーム変える。
- **縞は炎の元素と壁の大きさが変わったときだけ**描き直す。
- 作業灯の錐のような「形の変わらない光」は配置のときに一度だけ組む。
- 光は一つの層（加算）にまとめる。層を分けるほど描画の回数が増える。

実測（iPhone 13 viewport、Playwright の Chromium = ANGLE 越しの SwiftShader）:

| 版（`copper_called`） | 1 フレームの描画回数 | 三角形 | `gl.finish()` まで待った 1 フレーム |
|---|---|---|---|
| M4 | 5 | 1,455 | 0.57ms |
| M5 | 14 | 4,593 | 0.9〜1.6ms |

`__fire.dump('flame').render.frameMs`（炎だけの描画時間）は M4 と同じ 0.03〜0.08ms。

この環境（ソフトウェア描画）は数百フレームを連続で進めると、
描画の待ち行列が詰まって 1 フレームあたり 0.1 秒台に落ちる。これは M4 でも同じで、
落ちた後の値は M4 が約 125ms、M5 が約 158ms。実機の GPU での値は未計測。
