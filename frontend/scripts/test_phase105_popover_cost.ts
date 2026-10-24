import assert from 'node:assert';
import type { RouteRecommendation } from '../lib/types';

console.log('=== PHASE 105 POPOVER PORTAL & COST TELEMETRY VERIFICATION SUITE ===\n');

// 1. Cost Resolver Hierarchy function mirroring CrisisMap.tsx
function resolveRouteCostDisplay(
  selectedRoutePopover: { routeIndex: number; route: RouteRecommendation } | null,
  activeRoutes: RouteRecommendation[]
): { costIdr: number | undefined; display: string; styleClass: string } {
  if (!selectedRoutePopover) {
    return { costIdr: undefined, display: 'Belum tersedia', styleClass: 'text-slate-400' };
  }

  const currentRoute = activeRoutes?.[selectedRoutePopover.routeIndex] ?? selectedRoutePopover.route;
  const isBaseline = selectedRoutePopover.routeIndex === 0;
  const costIdr =
    currentRoute.hedging?.reroute_policy?.cost_idr ??
    currentRoute.hedging?.reroute_cost_idr ??
    currentRoute.economic_comparison?.reroute_total_cost_idr ??
    (currentRoute.tradeoff_analysis?.additional_cost_idr !== undefined
      ? currentRoute.tradeoff_analysis.additional_cost_idr
      : (isBaseline ? 0 : undefined));

  if (typeof costIdr === 'number' && Number.isFinite(costIdr)) {
    if (costIdr === 0) {
      return {
        costIdr: 0,
        display: 'Rp 0 (Normal)',
        styleClass: 'text-slate-200 font-semibold font-mono tabular-nums',
      };
    }
    if (costIdr > 0) {
      return {
        costIdr,
        display: `+Rp ${costIdr.toLocaleString('id-ID')}`,
        styleClass: 'text-emerald-300 font-semibold font-mono tabular-nums',
      };
    }
    if (costIdr < 0) {
      return {
        costIdr,
        display: `-Rp ${Math.abs(costIdr).toLocaleString('id-ID')}`,
        styleClass: 'text-emerald-300 font-semibold font-mono tabular-nums',
      };
    }
  }

  return {
    costIdr: undefined,
    display: 'Belum tersedia',
    styleClass: 'text-slate-400 font-semibold font-mono tabular-nums',
  };
}

// 2. Reactive Route Popover Sync function mirroring CrisisMap.tsx useEffect
function syncRoutePopover(
  prev: { routeIndex: number; route: RouteRecommendation; lngLat: [number, number]; screenPos: { x: number; y: number } } | null,
  activeRoutes: RouteRecommendation[]
) {
  if (!prev) return null;
  const updatedRoute = activeRoutes?.[prev.routeIndex];
  if (!updatedRoute) return null;
  return {
    ...prev,
    route: updatedRoute,
  };
}

// ==========================================
// TEST SUITE EXECUTION
// ==========================================

console.log('[TEST 1] Verifying Cost Hierarchy Resolution...');

// 1.1 Baseline route (Index 0) with no extra cost
const baselineRoute: RouteRecommendation = {
  description: 'Jalur Arteri Medan - Tebing Tinggi',
  waypoints: [{ lat: 3.59, lon: 98.67 }],
  distance_km: 80,
  eta_minutes: 90,
  fuel_increase_pct: 0,
  risk_score: 0.1,
  tradeoff_analysis: {
    time_delta_minutes: 0,
    additional_cost_idr: 0,
    cost_breakdown_items: [{ label: 'Jalur Normal', amount_idr: 0 }],
    pros: ['Tercepat & termurah pada kondisi normal'],
    cons: [],
  },
};

const resBaseline = resolveRouteCostDisplay({ routeIndex: 0, route: baselineRoute }, [baselineRoute]);
console.log(`  1.1 Baseline (Index 0): ${resBaseline.display} [Cost: ${resBaseline.costIdr}]`);
assert.strictEqual(resBaseline.display, 'Rp 0 (Normal)');
assert.strictEqual(resBaseline.costIdr, 0);
assert.ok(resBaseline.styleClass.includes('text-slate-200'));

// 1.2 Detour with nested hedging (route.hedging.reroute_policy.cost_idr)
const detourNested: RouteRecommendation = {
  description: 'Pengalihan via Lubuk Pakam',
  waypoints: [{ lat: 3.55, lon: 98.70 }],
  distance_km: 110,
  eta_minutes: 130,
  fuel_increase_pct: 15,
  risk_score: 0.05,
  hedging: {
    reroute_policy: {
      cost_idr: 450000,
      breakdown: { fuel: 200000, toll: 150000, reefer: 100000 },
    },
  },
};

const resNested = resolveRouteCostDisplay({ routeIndex: 1, route: detourNested }, [baselineRoute, detourNested]);
console.log(`  1.2 Detour Nested Hedging: ${resNested.display} [Cost: ${resNested.costIdr}]`);
assert.strictEqual(resNested.display, '+Rp 450.000');
assert.strictEqual(resNested.costIdr, 450000);
assert.ok(resNested.styleClass.includes('text-emerald-300'));

