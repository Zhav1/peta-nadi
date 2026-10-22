import { test, expect } from '@playwright/test';
import {
  DEFAULT_HAZARD_RADIUS_KM,
  directionsCache,
  HAZARD_RADIUS_OPTIONS_KM,
  HIGHWAY_JUNCTION_NODES,
  TOLL_CORRIDOR_BUFFER_KM,
  calculateAIDynamicDetourRoutes,
  fetchMapboxAlternativeDrivingRoutes,
  getHaversineDistanceKm,
  isHazardNearTollCorridor,
  isPolylineIntersectingHazardCircle,
  type MapboxDirectionsResponse,
} from '../lib/aiDynamicRouter';

// The in-memory Mapbox cache persists across tests in this file (same worker,
// identical coord keys), so a stale hit can mask fetch entirely — proven: the
// NoRoute test passes alone but fails in full-file runs. Clear per test.
test.beforeEach(() => {
  directionsCache.clear();
});
import type { LonLat } from '../lib/pathDensifier';

const BELAWAN: LonLat = [98.6776, 3.7922];
const TEBING_TINGGI: LonLat = [99.1621, 3.3251];
const LUBUK_PAKAM_HAZARD: LonLat = [98.87, 3.56];
const TOLL_FREE_HAZARD: LonLat = [99.1621, 2.7251];
const WESTERN_ARC_BYPASS: LonLat[] = [BELAWAN, [98.30, 3.60], [98.40, 3.20], TEBING_TINGGI];
const TEST_TOKEN = 'pk.test-token';

const tollGateNodes = HIGHWAY_JUNCTION_NODES.filter((node) => node.isTollGate === true);

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

const directionsRoute = (
  coordinates: LonLat[],
  distanceMeters = 142000,
  durationSeconds = 10800
): MapboxDirectionsResponse => ({
  routes: [
    {
      distance: distanceMeters,
      duration: durationSeconds,
      geometry: { coordinates },
      legs: [{ summary: 'Koridor Uji', annotation: { congestion: coordinates.map(() => 'low') } }],
    },
  ],
});

const waypointCount = (url: string): number => {
  const coordinatePath = url.split('/directions/v5/mapbox/')[1]?.split('?')[0] ?? '';
  return coordinatePath.split(';').length;
};

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

test('D1: hazard radius options are 5/8/15 km with an 8 km default', () => {
  expect([...HAZARD_RADIUS_OPTIONS_KM]).toEqual([5, 8, 15]);
  expect(DEFAULT_HAZARD_RADIUS_KM).toBe(8);
  expect(HAZARD_RADIUS_OPTIONS_KM).toContain(DEFAULT_HAZARD_RADIUS_KM);
});

test('D2: toll corridors are avoided only when the hazard threatens a toll gate', () => {
  const lubukPakamGate = tollGateNodes.find((node) => node.id === 'lubuk_pakam_interchange');
  expect(lubukPakamGate).toBeDefined();

  const distanceKm = getHaversineDistanceKm(LUBUK_PAKAM_HAZARD, lubukPakamGate!.coords);
  expect(distanceKm).toBeLessThanOrEqual(DEFAULT_HAZARD_RADIUS_KM + TOLL_CORRIDOR_BUFFER_KM);

  expect(isHazardNearTollCorridor(LUBUK_PAKAM_HAZARD, DEFAULT_HAZARD_RADIUS_KM)).toBe(true);
  expect(isHazardNearTollCorridor(TOLL_FREE_HAZARD, 15)).toBe(false);
});

test('directions URL carries exclude=toll only when the caller requests it', async () => {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = TEST_TOKEN;
  const mapbox = captureMapboxRequests(() => jsonResponse(directionsRoute([BELAWAN, TEBING_TINGGI])));

  try {
    await fetchMapboxAlternativeDrivingRoutes(BELAWAN, TEBING_TINGGI, [], true);
    await fetchMapboxAlternativeDrivingRoutes(BELAWAN, TEBING_TINGGI, [], false);

    expect(mapbox.urls).toHaveLength(2);
    expect(mapbox.urls[0]).toContain('/directions/v5/mapbox/driving-traffic/');
    expect(mapbox.urls[0]).toContain('exclude=toll');
    expect(mapbox.urls[1]).not.toContain('exclude=toll');
  } finally {
    mapbox.restore();
    delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  }
});

test('NoRoute with exclude=toll retries once without the toll filter', async () => {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = TEST_TOKEN;
  const mapbox = captureMapboxRequests((_url, index) =>
    index === 0
      ? jsonResponse({ code: 'NoRoute', message: 'No route found' })
      : jsonResponse(directionsRoute([BELAWAN, TEBING_TINGGI]))
  );

  try {
    const results = await fetchMapboxAlternativeDrivingRoutes(BELAWAN, TEBING_TINGGI, [], true);

    expect(mapbox.urls).toHaveLength(2);
    expect(mapbox.urls[0]).toContain('exclude=toll');
    expect(mapbox.urls[1]).not.toContain('exclude=toll');
    expect(results[0]?.distanceKm).toBeCloseTo(142, 1);
  } finally {
    mapbox.restore();
    delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  }
});

