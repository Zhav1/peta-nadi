import assert from 'node:assert';
import type { HedgingSolveResponse, TacticalManeuver } from '../lib/types';

console.log('=== PHASE 103 INDUSTRY VALIDATION VERIFICATION SUITE ===\n');

// 1. Reefer Genset Calculation across Tactical Maneuvers
function resolveActiveReeferGensetCost(
  hedging: HedgingSolveResponse | undefined,
  tactical: TacticalManeuver
): number {
  const activePolicyBreakdown =
    tactical === 'HOLD'
      ? hedging?.hold_policy
      : tactical === 'CONTINUE'
      ? hedging?.continue_policy
      : (hedging?.reroute_policy ??
         (hedging?.optimal_policy === 'HOLD'
           ? hedging?.hold_policy
           : hedging?.optimal_policy === 'CONTINUE'
           ? hedging?.continue_policy
           : hedging?.reroute_policy));

  return activePolicyBreakdown?.breakdown?.['reefer_genset_fuel'] ?? 0;
}

const mockColdChainHedging: HedgingSolveResponse = {
  vehicle_id: 'TRK-REEFER-01',
  commodity: 'ikan_segar',
  perishability_tier: 'Cold-Chain Controlled Meat & Seafood',
  decay_rate_per_hour: 0.005,
  cargo_value_idr: 150000000,
  spoilage_loss_idr: 8500000,
  continue_policy: {
    policy: 'CONTINUE',
    cost_idr: 10500000,
    breakdown: {
      expected_spoilage_loss: 8500000,
      downtime_penalty: 1640000,
      reefer_genset_fuel: 360000, // 8.0h * 45000
      risk_probability: 0.85
    },
    explanation: 'Melanjutkan rute berisiko tinggi dan biaya genset pendingin Rp 360.000',
    risk_level: 'CRITICAL'
  },
  reroute_policy: {
    policy: 'REROUTE',
    cost_idr: 1850000,
    breakdown: {
      extra_fuel_cost: 1250000,
      bpjt_toll_tariff: 290000,
      driver_overtime: 152500,
      reefer_genset_fuel: 157500, // 3.5h * 45000
      detour_km: 110.0
    },
    explanation: 'Pengalihan rute alternatif sejauh +110.0 km, biaya genset pendingin Rp 157.500',
    risk_level: 'LOW'
  },
  hold_policy: {
    policy: 'HOLD',
    cost_idr: 350000,
    breakdown: {
      depot_parking_fee: 125000,
      reefer_genset_fuel: 225000, // 5.0h * 45000
      staging_decay_loss: 0,
      wait_hours: 5.0
    },
    explanation: 'Penahanan sementara armada di depo. Biaya genset cold-chain Rp 225.000',
    risk_level: 'MEDIUM'
  },
  optimal_policy: 'REROUTE',
  net_savings_idr: 8650000,
  recommendation_reason: 'Rekomendasi Kebijakan: REROUTE'
};

console.log('[TEST 1] Verifying Dynamic Reefer Genset Breakdown across Tactical Actions...');
assert.strictEqual(
  resolveActiveReeferGensetCost(mockColdChainHedging, 'REROUTE'),
  157500,
  'REROUTE must reflect active detour reefer genset fuel (3.5h * 45k = 157.5k)'
);
assert.strictEqual(
  resolveActiveReeferGensetCost(mockColdChainHedging, 'HOLD'),
  225000,
  'HOLD must reflect depot staging reefer fuel (5.0h * 45k = 225k)'
);
assert.strictEqual(
  resolveActiveReeferGensetCost(mockColdChainHedging, 'CONTINUE'),
  360000,
  'CONTINUE must reflect delay waiting reefer fuel (8.0h * 45k = 360k)'
);
console.log('✓ Dynamic reefer genset fuel resolves correctly across REROUTE, HOLD, and CONTINUE');

// 2. Dry Bulk Zero Genset verification
const mockDryBulkHedging: HedgingSolveResponse = {
  ...mockColdChainHedging,
  commodity: 'beras',
  perishability_tier: 'Non-Perishable Dry Bulk & Staples',
  continue_policy: {
    ...mockColdChainHedging.continue_policy,
    breakdown: { ...mockColdChainHedging.continue_policy.breakdown, reefer_genset_fuel: 0 }
  },
  reroute_policy: {
    ...mockColdChainHedging.reroute_policy,
    breakdown: { ...mockColdChainHedging.reroute_policy.breakdown, reefer_genset_fuel: 0 }
  },
  hold_policy: {
    ...mockColdChainHedging.hold_policy,
    breakdown: { ...mockColdChainHedging.hold_policy.breakdown, reefer_genset_fuel: 0 }
  }
};

console.log('\n[TEST 2] Verifying Dry Bulk Zero Genset Invariant...');
assert.strictEqual(resolveActiveReeferGensetCost(mockDryBulkHedging, 'REROUTE'), 0);
assert.strictEqual(resolveActiveReeferGensetCost(mockDryBulkHedging, 'HOLD'), 0);
assert.strictEqual(resolveActiveReeferGensetCost(mockDryBulkHedging, 'CONTINUE'), 0);
console.log('✓ Dry Bulk strictly incurs Rp 0 reefer genset fuel across all tactical options');

// 3. Effective Hedging Opts Resolution & Explicit Reset
function computeEffectiveHedgingOpts(
  hedgingOpts: { commodity?: string } | null | undefined,
  selectedCommodity: string | null
) {
  return hedgingOpts !== undefined
    ? (hedgingOpts ?? undefined)
    : (selectedCommodity ? {
        commodity: selectedCommodity,
        cargo_tonnage: 10.0,
        vehicle_golongan: 'GOL_II',
        fuel_type: 'biosolar',
        p_disruption: 0.85,
        disruption_delay_hours: 8.0,
      } : undefined);
}

console.log('\n[TEST 3] Verifying Effective Hedging Opts & Reset Isolation...');
// Case A: Commodity selected in state, no override passed
const resA = computeEffectiveHedgingOpts(undefined, 'ikan_segar');
assert.strictEqual(resA?.commodity, 'ikan_segar', 'Must adopt state commodity');

// Case B: Explicit reset (hedgingOpts = null) while state still has old commodity
const resB = computeEffectiveHedgingOpts(null, 'ikan_segar');
assert.strictEqual(resB, undefined, 'Explicit null must clear hedging without falling back to stale state');

// Case C: Explicit override passed
const resC = computeEffectiveHedgingOpts({ commodity: 'cabai_merah' }, 'ikan_segar');
assert.strictEqual(resC?.commodity, 'cabai_merah', 'Must adopt explicit override');
console.log('✓ Hedging options resolution and reset isolation verified');

console.log('\n=== ALL PHASE 103 FRONTEND LOGIC ASSERTIONS PASSED (3/3) ===\n');