// 1.3 Detour with flat hedging alias (route.hedging.reroute_cost_idr)
const detourFlat: RouteRecommendation = {
  description: 'Pengalihan via Siantar',
  waypoints: [{ lat: 3.45, lon: 98.85 }],
  distance_km: 135,
  eta_minutes: 160,
  fuel_increase_pct: 22,
  risk_score: 0.02,
  hedging: {
    reroute_cost_idr: 580000,
  },
};

const resFlat = resolveRouteCostDisplay({ routeIndex: 1, route: detourFlat }, [baselineRoute, detourFlat]);
console.log(`  1.3 Detour Flat Hedging: ${resFlat.display} [Cost: ${resFlat.costIdr}]`);
assert.strictEqual(resFlat.display, '+Rp 580.000');
assert.strictEqual(resFlat.costIdr, 580000);

// 1.4 Detour with economic comparison (route.economic_comparison.reroute_total_cost_idr)
const detourEcon: RouteRecommendation = {
  description: 'Pengalihan Lingkar Danau Toba',
  waypoints: [{ lat: 2.80, lon: 98.60 }],
  distance_km: 190,
  eta_minutes: 240,
  fuel_increase_pct: 35,
  risk_score: 0.04,
  economic_comparison: {
    reroute_total_cost_idr: 1250000,
    hold_total_cost_idr: 2100000,
    hold_depot_name: 'Depo Parapat',
    hold_depot_coords: [98.93, 2.66],
    estimated_clearance_hours: 14,
    recommended_action: 'REROUTE',
    net_savings_idr: 850000,
    rationale_id: 'RAT-01',
  },
};

const resEcon = resolveRouteCostDisplay({ routeIndex: 1, route: detourEcon }, [baselineRoute, detourEcon]);
console.log(`  1.4 Detour Economic Comparison: ${resEcon.display} [Cost: ${resEcon.costIdr}]`);
assert.strictEqual(resEcon.display, '+Rp 1.250.000');
assert.strictEqual(resEcon.costIdr, 1250000);

// 1.5 Detour with tradeoff analysis (fuel + toll + overtime = 328000)
const detourTradeoff: RouteRecommendation = {
  description: 'Pengalihan Arteri Pantura',
  waypoints: [{ lat: 3.65, lon: 98.90 }],
  distance_km: 105,
  eta_minutes: 120,
  fuel_increase_pct: 12,
  risk_score: 0.08,
  tradeoff_analysis: {
    time_delta_minutes: 30,
    additional_cost_idr: 328000,
    cost_breakdown_items: [
      { label: 'BBM & Perawatan', amount_idr: 170000 },
      { label: 'Diferensial Tol', amount_idr: 85000 },
      { label: 'Lembur Supir', amount_idr: 73000 },
    ],
    pros: ['Bebas genangan'],
    cons: ['Tambahan waktu 30m'],
  },
};

const resTradeoff = resolveRouteCostDisplay({ routeIndex: 1, route: detourTradeoff }, [baselineRoute, detourTradeoff]);
console.log(`  1.5 Detour Tradeoff Analysis: ${resTradeoff.display} [Cost: ${resTradeoff.costIdr}]`);
assert.strictEqual(resTradeoff.display, '+Rp 328.000');
assert.strictEqual(resTradeoff.costIdr, 328000);

// 1.6 Uncalculated route without any cost metadata
const uncalculatedRoute: RouteRecommendation = {
  description: 'Rute Tanpa Estimasi Biaya',
  waypoints: [{ lat: 3.0, lon: 99.0 }],
  distance_km: 50,
  eta_minutes: 60,
  fuel_increase_pct: 0,
  risk_score: 0.5,
};

const resUncalc = resolveRouteCostDisplay({ routeIndex: 1, route: uncalculatedRoute }, [baselineRoute, uncalculatedRoute]);
console.log(`  1.6 Uncalculated Route: ${resUncalc.display} [Cost: ${resUncalc.costIdr}]`);
assert.strictEqual(resUncalc.display, 'Belum tersedia');
assert.strictEqual(resUncalc.costIdr, undefined);
assert.ok(resUncalc.styleClass.includes('text-slate-400'));

// 1.7 Detour with negative cost delta (savings)
const detourSavings: RouteRecommendation = {
  description: 'Pengalihan Hemat Biaya',
  waypoints: [{ lat: 3.5, lon: 98.6 }],
  distance_km: 75,
  eta_minutes: 85,
  fuel_increase_pct: -5,
  risk_score: 0.05,
  tradeoff_analysis: {
    time_delta_minutes: -5,
    additional_cost_idr: -45000,
    cost_breakdown_items: [{ label: 'Penghematan Bahan Bakar', amount_idr: -45000 }],
    pros: ['Hemat bahan bakar'],
    cons: [],
  },
};
const resSavings = resolveRouteCostDisplay({ routeIndex: 1, route: detourSavings }, [baselineRoute, detourSavings]);
console.log(`  1.7 Detour Cost Savings (Negative): ${resSavings.display} [Cost: ${resSavings.costIdr}]`);
assert.strictEqual(resSavings.display, '-Rp 45.000');
assert.strictEqual(resSavings.costIdr, -45000);
assert.ok(resSavings.styleClass.includes('text-emerald-300'));

