import { defineConfig } from 'vite';

export default defineConfig({
  base: '/260914/',
  build: {
    outDir: 'dist',
    target: 'es2020',
    rollupOptions: {
      output: {
        // three だけ別チャンクに分ける(アプリ側の更新でライブラリを再ダウンロードさせない)
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
