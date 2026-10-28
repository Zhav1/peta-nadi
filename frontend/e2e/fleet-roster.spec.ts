// Phase 173 (M9) — Armada drawer: tenant-scoped roster, per-vehicle detail,
// and honest unknown-location handling.
//
// Pins three regressions:
//   1. The header trigger opens a real drawer whose counts are labelled
//      (`{total} unit · {live} live GPS`) — no more unlabelled twin numbers.
//   2. A unit with no GPS ping is never plotted / never given a Medan point.
//   3. Roster rows come from the dispatcher's JWT company_id claim only.

import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

const DISPATCHER = {
  id: 'armada-dispatcher-1',
  company_id: 'pos_logistik',
  org_name: 'PT Pos Logistik Indonesia',
  name: 'Armada E2E Dispatcher',
  email: 'armada@e2e.test',
  role: 'DISPATCHER',
  permissions: ['fleet:read', 'fleet:write', 'heatmap:read', 'prices:read', 'reports:read', 'audit:read'],
  is_offline_guest: false,
};

const REGULATOR = {
  ...DISPATCHER,
  id: 'armada-regulator-1',
  company_id: undefined,
  org_name: 'Badan Pangan Nasional',
  name: 'Armada E2E Regulator',
  email: 'regulator@e2e.test',
  role: 'REGULATOR',
  permissions: ['fleet:read', 'heatmap:read', 'reports:read', 'audit:read'],
};

const GUEST = {
  ...DISPATCHER,
  id: 'armada-guest-1',
  company_id: undefined,
  org_name: 'Sandbox LRIP',
  name: 'Armada E2E Guest',
  email: 'guest@e2e.test',
  role: 'GUEST',
  permissions: [],
  is_offline_guest: true,
};

function vehicle(overrides: Record<string, unknown>) {
  return {
    vehicle_id: 'TRK-GPS-01',
    name: 'Truk Pangan 01',
    modality: 'truck',
    path: [
      [98.6776, 3.7922],
      [98.6712, 3.6013],
    ],
    speed_kmh: 64,
    status: 'moving',
    company_id: 'pos_logistik',
    company_name: 'PT Pos Logistik Indonesia',
    is_tenant_asset: true,
    tracking_mode: 'LIVE_GPS',
    last_ping_seconds_ago: 12,
    license_plate: 'BK 1234 XY',
    driver_name: 'Budi Santoso',
    driver_phone: '0812-0000-0001',
    origin: 'Pelabuhan Belawan',
    destination: 'Hub Logistik Medan',
    cargo: '18 Ton Beras',
    ...overrides,
  };
}

// 5 tenant units: 3 LIVE_GPS (one without any coordinate) + 2 ROUTE_ESTIMATED.
const TENANT_VEHICLES = [
  vehicle({ vehicle_id: 'TRK-GPS-01', name: 'Truk Pangan 01', current_coords: [98.6712, 3.6013] }),
  vehicle({
    vehicle_id: 'TRK-GPS-02',
    name: 'Truk Pangan 02',
    license_plate: 'BK 5678 AB',
    driver_name: 'Siti Aminah',
    current_coords: [100.7, -0.15],
    status: 'anchored',
  }),
  // Live tracking mode but the hardware has not reported a fix: must stay unplotted.
  vehicle({
    vehicle_id: 'TRK-NOGPS-03',
    name: 'Truk Pangan 03',
    license_plate: 'BK 9012 CD',
    driver_name: 'Joko Widodo',
    current_coords: undefined,
    last_ping_seconds_ago: undefined,
  }),
  vehicle({
    vehicle_id: 'TRK-EST-04',
    name: 'Truk Estimasi 04',
    license_plate: 'BK 3456 EF',
    driver_name: 'Rina Kartika',
    tracking_mode: 'ROUTE_ESTIMATED',
    telemetry_source: 'ROUTE_ESTIMATED',
    signal_status: 'SIMULATION_CACHE',
    current_coords: [98.7, 3.55],
    last_ping_seconds_ago: undefined,
  }),
  vehicle({
    vehicle_id: 'TRK-EST-05',
    name: 'Truk Estimasi 05',
    license_plate: 'BK 7890 GH',
    driver_name: 'Agus Salim',
    tracking_mode: 'ROUTE_ESTIMATED',
    telemetry_source: 'ROUTE_ESTIMATED',
    signal_status: 'SIMULATION_CACHE',
    current_coords: [101.4, 0.5],
    last_ping_seconds_ago: undefined,
  }),
];

const OTHER_TENANT_VEHICLE = vehicle({
  vehicle_id: 'TRK-OTHER-99',
  name: 'Truk Tenant Lain',
  license_plate: 'B 9999 ZZ',
  company_id: 'pelindo_belawan',
  company_name: 'PT Pelabuhan Indonesia',
  is_tenant_asset: false,
  current_coords: [104.75, -2.99],
});

