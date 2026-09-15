import { defineConfig } from '@playwright/test';

/**
 * 既にインストール済みの Chromium を使う。
 * WebGL をヘッドレスで動かすため SwiftShader を明示的に有効にする。
 */
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173/260914/',
    launchOptions: {
      // インストール済みの Chromium を使う(playwright install は実行しない)
      executablePath: '/opt/pw-browsers/chromium',
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        '--disable-dev-shm-usage',
      ],
    },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173/260914/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
