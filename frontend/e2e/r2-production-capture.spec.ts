import { expect, test, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// M9 R2 production verification. Read-only: no login, no mutation, no stubs.
// Runs against the deployed origin from playwright.vercel.config.ts
// (baseURL = https://pre-hub.vercel.app, no webServer).
const OUT_DIR = path.resolve(__dirname, '../../.planning/milestones/M9/phaseR2');

const EMPTY_BERITA_WARMING = 'Belum ada berita live terverifikasi';

/** Best-effort dismissal of first-visit overlays (auth modal / onboarding). */
async function dismissOverlays(page: Page): Promise<void> {
  const closers = [
    '#close-auth-modal-btn',
    '[data-testid="onboarding-close"]',
    '[aria-label="Tutup"]',
    '[aria-label="Close"]',
  ];
  for (const sel of closers) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  }
  // Escape closes any remaining dialog without ever submitting a form.
  await page.keyboard.press('Escape').catch(() => {});
}

async function captureAt(page: Page, width: number, height: number): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await page.setViewportSize({ width, height });

  const res = await page.goto('/dashboard', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  expect(res, 'dashboard navigation returned no response').not.toBeNull();
  expect(res!.status(), `GET /dashboard -> ${res!.status()}`).toBe(200);

  await dismissOverlays(page);

  // The three live counter testids must be mounted with real data.
  for (const id of ['counter-cuaca', 'counter-waspada', 'counter-titik-panas']) {
    await expect(page.getByTestId(id), `${id} missing at ${width}px`).toBeAttached({ timeout: 60000 });
  }

  // Give the live news feed its first poll to resolve, then assert honesty:
  // the panel must not be showing the "no verified live news" empty state.
  await expect
    .poll(async () => page.locator('[data-testid^="berita-card-"]').count(), { timeout: 45000 })
    .toBeGreaterThan(0);

  const emptyState = page.getByText(EMPTY_BERITA_WARMING, { exact: false });
  expect(await emptyState.count(), 'Berita panel is showing the empty state').toBe(0);

  await page.screenshot({
    path: path.join(OUT_DIR, `live-dashboard-${width}.png`),
    fullPage: false,
  });
}

test('R2 production: guest dashboard at 1920x1080', async ({ page }) => {
  await captureAt(page, 1920, 1080);
});

test('R2 production: guest dashboard at 390x844', async ({ page }) => {
  await captureAt(page, 390, 844);
});
