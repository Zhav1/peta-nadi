// Phase 171 — offline admin gazetteer search (SPEC decision 6).
//
// Pins the two user-visible promises of the gazetteer:
//   1. a kecamatan hit states its level, parent regency and province
//      (`Kecamatan · Bireuen · Aceh`), never a bare name;
//   2. when the live (Nominatim) half of the lookup is unreachable and the
//      offline gazetteer has nothing, the UI says a connection is needed for
//      desa search instead of implying the place does not exist.
//
// Hermetic: /api/ is fully intercepted; no live backend, no Nominatim.

import { test, expect, type Page } from '@playwright/test';

const JUST_NOW = new Date(Date.now() - 60_000).toISOString();

const DISPATCHER = {
  id: 'gazetteer-search-dispatcher-1',
  company_id: 'pos_logistik',
  org_name: 'PT Samudera Logistik Sumatra',
  name: 'Gazetteer Search E2E',
  email: 'gazetteer-search@e2e.test',
  role: 'DISPATCHER',
  permissions: ['fleet:read', 'heatmap:read', 'prices:read', 'reports:read', 'audit:read', 'scenarios:run'],
  is_offline_guest: false,
};

const SEARCH_INPUT = 'Cari desa, kecamatan, kota, atau hub...';

/** One offline kecamatan hit: Peusangan, Kabupaten Bireuen, Aceh. */
function gazetteerHit() {
  return {
    id: 'kec-peusangan',
    name: 'Peusangan',
    display_name: 'Peusangan, Bireuen, Aceh, Indonesia',
    lat: 5.2038,
    lon: 96.7712,
    type: 'kecamatan',
    province: 'Aceh',
    parent: 'Bireuen',
    kabupaten: 'Bireuen',
    kecamatan: 'Peusangan',
    source: 'gazetteer',
  };
}

async function seedAuth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('prehub_auth_token', 'gazetteer-search-e2e-token');
    } catch {
      /* ignore */
    }
  });
}

/**
 * Mock every backend call the dashboard makes.
 * `search` controls `/api/v1/geocode/search`: a payload, or 'fail' for HTTP 500.
 */
async function mockBaseApi(page: Page, search: unknown | 'fail'): Promise<void> {
  await page.route(/directions\/v5\/mapbox/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ routes: [] }) });
  });

  await page.route(/\/api\//, async (route) => {
    const url = route.request().url();
    const ok = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.includes('/api/v1/geocode/search')) {
      if (search === 'fail') {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'nominatim unreachable' }),
        });
      }
      return ok(search);
    }
    if (url.includes('/api/v1/geocode/nodes')) return ok({ nodes: [], total: 0, boundaries: [] });
    if (url.includes('/api/v1/auth/me') || url.includes('/api/v1/auth/session')) return ok(DISPATCHER);
    if (url.includes('/api/v1/weather/spatial-polygons')) {
      return ok({
        type: 'FeatureCollection',
        features: [],
        metadata: {
          status: 'ok',
          reason: null,
          total: 0,
          count: 0,
          capped: false,
          updated_at: JUST_NOW,
          validity_hours: 6,
          stale_ceiling_hours: 24,
          max_features: 24,
        },
        meta: {},
      });
    }
    if (url.includes('/api/v1/weather/summary')) {
      const bucket = {
        count: 0,
        total: 0,
        status: 'ok',
        reason: null,
        source: 'BMKG',
        valid_until: null,
        window_hours: 24,
      };
      return ok({ bbox: [94, -6, 108, 6], generated_at: JUST_NOW, cuaca: bucket, waspada: bucket });
    }
    if (url.includes('/api/v1/fire/hotspots')) {
      return ok({
        hotspots: [],
        count: 0,
        total: 0,
        capped: false,
        status: 'empty',
        reason: 'Tidak ada titik panas aktif',
        source: 'nasa-firms-csv',
        updated_at: JUST_NOW,
        window_hours: 24,
      });
    }
    if (url.includes('/api/v1/bnpb/events')) return ok({ events: [], total: 0, status: 'ok', updated_at: JUST_NOW });
    if (url.includes('/api/v1/news/hitl-pending')) return ok({ count: 0, items: [], pending_approvals: [] });
    if (url.includes('/health/sources')) return ok({ sources: [] });
    return ok({ status: 'ok', items: [], total: 0, sources: [] });
  });
}

test('offline kecamatan hit renders level, parent regency and province', async ({ page }) => {
  await seedAuth(page);
  await mockBaseApi(page, {
    status: 'success',
    query: 'peusangan',
    cached: false,
    count: 1,
    nominatim: 'ok',
    offline: 1,
    results: [gazetteerHit()],
  });

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  const input = page.getByPlaceholder(SEARCH_INPUT);
  await expect(input).toBeVisible({ timeout: 30000 });
  await input.fill('peusangan');

  // Debounce is 280 ms; the mocked response lands straight after.
  await expect(page.getByText('Peusangan', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Kecamatan · Bireuen · Aceh')).toBeVisible();
});

test('offline note appears when the live lookup fails and nothing matches offline', async ({ page }) => {
  await seedAuth(page);
  await mockBaseApi(page, 'fail');

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  const input = page.getByPlaceholder(SEARCH_INPUT);
  await expect(input).toBeVisible({ timeout: 30000 });
  await input.fill('qzxwvdesa');

  const note = page.getByTestId('search-offline-note');
  await expect(note).toBeVisible({ timeout: 20000 });
  await expect(note).toHaveText('Butuh koneksi untuk mencari desa.');
});
