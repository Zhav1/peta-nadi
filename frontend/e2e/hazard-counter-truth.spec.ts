// Phase 160 — hazard counter truth (dashboard telemetry).
//
// Pins the regression this phase fixes: Waspada Dini / Cuaca counters are world
// truth from GET /api/v1/weather/summary, NOT the toggle-gated map slice, and
// unknown (degraded) renders "—" while verified-empty renders "0".
//
// Hermetic: every /api/ call is intercepted (dispatcher auth fixture), so this
// spec never touches a live backend.

import { test, expect, type Page } from '@playwright/test';

const SOURCE = 'BMKG Stasiun Klimatologi & Geofisika + Open-Meteo NWP (ECMWF/GFS)';
const BBOX = [94, -6, 108, 6];
const GENERATED_AT = '2026-10-27T02:15:00+00:00';
const UPDATED_LABEL = /Diperbarui:/;

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
    valid_until: '2026-10-27T08:15:00+00:00',
    window_hours: 24,
  };
}

function summaryPayload(cuaca: BucketOptions, waspada: BucketOptions) {
  return {
    bbox: BBOX,
    generated_at: GENERATED_AT,
    cuaca: bucket(cuaca),
    waspada: bucket(waspada),
  };
}

const DISPATCHER = {
  id: 'hazard-truth-dispatcher-1',
  company_id: 'pos_logistik',
  org_name: 'PT Samudera Logistik Sumatra',
  name: 'Hazard Truth E2E',
  email: 'hazard-truth@e2e.test',
  role: 'DISPATCHER',
  permissions: ['fleet:read', 'heatmap:read', 'prices:read', 'reports:read', 'audit:read', 'scenarios:run'],
  is_offline_guest: false,
};

/** Single /api/ dispatcher: auth fixture + the weather contracts under test. */
async function mockDashboardApi(page: Page, summary: unknown, summaryStatus = 200): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('prehub_auth_token', 'hazard-truth-e2e-token');
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
    // The contract under test — answered before the generic weather branch.
    if (url.includes('/api/v1/weather/summary')) {
      if (summaryStatus !== 200) {
        return route.fulfill({
          status: summaryStatus,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'upstream down' }),
        });
      }
      return ok(summary);
    }
    if (url.includes('/api/v1/weather/spatial-polygons')) {
      return ok({ type: 'FeatureCollection', features: [] });
    }
    if (url.includes('/api/v1/fire/hotspots')) {
      return ok({ hotspots: [], total: 0, status: 'ok', reason: null, source: 'VIIRS_SNPP_NRT' });
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

const cuacaPill = (page: Page) => page.locator('button:has([data-testid="counter-cuaca"])');
const waspadaPill = (page: Page) => page.locator('button:has([data-testid="counter-waspada"])');

test('Waspada Dini counts backend truth even with every weather layer OFF', async ({ page }) => {
  await mockDashboardApi(page, summaryPayload({ count: 5, status: 'ok' }, { count: 27, status: 'ok' }));
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  const cuaca = page.getByTestId('counter-cuaca');
  const waspada = page.getByTestId('counter-waspada');

  await expect(cuaca).toHaveText('5', { timeout: 30000 });
  await expect(waspada).toHaveText('27');

  // Waspada Dini layer defaults OFF — the count must still be backend truth.
  await expect(waspadaPill(page)).toHaveClass(/border-white\/5/);

  // Toggle the Cuaca (disruption) layer OFF: drawing stops, the number does not.
  await expect(cuacaPill(page)).toHaveClass(/border-blue-500\/50/);
  await cuacaPill(page).click();
  await expect(cuacaPill(page)).toHaveClass(/border-white\/5/);

  await expect(cuaca).toHaveText('5');
  await expect(waspada).toHaveText('27');
});

test('degraded summary renders an em dash, never a fabricated 0', async ({ page }) => {
  await mockDashboardApi(
    page,
    summaryPayload(
      { count: null, status: 'degraded', reason: 'Sumber cuaca tidak tersedia' },
      { count: null, status: 'degraded', reason: 'Sumber cuaca tidak tersedia' },
    ),
  );
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('counter-cuaca')).toHaveText('—', { timeout: 30000 });
  await expect(page.getByTestId('counter-waspada')).toHaveText('—');
  await expect(page.getByTestId('counter-waspada')).not.toHaveText('0');

  const tooltip = await waspadaPill(page).getAttribute('title');
  expect(tooltip).toContain('tidak diketahui');
  expect(tooltip).toContain('Sumber cuaca tidak tersedia');
});

test('empty summary renders 0 so empty and unknown stay visually distinct', async ({ page }) => {
  await mockDashboardApi(
    page,
    summaryPayload(
      { count: 0, status: 'empty', reason: 'Tidak ada zona aktif' },
      { count: 0, status: 'empty', reason: 'Tidak ada zona aktif' },
    ),
  );
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('counter-cuaca')).toHaveText('0', { timeout: 30000 });
  await expect(page.getByTestId('counter-waspada')).toHaveText('0');
  await expect(page.getByTestId('counter-waspada')).not.toHaveText('—');

  const tooltip = await waspadaPill(page).getAttribute('title');
  expect(tooltip).toContain('kosong terverifikasi');
});

test('counter tooltip carries what/area/window/source/last-updated', async ({ page }) => {
  await mockDashboardApi(page, summaryPayload({ count: 3, status: 'ok' }, { count: 27, status: 'ok' }));
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('counter-waspada')).toHaveText('27', { timeout: 30000 });

  const tooltip = (await waspadaPill(page).getAttribute('title')) ?? '';
  expect(tooltip).toContain('Waspada Dini');
  expect(tooltip).toContain('Area: Sumatra 94–108 BT, -6–6 LS');
  expect(tooltip).toContain('Jendela: 24 jam');
  expect(tooltip).toContain('Sumber: BMKG');
  expect(tooltip).toMatch(UPDATED_LABEL);

  const cuacaTooltip = (await cuacaPill(page).getAttribute('title')) ?? '';
  expect(cuacaTooltip).toContain('Cuaca');
  expect(cuacaTooltip).toContain('Sumber: BMKG');
  expect(cuacaTooltip).toMatch(UPDATED_LABEL);
});
