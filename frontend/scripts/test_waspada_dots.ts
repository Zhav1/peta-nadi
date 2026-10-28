/**
 * Waspada Dini point derivation.
 *
 * Run with: node --no-warnings --experimental-strip-types scripts/test_waspada_dots.ts
 *
 * The advisory is an AREA on the wire but a violet DOT on the map. Pins that
 *  - one dot is produced per advisory zone, carrying the polygon's properties,
 *  - active-disruption (high/critical) features never become advisory dots,
 *  - the centroid is inside the zone and a degenerate ring still gets a point,
 *  - a feature with no usable geometry is skipped rather than drawn at 0,0.
 */
import {
  polygonCentroid,
  waspadaDotsFromFeatures,
  WASPADA_SEVERITY,
} from '../lib/waspadaDots.ts';

let failures = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}`, detail ?? '');
  }
}

function square(lon: number, lat: number, size = 0.4): GeoJSON.Polygon {
  return {
    type: 'Polygon',
    coordinates: [[
      [lon, lat],
      [lon + size, lat],
      [lon + size, lat + size],
      [lon, lat + size],
      [lon, lat],
    ]],
  };
}

function advisory(id: string, lon: number, lat: number): GeoJSON.Feature {
  return {
    type: 'Feature',
    geometry: square(lon, lat),
    properties: { id, name: `Zona ${id}`, severity: 'medium', bmkg_code: 'BMKG-60' },
  };
}

console.log('Centroid');
{
  const c = polygonCentroid(square(100, 0));
  check('square centroid is exact', c !== null && Math.abs(c[0] - 100.2) < 1e-9 && Math.abs(c[1] - 0.2) < 1e-9, c);
  check('point geometry passes through', JSON.stringify(polygonCentroid({ type: 'Point', coordinates: [1, 2] })) === '[1,2]');
  check('null geometry is null', polygonCentroid(null) === null);
  check(
    'degenerate ring still returns a point',
    JSON.stringify(polygonCentroid({ type: 'Polygon', coordinates: [[[1, 1], [2, 2], [1, 1]]] })) !== 'null',
  );
}

console.log('Dot derivation');
{
  const features: GeoJSON.Feature[] = [
    advisory('a', 95.0, 5.0),
    advisory('b', 100.0, -1.0),
    { type: 'Feature', geometry: square(104, -3), properties: { id: 'c', severity: 'high' } },
    { type: 'Feature', geometry: null, properties: { id: 'd', severity: 'medium' } } as unknown as GeoJSON.Feature,
  ];
  const dots = waspadaDotsFromFeatures(features);
  check('one dot per advisory zone', dots.length === 2, dots.length);
  check('dot ids preserved', dots.map((d) => d.properties?.id).join(',') === 'a,b');
  check('properties copied verbatim', dots[0].properties?.bmkg_code === 'BMKG-60');
  check('dot flagged for the layer', dots[0].properties?.waspada_dot === true);
  check('dot is a Point', dots.every((d) => d.geometry.type === 'Point'));
  check(
    'dot sits inside its zone',
    dots[0].geometry.coordinates[0] > 95 && dots[0].geometry.coordinates[0] < 95.4,
    dots[0].geometry.coordinates,
  );
  check('disruption (high) is not an advisory dot', !dots.some((d) => d.properties?.id === 'c'));
  check('no-geometry feature is skipped', !dots.some((d) => d.properties?.id === 'd'));
  check('null input is an empty collection', waspadaDotsFromFeatures(null).length === 0);
  check('advisory severity is medium', WASPADA_SEVERITY === 'medium');
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll Waspada dot assertions passed.');
