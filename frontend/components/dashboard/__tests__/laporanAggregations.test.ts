// @ts-nocheck
// M8 Phase 1: unit tests for laporanAggregations (vitest).
// Run with: npx vitest run components/dashboard/__tests__/laporanAggregations.test.ts
import { describe, it, expect } from 'vitest';
import {
  applyLaporanFilters,
  formatJtM,
  groupByCommodityTier,
  groupByPeriod,
  resolveCommodityTier,
} from '@/lib/laporanAggregations';

function trip(over: Record<string, unknown> = {}) {
  return {
    id: 'T1',
    truck_id: 'TRK1',
    origin_name: 'Belawan',
    destination_name: 'Pekanbaru',
    commodity_key: 'beras',
    cargo_tonnage: 4,
    status: 'delivered',
    rerouted: false,
    saved_time_hours: 2,
    saved_fuel_liters: 10,
    saved_cost_idr: 1_500_000,
    savings_breakdown: { fuel_idr: 0, toll_idr: 0, spoilage_idr: 0, labor_idr: 0 },
    efficiency_pct: 5,
    created_at: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

describe('laporanAggregations', () => {
  it('handles empty input', () => {
    expect(groupByCommodityTier([]).map((g) => g.tripCount)).toEqual([0, 0, 0, 0, 0]);
    expect(groupByPeriod([], 'weekly')).toEqual([]);
    expect(groupByPeriod([], 'monthly')).toEqual([]);
    expect(applyLaporanFilters([], {})).toEqual([]);
  });

  it('groups by commodity tier with Lainnya fallback', () => {
    const trips = [
      trip({ id: 'A', commodity_key: 'cabai_merah', saved_cost_idr: 100 }),
      trip({ id: 'B', commodity_key: 'ikan_segar', saved_cost_idr: 200 }),
      trip({ id: 'C', commodity_key: 'bawang_merah', saved_cost_idr: 300 }),
      trip({ id: 'D', commodity_key: 'beras', saved_cost_idr: 400 }),
      trip({ id: 'E', commodity_key: 'kayu_lapis_X', saved_cost_idr: 500 }),
    ];
    const groups = groupByCommodityTier(trips as never);
    const byTier = Object.fromEntries(groups.map((g) => [g.tier, g]));
    expect(byTier.ultra.tripCount).toBe(1);
    expect(byTier.cold.tripCount).toBe(1);
    expect(byTier.semi.tripCount).toBe(1);
    expect(byTier.dry.tripCount).toBe(1);
    expect(byTier.Lainnya.tripCount).toBe(1);
    expect(byTier.Lainnya.totalSavedIdr).toBe(500);
    expect(resolveCommodityTier(undefined)).toBe('Lainnya');
    expect(resolveCommodityTier('')).toBe('Lainnya');
  });

  it('formats jt/M thresholds (id-ID)', () => {
    expect(formatJtM(500_000)).toBe('Rp 500.000');
    expect(formatJtM(2_500_000)).toContain('jt');
    expect(formatJtM(2_500_000_000)).toContain('M');
    expect(formatJtM(-3_000_000)).toContain('jt');
    expect(formatJtM(0)).toBe('Rp 0');
  });

  it('groups by period weekly/monthly', () => {
    const trips = [
      trip({ id: 'A', created_at: '2026-10-01T00:00:00.000Z' }),
      trip({ id: 'B', created_at: '2026-10-02T00:00:00.000Z' }),
      trip({ id: 'C', created_at: '2026-11-05T00:00:00.000Z' }),
    ];
    const monthly = groupByPeriod(trips as never, 'monthly');
    expect(monthly.map((b) => b.key)).toContain('2026-10');
    expect(monthly.map((b) => b.key)).toContain('2026-11');
    const weekly = groupByPeriod(trips as never, 'weekly');
    expect(weekly.length).toBeGreaterThanOrEqual(2);
    expect(weekly.reduce((n, b) => n + b.tripCount, 0)).toBe(3);
  });

  it('applies filters (tier/status/search/date)', () => {
    const trips = [
      trip({ id: 'A', commodity_key: 'beras', status: 'delivered', created_at: '2026-10-01T00:00:00Z' }),
      trip({ id: 'B', commodity_key: 'cabai_merah', status: 'failed', created_at: '2026-10-20T00:00:00Z' }),
    ];
    expect(applyLaporanFilters(trips as never, { tier: 'dry' }).map((t) => t.id)).toEqual(['A']);
    expect(applyLaporanFilters(trips as never, { status: 'failed' }).map((t) => t.id)).toEqual(['B']);
    expect(applyLaporanFilters(trips as never, { search: 'cabai' }).map((t) => t.id)).toEqual(['B']);
    expect(
      applyLaporanFilters(trips as never, { startDate: '2026-10-15', endDate: '2026-10-25' }).map((t) => t.id),
    ).toEqual(['B']);
  });
});
