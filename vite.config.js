import { defineConfig } from 'vite';

/**
 * `__TESTABLE__` gates the whole testability layer (window.__game, ?scenario=,
 * ?seed=, ?debug=, ?speed=).
 *
 *   npm run dev         -> true   (development)
 *   npm run build:test  -> true   (dist-test/, used by tests/)
 *   npm run build       -> false  (dist/, what ships to GitHub Pages)
 */
export default defineConfig(({ command }) => {
  const testable = command === 'serve' || process.env.TESTABLE === '1';
  return {
    base: './',
    define: { __TESTABLE__: JSON.stringify(testable) },
    build: {
      outDir: process.env.TESTABLE === '1' ? 'dist-test' : 'dist',
      assetsInlineLimit: 0,
      target: 'es2020'
    },
    server: { host: true },
    preview: { host: true }
  };
});
