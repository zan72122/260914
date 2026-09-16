#version 300 es
// flame.frag.glsl — 手続き炎（『ほんとうの火』M1）
//
// 設計の約束:
//  1. このシェーダは色を「決めない」。青いガス炎の色も元素の色も煤の色も、
//     すべて color.ts が発光線 / プランク則 から算出して uniform で渡す。
//     シェーダがやるのは「形・揺らぎ・その色の置き場所」だけ。
//     色を見栄えで足したり引いたりするコードをここに書かないこと。
//  2. 時間は uTime（GameClock 由来の秒）。壁時計・フレーム番号は使わない（PLAN §4）。
//     同じ uTime なら常に同じ絵になる（再現性。PLAN §5.5）。
//  3. 低解像度 FBO に描いて拡大する前提（PLAN §7）。Filter.resolution を 1 未満にする。
//     そのため細かすぎるディテールは入れない。
//
// 座標系: vTextureCoord は炎の矩形の 0..1。
//         下端（バーナー口）が y=0、上端が y=1 になるよう内部で反転する。
//
// uniform:
//   uTime          [s]   GameClock の秒。
//   uElementColor  linear sRGB  元素単体の炎色（color.ts の elementFlameColor().linear）。
//   uBaseColor     linear sRGB  素の青いガス炎（外炎）の色。
//   uInnerColor    linear sRGB  内炎の色（C2 Swan 寄りの青緑）。
//   uSootColor     linear sRGB  煤の輝点（約 1600 K の黒体）の色。
//   uMix           0..1  0 = 素の青いガス炎, 1 = 元素色が支配。
//   uIntensity     0..   炎全体の強さ。1 が基準。
//   uResolution    px    炎矩形のピクセルサイズ。縦横比の補正に使う。
//   uSeed                シナリオ既定 seed 由来の定数（PLAN §5.5）。
//   uInputSize / uOutputFrame   PixiJS の Filter 実行系が埋める。
//                        vTextureCoord は入力テクスチャ基準なので、これで 0..1 に直す。
//
// 出力について:
//   層は「色 × 覆っている割合」の加重平均で混ぜ、飽和で色相が曲がらないようにする。
//   明るさは alpha（＝炎の濃さ）が持つ。最後に sRGB 伝達関数を掛けて表示値にし、
//   PixiJS の規約に合わせて alpha を先に掛けた（premultiplied）形で出す。

precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;

uniform float uTime;
uniform vec3 uElementColor;
uniform vec3 uBaseColor;
uniform vec3 uInnerColor;
uniform vec3 uSootColor;
uniform float uMix;
uniform float uIntensity;
uniform vec2 uResolution;
uniform float uSeed;

// PixiJS の Filter 実行系が埋める。vTextureCoord を炎の矩形の 0..1 に直すために使う。
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;

// 線形光 → 表示 sRGB。色を作る操作ではなく、表示装置の伝達関数を掛けるだけ。
float encodeSRGB(float c) {
    float v = clamp(c, 0.0, 1.0);
    return v <= 0.0031308 ? 12.92 * v : 1.055 * pow(v, 1.0 / 2.4) - 0.055;
}

// ---------------------------------------------------------------------------
// ノイズ
// ---------------------------------------------------------------------------

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// 4 オクターブで十分。低解像度 FBO に描くのでこれ以上刻んでも見えない。
float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
        sum += amp * valueNoise(p);
        p *= 2.02;
        p.y -= 0.37;
        amp *= 0.5;
    }
    return sum;
}

// ---------------------------------------------------------------------------
// 炎の形
// ---------------------------------------------------------------------------

// バーナーの上に立つ炎。y=0 が口、y=1 が先端。
// 外炎: 口の少し上で最も太く、先端へ細って千切れる。
// 内炎: 口のすぐ上の小さく安定した円錐（予混合炎の還元炎）。

float outerWidth(float y) {
    // 口のすぐ上でわずかに膨らみ、上へ細る。
    float grow = smoothstep(0.0, 0.10, y);
    float taper = pow(max(0.0, 1.0 - y), 0.62);
    return 0.30 * grow * taper + 0.035;
}

float innerWidth(float y) {
    float t = max(0.0, 1.0 - y / 0.42);
    return 0.125 * pow(t, 0.75);
}

