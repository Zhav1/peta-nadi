import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { corridorSnappingService, type SnappedCorridorsData } from '../lib/corridorSnappingService.ts';

console.log('--- RUNNING CORRIDOR SNAPPING SERVICE VERIFICATION SUITE ---');

// 1. Verify static asset exists on disk and is non-empty
const candidatePaths = [
  path.resolve('public/data/fleet_corridors_snapped.json'),
  path.resolve('frontend/public/data/fleet_corridors_snapped.json'),
  path.resolve(__dirname, '../public/data/fleet_corridors_snapped.json'),
];
const jsonPath = candidatePaths.find((p) => fs.existsSync(p)) || candidatePaths[0];
assert(fs.existsSync(jsonPath), `Expected ${jsonPath} to exist on disk`);
const rawJson = fs.readFileSync(jsonPath, 'utf-8');
const data: SnappedCorridorsData = JSON.parse(rawJson);

console.log(`[TEST 1] Raw JSON loaded: ${Object.keys(data).length} total corridors`);
assert(Object.keys(data).length >= 80, 'Expected at least 80 corridors');

// 2. Ingest corridors into service
corridorSnappingService.ingestCorridors(data);
assert.equal(corridorSnappingService.loadedCount, Object.keys(data).length);
assert(corridorSnappingService.loaded, 'Expected corridorSnappingService.loaded to be true');
console.log('  PASS  ingestCorridors populates cache and sets loaded flag');

// 3. Verify all 24 trucks have high-density coordinates
const truckIds = Object.keys(data).filter((id) => data[id]?.modality === 'truck');
console.log(`[TEST 2] Verifying ${truckIds.length} trucks in snapped corridors dataset...`);
assert.equal(truckIds.length, 24, 'Expected exactly 24 trucks in dataset');

for (const tid of truckIds) {
  const coords = corridorSnappingService.getCorridorCoordinates(tid);
  assert(coords && coords.length >= 2, `Expected coordinates for truck ${tid}`);
  assert(corridorSnappingService.hasCorridor(tid), `Expected hasCorridor to be true for ${tid}`);
  
  const meta = corridorSnappingService.getCorridorMetadata(tid);
  assert(meta && meta.vehicle_id === tid, `Expected metadata for truck ${tid}`);
  assert(meta.total_distance_km > 0, `Expected positive total_distance_km for ${tid}`);
}
console.log('  PASS  all 24 trucks have valid high-density coordinates and metadata');

// 4. Test non-existent vehicle returns null
console.log('[TEST 3] Testing non-existent vehicle lookup...');
assert.equal(corridorSnappingService.getCorridorCoordinates('NON_EXISTENT_VEHICLE_123'), null);
assert.equal(corridorSnappingService.getCorridorCoordinates(''), null);
assert.equal(corridorSnappingService.hasCorridor('NON_EXISTENT_VEHICLE_123'), false);
console.log('  PASS  non-existent / empty vehicle_id returns null');

// 5. Test setCorridorCoordinates dynamic caching
console.log('[TEST 4] Testing dynamic setCorridorCoordinates on-demand cache...');
const mockVid = 'TRK-CUSTOM-ON-DEMAND-999';
const mockCoords: [number, number][] = [
  [98.67, 3.59],
  [98.70, 3.65],
  [98.75, 3.72],
];
corridorSnappingService.setCorridorCoordinates(mockVid, mockCoords);
assert(corridorSnappingService.hasCorridor(mockVid));
const retrieved = corridorSnappingService.getCorridorCoordinates(mockVid);
assert.deepEqual(retrieved, mockCoords);
console.log('  PASS  setCorridorCoordinates correctly caches dynamic coordinates');

console.log('\n✅ ALL CORRIDOR SNAPPING SERVICE TESTS PASSED (100% CLEAN)!');
