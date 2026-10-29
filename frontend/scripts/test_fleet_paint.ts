/**
 * Mapbox paint-expression gate for the operational layers.
 *
 * Run with: node --no-warnings --experimental-strip-types scripts/test_fleet_paint.ts
 *
 * REGRESSION THIS PINS (M9 fleet fix): `circle-stroke-opacity` nested a
 * `['zoom']` interpolate inside a `['case']` branch. Mapbox GL accepts
 * `['zoom']` only at the top level of a `step`/`interpolate`, so `addLayer`
 * threw, FleetVehicleLayer's `try/catch` logged it, and the dots layer was
 * simply never added — no vehicles on the map while every counter still read a
 * healthy count. Validation here uses the same style-spec parser Mapbox GL
 * uses, so an invalid paint object now fails in CI instead of only in a browser.
 */
import { createRequire } from 'node:module';
import {
  FLEET_DOTS_PAINT,
  MAP_KEYLINE,
  WASPADA_DOTS_PAINT,
  WASPADA_DOTS_HALO_PAINT,
  MODALITY_COLOR,
} from '../lib/mapDataPaint.ts';

const require = createRequire(import.meta.url);
const spec = require('mapbox-gl/dist/style-spec/index.cjs') as {
  expression: {
    createPropertyExpression: (
      value: unknown,
      options: { type: string; transition: boolean; interpolate: boolean; zoom: boolean },
    ) => unknown;
  };
  validate: (style: unknown, styleSpec?: unknown) => Array<{ message: string }>;
  latest: unknown;
};