void main(void) {
    // vTextureCoord は入力テクスチャ基準（Pixi の FBO は要求より大きいことがある）。
    // 出力フレームの大きさで割って、炎の矩形そのものの 0..1 に直す。
    vec2 uv = vTextureCoord * uInputSize.xy / max(uOutputFrame.zw, vec2(1.0));

    float y = 1.0 - uv.y;                 // 下から上へ
    float aspect = max(0.001, uResolution.x / max(1.0, uResolution.y));
    float x = (uv.x - 0.5) * aspect;

    // 上昇流。uTime に比例してノイズ場を下へ流すと、模様は上へ流れる。
    float rise = uTime * 0.85 + uSeed;

    // 大きな揺らぎ（炎全体がゆっくり傾く）と細かい揺らぎ（縁の乱れ）。
    float slow = fbm(vec2(x * 1.3, y * 1.1 - rise * 0.45) + uSeed * 0.7);
    float fast = fbm(vec2(x * 5.5, y * 4.0 - rise * 1.6) + uSeed * 1.3);

    // 上ほど大きく揺れる。根元は口に固定されるのでほぼ動かない。
    float sway = (slow - 0.5) * 0.22 * smoothstep(0.0, 0.85, y)
               + (fast - 0.5) * 0.07 * smoothstep(0.05, 1.0, y);
    float xw = x + sway;

    // --- 外炎 -------------------------------------------------------------
    float wo = outerWidth(y);
    float outer = 1.0 - smoothstep(wo * 0.35, wo, abs(xw));
    outer *= smoothstep(-0.03, 0.05, y);              // 口の下は無い
    outer *= 1.0 - smoothstep(0.55, 1.0, y);          // 先端で消える
    // 上へ行くほどノイズで千切れる。
    float breakup = mix(1.0, smoothstep(0.18, 0.72, fast), smoothstep(0.30, 0.95, y));
    outer *= breakup;

    // --- 内炎 -------------------------------------------------------------
    float wi = innerWidth(y);
    float inner = 1.0 - smoothstep(wi * 0.30, wi, abs(xw * 0.85));
    inner *= smoothstep(-0.01, 0.04, y);
    inner *= 1.0 - smoothstep(0.26, 0.44, y);
    inner *= 0.85 + 0.15 * slow;                      // わずかに息をする

    // --- 煤・輝点 ---------------------------------------------------------
    // 上部で疎らに立ち上がる粒。セルごとに乱数で位置と寿命を決める。
    float spark = 0.0;
    {
        vec2 cell = vec2(x * 9.0, y * 5.0 - rise * 1.15);
        vec2 id = floor(cell);
        vec2 fr = fract(cell) - 0.5;
        float r = hash21(id + uSeed);
        // 4 セルに 1 つ程度だけ点す。
        float alive = step(0.80, r);
        float d = length(fr * vec2(1.0, 1.6));
        spark = alive * (1.0 - smoothstep(0.03, 0.22, d));
        // 炎の内側にだけ出す。先端付近で最も目立つ。
        spark *= smoothstep(wo * 1.05, wo * 0.2, abs(xw));
        spark *= smoothstep(0.18, 0.55, y) * (1.0 - smoothstep(0.75, 1.0, y));
    }

    // --- 色 ---------------------------------------------------------------
    // 色は uniform で与えられたものを線形光で足すだけ。
    // 線形 sRGB での加算 = 実際の光の加算なので、物理的に正しい合成。
    float mixAmount = clamp(uMix, 0.0, 1.0);

    vec3 outerColor = mix(uBaseColor, uElementColor, mixAmount);
    // 材料が入れば炎全体がその色になる（PLAN §3.3）。内炎も同じだけ染まる。
    // 何も入っていないとき（mixAmount = 0）だけ、内炎は自分の色を保つ。
    vec3 innerColor = mix(uInnerColor, uElementColor, mixAmount);

    // 根元の淡い光（口まわりの散乱）。色は外炎と同じものを使う。
    float glow = exp(-abs(xw) * 6.0) * exp(-y * 3.2) * 0.22;

    // 各層の「覆っている割合」。色はこれを重みにした加重平均で決める。
    // 足し込みだと重なった所で成分が 1 を超えて切り落とされ、色相が曲がる。
    float wOuter = outer;
    float wInner = inner * 0.9;
    float wSpark = spark * 1.4;
    float wGlow = glow;
    float wSum = wOuter + wInner + wSpark + wGlow;

    vec3 col = vec3(0.0);
    if (wSum > 0.0) {
        col = (outerColor * (wOuter + wGlow) + innerColor * wInner + uSootColor * wSpark) / wSum;
    }

    // 明るさは炎の濃さ（alpha）が持つ。芯では 1 になり、縁でなめらかに消える。
    float alpha = clamp(wSum * max(0.0, uIntensity), 0.0, 1.0);

    // 表示 sRGB へ。PixiJS の合成規約に合わせて alpha を先に掛ける。
    vec3 shown = vec3(encodeSRGB(col.r), encodeSRGB(col.g), encodeSRGB(col.b));
    finalColor = vec4(shown * alpha, alpha);
}
