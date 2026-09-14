import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2020', outDir: 'dist' },
  test: { include: ['tests/unit/**/*.test.ts'] },
} as any);
