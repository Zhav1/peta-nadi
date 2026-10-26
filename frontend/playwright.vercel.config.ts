import { defineConfig, devices } from '@playwright/test';

// TEMPORARY Task-D config: Vercel prod captures only.
// Does NOT modify playwright.config.ts. No webServer (targets live prod).
export default defineConfig({
  testDir: './e2e',
  testMatch: /vercel-capture\.spec\.ts/,
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
