try {
  process.loadEnvFile('.env.local');
} catch {}

import assert from 'node:assert/strict';
import {
  computeTangentialWaypoint,
  calculateHazardExposureMetrics,
  getHaversineDistanceKm,
  requestMapboxDirections,
  directionsCache,
  setCachedDirections,
  getCachedDirections,
  fetchMapboxAlternativeDrivingRoutes,
  calculateAIDynamicDetourRoutes,
  type LonLat,
} from '../lib/aiDynamicRouter.ts';

console.log('--- RUNNING PHASE 87 TURN-BY-TURN ROAD NETWORK & TANGENTIAL DETOUR TEST ---');

// =========================================================================
// TEST 1: Tangential Waypoint Math & Orthogonal Clearance
// =========================================================================
console.log('\n[TEST 1] Verifying Tangential Normal Waypoint Geometry...');

const origin: LonLat = [98.6776, 3.7922]; // Pelabuhan Belawan
const destination: LonLat = [98.6712, 3.6013]; // Simpang Pos Medan
// Midpoint hazard along direct arterial corridor (Marelan / Medan Utara)
const hazardCenter: LonLat = [98.6742, 3.7000];
const hazardRadiusKm = 2.0;
const clearanceKm = hazardRadiusKm + 2.5; // 4.5 km safe clearance (> radius + 2.0 km buffer)

// Test +90 degrees (East flank)
const wpPlus90 = computeTangentialWaypoint(origin, destination, hazardCenter, clearanceKm, Math.PI / 2);
const distPlus90 = getHaversineDistanceKm(hazardCenter, wpPlus90);

console.log(`  +90 deg Waypoint: [${wpPlus90[0]}, ${wpPlus90[1]}] (Distance to hazard center: ${distPlus90.toFixed(2)} km)`);
assert(
  Math.abs(distPlus90 - clearanceKm) < 0.1,
  `Expected distance to hazard center ~${clearanceKm} km, got ${distPlus90.toFixed(2)} km`
);

// Test -90 degrees (West flank)
const wpMinus90 = computeTangentialWaypoint(origin, destination, hazardCenter, clearanceKm, -Math.PI / 2);
const distMinus90 = getHaversineDistanceKm(hazardCenter, wpMinus90);

console.log(`  -90 deg Waypoint: [${wpMinus90[0]}, ${wpMinus90[1]}] (Distance to hazard center: ${distMinus90.toFixed(2)} km)`);
assert(
  Math.abs(distMinus90 - clearanceKm) < 0.1,
  `Expected distance to hazard center ~${clearanceKm} km, got ${distMinus90.toFixed(2)} km`
);

// Verify opposing bilateral coordinates
assert(
  wpPlus90[0] !== wpMinus90[0] || wpPlus90[1] !== wpMinus90[1],
  'Opposing tangents must not calculate identical coordinates'
);

console.log('  ✓ Tangential waypoint vector math verified successfully');

// =========================================================================
// TEST 2: Quota Guard In-Memory Memoization Cache
// =========================================================================
console.log('\n[TEST 2] Verifying Mapbox Quota Guard Memoization Layer...');

const testCacheKey = 'driving-traffic:98.62,3.58;98.65,3.56:test:false';
const mockResponse = {
  code: 'Ok',
  routes: [
    {
      distance: 5500,
      duration: 720,
      geometry: { coordinates: [origin, destination] },
      legs: [
        {
          summary: 'Jl. Gatot Subroto',
          steps: [{ maneuver: { instruction: 'Head east on Jl. Gatot Subroto' }, distance: 200, duration: 30 }],
        },
      ],
    },
  ],
};

setCachedDirections(testCacheKey, mockResponse as any);
const retrieved = getCachedDirections(testCacheKey);

assert(retrieved !== null, 'Cache must return stored item before TTL expiration');
assert.equal(retrieved?.routes?.[0].distance, 5500, 'Retrieved cache item must preserve payload');

console.log('  ✓ Cache hit verified: returned stored route without network call');

// =========================================================================
// TEST 3: Hazard Exposure & Street Snapping Evaluation
// =========================================================================
console.log('\n[TEST 3] Evaluating Simulated Hazard Penetration on Manhattan -> USU...');

// Construct a synthetic straight line passing right through the hazard center
const straightLineChord: LonLat[] = [
  origin,
  hazardCenter,
  destination,
];

const straightLineMetrics = calculateHazardExposureMetrics(straightLineChord, hazardCenter, hazardRadiusKm);
console.log(`  Straight line exposure: ${straightLineMetrics.exposureKm} km (Intersecting: ${straightLineMetrics.isIntersecting})`);
assert(straightLineMetrics.isIntersecting, 'Straight line cutting through hazard center must be flagged intersecting');

