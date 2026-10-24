import assert from 'node:assert';
import {
  calculateTotalTripCost,
  formatCompactIDR,
  formatTripCostIDR,
  isColdChain,
  resolvePopoverDualMetric,
  FUEL_CONSUMPTION_KM_PER_LITER,
  BIOSOLAR_RATE_PER_LITER,
  DRIVER_LABOR_HOURLY_RATE,
  REEFER_GENSET_HOURLY_RATE,
} from '../lib/tripCostCalculator';
import { calculateAIDynamicDetourRoutes, type LonLat } from '../lib/aiDynamicRouter';
import type { RouteRecommendation } from '../lib/types';

console.log('=== PHASE 106 DUAL-METRIC OPERATIONAL COST & TRIP ECONOMICS TEST SUITE ===\n');

// ==========================================
// TEST 1: FIRST-PRINCIPLES TRIP OPERATIONAL COST ENGINE
// ==========================================
console.log('[TEST 1] Verifying First-Principles Trip Operational Cost Arithmetic...');

// 1.1 Banda Aceh -> Tembilahan Corridor (1,517 km, 32h 16m = 1936 mins, Cold Chain 10T)
const bandaAcehToTembilahanDistKm = 1517;
const bandaAcehToTembilahanDurationMins = 32 * 60 + 16; // 1936 mins (32.2667 hours)

const coldChainTrip = calculateTotalTripCost({
  distanceKm: bandaAcehToTembilahanDistKm,
  durationMinutes: bandaAcehToTembilahanDurationMins,
  commodity: 'ikan_segar',
  vehicleGolongan: 'GOL_II',
  tollCostIdr: 0,
});

console.log(`  1.1 Cold Chain (10T) Banda Aceh -> Tembilahan:`);
console.log(`      - Jarak: ${bandaAcehToTembilahanDistKm} km`);
console.log(`      - Durasi: ${(bandaAcehToTembilahanDurationMins / 60).toFixed(2)} jam`);
console.log(`      - BBM Biosolar (3.5 km/L @ Rp 6.800): Rp ${coldChainTrip.operational_cost_breakdown.fuel_cost_idr.toLocaleString('id-ID')}`);
console.log(`      - Upah Supir (Rp 50.000/jam): Rp ${coldChainTrip.operational_cost_breakdown.labor_cost_idr.toLocaleString('id-ID')}`);
console.log(`      - Genset Reefer (Rp 45.000/jam): Rp ${coldChainTrip.operational_cost_breakdown.reefer_genset_cost_idr.toLocaleString('id-ID')}`);
console.log(`      - Tol BPJT: Rp ${coldChainTrip.operational_cost_breakdown.toll_cost_idr.toLocaleString('id-ID')}`);
console.log(`      - TOTAL OPERASIONAL: Rp ${coldChainTrip.total_operational_cost_idr.toLocaleString('id-ID')} (${formatCompactIDR(coldChainTrip.total_operational_cost_idr)})`);

// Verify exact formula arithmetic
const expectedFuel = Math.round((1517 / FUEL_CONSUMPTION_KM_PER_LITER) * BIOSOLAR_RATE_PER_LITER); // 2,947,314
const expectedLabor = Math.round((1936 / 60) * DRIVER_LABOR_HOURLY_RATE); // 1,613,333
const expectedReefer = Math.round((1936 / 60) * REEFER_GENSET_HOURLY_RATE); // 1,452,000
const expectedTotal = expectedFuel + expectedLabor + expectedReefer; // 6,012,647

assert.strictEqual(coldChainTrip.operational_cost_breakdown.fuel_cost_idr, expectedFuel);
assert.strictEqual(coldChainTrip.operational_cost_breakdown.labor_cost_idr, expectedLabor);
assert.strictEqual(coldChainTrip.operational_cost_breakdown.reefer_genset_cost_idr, expectedReefer);
assert.strictEqual(coldChainTrip.total_operational_cost_idr, expectedTotal);
assert.ok(
  Math.abs(coldChainTrip.total_operational_cost_idr - 6012647) <= 100,
  `Baseline operational cost ${coldChainTrip.total_operational_cost_idr} must match 6.012.647 within +/- 100`
);
assert.strictEqual(formatCompactIDR(coldChainTrip.total_operational_cost_idr), 'Rp 6,01 Jt');
assert.strictEqual(formatTripCostIDR(coldChainTrip.total_operational_cost_idr), 'Rp 6.012.647');
console.log('  ✓ 1.1 Cold Chain baseline matches Rp 6.012.647 (+/- 100) and formats as "Rp 6,01 Jt"');

