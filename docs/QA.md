# QA 結果 — Phase 1（基盤）

自動化: `npx playwright test`（Chromium `/opt/pw-browsers/chromium`、`python3 -m http.server 8123`）。

| # | 仕様 §10 の項目 | テスト | 結果 |
|---|---|---|---|
| 1 | 開始 3〜8 秒で FIRST_DROP → SPOT → WIND | `smoke.spec.js` "weather reaches WIND within ~8 seconds" | 通過（実測 6.8〜7.2 s） |
| 1 | 屋内方向へ 1 ストロークすると必ず何かが起きる | `play.spec.js` 全 5 種の取り込み | 通過 |
| 1 | 逆方向ドラッグでは解放されない | `play.spec.js` "a sideways drag stretches the cloth but never releases it" | 通過 |
| 2 | iPhone 390×844 / iPad 1180×820 で全 5 種＋サッシ | `play.spec.js` × 2 viewport | 通過 |
| 3 | ドラッグ中の回転で状態が壊れない | `smoke.spec.js` "rotating mid-drag…" | 通過 |
| 4 | `visibilitychange` 復帰で雨が跳ばない | `smoke.spec.js` | 通過（復帰前後の intensity 差 < 0.25） |
| 5 | DOM テキスト 0 / `fillText` 未使用 | `smoke.spec.js` × 2（`fillText`/`strokeText` を throw に差し替え） | 通過 |
| 6 | 音が無い状態でも進行可能 | `audio.js` 全経路 try/catch。Chromium は自動再生ポリシーで suspended のまま進行 | 通過 |

スクリーンショット: `tests/screenshots/{portrait,landscape}-{1-calm,2-first-drop,3-wind,4-mid-rain,5-empty-line,6-after}.png`

## 既知の未実装（Phase 2 で対応）
- items #2〜#5 はタオルと同じ「引く→パチン」で暫定実装。仕様表の固有ジェスチャ（弧・なぞり・押し込み・逐次解除）は未実装。
- シーツの画面いっぱいの翻りと「抱える」演出は未実装。

---

# QA 結果 — Phase 2B（巨大シーツ／看板）

自動化: `npx playwright test`（Chromium `/opt/pw-browsers/chromium`、`python3 -m http.server 8123`）。全 15 テスト通過。

| # | 仕様 §4 行5 / §11 の項目 | テスト | 結果 |
|---|---|---|---|
| 1 | ばさみ ×4（両端＋中間2）が大きく目立つ | `sheet.spec.js`（`clipPts` 経由で 1 つずつ狙う）| 通過 |
| 2 | 拘束を **一つずつ**、順序自由に外せる | `sheet.spec.js` × 2 viewport（毎ストロークで `clips` が 1 減） | 通過 |
| 3 | 外れるごとに風を受けて大きく膨らむ | 同上（3 個解放時点で重心が inDir 方向へ移動、縦 86%×65% / 横 69%×65% を占有） | 通過 |
| 4 | 最後の一つで HANGING→RELEASING→CARRYING→IN_BASKET | `sheet.spec.js`（ページ内 rAF で状態列を記録し完全一致を検証） | 通過 |
| 5 | バスケットが増える（大きな山） | `sheet.spec.js` `basket` +1、`basketScale 1.85` | 通過 |
| 6 | 逆方向ドラッグでは絶対に外れない | `sheet.spec.js` "pulled the wrong way" | 通過 |
| 7 | `fillText`/`strokeText` 不使用・DOM テキスト 0・console error 0 | `sheet.spec.js`（両 viewport で text API を throw に差し替え） | 通過 |
| 8 | 既存 5 種＋サッシの通し（スロット幅変更後） | `play.spec.js` / `smoke.spec.js` / `screenshots.spec.js` | 通過 |

性能（Chromium, iPhone portrait, ペグ 3 個解放後の最悪ケース、600 回平均）:
`Sheet.update` 0.015 ms/frame、`Sheet.draw` 0.27 ms/frame。合計 0.29 ms は目標の 2 ms に対し十分な余裕。
毎フレームの新規確保はゼロ（Float32Array の height field / freeW / clip スナップショットは全て事前確保）。

スクリーンショット:
`tests/screenshots/{portrait,landscape}-sheet-{1clip,2clips,3clips,release,hug}.png`

## 描画順の判断（シーツがサッシ枠より前に出る理由）
`Item.overlay` が真のアイテムは `sash.drawFrame` の **後** に描かれる（`main.js`）。シーツは
**ばさみが 2 個以上外れた時点から解放完了まで** これを真にする。理由: その状態のシーツは
開いた窓を通って室内側へ実際に膨らみ出しており、「ガラスの向こう」ではなく
「カメラと窓の間」にある。1 個だけ外れた段階ではまだベランダの物なので枠の後ろのまま。
他の 4 種は `overlay` を持たないので従来通りの描画順。

## Phase 2B で未着手のまま残るもの
- items #2〜#4（シャツ・ピンチ・ズボン）は依然としてタオル型の「引く→パチン」。仕様表の固有ジェスチャは Phase 2A/2C の担当。
