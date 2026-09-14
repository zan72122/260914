# おりがみの みち

紙でできた世界を折りたたんで道をつなぎ、女の子ハナをおばあちゃんの家まで連れていく、
文字のないパズルゲームです。iPhone / iPad の Safari（縦・横どちらでも）で遊べます。

- 企画・設計: [docs/01.md](docs/01.md)
- 依存ライブラリなし。`index.html` を開くだけで動きます。

## 遊び方（文字で説明しないのがこのゲームの流儀です）

- 行きたい場所をタップすると、ハナが歩きます。
- 紙の端をつまんで引っぱると、紙が折れて裏の道が現れます。
- 半分を越えて離すとパタンと折れ、手前で離すと戻ります。
- おばあちゃんのところに着くと、ページがめくれて次の面へ。
- 積まれた紙をタップすると、前の面に戻れます。

## 開発

```sh
npx http-server . -p 8123      # ローカルで起動 → http://localhost:8123/
node test/levels.test.mjs      # 全面が意図した折り順で解けることを検証
node tools/functional.mjs      # headless Chromium で折り・歩行・ページめくりを検証
node tools/shoot.mjs shots     # 画面を撮って目視確認
```

`tools/*.mjs` はこの環境にグローバル導入された Playwright を直接参照しています。
別環境では `npm i -D playwright` の上で import 先を `'playwright'` に変えてください。

## 公開

[docs/pages-workflow.yml](docs/pages-workflow.yml) を `.github/workflows/pages.yml` にコピーして push すると、
`main` への push ごとに GitHub Actions が GitHub Pages に配信します
（リポジトリ設定の Pages で Source を「GitHub Actions」にしてください）。
ビルド不要なので、Pages の Source を「Deploy from a branch」にして `main` を選ぶだけでも動きます。
iPhone / iPad では Safari の共有メニューから「ホーム画面に追加」するとフルスクリーンで遊べます。
