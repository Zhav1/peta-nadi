// Phase 168 — FIRMS Titik Panas tri-state contract.
//
// Pins the regression: an unset NASA_FIRMS_MAP_KEY used to render "0"/empty
// with no way to tell "no fires" from "no key". The counter must now read the
// backend envelope: a real count for ok/stale/empty, "—" only for degraded,
// and a tooltip that names source + window + last-updated.
//
// Hermetic: every /api/ call is intercepted, so this spec never touches a live
// backend or NASA FIRMS.

import { test, expect, type Page } from '@playwright/test';

const SOURCE = 'BMKG Stasiun Klimatologi & Geofisika + Open-Meteo NWP (ECMWF/GFS)';
const GENERATED_AT = '2026-10-27T02:15:00+00:00';
const FIRE_UPDATED_AT = '2026-10-27T02:30:00+00:00';

type FireStatus = 'ok' | 'empty' | 'stale' | 'degraded';

interface FireOptions {
  count: number | null;
  status: FireStatus;
  reason?: string | null;
  source?: 'nasa-firms-api' | 'nasa-firms-csv' | 'cache';
  windowHours?: number;
}

function hotspot(lat: number, lon: number) {
  return {
    coordinates: [lon, lat],
    lon,
    lat,
    confidence: 80,
    frp: 12.5,
    conf: 'nominal',
    dist_to_corridor_km: 1.2,
    severity: 'high',
    radius_km: 2.5,
    title: 'Hotspot VIIRS FRP 12.5MW',
    source: 'VIIRS_SNPP_NRT',
    near_segment: 'Medan Hub',
    ts: FIRE_UPDATED_AT,
  };
}

function firePayload({
  count,
  status,
  reason = null,
  source = 'nasa-firms-csv',
  windowHours = 24,
}: FireOptions) {
  return {
    hotspots: count && count > 0 ? [hotspot(3.6, 98.6), hotspot(-2.98, 104.76)] : [],
    count,
    total: count ?? 0,
    capped: false,
    status,
    reason,
    source,
    updated_at: FIRE_UPDATED_AT,
    window_hours: windowHours,
  };
}

function weatherBucket(count: number) {
  return {
    count,
    total: count,
    status: 'ok',
    reason: null,
    source: SOURCE,
    valid_until: '2026-10-27T08:15:00+00:00',
    window_hours: 24,
  };
}

const DISPATCHER = {
  id: 'firms-truth-dispatcher-1',
  company_id: 'pos_logistik',
  org_name: 'PT Samudera Logistik Sumatra',
  name: 'FIRMS Truth E2E',
  email: 'firms-truth@e2e.test',
  role: 'DISPATCHER',
  permissions: ['fleet:read', 'heatmap:read', 'prices:read', 'reports:read', 'audit:read', 'scenarios:run'],
  is_offline_guest: false,
};

/** Single /api/ dispatcher: auth fixture + the fire envelope under test. */
async function mockDashboardApi(page: Page, fire: unknown): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('prehub_auth_token', 'firms-truth-e2e-token');
    } catch {
      /* ignore */
    }
  });

  await page.route(/\/api\//, async (route) => {
    const url = route.request().url();
    const ok = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.includes('/api/v1/auth/me') || url.includes('/api/v1/auth/session')) {
      return ok(DISPATCHER);
    }
    // The contract under test — answered before the generic branches.
    if (url.includes('/api/v1/fire/hotspots')) {
      return ok(fire);
    }
    if (url.includes('/api/v1/weather/summary')) {
      return ok({
        bbox: [94, -6, 108, 6],
        generated_at: GENERATED_AT,
        cuaca: weatherBucket(2),
        waspada: weatherBucket(5),
      });
    }
    if (url.includes('/api/v1/weather/spatial-polygons')) {
      return ok({ type: 'FeatureCollection', features: [] });
    }
    if (url.includes('/api/v1/bnpb/events')) {
      return ok({ events: [], total: 0, status: 'ok', updated_at: GENERATED_AT });
    }
    if (url.includes('/api/v1/news/hitl-pending')) {
      return ok({ count: 0, items: [], pending_approvals: [] });
    }
    if (url.includes('/health/sources')) return ok({ sources: [] });
    return ok({ status: 'ok', items: [], total: 0, sources: [] });
  });
}

const firePill = (page: Page) => page.locator('button:has([data-testid="counter-titik-panas"])');

test('ok envelope renders the true hotspot count', async ({ page }) => {
  await mockDashboardApi(page, firePayload({ count: 42, status: 'ok' }));
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('counter-titik-panas')).toHaveText('42', { timeout: 30000 });
});

test('degraded envelope renders an em dash, never a fabricated 0', async ({ page }) => {
  await mockDashboardApi(
    page,
    firePayload({
      count: null,
      status: 'degraded',
      reason: 'CSV publik NASA FIRMS tidak tersedia (VIIRS + MODIS)',
    }),
  );
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  const counter = page.getByTestId('counter-titik-panas');
  await expect(counter).toHaveText('—', { timeout: 30000 });
  await expect(counter).not.toHaveText('0');

  const tooltip = (await firePill(page).getAttribute('title')) ?? '';
  expect(tooltip).toContain('tidak diketahui');
  expect(tooltip).toContain('CSV publik NASA FIRMS tidak tersedia');
});

test('empty envelope renders 0 so empty and unknown stay distinct', async ({ page }) => {
  await mockDashboardApi(
    page,
    firePayload({ count: 0, status: 'empty', reason: 'Tidak ada titik panas aktif di Sumatra pada jendela ini' }),
  );
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  const counter = page.getByTestId('counter-titik-panas');
  await expect(counter).toHaveText('0', { timeout: 30000 });
  await expect(counter).not.toHaveText('—');

  const tooltip = (await firePill(page).getAttribute('title')) ?? '';
  expect(tooltip).toContain('kosong terverifikasi');
});

test('counter tooltip carries source + window + last-updated', async ({ page }) => {
  await mockDashboardApi(
    page,
    firePayload({ count: 7, status: 'stale', reason: 'Data terakhir 2.5 jam lalu; CSV timed out', source: 'cache' }),
  );
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('counter-titik-panas')).toHaveText('7', { timeout: 30000 });

  const tooltip = (await firePill(page).getAttribute('title')) ?? '';
  expect(tooltip).toContain('Titik Panas');
  expect(tooltip).toContain('Sumber: Cache data terakhir');
  expect(tooltip).toContain('Jendela: 24 jam');
  expect(tooltip).toMatch(/Diperbarui:/);
  expect(tooltip).toContain('data lama');
});
