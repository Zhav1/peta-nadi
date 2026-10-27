import { defineConfig, devices } from '@playwright/test';

// M8 config: runs the read-only baseline + auth-durability specs against a live
// target (production by default) with no local webServer. Keeps
// playwright.config.ts (localhost) and playwright.vercel.config.ts (capture-only
// match) untouched. Pass a spec path to run just one of them.
export default defineConfig({
  testDir: './e2e',
  testMatch: /m8-(baseline|auth)\.spec\.ts/,
  timeout: 420 * 1000,
  expect: {
    timeout: 20 * 1000,
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.M8_BASE_URL ?? 'https://pre-hub.vercel.app',
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
