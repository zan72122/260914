# 炎色反応ゲーム 設計書 / Flame Test Game — Design Document

**対象**: 4歳児（文字が読めない）
**プラットフォーム**: iPhone / iPad ブラウザ（Safari）、縦・横両対応
**元素**: リチウム・銅・ナトリウム・ストロンチウム・バリウム
**版**: v1.0 / 2026-09-15

---

## 0. 設計の憲法（すべての判断の上位ルール）

この5条に反する実装は、どんなに面白くても却下する。

1. **「未完成の世界 → ひと差し指の行動 → 世界が変わる」を必ず通す。**
   完成品を見せるだけの画面を作らない。子どもが触る前の世界は、必ずどこかが欠けている。
2. **文字・矢印・チュートリアルカード・「つぎへ」ボタンを一切出さない。**
   行動の誘いは、空いた穴・切れた線・合う形・揺れ・光・キャラの視線・物理的な吸着でのみ行う。
   *「世界そのものが誘えるとき、行動を説明してはならない。」*
3. **音を切っても完全に遊べる。** 音声は理解の「上乗せ」であって前提ではない。
4. **失敗・タイマー・スコアを作らない。** 判定は常に寛容側に倒す。指が外れても世界は壊れない。
5. **元素名はテキストで教えない。** 世界が変わる最高潮の一瞬に、音声で1回だけ名前が鳴る。

### 学習目標（4歳児の言葉で）
「この色の炎は、**このお仕事をする子**だ」と体で分かること。
色の暗記ではなく、**色 ↔ 世界（役割）** の結びつきを作る。だから世界の側を強く作る。

### セッション設計
- 1ワールド **30〜60秒**。飽きる前に必ず世界が変わる。
- 1回の遊びで平均3〜5ワールド。ハブに戻るたびに「もう1回入れたい」が起きる構造にする。

---

## 1. コアループとハブ（炉のシーン / hearth）

### 1.1 画面構成

炉（hearth）は**唯一のハブ**であり、全ワールドの出発点かつ帰着点。

```
     [ 上部: 炎 + 白金線ループ(wire loop) ]      ← 画面の“熱い”中心
     [ 中部: 帰ってきた世界のミニアイコンが並ぶ棚 ] ← 実績＝飾り（文字なし）
     [ 下部: 5つの試料皿 (sample dishes) が弧状に並ぶ ] ← 指の届く場所
```

- **縦持ち**: 炎が上 1/2、試料皿が下 1/3 に大きな弧で並ぶ（親指で届く帯）。
- **横持ち**: 炎が中央やや左、試料皿が右下に弧状。棚は左端に縦積み。
- 詳細は §5.3 のレイアウト規約に従う。

### 1.2 試料の見せ方（色だけで区別しない）

5つの試料は**形・質感・動き**で区別する。色はヒントの一つに過ぎない。
これは「赤 = リチウム」の早期固定を防ぐ最初の防波堤でもある。

| 元素 | 試料皿の中身（生の姿） | 形の特徴 | 待機中の微動（idle） |
|---|---|---|---|
| リチウム | 銀色の小石。中に赤い熱がゆっくり脈打つ | 丸い小石。1個 | 呼吸するように赤が明滅（周期2.4s） |
| 銅 | 赤茶色の線をぐるぐる巻いたコイル | らせん | ばねのように上下に弾む（周期1.8s） |
| ナトリウム | 白い立方体の結晶が5〜6個かたまっている | 四角のクラスタ | きらっと角が光るのが順番に回る |
| ストロンチウム | 赤みを帯びた**針状**の鉱物（束） | とがった針の束 | 針先が小さく震える（高周波・小振幅） |
| バリウム | 緑がかった**平たい板状**の鉱物 | 平らな六角板 | ゆっくり傾いて面が光を返す（オービット感） |

> **科学的誠実さ**: 試料は「元素そのもの」ではなく「炎色反応に使う試料」として描く。
> リチウム・ナトリウムの金属は実際には保護油中で扱う危険物なので、**皿にガラスの蓋（半球）をかぶせた表現**にし、蓋ごと炎へ運ぶ。これで「素手で金属を掴む」絵を避ける。

### 1.3 最初のひと触りを誘う仕掛け（ゼロ説明）

初回起動時、3秒かけて次が順に起きる：

1. 炎が**呼吸**する（大きく→小さく、2.8s周期）。画面で唯一動いているもの。
2. 炉の縁に小さなキャラクター **「ヒノコ」**（火の粉の精、目と手だけの単純な形、口なし）が現れる。
   ヒノコは**しゃべらない**。**視線だけ**で誘導する。
3. ヒノコが**最も近い試料皿を見る → 炎を見る → また試料皿を見る**（2往復）。
   同時にその試料皿が**わずかに持ち上がって揺れる**（wobble）。
4. それでも8秒触られなければ、**白金線ループ（wire loop）が試料皿の上に降りてきて、ホバーして待つ**。
   ループは「ここに乗せる穴」として機能する（＝空きスロット誘導）。

> 再訪時は誘導を弱める（ヒノコの視線1往復のみ）。**やり方を知っている子に説明を繰り返さない。**

### 1.4 試料を炎に入れる操作（全元素共通・統一動作）

- **ジェスチャ**: 試料皿を**指で押さえて炎までドラッグ**（drag）。
- **吸着**: 炎の中心から半径 `min(w,h)*0.18` 以内に指が入ると、試料は指を離れて**炎へ吸い込まれる**（magnetic snap, 0.35s ease-out）。
- **寛容ルール**:
  - ドラッグ途中で指を離した場合 → 試料は**皿へふわりと戻る**（失敗演出なし、音は柔らかい「ぽす」）。
  - 皿の当たり判定は見た目の**1.6倍**。
  - 同時に2本指が来たら**最初の1本のみ**を採用（pointerId ロック）。
- **代替**: 試料皿を**タップするだけ**でも、0.8秒かけて試料が自動で炎へ飛ぶ。
  （4歳児はドラッグより先にタップする。タップを「失敗」にしない。）

### 1.5 炎色の発現（共通演出・全元素で同一の型）

入れてから世界に着くまで、**画面カットを一切入れない**。1.8〜2.4秒の連続演出。

| t (秒) | 起きること |
|---|---|
| 0.00 | 試料が白金線ループに乗る。ループが**白熱**（白→オレンジ）。カチ、という小さな音。 |
| 0.25 | ループが炎の中心へ沈む。炎の根元から**その元素の色が上へ這い上がる**（0.5s）。 |
| 0.75 | 炎全体が元素色に置換。炎が**1.4倍に膨らむ**。音: 低い「ぼわっ」＋色ごとの倍音。 |
| 1.00 | 炎の色が**画面全体へ溢れる**（radial gradient が画面外まで拡大）。カメラが炎へ寄る。 |
| 1.30 | 溢れた色の中に**粒子が凝集**して「**かけら**」になる（元素ごとに形が違う）。 |
| 1.60 | かけらが画面の特定位置へ流れ、**その位置を起点に次の世界が背景から浮かび上がる**。 |
| 〜2.4 | 炎の色が**その世界の光源色**になって定着。ワールドの `enter()` が呼ばれている。 |

> **重要**: 溢れた炎の色は消えない。**その世界の照明になる**。
> 例：ナトリウムの黄色 → 街灯の光。銅の青緑 → 回路の光。これが色↔世界の接着剤。

### 1.6 「かけら」（intermediate fragment）一覧

| 元素 | 炎色 | かけら（粒子が凝集してなるもの） |
|---|---|---|
| リチウム | 深い赤 | **エネルギーの粒**（赤く脈打つカプセル形） |
| 銅 | 青緑 | **銅線1本**（青緑に発光するしなやかな線） |
| ナトリウム | 強い黄 | **黄色い光のしずく**（→街灯の光になる）＋塩の粒 |
| ストロンチウム | 紅（深赤） | **赤い星のタネ**（とがった星形の種子） |
| バリウム | 緑 | **緑の光の板**（薄く平らな発光パネル片） |

### 1.7 ハブへの帰還と再訪の誘い（リプレイ設計）

ワールド終了 → **カメラが引く** → 世界がそのまま**小さくなって炉の棚のミニジオラマになる**（カットなし）。

- 棚に置かれたミニジオラマは**ずっと動き続ける**（ローバーが走る、街灯が灯る、花火が上がる）。
  → 「もう1個ここに増やしたい」という収集欲を、文字なしで発生させる。
