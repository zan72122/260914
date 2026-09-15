import { defineConfig, devices } from '@playwright/test';

const iphone = devices['iPhone 13'];
// iPad の横画面（同梱の Chromium で、viewport と実タッチだけを合わせる）
const ipad = {
  ...devices['iPad (gen 7) landscape'],
};

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'artifacts/test-output',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'off',
  },
  projects: [
    {
      name: 'iphone',
      testIgnore: /landscape\.spec\.ts/,
      use: {
        // Chromium 同梱のみ。iPhone の viewport・実タッチをそのまま使う。
        ...iphone,
        browserName: 'chromium',
        channel: undefined,
        launchOptions: { args: ['--enable-unsafe-swiftshader', '--disable-lcd-text'] },
      },
    },
    {
      name: 'ipad-landscape',
      testMatch: /landscape\.spec\.ts/,
      use: {
        ...ipad,
        browserName: 'chromium',
        channel: undefined,
        launchOptions: { args: ['--enable-unsafe-swiftshader', '--disable-lcd-text'] },
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
