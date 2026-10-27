// Phase 169 — weather retention + freshness surface.
//
// Pins the regression: a failed/stale weather refresh must keep the polygons and
// the counters on screen (stale-while-revalidate), while the legend states the
// freshness honestly ("Data tertunda · 2 j", "Tidak tersedia") and the render
// cap says "menampilkan N dari M" instead of silently hiding zones.
//
// Hermetic: every /api/ call is intercepted, so this spec never touches a live
// backend, BMKG or Open-Meteo.

import { test, expect, type Page } from '@playwright/test';

const SOURCE = 'BMKG Stasiun Klimatologi & Geofisika + Open-Meteo NWP (ECMWF/GFS)';
const BBOX = [94, -6, 108, 6];
const TWO_HOURS_AGO = new Date(Date.now() - 2 * 3_600_000).toISOString();
const JUST_NOW = new Date(Date.now() - 60_000).toISOString();

type Status = 'ok' | 'stale' | 'degraded' | 'empty';

interface BucketOptions {
  count: number | null;
  status: Status;
  reason?: string | null;
}

function bucket({ count, status, reason = null }: BucketOptions) {
  return {
    count,
    total: count,
    status,
    reason,
    source: SOURCE,
    valid_until: null,
    window_hours: 24,
  };
}

function summaryPayload(
  generatedAt: string,
  cuaca: BucketOptions,
  waspada: BucketOptions,
) {
  return {
    bbox: BBOX,
    generated_at: generatedAt,
    cuaca: bucket(cuaca),
    waspada: bucket(waspada),
  };
}

function polygon(lat: number, lon: number) {
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [lon, lat],
          [lon + 0.15, lat],
          [lon + 0.15, lat - 0.15],
          [lon, lat - 0.15],
          [lon, lat],
        ],
      ],
    },
    properties: { lat, lon, severity: 'high', hazard_type: 'flood' },
  };
}

interface PolygonMetaOptions {
  status: Status;
  count: number | null;
  total: number | null;
  capped: boolean;
  updatedAt: string;
  reason?: string | null;
  features: ReturnType<typeof polygon>[];
}

function polygonPayload({
  status,
  count,
  total,
  capped,
  updatedAt,
  reason = null,
  features,
}: PolygonMetaOptions) {
  const meta = {
    status,
    reason,
    total,
    count,
    capped,
    updated_at: updatedAt,
    validity_hours: 6,
    stale_ceiling_hours: 24,
    max_features: 24,
  };
  return { type: 'FeatureCollection', features, metadata: meta, meta };
}

function firePayload(status: Status, count: number | null, updatedAt: string, reason: string | null = null) {
  return {
    hotspots: [],
    count,
    total: count ?? 0,
    capped: false,
    status,
    reason,
    source: 'cache',
    updated_at: updatedAt,
    window_hours: 24,
  };
}

const DISPATCHER = {
  id: 'weather-freshness-dispatcher-1',
  company_id: 'pos_logistik',
  org_name: 'PT Samudera Logistik Sumatra',
  name: 'Weather Freshness E2E',
  email: 'weather-freshness@e2e.test',
  role: 'DISPATCHER',
  permissions: ['fleet:read', 'heatmap:read', 'prices:read', 'reports:read', 'audit:read', 'scenarios:run'],
  is_offline_guest: false,
};

interface MockOptions {
  summary: unknown;
  polygons: unknown;
  fire?: unknown;
}

/** Single /api/ dispatcher: auth fixture + the weather contracts under test. */
async function mockDashboardApi(page: Page, { summary, polygons, fire }: MockOptions): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('prehub_auth_token', 'weather-freshness-e2e-token');
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
    // The contracts under test — answered before the generic branches.
    if (url.includes('/api/v1/weather/spatial-polygons')) return ok(polygons);
    if (url.includes('/api/v1/weather/summary')) return ok(summary);
    if (url.includes('/api/v1/fire/hotspots')) {
      return ok(
        fire ??
          firePayload('ok', 4, JUST_NOW),
      );
    }
    if (url.includes('/api/v1/bnpb/events')) {
      return ok({ events: [], total: 0, status: 'ok', updated_at: JUST_NOW });
    }
    if (url.includes('/api/v1/news/hitl-pending')) {
      return ok({ count: 0, items: [], pending_approvals: [] });
    }
    if (url.includes('/health/sources')) return ok({ sources: [] });
    return ok({ status: 'ok', items: [], total: 0, sources: [] });
  });
}

