# Goo Garden

World of Goo 風の、文字を一切使わない物理パズルです。iPhone / iPad の Safari(縦・横)で動きます。

- `index.html` を開くだけで動作します(ビルド不要・依存ゼロ)。GitHub Pages にそのまま置けます。
- ホーム画面に追加するとフルスクリーンで遊べます。
- 設計方針は `PLAN.md` を参照。

## 遊び方(言葉で書くと)
Goo をつまんで、すでにある構造の近くで離すとくっつきます。パイプの口まで届くと吸い込まれてクリアです。落ちても消えません。

## ファイル
```
index.html / css/style.css / manifest.webmanifest / icon.svg
js/physics.js   物理(Verlet・バネ・地形)
js/levels.js    3ステージのデータ
js/goo.js       Goo の状態と表情
js/structure.js 構造グラフ・接続候補・経路
js/input.js     1本指ポインタ入力
js/audio.js     効果音・BGM(Web Audio 合成)
js/fx.js        紙吹雪などの演出
js/render.js    描画
js/main.js      ループ・ステージ遷移・カメラ
```
