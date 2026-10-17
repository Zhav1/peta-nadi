import { test, expect } from '@playwright/test';
import {
  DEFAULT_HAZARD_RADIUS_KM,
  calculateAIDynamicDetourRoutes,
  fetchMapboxAlternativeDrivingRoutes,
} from '../lib/aiDynamicRouter';
import { fetchMapboxDirections } from '../lib/mapboxRoutingService';
import type { LonLat } from '../lib/pathDensifier';
import type { MapboxDirectionsResponse } from '../lib/aiDynamicRouter';

// ============================================================================
// Phase 57 — Pilot Hardening verification (WP-A1/A2/A3 + STEP 0 contract)
// Mix of hermetic routing-honesty unit tests (no browser/backend needed) and
// browser flows against the production build (`npm run start`, no backend).
// ============================================================================

const BELAWAN: LonLat = [98.6776, 3.7922];
const TEBING_TINGGI: LonLat = [99.1621, 3.3251];
const LUBUK_PAKAM_HAZARD: LonLat = [98.87, 3.56];
const TEST_TOKEN = 'pk.test-token';

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

const directionsRoute = (coordinates: LonLat[]): MapboxDirectionsResponse => ({
  routes: [
    {
      distance: 142000,
      duration: 10800,
      geometry: { coordinates },
      legs: [{ summary: 'Koridor Uji', annotation: { congestion: coordinates.map(() => 'low') } }],
    },
  ],
});