async function openLegend(page: Page): Promise<void> {
  const toggle = page.getByTitle('Buka Legenda Peta & Rute');
  await expect(toggle).toBeVisible({ timeout: 30000 });
  await toggle.click();
}

test('stale weather refresh keeps polygons and counters, badge says data tertunda', async ({ page }) => {
  await mockDashboardApi(page, {
    summary: summaryPayload(
      TWO_HOURS_AGO,
      { count: 3, status: 'stale', reason: 'Data terakhir 2 jam lalu; refresh gagal' },
      { count: 7, status: 'stale', reason: 'Data terakhir 2 jam lalu; refresh gagal' },
    ),
    polygons: polygonPayload({
      status: 'stale',
      count: 2,
      total: 5,
      capped: true,
      updatedAt: TWO_HOURS_AGO,
      reason: 'Data terakhir 2 jam lalu (valid 6j); upstream timeout',
      features: [polygon(-0.95, 100.42), polygon(-2.98, 104.77)],
    }),
  });
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  // Counters keep the last-known-good numbers, never blanked to 0/—.
  await expect(page.getByTestId('counter-cuaca')).toHaveText('3', { timeout: 30000 });
  await expect(page.getByTestId('counter-waspada')).toHaveText('7');

  await openLegend(page);

  // The stale payload still paints: both polygons reached the map state.
  await expect(page.getByTestId('weather-polygon-count')).toContainText('2 poligon');
  await expect(page.getByTestId('freshness-cuaca')).toContainText('Data tertunda');
  await expect(page.getByTestId('freshness-waspada')).toContainText('Data tertunda');

  // Honest render cap, not a silent truncation.
  const capped = page.getByTestId('weather-capped-notice');
  await expect(capped).toBeVisible();
  await expect(capped).toHaveText('menampilkan 2 dari 5');
});

test('degraded weather reads Tidak tersedia and keeps unknown as an em dash', async ({ page }) => {
  await mockDashboardApi(page, {
    summary: summaryPayload(
      JUST_NOW,
      { count: null, status: 'degraded', reason: 'Sumber cuaca tidak tersedia' },
      { count: null, status: 'degraded', reason: 'Sumber cuaca tidak tersedia' },
    ),
    polygons: polygonPayload({
      status: 'degraded',
      count: null,
      total: null,
      capped: false,
      updatedAt: JUST_NOW,
      reason: 'Sumber cuaca tidak tersedia',
      features: [],
    }),
    fire: firePayload('degraded', null, JUST_NOW, 'Sumber Titik Panas tidak tersedia'),
  });
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('counter-cuaca')).toHaveText('—', { timeout: 30000 });
  await expect(page.getByTestId('counter-titik-panas')).toHaveText('—');

  await openLegend(page);
  await expect(page.getByTestId('freshness-cuaca')).toHaveText('Tidak tersedia');
  await expect(page.getByTestId('freshness-waspada')).toHaveText('Tidak tersedia');
  await expect(page.getByTestId('freshness-titik-panas')).toHaveText('Tidak tersedia');
  await expect(page.getByTestId('weather-capped-notice')).toHaveCount(0);
});

test('fresh payload shows Diperbarui and the 24-of-30 cap notice', async ({ page }) => {
  await mockDashboardApi(page, {
    summary: summaryPayload(
      JUST_NOW,
      { count: 30, status: 'ok' },
      { count: 11, status: 'ok' },
    ),
    polygons: polygonPayload({
      status: 'ok',
      count: 24,
      total: 30,
      capped: true,
      updatedAt: JUST_NOW,
      features: Array.from({ length: 24 }, (_, i) => polygon(-5.4 + (i % 8) * 0.7, 95.5 + (i % 12) * 0.9)),
    }),
  });
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('counter-cuaca')).toHaveText('30', { timeout: 30000 });
  await openLegend(page);

  await expect(page.getByTestId('freshness-cuaca')).toContainText('Diperbarui');
  await expect(page.getByTestId('weather-capped-notice')).toHaveText('menampilkan 24 dari 30');
  await expect(page.getByTestId('weather-polygon-count')).toContainText('24 poligon');
});
