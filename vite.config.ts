import { defineConfig } from 'vite';

// GitHub Pages serves the site under /<repo>/; Actions sets BASE_PATH accordingly.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: { target: 'es2022', sourcemap: false },
  test: { include: ['src/**/*.test.ts'] },
});