function captureMapboxRequests(handler: (url: string, index: number) => Response) {
  const urls: string[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    urls.push(url);
    return handler(url, urls.length - 1);
  }) as typeof fetch;

  return {
    urls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

// ---------------------------------------------------------------------------
// WP-A3 (D4): routing honesty — provenance + SIMULASI labels
// ---------------------------------------------------------------------------

test('offline alternatives carry offline-interpolated provenance and a SIMULASI label', async () => {
  delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const mapbox = captureMapboxRequests(() => jsonResponse(directionsRoute([BELAWAN, TEBING_TINGGI])));

  try {
    const results = await fetchMapboxAlternativeDrivingRoutes(BELAWAN, TEBING_TINGGI);

    expect(mapbox.urls).toHaveLength(0);
    expect(results).toHaveLength(1);
    expect(results[0]?.source).toBe('offline-interpolated');
    expect(results[0]?.summary).toContain('SIMULASI/OFFLINE');
  } finally {
    mapbox.restore();
  }
});

test('live alternatives carry live provenance and no SIMULASI label', async () => {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = TEST_TOKEN;
  const mapbox = captureMapboxRequests(() => jsonResponse(directionsRoute([BELAWAN, TEBING_TINGGI])));

  try {
    const results = await fetchMapboxAlternativeDrivingRoutes(BELAWAN, TEBING_TINGGI);

    expect(mapbox.urls.length).toBeGreaterThan(0);
    expect(results[0]?.source).toBe('live');
    expect(results[0]?.summary).not.toContain('SIMULASI');
  } finally {
    mapbox.restore();
    delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  }
});

test('offline detour recommendations render with the SIMULASI badge, never as live roads', async () => {
  delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const mapbox = captureMapboxRequests(() => jsonResponse(directionsRoute([BELAWAN, TEBING_TINGGI])));

  try {
    const routes = await calculateAIDynamicDetourRoutes(
      LUBUK_PAKAM_HAZARD,
      DEFAULT_HAZARD_RADIUS_KM,
      BELAWAN,
      TEBING_TINGGI,
      'truck'
    );

    expect(mapbox.urls).toHaveLength(0);

    const interpolated = routes.filter((r) => (r.route_name ?? '').startsWith('[SIMULASI]'));
    expect(interpolated.length).toBeGreaterThan(0);
    for (const route of interpolated) {
      expect(route.description).toContain('SIMULASI/OFFLINE');
      expect(route.safety_tag ?? '').toContain('SIMULASI/OFFLINE');
      expect(route.waypoints.length).toBeGreaterThan(0);
    }
    // No interpolated geometry may present itself with a clean live-style name.
    for (const route of routes) {
      if (route.safety_status === 'HOLD_DELAY') continue;
      const labeled =
        (route.route_name ?? '').startsWith('[SIMULASI]') || (route.safety_tag ?? '').includes('SIMULASI');
      expect(labeled).toBe(true);
    }
  } finally {
    mapbox.restore();
  }
});

test('fetchMapboxDirections reports offline-interpolated provenance without a token', async () => {
  delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const result = await fetchMapboxDirections(BELAWAN, TEBING_TINGGI);
  expect(result.source).toBe('offline-interpolated');
  expect(result.coords.length).toBeGreaterThanOrEqual(2);
});

// ---------------------------------------------------------------------------
// WP-A1 (D7): guest banner dismiss persists per-session only
// ---------------------------------------------------------------------------

test('guest banner dismiss hides it this session and it returns next session', async ({
  page,
  context,
}) => {
  await page.goto('/dashboard');
  const banner = page.getByText('Mode Evaluasi Tamu');
  await expect(banner).toBeVisible({ timeout: 30000 });

  await page.getByRole('button', { name: 'Tutup banner evaluasi tamu' }).click();
  await expect(banner).toBeHidden();
  expect(await page.evaluate(() => sessionStorage.getItem('prehub_guest_banner_dismissed'))).toBe('1');

  // Same session (reload): stays dismissed.
  await page.reload();
  await expect(page.getByText('Mode Evaluasi Tamu')).toBeHidden({ timeout: 30000 });

  // Next session (fresh context): banner returns.
  const fresh = await context.browser()?.newContext();
  test.skip(!fresh, 'no browser for fresh context');
  const freshPage = await fresh!.newPage();
  await freshPage.goto('/dashboard');
  await expect(freshPage.getByText('Mode Evaluasi Tamu')).toBeVisible({ timeout: 30000 });
  await fresh!.close();
});

// ---------------------------------------------------------------------------
// WP-A2 (D7): Stage-0 cold click starts the demo instead of silently stalling
// ---------------------------------------------------------------------------

test('Stage-0 cold click fires onStart (second demo/start) rather than stalling', async ({
  page,
}) => {
  let startCount = 0;
  let advanceCount = 0;

  // Hang every demo/start: the first Run Demo click leaves crisisId null, which
  // is exactly the race the Stage-0 fix addresses.
  await page.route('**/api/demo/start', async (route) => {
    startCount += 1;
    await new Promise(() => {});
    await route.abort().catch(() => {});
  });
  await page.route('**/api/demo/advance/**', async (route) => {
    advanceCount += 1;
    await route.fulfill({ status: 200, body: JSON.stringify({ stage: 1, stage_name: 'x' }) });
  });

  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Run Demo' }).click({ timeout: 30000 });

  const stageZero = page.getByRole('button', { name: 'Mulai Simulasi Disrupsi' });
  await expect(stageZero).toBeVisible({ timeout: 30000 });
  expect(startCount).toBe(1);

  // Fixed behavior: Stage-0 click calls onStart -> a second demo/start request.
  // Broken behavior: onAdvance on null crisisId -> silent no-op, zero requests.
  await stageZero.click();
  await expect.poll(() => startCount, { timeout: 15000 }).toBe(2);
  expect(advanceCount).toBe(0);
});

// ---------------------------------------------------------------------------
// WP-A3 (D1): guest deploy keeps 403 and updates optimistic state with local toast
// ---------------------------------------------------------------------------

test('guest deploy on 403 shows the sandbox toast and saves locally', async ({ page }) => {
  const crisisId = 'pilot-hardening-demo-crisis';

  // Mock Mapbox directions so AI route calculation resolves instantly without network stalls
  await page.route(/\/directions\/v5\/mapbox/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(directionsRoute([BELAWAN, TEBING_TINGGI])),
    });
  });

  // Mock demo start and status polling to cleanly advance to Stage 3 (where crisis routes are active)
  await page.route('**/api/demo/start', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        crisis_id: crisisId,
        stage: 0,
        total_stages: 5,
      }),
    });
  });

  await page.route(new RegExp(`/api/demo/status/${crisisId}`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        crisis_id: crisisId,
        stage: 3,
        status: 'validated',
        full_crisis_state: {
          crisis_id: crisisId,
          title: 'Disrupsi Koridor Belawan - Tebing Tinggi',
          type: 'flood',
          status: 'validated',
          lat: 3.10,
          lon: 98.50,
          overall_confidence: 0.94,
          validated: true,
          region: 'north_sumatra',
          decision_support_output: 'Rute pengalihan aman teridentifikasi.',
          route_recommendations: [
            {
              id: 'detour-bypass-0',
              route_name: 'Koridor Darat Pengalihan Bebas Hambatan',
              description: 'Jalur alternatif tol Medan-Tebing Tinggi aman dari disrupsi',
              distance_km: 84.5,
              eta_minutes: 88,
              fuel_increase_pct: 12.0,
              viable: true,
              is_compromised: false,
              safety_status: 'SAFE_DETOUR',
              safety_tag: 'JALUR AMAN',
              waypoints: [
                { lat: 3.7922, lon: 98.6776 },
                { lat: 3.3285, lon: 99.1625 },
              ],
            },
          ],
        },
      }),
    });
  });

  await page.route(new RegExp(`/api/demo/advance/${crisisId}`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        crisis_id: crisisId,
        stage: 4,
        stage_name: 'Dispatch & Mitigasi',
      }),
    });
  });

  // Mock approvals endpoint: GET returns empty list; POST returns 403 FORBIDDEN
  await page.route('**/api/v1/approvals*', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ detail: { error: 'FORBIDDEN' } }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    }
  });

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  // Start the presentation demo to trigger crisis ingestion
  const runDemoBtn = page.locator('#run-demo-btn');
  await expect(runDemoBtn).toBeVisible({ timeout: 60000 });
  await runDemoBtn.click();

  // Status polling brings the demo directly to Stage 3 (Tahap 4)
  const nextStepBtn = page.getByRole('button', { name: 'Langkah Berikutnya' });
  await expect(nextStepBtn).toBeVisible({ timeout: 30000 });
  await nextStepBtn.click();

  // At Stage 4 (Tahap 5), click "Buka Mitigasi & Setujui" to open CrisisSidebar on Mitigation tab
  const openMitigationBtn = page.getByRole('button', { name: 'Buka Mitigasi & Setujui' });
  await expect(openMitigationBtn).toBeVisible({ timeout: 15000 });
  await openMitigationBtn.click();

  // MitigationTab renders for GUEST role: shows sandbox disclaimer & SIMPAN RENCANA button
  await expect(
    page.getByText('Mode Sandbox: Tindakan disimpan lokal untuk simulasi evaluasi.')
  ).toBeVisible({ timeout: 30000 });


  const approveBtn = page.getByRole('button', { name: 'SIMPAN RENCANA' });
  await expect(approveBtn).toBeVisible({ timeout: 30000 });
  await approveBtn.click();

  // When POST /api/v1/approvals returns 403, MitigationTab catches it and invokes
  // onApproveSuccess with local save confirmation toast
  await expect(page.getByText(/tersimpan secara lokal/i)).toBeVisible({ timeout: 15000 });

  // Route card updates optimistically to approved state
  await expect(page.getByText('DISETUJUI & DIKIRIM')).toBeVisible({ timeout: 15000 });
  await expect(approveBtn).toBeHidden();

  // Audit gap verification: unlike legacy simulation tab, MitigationTab does NOT
  // persist to localStorage ('prehub_sandbox_approvals'), but only holds it in component state.
  const sandbox = await page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('prehub_sandbox_approvals') ?? '[]') as unknown[];
    } catch {
      return [];
    }
  });
  expect(sandbox).toHaveLength(0);
});


