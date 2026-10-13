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
// WP-A1 (D7): simulation tab explains macro-vs-tactical scope
// ---------------------------------------------------------------------------

test('simulation tab shows the macro-vs-tactical explainer card', async ({ page }) => {
  await page.goto('/dashboard?section=simulation');
  await expect(page.getByText('Simulator Makro (B2G)')).toBeVisible({ timeout: 30000 });
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
// WP-A3 (D1): guest deploy keeps 403 and lands in local sandbox with a toast
// ---------------------------------------------------------------------------

test('guest deploy on 403 shows the sandbox toast and saves locally', async ({ page }) => {
  await page.route('**/api/v1/approvals', async (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ detail: { error: 'FORBIDDEN' } }),
    })
  );

  await page.goto('/dashboard?section=simulation');
  const deploy = page.getByRole('button', { name: 'Terapkan Skenario Terpadu' });
  await expect(deploy).toBeVisible({ timeout: 30000 });
  await deploy.click();

  await expect(page.getByText('Mode Sandbox: tersimpan lokal')).toBeVisible({ timeout: 30000 });

  const sandbox = await page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('prehub_sandbox_approvals') ?? '[]') as unknown[];
    } catch {
      return [];
    }
  });
  expect(sandbox).toHaveLength(1);
});