// 1.2 Dry Bulk (Beras) - Zero Reefer Fuel
const dryBulkTrip = calculateTotalTripCost({
  distanceKm: bandaAcehToTembilahanDistKm,
  durationMinutes: bandaAcehToTembilahanDurationMins,
  commodity: 'beras',
  vehicleGolongan: 'GOL_II',
  tollCostIdr: 0,
});
console.log(`  1.2 Dry Bulk (Beras) Banda Aceh -> Tembilahan:`);
console.log(`      - Genset Reefer: Rp ${dryBulkTrip.operational_cost_breakdown.reefer_genset_cost_idr.toLocaleString('id-ID')}`);
console.log(`      - TOTAL OPERASIONAL: Rp ${dryBulkTrip.total_operational_cost_idr.toLocaleString('id-ID')} (${formatCompactIDR(dryBulkTrip.total_operational_cost_idr)})`);
assert.strictEqual(dryBulkTrip.operational_cost_breakdown.reefer_genset_cost_idr, 0);
assert.strictEqual(dryBulkTrip.total_operational_cost_idr, expectedFuel + expectedLabor);
assert.strictEqual(formatCompactIDR(dryBulkTrip.total_operational_cost_idr), 'Rp 4,56 Jt');
console.log('  ✓ 1.2 Dry Bulk strictly incurs Rp 0 reefer fuel');

// 1.3 Toll Integration
const tollTrip = calculateTotalTripCost({
  distanceKm: 200,
  durationMinutes: 180,
  commodity: 'beras',
  tollCostIdr: 155000,
});
assert.strictEqual(tollTrip.operational_cost_breakdown.toll_cost_idr, 155000);
const expTollFuel = Math.round((200 / 3.5) * 6800);
const expTollLabor = Math.round(3 * 50000);
assert.strictEqual(tollTrip.total_operational_cost_idr, expTollFuel + expTollLabor + 155000);
console.log('  ✓ 1.3 BPJT toll tariff correctly adds to total trip cost');

// 1.4 Commodity detection keywords across all cold produce variants
assert.strictEqual(isColdChain('ikan_segar'), true);
assert.strictEqual(isColdChain('daging_sapi'), true);
assert.strictEqual(isColdChain('udang'), true);
assert.strictEqual(isColdChain('udang_vaname'), true);
assert.strictEqual(isColdChain('susu_segar'), true);
assert.strictEqual(isColdChain('susu_pasteurisasi'), true);
assert.strictEqual(isColdChain('ayam_potong'), true);
assert.strictEqual(isColdChain('Cold Chain (10T)'), true);
assert.strictEqual(isColdChain('chilled_beef'), true);
assert.strictEqual(isColdChain('ikan_tongkol_beku'), true);
assert.strictEqual(isColdChain('beras'), false);
assert.strictEqual(isColdChain('cabai_merah'), false);
assert.strictEqual(isColdChain('hortikultura'), false);
assert.strictEqual(isColdChain('minyak_goreng'), false);
assert.strictEqual(isColdChain(null), false);
console.log('  ✓ 1.4 Cold chain commodity classification verified across all tiers and edge variants\n');

// ==========================================
// TEST 2: DUAL-METRIC POPOVER RESOLUTION (VARIANT C)
// ==========================================
console.log('[TEST 2] Verifying Dual-Metric Popover Resolution (Variant C)...');

// 2.1 Baseline Route Popover Resolution
const mockBaseline: RouteRecommendation = {
  description: 'Koridor Darat Utama (Tol / Jalinsum)',
  waypoints: [{ lat: 5.55, lon: 95.32 }],
  distance_km: 1517,
  eta_minutes: 1936,
  fuel_increase_pct: 0,
  risk_score: 0.05,
  is_compromised: false,
  safety_status: 'CLEAR',
  corridor_type: 'land_primary',
  total_operational_cost_idr: 6012647,
  operational_cost_breakdown: {
    fuel_cost_idr: expectedFuel,
    labor_cost_idr: expectedLabor,
    reefer_genset_cost_idr: expectedReefer,
    toll_cost_idr: 0,
    total_operational_cost_idr: 6012647,
  },
};

const popover0 = resolvePopoverDualMetric(0, mockBaseline, [mockBaseline]);
console.log(`  2.1 Baseline Route Popover:`);
console.log(`      Header: ${popover0.header}`);
console.log(`      Est. Total: ${popover0.totalDisplay}`);
console.log(`      Badge: ${popover0.badge}`);
console.log(`      Subtitle: ${popover0.subtitle}`);

assert.strictEqual(popover0.header, 'Est. Operasional');
assert.strictEqual(popover0.totalDisplay, 'Rp 6,01 Jt');
assert.strictEqual(popover0.badge, 'Acuan (Δ Rp 0)');
assert.strictEqual(popover0.badgeType, 'baseline');
assert.strictEqual(popover0.subtitle, 'Jalur utama bebas hambatan');
assert.strictEqual(popover0.statusDotClass, 'bg-emerald-500');
console.log('  ✓ 2.1 Baseline renders "Est. Operasional: Rp 6,01 Jt", "Acuan (Δ Rp 0)", "Jalur utama bebas hambatan"');

