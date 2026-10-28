// Phase 170 — small-town routing truth (SPEC decision 5).
//
// Pins the three defects this phase removed from the operator surface:
//   1. a solver `no_route` used to be swallowed by an early return, so the user
//      saw nothing at all (`routing-no-route-reason` is the regression guard);
//   2. every corridor looked equally "live" — cards now carry a provenance
//      badge (`geometri jalan` / `koridor hub` / `simulasi offline`);
//   3. identical geometries could render twice as separate alternatives.
//
// Hermetic: every /api/ call AND the Mapbox Directions call is intercepted.

import { test, expect, type Page } from '@playwright/test';

const JUST_NOW = new Date(Date.now() - 60_000).toISOString();
const BBOX = [94, -6, 108, 6];
const NO_ROUTE_REASON =
  'Titik asal berjarak 120 km dari node jaringan jalan terdekat (batas snapping 75 km).';

const DISPATCHER = {
  id: 'routing-snap-dispatcher-1',
  company_id: 'pos_logistik',
  org_name: 'PT Samudera Logistik Sumatra',
  name: 'Small Town Routing E2E',
  email: 'routing-snap@e2e.test',
  role: 'DISPATCHER',
  permissions: ['fleet:read', 'heatmap:read', 'prices:read', 'reports:read', 'audit:read', 'scenarios:run'],
  is_offline_guest: false,
};

const CRISIS_ID = 'routing-snap-crisis-1';

const MAPBOX_LINE = [
  [98.6776, 3.7922],
  [98.88, 3.64],
  [99.1621, 3.3251],
];

/** One Mapbox Directions payload: one road-geometry route (no alternatives). */
function mapboxPayload() {
  return {
    routes: [
      {
        distance: 142000,
        duration: 10800,
        geometry: { coordinates: MAPBOX_LINE },
        legs: [{ summary: 'Koridor Uji', annotation: { congestion: MAPBOX_LINE.map(() => 'low') } }],
      },
    ],
  };
}

function weatherSummary() {
  const bucket = {
    count: 1,
    total: 1,
    status: 'ok',
    reason: null,
    source: 'BMKG',
    valid_until: null,
    window_hours: 24,
  };
  return { bbox: BBOX, generated_at: JUST_NOW, cuaca: bucket, waspada: { ...bucket, count: 0, total: 0 } };
}

function weatherPolygons() {
  const meta = {
    status: 'ok',
    reason: null,
    total: 0,
    count: 0,
    capped: false,
    updated_at: JUST_NOW,
    validity_hours: 6,
    stale_ceiling_hours: 24,
    max_features: 24,
  };
  return { type: 'FeatureCollection', features: [], metadata: meta, meta };
}

async function seedAuth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('prehub_auth_token', 'routing-snap-e2e-token');
    } catch {
      /* ignore */
    }
  });
}

async function mockBaseApi(
  page: Page,
  handlers: { routing?: unknown; crisis?: unknown } = {}
): Promise<void> {
  await page.route(/directions\/v5\/mapbox/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mapboxPayload()),
    });
  });

  await page.route(/\/api\//, async (route) => {
    const url = route.request().url();
    const ok = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.includes('/api/v1/auth/me') || url.includes('/api/v1/auth/session')) return ok(DISPATCHER);
    if (url.includes('/api/v1/routing/optimize')) return ok(handlers.routing ?? routingSuccess());
    if (url.includes('/api/v1/incidents/impact-assessment')) {
      return ok({
        incident_id: CRISIS_ID,
        impacted_vehicles: [],
        total_impacted: 0,
        total_at_risk_value_idr: 0,
      });
    }
    if (url.includes(`/api/v1/incidents/${CRISIS_ID}`)) return ok(handlers.crisis ?? baseCrisis());
    if (url.includes('/api/v1/weather/spatial-polygons')) return ok(weatherPolygons());
    if (url.includes('/api/v1/weather/summary')) return ok(weatherSummary());
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

function routingSuccess() {
  return {
    status: 'success',
    solver: 'Deterministic CPU Routing Solver (NetworkX + OR-Tools)',
    compute_time_ms: 4.2,
    optimization_summary: { hazard_segments_avoided: 0, avg_corridor_speed_kmh: 48, speed_source: 'seed_fallback' },
    point_to_point_path: { status: 'success', routes: [] },
    routes: [],
  };
}