let failures = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}`, detail ?? '');
  }
}

/** Property -> expected mapbox style-spec type. */
const PAINT_TYPES: Record<string, string> = {
  'circle-radius': 'number',
  'circle-color': 'color',
  'circle-stroke-width': 'number',
  'circle-stroke-color': 'color',
  'circle-opacity': 'number',
  'circle-stroke-opacity': 'number',
};

function validatePaint(label: string, paint: Record<string, unknown>) {
  for (const [property, value] of Object.entries(paint)) {
    const type = PAINT_TYPES[property];
    check(`${label}.${property} has a known type`, Boolean(type), property);
    if (!type) continue;
    let error: string | null = null;
    try {
      spec.expression.createPropertyExpression(value, {
        type,
        transition: false,
        interpolate: true,
        zoom: true,
      });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    check(`${label}.${property} parses`, error === null, error);
  }

  // Layer-level validation is what Mapbox's `addLayer` actually runs: it is
  // where a nested `['zoom']` is rejected (the fleet regression). A parse-only
  // check misses it, so validate the whole style too.
  const errors = spec.validate(
    {
      version: 8,
      sources: { [label]: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
      layers: [{ id: label, type: 'circle', source: label, paint }],
    },
    spec.latest,
  ).map((err) => err.message);
  check(`${label} as a layer`, errors.length === 0, errors.join('; '));
}

console.log('Fleet dots paint (the layer that went missing)');
validatePaint('fleet-vehicle-dots', FLEET_DOTS_PAINT);

console.log('Waspada dots paint');
validatePaint('waspada-dots', WASPADA_DOTS_PAINT);
validatePaint('waspada-dots-halo', WASPADA_DOTS_HALO_PAINT);

console.log('The validator is not vacuous');
{
  // The exact pre-fix shape: a zoom ramp nested inside a case branch. Layer
  // validation must reject it, otherwise this gate proves nothing.
  const errors = spec.validate(
    {
      version: 8,
      sources: { broken: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
      layers: [{
        id: 'broken',
        type: 'circle',
        source: 'broken',
        paint: {
          'circle-stroke-opacity': [
            'case',
            ['all', ['==', ['get', 'tracking_mode'], 'ROUTE_ESTIMATED']],
            0.45,
            ['interpolate', ['linear'], ['zoom'], 3.2, 0.0, 4.0, 1.0],
          ],
        },
      }],
    },
    spec.latest,
  );
  check('nested zoom expression is rejected', errors.length > 0, 'validator accepted the broken expression');
}

console.log('Modality palette');
{
  check('truck emerald', MODALITY_COLOR.truck === '#34d399', MODALITY_COLOR.truck);
  check('vessel teal', MODALITY_COLOR.maritime === '#2dd4bf', MODALITY_COLOR.maritime);
  check('aircraft silver', MODALITY_COLOR.air === '#e2e8f0', MODALITY_COLOR.air);
  const color = JSON.stringify(FLEET_DOTS_PAINT['circle-color']);
  check('fleet paint carries the vessel teal', color.includes('#2dd4bf'), color);
  check('fleet paint carries the aircraft silver', color.includes('#e2e8f0'), color);
  check('violet is not used for aircraft', !color.includes('#a78bfa'), color);
}

console.log('Waspada is a violet dot, not an amber area');
{
  check('dot fill violet', WASPADA_DOTS_PAINT['circle-color'] === '#a855f7', WASPADA_DOTS_PAINT['circle-color']);
  check(
    'dot radius scales by severity 4/5/6',
    JSON.stringify(WASPADA_DOTS_PAINT['circle-radius']) ===
      JSON.stringify(['match', ['get', 'severity'], 'critical', 6, 'high', 5, 4]),
    WASPADA_DOTS_PAINT['circle-radius'],
  );
  check(
    'halo is the violet wash',
    WASPADA_DOTS_HALO_PAINT['circle-color'] === 'rgba(168,85,247,1)',
    WASPADA_DOTS_HALO_PAINT['circle-color'],
  );
}

console.log('Unit C dot legibility (dark keyline + smaller low-zoom halos)');
{
  check('keyline token', MAP_KEYLINE === 'rgba(12,16,23,0.9)', MAP_KEYLINE);

  const fleetStrokeColor = JSON.stringify(FLEET_DOTS_PAINT['circle-stroke-color']);
  check('fleet normal dots use the dark keyline', fleetStrokeColor.includes('rgba(12,16,23,0.9)'), fleetStrokeColor);
  check('fleet impacted ring stays amber', fleetStrokeColor.includes('#f59e0b'), fleetStrokeColor);
  check(
    'fleet estimated hollow keeps modality hue',
    fleetStrokeColor.includes('ROUTE_ESTIMATED') &&
      fleetStrokeColor.includes('#34d399') &&
      fleetStrokeColor.includes('#2dd4bf') &&
      fleetStrokeColor.includes('#e2e8f0'),
    fleetStrokeColor,
  );
  check(
    'fleet stroke width 1.5 at z4-8, 1.25 at z12+, impacted 2.5',
    JSON.stringify(FLEET_DOTS_PAINT['circle-stroke-width']) ===
      JSON.stringify([
        'interpolate',
        ['linear'],
        ['zoom'],
        4, ['case', ['==', ['get', 'isImpacted'], true], 2.5, 1.5],
        8, ['case', ['==', ['get', 'isImpacted'], true], 2.5, 1.5],
        12, ['case', ['==', ['get', 'isImpacted'], true], 2.5, 1.25],
      ]),
    FLEET_DOTS_PAINT['circle-stroke-width'],
  );

  check('waspada dots use the dark keyline', WASPADA_DOTS_PAINT['circle-stroke-color'] === MAP_KEYLINE, WASPADA_DOTS_PAINT['circle-stroke-color']);
  check(
    'waspada keyline 1.25 below z7, 1 above',
    JSON.stringify(WASPADA_DOTS_PAINT['circle-stroke-width']) ===
      JSON.stringify(['interpolate', ['linear'], ['zoom'], 4, 1.25, 7, 1.25, 8, 1]),
    WASPADA_DOTS_PAINT['circle-stroke-width'],
  );
  check(
    'waspada halo radius 6@z4 -> 8@z8 -> 9@z12',
    JSON.stringify(WASPADA_DOTS_HALO_PAINT['circle-radius']) ===
      JSON.stringify(['interpolate', ['linear'], ['zoom'], 4, 6, 8, 8, 12, 9]),
    WASPADA_DOTS_HALO_PAINT['circle-radius'],
  );
  check(
    'waspada halo opacity 0.12 -> 0.18 -> 0.22',
    JSON.stringify(WASPADA_DOTS_HALO_PAINT['circle-opacity']) ===
      JSON.stringify(['interpolate', ['linear'], ['zoom'], 4, 0.12, 8, 0.18, 12, 0.22]),
    WASPADA_DOTS_HALO_PAINT['circle-opacity'],
  );
  check(
    'waspada halo stroke opacity 0.35 -> 0.5',
    JSON.stringify(WASPADA_DOTS_HALO_PAINT['circle-stroke-opacity']) ===
      JSON.stringify(['interpolate', ['linear'], ['zoom'], 4, 0.35, 8, 0.5]),
    WASPADA_DOTS_HALO_PAINT['circle-stroke-opacity'],
  );
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll map paint assertions passed.');