// 2.2 Detour Route Popover Resolution (Delta +Rp 3,05 Jt)
const mockDetour: RouteRecommendation = {
  description: 'Rute Pengalihan Darat (Detour)',
  waypoints: [{ lat: 5.40, lon: 95.50 }],
  distance_km: 1850,
  eta_minutes: 2400,
  fuel_increase_pct: 22,
  risk_score: 0.08,
  is_compromised: false,
  safety_status: 'SAFE_DETOUR',
  corridor_type: 'land_detour',
  hedging: {
    reroute_cost_idr: 3050000,
    reroute_policy: { cost_idr: 3050000 },
  },
};

const popover1 = resolvePopoverDualMetric(1, mockDetour, [mockBaseline, mockDetour]);
console.log(`  2.2 Detour Route Popover:`);
console.log(`      Header: ${popover1.header}`);
console.log(`      Est. Total: ${popover1.totalDisplay}`);
console.log(`      Badge: ${popover1.badge}`);
console.log(`      Subtitle: ${popover1.subtitle}`);

assert.strictEqual(popover1.header, 'Est. Operasional');
assert.strictEqual(popover1.totalDisplay, 'Rp 9,06 Jt'); // 6.012.647 + 3.050.000 = 9.062.647
assert.strictEqual(popover1.badge, '+Rp 3,05 Jt (Detour)');
assert.strictEqual(popover1.badgeType, 'detour');
assert.strictEqual(popover1.subtitle, 'Detour terverifikasi');
console.log('  ✓ 2.2 Detour renders "Est. Operasional: Rp 9,06 Jt", "+Rp 3,05 Jt (Detour)", "Detour terverifikasi"');

// 2.3 Baseline Compromised Route Popover Resolution
const mockBaselineCompromised: RouteRecommendation = {
  ...mockBaseline,
  is_compromised: true,
  safety_status: 'COMPROMISED',
};
const popoverComp = resolvePopoverDualMetric(0, mockBaselineCompromised, [mockBaselineCompromised]);
assert.strictEqual(popoverComp.subtitle, 'Terdampak bencana');
assert.strictEqual(popoverComp.statusDotClass, 'bg-rose-500');
console.log('  ✓ 2.3 Compromised baseline renders "Terdampak bencana"');

// 2.4 Hold Staging Route Popover Resolution
const mockHold: RouteRecommendation = {
  description: 'Depo Penahanan Sementara',
  waypoints: [],
  distance_km: 1517,
  eta_minutes: 2656,
  fuel_increase_pct: 0,
  risk_score: 0.1,
  is_compromised: false,
  safety_status: 'HOLD_DELAY',
  corridor_type: 'hold_staging',
  tradeoff_analysis: {
    time_delta_minutes: 720,
    additional_cost_idr: 2500000,
    cost_breakdown_items: [
      { label: 'Reefer Plug (12 jam)', amount_idr: 540000 },
      { label: 'Demurrage & Stacking', amount_idr: 1500000 },
      { label: 'Risiko Susut Muatan', amount_idr: 460000 },
    ],
    pros: ['Aman dari banjir'],
    cons: ['Pengiriman tertunda 12 jam'],
  },
};
const popoverHold = resolvePopoverDualMetric(1, mockHold, [mockBaseline, mockHold]);
assert.strictEqual(popoverHold.subtitle, 'Tahan muatan di depo');
assert.strictEqual(popoverHold.statusDotClass, 'bg-amber-500');
assert.strictEqual(popoverHold.badge, '+Rp 2,50 Jt (Detour)');
console.log('  ✓ 2.4 Hold staging route popover renders "Tahan muatan di depo" with amber status\n');

// ==========================================
// TEST 3: PRIMARY ROUTE SAFETY STATUS & ROUTER INVARIANTS (WP3 & WP5)
// ==========================================
console.log('[TEST 3] Verifying Primary Route Safety Status Invariant Alignment...');

const origin: LonLat = [98.67, 3.59]; // Medan
const destination: LonLat = [99.16, 3.32]; // Tebing Tinggi