function routingNoRoute() {
  return {
    status: 'success',
    solver: 'Deterministic CPU Routing Solver (NetworkX + OR-Tools)',
    compute_time_ms: 3.1,
    optimization_summary: { hazard_segments_avoided: 0, avg_corridor_speed_kmh: 48, speed_source: 'seed_fallback' },
    point_to_point_path: {
      status: 'no_route',
      reason_code: 'ORIGIN_TOO_FAR',
      reason: NO_ROUTE_REASON,
      message: NO_ROUTE_REASON,
      routes: [],
    },
    routes: [],
  };
}

function waypoints(coords: number[][]) {
  return coords.map(([lon, lat]) => ({ lat, lon }));
}

function baseRoute(overrides: Record<string, unknown>) {
  return {
    description: 'Jalur darat langsung tercepat',
    waypoints: waypoints(MAPBOX_LINE),
    distance_km: 142,
    eta_minutes: 180,
    fuel_increase_pct: 0,
    risk_score: 0.1,
    corridor_type: 'land_primary',
    safety_status: 'CLEAR',
    is_compromised: false,
    viable: true,
    ...overrides,
  };
}

function baseCrisis() {
  const live = baseRoute({ id: 'route-live', route_name: 'Koridor Darat Utama', source: 'live' });
  // Same polyline as `live`, different id/name: Mapbox alternatives can repeat
  // a geometry and it must not become a second card.
  const duplicate = baseRoute({ id: 'route-live-dup', route_name: 'Rute Utama (duplikat geometri)', source: 'live' });
  const hub = baseRoute({
    id: 'route-hub',
    route_name: 'Koridor Intermoda Laut + Darat',
    description: 'Koridor hub pelabuhan (bukan geometri jalan)',
    corridor_type: 'sea_intermodal',
    safety_status: 'SAFE_DETOUR',
    waypoints: waypoints([
      [98.6776, 3.7922],
      [99.45, 3.36],
      [105.7533, -5.8711],
    ]),
    distance_km: 890,
    eta_minutes: 2100,
  });

  return {
    crisis_id: CRISIS_ID,
    title: 'Disrupsi Koridor Belawan - Tebing Tinggi',
    type: 'flood',
    severity: 'high',
    status: 'validated',
    validated: true,
    lat: 3.1,
    lon: 98.5,
    region: 'north_sumatra',
    zone_tier: 'RED_CONFIRMED',
    overall_confidence: 0.91,
    decision_support_output: 'Rute pengalihan aman teridentifikasi.',
    route_recommendations: [live, duplicate, hub],
  };
}

// ---------------------------------------------------------------------------
// 1. no_route is surfaced, never swallowed (the regression being fixed)
// ---------------------------------------------------------------------------

test('solver no_route surfaces the backend reason instead of rendering nothing', async ({ page }) => {
  await seedAuth(page);
  await mockBaseApi(page, { routing: routingNoRoute() });

  await page.goto('/dashboard?origin=belawan&dest=tebingtinggi', { waitUntil: 'domcontentloaded' });

  const reason = page.getByTestId('routing-no-route-reason');
  await expect(reason).toBeVisible({ timeout: 30000 });
  await expect(reason).toContainText('120 km');

  // The already-rendered visual corridor is not cleared and the failure is not
  // reported as a generic "route failed" — the refusal is additive information.
  await expect(page.getByText('Rute gagal dihitung')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// 2 + 3. Provenance badge per route card, and no duplicate geometries
// ---------------------------------------------------------------------------

test('route cards carry provenance badges and identical geometries render once', async ({ page }) => {
  await seedAuth(page);
  await mockBaseApi(page, { crisis: baseCrisis() });

  await page.goto(`/dashboard?crisis=${CRISIS_ID}`, { waitUntil: 'domcontentloaded' });

  // The crisis drawer opens on Evidence; the corridor cards live in Mitigasi.
  const mitigationTab = page.getByRole('button', { name: 'Mitigasi & Rute' });
  await expect(mitigationTab).toBeVisible({ timeout: 30000 });
  await mitigationTab.click();

  // Duplicate geometry collapsed: 3 returned, 2 rendered.
  await expect(page.locator('#route-option-0')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#route-option-1')).toBeVisible();
  await expect(page.locator('#route-option-2')).toHaveCount(0);

  // Mapbox road geometry vs hub-graph geometry, stated honestly.
  await expect(page.getByTestId('route-provenance-0')).toHaveText('geometri jalan');
  await expect(page.getByTestId('route-provenance-1')).toHaveText('koridor hub');
});
