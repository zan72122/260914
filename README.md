# Toy Train Set（おもちゃの電車セット）

Tracks – The Train Set Game 風の「木製電車セット」を、iPhone / iPad の Safari で遊べる静的 Web アプリにしたものです。
対象は 4 歳児。画面に**文字は一切ありません**（Wordless interaction）。

設計の詳細は [`docs/01.md`](docs/01.md) を参照してください。

## 遊び方（画面が教えてくれます）

- 光る輪が脈打っているレールの端から、指で地面をなぞる → レールが生える
- 電車をトン → 走る。もう一度トン → 止まる
- 電車を長押し → 運転席に乗り込む（赤いレバーで速度、左上の紐で汽笛、右上の小窓をトンで戻る）
- 下（横画面では右）のおもちゃ箱から木・家・動物・駅を引っ張り出して置く
- 置いた物やレールを長押しして持ち上げ、おもちゃ箱へ戻す
- レールを別のレールにまたがせると橋になる
- 駅を線路のそばに置くと乗客が現れ、電車が止まって乗り降りする

## 開発

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # 線路の幾何・接続・保存のユニットテスト
npm run build    # 型チェック + dist/ 生成
```

補助スクリプト（開発用、配布物には含まれません）:

```sh
node scripts/screenshot.mjs   # iPhone 縦 / iPad 横で一連の操作を再現してスクリーンショットを撮る（SHOT_DIR で出力先指定）
node scripts/icons.mjs        # public/icons/icon.svg から PWA 用 PNG を生成
```

## 配布（GitHub Pages）

[`docs/github-pages-workflow.yml`](docs/github-pages-workflow.yml) を `.github/workflows/pages.yml` にコピーして push すると、`main` への push のたびにビルドして GitHub Pages に配信します
（この session の GitHub App には workflow ファイルを作成する権限がないため、コピーは手作業でお願いします）。
リポジトリの Settings → Pages で Source を **GitHub Actions** にしてください。
iPhone / iPad では Safari の共有メニューから「ホーム画面に追加」するとフルスクリーンで遊べます。

## 構成

| ディレクトリ | 内容 |
| --- | --- |
| `src/track/` | 指の軌跡 → スプライン → レール（幾何・グラフ・メッシュ）、橋 |
| `src/train/` | 木製機関車と客車、線路追従、行き止まりでの折り返し |
| `src/props/` | 飾り（木・家・動物・駅）、乗客、おもちゃ箱と運転席の HUD |
| `src/camera/` | 自動フレーミングの俯瞰カメラと運転席カメラの遷移 |
| `src/input/` | ポインタ入力 → なぞる / トン / 長押し / ドラッグ |
| `src/audio/` | Web Audio による効果音の合成（音声ファイルなし） |
| `src/save/` | localStorage への自動保存 |
