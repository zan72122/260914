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
- items #5 はタオルと同じ「引く→パチン」で暫定実装（#2〜#4 は Phase 2A で実装済み。下記参照）。
- シーツの画面いっぱいの翻りと「抱える」演出は未実装。

---

# QA 結果 — Phase 2A（items #2 / #3 / #4 の固有ジェスチャ）

自動化: `npx playwright test`（ポートは `GAME_PORT` で変更可、既定 8123）。25 件すべて通過。

| # | アイテム | 実装したジェスチャ | 解放条件 | 主なテスト | 結果 |
|---|---|---|---|---|---|
| 2 | ハンガー付きTシャツ | **持ち上げ → 弧**。指が上へ 18〜28 css px 動くとフックが竿から浮き（隙間を描画・カラン）、そこから室内方向へ動かすと外れる | 「フックが竿から外れたか」。距離だけでは絶対に外れない | `items.spec.js` 縦横 2 件 ＋ 否定 2 件（ただ引くだけでは外れず、伸びて・傾いて・チリンと鳴り、離すと戻る） | 通過 |
| 3 | 小物ピンチハンガー | **なぞる／連続タップ**。閾値ゼロ。指が触れたピンチ（半径 ≒ ピンチ間隔 ×1.2）が即座に外れ、小物が指を避けて跳ねてから室内へ落ちる。ピッチは 1 個ごとに上がる | 全 6 個が外れたら 0.42 秒後に枠が自動で室内へ（キャラが受け取る＝バスケット 1 層） | `items.spec.js` 縦横 2 件 ＋ 否定 3 件（触れたピンチだけが外れる／タップのみでも空になる／下をなぞっても外れない） | 通過 |
| 4 | 重いズボン | **押し込むように長く引いて保持**。腰が臨界減衰バネで指に遅れて付いてくる。閾値（タオルの約 2 倍）を超えた状態を 0.25 秒維持で 1 つ目、さらに 0.22 秒で 2 つ目 | 距離 **かつ** 時間。速さは一切効かない | `items.spec.js` 縦横 2 件 ＋ 否定 2 件（速いフリックは大きく揺れるだけ／短い距離を長く保持しても外れない） | 通過 |

- 5 種すべてが「見た目違いの同一ドラッグ」になっていないこと: 閾値の種類は 距離（#1・#5）／持ち上げ（#2）／接触（#3）／距離×時間（#4）。
- 追加音（`audio.js` に追記のみ）: `hangerClink`（カラン・弱／ヒント）、`fuwa`、`tap`（小物の着地）、`zushi`、`doson`。
- 濡れの濃色化・inDir への風・指遮蔽オフセット・64px 以上のヒット領域・逆方向では解放しない・解放後は自動で室内、は 3 種とも維持。

## 既知の未実装（Phase 2B で対応）
- シーツ #5 は暫定実装のまま（逐次解除・画面いっぱいの翻り・「抱える」演出）。
