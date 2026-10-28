import { defineConfig, devices } from '@playwright/test';

// TEMPORARY Task-D config: Vercel prod captures only.
// Does NOT modify playwright.config.ts. No webServer (targets live prod).
export default defineConfig({
  testDir: './e2e',
  // M9 R2: the production capture spec lives beside vercel-capture.spec.ts and
  // needs the same prod-only config (baseURL, no webServer).
  testMatch: /(?:vercel-capture|r2-production-capture)\.spec\.ts/,
  timeout: 180 * 1000,
  expect: {
    timeout: 20 * 1000,
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'https://pre-hub.vercel.app',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
  ],
});
