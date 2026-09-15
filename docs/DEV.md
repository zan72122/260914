# 開発・検証の手引き（M0）

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
__fire.dump('materials'|'jobs'|'flame')
__fire.points()                       // 実ポインタを当てるための世界座標（状態の代入はできない）
__fire.flameRect()                    // 炎領域（CSS px）。スクリーンショットの色判定に使う
```

`state()` の項目（PLAN §5.2）:

```
phase       'idle' | 'dragging' | 'delivering' | 'job_running'
held        { id, element, inFlame, afterglowMs } | null
flame       { element | null, intensityPct }
jobs        [{ id, element, status, calledAt }]
            status: 'waiting'|'called'|'job_running'|'done'|'cooldown'
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
| `bench_idle` | 20250914 | 全材料が台、困りなし、炎は青 |
| `copper_called` | 20250915 | 配線が切れて火花、作業員が「どう〜」を呼んだ直後 |

`loadScenario` は毎回、世界と絵と記録と時計を全破棄してから「通常の初期化 → 世界生成 →
指定状態へ進める」の順で作り直す。前回の残りは持ち越さない。
起動時のシナリオは `?scenario=bench_idle` でも選べる。`?speak=1` で dev でも実際に発話する。

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

| 判定 | 仕様上の範囲 | 実測（`npm run test:e2e`） |
|---|---|---|
| 材料を入れていない炎の色相 | 200–250°（ガス炎の青） | 225.3° |
| 銅を入れた炎の色相 | 150–200°（青緑） | 168.1° |
| 作業灯の領域の平均輝度 | 仕事の後に 1.5 倍以上 | 0.1292 → 0.2104（1.63 倍） |

色相の許容範囲は `src/flame/elementColors.ts` の `hue` に一箇所だけ置く。
検査もそこを読むので、色を変えるときはその一箇所を直す。

## 5. `copper_called` の通し（PLAN §5.6）

`e2e/copper_called.spec.ts` が以下を、iPhone 13 の viewport（390×844）と実タッチで通す。

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
- 元素 → 色: `src/flame/elementColors.ts`。M1 で発光線から CIE 1931 → sRGB で算出した値に
  差し替えるが、参照側（描画・余熱発光・検査）は変えない。
- 仕事と困り: `src/game/world.ts` の `JobState` / `dropAt`。M2 で桟橋と電池工場を足す。
