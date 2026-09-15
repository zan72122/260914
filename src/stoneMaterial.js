import * as THREE from 'three';

const COMMON = /* glsl */`
vec3 perpOf(vec3 a){
  vec3 up = abs(a.y) < 0.9 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0);
  return normalize(cross(a, up));
}
`;

const STONE_VERT = /* glsl */`
attribute vec3 aRough;
attribute vec3 aCab;
attribute vec3 aWin;
attribute vec3 nRough;
attribute vec3 nCab;
attribute vec3 nWin;
attribute vec3 aMask;
attribute float aProt;

uniform vec3 uCAxis;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec3 vMask;
varying vec3 vCAxisW;
varying float vProt;
varying vec3 vSmoothN;

void main(){
  vCAxisW = normalize(mat3(modelMatrix) * normalize(uCAxis));
  float g   = aMask.x;
  float win = aMask.z;
  float wf  = win * 0.8 * (1.0 - g);

  vec3 p = mix(aRough, aWin, wf);
  p = mix(p, aCab, g);
  vec3 n = normalize(mix(mix(nRough, nWin, wf), nCab, g));

  vLocal = p;
  vMask  = aMask;
  vProt  = aProt;

  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld  = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * n);
  // 絹（ルチル針）は石の内部にあるので、帯の計算には表面の凸凹を含まない
  // 滑らかな法線を使う。nCab（カボション形の法線）が無ければ位置方向で代用。
  vec3 sm = (dot(nCab, nCab) > 1e-6) ? normalize(nCab) : normalize(aCab);
  vSmoothN = normalize(mat3(modelMatrix) * sm);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const STONE_FRAG = /* glsl */`
precision highp float;

uniform vec3  uBaseColor;
uniform vec3  uDepthColor;
uniform vec3  uCAxis;
uniform vec3  uLightDir;
uniform vec3  uLightDir2;
uniform vec3  uRimDir;
uniform vec3  uHintDir;
uniform float uTime;
uniform float uSilkDensity;
uniform float uRays;
uniform float uSharpness;
uniform float uAlign;
uniform float uStarForm;    // 0 = 原石の光帯 / 1 = 完成した六条星
uniform float uStarBoost;
uniform float uProtGlow;    // 出っ張りの発光（Stage2 の誘い）
uniform float uGrindCap;    // その工程で削れる上限（出っ張りの発光はこれを基準に消える）
uniform float uPulse;       // 曇りの下で脈打つ光（Stage4 の誘い）
uniform float uGlow;        // 良い向きでふわっと脈打つ（Stage0/1）
uniform float uHintStrength;// 薄皮ヒント（Stage0 の誘い）
uniform float uExposure;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec3 vMask;
varying vec3 vCAxisW;
varying float vProt;
varying vec3 vSmoothN;

${COMMON}

// ---- テクスチャ無しの解析的な環境（上=空色 / 下=作業台 + 細長い窓 3 枚） ----
// R = reflect(-V, N) をこの「部屋」に投げて色を拾う。研磨が進むほど写り込みが鋭くなる。
vec3 envSample(vec3 R, float smoothness){
  float h = clamp(R.y, -1.0, 1.0);
  vec3 sky    = vec3(0.34, 0.47, 0.70);   // 上方の明るい空色
  vec3 horiz  = vec3(0.11, 0.15, 0.24);
  vec3 bench  = vec3(0.028, 0.036, 0.055); // 下方の暗い作業台
  vec3 c = mix(horiz, sky, smoothstep(-0.05, 0.85, h));
  c = mix(c, bench, smoothstep(-0.02, -0.55, h));
  c *= 0.62;

  // 窓（横に細長い光源）。smoothness が上がるほど輪郭が締まる
  float az = atan(R.z, R.x);
  float k = mix(0.42, 1.7, smoothness);
  float w1 = pow(exp(-pow((h - 0.58) / 0.13, 2.0)) * exp(-pow((az - 0.85) / 0.95, 2.0)), k);
  float w2 = pow(exp(-pow((h - 0.24) / 0.075, 2.0)) * exp(-pow((az + 2.05) / 0.62, 2.0)), k);
  float w3 = pow(exp(-pow((h + 0.06) / 0.055, 2.0)) * exp(-pow((az - 2.75) / 0.45, 2.0)), k);
  vec3 winCol = vec3(0.90, 0.945, 1.0);   // 少し冷たい白（暖色が飽和して橙に転ばないように）
  c += winCol * (w1 * 1.15 + w2 * 0.72 + w3 * 0.46);
  return c;
}