- 帰還と同時に、**まだ遊んでいない試料皿が1つだけ、大きく揺れる**（wobble）。
- 5つ全部やった後は、**遊んだ回数が少ない皿**が揺れる。
- ヒノコは帰還時に**両手を上げて跳ねる**（＝ほめ。声なし）。

---

## 2. 各元素のワールド仕様

### 共通フォーマット
各節は以下を必ず含む: かけら / 未完成の状態 / 誘い / ジェスチャと許容 / 世界変化 / カメラ / 音声タイミング / 帰還 / 科学ノート。

### ジェスチャとカメラの割り当て（重複禁止表）

| 元素 | 主ジェスチャ | カメラ | 中間物 | 世界変化の性格 |
|---|---|---|---|---|
| リチウム | **ドラッグ→スロット挿入** | **寄り → 追従パン** | エネルギーの粒 | 動き出す（機械） |
| 銅 | **なぞる（trace along path）** | **寄り（マクロ）→ 引き** | 銅線 | 通る（回路が光る） |
| ナトリウム | **タップ連打／ばらまき** | **ティルト＋ゆっくり上昇** | 光のしずく・塩粒 | 灯る（街が黄色く） |
| ストロンチウム | **長押し→離す（チャージ）** | **上を仰ぐ＋画面シェイク** | 星のタネ | 打ち上がる（1点集中） |
| バリウム | **ぐるぐる円運動** | **オービット（旋回）→ 引きの大俯瞰** | 光の板 | 広がる（面で覆う） |

---

### 2.1 リチウム（Li）— 赤い炎 / 動き出す世界

**かけら**: 赤く脈打つ**エネルギーの粒**（カプセル形、直径 0.06*S）。

**未完成の世界**:
砂色の丘。止まっている**小さな探査ローバー**が1台、うつむいたように傾いて停止している。
車体の横に**明らかに粒と同じ形の空きスロット**が開いていて、その穴の縁が**赤く点滅**している。
ローバーのライトは消えている。空は薄暗い。

**誘い（無言）**:
- かけらは炉から飛んできて**スロットの少し上で止まり、ゆっくり回りながら待つ**。
- スロットの縁がかけらと**同じ形・同じ色**で明滅（形の一致 = 最強の無言ヒント）。
- 3秒無操作で、かけらが**スロットへ少し近づいて戻る**（＝「ここだよ」の物理的示唆）を繰り返す。
- ローバーが**首（カメラ部）をスロットの方へ向ける**（視線誘導）。

**ジェスチャ / 許容**:
- **ドラッグ** でかけらをスロットへ運ぶ。
- スロット中心から `0.14*S` 以内で**磁力スナップ**。指を離しても吸い込まれる。
- どこで離しても、かけらは**その場に浮いたまま**（落ちて消えない）。再度掴める。
- **タップだけでも可**: かけらをタップ → 0.7s でスロットへ飛ぶ。
- 入ったら二度と抜けない（後戻りの不安をなくす）。

**世界変化**:
1. スロットが閉じ、**車体の中を赤い光が配線に沿って走る**（0.6s）。
2. ローバーのライトが**点灯**（暖色の白）。ヘッドライトの光の帯が地面に伸びる。
3. 車輪が回り、**ローバーが走り出す**。小石を跳ねる。砂煙。
4. 走った先に**もう1台の止まったローバー**の影がちらりと見える（＝次回の予告、やらせない）。

**カメラ**:
- 挿入の瞬間: スロットへ**強く寄る**（zoom 1.0→1.6、0.4s）。
- 走り出し: **横パンで追従**（ローバーを画面の1/3位置にキープ）。速度に合わせて視野が少し広がる。

**音声タイミング**:
**ライトが点灯し、車輪が最初の一回転をした瞬間**（世界変化の最高潮）に「**リチウム**」を1回。
同時に SFX: 低い駆動音の立ち上がり + ライト点灯の「ピンッ」。

**帰還**:
ローバーが画面奥へ走り去る → カメラが**引き続けて丘全体が小さくなる** → 炉の棚のミニジオラマになる（カットなし、約1.6s）。棚の上でローバーは走り続ける。

**科学ノート（誤解を作らないための表現規則）**:
- リチウム金属が魔法で電池になる、とは描かない。
- **描いてよいもの**: 「リチウムが関わっている＝エネルギーを蓄えて動かす世界」。
  かけらは金属片ではなく**エネルギーの粒（抽象）**として描き、スロットは**電池セル状のケース**の形にする。
- 炎色（赤）は、世界の**赤い配線光**として引き継ぐ。「赤い光がエネルギーを運ぶ」だけを伝える。
- リアルな金属リチウムは炉の試料皿の中（ガラス蓋つき）にだけ存在させる。

---

### 2.2 銅（Cu）— 青緑の炎 / 通る世界

**かけら**: 青緑に光る**銅線1本**（しなやかな曲線、端が2つ）。

**未完成の世界**:
夜の街のジオラマの**基板のような地面**。家々や街灯が**全部消えている**。
地面には青緑の回路パターンが走っているが、**1箇所（or 2箇所）だけ線がぱっくり切れている**。
切れ端は**火花をパチパチ散らして**いる。切れ端どうしは互いに**引き合うように揺れる**。

**誘い（無言）**:
- 切れた端点が**明滅しながら火花**を出す（＝目が真っ先に行く場所）。
- 端点AとBの間に、**薄い点線のガイドが一瞬だけ息をするように現れて消える**（矢印ではない。光の粒の並び）。
- かけらの銅線が端点Aの上で**ぷるぷる震えて待つ**。
- ヒノコが切れ目の上に座って、切れ目を覗き込む。

**ジェスチャ / 許容**（この世界だけ **なぞる**）:
- 端点Aに指を置き、**指でなぞって**端点Bまで引く。指の軌跡に沿って銅線が**伸びる**。
- **許容が最重要**: 理想パスからの**垂直距離 `0.10*S` 以内なら「オン・パス」**。
  - 外れても線は消えない。**指に引っ張られて弓なりにたわむだけ**。
  - 進行度は「パス上の到達率」で単調増加のみ（戻っても減らない）。
  - 指を離しても、到達率 **50%以上なら自動で残りが伸びて繋がる**。50%未満なら線は端点Aへ戻って再挑戦可。
- 曲がりくねったパスにしない。**なだらかなS字1本**。2箇所目は初回クリア後の再訪時のみ出す。

**世界変化**:
1. 繋がった瞬間、**青緑の光が線を猛スピードで走る**（0.5s、分岐して街全体へ）。
2. 光が届いた順に**家の窓・街灯・看板が次々に灯る**（ドミノ点灯、1.2s）。
3. 街が完全に点灯 → 夜景として輝く。小さな電車が回路の上を走り出す。

**カメラ**:
- なぞっている間: **マクロな寄り**（切れ目が画面の1/3を占める）。指の位置に合わせて微パン。
- 繋がった瞬間: **一気に引く**（zoom 1.6→0.55、1.1s ease-out）。街全体が現れる = 「引きの発見」。

**音声タイミング**:
**引きの途中、街の灯りが半分以上ついた瞬間**に「**どう**」を1回。
（クライアント指定どおり「どう」。SFX: 電流の「じじっ」→ 点灯の和音アルペジオ）

**帰還**:
引ききった街がそのまま縮んで棚のミニジオラマへ。棚の上で電車が走り続け、窓が明滅する。

**科学ノート**:
- 銅 = **電気をよく通す金属 → 電線**。これは科学的にそのまま正しい。5元素中もっとも直球。
- かけらの銅線は**青緑に光っている**が、これは「炎色の記憶」の演出であることが分かるよう、
  繋がった直後に**色が銅の赤茶色に落ち着き、流れる電気の光だけが青緑**になる（＝素材と光を分離）。
- 「銅が光る」のではなく「銅を電気が通る」と見えるようにする。

---

### 2.3 ナトリウム（Na）— 強い黄の炎 / 灯る世界・塩の世界

**かけら**: **黄色い光のしずく**（複数、7〜9個）＋ **白い塩の粒**（立方体、小）。
→ ナトリウムだけ、かけらが**2種類**に割れる。これが2段構成の根拠になる。

**未完成の世界（2段。合計45〜60秒）**:

