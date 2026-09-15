/**
 * src/flame の公開入口（純粋な部分のみ）。
 *
 * ここからは PixiJS に依存するものを一切 re-export しない。
 * FlameRenderer は `import { FlameRenderer } from './flame/FlameRenderer.js'` のように
 * 直接取ること。そうすることで、PixiJS を import できない環境（Node 上の Vitest など）でも
 * spectra / color / afterglow をそのままテストできる。
 */

export * from './spectra.js';
export * from './color.js';
export * from './afterglow.js';
