import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/** GitHub Pages のリポジトリ名。公開 URL は https://<user>.github.io/260914/ */
const BASE = '/260914/';

/** 工房の闇色。ホーム画面・起動画面・タブの色をこれで揃える。 */
const DARK = '#05070d';

/**
 * 開発用入口 `window.__fire` は dev サーバでのみ読み込む。
 * 本番ビルドの index.html にはこの script が入らないため、
 * 開発用モジュールは本番の出力に一切含まれない（tests/prodBundle.test.ts で検査）。
 */
function devEntryPlugin(): Plugin {
  return {
    name: 'fire-dev-entry',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace(
        '</body>',
        `  <script type="module" src="${BASE}src/dev/devMain.ts"></script>\n  </body>`,
      );
    },
  };
}

export default defineConfig({
  base: BASE,
  plugins: [
    devEntryPlugin(),
    VitePWA({
      // 新しい版が出たら次の起動で入れ替える（利用者に何も出さない）
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      // 開発サーバでは Service Worker を動かさない（検証の邪魔をしない）
      devOptions: { enabled: false },
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ほんとうの火',
        short_name: 'ほんとうの火',
        lang: 'ja',
        // ホーム画面から開いたら Safari の枠を出さない
        display: 'standalone',
        // 縦でも横でも遊べる（世界は同じ物を置き直すだけ）
        orientation: 'any',
        start_url: '.',
        scope: '.',
        background_color: DARK,
        theme_color: DARK,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 静的資産を全部先に取っておく → 機内でも起動する
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // 世界の絵は WebGL で作るので資産は小さいが、pixi の bundle が 2MB を超える
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    target: 'es2022',
    minify: 'esbuild',
  },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
});
