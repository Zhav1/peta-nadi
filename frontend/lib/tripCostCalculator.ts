/**
 * Trip Operational Cost Engine (First-Principles Trip Economics)
 * 
 * Computes authentic first-principles operational logistics costs based on
 * live corridor telemetry, Pertamina Biosolar benchmark fuel rates, BPJT toll tariffs,
 * driver overtime/operating labor rates, and active reefer genset fuel consumption.
 * 
 * Standards:
 * - Fuel: Biosolar Rp 6.800/L @ 3.5 km/L (freight diesel truck standard)
 * - Labor: Driver labor @ Rp 50.000/hour
 * - Reefer Genset: Rp 45.000/hour for temperature-controlled cold chain logistics
 * - BPJT Toll: Grounded toll tariff or Rp 0 if unrouted / non-toll
 */

export const FUEL_CONSUMPTION_KM_PER_LITER = 3.5;
export const BIOSOLAR_RATE_PER_LITER = 6800;
export const DRIVER_LABOR_HOURLY_RATE = 50000;
export const REEFER_GENSET_HOURLY_RATE = 45000;

export interface TripCostParams {
  distanceKm: number;
  durationMinutes: number;
  commodity?: string | null;
  vehicleGolongan?: string | null;
  tollCostIdr?: number | null;
  /**
   * Explicit per-trip fuel efficiency (km/L). Null/undefined resolves via
   * GOLONGAN_DEFAULT_KMPL[vehicleGolongan] (GOL_II 3.5 legacy default).
   */
  fuelEfficiencyKmpl?: number | null;
  /**
   * Explicit Pertamina/SK fuel rate (IDR/L). Null/undefined falls back to
   * FUEL_RATE_FALLBACK_IDR (Biosolar Rp 6.800/L).
   */
  fuelRateIdr?: number | null;
  /** Explicit reefer flag override. Undefined = derive from commodity. */
  isReefer?: boolean | null;
  /**
   * Measured reefer genset burn (L/h). When > 0 on a reefer cold-chain move,
   * reefer cost is priced from fuel volume (lph × hours × rate); otherwise the
   * legacy Rp/hour genset tariff applies (backward compat).
   */
  reeferFuelLph?: number | null;
}

export interface OperationalCostBreakdown {
  fuel_cost_idr: number;
  labor_cost_idr: number;
  reefer_genset_cost_idr: number;
  toll_cost_idr: number;
  total_operational_cost_idr: number;
}

export interface TripCostResult {
  total_operational_cost_idr: number;
  operational_cost_breakdown: OperationalCostBreakdown;
}

import type { RouteRecommendation } from './types';
import { GOLONGAN_DEFAULT_KMPL } from './types';

/**
 * Canonical Pertamina Biosolar fallback rate (IDR/L) when no SK rate is
 * supplied. Mirrors backend PERTAMINA_FUEL_BASE_RATES["biosolar"].
 */
export const FUEL_RATE_FALLBACK_IDR = 6800;
/**
 * Safe-staging depot hourly fee (IDR/h). Single source of truth for
 * hold/demurrage economics — backend DEPOT_HOURLY_FEE_IDR.
 */
export const DEPOT_HOURLY_FEE_IDR = 35000;
/** Default reefer genset burn (L/h) when a reefer unit has no measured lph. */
export const REEFER_DEFAULT_LPH = 2.0;

/**
 * Detects whether a commodity requires temperature-controlled cold chain logistics
 * and active diesel genset refrigeration.
 */
export function isColdChain(commodity?: string | null): boolean {
  if (!commodity) return false;
  const c = commodity.toLowerCase().trim();
  const coldKeywords = [
    'ikan',
    'daging',
    'ayam',
    'sapi',
    'udang',
    'susu',
    'seafood',
    'frozen',
    'beku',
    'chilled',
    'cold',
    'reefer',
  ];
  return coldKeywords.some((kw) => c.includes(kw));
}