**前半：食卓（塩）**
夕方の食卓。皿の上に**茹でたてのじゃがいも**（湯気つき）。誰かが待っている（ヒノコが座っている）。
食卓は**なんとなく物足りない**：湯気はあるが、じゃがいもの表面は艶がなく、色がくすんでいる。
上空に**白い塩の粒がふわふわ浮いている**（かけら）。

**後半：夜の街（街灯）**
食卓の窓の外が暗い。窓の外に**消えた街灯の列**が見えている。
黄色い光のしずくが、窓のほうへ**ゆっくり流れていく**（＝視線を外へ誘導）。

**誘い（無言）**:
- 前半: 塩の粒が**じゃがいもの真上でゆらゆら**。じゃがいもが**ほんの少し跳ねる**（欲しがる動き）。
  ヒノコが**口のない顔で、じゃがいもと塩を交互に見る**。
- 後半: 街灯の**傘の中だけが空洞**として暗く描かれ、そこが**呼吸するように薄く黄色く明滅**する（空きスロットの変奏）。光のしずくが街灯の上にふわっと寄る。

**ジェスチャ / 許容**（この世界だけ **タップ／ばらまき**）:
- **前半**: 画面のどこでもよいので**タップ（連打）**。タップのたびに塩の粒がパッと散って、
  じゃがいもに**落ちる**。じゃがいもの当たり判定は画面の**上半分すべて**（実質失敗しない）。
  - 3回タップで完了扱い。4回以降も受け付けて、粒は増えて楽しい（上限20）。
  - **長押しでも代替可**: 押している間、塩が連続的に降る（0.15s間隔）。
- **後半**: 街灯を**1本ずつタップ**（または指をスライドさせて一気に撫でてもよい = drag-through）。
  - 街灯の当たり判定は**縦に長い柱全体＋その周囲 `0.08*S`**。
  - 5本のうち **3本灯せば自動で残りが連鎖点灯**（待たせない）。

**世界変化**:
- **前半**: 塩がかかった瞬間、じゃがいもの表面が**つやっと光り、湯気が強くなる**。
  ヒノコが**両手を上げて喜ぶ**（跳ねる）。「おいしい」を体で表す。
  → ここで塩の粒の1つがふわっと浮き上がり、**黄色く光り出す**。それが窓の外へ飛ぶ。
- **後半**: 街灯が灯る。**ナトリウムランプ特有の、あの濃いオレンジがかった黄色**で、
  街全体が**黄色一色**に染まる（影まで黄色。色相を街全体に適用 = 強烈な色の記憶）。
  雨に濡れた路面に黄色が長く反射する。

**カメラ**:
- 前半: 食卓に**やや俯瞰で固定**、タップのたびに微ズーム（punch-in 1.0→1.03、0.12s）。
- 後半: **ティルトアップ**（食卓 → 窓 → 街灯の列 → 夜空）しながら**ゆっくり上昇**。
  最後に街灯の列を横から見た構図で止まる。このティルトが他ワールドと明確に違う「見上げ」の体験。

**音声タイミング**:
**街灯がすべて灯り、画面全体が黄色に染まりきった瞬間**に「**ナトリウム**」を1回。
（前半の塩では鳴らさない。最高潮は「街が黄色くなる」ほう。色↔元素の結合をそこに置く。）

**帰還**:
黄色い街がそのまま縮んで棚へ。棚の上でミニ街灯が明滅し続ける。

**科学ノート（この元素がいちばん誤解を生みやすい）**:
- **ナトリウム金属 ≠ 食塩**。だから **金属を食卓に持ち込まない**。
- かけらは炎から出た「光のしずく」と「塩の粒」に**分岐**し、
  塩の粒は**最初から白い立方体の結晶**として描く（金属の銀色を一切使わない）。
- 伝えたいのは「**ナトリウムは、塩の中にも、街灯の黄色い光の中にもいる**」という**所在**であって、変換ではない。
  そのため前半（塩）と後半（街灯）は**因果でつなげない**。塩の粒の1つが光り出して外へ飛ぶのは、
  「同じ仲間がここにもいるよ」という**居場所の移動**として演出する（変身ではなく案内）。
  - 実装上の表現規則: 塩粒は**形を保ったまま**発光し、街灯の中に**入って消える**（溶けたり変形したりしない）。
- ナトリウムランプの黄色は炎色と同じ起源（D線）なので、**炎色→街灯**は科学的に極めて誠実。ここを主役にする。

---

### 2.4 ストロンチウム（Sr）— 紅の炎 / 打ち上がる世界

**かけら**: **赤い星のタネ**（とがった星形の種子。中で赤が渦巻いている）。

**未完成の世界**:
夜の河原。**打ち上げ筒**が1本、地面に斜めに立っている。筒の口が**空っぽ**で、暗い。
空は真っ黒で**何もない**（＝明らかに足りない）。川面に月だけが映っている。
遠くに小さな人影（ヒノコの仲間たち）が**空を見上げて待っている**。

**誘い（無言）**:
- 筒の口が**星のタネと同じ形の穴**として描かれ、ふちが赤く明滅。
- タネは筒の口の上で**ゆっくり回転して待つ**。
- 何もない**黒い空の広さ**そのものが誘い（「ここが空いている」）。
- 見上げている人影たちが、**時々こちらを振り返る**（視線誘導）。

**ジェスチャ / 許容**（この世界だけ **長押し → 離す**）:
1. タネを筒へドラッグ（or タップ）して装填。**ここは簡単に済ませる**（本題ではない）。
2. 装填されると、筒が**ぶるぶる震えはじめる**。筒全体が「押されたがっている」。
3. **筒を指で長押し**。押している間：
   - 筒の中の赤い光が**下から上へ充填**されていく（ゲージではなく「光の水位」。目盛りなし）。
   - 押している時間に応じて**低い音が上がっていく**（ピッチ上昇）。
   - 筒が**たわむ**。画面が**わずかに震えはじめる**。
4. **指を離した瞬間に発射**。
   - **許容**: 0.3秒以上押していれば必ず発射。0.3秒未満なら「しゅっ」と小さく空振りして、
     筒は震えたまま残る（**失敗ではなく再挑戦の招待**）。
   - 押しっぱなしの上限は2.0秒。**それ以上押すと自動で発射**（待ちくたびれさせない）。
   - 押した長さは**花火の大きさ**に反映される（大 = 気持ちいい。小でも十分きれい）。
   - 指が動いてもキャンセルしない（4歳児の指はぶれる）。移動許容 `0.25*S`。

**世界変化**:
- 赤い光の尾を引いて上昇 → **一拍の静止（0.25s、音も消える）** → **深紅の大輪が開く**。
  紅が画面いっぱいに広がり、**枝垂れて落ちる**。川面に赤が映る。
- 人影たちが一斉に**手を上げる**。
- 連射可能：花火が消える前に再度長押しできる（**2〜3発は撃たせる**。ここが一番笑う）。3発目の後に帰還演出へ。

**カメラ**:
- 装填〜チャージ: 筒に寄る（低い位置から見上げ気味）。
- 発射: **カメラが玉を追って上へ急ティルト**（見上げる）。
- 開花: **画面シェイク**（振幅 `0.012*S`、減衰0.5s）＋ 一瞬のホワイトフラッシュ（弱め、露出15%まで。4歳児の目に配慮し強フラッシュ禁止）。

**音声タイミング**:
**大輪が開ききった瞬間**（＝静止の直後、シェイクと同時）に「**ストロンチウム**」を1回。
2発目以降は鳴らさない（うるさくしない）。

**帰還**:
最後の花火の火の粉が降りきる → カメラが引いて河原全体 → 縮んで棚へ。棚の上でミニ花火が定期的に上がる。

**科学ノート**:
- ストロンチウム化合物（硝酸ストロンチウム等）が**赤い花火の色の元**であることは事実。ここは直球。
- ただし**火薬・薬品の調合は一切描かない**。かけらは「星のタネ」という**抽象化された素材**にとどめる。
  （現実に真似できる手順を見せない、が絶対条件。）
- 子どもの発火遊びを誘発しないため、**火をつける動作（マッチ・導火線）を描かない**。押すと光が溜まる、という抽象操作にする。

---

### 2.5 バリウム（Ba）— 緑の炎 / 広がる世界

**かけら**: **緑の光の板**（薄く平たい発光パネル片、複数枚に分かれている 5〜7枚）。

**未完成の世界**:
夜の広場の**まんなかに、円形の装置**（ターンテーブル状の台）。
台の周りに**緑の光の板が散らばって**いて、**どれも斜めに倒れている**。
空は暗い。広場の輪郭だけがうっすら見える。**世界が「まだ広がっていない」**。