async function mockDashboard(page: Page, session: Record<string, unknown>): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('prehub_auth_token', 'armada-e2e-token');
    } catch {
      /* ignore */
    }
  });

  await page.route(/\/api\//, async (route) => {
    const url = route.request().url();
    const ok = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.includes('/api/v1/auth/me') || url.includes('/api/v1/auth/session')) {
      return ok(session);
    }
    if (url.includes('/api/v1/fleet/travels')) {
      return ok({
        total: 1,
        items: [
          {
            id: 'TRV-173-1',
            truck_id: 'TRK-GPS-01',
            company_id: 'pos_logistik',
            origin_name: 'Pelabuhan Belawan',
            destination_name: 'Hub Logistik Medan',
            commodity_key: 'beras',
            status: 'moving',
            created_at: new Date().toISOString(),
          },
        ],
      });
    }
    if (url.includes('/api/v1/fleet/vehicles')) {
      return ok({
        status: 'success',
        total_vehicles: TENANT_VEHICLES.length + 1,
        updated_at: new Date().toISOString(),
        vehicles: [...TENANT_VEHICLES, OTHER_TENANT_VEHICLE],
      });
    }
    if (url.includes('/api/v1/weather/summary')) {
      return ok({
        bbox: [94, -6, 108, 6],
        generated_at: new Date().toISOString(),
        cuaca: { count: 0, total: 0, status: 'empty', reason: null, source: 'BMKG', window_hours: 24 },
        waspada: { count: 0, total: 0, status: 'empty', reason: null, source: 'BMKG', window_hours: 24 },
      });
    }
    if (url.includes('/api/v1/weather/spatial-polygons')) {
      return ok({ type: 'FeatureCollection', features: [] });
    }
    if (url.includes('/api/v1/fire/hotspots')) {
      return ok({ hotspots: [], total: 0, status: 'ok', reason: null, source: 'VIIRS_SNPP_NRT' });
    }
    if (url.includes('/api/v1/bnpb/events')) {
      return ok({ events: [], total: 0, status: 'ok', updated_at: new Date().toISOString() });
    }
    if (url.includes('/api/v1/news/hitl-pending')) {
      return ok({ count: 0, items: [], pending_approvals: [] });
    }
    if (url.includes('/health/sources')) return ok({ sources: [] });
    return ok({ status: 'ok', items: [], total: 0, sources: [] });
  });
}

async function openRoster(page: Page): Promise<void> {
  const trigger = page.getByTestId('armada-trigger');
  await expect(trigger).toBeVisible({ timeout: 30000 });
  await trigger.click();
  await expect(page.getByTestId('armada-drawer')).toBeVisible();
}

test('drawer states both counts and lists all tenant units', async ({ page }) => {
  await mockDashboard(page, DISPATCHER);
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await openRoster(page);

  await expect(page.getByTestId('armada-counts')).toHaveText('5 unit · 3 live GPS');
  await expect(page.locator('[data-testid^="armada-row-"]')).toHaveCount(5);

  const trigger = page.getByTestId('armada-trigger');
  expect(await trigger.getAttribute('title')).toContain('5 unit · 3 live GPS');

  // Provenance is textual, not colour-only.
  await expect(page.getByTestId('armada-row-TRK-GPS-01')).toContainText('live');
  await expect(page.getByTestId('armada-row-TRK-EST-04')).toContainText('estimasi rute');

  // Phase 176.5 — row subtitle is modality + status, never a truncated
  // distance with a stray parenthesis ("... km)").
  const row = page.getByTestId('armada-row-TRK-GPS-01');
  await expect(row).toContainText('truk · bergerak');
  await expect(row).not.toContainText('km)');
});

test('selecting a row opens the in-drawer detail with plate, driver and status', async ({ page }) => {
  await mockDashboard(page, DISPATCHER);
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await openRoster(page);

  await page.getByTestId('armada-row-TRK-GPS-01').click();
  const detail = page.getByTestId('armada-detail');
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('BK 1234 XY');
  await expect(detail).toContainText('Budi Santoso');
  await expect(detail).toContainText('bergerak');
  await expect(detail).toContainText('Pelabuhan Belawan → Hub Logistik Medan');
  // Existing travel ledger is reused for today's rits (never invented client-side).
  await expect(detail).toContainText('moving');
});

test('a unit without coordinates is honest: no Medan fallback anywhere', async ({ page }) => {
  await mockDashboard(page, DISPATCHER);
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await openRoster(page);

  await expect(page.getByTestId('armada-unknown-location-count')).toHaveText('1 unit tanpa lokasi');

  await page.getByTestId('armada-row-TRK-NOGPS-03').click();
  const detail = page.getByTestId('armada-detail');
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId('armada-detail-no-location')).toHaveText('Lokasi belum tersedia');
  // No fabricated coordinates leak into the detail.
  await expect(detail).not.toContainText('3.5952');
  await expect(detail).not.toContainText('98.6722');

  // Layer-level pin: the hardcoded Medan fallback is gone from the source.
  const layerSource = fs.readFileSync(
    path.join(process.cwd(), 'components/map/FleetVehicleLayer.tsx'),
    'utf8',
  );
  expect(layerSource).not.toContain('98.6722');
  expect(layerSource).not.toContain('3.5952');
});

test("another tenant's plate never appears in the roster", async ({ page }) => {
  await mockDashboard(page, DISPATCHER);
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await openRoster(page);

  await expect(page.locator('[data-testid^="armada-row-"]')).toHaveCount(5);
  await expect(page.getByTestId('armada-row-TRK-OTHER-99')).toHaveCount(0);
  await expect(page.getByTestId('armada-drawer')).not.toContainText('B 9999 ZZ');
  await expect(page.getByTestId('armada-drawer')).not.toContainText('Truk Tenant Lain');
});

test('regulator cannot open tenant roster contents', async ({ page }) => {
  await mockDashboard(page, REGULATOR);
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#auth-persona-badge-btn')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('armada-trigger')).toHaveCount(0);
  await expect(page.getByTestId('armada-drawer')).toHaveCount(0);
});

test('guest cannot open tenant roster contents', async ({ page }) => {
  await mockDashboard(page, GUEST);
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#auth-persona-badge-btn')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('armada-trigger')).toHaveCount(0);
  await expect(page.getByTestId('armada-drawer')).toHaveCount(0);
});
