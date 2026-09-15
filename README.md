# 炎色反応ゲーム

4歳児向けのブラウザゲーム（iPhone / iPad の Safari、縦横両対応）。
リチウム・銅・ナトリウム・ストロンチウム・バリウムの5つの炎の色と、その色が作る5つの世界を、
**文字ゼロ・説明ゼロ**で体験します。仕様は [`DESIGN.md`](./DESIGN.md) を参照。

ビルド不要の素の HTML / CSS / ES modules です。npm の依存はテスト用（devDependencies）だけ。

## ローカルで遊ぶ

```bash
npm install          # 初回のみ（テスト用の依存）
npm start            # http://localhost:8080 を開く
```

`npm start` は `http-server . -p 8080 -c-1`（キャッシュ無効）を起動します。
`index.html` を静的配信するだけなので、他の静的サーバでも動きます。

## テスト（Playwright）

iPhone15 縦/横・iPad 縦/横の4構成で、タッチ操作を CDP で合成して実行します。

```bash
npm test             # 全スイート
npm run test:self    # ハーネス自体の自己診断（ゲーム未実装でも実行可）
npm run test:smoke   # 起動・レイアウト・文字ゼロの検証（常時実行可）
npm run test:play    # 通しプレイ + 分光器（各ワールド実装後）
npm run test:shots   # スクリーンショット採取 → tests/__screens__/（git 管理外）
```

特定の構成だけ実行する場合:

```bash
npx playwright test --config=tests/playwright.config.mjs --project=iPhone15-portrait
```

ブラウザは環境に導入済みのものを使います（`playwright install` は実行しないでください）。

## GitHub Pages への配置

ワークフロー雛形を `docs/pages-workflow.yml` に置いています（この環境の GitHub App には
workflows 権限がないため `.github/workflows/` へ直接置けませんでした）。
`docs/pages-workflow.yml` を `.github/workflows/pages.yml` へコピーして `main` に push し、
**Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定してください。
ビルド工程はなく、リポジトリ直下がそのまま配置されます。

## ディレクトリ

```
index.html / styles.css   エントリ
src/core/                 エンジン（描画・入力・音・カメラ 等）
src/scenes/               炉（ハブ）・分光器
src/worlds/               5元素のワールド
tests/                    Playwright の QA ハーネス
```
