# 日常の小さな事件集

4歳児向けの、**文字なし・一本指だけ**で遊べるWebゲームです。
iPhone / iPad の portrait / landscape 両対応。Canvas 2D による手続き描画のみで、
外部の画像・音声アセットはひとつも使っていません（音は WebAudio の合成音）。

1話は20〜60秒。「何かが起こる → 見るだけで因果が分かる → このままだと何が起きるか
予測できる → 自然に手を出したくなる → 一本指で介入する → 世界が即座に応答する →
少し可笑しい結末」という流れを共通の骨格にしています。

Game Over はありません。失敗は「見て面白い別の結末」になります。

---

## 遊び方 / 動かし方

```bash
npm i
npm run dev        # http://localhost:5173
```

その他のスクリプト:

```bash
npm run build      # tsc --noEmit && vite build  -> dist/
npm run preview    # dist/ をローカル配信 (port 4173)
npm run typecheck
npm run shots      # スクリーンショット掃き出し (後述)
```

## iPhone / iPad で試す

**(A) LAN の dev サーバー**

```bash
npm run dev -- --host          # 表示された http://192.168.x.x:5173 を端末で開く
```

PC と iPhone を同じ Wi-Fi に繋いだ状態で、表示される Network の URL を Safari で開きます。

**(B) GitHub Pages**

ワークフローの雛形を `docs/github-pages-workflow.yml` に置いてあります。これを
`.github/workflows/pages.yml` にコピーして `main` に push すると、Node 22 でビルドした `dist/` を
GitHub Pages に配信します（`vite.config.ts` の `base: './'` 前提）。
（自動化セッションには workflow ファイルを push する権限がないため、コピーは手動で行ってください。）
リポジトリの Settings → Pages → Source を **GitHub Actions** にしておいてください。

iOS 向けに以下を入れてあります: ダブルタップ拡大・ピンチ・長押しメニュー・テキスト選択の抑止、
`overscroll-behavior: none`、`viewport-fit=cover` + セーフエリア対応、`visualViewport` の
リサイズ追従、最初の `pointerdown` / `touchend` と復帰時 (`visibilitychange`) での
AudioContext の resume、`apple-mobile-web-app-capable` / theme-color /
favicon (data URI の SVG) と apple-touch-icon (`public/apple-touch-icon.svg`)。
ホーム画面に追加するとフルスクリーンで遊べます。

---

## Dev Mode

通常のプレイヤーには見えません。開くには:

- URL に `?dev=1` を付ける（`?dev=0` や `?dev` では開きません）
- または画面の**左上を1.6秒以内に5回タップ**する

パネルでできること（開発者向けなので文字OK）:

| セクション | 内容 |
|---|---|
| episode | ハブ / 各エピソードへ直接ジャンプ |
| phase | `establish` `action` `foreshadow` `trouble` `intervene` `resolve` `comic` `settle` の任意フェーズから開始 |
| actions | エピソードが公開する `devActions`（雨を降らす等のイベント、`fail:*` の失敗結末、`demo:*` のポーズ） |
| time | 0.25x / 1x / 3x、pause、1フレーム step |
| viewport / seed | portrait / landscape の強制切替（擬似ビューポートをレターボックス表示）、seed 固定して再現、restart、mute |
| state | phase / timers / 主要な内部状態 / seed をライブ表示 |

### `window.__game` API

パネルと同じことをコンソールや自動化から叩けます（`src/core/dev.ts` の `GameApi`）:

```js
__game.episodes()            // [{id, title}, ...]
__game.phases()              // フェーズ名一覧
__game.gotoEpisode('laundry')// null でハブへ
__game.gotoPhase('trouble')
__game.actions('laundry')    // devAction 名の一覧
__game.runAction('fail:soaked')
__game.getState()            // mode / episode / phase / seed / viewport / エピソード固有の状態
__game.setOrientation('portrait' | 'landscape' | null)
__game.setSeed(20240914)
__game.restart()
__game.setTimeScale(0.25) ; __game.setPaused(true) ; __game.step(1)
__game.setMuted(true)
__game.settle(2.5)           // 実時間を待たずに n 秒ぶんシミュレーションを進める
```

## スクリーンショット掃き出し

Playwright で「全エピソード × portrait/landscape × 全フェーズ + 各 `fail:*` / `demo:*`」を
一括撮影します。

```bash
npm run build && node scripts/shots.mjs            # 全部 -> shots/all/
npm run build && node scripts/shots.mjs laundry    # 1話だけ -> shots/laundry/
```

複数人（複数エージェント）が同じチェックアウトで並行に走らせる場合は、ビルド先を分けます:

```bash
npx vite build --outDir dist-foo && node scripts/shots.mjs laundry --out dist-foo
```

preview のポートは実行ごとにランダム、消えるのは `shots/<id>/` だけです。

## エピソード

| # | id | 話 |
|---|---|---|
| 1 | `laundry` | 洗濯物 — 干した服に雨。室内へ運び込めるか |
| 2 | `bedcat` | ベッドと猫 — 整えたシーツに猫が飛び込む |
| 3 | `leaves` | 落ち葉 — 集めた山を風がさらう |
| 4 | `sandcastle` | 砂の城と波 — 波打ち際が近づいてくる |
| 5 | `hatwind` | 帽子と風 — 飛ばされた帽子を追いかける |
| 6 | `snowman` | 雪だるまと日差し — 日が差して溶け始める |

ハブでの並び順はこの順です（`Episode.order`、なければ `src/core/hub.ts` の順序表）。
エピソードは `src/episodes/*.ts` を `import.meta.glob` で自動登録するので、
ファイルを置けばハブに出ます。

## 設計の考えかた

- **ゲーム世界そのものがUI**。矢印・点滅リング・指アイコン・進捗ゲージ・「成功!」は使わない。文字も読ませない。
- **一本指だけ**。タイミング精度も速度も要求しない。掴んだものが指に吸い付く感触を優先。
- **向きごとに構図を作り直す**。単純な拡大縮小ではなく、危険源・主役・安全地帯の配置を portrait / landscape で組み替える。
- **物性を動きで見せる**。濡れた布は重く垂れ、砂は崩れ、雪は溶ける。フラットな知育記号にしない。
- **Game Over なし**。失敗はもう一度見たくなる別の結末。

詳しくは [docs/DESIGN.md](docs/DESIGN.md) を参照してください（フェーズ構造、入力、レイアウト、
Dev Mode の要件、各話の台本、最終品質基準）。
