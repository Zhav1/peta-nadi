// Phase 176.5 — mobile shell contract.
//
// Parameterised over 360×740, 390×844, 414×896 and 768×1024. Each run proves
// the four layout defects from the Phase 176 evidence are gone:
//   1. no horizontal page overflow,
//   2. every top-nav control is fully inside the viewport and has a name,
//   3. the counter strip starts on a whole pill (scroll-snap, no mid-pill cut),
//   4. every bottom-dock control ends inside the viewport,
//   5. the Berita sheet opens/closes and gives the map back.
//
// Hermetic: every /api/ call is intercepted, so nothing hits a live backend.

import { test, expect, type Page } from '@playwright/test';

const DISPATCHER = {
  id: 'mobile-layout-dispatcher-1',
  company_id: 'pos_logistik',
  org_name: 'PT Samudera Logistik Sumatra',
  name: 'Mobile Layout E2E',
  email: 'mobile-layout@e2e.test',
  role: 'DISPATCHER',
  permissions: ['fleet:read', 'fleet:write', 'heatmap:read', 'prices:read', 'reports:read', 'audit:read', 'scenarios:run'],
  is_offline_guest: false,
};

const NOW = '2026-10-28T02:15:00+00:00';

const VIEWPORTS = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 414, height: 896 },
  { width: 768, height: 1024 },
] as const;

async function mockDashboardApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('prehub_auth_token', 'mobile-layout-e2e-token');
    } catch {
      /* ignore */
    }
  });

  await page.route(/\/api\//, async (route) => {
    const url = route.request().url();
    const ok = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.includes('/api/v1/auth/me') || url.includes('/api/v1/auth/session')) return ok(DISPATCHER);
    if (url.includes('/api/v1/weather/summary')) {
      return ok({
        bbox: [94, -6, 108, 6],
        generated_at: NOW,
        cuaca: { count: 2, total: 2, status: 'ok', reason: null, source: 'BMKG', valid_until: NOW, window_hours: 24 },
        waspada: { count: 5, total: 5, status: 'ok', reason: null, source: 'BMKG', valid_until: NOW, window_hours: 24 },
      });
    }
    if (url.includes('/api/v1/weather/spatial-polygons')) {
      return ok({ type: 'FeatureCollection', features: [], metadata: { status: 'ok', count: 0, total: 0, capped: false, updated_at: NOW } });
    }
    if (url.includes('/api/v1/fire/hotspots')) {
      return ok({ hotspots: [], total: 0, status: 'ok', reason: null, source: 'cache', updated_at: NOW, window_hours: 24 });
    }
    if (url.includes('/api/v1/fleet/vehicles')) {
      return ok({ status: 'success', total_vehicles: 0, updated_at: NOW, vehicles: [] });
    }
    if (url.includes('/api/v1/fleet/travels')) return ok({ total: 0, items: [] });
    if (url.includes('/api/v1/bnpb/events')) return ok({ events: [], total: 0, status: 'ok', updated_at: NOW });
    if (url.includes('/api/v1/news/hitl-pending')) return ok({ count: 0, items: [], pending_approvals: [] });
    if (url.includes('/health/sources')) return ok({ sources: [] });
    return ok({ status: 'ok', items: [], total: 0, sources: [] });
  });
}

