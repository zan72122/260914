# もこもこ (mokomoko)

Mushroom 11 風の、文字なしタッチゲーム。iPhone / iPad の Safari 向け。

- 指でなでた所の細胞が消え、反対側から生えて動く。
- ゴールの光る花に触れると次のステージへ。
- 落ちても直前の地面にふわっと戻る。

## 開発

ビルド不要。静的ファイルを配信するだけで動く。

```
python3 -m http.server 8000
# → http://localhost:8000/
```

- `src/blob.js` 細胞粒子の物理・削り/再生
- `src/terrain.js` 地形(閉じた多角形)との衝突
- `src/levels.js` ステージデータ
- `src/render.js` 描画(すべて手続き的、画像なし)
- `src/audio.js` Web Audio の合成効果音
- `src/input.js` Pointer Events、iOS ジェスチャ抑止
- `src/save.js` localStorage への到達ステージ保存

設計プランは `docs/01.md`。

## 自動プレイ検証

Playwright が入った環境で、ローカルサーバー(ポート 8123)を起動してから:

```
node tools/playtest.mjs <出力ディレクトリ> <開始ステージ 0-2> [幅] [高さ]
node tools/endingtest.mjs <出力ディレクトリ>
```

ステージ通過の秒数とスクリーンショットが出力される。
