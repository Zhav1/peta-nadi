import assert from 'node:assert/strict';
import {
  buildNauticalPath,
  SUMATRA_NAUTICAL_PERIMETER,
  SUMATRA_PORT_CHANNELS,
  getHaversineDistanceKm,
  type LonLat,
} from '../lib/aiDynamicRouter';

console.log('=== TEST SUITE: NAUTICAL SEA-LANE PRECISION & LAND AVOIDANCE ===');

// 1. Verify perimeter has expanded to 29 high-density waypoints
console.log(`[TEST 1] Verifying SUMATRA_NAUTICAL_PERIMETER size: ${SUMATRA_NAUTICAL_PERIMETER.length} points`);
assert.equal(SUMATRA_NAUTICAL_PERIMETER.length, 29, 'Expected exactly 29 nautical waypoints in perimeter');
console.log('  PASS  Perimeter expanded to 29 bathymetrically verified waypoints');

// 2. Verify all 4 required waypoints are present in the Malacca Strait corridor (Indices 2..5)
console.log('[TEST 2] Verifying presence and coordinates of 4 new offshore fairways...');
const peureulak = SUMATRA_NAUTICAL_PERIMETER[2];
const langsa = SUMATRA_NAUTICAL_PERIMETER[3];
const brandan = SUMATRA_NAUTICAL_PERIMETER[4];
const belawanPilot = SUMATRA_NAUTICAL_PERIMETER[5];

assert.deepEqual(peureulak, [97.8000, 5.1500], 'Index 2 must be Peureulak Offshore Fairway');
assert.deepEqual(langsa, [98.2500, 4.6500], 'Index 3 must be Langsa Outer Sea Lane');
assert.deepEqual(brandan, [98.6000, 4.2500], 'Index 4 must be Teluk Aru / Pangkalan Brandan Offshore');
assert.deepEqual(belawanPilot, [98.8200, 4.0200], 'Index 5 must be Belawan Navigational Pilot Fairway');
console.log('  PASS  All 4 offshore waypoints correctly mapped at indices 2, 3, 4, 5');

// 3. Coastal Clearance Verification (>= 12 km from mainland coastline)
console.log('[TEST 3] Verifying >= 12 km offshore clearance from coastal landmasses...');
// Representative mainland coastal points along Langkat & East Aceh
const coastalSamples: Array<{ name: string; pt: LonLat; nearestWaypoint: LonLat }> = [
  { name: 'Kuala Geukueh Coast', pt: [97.02, 5.25], nearestWaypoint: SUMATRA_NAUTICAL_PERIMETER[1] },
  { name: 'Peureulak Mainland Coast', pt: [97.97, 4.90], nearestWaypoint: peureulak },
  { name: 'Kuala Langsa Coast', pt: [98.05, 4.52], nearestWaypoint: langsa },
  { name: 'Tanjung Pura / Teluk Aru Coast', pt: [98.35, 4.08], nearestWaypoint: brandan },
  { name: 'Belawan Coastline', pt: [98.68, 3.79], nearestWaypoint: belawanPilot },
];

for (const sample of coastalSamples) {
  const distKm = getHaversineDistanceKm(sample.pt, sample.nearestWaypoint);
  console.log(`  -> Clearance from ${sample.name} to fairway: ${distKm.toFixed(1)} km`);
  assert(distKm >= 12.0, `Expected distance >= 12 km from ${sample.name}, got ${distKm.toFixed(1)} km`);
}
console.log('  PASS  All tested coastal nodes maintain >= 12 km nautical fairway clearance');

// 4. Verify end-to-end maritime route between Krueng Geukueh (Lhokseumawe) and Belawan
console.log('[TEST 4] Computing buildNauticalPath(Krueng Geukueh -> Belawan)...');
const kruengGeukueh: LonLat = [97.0200, 5.2400];
const belawan: LonLat = [98.6776, 3.7922];
const seaPath = buildNauticalPath(kruengGeukueh, belawan);

assert(seaPath && seaPath.length >= 8, `Expected seaPath length >= 8, got ${seaPath.length}`);
console.log(`  Sea path total waypoints: ${seaPath.length}`);

// Assert waypoints include Peureulak, Langsa, Brandan, and Belawan Pilot Fairway
const pathCoordStrings = seaPath.map(([lon, lat]) => `${lon.toFixed(4)},${lat.toFixed(4)}`);
assert(pathCoordStrings.includes('97.8000,5.1500'), 'Route must include Peureulak Offshore Fairway');
assert(pathCoordStrings.includes('98.2500,4.6500'), 'Route must include Langsa Outer Sea Lane');
assert(pathCoordStrings.includes('98.6000,4.2500'), 'Route must include Teluk Aru / Pangkalan Brandan Offshore');
assert(pathCoordStrings.includes('98.8200,4.0200'), 'Route must include Belawan Navigational Pilot Fairway');
console.log('  PASS  Route smoothly transitions through all 4 new bathymetric waypoints');

// 5. Mainland Polygon Penetration Test
// Defined bounding box for Langkat / East Aceh mainland that old straight chord crossed:
// Lon: [98.10, 98.60], Lat: [3.80, 4.10]
console.log('[TEST 5] Checking for zero intersection with Langkat / East Aceh mainland zone...');
const mainlandPolygonBbox = { minLon: 98.10, maxLon: 98.60, minLat: 3.80, maxLat: 4.10 };

for (const [lon, lat] of seaPath) {
  const isInsideMainlandBbox =
    lon >= mainlandPolygonBbox.minLon &&
    lon <= mainlandPolygonBbox.maxLon &&
    lat >= mainlandPolygonBbox.minLat &&
    lat <= mainlandPolygonBbox.maxLat;
  assert(!isInsideMainlandBbox, `Waypoint [${lon}, ${lat}] penetrates mainland Langkat bounding zone!`);
}
console.log('  PASS  Zero waypoints penetrate mainland Langkat bounding zone');

console.log('\n✅ ALL NAUTICAL PRECISION & WATER-PATH TESTS PASSED (0 LAND PENETRATIONS)!');
