// @ts-check
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const PORT = 8080;
const BASE_URL = `http://localhost:${PORT}`;

/** Common options for every project (DESIGN.md §6.2). */
const common = {
  browserName: /** @type {'chromium'} */ ('chromium'),
  hasTouch: true,
  isMobile: true,
  baseURL: BASE_URL,
  // The game is a fullscreen canvas: never let the browser add scrollbars/chrome.
  ignoreHTTPSErrors: true,
};

export default defineConfig({
  testDir: __dirname,
  testMatch: '**/*.spec.mjs',
  outputDir: path.join(repoRoot, 'test-results'),
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  // Per-test timeout. Playthroughs are allowed up to 90s (a world is 30-60s by design).
  timeout: 90_000,
  expect: { timeout: 15_000 },

  use: {
    ...common,
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    trace: 'retain-on-failure',
    video: 'off',
    screenshot: 'only-on-failure',
  },

  webServer: {
    command: `npx http-server . -p ${PORT} -c-1 --silent`,
    cwd: repoRoot,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },

  projects: [
    {
      name: 'iPhone15-portrait',
      use: { ...common, viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 },
    },
    {
      name: 'iPhone15-landscape',
      use: { ...common, viewport: { width: 852, height: 393 }, deviceScaleFactor: 3 },
    },
    {
      name: 'iPad-portrait',
      use: { ...common, viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2 },
    },
    {
      name: 'iPad-landscape',
      use: { ...common, viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 },
    },
  ],
});