/**
 * Resolve per-trip fuel efficiency (km/L).
 * Priority: explicit override -> GOLONGAN_DEFAULT_KMPL[golongan] ->
 * legacy flat 3.5 (GOL_II default, deprecated for other golongan).
 */
export function resolveFuelEfficiencyKmpl(
  overrideKmpl?: number | null,
  vehicleGolongan?: string | null
): { effKmpl: number; source: 'override' | 'golongan_default' | 'legacy_flat' } {
  if (overrideKmpl != null && Number(overrideKmpl) > 0) {
    return { effKmpl: Number(overrideKmpl), source: 'override' };
  }
  const g = String(vehicleGolongan ?? 'GOL_II').toUpperCase();
  if (g in GOLONGAN_DEFAULT_KMPL) {
    return { effKmpl: GOLONGAN_DEFAULT_KMPL[g], source: 'golongan_default' };
  }
  return { effKmpl: FUEL_CONSUMPTION_KM_PER_LITER, source: 'legacy_flat' };
}

/**
 * Resolve per-trip fuel rate (IDR/L). Explicit SK rate wins; otherwise the
 * Pertamina Biosolar fallback (Rp 6.800/L).
 */
export function resolveFuelRateIdr(
  overrideRate?: number | null
): { rateIdr: number; isFallback: boolean } {
  if (overrideRate != null && Number(overrideRate) > 0) {
    return { rateIdr: Number(overrideRate), isFallback: false };
  }
  return { rateIdr: BIOSOLAR_RATE_PER_LITER, isFallback: true };
}

/**
 * Calculates first-principles total operational trip cost.
 * Zero magic numbers; 100% grounded arithmetic.
 */
export function calculateTotalTripCost(params: TripCostParams): TripCostResult {
  const { distanceKm, durationMinutes, commodity, tollCostIdr } = params;
  const dist = Math.max(0, Number(distanceKm) || 0);
  const durationH = Math.max(0, Number(durationMinutes) || 0) / 60;
  const { effKmpl } = resolveFuelEfficiencyKmpl(params.fuelEfficiencyKmpl, params.vehicleGolongan);
  const { rateIdr } = resolveFuelRateIdr(params.fuelRateIdr);

  const fuel_cost_idr = Math.round((dist / effKmpl) * rateIdr);
  const labor_cost_idr = Math.round(durationH * DRIVER_LABOR_HOURLY_RATE);
  const coldChain = isColdChain(commodity);
  const reeferMove = params.isReefer === true || (params.isReefer == null && coldChain);
  let reefer_genset_cost_idr = 0;
  if (reeferMove) {
    if (params.reeferFuelLph != null && Number(params.reeferFuelLph) > 0) {
      reefer_genset_cost_idr = Math.round(durationH * Number(params.reeferFuelLph) * rateIdr);
    } else {
      reefer_genset_cost_idr = Math.round(durationH * REEFER_GENSET_HOURLY_RATE);
    }
  }
  const toll_cost_idr = Math.max(0, Math.round(Number(tollCostIdr) || 0));

  const total_operational_cost_idr =
    fuel_cost_idr + labor_cost_idr + reefer_genset_cost_idr + toll_cost_idr;

  return {
    total_operational_cost_idr,
    operational_cost_breakdown: {
      fuel_cost_idr,
      labor_cost_idr,
      reefer_genset_cost_idr,
      toll_cost_idr,
      total_operational_cost_idr,
    },
  };
}

/**
 * Standard IDR formatter with full thousands separators.
 */
export function formatTripCostIDR(val?: number | null): string {
  if (val == null || !Number.isFinite(val)) return 'Data tidak tersedia';
  return `Rp ${Math.round(val).toLocaleString('id-ID')}`;
}

/**
 * Compact IDR formatter for popovers and HUD cards (e.g. "Rp 6,01 Jt", "Rp 350.000").
 */