// Construct a detour path passing through the tangential waypoint
const tangentialDetourPath: LonLat[] = [
  origin,
  wpPlus90,
  destination,
];

const detourMetrics = calculateHazardExposureMetrics(tangentialDetourPath, hazardCenter, hazardRadiusKm);
console.log(`  Tangential detour exposure: ${detourMetrics.exposureKm} km (Intersecting: ${detourMetrics.isIntersecting})`);
assert(!detourMetrics.isIntersecting, 'Tangential detour path with R+2km clearance must NOT intersect hazard');
assert.equal(detourMetrics.exposureKm, 0, 'Detour exposure length must be 0 km');

console.log('  ✓ Hazard avoidance validation passed with 0 km exposure');

// =========================================================================
// TEST 4: Live Mapbox API or Deterministic Snapped Execution
// =========================================================================
console.log('\n[TEST 4] Testing Live/Fallback Routing on Manhattan Medan -> USU Corridor...');

async function runRoutingTest() {
  const routes = await fetchMapboxAlternativeDrivingRoutes(origin, destination);
  assert(routes.length > 0, 'Must return at least one driving route recommendation');
  
  const primary = routes[0];
  console.log(`  Route Summary: "${primary.summary}" | Source: ${primary.source}`);
  console.log(`  Distance: ${primary.distanceKm} km | Duration: ${primary.durationMinutes} mins`);
  console.log(`  Coordinate points count: ${primary.coordinates.length}`);

  if (primary.source === 'live') {
    assert(
      primary.coordinates.length > 50,
      `Expected road network snapping with >50 coordinates, got ${primary.coordinates.length}`
    );
    console.log(`  ✓ Live Mapbox Directions returned street-snapped geometry (${primary.coordinates.length} points)`);
    if (primary.maneuvers && primary.maneuvers.length > 0) {
      console.log(`  ✓ Maneuvers extracted: ${primary.maneuvers.length} turn-by-turn steps`);
      console.log(`    Sample step: "${primary.maneuvers[0].instruction}"`);
    }
  } else {
    console.log(`  (Note: Live Mapbox token offline; fallback highway route returned ${primary.coordinates.length} points)`);
  }

  // Test full dynamic detour calculation
  const allCorridors = await calculateAIDynamicDetourRoutes(
    hazardCenter,
    hazardRadiusKm,
    origin,
    destination,
    'truck',
    'flood'
  );

    assert(allCorridors.length >= 2, 'Must compute both Primary and Detour corridors');
  const landPrimary = allCorridors.find((c) => c.corridor_type === 'land_primary');
  const landDetour = allCorridors.find((c) => c.corridor_type === 'land_detour');

  assert(landPrimary !== undefined, 'Land primary corridor must be present');
  assert(landDetour !== undefined, 'Land detour corridor must be present');
  console.log(`  Primary Route Status: ${landPrimary?.safety_status} (Compromised: ${landPrimary?.is_compromised})`);
  console.log(`  Detour Route Status: ${landDetour?.safety_status} (Safety Tag: ${landDetour?.safety_tag})`);

  // Explicit Benchmark: Manhattan Times Square Medan -> Universitas Sumatera Utara (USU)
  console.log('\n[BENCHMARK] Manhattan Times Square Medan -> Universitas Sumatera Utara (USU)...');
  const manhattanOrigin: LonLat = [98.6253, 3.5855];
  const usuDest: LonLat = [98.6570, 3.5650];
  const manhattanRoutes = await fetchMapboxAlternativeDrivingRoutes(manhattanOrigin, usuDest);
  assert(manhattanRoutes.length > 0, 'Must return routes for Manhattan -> USU');
  const manhattanPrimary = manhattanRoutes[0];
  console.log(`  Manhattan -> USU Route: "${manhattanPrimary.summary}"`);
  console.log(`  Distance: ${manhattanPrimary.distanceKm} km | Duration: ${manhattanPrimary.durationMinutes} mins`);
  console.log(`  Coordinate points: ${manhattanPrimary.coordinates.length}`);
  if (manhattanPrimary.source === 'live') {
    assert(manhattanPrimary.coordinates.length > 50, `Expected >50 coordinates, got ${manhattanPrimary.coordinates.length}`);
    console.log(`  ✓ Manhattan -> USU snapped along road network with ${manhattanPrimary.coordinates.length} points (>50 target)`);
  }

  console.log('\n=== ALL PHASE 85 TEST SUITES PASSED (4/4) ===');
}

runRoutingTest().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
