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
 * Calculates first-principles total operational trip cost.
 * Zero magic numbers; 100% grounded arithmetic.
 */
export function calculateTotalTripCost(params: TripCostParams): TripCostResult {
  const { distanceKm, durationMinutes, commodity, tollCostIdr } = params;
  const dist = Math.max(0, Number(distanceKm) || 0);
  const durationH = Math.max(0, Number(durationMinutes) || 0) / 60;

  const fuel_cost_idr = Math.round((dist / FUEL_CONSUMPTION_KM_PER_LITER) * BIOSOLAR_RATE_PER_LITER);
  const labor_cost_idr = Math.round(durationH * DRIVER_LABOR_HOURLY_RATE);
  const reefer_genset_cost_idr = isColdChain(commodity)
    ? Math.round(durationH * REEFER_GENSET_HOURLY_RATE)
    : 0;
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

