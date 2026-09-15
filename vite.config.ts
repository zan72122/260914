import { defineConfig, type Plugin } from 'vite';

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
        '  <script type="module" src="/src/dev/devMain.ts"></script>\n  </body>',
      );
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [devEntryPlugin()],
  build: {
    target: 'es2022',
    minify: 'esbuild',
  },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
});
