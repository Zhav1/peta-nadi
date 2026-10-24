import assert from 'node:assert/strict';
import { calculateAIDynamicDetourRoutes, type LonLat } from '../lib/aiDynamicRouter';
import {
  STRATEGIC_SUMATRA_HUBS,
  PRECOMPUTED_HUB_CORRIDORS,
  findNearestStrategicHub,
  findPrecomputedHubCorridor,
  clearDynamicRouteCache,
} from '../lib/hubCorridorCache';

async function runBenchmark() {
  console.log('=== BENCHMARK: SUB-SECOND ROUTING ENGINE & 18-HUB MATRIX CACHE ===');

  // STEP 0: Verify 18 Strategic Sumatra Logistics Hubs
  console.log(`[TEST 0] Verifying STRATEGIC_SUMATRA_HUBS definition: ${STRATEGIC_SUMATRA_HUBS.length} hubs...`);
  assert.equal(STRATEGIC_SUMATRA_HUBS.length, 18, 'Expected exactly 18 strategic Sumatra hubs in matrix');
  const hubIds = new Set(STRATEGIC_SUMATRA_HUBS.map((h) => h.id));
  assert.equal(hubIds.size, 18, 'All 18 hub IDs must be strictly unique');
  assert(hubIds.has('sibolga_hub'), 'sibolga_hub must be present');
  assert(hubIds.has('bengkulu_hub'), 'bengkulu_hub must be present');
  assert(hubIds.has('banda_aceh'), 'banda_aceh must be present');
  assert(hubIds.has('medan_kim'), 'medan_kim must be present');
  assert(hubIds.has('belawan_port'), 'belawan_port must be present');
  assert(hubIds.has('bakauheni_port'), 'bakauheni_port must be present');
  console.log('  PASS  All 18 strategic logistics hubs verified across Sumatra');

  // STEP 0B: Verify Pre-Computed Hub-to-Hub Corridors (<50ms retrieval)
  console.log('[TEST 0B] Testing findPrecomputedHubCorridor for key inter-hub corridors...');
  const tPre0 = performance.now();
  // Banda Aceh -> Medan KIM
  const bandaAcehCoords: LonLat = [95.3193, 5.5483];
  const medanCoords: LonLat = [98.6700, 3.6800];
  const corridorBnaMed = findPrecomputedHubCorridor(bandaAcehCoords, medanCoords);
  const tPre1 = performance.now();
  const precomputedLatencyMs = tPre1 - tPre0;

  assert(corridorBnaMed, 'Expected pre-computed corridor between Banda Aceh and Medan');
  assert(corridorBnaMed.coordinates.length >= 10, 'Precomputed corridor must contain multi-vertex polyline');
  assert(corridorBnaMed.distanceKm > 500, 'Distance Banda Aceh - Medan must be > 500 km');
  assert(precomputedLatencyMs < 50.0, `Precomputed lookup ${precomputedLatencyMs.toFixed(2)}ms exceeded 50ms threshold`);
  console.log(`  PASS  Pre-computed corridor Banda Aceh -> Medan retrieved in ${precomputedLatencyMs.toFixed(2)} ms (${corridorBnaMed.coordinates.length} waypoints, ${corridorBnaMed.distanceKm} km)`);

  // Reverse corridor test: Medan -> Banda Aceh
  const corridorMedBna = findPrecomputedHubCorridor(medanCoords, bandaAcehCoords);
  assert(corridorMedBna, 'Expected reverse pre-computed corridor between Medan and Banda Aceh');
  assert.deepEqual(corridorMedBna.coordinates[0], corridorBnaMed.coordinates[corridorBnaMed.coordinates.length - 1]);
  console.log('  PASS  Reverse corridor orientation correctly inverted');

  // Belawan -> Pekanbaru
  const belawanCoords: LonLat = [98.6776, 3.7922];
  const pekanbaruCoords: LonLat = [101.4478, 0.5071];
  const corridorBelPku = findPrecomputedHubCorridor(belawanCoords, pekanbaruCoords);
  assert(corridorBelPku, 'Expected precomputed corridor between Belawan and Pekanbaru');
  console.log(`  PASS  Pre-computed corridor Belawan -> Pekanbaru verified (${corridorBelPku.distanceKm} km)`);

  // Palembang -> Bakauheni
  const palembangCoords: LonLat = [104.7565, -2.9909];
  const bakauheniCoords: LonLat = [105.7533, -5.8711];
  const corridorPlmBkh = findPrecomputedHubCorridor(palembangCoords, bakauheniCoords);
  assert(corridorPlmBkh, 'Expected precomputed corridor between Palembang and Bakauheni');
  console.log(`  PASS  Pre-computed corridor Palembang -> Bakauheni verified (${corridorPlmBkh.distanceKm} km)`);

  // STEP 1: Cold start latency test (Aceh Utara -> Sei Rampah)
  const acehUtaraCoords: LonLat = [97.1500, 5.1000];
  const seiRampahCoords: LonLat = [99.0500, 3.5500];
  const hazardCenter: LonLat = [98.6500, 3.6000]; // Flood hazard near Medan entrance
  const radiusKm = 8;

  // Clear cache first to test cold calculation latency
  clearDynamicRouteCache();

  console.log('\n[RUN 1: COLD START] Computing parallel corridors with optimized Mapbox feeder profiles...');
  const t0 = performance.now();
  const routesCold = await calculateAIDynamicDetourRoutes(
    hazardCenter,
    radiusKm,
    acehUtaraCoords,
    seiRampahCoords,
    'best',
    'flood',
    undefined,
    'RED_CONFIRMED'
  );
  const t1 = performance.now();
  const coldLatencyMs = t1 - t0;

  console.log(`  -> Cold calculation time: ${coldLatencyMs.toFixed(1)} ms`);
  console.log(`  -> Total corridors returned: ${routesCold.length}`);
  for (const r of routesCold) {
    console.log(`     • [${r.id}] ${r.route_name} (viable: ${r.viable}, safety: ${r.safety_status}, tag: ${r.safety_tag})`);
  }

  // Assert cold round-trip is strictly < 2000 ms (2.0s, massive reduction from previous 30s+ waterfall)
  assert(coldLatencyMs < 2000.0, `Cold routing latency ${coldLatencyMs.toFixed(1)}ms exceeded 2000ms threshold!`);
  console.log(`  PASS  Cold calculation completed in ${(coldLatencyMs / 1000).toFixed(2)}s (< 2.0s goal)`);

  // Assert all 4 corridor types exist (land_primary, land_detour, sea_intermodal, air_intermodal)
  const corridorTypes = routesCold.map((r) => r.corridor_type);
  assert(corridorTypes.includes('land_primary'), 'Must include land_primary');
  assert(corridorTypes.includes('land_detour'), 'Must include land_detour');
  assert(corridorTypes.includes('sea_intermodal'), 'Must include sea_intermodal');
  assert(corridorTypes.includes('air_intermodal'), 'Must include air_intermodal');
  console.log('  PASS  All 4 core corridor modalities successfully computed');

  // STEP 2: Warm in-memory cache hit test
  console.log('\n[RUN 2: WARM CACHE HIT] Re-querying identical trip coordinates...');
  const t2 = performance.now();
  const routesWarm = await calculateAIDynamicDetourRoutes(
    hazardCenter,
    radiusKm,
    acehUtaraCoords,
    seiRampahCoords,
    'best',
    'flood',
    undefined,
    'RED_CONFIRMED'
  );
  const t3 = performance.now();
  const warmLatencyMs = t3 - t2;

  console.log(`  -> Warm cache hit time: ${warmLatencyMs.toFixed(2)} ms`);
  assert(warmLatencyMs < 50.0, `Warm cache latency ${warmLatencyMs.toFixed(2)}ms exceeded 50ms threshold!`);
  assert.equal(routesWarm.length, routesCold.length);
  console.log(`  PASS  Warm in-memory route retrieval completed in ${warmLatencyMs.toFixed(2)}ms (< 50ms goal)`);

  console.log('\n✅ ALL SUB-SECOND ROUTING LATENCY & 18-HUB MATRIX BENCHMARKS PASSED (100% CLEAN)!');
}

runBenchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
