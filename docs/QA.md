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
