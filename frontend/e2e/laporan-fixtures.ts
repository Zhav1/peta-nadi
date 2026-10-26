// M8 Phase 3: shared hermetic fixtures for laporan E2E.
// Every spec mocks the network (single /api/ branch handler) so runs never
// depend on live Render. No backend changes, no real Mapbox needed.

import type { Page } from '@playwright/test';
import type { ERPSummaryResponse, ERPTripRow } from '@/lib/types';

export function dispatcherProfile() {
  return {
    id: 'laporan-dispatcher-1',
    company_id: 'pos_logistik',
    org_name: 'PT Samudera Logistik Sumatra',
    name: 'Dispatcher E2E',
    email: 'dispatcher@e2e.test',
    role: 'DISPATCHER',
    permissions: ['fleet:read', 'fleet:write', 'routes:plan', 'approvals:write', 'manifests:upload', 'scenarios:run'],
    is_offline_guest: false,
  };
}

export function regulatorProfile() {
  return {
    id: 'laporan-regulator-1',
    company_id: 'bapanas',
    org_name: 'Badan Pangan Nasional',
    name: 'Regulator E2E',
    email: 'regulator@e2e.test',
    role: 'REGULATOR',
    permissions: ['heatmap:read', 'prices:read', 'reports:read', 'reports:export', 'audit:read', 'scenarios:run'],
    is_offline_guest: false,
  };
}

function tripRow(partial: Partial<ERPTripRow> & { id: string }): ERPTripRow {
  return {
    truck_id: 'B 0000 XXX',
    origin_name: 'Medan',
    destination_name: 'Tebing Tinggi',
    commodity_key: 'beras',
    cargo_tonnage: 5,
    status: 'delivered',
    rerouted: false,
    saved_time_hours: 1,
    saved_fuel_liters: 20,
    saved_cost_idr: 0,
    savings_breakdown: { fuel_idr: 0, toll_idr: 0, spoilage_idr: 0, labor_idr: 0 },
    efficiency_pct: 0,
    hedging_policy: null,
    created_at: '2026-10-18T08:00:00Z',
    ...partial,
  } as ERPTripRow;
}

export function dispatcherSummary(overrides?: { costSavedIdr?: number }): ERPSummaryResponse {
  const costSaved = overrides?.costSavedIdr ?? 1350000;
  return {
    status: 'ok',
    generated_at: '2026-10-20T08:00:00Z',
    company_id: 'pos_logistik',
    scope: 'DISPATCHER_DETAIL',
    storage: 'postgres',
    totals: {
      total_trips: 3,
      active_trips: 2,
      delivered_trips: 1,
      failed_trips: 0,
      reroute_success_count: 1,
      reroute_failed_count: 0,
      reroute_success_rate_pct: 100,
      sla_compliance_pct: 90,
      time_saved_hours: 5.5,
      fuel_saved_liters: 120.5,
      cost_saved_idr: costSaved,
      baseline_cost_idr: 10000000,
      actual_cost_idr: 10000000 - costSaved,
      cost_efficiency_pct: 13.5,
      avg_cost_saved_per_trip_idr: 450000,
      savings_breakdown: { fuel_idr: 600000, toll_idr: 400000, spoilage_idr: 200000, labor_idr: 150000 },
    },
    per_company: [],
    trips: [
      tripRow({
        id: 'RIT-001',
        truck_id: 'B 1234 XYZ',
        truck_name: 'Truk Beras 01',
        origin_name: 'Medan',
        destination_name: 'Tebing Tinggi',
        commodity_key: 'beras',
        cargo_tonnage: 8,
        status: 'delivered',
        rerouted: false,
        saved_time_hours: 2,
        saved_fuel_liters: 50,
        saved_cost_idr: 1000000,
        efficiency_pct: 12.5,
        created_at: '2026-10-18T08:00:00Z',
        // Measured rit: backend ledger provenance present → economy + SK badge render.
        baseline_distance_km: 74.4,
        actual_fuel_liters: 22,
        actual_recorded: true,
        fuel_rate_used_idr: 6800,
        fuel_sk_id: 'SK-E2E-2026-001',
        fuel_sk_number: 'SK-E2E-2026-001',
        fuel_effective_date: '2026-10-01',
        fuel_source: 'ESDM_SK',
        fuel_is_fallback: false,
        fuel_efficiency_used_kmpl: 3.29,
        fuel_efficiency_source: 'golongan_default',
        fuel_load_factor: 0.571,
        reefer_fuel_lph_used: 0,
      }),
      tripRow({
        id: 'RIT-002',
        truck_id: 'B 5678 ABC',
        truck_name: 'Truk Cabai 02',
        origin_name: 'Belawan',
        destination_name: 'Medan',
        commodity_key: 'cabai_merah',
        cargo_tonnage: 3,
        status: 'rerouted',
        rerouted: true,
        hedging_policy: 'REROUTE',
        saved_time_hours: -0.5,
        saved_fuel_liters: -10,
        saved_cost_idr: -150000,
        efficiency_pct: -2.1,
        created_at: '2026-10-19T09:30:00Z',
      }),
      tripRow({
        id: 'RIT-003',
        truck_id: 'B 9012 DEF',
        truck_name: 'Truk Daging 03',
        origin_name: 'Medan',
        destination_name: 'Binjai',
        commodity_key: 'daging_sapi',
        cargo_tonnage: 4,
        status: 'moving',
        rerouted: false,
        saved_time_hours: 4,
        saved_fuel_liters: 80.5,
        saved_cost_idr: 500000,
        efficiency_pct: 8.2,
        created_at: '2026-10-19T14:00:00Z',
        // Fallback provenance + reefer burn → fallback chip + reefer line render.
        baseline_distance_km: 28.5,
        actual_fuel_liters: 9.5,
        actual_recorded: true,
        fuel_rate_used_idr: 6800,
        fuel_sk_id: null,
        fuel_sk_number: null,
        fuel_effective_date: '2026-10-26',
        fuel_source: 'PERTAMINA_FALLBACK',
        fuel_is_fallback: true,
        fuel_efficiency_used_kmpl: 3.15,
        fuel_efficiency_source: 'golongan_default',
        fuel_load_factor: 0.333,
        reefer_fuel_lph_used: 2,
      }),
    ],
    business_notes: ['Snapshot uji E2E M8 Phase 3.'],
  };
}

