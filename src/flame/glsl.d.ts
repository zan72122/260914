// Vite の `?raw` インポートで GLSL をテキストとして読むための宣言。
// vite.config や tsconfig を触らずに済むよう、このディレクトリ内に置く。
declare module '*.glsl?raw' {
  const source: string;
  export default source;
}

declare module '*.frag.glsl?raw' {
  const source: string;
  export default source;
}

declare module '*.vert.glsl?raw' {
  const source: string;
  export default source;
}