test('Lubuk Pakam hazard: tolls excluded and every safe polyline clears the hazard circle', async () => {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = TEST_TOKEN;
  const mapbox = captureMapboxRequests((url) =>
    waypointCount(url) > 2
      ? jsonResponse(directionsRoute(WESTERN_ARC_BYPASS))
      : jsonResponse(directionsRoute([BELAWAN, TEBING_TINGGI]))
  );

  try {
    const routes = await calculateAIDynamicDetourRoutes(
      LUBUK_PAKAM_HAZARD,
      DEFAULT_HAZARD_RADIUS_KM,
      BELAWAN,
      TEBING_TINGGI,
      'truck'
    );

    expect(mapbox.urls.some((url) => url.includes('exclude=toll'))).toBe(true);

    // Driveable predicate mirrors the app's own auto-select (DashboardClient):
    // uncompromised, not HOLD (no polyline by design), with real geometry.
    // Short-haul sea/air guard cards are viable:false with the reason stated —
    // the map filters them (CrisisMap) and approval is disabled (MitigationTab).
    const safeRoutes = routes.filter(
      (route) =>
        route.is_compromised !== true &&
        route.safety_status !== 'HOLD_DELAY' &&
        route.waypoints.length > 0
    );
    expect(safeRoutes.length).toBeGreaterThan(0);
    // Pilot view: HOLD is a genuine tactical option (depot + clearance + savings),
    // not a failure state — it must be present, viable, and carry no fake polyline.
    const hold = routes.find((route) => route.safety_status === 'HOLD_DELAY');
    expect(hold).toBeDefined();
    expect(hold?.waypoints).toEqual([]);
    expect(hold?.is_compromised).toBe(false);
    expect(hold?.viable).toBe(true);
    expect(hold?.economic_comparison).toBeDefined();

    // Driveable polylines only (HOLD and guard cards excluded by the predicate above).
    for (const route of safeRoutes) {
      expect(route.waypoints.length).toBeGreaterThan(0);
      const polyline = route.waypoints.map((waypoint) => [waypoint.lon, waypoint.lat] as LonLat);
      expect(isPolylineIntersectingHazardCircle(polyline, LUBUK_PAKAM_HAZARD, DEFAULT_HAZARD_RADIUS_KM)).toBe(false);
    }
  } finally {
    mapbox.restore();
    delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  }
});

test('hazard far from toll corridors keeps toll lanes available', async () => {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = TEST_TOKEN;
  const mapbox = captureMapboxRequests((url) =>
    waypointCount(url) > 2
      ? jsonResponse(directionsRoute(WESTERN_ARC_BYPASS))
      : jsonResponse(directionsRoute([BELAWAN, TEBING_TINGGI]))
  );

  try {
    await calculateAIDynamicDetourRoutes(
      TOLL_FREE_HAZARD,
      DEFAULT_HAZARD_RADIUS_KM,
      BELAWAN,
      TEBING_TINGGI,
      'truck'
    );

    expect(mapbox.urls.length).toBeGreaterThan(0);
    expect(mapbox.urls.every((url) => !url.includes('exclude=toll'))).toBe(true);
  } finally {
    mapbox.restore();
    delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  }
});

test('offline HOLD card carries no polyline and flags the compromised corridor honestly', async () => {
  delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const mapbox = captureMapboxRequests(() => jsonResponse(directionsRoute(WESTERN_ARC_BYPASS)));

  try {
    const routes = await calculateAIDynamicDetourRoutes(
      LUBUK_PAKAM_HAZARD,
      DEFAULT_HAZARD_RADIUS_KM,
      BELAWAN,
      TEBING_TINGGI,
      'truck'
    );

    expect(mapbox.urls).toHaveLength(0);

    // HOLD stays the honest card: real depot economics, no fabricated polyline.
    const hold = routes.find((route) => route.safety_status === 'HOLD_DELAY');
    expect(hold).toBeDefined();
    expect(hold?.waypoints).toEqual([]);
    expect(hold?.is_compromised).toBe(false);
    expect(hold?.viable).toBe(true);
    expect(hold?.economic_comparison).toBeDefined();
    expect(hold?.eta_minutes).toBeGreaterThan(180);

    // Pilot rule: interpolated straight-line geometry is never a verified-driveable
    // corridor. Land corridors must be flagged COMPROMISED with the cause stated —
    // never green SAFE_DETOUR on an estimate. Sea/air are graph-based (no Mapbox
    // needed) so they legitimately stay available.
    const landCorridors = routes.filter(
      (route) => route.corridor_type === 'land_primary' || route.corridor_type === 'land_detour'
    );
    expect(landCorridors.length).toBeGreaterThan(0);
    for (const land of landCorridors) {
      expect(land.is_compromised).toBe(true);
      expect(land.safety_status).toBe('COMPROMISED');
      expect(land.safety_tag).toContain('TANPA GEOMETRI LIVE');
    }
    for (const route of routes.filter((r) => r.safety_status === 'SAFE_DETOUR')) {
      expect(route.corridor_type).not.toMatch(/^land_/);
    }
  } finally {
    mapbox.restore();
  }
});