export function regulatorSummary(): ERPSummaryResponse {
  return {
    status: 'ok',
    generated_at: '2026-10-20T08:00:00Z',
    company_id: null,
    scope: 'REGULATOR_AGGREGATE',
    storage: 'postgres',
    totals: {
      total_trips: 10,
      active_trips: 3,
      delivered_trips: 6,
      failed_trips: 1,
      reroute_success_count: 4,
      reroute_failed_count: 1,
      reroute_success_rate_pct: 80,
      sla_compliance_pct: 85,
      time_saved_hours: 20,
      fuel_saved_liters: 400,
      cost_saved_idr: 5000000,
      baseline_cost_idr: 40000000,
      actual_cost_idr: 35000000,
      cost_efficiency_pct: 12.5,
      avg_cost_saved_per_trip_idr: 500000,
      savings_breakdown: { fuel_idr: 2000000, toll_idr: 1500000, spoilage_idr: 1000000, labor_idr: 500000 },
    },
    per_company: [
      {
        company_id: 'pos_logistik',
        total_trips: 6,
        delivered_trips: 4,
        failed_trips: 1,
        reroute_success_count: 3,
        reroute_success_rate_pct: 75,
        time_saved_hours: 12,
        fuel_saved_liters: 250,
        cost_saved_idr: 3200000,
        cost_efficiency_pct: 12,
      },
      {
        company_id: 'mitra_timur',
        total_trips: 4,
        delivered_trips: 2,
        failed_trips: 0,
        reroute_success_count: 1,
        reroute_success_rate_pct: 100,
        time_saved_hours: 8,
        fuel_saved_liters: 150,
        cost_saved_idr: 1800000,
        cost_efficiency_pct: 13,
      },
    ],
    trips: [],
    business_notes: ['Agregat pengawas: rincian per rit disembunyikan.'],
  };
}

interface MockLaporanApiOptions {
  role?: 'DISPATCHER' | 'REGULATOR';
  summary?: () => unknown;
  onPatchTravel?: (url: string, body: unknown) => unknown;
  /** Override the /api/v1/approvals payload (default: empty ledger). Additive; existing callers unaffected. */
  approvals?: () => unknown;
}

/** Single branch handler for every /api/ request: specific mocks first, generic hermetic sink last. */
export async function mockLaporanApi(page: Page, opts: MockLaporanApiOptions = {}): Promise<void> {
  const role = opts.role ?? 'DISPATCHER';
  const profile = role === 'DISPATCHER' ? dispatcherProfile() : regulatorProfile();
  await page.addInitScript(() => {
    try {
      localStorage.setItem('prehub_auth_token', 'laporan-e2e-token');
    } catch {
      /* ignore */
    }
  });
  await page.route(/\/api\//, async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    const ok = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.includes('/api/v1/auth/me')) return ok(profile);
    if (url.includes('/api/v1/auth/session')) return ok(profile);
    if (url.includes('/api/v1/erp/summary')) {
      if (method !== 'GET') {
        await route.fulfill({ status: 405, contentType: 'application/json', body: '{}' });
        return;
      }
      return ok(opts.summary ? opts.summary() : dispatcherSummary());
    }
    if (url.includes('/api/v1/fleet/travels/') && method === 'PATCH') {
      let body: unknown = {};
      try {
        body = req.postDataJSON();
      } catch {
        body = {};
      }
      return ok(opts.onPatchTravel ? opts.onPatchTravel(url, body) : { id: 'RIT-001', status: 'delivered' });
    }
    if (url.includes('/api/v1/approvals')) return ok(opts.approvals ? opts.approvals() : { items: [], total: 0 });
    if (url.includes('/health/sources')) return ok({ sources: [] });
    return ok({ status: 'ok', items: [], total: 0, sources: [] });
  });
}
