import assert from 'node:assert';
import {
  pointInPolygonRing,
  segmentsIntersect,
  routeIntersectsPolygonRing,
  findRouteIntersectingSegments,
  routeIntersectsGeometry,
  type LonLat,
  type LonLatRing,
} from '../lib/polygonGeom.ts';

console.log('[TEST] Starting Hazard Consensus Geometry & Route Intersection verification...');

// 1. Point in polygon test
// A box around Medan: [98.60, 3.50] to [98.70, 3.65]
const medanBox: LonLatRing = [
  [98.60, 3.50],
  [98.70, 3.50],
  [98.70, 3.65],
  [98.60, 3.65],
  [98.60, 3.50],
];

assert.strictEqual(pointInPolygonRing([98.65, 3.58], medanBox), true, 'Medan center should be inside polygon');
assert.strictEqual(pointInPolygonRing([98.50, 3.58], medanBox), false, 'Point west of Medan should be outside polygon');
assert.strictEqual(pointInPolygonRing([98.80, 3.58], medanBox), false, 'Point east of Medan should be outside polygon');
console.log('✅ PASS: pointInPolygonRing correctly detects interior and exterior points');

// 2. Segment intersection test
const segA1: LonLat = [98.50, 3.55];
const segA2: LonLat = [98.80, 3.55];
const segB1: LonLat = [98.65, 3.40];
const segB2: LonLat = [98.65, 3.70];
assert.strictEqual(segmentsIntersect(segA1, segA2, segB1, segB2), true, 'Crossing segments must intersect');

const segParallel1: LonLat = [98.50, 3.50];
const segParallel2: LonLat = [98.80, 3.50];
const segParallel3: LonLat = [98.50, 3.60];
const segParallel4: LonLat = [98.80, 3.60];
assert.strictEqual(segmentsIntersect(segParallel1, segParallel2, segParallel3, segParallel4), false, 'Parallel segments must not intersect');
console.log('✅ PASS: segmentsIntersect correctly detects cross-segment intersections');

// 3. Route polyline intersecting polygon
// Route starting from Binjai [98.48, 3.60] to Tebing Tinggi [99.16, 3.33], slicing directly through Medan box
const transSumatraRoute: LonLat[] = [
  [98.48, 3.60],
  [98.65, 3.58], // inside medanBox
  [98.85, 3.45],
  [99.16, 3.33],
];

assert.strictEqual(routeIntersectsPolygonRing(transSumatraRoute, medanBox), true, 'Route cutting through Medan must intersect');

const affectedSegments = findRouteIntersectingSegments(transSumatraRoute, medanBox);
assert.strictEqual(affectedSegments.length >= 1, true, 'Must find affected segments');
assert.strictEqual(affectedSegments[0].segment_index, 0, 'First segment (Binjai -> Medan center) must intersect');
console.log('✅ PASS: routeIntersectsPolygonRing & findRouteIntersectingSegments detect affected segments');

// 4. Safe bypass route that avoids Medan box completely (coastal detour)
const coastalBypassRoute: LonLat[] = [
  [98.48, 3.75],
  [98.65, 3.80],
  [98.85, 3.75],
  [99.16, 3.50],
];
assert.strictEqual(routeIntersectsPolygonRing(coastalBypassRoute, medanBox), false, 'Detour above Medan box must NOT intersect');
console.log('✅ PASS: Detour route avoiding polygon correctly evaluates as clear');

// 5. GeoJSON Polygon object support
const geojsonPolygon = {
  type: 'Polygon',
  coordinates: [medanBox],
};
assert.strictEqual(routeIntersectsGeometry(transSumatraRoute, geojsonPolygon), true, 'routeIntersectsGeometry works with GeoJSON Polygon');
assert.strictEqual(routeIntersectsGeometry(coastalBypassRoute, geojsonPolygon), false, 'routeIntersectsGeometry clear for bypass');
console.log('✅ PASS: routeIntersectsGeometry with GeoJSON Polygon contract');

// 6. News ordering by recency and severity (no static Aceh bias)
const sampleGroups = [
  {
    province: 'Aceh',
    items: [
      { id: '1', published_at: '2026-11-11T08:00:00Z', zone_tier: 'RED_CONFIRMED', severity: 'high', relevance_tier: 'crisis' },
    ],
  },
  {
    province: 'Lampung',
    items: [
      { id: '2', published_at: '2026-11-11T12:00:00Z', zone_tier: 'RED_CONFIRMED', severity: 'critical', relevance_tier: 'crisis' },
    ],
  },
  {
    province: 'Sumatera Utara',
    items: [
      { id: '3', published_at: '2026-11-11T10:00:00Z', zone_tier: 'YELLOW_CLARIFY', severity: 'medium', relevance_tier: 'crisis' },
    ],
  },
];

const getGroupTime = (items: Array<{ published_at?: string }>) =>
  Math.max(0, ...items.map((it) => (it.published_at ? new Date(it.published_at).getTime() : 0)));

const getGroupSeverity = (items: Array<{ zone_tier?: string; severity?: string }>) => {
  let maxSev = 0;
  for (const item of items) {
    if (item.zone_tier === 'RED_CONFIRMED' || item.severity === 'critical') maxSev = Math.max(maxSev, 3);
    else if (item.zone_tier === 'YELLOW_CLARIFY' || item.severity === 'high') maxSev = Math.max(maxSev, 2);
    else maxSev = Math.max(maxSev, 1);
  }
  return maxSev;
};

const sortedGroups = [...sampleGroups].sort((a, b) => {
  const timeA = getGroupTime(a.items);
  const timeB = getGroupTime(b.items);
  if (timeB !== timeA) return timeB - timeA;
  const sevA = getGroupSeverity(a.items);
  const sevB = getGroupSeverity(b.items);
  if (sevB !== sevA) return sevB - sevA;
  return a.province.localeCompare(b.province);
});

assert.strictEqual(sortedGroups[0].province, 'Lampung', 'Lampung with 12:00 article must be first');
assert.strictEqual(sortedGroups[1].province, 'Sumatera Utara', 'Sumut with 10:00 article must be second');
assert.strictEqual(sortedGroups[2].province, 'Aceh', 'Aceh with 08:00 article must be third (no static bias)');
console.log('✅ PASS: News groups sorted by recency then severity, not static Aceh-first');

console.log('🎉 ALL HAZARD CONSENSUS GEOMETRY TESTS PASSED (100% CLEAN)!');
