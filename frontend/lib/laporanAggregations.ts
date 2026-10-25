// M8 Phase 1: pure frontend aggregation helpers for Laporan.
// No API calls, no side effects — safe for unit testing and reuse.

import type {
  CommodityTierGroup,
  ERPTripRow,
  LaporanFilters,
  LaporanTierKey,
  PeriodBucket,
} from './types';

const ULTRA_KEYS = ['cabai_merah', 'cabai_rawit', 'tomat', 'sayur_segar', 'sayuran_daun'];
const COLD_KEYS = ['daging_sapi', 'daging_ayam', 'ikan_segar', 'udang', 'susu_segar'];
const SEMI_KEYS = ['bawang_merah', 'bawang_putih', 'kentang', 'ubi_kayu', 'wortel'];
const DRY_KEYS = ['beras', 'minyak_goreng', 'gula_pasir', 'tepung_terigu', 'kedelai'];

/** Map a commodity_key to the short laporan tier key. Falls back to 'Lainnya'. */
export function resolveCommodityTier(commodityKey?: string | null): LaporanTierKey {
  const key = String(commodityKey ?? '').toLowerCase();
  if (!key) return 'Lainnya';
  if (ULTRA_KEYS.some((c) => key.includes(c)) || key.includes('cabai') || key.includes('tomat') || key.includes('sayur')) {
    return 'ultra';
  }
  if (
    COLD_KEYS.some((c) => key.includes(c)) ||
    key.includes('ikan') ||
    key.includes('daging') ||
    key.includes('ayam') ||
    key.includes('frozen') ||
    key.includes('udang') ||
    key.includes('susu')
  ) {
    return 'cold';
  }
  if (SEMI_KEYS.some((c) => key.includes(c)) || key.includes('bawang') || key.includes('kentang')) {
    return 'semi';
  }
  if (DRY_KEYS.some((c) => key.includes(c))) {
    return 'dry';
  }
  return 'Lainnya';
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Group trips by commodity tier. Always returns all 5 tiers in stable order. */
export function groupByCommodityTier(trips: ERPTripRow[]): CommodityTierGroup[] {
  const order: LaporanTierKey[] = ['ultra', 'cold', 'semi', 'dry', 'Lainnya'];
  const acc = new Map<LaporanTierKey, CommodityTierGroup>(
    order.map((tier) => [tier, { tier, tripCount: 0, totalSavedIdr: 0, totalSavedFuelLiters: 0, totalSavedHours: 0 }]),
  );
  for (const t of trips ?? []) {
    const tier = resolveCommodityTier(t?.commodity_key);
    const g = acc.get(tier)!;
    g.tripCount += 1;
    g.totalSavedIdr += num(t?.saved_cost_idr);
    g.totalSavedFuelLiters += num(t?.saved_fuel_liters);
    g.totalSavedHours += num(t?.saved_time_hours);
  }
  return order.map((k) => acc.get(k)!);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Monday-based ISO-ish week key in UTC: `YYYY-Www`. */
function weekKey(d: Date): string {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (utc.getUTCDay() + 6) % 7; // Mon=0
  utc.setUTCDate(utc.getUTCDate() - day + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(utc.getUTCFullYear(), 0, 4));
  const fday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fday + 3);
  const week = 1 + Math.round((utc.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${utc.getUTCFullYear()}-W${pad2(week)}`;
}

/** Group trips by week (Monday) or month using `created_at` (UTC). Trips without a valid date go to `tanpa-tanggal`. */
export function groupByPeriod(trips: ERPTripRow[], granularity: 'weekly' | 'monthly'): PeriodBucket[] {
  const acc = new Map<string, PeriodBucket>();
  for (const t of trips ?? []) {
    const raw = t?.created_at;
    const d = raw ? new Date(raw) : null;
    let key = 'tanpa-tanggal';
    let label = 'Tanpa tanggal';
    if (d && !isNaN(d.getTime())) {
      if (granularity === 'weekly') {
        key = weekKey(d);
        label = key;
      } else {
        key = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
        label = key;
      }
    }
    const b = acc.get(key) ?? { key, label, tripCount: 0, totalSavedIdr: 0 };
    b.tripCount += 1;
    b.totalSavedIdr += num(t?.saved_cost_idr);
    acc.set(key, b);
  }
  return Array.from(acc.values()).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * Compact Indonesian IDR formatting:
 * - |v| >= 1M Miliar (1e9) → `X M` (e.g. `2,5 M`)
 * - |v| >= 1 jt (1e6) → `X jt` (e.g. `3,25 jt`)
 * - else → `Rp N` with id-ID grouping.
 */
export function formatJtM(idr?: number | null): string {
  const v = Number(idr ?? 0);
  if (!Number.isFinite(v)) return 'Rp 0';
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) {
    const s = (v / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 2 });
    return `${s} M`;
  }
  if (abs >= 1_000_000) {
    const s = (v / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 2 });
    return `${s} jt`;
  }
  return `Rp ${Math.round(v).toLocaleString('id-ID')}`;
}

/** Pure client-side filter for laporan tables. All filter fields are optional. */
export function applyLaporanFilters(trips: ERPTripRow[], filters: LaporanFilters): ERPTripRow[] {
  const { startDate, endDate, tier = 'ALL', status = 'ALL', search = '' } = filters ?? {};
  const q = search.trim().toLowerCase();
  const start = startDate ? new Date(startDate).getTime() : NaN;
  const end = endDate ? new Date(endDate).getTime() : NaN;
  return (trips ?? []).filter((t) => {
    if (status !== 'ALL' && t?.status !== status) return false;
    if (tier !== 'ALL' && resolveCommodityTier(t?.commodity_key) !== tier) return false;
    if (!Number.isNaN(start) || !Number.isNaN(end)) {
      const ts = t?.created_at ? new Date(t.created_at).getTime() : NaN;
      if (Number.isNaN(ts)) return false;
      if (!Number.isNaN(start) && ts < start) return false;
      if (!Number.isNaN(end) && ts > end) return false;
    }
    if (q) {
      const hay = `${t?.id ?? ''} ${t?.truck_id ?? ''} ${t?.truck_name ?? ''} ${t?.origin_name ?? ''} ${t?.destination_name ?? ''} ${t?.commodity_key ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
