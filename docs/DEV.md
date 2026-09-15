# 開発・検証の手引き（M0 / M2）

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
__fire.dump('materials'|'jobs'|'flame'|'layout')
__fire.points()                       // 実ポインタを当てるための世界座標（状態の代入はできない）
__fire.flameRect()                    // 炎の芯の領域（CSS px）。スクリーンショットの色判定に使う
```

`state()` の項目（PLAN §5.2）:

```
phase       'idle' | 'dragging' | 'delivering' | 'job_running'
held        { id, element, inFlame, afterglowMs } | null
flame       { element | null, intensityPct }
jobs        [{ id, element, status, calledAt }]
            status: 'waiting'|'called'|'job_running'|'done'|'cooldown'
            jobs は wiring(銅) / flare(ストロンチウム) / battery(リチウム) の 3 つ
materials   [{ id, element, at: 'bench'|'held'|'site:<jobId>' }]
prism       { at: 'bench'|'held', projecting: element | null }   // projecting は M3 で入る
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
| `two_reds_on_bench` | 20250919 | 困りなし。ストロンチウムとリチウムが台の中央に並ぶ（M3 用） |

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
| 素の炎（ガス炎の青） | `#0053b3` | 198–240° | 0.50–0.95 | 212.2° / 0.702 |
| 銅（青緑） | `#00d0d3` | 160–196° | 0.60–1.00 | 180.9° / 0.825 |
| ストロンチウム（緋） | `#ac0026` | 330–360° | 0.56–0.82 | 346.7° / 0.673 |
| リチウム（深紅） | `#720020` | 330–360° | 0.30–0.55 | 343.1° / 0.448 |

許容範囲は `src/flame/elementColors.ts` の `hue` と `value` に一箇所だけ置く。
単体テストが「どの二つの領域も重ならない」ことを保証し、e2e もそこを読むので、
M1 が本物の算出値を入れるときもこの一箇所を直せばよい。

炎の色は `__fire.flameRect()` が返す**炎の芯**（層が重なって不透明になる根元）で測る。
材料を持つ手より下なので、材料の地の色が混ざらない。

| 仕事の結果の判定 | 仕様上の範囲 | 実測 |
|---|---|---|
| 銅: 作業灯の領域の平均輝度 | 仕事の後に 1.5 倍以上 | 0.1450 → 0.3565（2.46 倍） |
| ストロンチウム: 沖の赤成分 | 仕事の間に 1.5 倍以上、色相が赤 | 55.1 → 107.2（1.95 倍）, 346.1° |
| ストロンチウム: 救助船の光の領域の輝度 | 仕事の後に 1.5 倍以上 | 0.1995 → 0.5085（2.55 倍） |
| リチウム: リモコンのランプの輝度 | 仕事の後に 1.3 倍以上 | 0.2000 → 0.4106（2.05 倍） |
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

## 7. M1 以降のための境界

- 炎の描画: `src/flame/FlameRenderer.ts` の `FlameRenderer`（`view` / `layout` / `update` / `destroy`）。
  実装を選ぶのは `createFlameRenderer()` の一箇所。世界側は `FlameState`（element / intensityPct /
  timeMs）しか渡さない。時間は必ず GameClock 由来。
- 元素 → 色: `src/flame/elementColors.ts`。M1 が発光線から CIE 1931 → sRGB で算出した hex を
  既に入れてある。参照側（描画・余熱発光・検査）はこのモジュールしか見ない。
  M1 統合時は `createFlameRenderer()` の戻り値を GLSL 実装に替えるだけでよい
  （`FlameRenderer` / `FlameState` / `createFlameRenderer` は M2 で変更していない）。
- 仕事と困り: `src/game/world.ts` の `JOB_DEFS` / `dropAt` / `updateTroubles`。
  受け口の場所は `World.siteOf`、絵は `WorldView.updateWiring` / `updateFlare` / `updateBattery`。
- 画面の配置: `src/game/layout.ts` の `computeLayout` だけが座標を決める。
  奥の物の大きさは `layout.unit`（工房の短辺から決まるので縦横で同じ見え方）。