**誘い（無言）**:
- 台の上面に**うっすらと円形の溝（軌道）**が刻まれ、その溝が**ゆっくり回る光で示される**（＝円運動のアフォーダンス）。
  ※矢印ではなく、溝の中を光が周回するだけ。
- 光の板が**溝のほうへ少しずつ傾く**（吸い寄せられたがっている）。
- ヒノコが台の上に乗って**その場でくるくる回る**（＝動きの見本。言葉なし、身体で示す）。

**ジェスチャ / 許容**（この世界だけ **ぐるぐる円運動**）:
- 指で画面を**ぐるぐる回す**。回した角度の累積で装置が回転する。
- **許容ルール（最重要 — 4歳児の円は円じゃない）**:
  - 中心は**台の中心に固定**。指と中心を結ぶ角度の**差分の符号付き累積**で判定する。
  - **半径は一切問わない**（画面のどこで回してもよい。端でも隅でも可）。
  - **方向は問わない**（時計回り・反時計回りどちらでも進む。累積は絶対値）。
  - **一時停止してもリセットしない**。指を離しても**慣性で回り続ける**（減衰 0.92/frame）。
  - 必要累積は **2.5回転（900°）**。指1本で3〜5秒程度。
  - 累積が増えるほど**回転が軽くなる**（抵抗が減る = 手応えのフィードバック）。
  - 逆方向に切り返しても**減らさない**（`|Δθ|` を足す）。
- **代替**: 何度も**スワイプ**しているだけでも角度累積が入る（円でなくてもよい）。

**世界変化**（"広がる" が主題。上ではなく **面** で来る）:
1. 回すたびに、散らばった緑の板が**1枚ずつ起き上がって溝にはまる**（累積に応じて順次）。
2. 全部はまると装置が**まばゆい緑に発光**。
3. **緑の光が地面を波紋状に走り、広場 → 街 → 丘 → 地平線まで、面で広がっていく**（1.8s）。
   通ったところに**草が生え、木が立ち、湖が現れる**（世界が育つ）。
4. 最後に**空に緑の大きな花火が横一面に広がる**（ストロンチウムの「1点から開く球」に対して、
   バリウムは**横に長く広がる幕**。形で明確に差別化）。

**カメラ**:
- 回している間: **オービット（装置の周りを低い高度で旋回）**。回転入力と連動して視点も回る（＝身体感覚の一致）。
- 発光後: **大きく引いて高い俯瞰へ**（zoom 1.2→0.4、ティルトダウン→水平）。
  **5ワールド中もっとも視野が広い絵**にする。ここが「広がる」の正体。

**音声タイミング**:
**緑の波紋が地平線に到達し、緑の幕花火が横に広がりきった瞬間**に「**バリウム**」を1回。

**帰還**:
大俯瞰のまま世界がそのまま縮んで棚へ。棚の上でミニ広場が緑に明滅する。

**科学ノート**:
- バリウム化合物（硝酸バリウム等）が**緑の花火の色の元**。ここが4歳児にとって最も分かりやすい役割なので主役にする。
- **バリウム造影剤（バリウム検査）は4歳児向けには採用しない**。
  理由: (a) 抽象度が高く体験化しにくい、(b) 「飲む」動作は誤飲連想のリスク、(c) 色と結びつかない（造影剤は白）。
  → 将来の年長向けモードでのみ検討（§8 将来拡張）。
- ストロンチウムと同様、火薬の扱いは描かない。「光の板を並べて装置を回すと光が広がる」という抽象操作。

---

## 3. 赤 vs 赤 — リチウムとストロンチウムの区別設計

### 3.1 問題
リチウムもストロンチウムも赤い。放置すると子どもは「**赤 = リチウム**」（先に見たほう）と誤学習する。

### 3.2 三層の対策

**第1層：色の前に形（最初から効いている）**
試料の形（丸い小石 vs とがった針の束）、かけらの形（カプセル vs 星形）、
待機モーション（ゆっくり脈打つ vs 高周波に震える）が最初から違う。
→ 子どもは色より先に**形と動きで区別する**。これは4歳児の認知に合っている。

**第2層：世界が決定的に違う（本命）**
「動き出す機械の世界」 vs 「夜空に打ち上がる世界」。
ジェスチャも違う（挿す vs 溜めて離す）、カメラも違う（追従パン vs 見上げ＋シェイク）。
→ **色ではなく世界で覚える**。これが本作の学習目標そのもの。

**第3層：分光器（「色だけでは分からない」を体験させる）**

**発動条件**: リチウム世界とストロンチウム世界を**両方1回以上クリア**（localStorage）。

**登場（無言）**:
次に炉へ戻ったとき、炉の脇に**真鍮色の分光器（小さな筒＋プリズム）**が**転がって現れる**。
- 分光器は**ころころ揺れて自己主張**する（新規オブジェクトは必ず揺れる、が本作の規約）。
- ヒノコが分光器を持ち上げて、**炎に向けて覗く仕草**を1回だけ見せる（＝動作の見本、言葉なし）。

**遊び方（wordless）**:
1. いつも通り試料を炎に入れる → 炎が色づく。
2. **炎が色づいている間だけ**、分光器が**光って、炎のほうへ引き寄せられるように揺れる**。
3. 子どもが分光器を**ドラッグして炎の前に持っていく**（スナップ許容 `0.20*S`、非常に寛容）。
4. 画面が**分光器の筒の中の視界**に切り替わる（カットではなく、筒の円形マスクが広がって覆う）。
5. **黒い背景に、光の線（スペクトル線）が並んで見える**。

**スペクトル表示（文字なし、線だけ）**:

| 元素 | 線パターン（描画仕様） |
|---|---|
| リチウム | **太い深赤の線1本（670nm相当位置）** ＋ 細いオレンジ1本（610nm）。**線が少なく、すっきり** |
| ストロンチウム | 赤〜橙に**線が4〜5本ぎっしり**（650/665/687/707nm相当） ＋ **青の線1本（460nm）**。**にぎやか＋青が混じる** |
| 銅 | 青緑に**2〜3本**（510/515/522nm） |
| ナトリウム | **黄に1本だけ、極端に太い**（589nm D線）。いちばん単純 = 覚えやすい |
| バリウム | 緑に**3〜4本**（514/553/577nm） |

> 4歳児が言語化できなくても、「**すっきり1本（リチウム）** vs **にぎやか＋青がいる（ストロンチウム）**」の
> **絵の違い**は一目で分かる。そこを狙う。

**世界アイコンへの接続（これが決定打）**:
スペクトル線が出た 1.0 秒後、**線の下に、その元素の世界のミニジオラマ（棚にあるやつ）がふわっと浮かび上がる**。
- リチウムの線 → **走るローバー**のミニ
- ストロンチウムの線 → **赤い花火**のミニ
→ 「この線の並び ＝ この世界」が絵だけで結ばれる。文字は一切ない。

**赤 vs 赤 の比較プレイ（自然な発生）**:
分光器が出た後、**炉の棚にリチウムとストロンチウムのミニジオラマが並んで置かれる**。
片方を見た直後にもう片方を試したくなる配置（隣接＋交互に揺れる）にする。
- さらに: 分光器を覗いた状態で炉に戻ると、**次に揺れる試料皿は「もう片方の赤」**になる（誘導ロジック）。
- 両方の赤を分光器で見た後、炉の壁に**2つのスペクトル画像が並んで貼られる**（ミニ図鑑。文字なし）。

**明示的に避けること**:
- 「どっちでしょう？」というクイズを出さない（**判定＝失敗の概念**が入るため禁止）。
- 正解・不正解の演出を作らない。**見比べられる状態を用意するだけ**にとどめる。

---

## 4. オーディオ設計

### 4.1 方針
- 収録音声アセットが**ない**前提。**Web Speech API (`speechSynthesis`)** を第一手段とする。
- 効果音はすべて **WebAudio の合成**（アセットゼロ）。
- **音を切っても完全に遊べる**。音は「上乗せ」。

### 4.2 元素名の読み上げ

```js
// src/core/audio.js
speakElement(id) // id: 'lithium' | 'copper' | 'sodium' | 'strontium' | 'barium'
```

発話テキスト（クライアント指定に準拠）:

| id | utterance text | 備考 |
|---|---|---|
| lithium | `リチウム` | |
| copper | `どう` | 「銅」だと「あかがね/どう」揺れ。**かな指定必須** |
| sodium | `ナトリウム` | |
| strontium | `ストロンチウム` | |
| barium | `バリウム` | |

設定:
```js
const u = new SpeechSynthesisUtterance(TEXT[id]);
u.lang = 'ja-JP';
u.rate = 0.85;   // 4歳児向けにゆっくり
u.pitch = 1.15;  // やや高め＝親しみ
u.volume = 1.0;
speechSynthesis.cancel(); // 重複防止
speechSynthesis.speak(u);
```

**voice 選択**: `speechSynthesis.getVoices()` から `lang.startsWith('ja')` の最初を採用。
iOS は voices が非同期で埋まるため `voiceschanged` を待つ。起動時に一度 warm-up（volume 0 の空発話）しておく。

**フォールバック順**:
1. 事前収録 `audio/{id}.mp3` が存在すれば最優先で使う（将来差し替え可能にしておく）。
   - 起動時に `HEAD` ではなく `new Audio()` の `canplaythrough` / `error` で存在判定、または `assets/manifest.json` の有無で分岐。
2. 存在しなければ `speechSynthesis`（ja 音声あり）。
3. ja 音声が無い / API 無し → **音声なしで進行**（世界の演出は変わらない）。
   代わりに「**名前の合図**」として、その元素固有の**3音のモチーフ**を鳴らす（下記）。

> 実装ルール: 音声の完了を**待たない**。演出は音と独立に進む。
> `window.__game.lastVoice` は、実際に音が出たかに関わらず「発話を要求した elementId」を記録する（ヘッドレス環境でのQAのため）。

### 4.3 元素モチーフ（3音・WebAudio合成）
音声が出ない環境でも「今、この子の名前が呼ばれた」が伝わるよう、各元素に短い3音モチーフを付ける。
名前の発話と**同時に**鳴らす。

| 元素 | 波形 | 音程（相対） | 性格 |
|---|---|---|---|
| リチウム | triangle | C5-E5-G5（上行） | 起動する |
| 銅 | sine | G5-C6-E6（きらきら） | 通る |
| ナトリウム | sine+soft saw | E5-E5-A5 | 温かい |
| ストロンチウム | square(soft) | C5-G5-C6（跳ねる） | 打ち上がる |
| バリウム | triangle | D5-F#5-A5（広がる、長いリリース） | 広がる |

### 4.4 SFX 一覧（すべて合成）

| 名前 | 用途 | 合成方法 |
|---|---|---|
| `pick` | 試料をつまむ | 短い sine ping 880Hz, 40ms |
| `drop_back` | 戻る | 三角波 down-glide 400→250Hz, 120ms |
| `ignite` | 炎に入る | ノイズバースト + lowpass sweep 200→2000Hz, 600ms |
| `flame_loop` | 炎の環境音 | brown noise + lowpass 500Hz + LFO amp |
| `snap` | スロット吸着 | sine 1200Hz, 30ms + わずかなクリック |
| `trace` | なぞり中 | 進行度でピッチ上昇する sine（連続） |
| `power_on` | 通電 | 上行アルペジオ 5音 |
| `sprinkle` | 塩を撒く | 高域ノイズ短音をランダムピッチで |
| `lamp_on` | 街灯点灯 | sine 660Hz + 短いフィルタ開き |
| `charge` | 長押し中 | saw のピッチ上昇 + 音量上昇 |
| `launch` | 発射 | ノイズ up-sweep 300ms |
| `burst` | 花火開花 | ノイズバースト + 減衰、低域ドン |
| `spin` | 円運動中 | 回転速度に比例するピッチの sine + LFO |
| `spread` | 波紋拡散 | 低域 sine の長いスウェル |
| `shelf_place` | 棚に置く | 木のコツン（短いノイズ + bandpass 700Hz） |

### 4.5 オーディオのアンロック
- iOS は**ユーザージェスチャ内**でないと AudioContext が動かない。
- **最初の `pointerdown` で** `audioCtx.resume()` ＋ 無音バッファ再生 ＋ speechSynthesis の warm-up を行う。
- アンロック前は**音を鳴らそうとしない**（キューに溜めない）。
- `visibilitychange` で `suspend()` / `resume()`。

### 4.6 ミュート
右上に**スピーカーの絵アイコン**（文字なし）。タップでオン/オフ。
状態は localStorage。**音オフでもゲーム進行は完全に同一**。

---

## 5. 技術アーキテクチャ

> 本章は複数のエンジニアが並行実装するための**契約**である。ここに書かれたシグネチャは変更しないこと。

### 5.1 制約
- 純粋な HTML/CSS/JS。**ビルドステップなし、フレームワークなし、実行時 npm 依存なし**。
- **ES modules**（`<script type="module">`）。相対パス `./` `../` のみ。拡張子 `.js` を必ず書く。
- `http-server` で静的配信。**GitHub Pages にそのまま置けること**（絶対パス `/src/...` 禁止）。
- 単一の全画面 `<canvas>` に **2D context** で描画。DOM UI は使わない（ミュートアイコンも canvas 内に描く）。

### 5.2 index.html / CSS の要点

```html
<meta name="viewport"
  content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
```

```css
html, body {
  margin: 0; padding: 0;
  width: 100%; height: 100dvh;
  overflow: hidden; overscroll-behavior: none;
  background: #07060a;
  touch-action: none;
  -webkit-user-select: none; user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}
canvas#game { display: block; width: 100%; height: 100%; }
```

JS 側の iOS 対策（`src/main.js`）:
- `document.addEventListener('gesturestart', e => e.preventDefault())` （ピンチズーム抑止）
- `touchmove` を `{passive:false}` で `preventDefault()`（バウンススクロール抑止）
- ダブルタップズーム抑止: `touch-action:none` + 300ms 以内の2回目 `touchend` を `preventDefault()`
- `resize` / `orientationchange` / `visualViewport.resize` をまとめて 100ms デバウンスして `relayout()`
- セーフエリア: CSS の `env(safe-area-inset-*)` を `getComputedStyle` で読み、`engine.insets` に反映。
  HUD 相当の要素（ミュートアイコン）は必ず inset 内に置く。

### 5.3 座標系とレイアウト戦略

**方針: 「セーフ・デザイン・エリア」＋アンカー方式**（固定解像度のスケーリングは縦横比が違いすぎて破綻するため不採用）。

- キャンバスの実ピクセル: `canvas.width = cssW * dpr`, `dpr = Math.min(devicePixelRatio, 3)`。
  `ctx.setTransform(dpr,0,0,dpr,0,0)` を毎フレーム先頭で。以降は**CSSピクセル単位で描く**。
- **論理単位 `S`（スケール基準）** を定義する:
  ```js
  const S = Math.min(w, h);          // 短辺
  const L = Math.max(w, h);          // 長辺
  const isPortrait = h >= w;
  ```
  **すべてのサイズ・距離・許容半径は `S` の比率で書く**（例: `0.14 * S`）。フォントは使わない。
- **アンカー**: 各シーンは `layout(w, h)` で自分のレイアウトオブジェクトを再計算する。
  ヘルパ: `anchor(ax, ay, dx, dy)` → `{ x: ax*w + dx*S, y: ay*h + dy*S }`
- **カメラ**は world→screen の 2D 変換（`x, y, zoom, rotation, shakeX, shakeY`）。
  ワールドは**自分の設計空間（幅 1000 x 高 1000 の仮想ワールド単位）**で描いてよく、
  カメラが `fit` モード（`contain` / `cover`）で画面に合わせる。
  - **縦横対応の実質的な解**: 各ワールドは「**必ず見えるコア矩形（600x600）**」と
    「**見えたら嬉しい拡張領域**」を宣言する。カメラは常にコア矩形を包含する（`contain`）。
    横持ちでは左右に、縦持ちでは上下に拡張領域が見える。
  ```js
  camera.setFrame({ coreW: 600, coreH: 600, mode: 'contain' });
  ```
- **指の届く範囲**: 主要な操作対象は、縦持ちでは**画面下から 15%〜60%**、横持ちでは**下から 15%〜70%** の帯に置く。
  この帯を `engine.thumbZone(w,h)` として提供し、各ワールドはそれを使って配置する。

### 5.4 ファイル構成（オーナーシップ境界＝ファイル境界）

