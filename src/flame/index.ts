/**
 * src/flame の公開入口（純粋な部分のみ）。
 *
 * ここからは PixiJS に依存するものを一切 re-export しない。
 * 描画は `./FlameRenderer`（境界と実装の選択）と `./GlslFlameRenderer`（GLSL 実装）に
 * 分けてあるので、そちらから直接取ること。そうすることで、PixiJS を import できない
 * 環境（Node 上の Vitest など）でも spectra / color / afterglow / elementColors を
 * そのままテストできる。
 *
 * 名前の重複について: 発光線からの算出結果は color.ts の `FlameColor`、
 * 検査の許容範囲まで含めた仕様は elementColors.ts の `FlameColorSpec` と
 * 別の名前にしてあるので、両方をここから出しても衝突しない。
 */

export * from './elements';
// spectra.ts の ElementId は v2 の元素（ナトリウム・バリウム）まで含む広い型で、
// 遊びに出る v1 の元素（elements.ts の ElementId）とは別物なので、名前を分けて出す。
export {
  type EmitterKind,
  type EmissionLine,
  type ElementId as SpectrumElementId,
  type ElementSpectrum,
  BASE_GAS_FLAME_LINES,
  INNER_CONE_LINES,
  ELEMENT_SPECTRA,
  V1_ELEMENTS,
  getSpectrum,
  totalIntensity,
  normalizedLines,
  blendSpectra,
} from './spectra';
export * from './color';
export * from './afterglow';
export * from './elementColors';
