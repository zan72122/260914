import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/smoke',
  timeout: 90_000,
  retries: 0,
  use: { baseURL: 'http://localhost:5199/', hasTouch: true, isMobile: true, deviceScaleFactor: 2, launchOptions: { executablePath: '/opt/pw-browsers/chromium' } },
  webServer: { command: 'npx vite --port 5199 --strictPort', url: 'http://localhost:5199/', reuseExistingServer: true },
  projects: [
    { name: 'iphone-portrait', use: { viewport: { width: 390, height: 844 } } },
    { name: 'ipad-landscape', use: { viewport: { width: 1180, height: 820 } } },
  ],
});
