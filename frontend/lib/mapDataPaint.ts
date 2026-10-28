/**
 * Operational map data-paint (M9).
 *
 * The ONLY place the sanctioned layer hues and the Mapbox paint expressions
 * built from them live, so a fast Node test can validate them without a browser.
 *
 * Why this module exists: Mapbox GL silently rejects a layer whose paint
 * expression uses `['zoom']` anywhere but the top level of a `step`/`interpolate`.
 * `addLayer` throws, the caller's `try/catch` swallows it, and the layer simply
 * never exists — the map renders nothing while every counter still reads a
 * healthy count. Keeping the expressions importable lets
 * `scripts/test_fleet_paint.ts` prove they parse before they ship.
 *
 * Palette (mirrors `DS.layer` in lib/designTokens.ts):
 *   Truck emerald #34d399 · Vessel teal #2dd4bf · Aircraft silver #e2e8f0
 *   Waspada Dini violet #a855f7 · Cuaca blue #2f81f7 · Titik Panas red #ef4444
 */

/** Modality hue — the same values as `DS.layer.{truck,vessel,aircraft}`. */
export const MODALITY_COLOR: Record<string, string> = {
  truck: '#34d399',
  maritime: '#2dd4bf',
  air: '#e2e8f0',
};

/**
 * `fleet-vehicle-dots` paint.
 *
 * Signal quality is opacity + fill (estimated units are hollow at 45%), the
 * alert ring is amber on any modality, and hue is purely modality.
 */
export const FLEET_DOTS_PAINT: Record<string, unknown> = {
  'circle-radius': [
    'interpolate',
    ['linear'],
    ['zoom'],
    4, 4,
    8, 5.5,
    14, 8,
  ],
  'circle-color': [
    'case',
    ['==', ['get', 'tracking_mode'], 'ROUTE_ESTIMATED'], 'rgba(0,0,0,0)',
    ['==', ['get', 'modality'], 'truck'], MODALITY_COLOR.truck,
    ['==', ['get', 'modality'], 'maritime'], MODALITY_COLOR.maritime,
    ['==', ['get', 'modality'], 'air'], MODALITY_COLOR.air,
    MODALITY_COLOR.air,
  ],
  'circle-stroke-width': [
    'case',
    ['==', ['get', 'isImpacted'], true], 2.5,
    1.5,
  ],
  'circle-stroke-color': [
    'case',
    ['==', ['get', 'isImpacted'], true], '#f59e0b',
    ['==', ['get', 'modality'], 'truck'], MODALITY_COLOR.truck,
    ['==', ['get', 'modality'], 'maritime'], MODALITY_COLOR.maritime,
    ['==', ['get', 'modality'], 'air'], MODALITY_COLOR.air,
    MODALITY_COLOR.air,
  ],
  'circle-opacity': [
    'interpolate', ['linear'], ['zoom'],
    3.2, 0.0,
    4.0, 1.0,
  ],
  // Zoom may ONLY sit at the top level of an interpolate. The estimated-unit
  // dimming is a data-driven output of the 4.0 stop, never a nested zoom ramp.
  'circle-stroke-opacity': [
    'interpolate', ['linear'], ['zoom'],
    3.2, 0.0,
    4.0, [
      'case',
      ['all',
        ['==', ['get', 'tracking_mode'], 'ROUTE_ESTIMATED'],
        ['!=', ['get', 'isImpacted'], true],
      ], 0.45,
      1.0,
    ],
  ],
};

/**
 * `waspada-dots` paint — the Waspada Dini advisory as a violet point, sibling
 * to the Titik Panas red dot. Severity is SIZE (4/5/6 px), never hue.
 */
export const WASPADA_DOTS_PAINT: Record<string, unknown> = {
  'circle-radius': [
    'match', ['get', 'severity'],
    'critical', 6,
    'high', 5,
    4,
  ],
  'circle-color': '#a855f7',
  'circle-opacity': 0.9,
  'circle-stroke-width': 1,
  'circle-stroke-color': 'rgba(12,16,23,0.85)',
};

/** Soft violet halo under each Waspada dot (same treatment as FIRMS dots). */
export const WASPADA_DOTS_HALO_PAINT: Record<string, unknown> = {
  'circle-radius': 9,
  'circle-color': 'rgba(168,85,247,0.22)',
  'circle-stroke-width': 1,
  'circle-stroke-color': 'rgba(168,85,247,0.45)',
  'circle-stroke-opacity': 0.5,
};
