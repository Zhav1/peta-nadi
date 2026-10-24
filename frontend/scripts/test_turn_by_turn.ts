try {
  process.loadEnvFile('.env.local');
} catch {
  try {
    process.loadEnvFile('frontend/.env.local');
  } catch {}
}

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
  buildExcludeParam,
  type LonLat,
  type ExcludeOptions,
} from '../lib/aiDynamicRouter.ts';

console.log('--- RUNNING PHASE 97 TURN-BY-TURN ROAD NETWORK & DUAL-LAYER HAZARD DETOUR TEST ---');

// =========================================================================
// TEST 1: Tangential Normal Waypoint Geometry & Bilateral Clearance
// =========================================================================
console.log('\n[TEST 1] Verifying Tangential Normal Waypoint Geometry (R + 2.0 km)...');

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
// TEST 2: Quota Guard In-Memory Memoization & Exclude Query Builder
// =========================================================================
console.log('\n[TEST 2] Verifying Mapbox Quota Guard & Dynamic Exclude Builder...');

// Test buildExcludeParam helper
const sampleExcludeOpts: ExcludeOptions = {
  excludeToll: true,
  excludeMotorway: true,
  excludePoints: [
    [98.6742, 3.7000],
    [98.6800, 3.7100],
  ],
};
const excludeQuery = buildExcludeParam(sampleExcludeOpts);
console.log(`  Generated exclude parameter: "${excludeQuery}"`);
assert(excludeQuery.includes('toll'), 'Exclude query must contain "toll"');
assert(excludeQuery.includes('motorway'), 'Exclude query must contain "motorway"');
assert(excludeQuery.includes('point(98.67420 3.70000)'), 'Exclude query must contain formatted point');

const testCacheKey = 'driving-traffic:98.62,3.58;98.65,3.56:test:toll';
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
// TEST 3: Dual-Layer Hazard Avoidance Evaluation (Point vs Polygon)
// =========================================================================
console.log('\n[TEST 3] Evaluating Dual-Layer Hazard Avoidance (Point <500m & Polygon >=500m)...');

// Synthetic straight line passing through hazard center
const straightLineChord: LonLat[] = [origin, hazardCenter, destination];
const straightLineMetrics = calculateHazardExposureMetrics(straightLineChord, hazardCenter, hazardRadiusKm);
console.log(`  Straight line exposure: ${straightLineMetrics.exposureKm} km (Intersecting: ${straightLineMetrics.isIntersecting})`);
assert(straightLineMetrics.isIntersecting, 'Straight line cutting through hazard center must be flagged intersecting');

// Tangential detour path passing through the tangential waypoint (Layer 2)
const tangentialDetourPath: LonLat[] = [origin, wpPlus90, destination];
const detourMetrics = calculateHazardExposureMetrics(tangentialDetourPath, hazardCenter, hazardRadiusKm, 0.1);
console.log(`  Tangential detour exposure: ${detourMetrics.exposureKm} km (Intersecting: ${detourMetrics.isIntersecting})`);
assert(!detourMetrics.isIntersecting, 'Tangential detour path with R+2km clearance must NOT intersect hazard');
assert.equal(detourMetrics.exposureKm, 0, 'Detour exposure length must be 0 km');

// Point obstacle evaluation (< 500m)
const pointObstacleCenter: LonLat = [98.6742, 3.7000];
const pointObstacleRadiusKm = 0.2; // 200m point obstacle
const pointMetrics = calculateHazardExposureMetrics(tangentialDetourPath, pointObstacleCenter, pointObstacleRadiusKm, 0.05);
assert(!pointMetrics.isIntersecting, 'Bypass must clear point obstacle cleanly');
assert.equal(pointMetrics.exposureKm, 0, 'Point obstacle exposure must be 0 km');

console.log('  ✓ Dual-layer hazard avoidance validation passed with 0 km exposure');

// =========================================================================
// TEST 4: Live Mapbox API Snapped Benchmark (Manhattan Medan -> USU >200 pts)
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
    assert(
      manhattanPrimary.coordinates.length > 200,
      `Expected >200 road-snapped coordinates, got ${manhattanPrimary.coordinates.length}`
    );
    console.log(`  ✓ Manhattan -> USU snapped along road network with ${manhattanPrimary.coordinates.length} points (>200 target)`);
  }

  // Live Layer 1 Verification: Point Obstacle Avoidance (< 500m)
  console.log('\n[LIVE VERIFICATION] Layer 1: Point Obstacle Avoidance (< 500m)...');
  const obstaclePoint: LonLat = [98.6425, 3.5681];
  const pointObstacleRadius = 0.2; // 200m landslide
  const pointCorridors = await calculateAIDynamicDetourRoutes(
    obstaclePoint,
    pointObstacleRadius,
    manhattanOrigin,
    usuDest,
    'truck',
    'landslide'
  );
  const pointDetour = pointCorridors.find((c) => c.corridor_type === 'land_detour');
  assert(pointDetour !== undefined, 'Point obstacle detour corridor must be present');
  console.log(`  Point Detour Status: ${pointDetour.safety_status} | Tag: ${pointDetour.safety_tag}`);
  if (manhattanPrimary.source === 'live') {
    assert.equal(pointDetour.safety_status, 'SAFE_DETOUR', 'Point obstacle detour must achieve SAFE_DETOUR');
    assert(
      pointDetour.safety_tag === 'PENGALIHAN BEBAS BENCANA (TITIK RINTANGAN)' ||
      Boolean(pointDetour.safety_tag?.startsWith('PENGALIHAN AMAN')),
      `Expected Layer 1 or Layer 2 safe tag, got: ${pointDetour.safety_tag}`
    );
    console.log(`  ✓ Point obstacle detour verified with SAFE_DETOUR (${pointDetour.safety_tag})`);
  }

  // Live Layer 2 Verification: Wide Disaster Polygon Detour (>= 500m)
  console.log('\n[LIVE VERIFICATION] Layer 2: Wide Disaster Polygon Detour (>= 500m)...');
  const wideHazardRadius = 0.8; // 800m flood
  const wideCorridors = await calculateAIDynamicDetourRoutes(
    obstaclePoint,
    wideHazardRadius,
    manhattanOrigin,
    usuDest,
    'truck',
    'flood'
  );
  const wideDetour = wideCorridors.find((c) => c.corridor_type === 'land_detour');
  assert(wideDetour !== undefined, 'Wide polygon detour corridor must be present');
  console.log(`  Wide Detour Status: ${wideDetour.safety_status} | Tag: ${wideDetour.safety_tag}`);
  if (manhattanPrimary.source === 'live') {
    assert.equal(wideDetour.safety_status, 'SAFE_DETOUR', 'Wide polygon detour must achieve SAFE_DETOUR');
    assert.equal(wideDetour.is_compromised, false, 'Wide polygon detour must not be compromised');
    console.log('  ✓ Layer 2 wide polygon detour verified with SAFE_DETOUR');
  }

  console.log('\n=== ALL PHASE 97 TEST SUITES PASSED (4/4) ===');
}

runRoutingTest().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