export function formatCompactIDR(val?: number | null): string {
  if (val == null || !Number.isFinite(val)) return 'Data tidak tersedia';
  const absVal = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (absVal >= 1_000_000_000) {
    const num = (absVal / 1_000_000_000).toLocaleString('id-ID', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${sign}Rp ${num} M`;
  }
  if (absVal >= 1_000_000) {
    const num = (absVal / 1_000_000).toLocaleString('id-ID', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${sign}Rp ${num} Jt`;
  }
  return `${sign}Rp ${Math.round(absVal).toLocaleString('id-ID')}`;
}

/**
 * Per-rit fuel economy helpers (Laporan Phase 3).
 * Null-safe: returns null when distance/fuel are missing or non-positive so
 * callers render "belum diinput" and exclude the rit from averages.
 */
export function calculateFuelEconomyKmpl(
  distanceKm?: number | null,
  fuelLiters?: number | null
): number | null {
  const d = Number(distanceKm);
  const f = Number(fuelLiters);
  if (!Number.isFinite(d) || !Number.isFinite(f) || d <= 0 || f <= 0) return null;
  return d / f;
}

export function litersPer100Km(economyKmpl?: number | null): number | null {
  const e = Number(economyKmpl);
  if (!Number.isFinite(e) || e <= 0) return null;
  return 100 / e;
}

export function formatEconomyKmpl(v?: number | null): string {
  if (v == null || !Number.isFinite(Number(v))) return 'belum diinput';
  return `${Number(v).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km/L`;
}

export function formatLitersPer100Km(v?: number | null): string {
  if (v == null || !Number.isFinite(Number(v))) return 'belum diinput';
  return `${Number(v).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L/100km`;
}

export interface DualMetricPopoverResult {
  header: string;
  totalOperationalCost: number | undefined;
  totalDisplay: string;
  additionalCost: number | undefined;
  additionalCostDisplay: string;
  badge: string;
  badgeType: 'baseline' | 'detour' | 'savings' | 'neutral';
  subtitle: string;
  statusDotClass: string;
  statusTextClass: string;
}

/**
 * Deterministically resolves dual-metric operational cost & safety status telemetry
 * for the interactive Mapbox route popover.
 * Synchronizes with first-principles trip economics and baseline delta hierarchy.
 */
export function resolvePopoverDualMetric(
  routeIndex: number,
  route: RouteRecommendation,
  activeRoutes?: RouteRecommendation[]
): DualMetricPopoverResult {
  const currentRoute = activeRoutes?.[routeIndex] ?? route;
  const isBaseline = routeIndex === 0;
  const baselineRoute = activeRoutes?.[0];

  // Resolve detour delta / additional cost from standard hierarchy
  const additionalCost =
    currentRoute.hedging?.reroute_policy?.cost_idr ??
    currentRoute.hedging?.reroute_cost_idr ??
    (currentRoute.corridor_type === 'land_detour' ? currentRoute.economic_comparison?.reroute_total_cost_idr : undefined) ??
    (currentRoute.tradeoff_analysis?.additional_cost_idr !== undefined
      ? currentRoute.tradeoff_analysis.additional_cost_idr
      : (isBaseline ? 0 : undefined));

  // Determine baseline total operational cost for delta anchoring
  let baselineTotal = baselineRoute?.total_operational_cost_idr;
  if (baselineTotal == null && baselineRoute && baselineRoute.distance_km != null && baselineRoute.eta_minutes != null) {
    const bCommodity = isColdChain(baselineRoute.hedging?.perishability_tier) ? 'ikan_segar' : undefined;
    baselineTotal = calculateTotalTripCost({
      distanceKm: baselineRoute.distance_km,
      durationMinutes: baselineRoute.eta_minutes,
      commodity: bCommodity,
      tollCostIdr: 0,
    }).total_operational_cost_idr;
  }

  // Determine total operational cost for current route
  let totalOperationalCost = currentRoute.total_operational_cost_idr;
  if (totalOperationalCost == null && currentRoute.distance_km != null && currentRoute.eta_minutes != null) {
    const cCommodity = isColdChain(currentRoute.hedging?.perishability_tier) ? 'ikan_segar' : undefined;
    const calc = calculateTotalTripCost({
      distanceKm: currentRoute.distance_km,
      durationMinutes: currentRoute.eta_minutes,
      commodity: cCommodity,
      tollCostIdr: 0,
    });
    totalOperationalCost = calc.total_operational_cost_idr;
  }

  // If detour route and has explicit additionalCost > 0 and baselineTotal is known,
  // align total operational cost = max(totalOperationalCost, baselineTotal + additionalCost)
  if (!isBaseline && additionalCost != null && additionalCost > 0 && baselineTotal != null) {
    totalOperationalCost = Math.max(totalOperationalCost ?? 0, baselineTotal + additionalCost);
  }

  // Dual-Metric Badge Resolution
  let badge = 'Acuan (Δ Rp 0)';
  let badgeType: 'baseline' | 'detour' | 'savings' | 'neutral' = 'baseline';
  let additionalCostDisplay = 'Rp 0';

  if (!isBaseline && additionalCost != null) {
    if (additionalCost > 0) {
      badge = `+${formatCompactIDR(additionalCost)} (Detour)`;
      badgeType = 'detour';
      additionalCostDisplay = `+${formatCompactIDR(additionalCost)}`;
    } else if (additionalCost < 0) {
      badge = `-${formatCompactIDR(Math.abs(additionalCost))} (Hemat)`;
      badgeType = 'savings';
      additionalCostDisplay = `-${formatCompactIDR(Math.abs(additionalCost))}`;
    } else {
      badge = 'Acuan (Δ Rp 0)';
      badgeType = 'neutral';
    }
  }

  // Subtitle & Status Badge Resolution
  const isCompromised = currentRoute.is_compromised || currentRoute.safety_status === 'COMPROMISED';
  let subtitle = 'Bebas hambatan';
  let statusDotClass = 'bg-slate-500';
  let statusTextClass = 'text-slate-400';

  if (isBaseline) {
    if (isCompromised) {
      subtitle = 'Terdampak bencana';
      statusDotClass = 'bg-rose-500';
      statusTextClass = 'text-rose-400';
    } else {
      subtitle = 'Jalur utama bebas hambatan';
      statusDotClass = 'bg-emerald-500';
      statusTextClass = 'text-emerald-400';
    }
  } else if (isCompromised) {
    subtitle = 'Terdampak bencana';
    statusDotClass = 'bg-rose-500';
    statusTextClass = 'text-rose-400';
  } else if (currentRoute.safety_status === 'HOLD_DELAY' || currentRoute.corridor_type === 'hold_staging') {
    subtitle = 'Tahan muatan di depo';
    statusDotClass = 'bg-amber-500';
    statusTextClass = 'text-amber-400';
  } else if (currentRoute.corridor_type === 'sea_intermodal' || currentRoute.modality === 'maritime') {
    subtitle = 'Bypass laut terverifikasi';
    statusDotClass = 'bg-cyan-500';
    statusTextClass = 'text-cyan-400';
  } else if (currentRoute.corridor_type === 'air_intermodal' || currentRoute.modality === 'air') {
    subtitle = 'Bypass udara prioritas';
    statusDotClass = 'bg-sky-500';
    statusTextClass = 'text-sky-400';
  } else if (currentRoute.safety_status === 'SAFE_DETOUR') {
    subtitle = 'Detour terverifikasi';
    statusDotClass = 'bg-emerald-500';
    statusTextClass = 'text-emerald-400';
  }

  return {
    header: 'Est. Operasional',
    totalOperationalCost,
    totalDisplay: totalOperationalCost != null ? formatCompactIDR(totalOperationalCost) : 'Belum tersedia',
    additionalCost,
    additionalCostDisplay,
    badge,
    badgeType,
    subtitle,
    statusDotClass,
    statusTextClass,
  };
}

