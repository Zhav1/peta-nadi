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

/**
 * Detects whether a commodity requires temperature-controlled cold chain logistics
 * and active diesel genset refrigeration.
 */
export function isColdChain(commodity?: string | null): boolean {
  if (!commodity) return false;
  const c = commodity.toLowerCase().trim();
  const coldKeywords = [
    'ikan_segar',
    'daging_sapi',
    'daging_ayam',
    'udang',
    'susu_segar',
    'cold_chain',
    'cold-chain',
    'cold chain',
  ];
  if (coldKeywords.includes(c)) return true;
  return (
    c.includes('cold') ||
    c.includes('reefer') ||
    c.includes('ikan') ||
    c.includes('frozen') ||
    c.includes('daging') ||
    c.includes('seafood')
  );
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
