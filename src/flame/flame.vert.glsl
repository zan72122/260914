#version 300 es
// flame.vert.glsl — PixiJS v8 の Filter 標準頂点シェーダと同じ規約。
//
// PixiJS の `defaultFilterVert` と等価。自前で持つ理由は、
// 差し込み側が Pixi の内部 export に依存しなくて済むようにするため。
// uOutputFrame / uInputSize / uOutputTexture は Pixi のフィルタ実行系が自動で埋める。

precision highp float;

in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
