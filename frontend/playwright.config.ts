import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // r2-production-capture.spec.ts is a read-only capture of the deployed origin:
  // it needs playwright.vercel.config.ts (production baseURL, no webServer) and
  // can never pass against a local build with no backend. Keep it out of the
  // hermetic local suite instead of letting it fail the gate.
  testIgnore: /r2-production-capture\.spec\.ts/,
  timeout: 120 * 1000,
  expect: {
    timeout: 15 * 1000,
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
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
  webServer: {
    // next.config.mjs uses output: 'standalone', under which `next start`
    // refuses to boot: serve the standalone bundle directly instead.
    command: 'node .next/standalone/server.js',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