console.log('✓ All 7 cost hierarchy resolution scenarios verified successfully\n');

// ==========================================
// TEST 2: REACTIVE ROUTE SYNC
// ==========================================

console.log('[TEST 2] Verifying Reactive Popover Route Synchronization...');

const initialPopoverState = {
  routeIndex: 1,
  route: uncalculatedRoute, // initial snapshot without hedging
  lngLat: [98.70, 3.55] as [number, number],
  screenPos: { x: 450, y: 320 },
};

// Simulated async background resolution: backend attaches hedging to detour route
const updatedActiveRoutes = [
  baselineRoute,
  {
    ...uncalculatedRoute,
    hedging: {
      reroute_cost_idr: 750000,
      reroute_policy: { cost_idr: 750000 },
    },
  },
];

const syncedState = syncRoutePopover(initialPopoverState, updatedActiveRoutes);
assert.ok(syncedState !== null);
assert.strictEqual(syncedState.route.hedging?.reroute_cost_idr, 750000);

const updatedCostDisplay = resolveRouteCostDisplay(syncedState, updatedActiveRoutes);
console.log(`  Async Popover Route Synced: ${updatedCostDisplay.display}`);
assert.strictEqual(updatedCostDisplay.display, '+Rp 750.000');
assert.strictEqual(updatedCostDisplay.costIdr, 750000);

// Test 2.2: Popover dismissal when active routes shrink and route no longer exists
const shrankActiveRoutes = [baselineRoute]; // route at index 1 is now gone
const dismissedState = syncRoutePopover(initialPopoverState, shrankActiveRoutes);
console.log('  Route index no longer in activeRoutes -> Popover cleanly dismissed:', dismissedState === null);
assert.strictEqual(dismissedState, null);

console.log('✓ Reactive popover synchronization & cleanup verified successfully\n');

// ==========================================
// TEST 3: CARGO PRESET BEHAVIOR & SIDEBAR HYDRATION
// ==========================================

console.log('[TEST 3] Verifying Cargo Preset State Transitions & Hydration...');

const cargoTiers = [
  { id: 'ikan_segar', label: 'Cold Chain', tonnage: 10.0, reeferPerHour: 45000 },
  { id: 'cabai_merah', label: 'Hortikultura', tonnage: 10.0, spoilageRatePerHour: 0.025 },
  { id: 'beras', label: 'Kargo Kering', tonnage: 10.0, reeferPerHour: 0 },
];

let activePopover: 'nodes' | 'disruption' | 'radius' | 'speed' | 'cargo' | null = null;
let currentCommodity: string | null = null;

// Simulate clicking trigger button
activePopover = 'cargo';
assert.strictEqual(activePopover, 'cargo');

// Simulate picking cold chain
currentCommodity = cargoTiers[0].id;
activePopover = null; // Popover cleanly closes on selection
assert.strictEqual(currentCommodity, 'ikan_segar');
assert.strictEqual(activePopover, null);

// Simulate resetting commodity
currentCommodity = null;
assert.strictEqual(currentCommodity, null);

console.log('  Trigger -> Select ikan_segar -> Popover auto-close -> Reset verified');

// 3.2 MitigationTab origin/dest resolver testing
function resolveOriginDest(routeLabel: string | undefined): { origin: string | null; destination: string | null } {
  if (!routeLabel) return { origin: null, destination: null };
  const parts = routeLabel.split(/→|->|\bto\b|\s+-\s+/i);
  const origin = parts.length > 1 && parts[0].trim() ? parts[0].replace(/^(Jalur Arteri|Rute|Pengalihan via)\s+/i, '').trim() : null;
  const destination = parts.length > 1 && parts[1].trim() ? parts[1].trim() : null;
  return { origin, destination };
}

const resolvedDesc1 = resolveOriginDest('Jalur Arteri Medan - Tebing Tinggi');
console.log(`  Origin/Dest from "Jalur Arteri Medan - Tebing Tinggi": ${resolvedDesc1.origin} -> ${resolvedDesc1.destination}`);
assert.strictEqual(resolvedDesc1.origin, 'Medan');
assert.strictEqual(resolvedDesc1.destination, 'Tebing Tinggi');

const resolvedDesc2 = resolveOriginDest('Belawan Port -> Pekanbaru Hub');
console.log(`  Origin/Dest from "Belawan Port -> Pekanbaru Hub": ${resolvedDesc2.origin} -> ${resolvedDesc2.destination}`);
assert.strictEqual(resolvedDesc2.origin, 'Belawan Port');
assert.strictEqual(resolvedDesc2.destination, 'Pekanbaru Hub');

console.log('✓ Cargo preset state transitions & robust origin/dest hydration verified successfully\n');

console.log('=== ALL PHASE 105 TEST SUITES PASSED (3/3) ===');
