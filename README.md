# くずしてあそぼう — Art Of Gravity 風・4歳向けボクセル破壊パズル

空中に浮かぶブロックの塊に、足元のボールをパチンコで放ってぶつけ、全部くずして落とすゲームです。
文字・数字・ボタンは一切使いません（Wordless interaction）。iPhone / iPad の縦横どちらでも遊べます。

## 遊び方（iPhone / iPad）

1. `index.html` を iPhone / iPad に送る（AirDrop、Files アプリ、iCloud Drive など）。
2. Files アプリで `index.html` をタップして開く（Safari で開きます）。
3. 画面下のボールを指で引いて、離す。

ビルドやサーバーは不要です。`index.html` 1ファイルに全てが入っています。
Safari の「共有 → ホーム画面に追加」をすると全画面で遊べます。

- 音は端末の音量・マナーモードに従います。
- 進行（今のレベル）は端末に保存され、次に開いたときに続きから始まります。
- ボールが尽きると世界が巻き戻り、同じレベルをもう一度遊べます。失敗はありません。
- 2本指で画面をなでると、途中でも巻き戻せます。

## 開発

```
npm install
npm run build   # src/ → index.html（単一ファイル）
npm test        # ビルド + Playwright による自動検証（iPhone 縦/横, iPad 縦）
```

- `src/` … ゲーム本体（Three.js + cannon-es、ES modules）
- `build/build.mjs` … esbuild で1ファイルにバンドルし `src/template.html` にインライン
- `test/e2e.mjs` … 起動・文字が無いこと・発射・遷移の検証。`test/sweep.mjs` は全レベルをランダム射撃
- `docs/` … 企画・設計ドキュメント

生成物の `index.html` はリポジトリにコミットしています（ビルド環境無しで遊べるようにするため）。
