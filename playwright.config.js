import { defineConfig } from '@playwright/test';

// The Chromium build is already on disk; never try to download one.
const EXECUTABLE = '/opt/pw-browsers/chromium';
const PORT = 8123;

export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    launchOptions: { executablePath: EXECUTABLE, args: ['--no-sandbox', '--disable-dev-shm-usage'] },
  },
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 30000,
  },
  projects: [{ name: 'chromium' }],
});