```
index.html
styles.css
src/
  main.js                 # ブートストラップ、engine生成、シーン登録
  core/
    engine.js             # Engine: RAF loop, dt clamp, canvas/dpr, resize, visibility, pause
    scene.js              # SceneManager + Scene基底 + 連続トランジション
    input.js              # PointerInput: 正規化されたpointerイベント、1本指ロック
    gestures.js           # GestureRecognizer: tap/longPress/drag/swipe/trace/circle
    audio.js              # AudioEngine: WebAudio合成SFX + speechSynthesis + unlock + mute
    tween.js              # Tween/easing/Timeline
    particles.js          # ParticleSystem（プール制）
    camera.js             # Camera2D（pan/zoom/shake/orbit/tilt/follow, setFrame）
    draw.js               # 描画ヘルパ（角丸、グロー、グラデ、星形、多角形、線の光）
    rng.js                # シード付き乱数（再現可能なQAのため）
    storage.js            # localStorage ラッパ（progress）
    palette.js            # 元素の色定義・スペクトル線データ（唯一の真実の源）
  scenes/
    hearth.js             # 炉ハブ
    spectroscope.js       # 分光器
  worlds/
    lithium.js
    copper.js
    sodium.js
    strontium.js
    barium.js
audio/                    # （任意・将来）事前収録音声を置く場所。無くても動く
tests/
  playwright.config.mjs   # devDependency のみ（実行時依存ではない）
  smoke.spec.mjs
  playthrough.spec.mjs
  helpers/gestures.mjs
```

> **ルール**: `src/worlds/*.js` は互いを import しない。`src/core/*` と `src/core/palette.js` のみに依存する。
> `src/core/*` は `worlds/`・`scenes/` を import しない（依存は一方向）。

### 5.5 中核インターフェース（厳守）

#### 5.5.1 Scene

```js
/**
 * @typedef {Object} Scene
 * @property {string} id
 * @property {(ctx: EnterContext) => void}   enter     // called once when scene becomes active
 * @property {() => void}                    exit      // cleanup: remove listeners, stop loops
 * @property {(dt: number) => void}          update    // dt in seconds, already clamped (<= 1/20)
 * @property {(g: CanvasRenderingContext2D) => void} draw
 * @property {(w: number, h: number) => void} layout   // css pixels; called on enter and on resize
 * @property {(p: Pointer) => void}          onPointerDown
 * @property {(p: Pointer) => void}          onPointerMove
 * @property {(p: Pointer) => void}          onPointerUp
 * @property {() => Object} [debugState]               // for window.__game
 * @property {() => Array<{id:string,x:number,y:number,r:number}>} [hitPoints] // for window.__game.hitPoints()
 */

/**
 * @typedef {Object} Pointer
 * @property {number} id       // pointerId
 * @property {number} x        // css px, canvas-relative
 * @property {number} y
 * @property {number} dx       // delta since last event
 * @property {number} dy
 * @property {number} t        // ms timestamp (performance.now)
 * @property {boolean} primary // true only for the locked single finger
 */
```

`EnterContext`:
```js
/**
 * @typedef {Object} EnterContext
 * @property {Engine}  engine
 * @property {Object}  handoff   // see 5.5.4; null if none
 * @property {Progress} progress // see 5.5.6
 * @property {(result: FinishResult) => void} finish  // call to leave the scene
 */
```

#### 5.5.2 Engine

```js
class Engine {
  constructor(canvas)
  get width()   // css px
  get height()  // css px
  get S()       // Math.min(width, height)
  get isPortrait()
  get insets()  // {top,right,bottom,left} safe-area in css px
  get dpr()
  get audio()   // AudioEngine
  get camera()  // Camera2D (shared; scenes may push/pop state)
  get particles() // ParticleSystem (shared pool)
  get input()   // PointerInput
  get gestures()// GestureRecognizer factory
  get scenes()  // SceneManager
  get rng()     // seeded RNG
  start()
  pause() / resume()
  thumbZone()   // {x,y,w,h} comfortable one-finger region
}
```

**ループ規約**:
```js
const now = performance.now();
let dt = (now - last) / 1000;
last = now;
dt = Math.min(dt, 1/20);        // clamp: タブ復帰でワープさせない
scene.update(dt);
ctx.setTransform(dpr,0,0,dpr,0,0);
ctx.clearRect(0,0,w,h);
scene.draw(ctx);
```
`visibilitychange` で `hidden` → `pause()`（RAF停止 + audio suspend）、復帰時 `last = performance.now()`。

#### 5.5.3 SceneManager と「カットのない」トランジション

```js
class SceneManager {
  register(id, factory)          // factory: () => Scene
  async go(id, { handoff, transition })  // transition: 'continuous' | 'none'
  get currentId()
}
```

**連続トランジションの仕組み（画面カットを作らないための中核）**:
- `transition: 'continuous'` のとき、**両シーンが同時に生きる期間（overlap）**を設ける。
  1. 旧シーンが `handoff` を作る（§5.5.4）。
  2. 新シーンを生成し `layout()` → `enter(ctx)` を呼ぶ。`ctx.handoff` に上記が入る。
  3. **overlap 期間（既定 1.2s）**は `draw` を「旧 → 新」の順で両方呼ぶ。
     新シーンは `handoff.progress`（0→1）を見て、自分の背景の不透明度・スケールを立ち上げる。
  4. 旧シーンは `handoff.progress` に応じて自分をフェード/縮小させる（**黒画面を挟まない**）。
  5. overlap 終了で旧シーンの `exit()`。
- **共有される連続要素**: `camera`（引き継ぐ）、`particles`（粒子は消さずに生き続ける）、
  炎の色（`handoff.flameColor` が新シーンの ambient light 初期値になる）。

#### 5.5.4 Handoff オブジェクト（炉 → ワールド）

```js
/**
 * @typedef {Object} Handoff
 * @property {string}  elementId          // 'lithium' | ...
 * @property {string}  flameColor         // css color, e.g. '#ff2f3a'
 * @property {string}  glowColor          // lighter variant for ambient light
 * @property {{x:number,y:number}} origin // css px: where the flame/fragment was on screen
 * @property {Array<{x:number,y:number,vx:number,vy:number,r:number,life:number}>} particles
 *            // live particle snapshot so the world can continue them, not restart them
 * @property {number}  cameraZoom         // camera zoom at the moment of handoff
 * @property {number}  progress           // 0..1, updated by SceneManager during overlap (read-only to scenes)
 * @property {number}  startedAt          // performance.now() ms
 */
```

ワールドは `enter()` で:
- `handoff.particles` を**自分のパーティクル系にそのまま注入**する（座標は css px のまま）。
- `handoff.origin` を「かけらが現れる場所」として使う（＝炎のあった位置から出てくる）。
- `handoff.flameColor` を**ワールドの環境光色の初期値**にし、1.5s かけてそのワールドの光色へ寄せる。

#### 5.5.5 World モジュール契約

```js
// src/worlds/lithium.js
export default {
  id: 'lithium',
  labelJa: 'リチウム',          // 音声用。画面には絶対に描画しない
  flameColor: '#ff2a33',
  glowColor:  '#ff7a6a',
  sampleShape: 'pebble',        // hearth が試料皿を描くのに使う
  spectrum: [                   // 分光器シーンが使う（nm, 強度0..1）
    { nm: 670.8, i: 1.00 },
    { nm: 610.4, i: 0.35 },
  ],
  coreFrame: { w: 600, h: 600 },
  /**
   * @param {Engine} engine
   * @param {Handoff} handoff
   * @param {(r: FinishResult) => void} finish
   * @returns {Scene}
   */
  createWorld(engine, handoff, finish) { /* returns a Scene object */ }
};
```

**FinishResult**:
```js
/**
 * @typedef {Object} FinishResult
 * @property {string} worldId
 * @property {boolean} completed            // true when the world change happened
 * @property {Handoff} [returnHandoff]      // for the continuous pull-back into the shelf
 * @property {{x:number,y:number}} shelfAnchorHint // where the mini-diorama should land
 */
```
ワールドは**自分でハブへ戻らない**。`finish(result)` を呼ぶだけ。遷移は SceneManager の責務。

#### 5.5.6 Progress / storage