void main(){
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(uLightDir);
  vec3 L2 = normalize(uLightDir2);

  float grind = vMask.x;
  float pol   = vMask.y;
  float win   = vMask.z;

  // 窓は「先に」鏡面になる。研磨後は全面が鏡面。
  float smoothness = clamp(max(pol, win * 0.85 * (1.0 - grind * 0.35)), 0.0, 1.0);
  float roughness  = mix(1.0, 0.05, smoothness);

  float ndv  = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 4.0);

  vec3 cA = normalize(uCAxis);
  vec3 t1 = perpOf(cA);
  vec3 t2 = cross(cA, t1);

  // ---- 内部の絹（ルチル針・60度 3 方向） ----
  vec2 q = vec2(dot(vLocal, t1), dot(vLocal, t2));
  float hAx = dot(vLocal, cA);
  float silk = 0.0;
  for (int k = 0; k < 3; k++){
    float a = float(k) * 1.04719755;
    vec2 d = vec2(-sin(a), cos(a));
    float v = 0.5 + 0.5 * sin(dot(q, d) * (88.0 + 64.0 * uSilkDensity) + hAx * 6.0);
    silk = max(silk, pow(v, 9.0));
  }

  // ---- 本体色（深度による内側の濃い青 + 疑似サブサーフェス） ----
  vec3 body = mix(uDepthColor, uBaseColor, 0.06 + 0.52 * ndv * ndv) * 0.94;
  float sss = pow(clamp(dot(-N, L) * 0.5 + 0.5, 0.0, 1.0), 2.4);
  body += uBaseColor * sss * 0.34 * (0.30 + 0.70 * smoothness);
  body += mix(uBaseColor, vec3(1.0), 0.35) * silk * 0.016 * (0.25 + 0.75 * smoothness);

  // 窓からは内部がよく見える
  vec3 inner = mix(uDepthColor, uBaseColor, 0.45) + uBaseColor * silk * 0.30;
  body = mix(body, inner, win * (1.0 - grind) * 0.75);

  // ---- 表面の皮（原石の殻 / 研削後のすりガラス） ----
  vec3 roughCrust = mix(vec3(0.018, 0.026, 0.050), uBaseColor * 0.20, 0.55);
  vec3 frostCrust = mix(vec3(0.36, 0.42, 0.52), uBaseColor * 0.78, 0.35);
  vec3 crustCol = mix(roughCrust, frostCrust, grind);
  float frost = (1.0 - smoothness);
  vec3 col = mix(body, crustCol, frost * mix(0.86, 0.72, grind) * (1.0 - win * 0.9));

  // ---- ライティング ----
  float ndl  = clamp(dot(N, L), 0.0, 1.0);
  float ndl2 = clamp(dot(N, L2), 0.0, 1.0);
  col *= (0.20 + 0.92 * ndl + 0.30 * ndl2);

  vec3 H  = normalize(L + V);
  vec3 H2 = normalize(L2 + V);
  float shin = mix(9.0, 260.0, smoothness);
  float spec = pow(max(dot(N, H), 0.0), shin) * mix(0.035, 1.8, smoothness * smoothness);
  spec += pow(max(dot(N, H2), 0.0), shin) * mix(0.018, 0.75, smoothness * smoothness);
  col += vec3(1.0, 0.99, 0.96) * spec;

  // ---- 環境反射（つるつる感の核心） ----
  vec3 R = reflect(-V, N);
  vec3 env = envSample(R, smoothness);
  float schlick = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  float refl = mix(0.035, 1.0, smoothness) * (0.32 + 0.95 * schlick);
  col += env * refl * 1.12;

  // フレネルの縁光
  col += mix(uBaseColor, vec3(1.0), 0.45) * pow(1.0 - ndv, 5.0) * (0.06 + 0.40 * smoothness);

  // リムライト（石の輪郭を背景から起こす）
  float rim = pow(1.0 - ndv, 2.6) * smoothstep(-0.35, 0.75, dot(N, normalize(uRimDir)));
  col += vec3(0.46, 0.62, 0.95) * rim * (0.18 + 0.42 * smoothness);

  // ---- アステリズム（ルチル針による異方性反射。60 度ずつ 3 組 → 六条星） ----
  // 絹は石の「内部」にある。表面の凸凹法線 N で計算すると帯が頂点ごとに散ってキラキラに
  // なってしまうので、ここだけは滑らかな法線 Ns を使い、一本の帯としてまとめる。
  vec3 Ns = normalize(mix(N, vSmoothN, 0.92));
  float ndvS = clamp(dot(Ns, V), 0.0, 1.0);

  vec3 ht = H - Ns * dot(H, Ns);
  float hl = length(ht);

  vec3 cAw = normalize(vCAxisW);
  vec3 w1 = perpOf(cAw);
  vec3 w2 = cross(cAw, w1);

  float form  = clamp(uStarForm, 0.0, 1.0);
  float three = smoothstep(0.34, 0.70, uAlign);          // 光帯 1 本 → 3 本
  float wob   = (1.0 - clamp(uAlign, 0.0, 1.0)) * 0.42;  // 低 align では散らばって揺れる
  // 原石期は幅広く柔らかい帯、完成に近づくほど細く鋭い光条
  float sharpB = mix(85.0, max(38.0, uSharpness * 26.0), form * (0.30 + 0.70 * smoothness));

  float star = 0.0;
  for (int k = 0; k < 3; k++){
    float w = (k == 0) ? 1.0 : three;
    if (w <= 0.002) continue;
    float a = float(k) * 1.04719755 + sin(uTime * 0.9 + float(k) * 2.1) * wob;
    vec3 fw = normalize(w1 * cos(a) + w2 * sin(a));
    vec3 ft = fw - Ns * dot(fw, Ns);
    float l2 = dot(ft, ft);
    if (l2 < 1e-5) continue;
    ft *= inversesqrt(l2);
    float fl = dot(ft, L);
    float fv = dot(ft, V);
    float kk = sqrt(max(0.0, 1.0 - fl * fl)) * sqrt(max(0.0, 1.0 - fv * fv)) - fl * fv;
    star += w * pow(max(kk, 0.0), sharpB);
  }
  // 中心から離れるほど細く淡く（六条が「石の中で光る」ように減衰させる）
  // 原石期の帯は中心から遠くまで伸びる（＝一本の帯として石を横切る）
  star *= exp(-hl * mix(2.6, 7.0, smoothness * form));
  star *= 0.55 + 0.75 * uSilkDensity;
  // 研磨前は弱まるが、帯としてはっきり見える強さは残す
  star *= mix(0.55, 1.0, clamp(smoothness + win * 0.75, 0.0, 1.0));
  // すりガラス期（研削中）は控えめにして、出っ張りの橙の発光が埋もれないようにする
  star *= mix(1.0, 0.5, grind * (1.0 - smoothness));
  star *= 0.30 + 0.70 * clamp(uAlign, 0.0, 1.0);
  star *= smoothstep(0.02, 0.38, ndvS);      // 縁では消える（ドームを覆わない）

  // 星の中心核（＝鏡面反射点）: 小さく鋭く明るく
  float core = exp(-hl * mix(16.0, 40.0, smoothness))
             * mix(0.10, 1.0, smoothness) * clamp(uAlign, 0.0, 1.0)
             * smoothstep(0.05, 0.45, ndvS);

  vec3 starCol = mix(vec3(0.66, 0.80, 1.0), vec3(0.90, 0.95, 1.0), form);
  col += starCol * star * uStarBoost * mix(2.2, 1.0, form);
  col += mix(starCol, vec3(1.0), 0.6) * core * uStarBoost * 0.55;

  // ---- 誘い（文字なしの導線） ----
  float hd = dot(normalize(vLocal), normalize(uHintDir));
  float hpat = smoothstep(0.80, 0.985, hd);
  float hint = hpat * uHintStrength * (0.40 + 0.60 * sin(uTime * 2.3)) * (1.0 - grind);
  col += mix(vec3(0.26, 0.52, 1.0), vec3(0.72, 0.86, 1.0), hpat) * hint * 0.95;

  // 出っ張りの発光: その工程の上限まで削れたら消える
  float protRes = vProt * clamp(1.0 - grind / max(0.05, uGrindCap), 0.0, 1.0);
  col += vec3(1.0, 0.70, 0.34) * protRes * uProtGlow
       * (0.55 + 0.45 * sin(uTime * 4.2 + vProt * 9.0));

  col += uBaseColor * uPulse * (1.0 - pol) * 0.35
       * (0.35 + 0.65 * sin(uTime * 2.6 - ndv * 3.4));

  col += mix(uBaseColor, vec3(1.0), 0.3) * uGlow * (0.06 + 0.55 * fres);

  col *= uExposure;
  col = col / (col + vec3(0.92));           // トーンマップ（星が白飛びしないよう少し粘る）
  col = pow(col, vec3(1.0 / 2.2));
  // トーンマップで抜けた青みを戻す（サファイアの深い色）
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = clamp(mix(vec3(lum), clamp(col, 0.0, 1.0), 1.18), 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createStoneMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: STONE_VERT,
    fragmentShader: STONE_FRAG,
    uniforms: {
      uBaseColor: { value: new THREE.Color(0x4f7fd6) },
      uDepthColor: { value: new THREE.Color(0x0b1c4d) },
      uCAxis: { value: new THREE.Vector3(0, 1, 0) },
      uLightDir: { value: new THREE.Vector3(0.26, 0.78, 0.95).normalize() },
      uLightDir2: { value: new THREE.Vector3(-0.7, 0.2, 0.5).normalize() },
      uRimDir: { value: new THREE.Vector3(-0.55, 0.62, -0.85).normalize() },
      uHintDir: { value: new THREE.Vector3(1, 0, 0) },
      uTime: { value: 0 },
      uSilkDensity: { value: 0.8 },
      uRays: { value: 6 },
      uSharpness: { value: 28 },
      uAlign: { value: 0 },
      uStarForm: { value: 0 },
      uStarBoost: { value: 1.0 },
      uProtGlow: { value: 0 },
      uGrindCap: { value: 1 },
      uPulse: { value: 0 },
      uGlow: { value: 0 },
      uHintStrength: { value: 0 },
      uExposure: { value: 1.24 }
    }
  });
}