for (const viewport of VIEWPORTS) {
  const label = `${viewport.width}x${viewport.height}`;

  test.describe(label, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await mockDashboardApi(page);
      await page.goto('/dashboard?e2e=1', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#nav-map')).toBeVisible({ timeout: 30000 });
      await expect(page.getByTestId('counter-strip')).toBeVisible({ timeout: 30000 });
      await page.waitForTimeout(1200);
    });

    test(`mobile shell fits ${label}`, async ({ page }) => {
      // 1. No horizontal page overflow.
      const overflow = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        inner: window.innerWidth,
      }));
      expect(overflow.doc, `document scrollWidth at ${label}`).toBeLessThanOrEqual(overflow.inner + 1);
      expect(overflow.body, `body scrollWidth at ${label}`).toBeLessThanOrEqual(overflow.inner + 1);

      // 2. Every top-nav control is fully inside the viewport and named.
      const navButtons = page.locator('nav[aria-label="Bagian dasbor"] button:visible');
      const navCount = await navButtons.count();
      expect(navCount, 'top-nav controls').toBeGreaterThan(0);
      for (let i = 0; i < navCount; i += 1) {
        const button = navButtons.nth(i);
        const box = await button.boundingBox();
        expect(box, `nav button ${i} box`).not.toBeNull();
        expect(box!.x, `nav button ${i} left`).toBeGreaterThanOrEqual(-0.5);
        expect(box!.x + box!.width, `nav button ${i} right`).toBeLessThanOrEqual(viewport.width + 0.5);
        expect(box!.y, `nav button ${i} top`).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height, `nav button ${i} bottom`).toBeLessThanOrEqual(viewport.height + 0.5);
        const name = (await button.getAttribute('aria-label'))?.trim() || (await button.innerText()).trim();
        expect(name, `nav button ${i} accessible name`).toBeTruthy();
      }

      // 3. Counter strip rests on a whole first pill, never a partial number.
      const strip = page.getByTestId('counter-strip');
      const stripBox = await strip.boundingBox();
      expect(stripBox).not.toBeNull();
      expect(stripBox!.x + stripBox!.width).toBeLessThanOrEqual(viewport.width + 0.5);
      expect(await strip.evaluate((el) => el.scrollLeft)).toBe(0);
      const firstPill = strip.getByTestId('counter-pill').first();
      await expect(firstPill).toBeVisible();
      const pillBox = await firstPill.boundingBox();
      expect(pillBox, 'first counter pill box').not.toBeNull();
      expect(pillBox!.width, 'first counter pill width').toBeGreaterThan(0);
      expect(pillBox!.x, 'first counter pill left').toBeGreaterThanOrEqual(stripBox!.x - 0.5);
      expect(pillBox!.x + pillBox!.width, 'first counter pill right').toBeLessThanOrEqual(viewport.width + 0.5);
      // The number chip itself is fully painted inside the strip.
      const firstNumber = firstPill.locator('[data-testid^="counter-"]').first();
      if (await firstNumber.count()) {
        const numberBox = await firstNumber.boundingBox();
        expect(numberBox).not.toBeNull();
        expect(numberBox!.x + numberBox!.width).toBeLessThanOrEqual(stripBox!.x + stripBox!.width + 0.5);
      }

      // 4. Every bottom-dock control ends inside the viewport.
      const dock = page.getByTestId('map-dock');
      await expect(dock).toBeVisible();
      const controls = dock.locator('button:visible');
      const controlCount = await controls.count();
      expect(controlCount, 'dock controls').toBeGreaterThan(0);
      for (let i = 0; i < controlCount; i += 1) {
        const box = await controls.nth(i).boundingBox();
        expect(box, `dock control ${i} box`).not.toBeNull();
        expect(box!.x, `dock control ${i} left`).toBeGreaterThanOrEqual(-0.5);
        expect(box!.x + box!.width, `dock control ${i} right`).toBeLessThanOrEqual(viewport.width + 0.5);
      }

      // 5. Mobile (<768): the Berita sheet opens over the map and closes again.
      if (viewport.width < 768) {
        const toggle = page.getByTestId('news-sheet-toggle');
        await expect(toggle).toBeVisible();
        await toggle.click();

        const sheet = page.getByTestId('news-sheet');
        await expect(sheet).toBeVisible();
        const sheetBox = await sheet.boundingBox();
        expect(sheetBox).not.toBeNull();
        // Header is 64px; the sheet leaves a real tappable map band above it
        // (at least ~140px, past the map command bar).
        expect(sheetBox!.y, 'sheet top leaves map tappable').toBeGreaterThanOrEqual(64 + 140);
        expect(sheetBox!.height, 'sheet respects the 85vh cap').toBeLessThanOrEqual(viewport.height * 0.86);

        await page.getByTestId('news-sheet-close').click();
        await expect(sheet).toBeHidden();
        await expect(toggle).toBeVisible();

        const mapBox = await page.locator('#crisis-map').boundingBox();
        expect(mapBox, 'map box after close').not.toBeNull();
        expect(mapBox!.width, 'map width after close').toBeGreaterThanOrEqual(viewport.width * 0.5);

        // Opening/closing the sheet (which inserts the compact Merah/Kuning
        // pills) must not park the strip mid-list.
        const restLeft = await page.evaluate(
          () => document.querySelector('[data-testid="counter-strip"]')?.scrollLeft ?? -1,
        );
        expect(restLeft, 'counter strip at rest after sheet close').toBe(0);
      }
    });
  });
}