```js
// src/core/storage.js
/**
 * @typedef {Object} Progress
 * @property {Object<string, number>} plays   // elementId -> 完了回数
 * @property {boolean} spectroscopeUnlocked
 * @property {Object<string, boolean>} spectraSeen // elementId -> 分光器で見たか
 * @property {boolean} muted
 * @property {number} version
 */
export function loadProgress(): Progress
export function saveProgress(p: Progress): void
export function markWorldDone(elementId: string): Progress   // plays++ と unlock 判定を同時に
export function resetProgress(): void
```
- キー: `flametest.progress.v1`
- **分光器アンロック条件**: `plays.lithium > 0 && plays.strontium > 0`
- localStorage が使えない環境（プライベートモード等）では**メモリ内フォールバック**に落とす（例外を投げない）。

#### 5.5.7 GestureRecognizer API

```js
// src/core/gestures.js
export function createGestures(engine, config) // returns Recognizer

/**
 * Recognizer methods — すべて宣言的に「認識器」を登録する。
 * それぞれ handle を返し、handle.cancel() / handle.enabled = false で制御。
 */
rec.onTap(hitTest, cb, opts)
// hitTest: (p:Pointer) => boolean | 'any'
// opts: { maxMoveRatio = 0.06,   // S比。これ以内の移動ならタップ扱い（4歳児は動く）
//         maxDurationMs = 700 }  // 長めに取る
// cb: (p) => void

rec.onLongPress(hitTest, { onStart, onHold, onRelease, onCancel }, opts)
// opts: { minMs = 300,           // 300ms 超えたら成立
//         maxMs = 2000,          // 自動成立して onRelease(auto=true)
//         moveToleranceRatio = 0.25 }  // 大きく動いてもキャンセルしない
// onHold(t01, p): t01 = 0..1 の充填率（minMs..maxMs 間の正規化）

rec.onDrag(hitTest, { onStart, onMove, onEnd }, opts)
// opts: { snapTargets: [{x,y,r}], // r は S比。到達でスナップ
//         returnOnRelease = true, // 目標外で離したら元へ戻す
//         hitPaddingRatio = 0.6 } // 当たり判定を見た目の1.6倍にする

rec.onSwipe(hitTest, cb, opts)
// opts: { minDistRatio = 0.15, maxMs = 800, direction: 'any'|'up'|'down'|'left'|'right' }
// cb: ({dir, dist, vx, vy})

rec.onTrace(path, { onProgress, onComplete, onDeviate }, opts)
// path: [{x,y}, ...]  （css px。layout() で再生成すること）
// opts: { toleranceRatio = 0.10,     // 垂直距離の許容（S比）
//         autoCompleteAt = 0.5,      // これ以上進んで離したら自動完走
//         monotonic = true,          // 後退では進捗を減らさない
//         resampleStep = 8 }         // パスの再サンプル間隔(px)
// onProgress(t01, nearestPoint, isOnPath)
// 実装: パスを等間隔リサンプル → 指の最近傍インデックスを取り、
//       進捗 = max(進捗, index/len)。垂直距離 > tolerance でも進捗は進める（isOnPath=false を渡すだけ）。

rec.onCircle(center, { onProgress, onComplete }, opts)
// center: {x,y} （css px）
// opts: { turnsRequired = 2.5,
//         direction = 'either',      // 'cw' | 'ccw' | 'either'
//         minRadiusRatio = 0.02,     // これ未満の半径では角度を積まない（中心付近のノイズ除去）
//         inertia = 0.92,            // 指を離した後の減衰
//         accumulateAbs = true }     // 逆回転でも |Δθ| を加算
// onProgress(turns01, angularVelocity)
// 実装: atan2 差分を -PI..PI に正規化して累積。sign 反転は許容。
```

**共通の寛容規約（全認識器）**:
- 同時に有効な pointer は **1本だけ**（`input.js` が最初の pointerId をロックし、他は無視）。
- `pointercancel` は `pointerup` と同じに扱う（iOS はスクロール判定で cancel を投げる）。
- ヒット判定は常に `hitPaddingRatio` 分だけ拡大。
- **どの認識器も「失敗」を通知しない**。成立しなかった＝何も起きなかった、だけ。

#### 5.5.8 Camera2D

```js
class Camera2D {
  x, y, zoom, rotation
  setFrame({coreW, coreH, mode})   // 'contain' で縦横両対応
  worldToScreen(x, y) / screenToWorld(x, y)
  apply(g) / restore(g)
  panTo(x, y, dur, ease)
  zoomTo(z, dur, ease)
  follow(targetFn, { lead, damping, screenAnchor })  // ローバー追従用
  shake(amplitudeRatio, dur)                          // 花火用
  orbit(centerX, centerY, angle, radius)              // バリウム用
  tiltTo(deg, dur)                                    // ナトリウム/ストロンチウム用（縦方向の擬似ティルト）
}
```
※「ティルト」は真の3Dではなく、**y方向のスケール＋縦方向パン＋遠近を模した縦スキュー**で表現する。

#### 5.5.9 描画ヘルパ（`draw.js`）
`roundRect`, `glowCircle(g,x,y,r,color,intensity)`, `radialFlood(g,cx,cy,r,color)`,
`star(g,x,y,rOuter,rInner,points)`, `polygon`, `glowLine(g,pts,width,color)`,
`sparkTrail`, `applyAmbient(g, color, alpha)`（画面全体に `screen` 合成で色をかける）。

**パフォーマンス規約**:
- `ctx.filter` は iOS で遅いので**使用禁止**。グローは多重描画 + `globalCompositeOperation='lighter'` で作る。
- パーティクルは**プール制**、同時上限 **600**。超過分は最古を再利用。
- 毎フレームの `createRadialGradient` を避け、**レイアウト時にキャッシュ**する。
- 目標 **60fps / iPhone 12 相当**。`dpr` は 3 で頭打ち。

### 5.10 デバッグフック（QA 必須）

```js
window.__game = {
  version: '1.0.0',
  get sceneId()            { /* 現在のシーンid: 'hearth' | 'lithium' | ... | 'spectroscope' */ },
  get state()              { /* シーンの debugState(): 進捗・フェーズ名など */ },
  get progress()           { /* Progress オブジェクト */ },
  get ready()              { /* boolean: 初期化完了 & 最初のフレーム描画済み */ },
  get busy()               { /* boolean: トランジション中 */ },
  goto(sceneId, opts)      { /* 任意シーンへ即ジャンプ。テスト用。handoff は合成 */ },
  setProgress(partial)     { /* Progress を上書き（分光器アンロックのテスト用） */ },
  resetProgress()          {},
  complete()               { /* 現在のワールドを即完了させる */ },
  setMuted(bool)           {},
  hitPoints()              { /* [{id, x, y, r}] 現在触れるべき対象の座標（CSS px）。テストの指はここを突く */ },
  lastVoice: null,         // 最後に発話した elementId（音声の発火検証用）
  frameCount: 0,
  seed(n)                  { /* RNG を固定して決定論的にする */ }
};
```
`hitPoints()` が**テストの生命線**。各シーンが「今押してほしい場所」を返すことで、
Playwright 側は見た目に依存せずジェスチャを合成できる。

---

## 6. テスト / QA 計画

### 6.1 ツール
- **Playwright**（devDependency のみ。ランタイム依存ではない）。
- 配信: `npx http-server -p 8080 -c-1`（キャッシュ無効）。

### 6.2 デバイスマトリクス

| 名前 | viewport | DPR | touch |
|---|---|---|---|
| iPhone15-portrait | 393 x 852 | 3 | yes |
| iPhone15-landscape | 852 x 393 | 3 | yes |
| iPad-portrait | 820 x 1180 | 2 | yes |
| iPad-landscape | 1180 x 820 | 2 | yes |

`hasTouch: true`, `isMobile: true`, `deviceScaleFactor` を設定。
Playwright の **CDP touch emulation**（`page.touchscreen.tap` / 低レベル `Input.dispatchTouchEvent`）を使う。

### 6.3 ジェスチャヘルパ（`tests/helpers/gestures.mjs`）

```js
export async function tap(page, x, y)
export async function longPress(page, x, y, ms)
export async function drag(page, from, to, { steps = 24, jitter = 6, ms = 700 })
// jitter: 4歳児の手ブレを再現。±jitter px のノイズを毎ステップ加える
export async function trace(page, pathPoints, { steps = 40, jitter = 14, ms = 1200 })
// わざと理想パスから外す。許容ロジックの検証になる
export async function circle(page, center, { radiusPx, turns = 3, steps = 90, jitter = 10 })
export async function sloppyTap(page, x, y)  // 押下→少し動く→離す（タップ扱いされるべき）
```