async function testDynamicRouterSafetyStatus() {
  // 3.1 Test with no hazard (Normal baseline condition)
  const routesNormal = await calculateAIDynamicDetourRoutes(
    null,
    8,
    origin,
    destination,
    'truck',
    'flood',
    undefined,
    'RED_CONFIRMED',
    undefined,
    { commodity: 'ikan_segar', vehicleGolongan: 'GOL_II' }
  );

  assert.ok(routesNormal.length >= 1, 'Router must return at least primary corridor');
  const primary = routesNormal[0];
  console.log(`  3.1 Normal Primary Corridor:`);
  console.log(`      Name: ${primary.route_name}`);
  console.log(`      Safety Status: ${primary.safety_status}`);
  console.log(`      Total Operational Cost: Rp ${primary.total_operational_cost_idr?.toLocaleString('id-ID')}`);
  console.log(`      Breakdown:`, primary.operational_cost_breakdown);

  // Invariant verification: Uncompromised baseline must be 'CLEAR', not 'SAFE_DETOUR'
  assert.strictEqual(
    primary.safety_status,
    'CLEAR',
    'Normal primary baseline corridor MUST be status CLEAR, never SAFE_DETOUR'
  );
  assert.ok(
    primary.total_operational_cost_idr != null && primary.total_operational_cost_idr > 0,
    'Primary corridor MUST have total_operational_cost_idr attached'
  );
  assert.ok(
    primary.operational_cost_breakdown != null,
    'Primary corridor MUST have operational_cost_breakdown attached'
  );
  assert.strictEqual(
    primary.operational_cost_breakdown.fuel_cost_idr +
      primary.operational_cost_breakdown.labor_cost_idr +
      primary.operational_cost_breakdown.reefer_genset_cost_idr +
      primary.operational_cost_breakdown.toll_cost_idr,
    primary.total_operational_cost_idr
  );
  console.log('  ✓ 3.1 Normal primary route safety_status is strictly "CLEAR" with full cost breakdown attached');

  // Verify all corridors carry operational cost and synchronized delta
  for (let i = 0; i < routesNormal.length; i++) {
    const r = routesNormal[i];
    assert.ok(
      r.total_operational_cost_idr != null && r.total_operational_cost_idr > 0,
      `Corridor [${i}] (${r.corridor_type}) must carry total_operational_cost_idr`
    );
    assert.ok(
      r.operational_cost_breakdown != null,
      `Corridor [${i}] (${r.corridor_type}) must carry operational_cost_breakdown`
    );
    assert.strictEqual(
      r.operational_cost_breakdown.total_operational_cost_idr,
      r.total_operational_cost_idr,
      `Corridor [${i}] breakdown total must equal total_operational_cost_idr`
    );
  }
  console.log(`  ✓ 3.2 All ${routesNormal.length} generated corridors carry synchronized first-principles operational costs`);

  // 3.2 Test with active hazard intersecting corridor
  const hazardCenter: LonLat = [98.90, 3.45]; // Near Tebing Tinggi corridor
  const routesDisrupted = await calculateAIDynamicDetourRoutes(
    hazardCenter,
    15,
    origin,
    destination,
    'truck',
    'flood',
    undefined,
    'RED_CONFIRMED',
    undefined,
    { commodity: 'ikan_segar', vehicleGolongan: 'GOL_II' }
  );

  const primaryDisrupted = routesDisrupted[0];
  const detourDisrupted = routesDisrupted[1];

  console.log(`  3.3 Disrupted Corridor Verification:`);
  console.log(`      Primary Safety Status: ${primaryDisrupted.safety_status} (is_compromised: ${primaryDisrupted.is_compromised})`);
  console.log(`      Detour Safety Status: ${detourDisrupted.safety_status} (is_compromised: ${detourDisrupted.is_compromised})`);
  console.log(`      Primary Total Cost: Rp ${primaryDisrupted.total_operational_cost_idr?.toLocaleString('id-ID')}`);
  console.log(`      Detour Total Cost: Rp ${detourDisrupted.total_operational_cost_idr?.toLocaleString('id-ID')}`);

  if (primaryDisrupted.is_compromised) {
    assert.strictEqual(primaryDisrupted.safety_status, 'COMPROMISED');
    assert.strictEqual(detourDisrupted.safety_status, 'SAFE_DETOUR');
    console.log('  ✓ 3.3 Active disaster correctly triggers COMPROMISED primary and SAFE_DETOUR on detour');
  }

  // 3.4 Verify popover telemetry resolution for both routes under disruption
  const p0 = resolvePopoverDualMetric(0, primaryDisrupted, routesDisrupted);
  const p1 = resolvePopoverDualMetric(1, detourDisrupted, routesDisrupted);
  assert.strictEqual(p0.header, 'Est. Operasional');
  assert.strictEqual(p1.header, 'Est. Operasional');
  assert.ok(p1.totalOperationalCost! >= p0.totalOperationalCost!, 'Detour total cost must be >= primary baseline cost');
  console.log('  ✓ 3.4 Dual-metric popover resolution verified on active disaster corridors');
}

void testDynamicRouterSafetyStatus().then(() => {
  console.log('\n=== ALL PHASE 106 DUAL-METRIC SUITES PASSED (3/3) ===');
});
