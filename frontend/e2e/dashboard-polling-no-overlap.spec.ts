import { test, expect } from '@playwright/test';
import { mockAnalitikApi } from './analitik-fixtures';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test('fleet poll ticks do not abort a still-pending fleet response', async ({ page }) => {
  await mockAnalitikApi(page);

  let fleetCalls = 0;
  let failedFleetRequests = 0;
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).pathname.includes('/api/v1/fleet/vehicles')) {
      failedFleetRequests += 1;
    }
  });
  await page.route(/\/api\/v1\/fleet\/vehicles(?:\?|$)/, async (route) => {
    fleetCalls += 1;
    await responseGate;
    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ vehicles: [], total: 0 }),
      });
    } catch {
      // The request may be gone only if the hook incorrectly canceled it.
    }
  });

  try {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => fleetCalls, { timeout: 25000 }).toBe(1);
    // Fleet polls every 10 seconds. Keep the first API promise pending across a
    // scheduled tick; it must remain the sole request instead of being aborted.
    await page.waitForTimeout(10_500);
    expect(fleetCalls).toBe(1);
    expect(failedFleetRequests).toBe(0);
  } finally {
    releaseResponse();
  }

  await expect.poll(() => failedFleetRequests, { timeout: 5000 }).toBe(0);
});