### 6.4 テストスイート

**A. smoke.spec.mjs（4デバイス）**
1. 起動して `__game.ready === true` になる（5s以内）。
2. `document.body.scrollHeight === window.innerHeight`（スクロールしない）。
3. canvas が viewport を完全に覆う（`getBoundingClientRect` が viewport と一致、±1px）。
4. 縦→横へ `setViewportSize` して 1s 後、`hitPoints()` がすべて viewport 内にある
   （＝**レイアウトが画面外に要素を出していない**。これが縦横対応の自動検証）。
5. セーフエリア確認: すべての `hitPoints()` が上下左右 inset + 8px の内側にある。
6. コンソールエラー 0件。
7. 各シーンで 3秒回して **平均フレーム時間 < 20ms**（`__game.frameCount` の差分で計測）。

**B. playthrough.spec.mjs（「4歳児」再現プレイ）**
各ワールドについて:
1. `__game.resetProgress()` → `__game.goto('hearth')`。
2. `hitPoints()` から当該試料皿の座標を取り、**わざと雑に**ドラッグ（jitter 大）して炎へ。
3. トランジション完了を待つ（`__game.busy === false`）。
4. `__game.sceneId === '<element>'` を検証。
5. `hitPoints()` に従って**そのワールド固有のジェスチャ**を、**故意に下手に**実行:
   - lithium: drag（目標の 40px 手前で離す → 自動スナップされること）
   - copper: trace（理想パスから最大 60px 外れる → それでも完走できること）
   - sodium: sloppyTap × 5（毎回ずれる）
   - strontium: longPress 250ms（不成立）→ その後 longPress 900ms（成立）
   - barium: circle（半径バラバラ、途中で逆回転を2回混ぜる → それでも完了すること）
6. `__game.state.phase === 'complete'` を待つ（**最大 60s**。これが「30〜60秒」の上限検証も兼ねる）。
7. `__game.lastVoice === '<element>'` を検証（**音声が最高潮のタイミングで1回だけ**発火）。
8. 自動でハブへ戻る → `sceneId === 'hearth'`、`progress.plays[element] === 1`。

**C. spectroscope.spec.mjs**
1. `__game.setProgress({plays:{lithium:1, strontium:1}})` → `goto('hearth')`。
2. 分光器の hitPoint が存在する（アンロック）。
3. リチウムを炎に入れて分光器をドラッグ → `sceneId === 'spectroscope'`、
   `state.spectrumId === 'lithium'`、`state.lineCount === 2`。
4. ストロンチウムでは `lineCount >= 5` かつ `state.hasBlueLine === true`。
5. 両方見たあと `progress.spectraSeen` が両方 true。

**D. no-text.spec.mjs（憲法の自動検証）**
1. DOM に canvas と script 以外の可視テキストノードが**存在しない**。
2. `CanvasRenderingContext2D.prototype.fillText` / `strokeText` を**テスト起動時にパッチして呼び出しを記録**し、
   フルプレイスルー後に **呼び出し回数 0** をアサートする。
   → 「文字を出さない」が**機械的に保証される**。これは本作で最も重要なテスト。

**E. screenshots.spec.mjs**
各ワールドの主要フェーズ（未完成 / 操作中 / 世界変化直後 / 帰還）で
`page.screenshot()` を `tests/__screens__/{device}/{world}-{phase}.png` に保存。
`__game.seed(12345)` で乱数を固定し差分が安定するようにする。人間がレビューする用（自動比較はしない）。

### 6.5 手動チェックリスト（実機・自動化できないもの）
- [ ] ダブルタップでズームしない（iOS Safari 実機）
- [ ] 画面端から引っ張ってもバウンスしない
- [ ] ホームバー付近を触っても誤動作しない（safe-area）
- [ ] ホームに戻って復帰 → 音が戻る、アニメが飛ばない
- [ ] 音声（`speechSynthesis`）が日本語で読める（iOS の Kyoko 等）
- [ ] **音を切っても、大人が見て意味が通る**
- [ ] **実際の4歳児が、何も説明されずに最初の試料を炎に入れられるか**（最重要・被験者3名以上）

---

## 7. 作業分解（並行実装のための割り当て）

**ファイル所有権 = コンフリクト回避の唯一のルール。他人のファイルを編集しない。**

### (a) Core Engine + Hearth + Transitions 【担当A / 最初に着手・他はこれを待つ】
- 所有: `index.html`, `styles.css`, `src/main.js`, `src/core/**`, `src/scenes/hearth.js`
- 成果物:
  1. `engine.js` / `scene.js` / `input.js` / `gestures.js` / `camera.js` / `draw.js` / `tween.js` / `particles.js` / `storage.js` / `palette.js` / `audio.js` / `rng.js`
  2. **`palette.js` に5元素の色・スペクトルデータを確定させる**（全員がここを参照する）
  3. 炉シーン（試料皿5つ、ヒノコ、炎、白金線ループ、棚、ミュートアイコン）
  4. 連続トランジションと `handoff`
  5. `window.__game` デバッグフック
- **マイルストーン M1（他タスクのブロッカー）**: `core/` のシグネチャ確定 + ダミーワールド1つへの遷移が動く。
- 受け入れ: smoke.spec.mjs 全緑、no-text.spec.mjs 緑。

### (b) リチウム世界 【担当B】
- 所有: `src/worlds/lithium.js`
- 受け入れ: playthrough(lithium) 緑、30〜60秒、`lastVoice==='lithium'`。

### (c) 銅世界 【担当C】
- 所有: `src/worlds/copper.js`
- 受け入れ: 理想パスから 60px ずれても完走できること。

### (d) ナトリウム世界 【担当D】
- 所有: `src/worlds/sodium.js`
- 受け入れ: 2段構成が合計 60秒以内。前半で音声が鳴らないこと。

### (e) ストロンチウム世界 【担当E】
- 所有: `src/worlds/strontium.js`
- 受け入れ: 250ms 押下では発射しない / 900ms で発射 / 2.0s で自動発射。フラッシュ輝度上限（露出15%）。

### (f) バリウム世界 【担当F】
- 所有: `src/worlds/barium.js`
- 受け入れ: 逆回転を混ぜても、半径がバラバラでも 2.5回転で完了すること。

### (g) 分光器 【担当G】
- 所有: `src/scenes/spectroscope.js`
- 炉側の分光器オブジェクト表示・ドラッグは **A が実装**。G は「分光器シーンに入ってから」を担当。
- 受け入れ: spectroscope.spec.mjs 緑。文字描画ゼロ。

### (h) QA ハーネス 【担当H】
- 所有: `tests/**`, `package.json`（devDeps のみ）, `.github/workflows/pages.yml`

### 依存グラフ
```
A(M1) ──┬─> B, C, D, E, F  （並行）
        └─> G（A の炉側フック完了後）
H ──────> 全期間並行
```

### 共有ファイルの扱い
- `src/core/palette.js`・`index.html`・`src/main.js` は **A のみが編集**。
- A が最初に5ワールドを**スタブとして登録済み**にする（単色背景＋即 finish()）。各担当は自分のファイルを差し替えるだけ。

---

## 8. 将来拡張（v1 では実装しない）

- 年長〜小学生モード: バリウム造影、より正確なスペクトル、元素記号の導入。
- 6番目以降（カリウム紫、カルシウム橙）の追加。
- 事前収録音声（プロの声優 or 保護者の声の録音機能）。
- 棚のミニジオラマをタップすると、そのワールドへ直接行けるショートカット（v1 では意図的に付けない）。

---

## 9. 却下した案（記録として）

| 案 | 却下理由 |
|---|---|
| 炎の色を選ぶメニュー | 「色を選ぶ」＝色が主役になる。本作の主役は世界。 |
| 「どっちの元素？」クイズ | 失敗の概念が入る。憲法4に反する。 |
| チュートリアルの指アイコン | 憲法2に反する。世界の側で誘えるなら説明しない。 |
| 全ワールド共通のミニゲームを色変えで5本 | クライアント要求に明示的に反する。世界は強く分岐させる。 |
| バリウム＝造影剤（飲む） | 4歳児に誤飲連想。色と結びつかない。 |
| ナトリウム金属 → 塩 の変身演出 | 科学的に誤り。「所在の案内」に置き換えた。 |
| 花火の導火線に火をつける動作 | 現実の模倣リスク。抽象的な「光を溜める」に置換。 |