const GHOST_VERT = /* glsl */`
attribute vec3 aCab;
attribute vec3 nCab;
attribute vec3 aMask;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vLocal;
varying float vGrind;
void main(){
  vec3 p = aCab * 1.006;
  vLocal = p;
  vGrind = aMask.x;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normalize(nCab));
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const GHOST_FRAG = /* glsl */`
precision highp float;
uniform float uOpacity;
uniform float uTime;
uniform vec3  uColor;
uniform vec3  uCAxis;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vLocal;
varying float vGrind;
${COMMON}
void main(){
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 4.0);
  // 等高線状のうっすらしたワイヤー感
  vec3 cA = normalize(uCAxis);
  float h = dot(vLocal, cA);
  float lines = smoothstep(0.93, 1.0, abs(sin(h * 11.0)));
  float breathe = 0.72 + 0.28 * sin(uTime * 1.8);
  // 面はごく薄く、リム（輪郭）と等高線だけを見せる = 目標形のワイヤー的な表示
  float a = (fres * 0.85 + lines * 0.20 + 0.035) * uOpacity * breathe;
  gl_FragColor = vec4(uColor * (0.35 + 1.05 * fres), a);
}
`;

export function createGhostMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: GHOST_VERT,
    fragmentShader: GHOST_FRAG,
    uniforms: {
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x9fd8ff) },
      uCAxis: { value: new THREE.Vector3(0, 1, 0) }
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide
  });
}
